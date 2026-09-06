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
}

export async function fetchBond(
  client: PublicClient,
  market: Address,
  invoiceId: Hex,
): Promise<Bond> {
  const l = await client.readContract({
    address: market,
    abi: invoiceMarketAbi,
    functionName: "listing",
    args: [invoiceId],
  })
  const bond = { address: l.bond, abi: bondTokenAbi } as const
  const [name, symbol, supply, faceValue] = await Promise.all([
    client.readContract({ ...bond, functionName: "name" }),
    client.readContract({ ...bond, functionName: "symbol" }),
    client.readContract({ ...bond, functionName: "totalSupply" }),
    client.readContract({ ...bond, functionName: "faceValue" }),
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
  }
}

export async function fetchBonds(client: PublicClient, market: Address): Promise<Bond[]> {
  const count = await client.readContract({
    address: market,
    abi: invoiceMarketAbi,
    functionName: "listingCount",
  })
  const ids = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      client.readContract({
        address: market,
        abi: invoiceMarketAbi,
        functionName: "invoiceIds",
        args: [BigInt(i)],
      }),
    ),
  )
  return Promise.all(ids.map((id) => fetchBond(client, market, id)))
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
  d: Pick<Deployment, "invoiceMarket" | "maturitySettlement">,
  wallet: Address,
): Promise<Position[]> {
  const bonds = await fetchBonds(client, d.invoiceMarket)
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

// ---- formatting ---------------------------------------------------------------------------

export const fundedPct = (b: Pick<Bond, "supply" | "faceValue">) =>
  b.faceValue === 0n ? 0 : Number((b.supply * 10_000n) / b.faceValue) / 100

export const bpsToPct = (bps: number) => `${(bps / 100).toFixed(2)}%`

export const usdc = (v: bigint) => `${formatUnits(v, 6)} USDC`

export const maturityDate = (maturity: number) =>
  new Date(maturity * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

export const isMatured = (maturity: number) => Date.now() / 1000 >= maturity
