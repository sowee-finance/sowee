import { readFileSync, renameSync, writeFileSync } from "node:fs";
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

export function loadState<T extends object>(path: string): Partial<T> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {}; // no checkpoint yet — a legitimate fresh start
    }
    throw error;
  }
  try {
    return JSON.parse(raw) as Partial<T>;
  } catch {
    // A torn or corrupted checkpoint must never read as a fresh start: the
    // pipeline would re-deploy a ~7M-gas bond and re-deposit real USDC while
    // orphaning the half-finished one. A human decides what to salvage.
    throw new Error(
      `${path} exists but is not valid JSON — refusing to restart the paid pipeline. ` +
        "Inspect or delete the file, then re-run.",
    );
  }
}

export function saveState(path: string, state: object): void {
  // Temp-file + rename: a crash mid-write can drop the newest checkpoint but
  // can never tear the file into invalid JSON.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}
