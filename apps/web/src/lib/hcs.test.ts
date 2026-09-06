import { describe, expect, test } from "bun:test"
import { attestationsFor, decodeMessage, fetchTopic, invoiceIdOf, isReceipt } from "./hcs"

const b64 = (s: string) => Buffer.from(s).toString("base64")

// Shape of GET /api/v1/topics/{id}/messages on the mirror node, recorded from the live topic.
const wire = {
  messages: [
    {
      sequence_number: 3,
      consensus_timestamp: "1788674744.893518817",
      message: b64(
        '{"type":"attestation.v1","invoiceId":"INV-2026-001","docHash":"a6ea","event":"issued","timestamp":"2026-09-06T06:05:43Z"}',
      ),
    },
    {
      sequence_number: 2,
      consensus_timestamp: "1788673302.028323357",
      message: b64(
        '{"type":"x402.receipt.v1","endpoint":"/v1/market/insights","payer":"0.0.10215221","amount":"10000","asset":"0.0.429274","settlementTx":"0.0.7162784@1788673291.830215578","timestamp":"2026-09-06T05:41:42Z"}',
      ),
    },
    { sequence_number: 1, consensus_timestamp: "1788672692.741572104", message: b64("not json") },
  ],
  links: { next: null },
}

const inv001 = "0xae5c05cbcf519c82718c76f0df46d5f0842ae124ac650b97f3e6bb0924900bb8"

describe("hcs", () => {
  test("decodes base64 JSON and skips foreign messages", () => {
    const m = decodeMessage(wire.messages[0])
    expect(m?.sequenceNumber).toBe(3)
    expect(m?.consensusAt).toBe(1_788_674_744_894)
    expect(m?.body.type).toBe("attestation.v1")
    expect(decodeMessage(wire.messages[2])).toBeUndefined()
  })

  test("fetchTopic returns every decodable message", async () => {
    const fetchFn = (async () => ({ ok: true, json: async () => wire })) as unknown as typeof fetch
    const msgs = await fetchTopic(fetchFn)
    expect(msgs.map((m) => m.sequenceNumber)).toEqual([3, 2])
    expect(msgs.filter(isReceipt)).toHaveLength(1)
  })

  test("invoice references match their keccak id either way", async () => {
    expect(invoiceIdOf("INV-2026-001")).toBe(inv001)
    expect(invoiceIdOf(inv001)).toBe(inv001)
    const fetchFn = (async () => ({ ok: true, json: async () => wire })) as unknown as typeof fetch
    const msgs = await fetchTopic(fetchFn)
    expect(attestationsFor(msgs, inv001).map((m) => m.body.event)).toEqual(["issued"])
    expect(attestationsFor(msgs, `0x${"0".repeat(64)}`)).toEqual([])
  })

  test("a mirror node error surfaces as a rejection", async () => {
    const fetchFn = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch
    await expect(fetchTopic(fetchFn)).rejects.toThrow("503")
  })
})
