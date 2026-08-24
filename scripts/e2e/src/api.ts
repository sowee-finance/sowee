import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { SOWEE_TESTNET } from "@sowee/core";

/** Local Go API (apps/api) management + typed REST client. */

export const API_PORT = 8091;
export const API_BASE = `http://127.0.0.1:${API_PORT}/v1`;

/**
 * hiero-sdk-go's PrivateKeyFromString parses a RAW 32-byte hex key as Ed25519
 * (any 32 bytes is a valid ed25519 seed), which breaks signing for an ECDSA
 * account. Wrapping the raw key in the standard ECDSA-secp256k1 DER envelope
 * (50 bytes) forces the ECDSA parse path. go-ethereum's HexToECDSA still wants
 * the raw form, so the two env vars get different encodings of the same key.
 */
const ECDSA_DER_PREFIX = "3030020100300706052b8104000a04220420";

const HEX_PREFIX_REGEX = /^0x/;

export function stripHexPrefix(key: string): string {
  return key.replace(HEX_PREFIX_REGEX, "");
}

export function toHieroDerKey(rawHexKey: string): string {
  return ECDSA_DER_PREFIX + stripHexPrefix(rawHexKey);
}

const TOPIC_LOG_REGEX = /"(?:topicId|hcsTopic)":"(0\.0\.\d+)"/;

export interface ApiInvoice {
  id: string;
  invoiceId: `0x${string}`;
  payor: string;
  faceValue: string;
  dueDate: string;
  docHash: string;
}

export interface ApiQuote {
  invoiceId: `0x${string}`;
  faceValue: string;
  discountRateBps: number;
  validUntil: number;
  nonce: number;
  signature: `0x${string}`;
  signer: string;
}

export interface ApiAttestResult {
  mode: string;
  topicId?: string;
  sequenceNumber?: number;
}

interface StartOptions {
  apiDir: string;
  logPath: string;
  operatorId: string;
  /** Raw hex ECDSA key (no 0x needed); encodings are derived here. */
  walletKey: string;
  topicId?: string | undefined;
  onTopicId: (topicId: string) => void;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? "GET"} ${url} -> ${res.status}: ${body}`);
  }
  return JSON.parse(body) as T;
}

export function postJson<T>(path: string, payload: unknown): Promise<T> {
  return fetchJson<T>(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(`${API_BASE}${path}`);
}

export async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

function scanForTopicId(chunk: string, onTopicId: (topicId: string) => void): void {
  const match = TOPIC_LOG_REGEX.exec(chunk);
  const topicId = match?.[1];
  if (topicId && topicId !== "") {
    onTopicId(topicId);
  }
}

/**
 * Spawn `go run ./cmd/api` with the demo environment, tee its output to
 * api.log while watching for the HCS topic id, and wait for /healthz.
 * The child is killed when this process exits.
 */
export async function startApi(opts: StartOptions): Promise<ChildProcess> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(API_PORT),
    QUOTE_SIGNER_PRIVATE_KEY: stripHexPrefix(opts.walletKey),
    QUOTE_VERIFYING_CONTRACT: SOWEE_TESTNET.discountOracle,
    HEDERA_NETWORK: "testnet",
    HEDERA_OPERATOR_ID: opts.operatorId,
    HEDERA_OPERATOR_KEY: toHieroDerKey(opts.walletKey),
  };
  if (opts.topicId) {
    env.HCS_TOPIC_ID = opts.topicId;
  }

  const child = spawn("go", ["run", "./cmd/api"], { cwd: opts.apiDir, env });
  const log = createWriteStream(opts.logPath, { flags: "a" });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      log.write(text);
      scanForTopicId(text, opts.onTopicId);
    });
  }
  process.once("exit", () => child.kill("SIGTERM"));

  // First `go run` may compile for a while; poll health for up to 2 minutes.
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Go API exited with code ${child.exitCode}; see ${opts.logPath}`);
    }
    if (await isHealthy()) {
      return child;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Go API did not become healthy on port ${API_PORT}; see ${opts.logPath}`);
}
