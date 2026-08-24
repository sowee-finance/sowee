import {
  type Address,
  type Hex,
  hashTypedData,
  type LocalAccount,
  recoverTypedDataAddress,
} from "viem";
import type { Quote } from "../domain/invoice.js";

/**
 * EIP-712 types for the Solidity struct:
 * `Quote(bytes32 invoiceId,uint256 faceValue,uint16 discountRateBps,uint64 validUntil,uint64 nonce)`
 */
export const QUOTE_TYPES = {
  Quote: [
    { name: "invoiceId", type: "bytes32" },
    { name: "faceValue", type: "uint256" },
    { name: "discountRateBps", type: "uint16" },
    { name: "validUntil", type: "uint64" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

export const QUOTE_DOMAIN_NAME = "SoweeDiscountOracle";
export const QUOTE_DOMAIN_VERSION = "1";

export interface QuoteDomainParams {
  chainId: number;
  verifyingContract: Address;
}

export function quoteDomain({ chainId, verifyingContract }: QuoteDomainParams) {
  return {
    name: QUOTE_DOMAIN_NAME,
    version: QUOTE_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** Full EIP-712 typed-data payload for a quote (pass to any signTypedData). */
export function quoteTypedData(quote: Quote, domainParams: QuoteDomainParams) {
  return {
    domain: quoteDomain(domainParams),
    types: QUOTE_TYPES,
    primaryType: "Quote",
    message: {
      invoiceId: quote.invoiceId as Hex,
      faceValue: quote.faceValue,
      discountRateBps: quote.discountRateBps,
      validUntil: quote.validUntil,
      nonce: quote.nonce,
    },
  } as const;
}

/** EIP-712 digest (the 32-byte hash that gets signed). */
export function hashQuote(quote: Quote, domainParams: QuoteDomainParams): Hex {
  return hashTypedData(quoteTypedData(quote, domainParams));
}

/** Sign a quote with a viem local account (e.g. privateKeyToAccount). */
export function signQuote(
  account: LocalAccount,
  quote: Quote,
  domainParams: QuoteDomainParams,
): Promise<Hex> {
  return account.signTypedData(quoteTypedData(quote, domainParams));
}

/** Recover the signer of a quote signature and compare to the expected oracle address. */
export async function verifyQuote(
  signature: Hex,
  quote: Quote,
  domainParams: QuoteDomainParams,
  expectedSigner: Address,
): Promise<boolean> {
  const recovered = await recoverTypedDataAddress({
    ...quoteTypedData(quote, domainParams),
    signature,
  });
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
