import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  asInvoiceId,
  HEDERA_TESTNET,
  hashQuote,
  type Quote,
  type QuoteDomainParams,
  signQuote,
  verifyQuote,
} from "../../src/index.js";

const domain: QuoteDomainParams = {
  chainId: HEDERA_TESTNET.chainId,
  verifyingContract: "0x000000000000000000000000000000000000beef",
};

const quote: Quote = {
  invoiceId: asInvoiceId(`0x${"33".repeat(32)}`),
  faceValue: 100_000_000n,
  discountRateBps: 300,
  validUntil: 1_760_000_000n,
  nonce: 7n,
};

describe("signQuote / verifyQuote", () => {
  it("round-trips with a throwaway key", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await signQuote(account, quote, domain);
    await expect(verifyQuote(signature, quote, domain, account.address)).resolves.toBe(true);
  });

  it("fails for the wrong expected signer", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const signature = await signQuote(account, quote, domain);
    await expect(verifyQuote(signature, quote, domain, other.address)).resolves.toBe(false);
  });

  it("fails when the quote or domain is tampered with", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await signQuote(account, quote, domain);
    await expect(
      verifyQuote(signature, { ...quote, discountRateBps: 301 }, domain, account.address),
    ).resolves.toBe(false);
    await expect(
      verifyQuote(signature, quote, { ...domain, chainId: 295 }, account.address),
    ).resolves.toBe(false);
  });

  it("digest changes with every struct field", () => {
    const base = hashQuote(quote, domain);
    const variants: Quote[] = [
      { ...quote, invoiceId: asInvoiceId(`0x${"44".repeat(32)}`) },
      { ...quote, faceValue: quote.faceValue + 1n },
      { ...quote, discountRateBps: 301 },
      { ...quote, validUntil: quote.validUntil + 1n },
      { ...quote, nonce: quote.nonce + 1n },
    ];
    for (const v of variants) {
      expect(hashQuote(v, domain)).not.toBe(base);
    }
  });
});
