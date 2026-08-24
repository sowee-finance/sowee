import { describe, expect, it } from "vitest";
import { HEDERA_TESTNET, MirrorNodeClient, SOWEE_TESTNET, USDC_TESTNET } from "../../src/index.js";

/**
 * Live read-only tests against the public Hedera testnet mirror node.
 * Skipped automatically when the mirror node is unreachable (offline CI, firewalls).
 */
const reachable = await fetch(`${HEDERA_TESTNET.mirrorNodeUrl}/network/nodes?limit=1`, {
  signal: AbortSignal.timeout(10_000),
})
  .then((res) => res.ok)
  .catch(() => false);

describe.skipIf(!reachable)("mirror node (live testnet)", () => {
  const client = new MirrorNodeClient();

  it("fetches USDC token info with expected symbol and decimals", async () => {
    const info = await client.getTokenInfo(USDC_TESTNET.tokenId);
    expect(info.token_id).toBe(USDC_TESTNET.tokenId);
    expect(info.symbol.toUpperCase()).toContain("USDC");
    expect(Number(info.decimals)).toBe(USDC_TESTNET.decimals);
    expect(info.type).toBe("FUNGIBLE_COMMON");
  });

  it("fetches a known account (USDC treasury)", async () => {
    const info = await client.getTokenInfo(USDC_TESTNET.tokenId);
    expect(info.treasury_account_id).toBeTruthy();
    const account = await client.getAccount(info.treasury_account_id as string);
    expect(account.account).toBe(info.treasury_account_id);
    expect(account.evm_address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("resolves the deployed Sowee protocol contracts", async () => {
    const oracle = await client.getContract(SOWEE_TESTNET.discountOracle);
    expect(oracle.contract_id).toBe(SOWEE_TESTNET.discountOracleId);
    const market = await client.getContract(SOWEE_TESTNET.invoiceMarket);
    expect(market.contract_id).toBe(SOWEE_TESTNET.invoiceMarketId);
  });

  it("paginates token balances", async () => {
    const seen: string[] = [];
    for await (const balance of client.paginate<
      { balances: { account: string; balance: number }[] },
      { account: string; balance: number }
    >(`tokens/${USDC_TESTNET.tokenId}/balances?limit=2`, (page) => page.balances)) {
      seen.push(balance.account);
      if (seen.length >= 4) break;
    }
    expect(seen.length).toBeGreaterThan(0);
  });
});

if (!reachable) {
  describe("mirror node (live testnet)", () => {
    it.skip("skipped: testnet mirror node unreachable from this environment", () => {});
  });
}
