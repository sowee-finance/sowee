import type { Hex } from "viem";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { aggregatorV3Abi, formatAnswer, isStale, resolveFeed } from "../../src/index.js";
import golden from "./fixtures/calldata-golden.json";

describe("formatAnswer", () => {
  it("formats an 8-decimal answer", () => {
    expect(formatAnswer(6_812_345_678n, 8)).toBe("68.12345678");
  });

  it("trims trailing zeros in the fraction", () => {
    expect(formatAnswer(123_450_000n, 8)).toBe("1.2345");
    expect(formatAnswer(100_000_000n, 8)).toBe("1");
  });

  it("formats zero", () => {
    expect(formatAnswer(0n, 8)).toBe("0");
    expect(formatAnswer(0n, 0)).toBe("0");
  });

  it("formats negative answers, including fraction-only ones", () => {
    expect(formatAnswer(-6_812_345_678n, 8)).toBe("-68.12345678");
    expect(formatAnswer(-5n, 8)).toBe("-0.00000005");
  });

  it("handles decimals 0 and sub-unit values", () => {
    expect(formatAnswer(42n, 0)).toBe("42");
    expect(formatAnswer(1n, 8)).toBe("0.00000001");
  });
});

describe("isStale", () => {
  const round = { updatedAt: 100 };

  it("is fresh at exactly the max age", () => {
    expect(isStale(round, 60, 160)).toBe(false);
  });

  it("is stale one second past the max age", () => {
    expect(isStale(round, 60, 161)).toBe(true);
  });

  it("is fresh when just updated", () => {
    expect(isStale(round, 60, 100)).toBe(false);
  });

  it("defaults `now` to the current clock", () => {
    expect(isStale({ updatedAt: Math.floor(Date.now() / 1000) }, 60)).toBe(false);
  });
});

describe("calldata golden fixtures", () => {
  for (const [name, expected] of Object.entries(golden as Record<string, Hex>)) {
    it(`${name} encodes to the committed calldata exactly`, () => {
      expect(
        encodeFunctionData({
          abi: aggregatorV3Abi,
          functionName: name as "latestRoundData" | "decimals" | "description",
        }),
      ).toBe(expected);
    });
  }

  it("covers every ABI function with a fixture", () => {
    expect(Object.keys(golden).sort()).toEqual(aggregatorV3Abi.map((fn) => fn.name).sort());
  });
});

describe("latestRoundData decode round-trip", () => {
  // abi.encode(uint80 10001, int256 6812345678, uint256 1756000000, uint256 1756000100, uint80 10001)
  const positiveBlob: Hex =
    "0x000000000000000000000000000000000000000000000000000000000000271100000000000000000000000000000000000000000000000000000001960c254e0000000000000000000000000000000000000000000000000000000068aa6f000000000000000000000000000000000000000000000000000000000068aa6f640000000000000000000000000000000000000000000000000000000000002711";
  // abi.encode(uint80 7, int256 -5, uint256 1756000000, uint256 1756000100, uint80 7)
  const negativeBlob: Hex =
    "0x0000000000000000000000000000000000000000000000000000000000000007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffb0000000000000000000000000000000000000000000000000000000068aa6f000000000000000000000000000000000000000000000000000000000068aa6f640000000000000000000000000000000000000000000000000000000000000007";

  it("decodes a fixed positive return blob", () => {
    const [roundId, answer, startedAt, updatedAt, answeredInRound] = decodeFunctionResult({
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
      data: positiveBlob,
    });
    expect(roundId).toBe(10_001n);
    expect(answer).toBe(6_812_345_678n);
    expect(startedAt).toBe(1_756_000_000n);
    expect(updatedAt).toBe(1_756_000_100n);
    expect(answeredInRound).toBe(10_001n);
    expect(formatAnswer(answer, 8)).toBe("68.12345678");
  });

  it("decodes a fixed negative int256 answer", () => {
    const [roundId, answer] = decodeFunctionResult({
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
      data: negativeBlob,
    });
    expect(roundId).toBe(7n);
    expect(answer).toBe(-5n);
  });
});

describe("resolveFeed", () => {
  it("maps known symbols to their proxy address", () => {
    expect(resolveFeed("HBAR/USD")).toBe("0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a");
  });

  it("passes addresses through untouched", () => {
    expect(resolveFeed("0x058fE79CB5775d4b167920Ca6036B824805A9ABd")).toBe(
      "0x058fE79CB5775d4b167920Ca6036B824805A9ABd",
    );
  });
});
