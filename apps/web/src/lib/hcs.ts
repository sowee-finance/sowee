import { type Hex, isHex, keccak256, toBytes } from "viem"
import { hederaTestnet } from "viem/chains"
import { activeChain } from "./chains"

// Reader for the audit trail the API anchors on a Hedera Consensus Service topic
// (apps/api README, "Audit trail (HCS)"). Public mirror node, no key needed.

export const topicId = process.env.NEXT_PUBLIC_HCS_TOPIC_ID ?? "0.0.10388277"
export const topicUrl = `https://hashscan.io/testnet/topic/${topicId}`
const messagesUrl = `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?order=desc&limit=100`

/** The topic lives on Hedera testnet; on any other active chain there is nothing to read. */
export const hcsAvailable = activeChain.id === hederaTestnet.id

export type Attestation = {
  type: "attestation.v1"
  /** The human reference (`INV-2026-001`) or, if the issuer sent one, the bytes32 id. */
  invoiceId: string
  docHash: string
  event: string
  timestamp: string
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

type Wire = {
  messages: { sequence_number: number; consensus_timestamp: string; message: string }[]
}

/** base64 JSON → message; undefined for anything the topic holds that is not ours. */
export function decodeMessage(m: Wire["messages"][number]): TopicMessage | undefined {
  try {
    const bytes = Uint8Array.from(atob(m.message), (c) => c.charCodeAt(0))
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

// ponytail: latest 100 messages only; follow `links.next` once the topic outgrows one page.
export async function fetchTopic(fetchFn: typeof fetch = fetch): Promise<TopicMessage[]> {
  const res = await fetchFn(messagesUrl)
  if (!res.ok) throw new Error(`mirror node answered ${res.status}`)
  const wire = (await res.json()) as Wire
  return wire.messages.flatMap((m) => decodeMessage(m) ?? [])
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

export const consensusTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  })
