/**
 * Order sizing for the agent's autonomous buy. Pure, so the rule is testable.
 *
 * Quantities are in base units (a bond has 6 decimals, so 1_000_000 base units = one unit = one
 * USDC of face value). `unitPrice` is what one *whole* unit costs, fee included, which is how the
 * market quotes it — mixing the two scales is exactly the bug this shape prevents.
 */

/** Base units in one whole unit; bonds and USDC both use 6 decimals. */
export const SCALE = 1_000_000n

export type Sizing = {
  /** Base units the caller asked for. */
  requested: bigint
  /** Face value minus units already minted, in base units. */
  remaining: bigint
  /** What the agent holds, in USDC base units. */
  balance: bigint
  /** USDC base units for one whole unit, platform fee included. */
  unitPrice: bigint
}

export type Plan =
  | { ok: true; units: bigint; reason: string }
  | { ok: false; units: 0n; reason: string }

/**
 * Buy the smallest of: what was asked, what is left to fund, and what the balance affords.
 * The agent never over-funds a bond and never orders more than it can pay for.
 */
export function planBuy({ requested, remaining, balance, unitPrice }: Sizing): Plan {
  if (requested <= 0n) return { ok: false, units: 0n, reason: "units must be positive" }
  if (unitPrice <= 0n) return { ok: false, units: 0n, reason: "unit price is zero" }
  if (remaining <= 0n) return { ok: false, units: 0n, reason: "bond is fully funded" }

  const affordable = (balance * SCALE) / unitPrice
  const units = [requested, remaining, affordable].reduce((a, b) => (b < a ? b : a))
  if (units <= 0n)
    return { ok: false, units: 0n, reason: "USDC balance does not cover one base unit" }

  const reason =
    units === requested
      ? "as requested"
      : units === remaining
        ? "capped by the remaining capacity"
        : "capped by the USDC balance"
  return { ok: true, units, reason }
}
