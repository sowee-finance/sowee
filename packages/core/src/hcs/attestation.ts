import { createHash } from "node:crypto";
import { z } from "zod";
import { InvoiceIdSchema } from "../domain/invoice.js";

/** Maximum HCS single-transaction message payload we allow (bytes, UTF-8). */
export const MAX_HCS_MESSAGE_BYTES = 1024;

export const AttestationEventTypeSchema = z.enum([
  "issued",
  "verified",
  "funded",
  "traded",
  "settled",
]);
export type AttestationEventType = z.infer<typeof AttestationEventTypeSchema>;

/** Audit-trail message published to the invoice's HCS topic. */
export const AttestationEventSchema = z.object({
  invoiceId: InvoiceIdSchema,
  /** sha256 of the underlying invoice document, lowercase hex without 0x. */
  docHash: z.string().regex(/^[0-9a-f]{64}$/, "expected lowercase sha256 hex"),
  event: AttestationEventTypeSchema,
  /** Unix timestamp (seconds). */
  timestamp: z.number().int().nonnegative(),
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
