/**
 * Sowee agent — discovers the paid market-insights endpoint, pays for it over x402 with its
 * own Hedera account, and acts on the answer.
 *
 *   bun run src/index.ts [--url http://localhost:8080/v1/market/insights] [--dry]
 *
 * --dry stops after the 402 discovery step (no payment).
 */
import { decodePaymentRequiredHeader } from "@x402/core/http"
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { createClientHederaSigner, PrivateKey } from "@x402/hedera"
import { ExactHederaScheme } from "@x402/hedera/exact/client"
import { formatUsdc, txLink } from "./link"

const argv = process.argv.slice(2)
const flag = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const url =
  flag("--url") ?? `${process.env.SOWEE_API_URL ?? "http://localhost:8080"}/v1/market/insights`
const dry = argv.includes("--dry")

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
if (data.best) {
  console.log(
    `decision : fund ${data.best.symbol} (${data.best.invoiceId.slice(0, 10)}…) — implied APR ${(data.best.impliedAprBps / 100).toFixed(2)}%`,
  )
  for (const b of data.bonds) {
    console.log(
      `           ${b.symbol.padEnd(8)} disc ${(b.discountRateBps / 100).toFixed(2)}%  tenor ${b.tenorDays}d  apr ${(b.impliedAprBps / 100).toFixed(2)}%  funded ${b.fundedPct.toFixed(1)}%`,
    )
  }
} else {
  console.log(`decision : nothing to fund yet (${data.note ?? "no bonds"})`)
}
