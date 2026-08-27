import { describe, expect, it } from "vitest";
import { atsViewsAbi } from "../../src/index.js";

describe("atsViewsAbi", () => {
  it("exposes the four compliance/role views every consumer reads", () => {
    const names = atsViewsAbi.map((f) => f.name);
    expect(names).toEqual([
      "hasRole",
      "isIssuer",
      "getKycStatusFor",
      "isInControlList",
      "paused",
      "getFrozenTokens",
      "isFrozen",
    ]);
    expect(atsViewsAbi.every((f) => f.stateMutability === "view")).toBe(true);
  });
});
