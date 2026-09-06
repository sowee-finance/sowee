import type { Address, Hex } from "viem"

/** Origin of the Go API (`apps/api`). Also allowed in the CSP by `next.config.ts`. */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

/** `DiscountOracle.Quote`, in the shape `InvoiceMarket.listInvoice` takes. */
export type Quote = {
  invoiceId: Hex
  faceValue: bigint
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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, json.error ?? `${res.status} ${res.statusText}`)
  return json
}

type QuoteWire = {
  quote: {
    invoiceId: Hex
    faceValue: string
    discountRateBps: number
    validUntil: number
    nonce: number
  }
  signature: Hex
  signer: Address
}

/** Price an invoice: `faceValue` in USDC base units, `maturity` in unix seconds. */
export async function requestQuote(
  ref: string,
  faceValue: bigint,
  maturity: number,
): Promise<SignedQuote> {
  const r = await post<QuoteWire>(`/v1/invoices/${encodeURIComponent(ref)}/quote`, {
    faceValue: faceValue.toString(),
    maturity,
  })
  return {
    quote: {
      invoiceId: r.quote.invoiceId,
      faceValue: BigInt(r.quote.faceValue),
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
