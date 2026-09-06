/**
 * Sowee agent — discovers the paid market-insights endpoint, pays for it over x402 with its own
 * Hedera account, and then acts on the answer: with `--execute` it funds the best bond on-chain
 * from the same wallet, subject to the same KYC allowlist a human investor faces.
 *
 *   bun run src/index.ts [--url http://localhost:8080/v1/market/insights] [--dry] [--execute 2]
 *
 * --dry      stops after the 402 discovery step (no payment).
 * --execute  after paying, funds N units (default 1) of the highest-yielding bond.
 */
import { decodePaymentRequiredHeader } from "@x402/core/http"
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { createClientHederaSigner, PrivateKey } from "@x402/hedera"
import { ExactHederaScheme } from "@x402/hedera/exact/client"
import { formatUsdc, txLink } from "./link"
import { bondAbi, clientFor, deploymentFor, erc20Abi, marketAbi } from "./market"
import { planBuy, SCALE } from "./plan"

const argv = process.argv.slice(2)
const flag = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const url =
  flag("--url") ?? `${process.env.SOWEE_API_URL ?? "http://localhost:8080"}/v1/market/insights`
const dry = argv.includes("--dry")
const execute = argv.includes("--execute")
const requestedUnits =
  BigInt(Math.max(1, Math.trunc(Number(flag("--execute") ?? 1) || 1))) * 1_000_000n

// 1. Discover: an unpaid request answers 402 with the price and the accepted rail.
const probe = await fetch(url)
if (probe.status !== 402) {
  console.error(`expected 402 from ${url}, got ${probe.status}`)
  process.exit(1)
}
const header = probe.headers.get("payment-required")
if (!header) {
  console.error("402 without a PAYMENT-REQUIRED header — not an x402 v2 resource")
  process.exit(1)
}
const required = decodePaymentRequiredHeader(header)
const offer = required.accepts[0]
if (!offer) {
  console.error("402 with no accepted payment requirements")
  process.exit(1)
}
console.log(`resource : ${required.resource?.url}`)
console.log(`           ${required.resource?.description ?? ""}`)
console.log(
  `price    : ${formatUsdc(offer.amount)} (asset ${offer.asset}) on ${offer.network}, pay to ${offer.payTo}, fee payer ${String(offer.extra?.feePayer ?? "?")}`,
)
if (dry) {
  console.log("dry run — stopping before payment")
  process.exit(0)
}

// 2. Pay: the scheme builds a partially signed TransferTransaction (fee payer = facilitator),
//    the wrapped fetch retries with PAYMENT-SIGNATURE and hands back the settled response.
const accountId = process.env.HEDERA_ACCOUNT_ID
const keyHex = process.env.HEDERA_PRIVATE_KEY?.replace(/^0x/, "")
if (!accountId || !keyHex) {
  console.error("set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY (ECDSA hex) to pay")
  process.exit(1)
}
const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(keyHex), {
  network: offer.network,
})
const client = new x402Client().register(offer.network, new ExactHederaScheme(signer))
const fetchWithPay = wrapFetchWithPayment(fetch, client)

const started = Date.now()
const paid = await fetchWithPay(url)
if (!paid.ok) {
  console.error(`payment failed: HTTP ${paid.status}`, await paid.text())
  process.exit(1)
}
const settlementHeader = paid.headers.get("payment-response")
const settlement = settlementHeader ? decodePaymentResponseHeader(settlementHeader) : undefined
const data = (await paid.json()) as {
  bonds: Array<{
    symbol: string
    invoiceId: string
    discountRateBps: number
    tenorDays: number
    impliedAprBps: number
    fundedPct: number
  }>
  best?: { symbol: string; invoiceId: string; impliedAprBps: number }
  chainId?: number
  note?: string
  paidBy?: string
}
console.log(
  `paid     : ${formatUsdc(offer.amount)} USDC by ${accountId} in ${Date.now() - started} ms`,
)
if (settlement) {
  console.log(
    `settled  : ${settlement.transaction} (payer ${settlement.payer ?? "?"}, network ${settlement.network})`,
  )
  console.log(`           ${txLink(settlement.transaction)}`)
}

// 3. Use the data.
if (!data.best) {
  console.log(`decision : nothing to fund yet (${data.note ?? "no bonds"})`)
  process.exit(0)
}
const best = data.best
console.log(
  `decision : fund ${best.symbol} (${best.invoiceId.slice(0, 10)}…) — implied APR ${(best.impliedAprBps / 100).toFixed(2)}%`,
)
for (const b of data.bonds) {
  console.log(
    `           ${b.symbol.padEnd(8)} disc ${(b.discountRateBps / 100).toFixed(2)}%  tenor ${b.tenorDays}d  apr ${(b.impliedAprBps / 100).toFixed(2)}%  funded ${b.fundedPct.toFixed(1)}%`,
  )
}
if (!execute) {
  console.log("           (pass --execute to fund it from this wallet)")
  process.exit(0)
}

// 4. Act: fund the chosen bond from the same wallet that paid for the data.
const chainId = data.chainId ?? 296
const deployment = deploymentFor(chainId)
if (!deployment) {
  console.error(`no deployment recorded for chain ${chainId}`)
  process.exit(1)
}
const { account, wallet, pub } = clientFor(chainId, `0x${keyHex}`, process.env.RPC_URL)
const market = { address: deployment.invoiceMarket, abi: marketAbi } as const
const invoiceId = best.invoiceId as `0x${string}`
const bondAddress = await pub.readContract({ ...market, functionName: "bondOf", args: [invoiceId] })
const bond = { address: bondAddress, abi: bondAbi } as const

const [eligible, faceValue, supply, feeBps, balance] = await Promise.all([
  pub.readContract({ ...bond, functionName: "isEligible", args: [account.address] }),
  pub.readContract({ ...bond, functionName: "faceValue" }),
  pub.readContract({ ...bond, functionName: "totalSupply" }),
  pub.readContract({ ...market, functionName: "feeBps" }),
  pub.readContract({
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  }),
])
console.log(
  `wallet   : ${account.address} on chain ${chainId}, ${formatUsdc(balance.toString())} USDC`,
)
if (!eligible) {
  console.error(
    `blocked  : ${account.address} is not on ${best.symbol}'s allowlist. An agent is an investor like any other — complete KYC for this wallet first.`,
  )
  process.exit(1)
}

// One whole unit costs the discounted price plus the platform fee, both rounded up on chain.
const unitCost = await pub.readContract({
  ...market,
  functionName: "primaryCost",
  args: [invoiceId, SCALE],
})
const unitPrice = unitCost + (unitCost * BigInt(feeBps) + 9_999n) / 10_000n
const plan = planBuy({
  requested: requestedUnits,
  remaining: faceValue - supply,
  balance,
  unitPrice,
})
if (!plan.ok) {
  console.error(`blocked  : ${plan.reason}`)
  process.exit(1)
}
const units = plan.units
const cost = await pub.readContract({
  ...market,
  functionName: "primaryCost",
  args: [invoiceId, units],
})
const fee = (cost * BigInt(feeBps) + 9_999n) / 10_000n
console.log(
  `order    : ${formatUsdc(units.toString())} units for ${formatUsdc(cost.toString())} USDC + ${formatUsdc(fee.toString())} fee (${plan.reason})`,
)

const approveHash = await wallet.writeContract({
  address: deployment.usdc,
  abi: erc20Abi,
  functionName: "approve",
  args: [deployment.invoiceMarket, cost + fee],
})
await pub.waitForTransactionReceipt({ hash: approveHash })
console.log(`approve  : ${approveHash}`)

const buyHash = await wallet.writeContract({
  ...market,
  functionName: "buyPrimary",
  args: [invoiceId, units],
})
const receipt = await pub.waitForTransactionReceipt({ hash: buyHash })
if (receipt.status !== "success") {
  console.error(`funded   : reverted (${buyHash})`)
  process.exit(1)
}
const held = await pub.readContract({ ...bond, functionName: "balanceOf", args: [account.address] })
console.log(`funded   : ${buyHash}`)
console.log(`           https://hashscan.io/testnet/transaction/${buyHash}`)
console.log(`position : ${formatUsdc(held.toString())} units of ${best.symbol}`)
