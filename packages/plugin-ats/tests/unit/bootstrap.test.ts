import { SOWEE_TESTNET } from "@sowee/core";
import { describe, expect, it } from "vitest";
import { addToControlList, bootstrapCompliance, grantKyc } from "../../src/index.js";

const TOKEN = "0x00000000000000000000000000000000000abcde" as const;
const ISSUER = "0x1111111111111111111111111111111111111111" as const;
const INVESTOR = "0x2222222222222222222222222222222222222222" as const;

describe("bootstrapCompliance", () => {
  it("grants KYC and control-list entries to protocol contracts and participants", () => {
    const calls = bootstrapCompliance(TOKEN, { issuer: ISSUER, investors: [INVESTOR] });

    const participants = [
      SOWEE_TESTNET.invoiceMarket,
      SOWEE_TESTNET.maturitySettlement,
      ISSUER,
      INVESTOR,
    ];
    expect(calls).toHaveLength(participants.length * 2);
    expect(calls.map((c) => c.data)).toEqual([
      ...participants.map((a) => grantKyc(TOKEN, a).data),
      ...participants.map((a) => addToControlList(TOKEN, a).data),
    ]);
    for (const call of calls) expect(call.to).toBe(TOKEN);
  });

  it("skips control-list updates when disabled and honors overrides", () => {
    const market = "0x3333333333333333333333333333333333333333" as const;
    const calls = bootstrapCompliance(TOKEN, {
      issuer: ISSUER,
      market,
      settlement: market,
      updateControlList: false,
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.data).toBe(grantKyc(TOKEN, market).data);
    expect(calls[2]?.data).toBe(grantKyc(TOKEN, ISSUER).data);
  });
});
