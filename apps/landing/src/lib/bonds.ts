import { type Address, createPublicClient, type Hex, http } from "viem"
import { hederaTestnet } from "viem/chains"
import hedera from "../../../../contracts/deployments/296.json"

// The landing page reads the same contract the app reads. A marketing page that invents its own
// numbers is a brochure; this one is a demonstration, so the figures come from the chain and are
// wrong the moment the chain says something else.

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet.hashio.io/api"
// The address of record, not a copy of it: the same file `script/Deploy.s.sol` writes and the app
// reads. A second hardcoded copy is a thing that drifts, and this file has already paid for that.
const MARKET = (process.env.NEXT_PUBLIC_INVOICE_MARKET ?? hedera.invoiceMarket) as Address

export type Bond = {
  invoiceId: Hex
  issuer: string
  payor: string
  symbol: string
  /** USDC base units. */
  faceValue: bigint
  supply: bigint
  discountRateBps: number
  maturity: number
}

// Only the four reads a listing needs; the app's full ABI is not this page's business.
const marketAbi = [
  {
    type: "function",
    name: "listingCount",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "invoiceIds",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listing",
    inputs: [{ type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "bond", type: "address" },
          { name: "issuer", type: "address" },
          { name: "faceValue", type: "uint256" },
          { name: "discountRateBps", type: "uint16" },
          { name: "maturity", type: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const

const bondAbi = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const

const client = createPublicClient({ chain: hederaTestnet, transport: http(RPC) })

/** The issuer form names a bond `<issuer company> · <payor>`; split it back for display. */
function split(name: string) {
  const [issuer, payor] = name.split(" · ")
  return { issuer: issuer?.trim() || name, payor: payor?.trim() ?? "" }
}

/** Every listing. Returns nothing at all if the chain cannot be reached — the page then says so
 *  rather than showing numbers it made up. */
export async function fetchBonds(): Promise<Bond[]> {
  try {
    const count = await client.readContract({
      address: MARKET,
      abi: marketAbi,
      functionName: "listingCount",
    })
    const ids = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) =>
        client.readContract({
          address: MARKET,
          abi: marketAbi,
          functionName: "invoiceIds",
          args: [BigInt(i)],
        }),
      ),
    )
    return await Promise.all(
      ids.map(async (invoiceId) => {
        const l = await client.readContract({
          address: MARKET,
          abi: marketAbi,
          functionName: "listing",
          args: [invoiceId],
        })
        const token = { address: l.bond, abi: bondAbi } as const
        const [name, symbol, supply] = await Promise.all([
          client.readContract({ ...token, functionName: "name" }),
          client.readContract({ ...token, functionName: "symbol" }),
          client.readContract({ ...token, functionName: "totalSupply" }),
        ])
        return {
          invoiceId,
          ...split(name),
          symbol,
          faceValue: l.faceValue,
          supply,
          discountRateBps: l.discountRateBps,
          maturity: Number(l.maturity),
        }
      }),
    )
  } catch (err) {
    // The page renders an honest empty state either way, but a silent catch turns a decode bug
    // into "the market is quiet" — which is how a wrong ABI hid here once. Say what happened.
    console.error("landing: could not read the market", err)
    return []
  }
}

export const dollars = (base: bigint) =>
  `$${(Number(base) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`

/** Annualised from the discount over the days left; undefined once matured. */
export function impliedApr(b: Pick<Bond, "discountRateBps" | "maturity">, now = Date.now()) {
  const days = Math.floor((b.maturity - now / 1000) / 86_400)
  return days > 0 ? (b.discountRateBps * 365) / days / 100 : undefined
}

export const fundedPct = (b: Pick<Bond, "supply" | "faceValue">) =>
  b.faceValue === 0n ? 0 : Number((b.supply * 10_000n) / b.faceValue) / 100

export const daysLeft = (maturity: number, now = Date.now()) =>
  Math.max(Math.floor((maturity - now / 1000) / 86_400), 0)
