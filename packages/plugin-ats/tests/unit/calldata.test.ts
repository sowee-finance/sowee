import type { Address, Hex } from "viem";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  ATS_FACTORY_TESTNET,
  addIssuer,
  addToControlList,
  buildCreateInvoiceBondCall,
  buildDeployBondArgs,
  type CreateInvoiceBondParams,
  controllerTransfer,
  factoryAbi,
  forcedTransfer,
  freezePartialTokens,
  grantKyc,
  grantRole,
  issueUnits,
  pause,
  ROLE_KYC,
  redeemAtMaturity,
  removeFromControlList,
  removeIssuer,
  revokeKyc,
  revokeRole,
  takeSnapshot,
  unfreezePartialTokens,
  unpause,
} from "../../src/index.js";
import golden from "./fixtures/calldata-golden.json";

/** Fixed inputs — the exact encoded calldata for these is committed in calldata-golden.json. */
const token = "0x00000000000000000000000000000000000abcde" as Address;
const alice = "0x00000000000000000000000000000000000a11ce" as Address;
const bob = "0x0000000000000000000000000000000000000b0b" as Address;

const bondParams: CreateInvoiceBondParams = {
  invoiceId: `0x${"ab".repeat(32)}` as Hex,
  faceValue: 50_000_000_000n, // 50,000 USDC
  maturityDate: 1_790_000_000n,
  startingDate: 1_756_000_000n,
  admin: alice,
};

describe("calldata golden fixtures", () => {
  const calls: Record<string, { to: Address; data: Hex }> = {
    deployBond: buildCreateInvoiceBondCall(bondParams),
    grantKyc: grantKyc(token, alice, { issuer: bob }),
    revokeKyc: revokeKyc(token, alice),
    addToControlList: addToControlList(token, alice),
    removeFromControlList: removeFromControlList(token, alice),
    grantRole: grantRole(token, ROLE_KYC, alice),
    revokeRole: revokeRole(token, ROLE_KYC, alice),
    addIssuer: addIssuer(token, alice),
    removeIssuer: removeIssuer(token, alice),
    issueUnits: issueUnits(token, alice, 10n),
    freezePartialTokens: freezePartialTokens(token, alice, 1_000_000n),
    unfreezePartialTokens: unfreezePartialTokens(token, alice, 1_000_000n),
    pause: pause(token),
    unpause: unpause(token),
    takeSnapshot: takeSnapshot(token),
    redeemAtMaturity: redeemAtMaturity(token, { tokenHolder: alice, amount: 5n }),
    controllerTransfer: controllerTransfer(token, { from: alice, to: bob, amount: 7n }),
    forcedTransfer: forcedTransfer(token, alice, bob, 7n),
  };

  for (const [name, expected] of Object.entries(golden as Record<string, string>)) {
    it(`${name} encodes to the committed calldata exactly`, () => {
      expect(calls[name]?.data).toBe(expected);
    });
  }

  it("covers every builder with a fixture", () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(calls).sort());
  });
});

describe("buildDeployBondArgs semantics", () => {
  const [bondData, regulationData] = buildDeployBondArgs(bondParams);

  it("targets the testnet factory by default", () => {
    expect(buildCreateInvoiceBondCall(bondParams).to).toBe(ATS_FACTORY_TESTNET);
  });

  it("derives maxSupply, name and symbol from the invoice", () => {
    expect(bondData.security.maxSupply).toBe(50_000n); // faceValue / 1 USDC nominal
    expect(bondData.security.erc20MetadataInfo.name).toBe("Sowee Invoice Bond ABABABAB");
    expect(bondData.security.erc20MetadataInfo.symbol).toBe("INV-ABABAB");
    expect(bondData.security.erc20MetadataInfo.decimals).toBe(6);
  });

  it("turns the allowlist, internal KYC and controllability on", () => {
    expect(bondData.security.isWhiteList).toBe(true);
    expect(bondData.security.internalKycActivated).toBe(true);
    expect(bondData.security.isControllable).toBe(true);
    expect(bondData.security.isMultiPartition).toBe(false);
  });

  it("sets zero-coupon bond details with USD currency", () => {
    expect(bondData.bondDetails.currency).toBe("0x555344");
    expect(bondData.bondDetails.nominalValue).toBe(1_000_000n);
    expect(bondData.bondDetails.startingDate).toBe(1_756_000_000n);
    expect(bondData.bondDetails.maturityDate).toBe(1_790_000_000n);
    expect(regulationData.regulationType).toBe(1); // REG_S
  });

  it("round-trips through the real v8 ABI", () => {
    const call = buildCreateInvoiceBondCall(bondParams);
    const decoded = decodeFunctionData({ abi: factoryAbi, data: call.data });
    expect(decoded.functionName).toBe("deployBond");
    expect(decoded.args[0].security.rbacs[0]?.members.map((m) => m.toLowerCase())).toEqual([alice]);
  });

  it("defaults to a derived checksum-valid ISIN and honors explicit overrides", () => {
    expect(bondData.security.erc20MetadataInfo.isin).toBe("SWCRT7U2VND4");
    const [overridden] = buildDeployBondArgs({ ...bondParams, isin: "SW0WEE000004" });
    expect(overridden.security.erc20MetadataInfo.isin).toBe("SW0WEE000004");
  });

  it("rejects dust, inverted dates and invalid ISINs", () => {
    expect(() => buildDeployBondArgs({ ...bondParams, faceValue: 1_000_001n })).toThrow(
      /divisible/,
    );
    expect(() => buildDeployBondArgs({ ...bondParams, maturityDate: 1n })).toThrow(/maturity/);
    expect(() => buildDeployBondArgs({ ...bondParams, faceValue: 0n })).toThrow(/positive/);
    expect(() => buildDeployBondArgs({ ...bondParams, isin: "" })).toThrow(/ISIN/);
    expect(() => buildDeployBondArgs({ ...bondParams, isin: "SW0WEE000005" })).toThrow(/ISIN/);
  });
});
