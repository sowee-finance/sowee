/**
 * Lists a book of invoices, the way the issuer console does: ask the API for a signed discount
 * quote, send `listInvoice` from the issuer wallet, then anchor the document hash and the mark on
 * the audit topic.
 *
 * It exists because entering a market by hand is a wallet confirmation per invoice, and a market
 * with two rows in it does not look like a market.
 *
 *   ISSUER_PK=0x… bun run scripts/seed/seed-market.ts            # list what is missing
 *   ISSUER_PK=0x… bun run scripts/seed/seed-market.ts --dry-run  # show the book and stop
 *
 * Every company below is invented. Real names and marks are deliberately not used: an invoice is
 * a claim that one business owes another money, and attaching that to a real company would be a
 * fabricated record about someone who never agreed to appear here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatUnits,
  type Hex,
  http,
  keccak256,
  toBytes,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { hederaTestnet } from "viem/chains"

const API = process.env.API_URL ?? "https://api.sowee.site"
const RPC = process.env.RPC_URL ?? "https://testnet.hashio.io/api"
const root = join(import.meta.dir, "../..")
const deployment = JSON.parse(readFileSync(join(root, "contracts/deployments/296.json"), "utf8"))
const marks: Record<string, string> = JSON.parse(
  readFileSync(join(import.meta.dir, "marks.json"), "utf8"),
)

const dryRun = process.argv.includes("--dry-run")
const pk = process.env.ISSUER_PK as Hex | undefined

const DAY = 86_400

/**
 * The book. Face values are small because the market is funded in testnet USDC and there is only
 * so much of it: a progress bar that cannot move reads as a dead market, which is the opposite of
 * the point. The tenors are the ones invoice finance actually uses — net 30, 45, 60, 90 — and the
 * discount is not set here: the API prices it at 200 bps plus 25 bps per full 30 days, so the
 * spread of tenors is what produces the term structure on the page.
 */
const book = [
  {
    issuer: "Selat Malaka Logistics",
    payor: "Meridian Freight Union",
    ref: "INV-2026-021",
    face: 480,
    days: 45,
    mark: "selat-malaka",
  },
  {
    issuer: "Java Precision Casting",
    payor: "Sakura Press Works",
    ref: "INV-2026-022",
    face: 250,
    days: 29,
    mark: "java-precision",
  },
  {
    issuer: "Andaman Marine Supply",
    payor: "Nordhavn Cold Chain",
    ref: "INV-2026-023",
    face: 1250,
    days: 60,
    mark: "andaman-marine",
  },
  {
    issuer: "Borneo Agritech",
    payor: "Levant Provisions Trading",
    ref: "INV-2026-024",
    face: 320,
    days: 90,
    mark: "borneo-agritech",
  },
  {
    issuer: "Sunda Electronics Works",
    payor: "Alvarado Retail Group",
    ref: "INV-2026-025",
    face: 2400,
    days: 35,
    mark: "sunda-electronics",
  },
] as const

/** The same rules the issuer console uses, so a seeded bond is indistinguishable from a typed one. */
const nameFor = (company: string, payor: string) => `${company.trim()} · ${payor.trim()}`
const symbolFor = (ref: string) =>
  `s${ref
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7)}`
const invoiceIdOf = (ref: string): Hex => keccak256(toBytes(ref))

const marketAbi = [
  {
    type: "function",
    name: "bondOf",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listInvoice",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      {
        name: "q",
        type: "tuple",
        components: [
          { name: "invoiceId", type: "bytes32" },
          { name: "issuer", type: "address" },
          { name: "faceValue", type: "uint256" },
          { name: "maturity", type: "uint64" },
          { name: "discountRateBps", type: "uint16" },
          { name: "validUntil", type: "uint64" },
          { name: "nonce", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "address" }],
    stateMutability: "nonpayable",
  },
] as const

type QuoteWire = {
  quote: {
    invoiceId: Hex
    issuer: Address
    faceValue: string
    maturity: number | string
    discountRateBps: number
    validUntil: number | string
    nonce: number | string
  }
  signature: Hex
}

async function quoteFor(ref: string, issuer: Address, faceValue: bigint, maturity: number) {
  const res = await fetch(`${API}/v1/invoices/${encodeURIComponent(ref)}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issuer, faceValue: faceValue.toString(), maturity }),
  })
  if (!res.ok) throw new Error(`quote ${ref}: ${res.status} ${await res.text()}`)
  const w = (await res.json()) as QuoteWire
  return {
    quote: {
      invoiceId: w.quote.invoiceId,
      issuer: w.quote.issuer,
      faceValue: BigInt(w.quote.faceValue),
      maturity: BigInt(w.quote.maturity),
      discountRateBps: w.quote.discountRateBps,
      validUntil: BigInt(w.quote.validUntil),
      nonce: BigInt(w.quote.nonce),
    },
    signature: w.signature,
  }
}

/** The document hash is the sha256 of the invoice PDF in the real flow; there is no PDF here, so
 *  it is the hash of the reference. It is a commitment either way, and it is never a claim that a
 *  document exists. */
const docHashFor = (ref: string) => keccak256(toBytes(`sowee-seed:${ref}`))

async function attest(ref: string, docHash: Hex, logo: string) {
  const res = await fetch(`${API}/v1/invoices/${encodeURIComponent(ref)}/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docHash, event: "issued", logo }),
  })
  if (!res.ok) throw new Error(`attest ${ref}: ${res.status} ${await res.text()}`)
  return (await res.json()) as { sequenceNumber?: number }
}

const market = deployment.invoiceMarket as Address
const publicClient = createPublicClient({ chain: hederaTestnet, transport: http(RPC) })
const now = Math.floor(Date.now() / 1000)

/**
 * `bondOf` reverts with `UnknownInvoice(bytes32)` for a reference that was never listed rather
 * than returning the zero address, so "does this exist" is a caught revert. Only that selector
 * means "not listed": anything else is a real failure and is rethrown, because a catch that
 * swallows everything is how a wrong ABI once turned into a plausible empty page.
 */
const UNKNOWN_INVOICE = "0x6f21af8a"

/** viem wraps an RPC revert several causes deep; the raw return data is on the innermost one. */
function revertData(err: unknown): string {
  let e = err as { data?: unknown; cause?: unknown } | undefined
  for (let depth = 0; e && depth < 8; depth++) {
    if (typeof e.data === "string") return e.data
    e = e.cause as typeof e
  }
  return ""
}

async function listedBond(id: Hex): Promise<Address | undefined> {
  try {
    return (await publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "bondOf",
      args: [id],
    })) as Address
  } catch (err) {
    if (revertData(err).startsWith(UNKNOWN_INVOICE)) return undefined
    throw err
  }
}

// What the book prices at, worked out here so --dry-run can show it without touching the chain.
// The policy is the API's; this only restates it.
const priced = book.map((inv) => {
  const bps = Math.min(200 + 25 * Math.floor(inv.days / 30), 2000)
  const apy = ((bps / 100) * 365) / inv.days
  return {
    ...inv,
    bps,
    id: invoiceIdOf(inv.ref),
    face: BigInt(inv.face) * 1_000_000n,
    maturity: now + inv.days * DAY,
    line: `${inv.ref}  ${inv.issuer} → ${inv.payor}  $${inv.face}  ${inv.days}d  ${(bps / 100).toFixed(2)}%  ~${apy.toFixed(1)}% APY`,
  }
})

console.log(`market ${market}\n`)
if (dryRun) {
  for (const p of priced) console.log(p.line)
  process.exit(0)
}
if (!pk) {
  console.error("set ISSUER_PK to the issuer wallet's key, or pass --dry-run to see the book")
  process.exit(1)
}

// Past the guard the key is a key, so nothing below has to be asserted into existence.
const account = privateKeyToAccount(pk)
const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http(RPC) })
console.log(`issuer ${account.address}\n`)

for (const inv of priced) {
  const { id, face, maturity, line } = inv
  const existing = await listedBond(id)
  if (existing) {
    console.log(`${inv.ref}  already listed at ${existing} — skipped`)
    continue
  }

  const signed = await quoteFor(inv.ref, account.address, face, maturity)
  const hash = await wallet.writeContract({
    address: market,
    abi: marketAbi,
    functionName: "listInvoice",
    args: [nameFor(inv.issuer, inv.payor), symbolFor(inv.ref), signed.quote, signed.signature],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`${inv.ref}: listInvoice reverted (${hash})`)

  const anchored = await attest(inv.ref, docHashFor(inv.ref), marks[inv.mark] ?? "")
  console.log(`${line}\n  listed ${hash}  anchored #${anchored.sequenceNumber ?? "?"}`)
}

{
  const usdc = deployment.usdc as Address
  const bal = await publicClient.readContract({
    address: usdc,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ],
    functionName: "balanceOf",
    args: [account.address],
  })
  console.log(`\nissuer holds ${formatUnits(bal as bigint, 6)} USDC — listing costs none of it;`)
  console.log("funding is the investor's side, and that is what moves the progress bars.")
}
