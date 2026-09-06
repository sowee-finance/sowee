import { type Address, formatUnits, type Hex, type PublicClient } from "viem"
import { bondTokenAbi } from "./abi/bondToken"
import { invoiceMarketAbi } from "./abi/invoiceMarket"

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
