import type { AbiFunction } from "viem";
import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { aggregatorV3Abi, CHAINLINK_FEEDS_TESTNET } from "../../src/index.js";
import golden from "./fixtures/feeds-golden.json";

/**
 * Drift guard: the 7 testnet feed proxy addresses and the 4-byte selectors of every
 * AggregatorV3 function this plugin calls are committed in fixtures/feeds-golden.json.
 * A silently edited address or a reshaped ABI fragment fails here.
 */
describe("feed address and selector snapshot", () => {
  it("matches the committed fixture exactly", () => {
    const selectors: Record<string, string> = {};
    for (const fn of aggregatorV3Abi) {
      selectors[fn.name] = toFunctionSelector(fn as AbiFunction);
    }
    expect({ feeds: CHAINLINK_FEEDS_TESTNET, selectors }).toEqual(golden);
  });
});
