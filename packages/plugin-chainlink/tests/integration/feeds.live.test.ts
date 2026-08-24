import { HEDERA_TESTNET } from "@sowee/core";
import { describe, expect, it } from "vitest";
import { FeedReader, isStale } from "../../src/index.js";

/**
 * Live read-only checks against the public Hedera testnet mirror node.
 * Skipped automatically when the mirror node is unreachable (offline CI, firewalls).
 */
const reachable = await fetch(`${HEDERA_TESTNET.mirrorNodeUrl}/network/nodes?limit=1`, {
  signal: AbortSignal.timeout(10_000),
})
  .then((res) => res.ok)
  .catch(() => false);

describe.skipIf(!reachable)("Chainlink feeds (live testnet)", () => {
  const reader = new FeedReader();

  it("HBAR/USD returns a positive 8-decimal round", async () => {
    const round = await reader.readLatestRound("HBAR/USD");
    expect(round.decimals).toBe(8);
    expect(round.answer > 0n).toBe(true);
    expect(round.roundId > 0n).toBe(true);
    expect(round.updatedAt).toBeGreaterThan(0);
    // Testnet feeds can idle; a week is generous while still catching dead feeds.
    expect(isStale(round, 7 * 24 * 3600)).toBe(false);
  });

  it("USDC/USD is 8 decimals and within 20% of $1", async () => {
    const round = await reader.readLatestRound("USDC/USD");
    expect(round.decimals).toBe(8);
    expect(round.answer > 80_000_000n).toBe(true);
    expect(round.answer < 120_000_000n).toBe(true);
  });
});

if (!reachable) {
  describe("Chainlink feeds (live testnet)", () => {
    it.skip("skipped: testnet mirror node unreachable from this environment", () => {});
  });
}
