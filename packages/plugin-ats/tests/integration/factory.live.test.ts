import { ATS_TESTNET, HEDERA_TESTNET, MirrorNodeClient } from "@sowee/core";
import { describe, expect, it } from "vitest";
import { ATS_FACTORY_TESTNET, ATS_RESOLVER_TESTNET } from "../../src/index.js";

/**
 * Live read-only checks against the public Hedera testnet mirror node.
 * Skipped automatically when the mirror node is unreachable (offline CI, firewalls).
 */
const reachable = await fetch(`${HEDERA_TESTNET.mirrorNodeUrl}/network/nodes?limit=1`, {
  signal: AbortSignal.timeout(10_000),
})
  .then((res) => res.ok)
  .catch(() => false);

describe.skipIf(!reachable)("ATS deployment (live testnet)", () => {
  const client = new MirrorNodeClient();

  it("factory contract exists with runtime bytecode", async () => {
    const contract = await client.getContract(ATS_TESTNET.factoryId);
    expect(contract.contract_id).toBe(ATS_TESTNET.factoryId);
    expect(contract.deleted).toBe(false);
    expect(contract.evm_address.toLowerCase()).toBe(ATS_FACTORY_TESTNET.toLowerCase());
    expect(contract.runtime_bytecode?.length ?? 0).toBeGreaterThan(2);
  });

  it("resolver contract exists with runtime bytecode", async () => {
    const contract = await client.getContract(ATS_TESTNET.resolverId);
    expect(contract.contract_id).toBe(ATS_TESTNET.resolverId);
    expect(contract.deleted).toBe(false);
    expect(contract.evm_address.toLowerCase()).toBe(ATS_RESOLVER_TESTNET.toLowerCase());
    expect(contract.runtime_bytecode?.length ?? 0).toBeGreaterThan(2);
  });
});

if (!reachable) {
  describe("ATS deployment (live testnet)", () => {
    it.skip("skipped: testnet mirror node unreachable from this environment", () => {});
  });
}
