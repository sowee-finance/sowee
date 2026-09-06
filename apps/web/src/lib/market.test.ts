import { describe, expect, test } from "bun:test"
import type { PublicClient } from "viem"
import { bpsToPct, fetchBonds, fundedPct, maturityDate, usdc } from "./market"

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
}
const client = {
  readContract: async ({ functionName }: { functionName: string }) => answers[functionName],
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

  test("formatting helpers", () => {
    expect(bpsToPct(300)).toBe("3.00%")
    expect(usdc(1_500_000n)).toBe("1.5 USDC")
    expect(fundedPct({ supply: 0n, faceValue: 0n })).toBe(0)
    expect(maturityDate(1_800_000_000)).toBe("15 Jan 2027")
  })
})
