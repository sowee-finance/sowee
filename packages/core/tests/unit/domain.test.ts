import { describe, expect, it } from "vitest";
import {
  asInvoiceId,
  hederaIdToEvmAddress,
  InvoiceSchema,
  QuoteSchema,
  USDC_TESTNET,
} from "../../src/index.js";

const invoiceId = asInvoiceId(`0x${"11".repeat(32)}`);

describe("InvoiceSchema", () => {
  const valid = {
    id: invoiceId,
    issuer: "0x000000000000000000000000000000000000dEaD",
    debtor: "ACME GmbH",
    faceValue: 50_000_000_000n,
    issuedAt: 1_756_000_000,
    dueAt: 1_760_000_000,
    docHash: "a".repeat(64),
    status: "listed",
  };

  it("accepts a valid invoice", () => {
    expect(InvoiceSchema.parse(valid).status).toBe("listed");
  });

  it("rejects bad status, hash, and non-bigint amounts", () => {
    expect(() => InvoiceSchema.parse({ ...valid, status: "paid" })).toThrow();
    expect(() => InvoiceSchema.parse({ ...valid, docHash: "0xabc" })).toThrow();
    expect(() => InvoiceSchema.parse({ ...valid, faceValue: 50000 })).toThrow();
    expect(() => InvoiceSchema.parse({ ...valid, faceValue: -1n })).toThrow();
  });
});

describe("QuoteSchema", () => {
  const valid = {
    invoiceId,
    faceValue: 50_000_000_000n,
    discountRateBps: 250,
    validUntil: 1_760_000_000n,
    nonce: 1n,
  };

  it("accepts a valid quote", () => {
    expect(QuoteSchema.parse(valid).discountRateBps).toBe(250);
  });

  it("enforces uint16/uint64 ranges", () => {
    expect(() => QuoteSchema.parse({ ...valid, discountRateBps: 10_001 })).toThrow();
    expect(() => QuoteSchema.parse({ ...valid, validUntil: 2n ** 64n })).toThrow();
    expect(() => QuoteSchema.parse({ ...valid, nonce: -1n })).toThrow();
  });
});

describe("asInvoiceId", () => {
  it("rejects non-bytes32 values", () => {
    expect(() => asInvoiceId("0x1234")).toThrow();
    expect(() => asInvoiceId("11".repeat(32))).toThrow();
  });
});

describe("hederaIdToEvmAddress", () => {
  it("maps entity num to a long-zero address", () => {
    expect(hederaIdToEvmAddress("0.0.429274").toLowerCase()).toBe(
      USDC_TESTNET.evmAddress.toLowerCase(),
    );
  });

  it("rejects non-zero shard/realm and malformed ids", () => {
    expect(() => hederaIdToEvmAddress("1.0.5")).toThrow();
    expect(() => hederaIdToEvmAddress("0.0")).toThrow();
    expect(() => hederaIdToEvmAddress("0.0.x")).toThrow();
  });
});
