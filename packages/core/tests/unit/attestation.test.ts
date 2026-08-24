import { describe, expect, it } from "vitest";
import {
  type AttestationEvent,
  asInvoiceId,
  decodeAttestation,
  encodeAttestation,
  sha256Hex,
} from "../../src/index.js";

const event: AttestationEvent = {
  invoiceId: asInvoiceId(`0x${"22".repeat(32)}`),
  docHash: sha256Hex("invoice.pdf bytes"),
  event: "issued",
  timestamp: 1_756_000_000,
};

describe("attestation encode/decode", () => {
  it("round-trips through JSON bytes", () => {
    const bytes = encodeAttestation(event);
    expect(decodeAttestation(bytes)).toEqual(event);
    expect(decodeAttestation(new TextDecoder().decode(bytes))).toEqual(event);
  });

  it("keeps the optional sig field", () => {
    const signed = { ...event, sig: "0xdeadbeef" };
    expect(decodeAttestation(encodeAttestation(signed)).sig).toBe("0xdeadbeef");
  });

  it("rejects payloads over 1024 bytes", () => {
    expect(() => encodeAttestation({ ...event, sig: "x".repeat(1500) })).toThrow(/1024/);
  });

  it("rejects invalid events on decode", () => {
    expect(() => decodeAttestation(JSON.stringify({ ...event, event: "burned" }))).toThrow();
    expect(() => decodeAttestation("not json")).toThrow();
  });
});

describe("sha256Hex", () => {
  it("matches the NIST test vector for 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("accepts bytes", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(sha256Hex("abc"));
  });
});
