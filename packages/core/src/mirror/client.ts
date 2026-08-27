import { Buffer } from "node:buffer";
import type { Hex } from "viem";
import { HEDERA_TESTNET } from "../constants.js";

const TRAILING_SLASH_REGEX = /\/$/;

/** Narrow Mirror Node response types — only the fields Sowee uses. */

export interface MirrorAccount {
  account: string;
  evm_address: string;
  balance: { balance: number; timestamp: string } | null;
}

export interface MirrorTokenInfo {
  token_id: string;
  name: string;
  symbol: string;
  decimals: string;
  total_supply: string;
  type: string;
  treasury_account_id: string | null;
}

export interface MirrorTokenBalance {
  account: string;
  balance: number;
}

export interface MirrorContract {
  contract_id: string;
  evm_address: string;
  created_timestamp: string | null;
  deleted: boolean;
  runtime_bytecode: string | null;
}

export interface MirrorContractResult {
  contract_id: string | null;
  from: string;
  to: string | null;
  result: string;
  timestamp: string;
  hash: string;
}

export interface MirrorContractLog {
  address: string;
  contract_id: string | null;
  data: string | null;
  topics: string[];
  timestamp: string;
}

export interface MirrorTopicMessage {
  consensus_timestamp: string;
  sequence_number: number;
  topic_id: string;
  /** UTF-8 decoded message payload (Mirror Node returns base64). */
  message: string;
}

interface Paged {
  links?: { next: string | null };
}

export class MirrorNodeError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    detail?: string,
  ) {
    super(`Mirror Node request failed: ${status} ${url}${detail ? ` — ${detail}` : ""}`);
    this.name = "MirrorNodeError";
  }
}

/** Best-effort message out of a mirror error body (shape: {_status:{messages:[{message}]}} or {message}). */
async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as {
      _status?: { messages?: { message?: string }[] };
      message?: string;
    };
    return body._status?.messages?.[0]?.message ?? body.message;
  } catch {
    return undefined;
  }
}

export interface MirrorNodeClientOptions {
  /** REST base URL including /api/v1. Defaults to Hedera testnet. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Per-request timeout in ms; a hung connection must not stall callers. Default 15000. */
  timeoutMs?: number;
}

/** Minimal typed Hedera Mirror Node REST client (native fetch, read-only). */
export class MirrorNodeClient {
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MirrorNodeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? HEDERA_TESTNET.mirrorNodeUrl).replace(
      TRAILING_SLASH_REGEX,
      "",
    );
    this.origin = new URL(this.baseUrl).origin;
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** GET a path relative to the base URL, or an absolute `/api/v1/...` path (pagination links). */
  async get<T>(path: string): Promise<T> {
    const url = path.startsWith("/") ? `${this.origin}${path}` : `${this.baseUrl}/${path}`;
    const res = await this.fetchFn(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new MirrorNodeError(res.status, url, await errorDetail(res));
    }
    return (await res.json()) as T;
  }

  /** Iterate items across pages by following `links.next`. */
  async *paginate<P, T>(firstPath: string, items: (page: P) => T[]): AsyncGenerator<T> {
    let path: string | null = firstPath;
    while (path) {
      const page: P & Paged = await this.get<P & Paged>(path);
      yield* items(page);
      path = page.links?.next ?? null;
    }
  }

  /** Account by id (`0.0.x`), EVM address, or alias. */
  getAccount(idOrAddress: string): Promise<MirrorAccount> {
    return this.get(`accounts/${idOrAddress}`);
  }

  /** HTS token info by token id (`0.0.x`). */
  getTokenInfo(tokenId: string): Promise<MirrorTokenInfo> {
    return this.get(`tokens/${tokenId}`);
  }

  /** Balances of an HTS token (first page; use `paginate` for all holders). */
  async getTokenBalances(tokenId: string, params?: { accountId?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.accountId) query.set("account.id", params.accountId);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.size > 0 ? `?${query}` : "";
    const page = await this.get<Paged & { balances: MirrorTokenBalance[] }>(
      `tokens/${tokenId}/balances${qs}`,
    );
    return page.balances;
  }

  /** Contract entity (existence, EVM address, runtime bytecode). */
  getContract(idOrAddress: string): Promise<MirrorContract> {
    return this.get(`contracts/${idOrAddress}`);
  }

  /** Recent execution results for a contract (first page). */
  async getContractResults(idOrAddress: string, params?: { limit?: number }) {
    const qs = params?.limit ? `?limit=${params.limit}` : "";
    const page = await this.get<Paged & { results: MirrorContractResult[] }>(
      `contracts/${idOrAddress}/results${qs}`,
    );
    return page.results;
  }

  /** Recent EVM logs emitted by a contract (first page). */
  async getContractLogs(idOrAddress: string, params?: { topic0?: Hex; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.topic0) query.set("topic0", params.topic0);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.size > 0 ? `?${query}` : "";
    const page = await this.get<Paged & { logs: MirrorContractLog[] }>(
      `contracts/${idOrAddress}/results/logs${qs}`,
    );
    return page.logs;
  }

  /** HCS topic messages with the payload base64-decoded to UTF-8 (first page). */
  async getTopicMessages(topicId: string, params?: { limit?: number; order?: "asc" | "desc" }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.order) query.set("order", params.order);
    const qs = query.size > 0 ? `?${query}` : "";
    const page = await this.get<Paged & { messages: MirrorTopicMessage[] }>(
      `topics/${topicId}/messages${qs}`,
    );
    return page.messages.map((m) => ({
      ...m,
      message: Buffer.from(m.message, "base64").toString("utf8"),
    }));
  }

  /** Read-only eth_call via the Mirror Node (`/contracts/call`). Returns the raw return data. */
  async contractCall(params: { to: Hex; data: Hex; from?: Hex }): Promise<Hex> {
    const url = `${this.baseUrl}/contracts/call`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...params, estimate: false }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      // The revert reason lives in the error body — surface it, not just the status.
      throw new MirrorNodeError(res.status, url, await errorDetail(res));
    }
    let body: { result?: unknown };
    try {
      body = (await res.json()) as { result?: unknown };
    } catch {
      throw new MirrorNodeError(res.status, url, "response body is not JSON");
    }
    if (typeof body.result !== "string" || !body.result.startsWith("0x")) {
      throw new MirrorNodeError(res.status, url, "response has no hex result field");
    }
    return body.result as Hex;
  }
}
