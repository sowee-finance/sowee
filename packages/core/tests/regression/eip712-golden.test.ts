import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  asInvoiceId,
  hashQuote,
  type Quote,
  type QuoteDomainParams,
  signQuote,
  verifyQuote,
} from "../../src/index.js";
import fixture from "./fixtures/quote-golden.json";

/**
 * Golden fixture guard: the EIP-712 digest and signature for a FIXED throwaway key
 * and a FIXED quote are committed in fixtures/quote-golden.json. Any change to the
 * typed-data encoding (struct fields, order, domain) breaks this test on purpose.
 */
const quote: Quote = {
  invoiceId: asInvoiceId(fixture.quote.invoiceId),
  faceValue: BigInt(fixture.quote.faceValue),
  discountRateBps: fixture.quote.discountRateBps,
  validUntil: BigInt(fixture.quote.validUntil),
  nonce: BigInt(fixture.quote.nonce),
};

const domain: QuoteDomainParams = {
  chainId: fixture.domain.chainId,
  verifyingContract: fixture.domain.verifyingContract as `0x${string}`,
};

describe("EIP-712 golden fixture", () => {
  it("digest matches the committed hex exactly", () => {
    expect(hashQuote(quote, domain)).toBe(fixture.expected.digest);
  });

  it("signature for the fixed test key matches exactly", async () => {
    const account = privateKeyToAccount(fixture.privateKey as `0x${string}`);
    expect(account.address.toLowerCase()).toBe(fixture.expected.signer.toLowerCase());
    await expect(signQuote(account, quote, domain)).resolves.toBe(fixture.expected.signature);
  });

  it("committed signature still verifies", async () => {
    await expect(
      verifyQuote(
        fixture.expected.signature as `0x${string}`,
        quote,
        domain,
        fixture.expected.signer as `0x${string}`,
      ),
    ).resolves.toBe(true);
  });
});
