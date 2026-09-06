import { type Address, formatUnits, type Hex, type PublicClient, zeroAddress } from "viem"
import { bondTokenAbi } from "./abi/bondToken"
import { invoiceMarketAbi } from "./abi/invoiceMarket"
import { maturitySettlementAbi } from "./abi/maturitySettlement"
import type { Deployment } from "./deployments"

export type Bond = {
  invoiceId: Hex
  bond: Address
  issuer: Address
  name: string
  symbol: string
  /** USDC base units; also the supply cap. */
  faceValue: bigint
  /** Units minted so far. */
  supply: bigint
  discountRateBps: number
  /** Unix seconds. */
  maturity: number
  /** `MaturitySettlement.repayments(invoiceId).settled`: the payor repaid and holders can claim. */
  settled: boolean
}

export type Contracts = Pick<Deployment, "invoiceMarket" | "maturitySettlement">

export async function fetchBond(client: PublicClient, d: Contracts, invoiceId: Hex): Promise<Bond> {
  const l = await client.readContract({
    address: d.invoiceMarket,
    abi: invoiceMarketAbi,
    functionName: "listing",
    args: [invoiceId],
  })
  const bond = { address: l.bond, abi: bondTokenAbi } as const
  const [name, symbol, supply, faceValue, repayment] = await Promise.all([
    client.readContract({ ...bond, functionName: "name" }),
    client.readContract({ ...bond, functionName: "symbol" }),
    client.readContract({ ...bond, functionName: "totalSupply" }),
    client.readContract({ ...bond, functionName: "faceValue" }),
    client.readContract({
      address: d.maturitySettlement,
      abi: maturitySettlementAbi,
      functionName: "repayments",
      args: [invoiceId],
    }),
  ])
  return {
    invoiceId,
    bond: l.bond,
    issuer: l.issuer,
    name,
    symbol,
    faceValue,
    supply,
    discountRateBps: l.discountRateBps,
    maturity: Number(l.maturity),
    settled: repayment[2],
  }
}

/** Every listing, oldest first (`invoiceIds` is append-only). */
export async function fetchBonds(client: PublicClient, d: Contracts): Promise<Bond[]> {
  const count = await client.readContract({
    address: d.invoiceMarket,
    abi: invoiceMarketAbi,
    functionName: "listingCount",
  })
  const ids = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      client.readContract({
        address: d.invoiceMarket,
        abi: invoiceMarketAbi,
        functionName: "invoiceIds",
        args: [BigInt(i)],
      }),
    ),
  )
  return Promise.all(ids.map((id) => fetchBond(client, d, id)))
}

export type Ask = {
  askId: bigint
  invoiceId: Hex
  maker: Address
  units: bigint
  /** Price per unit in bps of face (9_700 = 0.97 USDC per unit). */
  priceBps: bigint
}

/** Every open ask. Ids are dense from 1; a cancelled or filled ask reads back with a zero maker. */
export async function fetchAsks(client: PublicClient, market: Address): Promise<Ask[]> {
  const next = await client.readContract({
    address: market,
    abi: invoiceMarketAbi,
    functionName: "nextAskId",
  })
  const rows = await Promise.all(
    Array.from({ length: Number(next) - 1 }, (_, i) =>
      client.readContract({
        address: market,
        abi: invoiceMarketAbi,
        functionName: "asks",
        args: [BigInt(i + 1)],
      }),
    ),
  )
  return rows.flatMap(([invoiceId, maker, units, priceBps], i) =>
    maker === zeroAddress ? [] : [{ askId: BigInt(i + 1), invoiceId, maker, units, priceBps }],
  )
}

export type Position = {
  bond: Bond
  units: bigint
  eligible: boolean
  /** USDC the wallet can pull from settlement right now; 0 until the invoice is settled. */
  claimable: bigint
}

/** The wallet's holdings across every listing, non-zero balances only. */
export async function fetchPositions(
  client: PublicClient,
  d: Contracts,
  wallet: Address,
): Promise<Position[]> {
  const bonds = await fetchBonds(client, d)
  const positions = await Promise.all(
    bonds.map(async (bond) => {
      const token = { address: bond.bond, abi: bondTokenAbi } as const
      const [units, eligible, claimable] = await Promise.all([
        client.readContract({ ...token, functionName: "balanceOf", args: [wallet] }),
        client.readContract({ ...token, functionName: "isEligible", args: [wallet] }),
        client.readContract({
          address: d.maturitySettlement,
          abi: maturitySettlementAbi,
          functionName: "claimable",
          args: [bond.invoiceId, wallet],
        }),
      ])
      return { bond, units, eligible, claimable }
    }),
  )
  return positions.filter((p) => p.units > 0n)
}

// ---- math ---------------------------------------------------------------------------------

export const BPS = 10_000n
export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b
/** USDC due for `units` of an ask at `priceBps`, fee excluded (mirrors `fillAsk`). */
export const askCost = (units: bigint, priceBps: bigint) => ceilDiv(units * priceBps, BPS)
/** Platform fee on a cost (mirrors `_takeFee`). */
export const feeOn = (cost: bigint, feeBps: number) => ceilDiv(cost * BigInt(feeBps), BPS)

// ---- lifecycle ----------------------------------------------------------------------------

export type BondStatus = "open" | "funded" | "matured" | "settled"

export const statusLabel: Record<BondStatus, string> = {
  open: "Funding",
  funded: "Funded",
  matured: "Matured",
  settled: "Settled",
}

/** Funding until every unit is sold, funded until maturity, matured until the payor settles. */
export function bondStatus(
  b: Pick<Bond, "supply" | "faceValue" | "maturity" | "settled">,
  now = Date.now(),
): BondStatus {
  if (b.settled) return "settled"
  if (isMatured(b.maturity, now)) return "matured"
  return b.supply >= b.faceValue ? "funded" : "open"
}

/**
 * The issuer form names a bond `<issuer company> · <payor>` (`issuer.ts`); split it back for
 * display. A name without the separator is shown whole, with no payor.
 */
export function splitName(name: string): { issuer: string; payor?: string } {
  const i = name.indexOf(" · ")
  return i < 0 ? { issuer: name } : { issuer: name.slice(0, i), payor: name.slice(i + 3) }
}

/**
 * Synthetic price path per 1 USDC of face, `n` points: the discount price accreting linearly to
 * par at maturity. There is no on-chain price history; this is the payoff line of a zero-coupon
 * note, flat at par once matured.
 */
export function pricePath(
  b: Pick<Bond, "discountRateBps" | "maturity">,
  n = 32,
  now = Date.now(),
): number[] {
  const p0 = isMatured(b.maturity, now) ? 1 : 1 - b.discountRateBps / 10_000
  return Array.from({ length: n }, (_, i) => p0 + ((1 - p0) * i) / (n - 1))
}

// ---- formatting ---------------------------------------------------------------------------

export const fundedPct = (b: Pick<Bond, "supply" | "faceValue">) =>
  b.faceValue === 0n ? 0 : Number((b.supply * 10_000n) / b.faceValue) / 100

export const pct = (p: number) => `${p.toFixed(2)}%`

export const bpsToPct = (bps: number) => pct(bps / 100)

const twoDecimals = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const noDecimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/** USDC base units as `1,234.50`; always two decimals so amounts line up. */
export const usdcAmount = (v: bigint) => twoDecimals.format(Number(formatUnits(v, 6)))

export const usdc = (v: bigint) => `${usdcAmount(v)} USDC`

/** USDC base units as `$9,800`, or `$9,650.50` when there are cents. */
export function dollars(v: bigint): string {
  const n = Number(formatUnits(v, 6))
  return `$${Number.isInteger(n) ? noDecimals.format(n) : twoDecimals.format(n)}`
}

/** `Sep 19, 2026` (UTC, like the maturity itself). */
export const maturityDate = (maturity: number) =>
  new Date(maturity * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

export const isMatured = (maturity: number, now = Date.now()) => now / 1000 >= maturity

/** Whole days until maturity, negative once past (mirrors the API's `Yield`). */
export const tenorDays = (maturity: number, now = Date.now()) =>
  Math.floor((maturity - now / 1000) / 86_400)

/** Simple annualised yield in percent: discount × 365 / days left; undefined once matured. */
export function impliedApr(
  b: Pick<Bond, "discountRateBps" | "maturity">,
  now = Date.now(),
): number | undefined {
  const days = tenorDays(b.maturity, now)
  return days > 0 ? (b.discountRateBps * 365) / days / 100 : undefined
}

/** `matures in 29 days`, `matures today`, `matured 3 days ago`. */
export function relativeMaturity(maturity: number, now = Date.now()): string {
  const days = Math.ceil((maturity * 1000 - now) / 86_400_000)
  const unit = (n: number) => `${n} day${n === 1 ? "" : "s"}`
  if (days > 0) return `matures in ${unit(days)}`
  if (days === 0) return "matures today"
  return `matured ${unit(-days)} ago`
}
