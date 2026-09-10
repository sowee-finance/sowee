/**
 * Checks the claims this repository makes about what is live, against the networks and services
 * that would have to be lying for them to be false.
 *
 *   bun run scripts/verify-claims.ts
 *
 * "Nothing is claimed before it is proven" is a rule in CLAUDE.md, and a rule nobody can re-run is
 * a promise. This is the re-run. It exits non-zero if any claim fails, so it can sit in front of a
 * submission the way a test sits in front of a merge.
 *
 * It reads the addresses out of `contracts/deployments/*.json` and the transaction hashes out of
 * `contracts/README.md`, so it checks what the documents actually say rather than a copy of it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Address, createPublicClient, http } from "viem"
import { hederaTestnet } from "viem/chains"

const root = join(import.meta.dir, "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")
const hedera = JSON.parse(read("contracts/deployments/296.json"))
const arc = JSON.parse(read("contracts/deployments/5042002.json"))

const HEDERA_RPC = "https://testnet.hashio.io/api"
const ARC_RPC = "https://rpc.testnet.arc.network"
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"

const hederaClient = createPublicClient({ chain: hederaTestnet, transport: http(HEDERA_RPC) })

let failures = 0
const check = (ok: boolean, claim: string, detail: string) => {
  if (!ok) failures++
  console.log(`  ${ok ? "✓" : "✗"} ${claim.padEnd(52)} ${detail}`)
}

async function hasCode(rpc: string, address: string) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [address, "latest"],
    }),
  })
  const { result } = (await res.json()) as { result?: string }
  return (result ?? "0x").length > 4
}

/** A hash is a Hedera contract call, an Arc transaction, or neither — and neither is a failure. */
async function txResult(hash: string): Promise<string> {
  const mirror = await fetch(`${MIRROR}/contracts/results/${hash}`)
    .then((r) => r.json() as Promise<{ result?: string }>)
    .catch(() => ({}) as { result?: string })
  if (mirror.result) return `hedera ${mirror.result}`

  const res = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [hash],
    }),
  })
    .then((r) => r.json() as Promise<{ result?: { status?: string } }>)
    .catch(() => ({}) as { result?: { status?: string } })
  if (res.result?.status === "0x1") return "arc success"
  if (res.result) return `arc status ${res.result.status}`
  return "NOT FOUND on either chain"
}

// The deployment file also carries addresses that are not contracts and must not be checked as
// though they were: `usdc` is the network's own token, and `quoteSigner` is the EOA whose
// signature the oracle recovers. Neither has bytecode, and neither is supposed to.
const deployed = ["discountOracle", "invoiceMarket", "maturitySettlement"] as const

console.log("\ncontracts have bytecode")
for (const name of deployed) {
  check(await hasCode(HEDERA_RPC, hedera[name]), `hedera ${name}`, hedera[name])
}
for (const name of deployed) {
  check(await hasCode(ARC_RPC, arc[name]), `arc ${name}`, arc[name])
}

console.log("\nevery transaction the contracts README links")
const hashes = [...new Set(read("contracts/README.md").match(/0x[a-fA-F0-9]{64}/g) ?? [])]
for (const h of hashes) {
  const r = await txResult(h)
  check(r.endsWith("SUCCESS") || r === "arc success", `${h.slice(0, 18)}…`, r)
}

console.log("\nthe regulated security")
const ats = Object.values(hedera.atsBonds ?? {})[0] as
  | { address: Address; isin: string }
  | undefined
if (ats) {
  const abi = [
    {
      type: "function",
      name: "totalSupply",
      inputs: [],
      outputs: [{ type: "uint256" }],
      stateMutability: "view",
    },
  ] as const
  const supply = await hederaClient.readContract({
    address: ats.address,
    abi,
    functionName: "totalSupply",
  })
  check(supply > 0n, "ATS security has units issued", `${supply} units · ISIN ${ats.isin}`)
}

console.log("\nthe audit topic")
const topic = process.env.HCS_TOPIC_ID ?? "0.0.10388277"
const msgs = (
  (await fetch(`${MIRROR}/topics/${topic}/messages?limit=1&order=desc`).then((r) => r.json())) as {
    messages?: { sequence_number: number }[]
  }
).messages
check(!!msgs?.length, `topic ${topic} is readable`, `${msgs?.[0]?.sequence_number ?? 0} messages`)

console.log("\nthe paid resource answers a 402 anyone can pay")
const paid = await fetch("https://api.sowee.site/v1/market/insights")
const body = (await paid.json()) as {
  accepts?: { scheme: string; network: string; amount: string; asset: string }[]
}
const a = body.accepts?.[0]
check(paid.status === 402, "GET /v1/market/insights", `HTTP ${paid.status}`)
check(
  a?.scheme === "exact" && a?.network === "hedera:testnet",
  "challenge is the hedera exact scheme",
  `${a?.scheme} ${a?.network} ${a?.amount} of ${a?.asset}`,
)

console.log("\nthe public surfaces")
for (const url of [
  "https://sowee.site/",
  "https://app.sowee.site/",
  "https://api.sowee.site/v1/healthz",
]) {
  const r = await fetch(url).catch(() => undefined)
  check(r?.status === 200, url, `HTTP ${r?.status ?? "no response"}`)
}

// IDKit is a WebAssembly module, and a policy that forbids compiling one turns every Selfie
// Check into `generic_error` with the real message dropped (#166). It reads as a World outage
// rather than a header, so the header is checked here.
{
  const policy =
    (await fetch("https://app.sowee.site/kyc")
      .then((r) => r.headers.get("content-security-policy"))
      .catch(() => null)) ?? ""
  const scriptSrc = policy.split(";").find((d) => d.trim().startsWith("script-src")) ?? ""
  check(
    scriptSrc.includes("'wasm-unsafe-eval'") || scriptSrc.includes("'unsafe-eval'"),
    "the dapp's CSP lets IDKit compile its wasm",
    scriptSrc.trim() || "no script-src served",
  )
}

console.log(failures === 0 ? "\nevery claim holds\n" : `\n${failures} claim(s) do not hold\n`)
process.exit(failures === 0 ? 0 : 1)
