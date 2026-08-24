import type { Address } from "viem";
import { encodeFunctionData, zeroAddress } from "viem";
import { controlListFacetAbi, freezeFacetAbi, kycFacetAbi, pauseFacetAbi } from "../abi/facets.js";
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
  /** KYC issuer address. Defaults to the zero address. */
  issuer?: Address;
}

const UINT256_MAX = 2n ** 256n - 1n;

export function grantKyc(
  token: Address,
  account: Address,
  opts: GrantKycOptions = {},
): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: kycFacetAbi,
      functionName: "grantKyc",
      args: [
        account,
        opts.vcId ?? "",
        opts.validFrom ?? 0n,
        opts.validTo ?? UINT256_MAX,
        opts.issuer ?? zeroAddress,
      ],
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
