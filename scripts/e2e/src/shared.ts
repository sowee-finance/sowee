import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEDERA_TESTNET, MirrorNodeClient, SOWEE_TESTNET } from "@sowee/core";
import {
  addIssuer,
  atsViewsAbi,
  bootstrapCompliance,
  factoryAbi,
  grantRole,
  issueUnits,
  type PreparedCall,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ROLE_KYC,
  ROLE_SSI_MANAGER,
} from "@sowee/plugin-ats";
import {
  type Address,
  BaseError,
  createPublicClient,
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { stripHexPrefix } from "./api.js";

/**
 * Chain-facing helpers shared by the e2e demo (demo.ts) and the market seeder
 * (seed.ts). Extracted verbatim from the proven demo pipeline.
 */

/** Clean early exit (checkpoint saved); not an error. */
export class Halt extends Error {}

/** Hedera per-transaction gas ceiling. */
export const MAX_GAS = 15_000_000n;

const ENV_LINE_REGEX = /^([A-Z0-9_]+)=(.*)$/;

export function readEnvKey(rootDir: string, name: string): string | undefined {
  const envPath = join(rootDir, ".env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = ENV_LINE_REGEX.exec(line.trim());
    if (match?.[1] === name && match[2]) {
      const value = cleanEnvValue(match[2]);
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}

/** Dotenv conventions: matched surrounding quotes come off; an unquoted
    trailing `# comment` is not part of the value. */
function cleanEnvValue(raw: string): string {
  let value = raw.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  const hash = value.indexOf(" #");
  if (hash !== -1) {
    value = value.slice(0, hash).trim();
  }
  return value;
}

export function readWalletPk(rootDir: string): string {
  const pk = readEnvKey(rootDir, "WALLET_PK");
  if (!pk) {
    throw new Error(`WALLET_PK not found in ${join(rootDir, ".env")}`);
  }
  return pk;
}

/** Wallet + clients shared by every script; demo.ts layers its resume state on top. */
export function createChainCtx(walletPk: string) {
  const account = privateKeyToAccount(`0x${stripHexPrefix(walletPk)}`);
  const transport = http(HEDERA_TESTNET.rpcUrl);
  const pub = createPublicClient({ chain: hederaTestnet, transport });
  const wallet = createWalletClient({ account, chain: hederaTestnet, transport });
  const mirror = new MirrorNodeClient();
  return { walletPk, account, pub, wallet, mirror };
}

export type ChainCtx = ReturnType<typeof createChainCtx>;

// ------------------------------------------------------------------ helpers

export const txLink = (hash: Hex): string => `${HEDERA_TESTNET.explorerUrl}/transaction/${hash}`;
export const contractLink = (address: string): string =>
  `${HEDERA_TESTNET.explorerUrl}/contract/${address}`;
export const topicLink = (topicId: string): string =>
  `${HEDERA_TESTNET.explorerUrl}/topic/${topicId}`;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function shortError(err: unknown): string {
  if (err instanceof BaseError) {
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

export async function estimateGas(
  cx: ChainCtx,
  call: PreparedCall,
  value?: bigint,
): Promise<bigint> {
  const estimated = await cx.pub.estimateGas({
    account: cx.account,
    to: call.to,
    data: call.data,
    ...(value !== undefined ? { value } : {}),
  });
  const padded = (estimated * 120n) / 100n;
  return padded > MAX_GAS ? MAX_GAS : padded;
}

export interface SendOptions {
  value?: bigint;
  gas?: bigint;
}

/** Send a prepared call, wait for the receipt, and print a HashScan link. */
export async function send(
  cx: ChainCtx,
  label: string,
  call: PreparedCall,
  opts: SendOptions = {},
): Promise<Hex> {
  const gas = opts.gas ?? (await estimateGas(cx, call, opts.value));
  const hash = await cx.wallet.sendTransaction({
    to: call.to,
    data: call.data,
    gas,
    ...(opts.value !== undefined ? { value: opts.value } : {}),
  });
  const receipt = await cx.pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted — ${txLink(hash)}`);
  }
  console.info(`  ok ${label}`);
  console.info(`     ${txLink(hash)}`);
  return hash;
}

export function erc20Call(
  token: Address,
  functionName: "approve",
  args: readonly [Address, bigint],
): PreparedCall {
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName, args }) };
}

export async function erc20BalanceOf(
  cx: ChainCtx,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return await cx.pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export async function ensureAllowance(
  cx: ChainCtx,
  token: Address,
  spender: Address,
  amount: bigint,
  label: string,
): Promise<void> {
  const allowance = await cx.pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [cx.account.address, spender],
  });
  if (allowance >= amount) {
    console.info(`  ok ${label} allowance already in place`);
    return;
  }
  await send(cx, `approve ${label}`, erc20Call(token, "approve", [spender, amount]));
}

/** The factory returns the new diamond address; read it from the mirror node's call_result. */
export async function fetchDeployedBond(cx: ChainCtx, hash: Hex): Promise<Address> {
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try {
      const result = await cx.mirror.get<{ call_result?: string }>(`contracts/results/${hash}`);
      if (result.call_result && result.call_result !== "0x") {
        const bond = decodeFunctionResult({
          abi: factoryAbi,
          functionName: "deployBond",
          data: result.call_result as Hex,
        });
        return getAddress(bond);
      }
    } catch {
      // mirror node lag — keep polling
    }
  }
  throw new Error(`could not read deployBond result from mirror node for ${hash}`);
}

// --------------------------------------------------------------- compliance

const SELF_ROLES = [
  { role: ROLE_SSI_MANAGER, label: "SSI manager" },
  { role: ROLE_KYC, label: "KYC" },
  { role: ROLE_CONTROL_LIST, label: "control list" },
  { role: ROLE_ISSUER, label: "issuer" },
] as const;

export async function ensureRoles(cx: ChainCtx, bond: Address): Promise<void> {
  for (const { role, label } of SELF_ROLES) {
    const has = await cx.pub.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "hasRole",
      args: [role, cx.account.address],
    });
    if (has) {
      console.info(`  ok ${label} role already granted`);
      continue;
    }
    await send(cx, `grant ${label} role to deployer`, grantRole(bond, role, cx.account.address));
  }
}

/** grantKyc requires the KYC issuer to be on the bond's SSI issuer list (zero address is rejected). */
export async function ensureSsiIssuer(cx: ChainCtx, bond: Address): Promise<void> {
  const listed = await cx.pub.readContract({
    address: bond,
    abi: atsViewsAbi,
    functionName: "isIssuer",
    args: [cx.account.address],
  });
  if (listed) {
    console.info("  ok deployer already on SSI issuer list");
    return;
  }
  await send(cx, "add deployer to SSI issuer list", addIssuer(bond, cx.account.address));
}

function needCall(calls: readonly PreparedCall[], i: number): PreparedCall {
  const call = calls[i];
  if (call === undefined) {
    throw new Error(`bootstrapCompliance produced no call at index ${i}`);
  }
  return call;
}

export async function ensureParticipantCompliance(
  cx: ChainCtx,
  bond: Address,
  extraParticipants: Address[] = [],
): Promise<void> {
  const participants: Address[] = [
    SOWEE_TESTNET.invoiceMarket,
    SOWEE_TESTNET.maturitySettlement,
    cx.account.address,
    ...extraParticipants,
  ];
  // Calls come back in a documented order: grantKyc per participant, then
  // addToControlList per participant — index into them to skip what's done.
  const calls = bootstrapCompliance(bond, {
    issuer: cx.account.address,
    investors: extraParticipants,
    kyc: { issuer: cx.account.address },
  });
  for (const [i, participant] of participants.entries()) {
    const status = await cx.pub.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "getKycStatusFor",
      args: [participant],
    });
    if (status !== 0) {
      console.info(`  ok KYC already granted for ${participant}`);
      continue;
    }
    await send(cx, `grant KYC to ${participant}`, needCall(calls, i));
  }
  for (const [i, participant] of participants.entries()) {
    const listed = await cx.pub.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "isInControlList",
      args: [participant],
    });
    if (listed) {
      console.info(`  ok control list already contains ${participant}`);
      continue;
    }
    await send(cx, `add ${participant} to control list`, needCall(calls, participants.length + i));
  }
}

export async function ensureUnitsIssued(cx: ChainCtx, bond: Address, units: bigint): Promise<void> {
  const supply = await cx.pub.readContract({
    address: bond,
    abi: erc20Abi,
    functionName: "totalSupply",
  });
  if (supply >= units) {
    console.info(`  ok ${supply} bond units already issued`);
    return;
  }
  await send(
    cx,
    `issue ${units} bond units to deployer`,
    issueUnits(bond, cx.account.address, units - supply),
  );
}
