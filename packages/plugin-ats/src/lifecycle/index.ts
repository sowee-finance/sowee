import type { MirrorNodeClient } from "@sowee/core";
import type { Address, Hex } from "viem";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import {
  balanceTrackerAtSnapshotFacetAbi,
  controllerFacetAbi,
  maturityFacetAbi,
  snapshotsFacetAbi,
} from "../abi/facets.js";
import { DEFAULT_PARTITION } from "../constants.js";
import type { PreparedCall } from "../tx.js";

/** Lifecycle wrappers for the ATS security diamond: snapshots, redemption, controller ops. */

export function takeSnapshot(token: Address): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({ abi: snapshotsFacetAbi, functionName: "takeSnapshot", args: [] }),
  };
}

export interface RedeemAtMaturityOptions {
  /** Holder whose bonds are redeemed. */
  tokenHolder: Address;
  /** Amount in token base units. */
  amount: bigint;
  /** ERC-1410 partition. Defaults to the ATS default partition. */
  partition?: Hex;
}

/** Redeem matured bonds for a holder (requires maturity reached on-chain). */
export function redeemAtMaturity(token: Address, opts: RedeemAtMaturityOptions): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: maturityFacetAbi,
      functionName: "redeemAtMaturityByPartition",
      args: [opts.tokenHolder, opts.partition ?? DEFAULT_PARTITION, opts.amount],
    }),
  };
}

export interface ControllerTransferOptions {
  from: Address;
  to: Address;
  amount: bigint;
  data?: Hex;
  operatorData?: Hex;
}

/** ERC-1644 controller (forced) transfer with operator data. */
export function controllerTransfer(token: Address, opts: ControllerTransferOptions): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: controllerFacetAbi,
      functionName: "controllerTransfer",
      args: [opts.from, opts.to, opts.amount, opts.data ?? "0x", opts.operatorData ?? "0x"],
    }),
  };
}

export interface ControllerRedeemOptions {
  tokenHolder: Address;
  amount: bigint;
  data?: Hex;
  operatorData?: Hex;
}

/** ERC-1644 controller (forced) redemption. */
export function controllerRedeem(token: Address, opts: ControllerRedeemOptions): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: controllerFacetAbi,
      functionName: "controllerRedeem",
      args: [opts.tokenHolder, opts.amount, opts.data ?? "0x", opts.operatorData ?? "0x"],
    }),
  };
}

/** ERC-3643-style forced transfer (agent role). */
export function forcedTransfer(
  token: Address,
  from: Address,
  to: Address,
  amount: bigint,
): PreparedCall {
  return {
    to: token,
    data: encodeFunctionData({
      abi: controllerFacetAbi,
      functionName: "forcedTransfer",
      args: [from, to, amount],
    }),
  };
}

/** Read a holder's balance at a snapshot via the mirror node (free, read-only). */
export async function balanceOfAtSnapshot(
  mirror: MirrorNodeClient,
  token: Address,
  snapshotId: bigint,
  account: Address,
): Promise<bigint> {
  const result = await mirror.contractCall({
    to: token,
    data: encodeFunctionData({
      abi: balanceTrackerAtSnapshotFacetAbi,
      functionName: "balanceOfAtSnapshot",
      args: [snapshotId, account],
    }),
  });
  return decodeFunctionResult({
    abi: balanceTrackerAtSnapshotFacetAbi,
    functionName: "balanceOfAtSnapshot",
    data: result,
  });
}

/** Read total supply at a snapshot via the mirror node (free, read-only). */
export async function totalSupplyAtSnapshot(
  mirror: MirrorNodeClient,
  token: Address,
  snapshotId: bigint,
): Promise<bigint> {
  const result = await mirror.contractCall({
    to: token,
    data: encodeFunctionData({
      abi: balanceTrackerAtSnapshotFacetAbi,
      functionName: "totalSupplyAtSnapshot",
      args: [snapshotId],
    }),
  });
  return decodeFunctionResult({
    abi: balanceTrackerAtSnapshotFacetAbi,
    functionName: "totalSupplyAtSnapshot",
    data: result,
  });
}
