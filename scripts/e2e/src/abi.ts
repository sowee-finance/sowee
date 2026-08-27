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
