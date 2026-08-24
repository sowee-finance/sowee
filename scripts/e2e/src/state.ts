import { readFileSync, writeFileSync } from "node:fs";
import type { Address, Hex } from "viem";

/**
 * Resume checkpoints for the demo, persisted to scripts/e2e/state.json (gitignored).
 * Every field is optional: a re-run resumes at the first missing checkpoint.
 * BigInts are stored as decimal strings.
 */
export interface DemoState {
  /** Deployer associated to USDC (HIP-719). */
  associated?: boolean;
  associateTx?: Hex;
  /** HCS topic created by the Go API; pinned across restarts via HCS_TOPIC_ID. */
  topicId?: string;
  /** API-assigned invoice UUID (the REST resource id). */
  invoiceUuid?: string;
  /** On-chain bytes32 invoice id (keccak256 of the UUID, derived by the API). */
  invoiceId?: Hex;
  /** Invoice maturity, unix seconds. */
  maturity?: number;
  bondAddress?: Address;
  bondTx?: Hex;
  /** Compliance + mint fully bootstrapped on the bond. */
  complianceDone?: boolean;
  listTx?: Hex;
  pricePerUnit?: string;
  buyTx?: Hex;
  attested?: boolean;
  registerTx?: Hex;
  depositTx?: Hex;
  scheduleTx?: Hex;
  /** Set when HSS scheduling failed and the demo fell back to manual settle(). */
  scheduleFallback?: boolean;
  settleTx?: Hex;
  claimTx?: Hex;
}

export function loadState(path: string): DemoState {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DemoState;
  } catch {
    return {};
  }
}

export function saveState(path: string, state: DemoState): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
