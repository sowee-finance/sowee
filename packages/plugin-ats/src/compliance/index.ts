import type { Address, Hex } from "viem";
import { encodeFunctionData, zeroAddress } from "viem";
import {
  accessControlFacetAbi,
  controlListFacetAbi,
  erc1594FacetAbi,
  freezeFacetAbi,
  kycFacetAbi,
  pauseFacetAbi,
  ssiManagementFacetAbi,
} from "../abi/facets.js";
import type { PreparedCall } from "../tx.js";

/** Thin typed wrappers around the ATS security diamond's compliance facets.
 * Each returns a PreparedCall targeting the security token (diamond) address. */

export interface GrantKycOptions {
  /** Verifiable credential id. Defaults to "". */
  vcId?: string;
  /** Validity start, unix seconds. Defaults to 0 (immediately valid). */
  validFrom?: bigint;
  /** Validity end, unix seconds. Defaults to uint256 max (never expires). */
  validTo?: bigint;
  /** KYC issuer — must already be on the token's SSI issuer list (`addIssuer`). Required. */
  issuer?: Address;
}

const UINT256_MAX = 2n ** 256n - 1n;

export function grantKyc(
  token: Address,
  account: Address,
  opts: GrantKycOptions = {},
): PreparedCall {
  const issuer = opts.issuer;
  if (issuer === undefined || issuer === zeroAddress) {
    throw new Error(
      "grantKyc requires opts.issuer — an address already on the token's SSI issuer list " +
        "(see addIssuer); the KYC facet reverts on-chain with AccountIsNotIssuer otherwise",
    );
  }
  return {
    to: token,
    data: encodeFunctionData({
      abi: kycFacetAbi,
      functionName: "grantKyc",
      args: [account, opts.vcId ?? "", opts.validFrom ?? 0n, opts.validTo ?? UINT256_MAX, issuer],
    }),
  };
}

export function revokeKyc(token: Address, account: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({ abi: kycFacetAbi, functionName: "revokeKyc", args: [account] }),
  };
}

export function addToControlList(token: Address, account: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: controlListFacetAbi,
      functionName: "addToControlList",
      args: [account],
    }),
  };
}

export function removeFromControlList(token: Address, account: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: controlListFacetAbi,
      functionName: "removeFromControlList",
      args: [account],
    }),
  };
}

/** Grant an AccessControl role (see the ROLE_* constants). Caller needs the role's admin
 * role — DEFAULT_ADMIN_ROLE for all operational roles, held by the bond creator. */
export function grantRole(token: Address, role: Hex, account: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: accessControlFacetAbi,
      functionName: "grantRole",
      args: [role, account],
    }),
  };
}

export function revokeRole(token: Address, role: Hex, account: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: accessControlFacetAbi,
      functionName: "revokeRole",
      args: [role, account],
    }),
  };
}

/** Register a KYC issuer on the token's SSI issuer list. Caller needs ROLE_SSI_MANAGER. */
export function addIssuer(token: Address, issuer: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: ssiManagementFacetAbi,
      functionName: "addIssuer",
      args: [issuer],
    }),
  };
}

export function removeIssuer(token: Address, issuer: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: ssiManagementFacetAbi,
      functionName: "removeIssuer",
      args: [issuer],
    }),
  };
}

/**
 * Mint bond units to a holder via the ERC-1594 mint facet (`issue(address,uint256,bytes)`).
 *
 * @param token The security diamond address.
 * @param to Recipient — must already pass the bond's compliance checks (KYC granted and,
 *   on allowlist bonds, on the control list) or the mint reverts at the token layer.
 * @param amount Units in token base units.
 * @param data Optional ERC-1594 issuance data. Defaults to "0x".
 * @remarks Requires ROLE_ISSUER on the caller.
 */
export function issueUnits(
  token: Address,
  to: Address,
  amount: bigint,
  data: Hex = "0x",
): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: erc1594FacetAbi,
      functionName: "issue",
      args: [to, amount, data],
    }),
  };
}

/** Freeze part of an account's balance (amount in token base units). */
export function freezePartialTokens(
  token: Address,
  account: Address,
  amount: bigint,
): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: freezeFacetAbi,
      functionName: "freezePartialTokens",
      args: [account, amount],
    }),
  };
}

export function unfreezePartialTokens(
  token: Address,
  account: Address,
  amount: bigint,
): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: freezeFacetAbi,
      functionName: "unfreezePartialTokens",
      args: [account, amount],
    }),
  };
}

export function pause(token: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({ abi: pauseFacetAbi, functionName: "pause", args: [] }),
  };
}

export function unpause(token: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({ abi: pauseFacetAbi, functionName: "unpause", args: [] }),
  };
}
