import type { AbiFunction } from "viem";
import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import {
  accessControlFacetAbi,
  balanceTrackerAtSnapshotFacetAbi,
  controlListFacetAbi,
  controllerFacetAbi,
  erc1594FacetAbi,
  factoryAbi,
  freezeFacetAbi,
  kycFacetAbi,
  maturityFacetAbi,
  pauseFacetAbi,
  snapshotsFacetAbi,
  ssiManagementFacetAbi,
} from "../../src/index.js";
import golden from "./fixtures/selectors-golden.json";

/**
 * ABI drift guard: the 4-byte selectors of every function this plugin relies on are
 * committed in fixtures/selectors-golden.json. If a vendored ABI fragment changes shape
 * (renamed field, reordered struct, changed type), its selector changes and this fails.
 */
const abis = [
  factoryAbi,
  kycFacetAbi,
  controlListFacetAbi,
  accessControlFacetAbi,
  ssiManagementFacetAbi,
  erc1594FacetAbi,
  freezeFacetAbi,
  pauseFacetAbi,
  snapshotsFacetAbi,
  balanceTrackerAtSnapshotFacetAbi,
  maturityFacetAbi,
  controllerFacetAbi,
];

function currentSelectors(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const abi of abis) {
    for (const item of abi) {
      out[item.name] = toFunctionSelector(item as AbiFunction);
    }
  }
  return out;
}

describe("function selector snapshot", () => {
  it("matches the committed selector fixture exactly", () => {
    expect(currentSelectors()).toEqual(golden);
  });
});
