import { z } from "zod";

/** 0x-prefixed 32-byte hex string. */
export const Hex32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");

/** 0x-prefixed 20-byte EVM address. */
export const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed EVM address");

/** Invoice identifier: 32-byte hex, used verbatim as the EIP-712 `bytes32 invoiceId`. */
export const InvoiceIdSchema = Hex32Schema.brand<"InvoiceId">();
export type InvoiceId = z.infer<typeof InvoiceIdSchema>;

/** Parse/brand a raw string as an InvoiceId (throws on invalid input). */
export function asInvoiceId(value: string): InvoiceId {
  return InvoiceIdSchema.parse(value);
}

export const InvoiceStatusSchema = z.enum(["draft", "listed", "funded", "settled", "defaulted"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

/** Amounts are USDC base units (6 decimals), bigint only. */
const UsdcAmountSchema = z.bigint().positive();

export const InvoiceSchema = z.object({
  id: InvoiceIdSchema,
  issuer: AddressSchema,
  debtor: z.string().min(1),
  /** Face value in USDC base units (6 decimals). */
  faceValue: UsdcAmountSchema,
  /** Unix timestamp (seconds). */
  issuedAt: z.number().int().nonnegative(),
  /** Unix timestamp (seconds); must be after issuedAt. */
  dueAt: z.number().int().nonnegative(),
  /** sha256 of the underlying invoice document, lowercase hex without 0x. */
  docHash: z.string().regex(/^[0-9a-f]{64}$/, "expected lowercase sha256 hex"),
  status: InvoiceStatusSchema,
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/** uint64 range guard for EIP-712 fields. */
const Uint64Schema = z
  .bigint()
  .nonnegative()
  .max(2n ** 64n - 1n);

/**
 * A discount quote for an invoice. Field names and types mirror the Solidity struct
 * `Quote(bytes32 invoiceId,uint256 faceValue,uint16 discountRateBps,uint64 validUntil,uint64 nonce)`.
 */
export const QuoteSchema = z.object({
  invoiceId: InvoiceIdSchema,
  /** Face value in USDC base units (uint256). */
  faceValue: UsdcAmountSchema,
  /** Discount in basis points (uint16, 0..10000). */
  discountRateBps: z.number().int().min(0).max(10_000),
  /** Unix timestamp (seconds, uint64). */
  validUntil: Uint64Schema,
  nonce: Uint64Schema,
});
export type Quote = z.infer<typeof QuoteSchema>;
