import { SOWEE_TESTNET } from "@sowee/core";
import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  addIssuer,
  addToControlList,
  bootstrapCompliance,
  grantKyc,
  grantRole,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ROLE_KYC,
  ROLE_SSI_MANAGER,
} from "../../src/index.js";

const TOKEN = "0x00000000000000000000000000000000000abcde" as const;
const ISSUER = "0x1111111111111111111111111111111111111111" as const;
const INVESTOR = "0x2222222222222222222222222222222222222222" as const;
const ADMIN = "0x4444444444444444444444444444444444444444" as const;

describe("grantKyc", () => {
  it("fails fast off-chain when the KYC issuer is missing or the zero address", () => {
    expect(() => grantKyc(TOKEN, ISSUER)).toThrow(/AccountIsNotIssuer/);
    expect(() => grantKyc(TOKEN, ISSUER, { issuer: zeroAddress })).toThrow(/AccountIsNotIssuer/);
  });
});

describe("bootstrapCompliance", () => {
  it("grants KYC and control-list entries to protocol contracts and participants", () => {
    const calls = bootstrapCompliance(TOKEN, {
      issuer: ISSUER,
      investors: [INVESTOR],
      kyc: { issuer: ADMIN },
    });

    const participants = [
      SOWEE_TESTNET.invoiceMarket,
      SOWEE_TESTNET.maturitySettlement,
      ISSUER,
      INVESTOR,
    ];
    expect(calls).toHaveLength(participants.length * 2);
    expect(calls.map((c) => c.data)).toEqual([
      ...participants.map((a) => grantKyc(TOKEN, a, { issuer: ADMIN }).data),
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
      kyc: { issuer: ADMIN },
      updateControlList: false,
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.data).toBe(grantKyc(TOKEN, market, { issuer: ADMIN }).data);
    expect(calls[2]?.data).toBe(grantKyc(TOKEN, ISSUER, { issuer: ADMIN }).data);
  });

  it("throws off-chain when no KYC issuer is provided and selfSetup is absent", () => {
    expect(() => bootstrapCompliance(TOKEN, { issuer: ISSUER })).toThrow(/issuer/);
  });

  it("selfSetup prepends role grants + addIssuer and defaults the KYC issuer to admin", () => {
    const calls = bootstrapCompliance(TOKEN, { issuer: ISSUER, selfSetup: { admin: ADMIN } });

    const participants = [SOWEE_TESTNET.invoiceMarket, SOWEE_TESTNET.maturitySettlement, ISSUER];
    // The e2e-proven fresh-bond ordering: roles, SSI issuer, KYC, control list.
    expect(calls.map((c) => c.data)).toEqual([
      grantRole(TOKEN, ROLE_SSI_MANAGER, ADMIN).data,
      grantRole(TOKEN, ROLE_KYC, ADMIN).data,
      grantRole(TOKEN, ROLE_CONTROL_LIST, ADMIN).data,
      grantRole(TOKEN, ROLE_ISSUER, ADMIN).data,
      addIssuer(TOKEN, ADMIN).data,
      ...participants.map((a) => grantKyc(TOKEN, a, { issuer: ADMIN }).data),
      ...participants.map((a) => addToControlList(TOKEN, a).data),
    ]);
    for (const call of calls) expect(call.to).toBe(TOKEN);
  });

  it("selfSetup keeps an explicitly provided KYC issuer", () => {
    const calls = bootstrapCompliance(TOKEN, {
      issuer: ISSUER,
      kyc: { issuer: INVESTOR },
      selfSetup: { admin: ADMIN },
      updateControlList: false,
    });
    expect(calls[5]?.data).toBe(
      grantKyc(TOKEN, SOWEE_TESTNET.invoiceMarket, { issuer: INVESTOR }).data,
    );
  });
});
