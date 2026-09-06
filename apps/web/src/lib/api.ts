import type { Address, Hex } from "viem"

/** Origin of the Go API (`apps/api`). Also allowed in the CSP by `next.config.ts`. */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

/** `DiscountOracle.Quote`, in the shape `InvoiceMarket.listInvoice` takes. */
export type Quote = {
  invoiceId: Hex
  issuer: Address
  faceValue: bigint
  maturity: bigint
  discountRateBps: number
  validUntil: bigint
  nonce: bigint
}

export type SignedQuote = { quote: Quote; signature: Hex; signer: Address }

export type Attestation = { topicId: string; sequenceNumber: number; link: string }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, init)
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, json.error ?? `${res.status} ${res.statusText}`)
  return json
}

export const get = <T>(path: string) => request<T>(path)

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

type QuoteWire = {
  quote: {
    invoiceId: Hex
    issuer: Address
    faceValue: string
    maturity: number
    discountRateBps: number
    validUntil: number
    nonce: number
  }
  signature: Hex
  signer: Address
}

/**
 * Price an invoice: `faceValue` in USDC base units, `maturity` in unix seconds. The quote is
 * signed for `issuer` (the wallet that will list) and that maturity; the market checks both.
 */
export async function requestQuote(
  ref: string,
  issuer: Address,
  faceValue: bigint,
  maturity: number,
): Promise<SignedQuote> {
  const r = await post<QuoteWire>(`/v1/invoices/${encodeURIComponent(ref)}/quote`, {
    issuer,
    faceValue: faceValue.toString(),
    maturity,
  })
  return {
    quote: {
      invoiceId: r.quote.invoiceId,
      issuer: r.quote.issuer,
      faceValue: BigInt(r.quote.faceValue),
      maturity: BigInt(r.quote.maturity),
      discountRateBps: r.quote.discountRateBps,
      validUntil: BigInt(r.quote.validUntil),
      nonce: BigInt(r.quote.nonce),
    },
    signature: r.signature,
    signer: r.signer,
  }
}

/** Anchor the document hash on the HCS topic. 409 = already pledged, 503 = HCS disabled. */
export const attest = (ref: string, docHash: Hex) =>
  post<Attestation>(`/v1/invoices/${encodeURIComponent(ref)}/attest`, { docHash, event: "issued" })
