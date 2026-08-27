import { createHash } from "node:crypto";
import { z } from "zod";
import { InvoiceIdSchema } from "../domain/invoice.js";

/** Maximum HCS single-transaction message payload we allow (bytes, UTF-8). */
export const MAX_HCS_MESSAGE_BYTES = 1024;

/** Lifecycle event names the Sowee services anchor; the wire format accepts
    any non-empty name up to 64 chars, exactly like the API's own validation. */
export const KNOWN_ATTESTATION_EVENTS = [
  "SUBMITTED",
  "VERIFIED",
  "ISSUED",
  "FUNDED",
  "TRADED",
  "SETTLED",
] as const;

/** Audit-trail message published to the invoice's HCS topic. This mirrors the
    payload the Go API actually anchors: RFC3339 string timestamps and a
    bounded free-form event name — not an enum, not unix seconds. */
export const AttestationEventSchema = z.object({
  invoiceId: InvoiceIdSchema,
  /** sha256 of the underlying invoice document, lowercase hex without 0x. */
  docHash: z.string().regex(/^[0-9a-f]{64}$/, "expected lowercase sha256 hex"),
  event: z.string().min(1).max(64),
  /** RFC3339 timestamp, e.g. "2026-08-26T12:02:48Z". */
  timestamp: z.iso.datetime({ offset: true }),
  /** Optional attester signature over the JSON payload without `sig`. */
  sig: z.string().optional(),
});
export type AttestationEvent = z.infer<typeof AttestationEventSchema>;

/**
 * Encode an attestation event as canonical JSON (UTF-8).
 * Throws if invalid or over the 1024-byte HCS single-transaction limit.
 */
export function encodeAttestation(event: AttestationEvent): Uint8Array {
  const json = JSON.stringify(AttestationEventSchema.parse(event));
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_HCS_MESSAGE_BYTES) {
    throw new Error(
      `Attestation message is ${bytes.byteLength} bytes; HCS limit is ${MAX_HCS_MESSAGE_BYTES}`,
    );
  }
  return bytes;
}

/** Decode and validate an attestation event from JSON bytes or string. */
export function decodeAttestation(data: Uint8Array | string): AttestationEvent {
  const json = typeof data === "string" ? data : new TextDecoder().decode(data);
  return AttestationEventSchema.parse(JSON.parse(json));
}

/**
 * sha256 of a document, as lowercase hex without 0x — the `docHash` format.
 * Uses node:crypto; in browsers use `crypto.subtle.digest("SHA-256", ...)` instead.
 */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}
