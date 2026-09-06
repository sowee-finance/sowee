import { describe, expect, test } from "bun:test"
import type { PublicClient } from "viem"
import {
  askCost,
  bpsToPct,
  feeOn,
  fetchAsks,
  fetchBonds,
  fetchPositions,
  fundedPct,
  maturityDate,
  usdc,
} from "./market"

const market = "0x000000000000000000000000000000000000000a"
const bond = "0x000000000000000000000000000000000000000b"
const issuer = "0x000000000000000000000000000000000000000c"
const inv = `0x${"1".repeat(64)}` as const

// Canned answers keyed by function name; enough to exercise the count -> ids -> listing -> bond chain.
const answers: Record<string, unknown> = {
  listingCount: 1n,
  invoiceIds: inv,
  listing: {
    bond,
    issuer,
    faceValue: 10_000_000_000n,
    discountRateBps: 300,
    maturity: 1_800_000_000n,
  },
  name: "Sowee Bond INV-1",
  symbol: "sINV1",
  totalSupply: 2_500_000_000n,
  faceValue: 10_000_000_000n,
  nextAskId: 3n,
  balanceOf: 1_000_000n,
  isEligible: true,
  claimable: 990_000n,
}
// ask 1 was cancelled (zero maker), ask 2 is open
const asks: Record<string, readonly [typeof inv, string, bigint, bigint]> = {
  "1": [inv, "0x0000000000000000000000000000000000000000", 0n, 0n],
  "2": [inv, issuer, 500_000n, 9_700n],
}
const client = {
  readContract: async ({ functionName, args }: { functionName: string; args?: unknown[] }) =>
    functionName === "asks" ? asks[String(args?.[0])] : answers[functionName],
} as unknown as PublicClient

describe("market", () => {
  test("fetchBonds maps listing and bond reads into a Bond", async () => {
    const [b] = await fetchBonds(client, market)
    expect(b).toEqual({
      invoiceId: inv,
      bond,
      issuer,
      name: "Sowee Bond INV-1",
      symbol: "sINV1",
      faceValue: 10_000_000_000n,
      supply: 2_500_000_000n,
      discountRateBps: 300,
      maturity: 1_800_000_000,
    })
    expect(fundedPct(b)).toBe(25)
  })

  test("fetchAsks skips deleted asks", async () => {
    expect(await fetchAsks(client, market)).toEqual([
      { askId: 2n, invoiceId: inv, maker: issuer, units: 500_000n, priceBps: 9_700n },
    ])
  })

  test("fetchPositions pairs each held bond with eligibility and claimable", async () => {
    const [p] = await fetchPositions(
      client,
      { invoiceMarket: market, maturitySettlement: bond },
      issuer,
    )
    expect(p.bond.invoiceId).toBe(inv)
    expect(p.units).toBe(1_000_000n)
    expect(p.eligible).toBe(true)
    expect(p.claimable).toBe(990_000n)
  })

  test("ask math rounds up like the contract", () => {
    expect(askCost(1_000_001n, 9_700n)).toBe(970_001n)
    expect(feeOn(970_001n, 50)).toBe(4_851n)
  })

  test("formatting helpers", () => {
    expect(bpsToPct(300)).toBe("3.00%")
    expect(usdc(1_500_000n)).toBe("1.5 USDC")
    expect(fundedPct({ supply: 0n, faceValue: 0n })).toBe(0)
    expect(maturityDate(1_800_000_000)).toBe("15 Jan 2027")
  })
})
