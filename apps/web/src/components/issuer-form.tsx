"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { type Hex, parseUnits } from "viem"
import { useAccount } from "wagmi"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { ApiError, type Attestation, attest, requestQuote, type SignedQuote } from "@/lib/api"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { maturityFrom, nameFor, sha256Hex, symbolFor } from "@/lib/issuer"
import { bpsToPct, maturityDate, usdc } from "@/lib/market"
import { useTx } from "@/lib/use-tx"
import { NotDeployed } from "./not-deployed"
import { box, errorText, input, okText, primary, secondary, warnText } from "./styles"

export function IssuerForm({ deployment }: { deployment?: Deployment }) {
  const { address, chainId } = useAccount()
  if (!deployment) return <NotDeployed />
  if (!address || chainId !== activeChain.id) {
    return (
      <p className={box}>
        Connect a wallet on {activeChain.name} to list an invoice. The wallet that lists is the
        issuer and receives the USDC from every primary buy.
      </p>
    )
  }
  return <Wizard deployment={deployment} />
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

function Wizard({ deployment }: { deployment: Deployment }) {
  const [ref, setRef] = useState("")
  const [payor, setPayor] = useState("")
  const [amount, setAmount] = useState("")
  const [due, setDue] = useState("")
  const [docHash, setDocHash] = useState<Hex>()

  const [quote, setQuote] = useState<SignedQuote>()
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string>()

  const tx = useTx()

  const [attestation, setAttestation] = useState<Attestation>()
  const [attestError, setAttestError] = useState<ApiError | Error>()
  const anchored = useRef(false)

  // Ticks the validity countdown.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const maturity = due ? maturityFrom(due) : 0
  const secondsLeft = quote ? Number(quote.quote.validUntil) - Math.floor(now / 1000) : 0
  const expired = !!quote && secondsLeft <= 0

  const getQuote = async (e: React.FormEvent) => {
    e.preventDefault()
    setQuoteError(undefined)
    setQuoting(true)
    try {
      setQuote(await requestQuote(ref, parseUnits(amount, 6), maturity))
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : String(err))
    } finally {
      setQuoting(false)
    }
  }

  const list = () => {
    if (!quote) return
    tx.send({
      address: deployment.invoiceMarket,
      abi: invoiceMarketAbi,
      functionName: "listInvoice",
      args: [nameFor(ref), symbolFor(ref), BigInt(maturity), quote.quote, quote.signature],
    })
  }

  const anchor = async () => {
    if (!docHash) return
    setAttestError(undefined)
    try {
      setAttestation(await attest(ref, docHash))
    } catch (err) {
      setAttestError(err instanceof Error ? err : new Error(String(err)))
    }
  }

  // Step 3 runs once, as soon as the listing is mined.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on confirmation only
  useEffect(() => {
    if (tx.confirmed && !anchored.current) {
      anchored.current = true
      anchor()
    }
  }, [tx.confirmed])

  const listed = tx.confirmed && quote

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={getQuote} className={box}>
        <h2 className="font-medium">1. Invoice</h2>
        <fieldset disabled={!!quote} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="ref" label="Invoice reference">
            <input
              id="ref"
              required
              pattern="[A-Za-z0-9._\-]+"
              title="Letters, digits, dot, underscore or dash"
              placeholder="INV-2026-001"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className={input}
            />
          </Field>
          <Field id="payor" label="Payor (kept off-chain)">
            <input
              id="payor"
              placeholder="Acme GmbH"
              value={payor}
              onChange={(e) => setPayor(e.target.value)}
              className={input}
            />
          </Field>
          <Field id="amount" label="Face value (USDC)">
            <input
              id="amount"
              required
              type="number"
              inputMode="decimal"
              min="0.000001"
              step="0.000001"
              placeholder="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={input}
            />
          </Field>
          <Field id="due" label="Due date">
            <input
              id="due"
              required
              type="date"
              min={tomorrow()}
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className={input}
            />
          </Field>
          <Field id="doc" label="Invoice document (hashed in your browser, never uploaded)">
            <input
              id="doc"
              required
              type="file"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                setDocHash(f ? await sha256Hex(f) : undefined)
              }}
              className="text-xs"
            />
            {docHash && (
              <span className="break-all font-mono text-xs text-zinc-500">sha256 {docHash}</span>
            )}
          </Field>
        </fieldset>
        <div className="mt-3 flex items-center gap-3">
          {quote ? (
            <button
              type="button"
              className={secondary}
              disabled={!!tx.hash}
              onClick={() => {
                setQuote(undefined)
                setQuoteError(undefined)
              }}
            >
              Edit
            </button>
          ) : (
            <button type="submit" className={primary} disabled={quoting || !docHash}>
              {quoting ? "Pricing…" : "Get quote"}
            </button>
          )}
          {quoteError && <span className={errorText}>{quoteError}</span>}
        </div>
      </form>

      <section className={box}>
        <h2 className="font-medium">2. Quote and listing</h2>
        {!quote ? (
          <p className="mt-1 text-zinc-500">Get a quote first.</p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1">
              <dt className="text-zinc-500">Discount</dt>
              <dd>{bpsToPct(quote.quote.discountRateBps)}</dd>
              <dt className="text-zinc-500">Face value</dt>
              <dd>{usdc(quote.quote.faceValue)}</dd>
              <dt className="text-zinc-500">Investors pay</dt>
              <dd>
                {usdc(
                  (quote.quote.faceValue * BigInt(10_000 - quote.quote.discountRateBps)) / 10_000n,
                )}
              </dd>
              <dt className="text-zinc-500">Maturity</dt>
              <dd>{maturityDate(maturity)}</dd>
              <dt className="text-zinc-500">Token</dt>
              <dd>
                {nameFor(ref)} <span className="font-mono text-xs">({symbolFor(ref)})</span>
              </dd>
              <dt className="text-zinc-500">Quote valid</dt>
              <dd className={expired ? "text-red-600" : undefined}>
                {listed ? "consumed" : expired ? "expired" : `${countdown(secondsLeft)} left`}
              </dd>
            </dl>
            {!listed && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  className={primary}
                  disabled={expired || tx.busy}
                  onClick={list}
                >
                  {tx.busy ? "Confirming…" : "List on-chain"}
                </button>
                {expired && (
                  <span className={warnText}>Quote expired: edit and get a new one.</span>
                )}
                {tx.error && <span className={errorText}>{tx.error}</span>}
              </div>
            )}
            {listed && (
              <p className={`mt-3 ${okText}`}>
                Listed.{" "}
                <Link href={`/invoices/${quote.quote.invoiceId}`} className="underline">
                  Open the bond page
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>

      <section className={box}>
        <h2 className="font-medium">3. Anchor the document hash</h2>
        {!listed ? (
          <p className="mt-1 text-zinc-500">Runs automatically once the listing is mined.</p>
        ) : attestation ? (
          <p className={`mt-1 ${okText}`}>
            Anchored on HCS topic {attestation.topicId}, message #{attestation.sequenceNumber}.{" "}
            <a href={attestation.link} target="_blank" rel="noreferrer" className="underline">
              View on HashScan
            </a>
          </p>
        ) : attestError ? (
          <div className="mt-1 flex items-center gap-3">
            <span
              className={
                attestError instanceof ApiError && attestError.status === 503 ? warnText : errorText
              }
            >
              {attestError instanceof ApiError && attestError.status === 503
                ? "The audit trail is disabled on this API (no Hedera operator configured), so the hash was not anchored. The listing itself is live."
                : attestError instanceof ApiError && attestError.status === 409
                  ? `This document is already pledged: ${attestError.message}`
                  : attestError.message}
            </span>
            <button type="button" className={secondary} onClick={anchor}>
              Retry
            </button>
          </div>
        ) : (
          <p className="mt-1 text-zinc-500">Anchoring…</p>
        )}
      </section>
    </div>
  )
}

const countdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  )
}
