import { type Hex, isHex, keccak256, toBytes } from "viem"
import { hederaTestnet } from "viem/chains"
import { activeChain } from "./chains"

// Reader for the audit trail the API anchors on a Hedera Consensus Service topic
// (apps/api README, "Audit trail (HCS)"). Public mirror node, no key needed.

export const topicId = process.env.NEXT_PUBLIC_HCS_TOPIC_ID ?? "0.0.10388277"
export const topicUrl = `https://hashscan.io/testnet/topic/${topicId}`
const mirrorOrigin = "https://testnet.mirrornode.hedera.com"
const messagesUrl = `${mirrorOrigin}/api/v1/topics/${topicId}/messages?order=desc&limit=100`

/** The topic lives on Hedera testnet; on any other active chain there is nothing to read. */
export const hcsAvailable = activeChain.id === hederaTestnet.id

export type Attestation = {
  type: "attestation.v1"
  /** The human reference (`INV-2026-001`) or, if the issuer sent one, the bytes32 id. */
  invoiceId: string
  docHash: string
  event: string
  timestamp: string
  /** The issuer's own mark, a small square data URI, if they attached one when issuing. */
  logo?: string
}

export type Receipt = {
  type: "x402.receipt.v1"
  endpoint: string
  payer: string
  amount: string
  asset: string
  settlementTx: string
  timestamp: string
}

export type TopicMessage = {
  sequenceNumber: number
  /** Consensus timestamp, unix milliseconds. */
  consensusAt: number
  body: Attestation | Receipt | { type: string }
}

type WireMessage = {
  sequence_number: number
  consensus_timestamp: string
  message: string
  /** Present when a submission was split; absent or `total: 1` for a whole one. */
  chunk_info?: {
    initial_transaction_id?: {
      account_id?: string
      transaction_valid_start?: string
      nonce?: number
    }
    number: number
    total: number
  } | null
}

type Wire = {
  messages: WireMessage[]
  links?: { next?: string | null }
}

const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/**
 * A submission over 1 KB is split across several consensus messages, so a message is a slice of
 * bytes rather than a record — a logo makes three of them. Joins the slices of each submission
 * back together, keyed by the transaction that started it, and drops any set the mirror node has
 * not finished serving.
 */
export function joinChunks(messages: WireMessage[]): WireMessage[] {
  const whole: WireMessage[] = []
  const parts = new Map<string, { head: WireMessage; slices: (Uint8Array | undefined)[] }>()
  for (const m of messages) {
    const c = m.chunk_info
    if (!c || c.total <= 1) {
      whole.push(m)
      continue
    }
    const t = c.initial_transaction_id
    const key = `${t?.account_id}@${t?.transaction_valid_start}/${t?.nonce ?? 0}`
    let entry = parts.get(key)
    if (!entry) {
      // Filled, not sparse: `some` skips the holes of `new Array(n)`, so an incomplete
      // submission would look complete.
      entry = { head: m, slices: new Array(c.total).fill(undefined) }
      parts.set(key, entry)
    }
    // The first chunk carries the sequence number and timestamp the trail is ordered by.
    if (c.number === 1) entry.head = m
    entry.slices[c.number - 1] = bytesOf(m.message)
  }
  for (const { head, slices } of parts.values()) {
    if (slices.some((s) => s === undefined)) continue
    const size = slices.reduce((n, s) => n + (s?.length ?? 0), 0)
    const joined = new Uint8Array(size)
    let at = 0
    for (const s of slices) {
      if (s) {
        joined.set(s, at)
        at += s.length
      }
    }
    let binary = ""
    for (const byte of joined) binary += String.fromCharCode(byte)
    whole.push({ ...head, message: btoa(binary) })
  }
  return whole
}

/** base64 JSON → message; undefined for anything the topic holds that is not ours. */
export function decodeMessage(m: WireMessage): TopicMessage | undefined {
  try {
    const bytes = bytesOf(m.message)
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { type?: unknown }
    if (typeof body.type !== "string") return undefined
    return {
      sequenceNumber: m.sequence_number,
      consensusAt: Math.round(Number(m.consensus_timestamp) * 1000),
      body: body as TopicMessage["body"],
    }
  } catch {
    return undefined
  }
}

/** Pages to follow at most. The trail is read on every bond page, so it is bounded on purpose. */
const MAX_PAGES = 10

/**
 * Reads the topic newest-first, following the mirror node's `links.next` so an invoice does not
 * lose its attestations once the topic grows past one page of 100.
 */
export async function fetchTopic(fetchFn: typeof fetch = fetch): Promise<TopicMessage[]> {
  // Pages are collected before the chunks are joined: one submission can straddle a page
  // boundary, and half of a logo is not a record.
  const wire: WireMessage[] = []
  let url: string | undefined = messagesUrl
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`mirror node answered ${res.status}`)
    const body = (await res.json()) as Wire
    wire.push(...body.messages)
    // `next` comes back as a path on the same host.
    const next = body.links?.next
    url = next ? new URL(next, mirrorOrigin).toString() : undefined
  }
  const out: TopicMessage[] = []
  for (const m of joinChunks(wire)) {
    const decoded = decodeMessage(m)
    if (decoded) out.push(decoded)
  }
  return out
}

export const isAttestation = (m: TopicMessage): m is TopicMessage & { body: Attestation } =>
  m.body.type === "attestation.v1"

export const isReceipt = (m: TopicMessage): m is TopicMessage & { body: Receipt } =>
  m.body.type === "x402.receipt.v1"

/** Bytes32 id of a reference, the way the API derives it (`keccak256(ref)`; hex is verbatim). */
export const invoiceIdOf = (ref: string): Hex =>
  isHex(ref) && ref.length === 66 ? ref : keccak256(toBytes(ref))

/** This bond's attestations, newest first. */
export const attestationsFor = (messages: TopicMessage[], invoiceId: Hex) =>
  messages
    .filter(isAttestation)
    .filter((m) => invoiceIdOf(m.body.invoiceId).toLowerCase() === invoiceId.toLowerCase())

/** The mark this issuer anchored, most recent first; undefined when they never attached one. */
export const logoFor = (messages: TopicMessage[], invoiceId: Hex) =>
  attestationsFor(messages, invoiceId).find((m) => m.body.logo)?.body.logo

/** `Sep 6, 2026, 06:05 UTC` */
export const consensusTime = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  })
