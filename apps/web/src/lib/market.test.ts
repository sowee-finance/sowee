import { describe, expect, test } from "bun:test"
import type { PublicClient } from "viem"
import {
  askCost,
  bondStatus,
  bpsToPct,
  dollars,
  feeOn,
  fetchAsks,
  fetchBonds,
  fetchPositions,
  fundedPct,
  holdingsCurve,
  impliedApr,
  maturityDate,
  pricePath,
  relativeMaturity,
  splitName,
  tenorDays,
  unitValue,
  usdc,
} from "./market"

const market = "0x000000000000000000000000000000000000000a"
const bond = "0x000000000000000000000000000000000000000b"
const issuer = "0x000000000000000000000000000000000000000c"
const settlement = "0x000000000000000000000000000000000000000d"
const contracts = { invoiceMarket: market, maturitySettlement: settlement } as const
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
  name: "Acme GmbH · Globex Corp",
  symbol: "sINV1",
  totalSupply: 2_500_000_000n,
  faceValue: 10_000_000_000n,
  repayments: [0n, 0n, false],
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
  test("fetchBonds maps listing, bond and settlement reads into a Bond", async () => {
    const [b] = await fetchBonds(client, contracts)
    expect(b).toEqual({
      invoiceId: inv,
      bond,
      issuer,
      name: "Acme GmbH · Globex Corp",
      symbol: "sINV1",
      faceValue: 10_000_000_000n,
      supply: 2_500_000_000n,
      discountRateBps: 300,
      maturity: 1_800_000_000,
      settled: false,
    })
    expect(fundedPct(b)).toBe(25)
    expect(splitName(b.name)).toEqual({ issuer: "Acme GmbH", payor: "Globex Corp" })
    expect(splitName("Sowee Bond INV-1")).toEqual({ issuer: "Sowee Bond INV-1" })
  })

  test("status follows supply, maturity and settlement", () => {
    const now = 1_700_000_000_000
    const open = { supply: 1n, faceValue: 2n, maturity: 1_700_000_001, settled: false }
    expect(bondStatus(open, now)).toBe("open")
    expect(bondStatus({ ...open, supply: 2n }, now)).toBe("funded")
    expect(bondStatus({ ...open, maturity: 1_700_000_000 }, now)).toBe("matured")
    expect(bondStatus({ ...open, maturity: 1_700_000_000, settled: true }, now)).toBe("settled")
  })

  test("the synthetic price path accretes from the discount to par", () => {
    const now = 1_700_000_000_000
    const path = pricePath({ discountRateBps: 200, maturity: 1_700_086_400 }, 3, now)
    expect(path).toEqual([0.98, 0.99, 1])
    expect(pricePath({ discountRateBps: 200, maturity: 1_600_000_000 }, 2, now)).toEqual([1, 1])
  })

  test("fetchAsks skips deleted asks", async () => {
    expect(await fetchAsks(client, market)).toEqual([
      { askId: 2n, invoiceId: inv, maker: issuer, units: 500_000n, priceBps: 9_700n },
    ])
  })

  test("fetchPositions pairs each held bond with eligibility and claimable", async () => {
    const [p] = await fetchPositions(client, contracts, issuer)
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
    expect(usdc(1_500_000n)).toBe("1.50 USDC")
    expect(usdc(1_234_567_891n)).toBe("1,234.57 USDC")
    expect(dollars(9_800_000_000n)).toBe("$9,800")
    expect(dollars(9_650_500_000n)).toBe("$9,650.50")
    expect(fundedPct({ supply: 0n, faceValue: 0n })).toBe(0)
    expect(maturityDate(1_800_000_000)).toBe("Jan 15, 2027")
  })

  test("tenor and implied APR follow the API's simple yield", () => {
    const now = 1_700_000_000_000
    const maturity = 1_700_000_000 + 30 * 86_400
    expect(tenorDays(maturity, now)).toBe(30)
    // 2.25% over 30 days -> 225 * 365 / 30 = 2737.5 bps
    expect(impliedApr({ discountRateBps: 225, maturity }, now)).toBeCloseTo(27.375)
    expect(impliedApr({ discountRateBps: 225, maturity: 1_700_000_000 }, now)).toBeUndefined()
  })

  test("relative maturity reads as a sentence", () => {
    const now = 1_700_000_000_000
    expect(relativeMaturity(1_700_000_000 + 29 * 86_400, now)).toBe("matures in 29 days")
    expect(relativeMaturity(1_700_000_000 + 86_400, now)).toBe("matures in 1 day")
    expect(relativeMaturity(1_700_000_000, now)).toBe("matures today")
    expect(relativeMaturity(1_700_000_000 - 3 * 86_400, now)).toBe("matured 3 days ago")
  })
})

test("all bonds means the ones still worth looking at, not the finished ones", () => {
  const base = { supply: 0n, faceValue: 100n, maturity: Math.floor(Date.now() / 1000) + 86_400 }
  expect(bondStatus({ ...base, settled: false })).toBe("open")
  expect(bondStatus({ ...base, supply: 100n, settled: false })).toBe("funded")
  expect(bondStatus({ ...base, maturity: 1, settled: false })).toBe("matured")
  expect(bondStatus({ ...base, maturity: 1, settled: true })).toBe("settled")
})

describe("unitValue", () => {
  const bond = { discountRateBps: 500, maturity: 0 } // 5% discount
  const now = Date.UTC(2026, 8, 8)
  const at = (days: number) => now + days * 86_400_000
  const b = (maturityDays: number) => ({ ...bond, maturity: at(maturityDays) / 1000 })

  test("a unit is worth its discounted cost today and par at maturity", () => {
    expect(unitValue(b(100), now, now)).toBeCloseTo(0.95, 6)
    expect(unitValue(b(100), at(100), now)).toBe(1)
  })

  test("it accretes linearly in between", () => {
    expect(unitValue(b(100), at(50), now)).toBeCloseTo(0.975, 6)
  })

  test("a matured bond is worth par, and nothing is claimed about the past", () => {
    expect(unitValue(b(-1), now, now)).toBe(1)
    expect(unitValue(b(100), at(-30), now)).toBeCloseTo(0.95, 6)
  })
})

describe("holdingsCurve", () => {
  const now = Date.UTC(2026, 8, 8)
  const at = (days: number) => now + days * 86_400_000
  const pos = (maturityDays: number, units: bigint, extra = {}) => ({
    bond: { discountRateBps: 500, maturity: at(maturityDays) / 1000, settled: false, ...extra },
    units,
    claimable: 0n,
  })

  test("a wallet whose bonds have all matured is worth what they pay, not nothing", () => {
    const curve = holdingsCurve([pos(-10, 10_000_000_000n)], now)
    expect(curve.length).toBeGreaterThan(1)
    expect(curve[0].value).toBeCloseTo(10_000, 6)
    expect(curve.at(-1)?.value).toBeCloseTo(10_000, 6)
  })

  test("a settled bond contributes what it will actually pay, not its face", () => {
    // 10,000 of face, but settlement only covered 6,000.
    const settled = { ...pos(-10, 10_000_000_000n, { settled: true }), claimable: 6_000_000_000n }
    expect(holdingsCurve([settled], now)[0].value).toBeCloseTo(6_000, 6)
  })

  test("positions accrete on their own clocks and the curve ends at total face", () => {
    const curve = holdingsCurve([pos(10, 1_000_000n), pos(100, 1_000_000n)], now)
    expect(curve[0].value).toBeCloseTo(1.9, 6) // both still at cost
    expect(curve.at(-1)?.value).toBeCloseTo(2, 6) // both at par
    // The short bond is already at par a third of the way in; the long one is not.
    const third = curve[Math.floor(curve.length / 3)].value
    expect(third).toBeGreaterThan(1.9)
    expect(third).toBeLessThan(2)
  })

  test("no positions, no curve", () => {
    expect(holdingsCurve([], now)).toEqual([])
  })
})
