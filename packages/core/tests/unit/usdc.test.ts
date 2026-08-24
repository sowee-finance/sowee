import { describe, expect, it } from "vitest";
import { applyDiscountBps, discountAmount, formatUsdc, parseUsdc } from "../../src/index.js";

describe("parseUsdc", () => {
  it("parses whole and fractional amounts", () => {
    expect(parseUsdc("0")).toBe(0n);
    expect(parseUsdc("1")).toBe(1_000_000n);
    expect(parseUsdc("1234.56")).toBe(1_234_560_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
    expect(parseUsdc("-2.5")).toBe(-2_500_000n);
  });

  it("rejects malformed input and excess precision", () => {
    expect(() => parseUsdc("1.2345678")).toThrow();
    expect(() => parseUsdc("1,00")).toThrow();
    expect(() => parseUsdc("")).toThrow();
    expect(() => parseUsdc("1e6")).toThrow();
    expect(() => parseUsdc(".5")).toThrow();
  });
});

describe("formatUsdc", () => {
  it("formats and trims trailing zeros", () => {
    expect(formatUsdc(0n)).toBe("0");
    expect(formatUsdc(1_234_560_000n)).toBe("1234.56");
    expect(formatUsdc(1n)).toBe("0.000001");
    expect(formatUsdc(-2_500_000n)).toBe("-2.5");
    expect(formatUsdc(5_000_000n)).toBe("5");
  });

  it("round-trips with parseUsdc", () => {
    for (const s of ["0", "1", "1234.56", "0.000001", "99999999.999999"]) {
      expect(formatUsdc(parseUsdc(s))).toBe(s);
    }
  });
});

describe("applyDiscountBps", () => {
  it("computes discounted value with floor rounding", () => {
    expect(applyDiscountBps(1_000_000n, 0)).toBe(1_000_000n);
    expect(applyDiscountBps(1_000_000n, 250)).toBe(975_000n);
    expect(applyDiscountBps(1_000_000n, 10_000)).toBe(0n);
    // floor: 999 * 9999 / 10000 = 998.9001 -> 998
    expect(applyDiscountBps(999n, 1)).toBe(998n);
  });

  it("rejects out-of-range bps", () => {
    expect(() => applyDiscountBps(1n, -1)).toThrow();
    expect(() => applyDiscountBps(1n, 10_001)).toThrow();
    expect(() => applyDiscountBps(1n, 1.5)).toThrow();
  });

  it("discountAmount is the complement", () => {
    expect(discountAmount(1_000_000n, 250)).toBe(25_000n);
  });
});
