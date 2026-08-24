import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { deriveIsin, isValidIsin } from "../../src/index.js";

describe("deriveIsin", () => {
  it("yields a checksum-valid 12-char ISIN for many invoice ids (fuzz)", () => {
    for (let i = 0; i < 500; i++) {
      const invoiceId = keccak256(toHex(i, { size: 32 }));
      const isin = deriveIsin(invoiceId);
      expect(isin).toMatch(/^SW[0-9A-Z]{9}[0-9]$/);
      expect(isValidIsin(isin)).toBe(true);
    }
  });

  it("is deterministic", () => {
    const invoiceId = `0x${"ab".repeat(32)}` as const;
    expect(deriveIsin(invoiceId)).toBe(deriveIsin(invoiceId));
    expect(deriveIsin(invoiceId)).toBe("SWCRT7U2VND4");
  });
});

describe("isValidIsin", () => {
  it("accepts the live-run ISIN and real-world ISINs", () => {
    expect(isValidIsin("SW0WEE000004")).toBe(true); // proven on-chain by the e2e demo
    expect(isValidIsin("US0378331005")).toBe(true); // Apple
    expect(isValidIsin("GB0002634946")).toBe(true); // BAE Systems
    expect(isValidIsin("AU0000XVGZA3")).toBe(true); // letters after digits
  });

  it("rejects bad check digits, bad shapes and bad lengths", () => {
    expect(isValidIsin("")).toBe(false);
    expect(isValidIsin("US0378331004")).toBe(false); // wrong check digit
    expect(isValidIsin("SW0WEE000005")).toBe(false); // wrong check digit
    expect(isValidIsin("US037833100")).toBe(false); // 11 chars
    expect(isValidIsin("US03783310055")).toBe(false); // 13 chars
    expect(isValidIsin("us0378331005")).toBe(false); // lowercase
    expect(isValidIsin("0S0378331005")).toBe(false); // digit in the prefix
  });
});
