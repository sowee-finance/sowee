import { expect, test } from "bun:test"
import { planBuy, SCALE } from "./plan"

// A 100 USDC invoice at a 2.25% discount with a 0.5% fee: one unit costs ~0.982 USDC.
const unitPrice = 982_388n
const base = { requested: 5n * SCALE, remaining: 90n * SCALE, balance: 27_000_000n, unitPrice }

test("buys what was asked when nothing constrains it", () => {
  expect(planBuy(base)).toMatchObject({ ok: true, units: 5n * SCALE, reason: "as requested" })
})

test("never over-funds a bond", () => {
  const p = planBuy({ ...base, remaining: 2n * SCALE })
  expect(p).toMatchObject({
    ok: true,
    units: 2n * SCALE,
    reason: "capped by the remaining capacity",
  })
})

test("sizes whole units against the balance, not base units", () => {
  // 3 USDC buys three whole units, not three base units — the scale bug this guards against.
  const p = planBuy({ ...base, requested: 100n * SCALE, balance: 3_000_000n })
  expect(p.ok).toBe(true)
  expect(p.units).toBeGreaterThan(3n * SCALE - 100_000n)
  expect(p.units).toBeLessThan(4n * SCALE)
  expect(p.reason).toBe("capped by the USDC balance")
})

test("refuses when a unit is unaffordable, the bond is full, or the ask is empty", () => {
  expect(planBuy({ ...base, balance: 0n }).ok).toBe(false)
  expect(planBuy({ ...base, remaining: 0n }).reason).toBe("bond is fully funded")
  expect(planBuy({ ...base, requested: 0n }).ok).toBe(false)
})
