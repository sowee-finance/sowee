import type { Hex } from "viem";

/**
 * ATS role ids, verified against @hashgraph/asset-tokenization-contracts@8.0.0
 * `contracts/constants/roles.sol` (keccak256 of "asset.tokenization.standard.role.<Name>").
 * The bond creator only receives DEFAULT_ADMIN_ROLE via rbacs; every operational role
 * below must be self-granted before compliance / minting works.
 */
export const ROLE_SSI_MANAGER: Hex =
  "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1";
export const ROLE_KYC: Hex = "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
export const ROLE_CONTROL_LIST: Hex =
  "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d";
export const ROLE_ISSUER: Hex =
  "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";

/**
 * ATS security-diamond facets @sowee/plugin-ats does not wrap: access control,
 * SSI issuer management, compliance status views, and ERC-1594 mint.
 */
export const atsExtrasAbi = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "_role", type: "bytes32" },
      { name: "_account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_role", type: "bytes32" },
      { name: "_account", type: "address" },
    ],
    outputs: [{ name: "success_", type: "bool" }],
  },
  {
    type: "function",
    name: "isIssuer",
    stateMutability: "view",
    inputs: [{ name: "_issuer", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "addIssuer",
    stateMutability: "nonpayable",
    inputs: [{ name: "_issuer", type: "address" }],
    outputs: [{ name: "success_", type: "bool" }],
  },
  {
    type: "function",
    name: "getKycStatusFor",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "kycStatus_", type: "uint8" }],
  },
  {
    type: "function",
    name: "isInControlList",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "issue",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tokenHolder", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** DiscountOracle.Quote as a viem tuple component list. */
const quoteComponents = [
  { name: "invoiceId", type: "bytes32" },
  { name: "faceValue", type: "uint256" },
  { name: "discountRateBps", type: "uint16" },
  { name: "validUntil", type: "uint64" },
  { name: "nonce", type: "uint64" },
] as const;

export const invoiceMarketAbi = [
  {
    type: "function",
    name: "listInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "bond", type: "address" },
      { name: "totalUnits", type: "uint256" },
      { name: "maturity", type: "uint64" },
      { name: "quote", type: "tuple", components: quoteComponents },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyPrimary",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "units", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "invoices",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      { name: "issuer", type: "address" },
      { name: "bond", type: "address" },
      { name: "maturity", type: "uint64" },
      { name: "pricePerUnit", type: "uint256" },
      { name: "unitsRemaining", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  { type: "error", name: "AlreadyListed", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  {
    type: "error",
    name: "QuoteMismatch",
    inputs: [
      { name: "expected", type: "bytes32" },
      { name: "actual", type: "bytes32" },
    ],
  },
  { type: "error", name: "MaturityInPast", inputs: [{ name: "maturity", type: "uint64" }] },
  { type: "error", name: "PriceRoundsToZero", inputs: [] },
  {
    type: "error",
    name: "InsufficientUnits",
    inputs: [
      { name: "requested", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
  { type: "error", name: "InvoiceMatured", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  // DiscountOracle errors bubble up through listInvoice's verifyQuote call.
  {
    type: "error",
    name: "QuoteExpired",
    inputs: [
      { name: "validUntil", type: "uint64" },
      { name: "nowTimestamp", type: "uint256" },
    ],
  },
  { type: "error", name: "InvalidSignature", inputs: [] },
  { type: "error", name: "NonceAlreadyUsed", inputs: [{ name: "nonce", type: "uint64" }] },
] as const;

export const maturitySettlementAbi = [
  {
    type: "function",
    name: "registerInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "bond", type: "address" },
      { name: "maturity", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "scheduleSettlement",
    stateMutability: "payable",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settlements",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      { name: "bond", type: "address" },
      { name: "maturity", type: "uint64" },
      { name: "repayment", type: "uint256" },
      { name: "remaining", type: "uint256" },
      { name: "supplySnapshot", type: "uint256" },
      { name: "unitsSurrendered", type: "uint256" },
      { name: "settled", type: "bool" },
    ],
  },
  {
    type: "error",
    name: "MaturityBeyondScheduleWindow",
    inputs: [
      { name: "maturity", type: "uint64" },
      { name: "latestSchedulable", type: "uint64" },
    ],
  },
  { type: "error", name: "NoScheduleCapacity", inputs: [{ name: "expirySecond", type: "uint64" }] },
  { type: "error", name: "ScheduleFailed", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "AlreadySettled", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  { type: "error", name: "NotSettled", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  {
    type: "error",
    name: "NotMatured",
    inputs: [
      { name: "maturity", type: "uint64" },
      { name: "nowTimestamp", type: "uint256" },
    ],
  },
  { type: "error", name: "NothingToSettle", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  {
    type: "error",
    name: "NothingToClaim",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "holder", type: "address" },
    ],
  },
] as const;
