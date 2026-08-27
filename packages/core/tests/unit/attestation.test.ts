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
  event: "ISSUED",
  timestamp: "2026-08-26T12:02:48Z",
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

  it("rejects invalid payloads on decode", () => {
    expect(() => decodeAttestation(JSON.stringify({ ...event, event: "" }))).toThrow();
    expect(() => decodeAttestation(JSON.stringify({ ...event, timestamp: 1756000000 }))).toThrow();
    expect(() => decodeAttestation("not json")).toThrow();
  });

  it("decodes the exact payload the Go API anchored live (topic 0.0.10206435 seq 7)", () => {
    const anchored =
      '{"invoiceId":"0x51c97fd10729efdfc781d48ed66cea3cbf2764ccbc86d6710f97bb93b4cdef98",' +
      '"docHash":"c917d1ce84817e2979f612fa4517aed0c72567791ed0c715b51f287a714a4e2a",' +
      '"event":"VERIFIED","timestamp":"2026-08-26T12:02:48Z"}';
    const decoded = decodeAttestation(anchored);
    expect(decoded.event).toBe("VERIFIED");
    expect(decoded.timestamp).toBe("2026-08-26T12:02:48Z");
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
