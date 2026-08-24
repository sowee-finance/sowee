/** USDC 6-decimal fixed-point math. bigint only — no floats anywhere. */

export const USDC_DECIMALS = 6;
const ONE_USDC = 10n ** BigInt(USDC_DECIMALS);
const BPS_DENOMINATOR = 10_000n;

const USDC_DECIMAL_REGEX = /^(-?)(\d+)(?:\.(\d{1,6}))?$/;

/**
 * Parse a decimal string like "1234.56" into USDC base units (bigint).
 * Rejects more than 6 fractional digits instead of silently rounding.
 */
export function parseUsdc(value: string): bigint {
  const match = USDC_DECIMAL_REGEX.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid USDC amount: "${value}" (max 6 decimal places)`);
  }
  const [, sign, whole, fraction = ""] = match;
  const units = BigInt(whole ?? "0") * ONE_USDC + BigInt(fraction.padEnd(6, "0"));
  return sign === "-" ? -units : units;
}

/** Trim trailing zeros from a digit string with a linear index scan (no regex backtracking). */
export function trimTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 0 && digits.charCodeAt(end - 1) === 48) {
    end -= 1;
  }
  return digits.slice(0, end);
}

/** Format USDC base units as a decimal string, trimming trailing fractional zeros. */
export function formatUsdc(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const whole = abs / ONE_USDC;
  const fraction = trimTrailingZeros((abs % ONE_USDC).toString().padStart(6, "0"));
  const suffix = fraction === "" ? "" : `.${fraction}`;
  return `${sign}${whole}${suffix}`;
}

/**
 * Purchase price for a face value discounted by `discountRateBps` basis points,
 * rounded down: faceValue * (10000 - bps) / 10000.
 */
export function applyDiscountBps(faceValue: bigint, discountRateBps: number): bigint {
  if (!Number.isInteger(discountRateBps) || discountRateBps < 0 || discountRateBps > 10_000) {
    throw new Error(`discountRateBps out of range: ${discountRateBps}`);
  }
  return (faceValue * (BPS_DENOMINATOR - BigInt(discountRateBps))) / BPS_DENOMINATOR;
}

/** Absolute discount amount in base units: faceValue - applyDiscountBps(faceValue, bps). */
export function discountAmount(faceValue: bigint, discountRateBps: number): bigint {
  return faceValue - applyDiscountBps(faceValue, discountRateBps);
}
