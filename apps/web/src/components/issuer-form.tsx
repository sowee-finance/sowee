"use client"

import {
  ArrowLeft,
  ArrowRight,
  Circle,
  CircleCheck,
  CircleX,
  FileUp,
  LoaderCircle,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { type Hex, parseUnits } from "viem"
import { useAccount } from "wagmi"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { ApiError, type Attestation, attest, requestQuote, type SignedQuote } from "@/lib/api"
import { activeChain, shortAddress, txUrl } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { maturityFrom, nameFor, sha256Hex, symbolFor } from "@/lib/issuer"
import { bpsToPct, dollars, maturityDate } from "@/lib/market"
import { useTx } from "@/lib/use-tx"
import { NotDeployed } from "./not-deployed"
import { AmountPanel, blackButton, pillInput, UsdcChip } from "./ui"
import { ConnectButton } from "./wallet-button"

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

type Draft = {
  ref: string
  company: string
  payor: string
  amount: string
  due: string
  docHash: Hex
}

export function IssuerForm({ deployment }: { deployment?: Deployment }) {
  const [draft, setDraft] = useState<{ draft: Draft; quote: SignedQuote }>()
  if (!deployment) return <NotDeployed />
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <Link
        href="/issuer"
        className="flex w-fit items-center gap-1.5 text-sm text-soft hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back to dashboard
      </Link>
      <h1 className="mt-4 font-medium text-2xl tracking-tight">Tokenize an Invoice</h1>
      <p className="mt-2 text-sm text-soft">
        {draft
          ? "Quote signed — list the bond from your wallet, then the document hash is anchored."
          : "Submit an unpaid invoice, then issue it as a bond and list it on the marketplace."}
      </p>
      {draft ? (
        <Checklist
          key={draft.quote.quote.invoiceId}
          deployment={deployment}
          draft={draft.draft}
          quote={draft.quote}
          onDiscard={() => setDraft(undefined)}
        />
      ) : (
        <InvoiceForm onQuoted={(d, q) => setDraft({ draft: d, quote: q })} />
      )}
    </div>
  )
}

/* ----------------------------------- form ---------------------------------- */

function InvoiceForm({ onQuoted }: { onQuoted: (draft: Draft, quote: SignedQuote) => void }) {
  const [amount, setAmount] = useState("")
  const [fileName, setFileName] = useState<string>()
  const [docHash, setDocHash] = useState<Hex>()
  const [hashing, setHashing] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [error, setError] = useState<string>()

  const onFile = async (file?: File) => {
    setFileName(file?.name)
    setDocHash(undefined)
    if (!file) return
    setHashing(true)
    try {
      setDocHash(await sha256Hex(file))
    } finally {
      setHashing(false)
    }
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const draft = {
      ref: String(f.get("ref") ?? "").trim(),
      company: String(f.get("company") ?? "").trim(),
      payor: String(f.get("payor") ?? "").trim(),
      amount,
      due: String(f.get("due") ?? ""),
    }
    if (!(Number(amount) > 0)) {
      setError("Enter the face value in USDC.")
      return
    }
    if (!docHash) {
      setError(
        hashing ? "Still hashing the document — try again in a second." : "Choose the invoice PDF.",
      )
      return
    }
    setQuoting(true)
    setError(undefined)
    try {
      const quote = await requestQuote(draft.ref, parseUnits(amount, 6), maturityFrom(draft.due))
      onQuoted({ ...draft, docHash }, quote)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setQuoting(false)
    }
  }

  return (
    <form className="mt-8 flex flex-col gap-5" onSubmit={submit}>
      <label className="flex flex-col gap-1.5 font-medium text-sm">
        Issuer company
        <input
          name="company"
          required
          placeholder="Your company, as printed on the invoice"
          className={pillInput}
        />
      </label>
      <label className="flex flex-col gap-1.5 font-medium text-sm">
        Payor
        <input
          name="payor"
          required
          placeholder="Company that owes the invoice"
          className={pillInput}
        />
      </label>
      <label className="flex flex-col gap-1.5 font-medium text-sm">
        Invoice reference
        <input
          name="ref"
          required
          pattern="[A-Za-z0-9._\-]+"
          title="Letters, digits, dot, underscore or dash"
          placeholder="INV-2026-001"
          className={`${pillInput} font-mono`}
        />
      </label>

      <div className="grid grid-cols-1 items-end gap-5 sm:grid-cols-2">
        <AmountPanel
          label="Face value"
          value={amount}
          onChange={setAmount}
          tokenChip={<UsdcChip />}
          inputMode="numeric"
          placeholder="120000"
        />
        <label className="flex flex-col gap-1.5 font-medium text-sm">
          Due date
          <input name="due" type="date" required min={tomorrow()} className={pillInput} />
        </label>
      </div>

      <div className="flex flex-col gap-1.5 font-medium text-sm">
        Invoice document
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-line border-dashed bg-white p-8 text-center hover:border-faint">
          <FileUp size={22} className="text-faint" strokeWidth={1.5} />
          <span className="font-normal text-body text-sm">
            {fileName ?? "Choose a PDF — hashed locally, never uploaded"}
          </span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            required
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {hashing && <p className="font-normal text-soft text-xs">Computing SHA-256…</p>}
        {docHash && (
          <div className="break-all rounded-xl bg-shade/60 px-4 py-3 font-mono font-normal text-soft text-xs">
            sha256:{docHash.slice(2)}
          </div>
        )}
      </div>

      <button type="submit" disabled={quoting} className={`${blackButton} mt-2`}>
        {quoting ? "Pricing…" : "Get a Quote"}
      </button>
      {error && (
        <p className="text-neg text-xs" role="alert">
          {error}
        </p>
      )}
      <p className="text-[11px] text-faint leading-relaxed">
        Pricing stores nothing: the API signs a discount quote from the face value and due date.
        Listing then runs one transaction from your wallet on {activeChain.name}; the document hash
        is anchored to the audit trail right after.
      </p>
    </form>
  )
}

/* -------------------------------- checklist -------------------------------- */

type StepStatus = "idle" | "working" | "done" | "error"

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return <CircleCheck size={18} className="shrink-0 text-pos" strokeWidth={2} />
    case "working":
      return <LoaderCircle size={18} className="shrink-0 animate-spin text-soft" strokeWidth={2} />
    case "error":
      return <CircleX size={18} className="shrink-0 text-neg" strokeWidth={2} />
    default:
      return <Circle size={18} className="shrink-0 text-faint" strokeWidth={1.5} />
  }
}

function StepRow({
  title,
  status,
  children,
}: {
  title: string
  status: StepStatus
  children?: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5">
        <StepIcon status={status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${status === "idle" ? "text-soft" : "font-medium"}`}>{title}</div>
        {children}
      </div>
    </li>
  )
}

const countdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** Signed quote → `listInvoice` from the wallet → anchor the document hash on the audit trail. */
function Checklist({
  deployment,
  draft,
  quote,
  onDiscard,
}: {
  deployment: Deployment
  draft: Draft
  quote: SignedQuote
  onDiscard: () => void
}) {
  const { address, chainId } = useAccount()
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
  const secondsLeft = Number(quote.quote.validUntil) - Math.floor(now / 1000)
  const expired = !tx.confirmed && secondsLeft <= 0

  const maturity = maturityFrom(draft.due)
  const name = nameFor(draft.company, draft.payor)
  const symbol = symbolFor(draft.ref)

  const list = () =>
    tx.send({
      address: deployment.invoiceMarket,
      abi: invoiceMarketAbi,
      functionName: "listInvoice",
      args: [name, symbol, BigInt(maturity), quote.quote, quote.signature],
    })

  const anchor = async () => {
    setAttestError(undefined)
    try {
      setAttestation(await attest(draft.ref, draft.docHash))
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

  const listStatus: StepStatus = tx.confirmed
    ? "done"
    : tx.busy
      ? "working"
      : tx.error || expired
        ? "error"
        : "idle"
  const anchorStatus: StepStatus = attestation
    ? "done"
    : attestError
      ? "error"
      : tx.confirmed
        ? "working"
        : "idle"
  const skipped = attestError instanceof ApiError && attestError.status === 503
  const txLink = tx.hash && txUrl(tx.hash)
  const investorsPay =
    (quote.quote.faceValue * BigInt(10_000 - quote.quote.discountRateBps)) / 10_000n

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-5">
      <h2 className="font-medium text-[15px]">Issue and list on-chain</h2>
      <p className="mt-1.5 text-soft text-xs leading-relaxed">
        The oracle signed a {bpsToPct(quote.quote.discountRateBps)} discount for this invoice. The
        listing runs from your wallet{address ? ` (${shortAddress(address)})` : ""} on{" "}
        {activeChain.name} in one transaction; the bond opens for funding the moment it is mined.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-shade/60 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-soft text-xs">Payor</dt>
          <dd className="mt-0.5 truncate font-medium">{draft.payor}</dd>
        </div>
        <div>
          <dt className="text-soft text-xs">Face value</dt>
          <dd className="tabular mt-0.5 font-medium">{dollars(quote.quote.faceValue)}</dd>
        </div>
        <div>
          <dt className="text-soft text-xs">Investors pay</dt>
          <dd className="tabular mt-0.5 font-medium">{dollars(investorsPay)}</dd>
        </div>
        <div>
          <dt className="text-soft text-xs">Due</dt>
          <dd className="tabular mt-0.5 font-medium">{maturityDate(maturity)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-soft text-xs">Token</dt>
          <dd className="mt-0.5 truncate font-medium">
            {name} <span className="font-mono text-xs">({symbol})</span>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-soft text-xs">Invoice id</dt>
          <dd className="mt-0.5 font-mono text-xs" title={quote.quote.invoiceId}>
            {shortAddress(quote.quote.invoiceId)}
          </dd>
        </div>
      </dl>

      <ol className="mt-2 divide-y divide-line">
        <StepRow title="Discount quote signed by the oracle" status="done">
          <p className={`mt-0.5 text-xs ${expired ? "text-neg" : "text-soft"}`}>
            {tx.confirmed
              ? "Consumed by the listing."
              : expired
                ? "Expired — discard this draft and get a new quote."
                : `Valid for ${countdown(secondsLeft)}.`}
          </p>
        </StepRow>
        <StepRow title="List the bond on-chain" status={listStatus}>
          {tx.error && (
            <p className="mt-0.5 text-neg text-xs" role="alert">
              {tx.error}
            </p>
          )}
          {txLink && (
            <a
              href={txLink}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-block text-soft text-xs underline hover:text-ink"
            >
              View transaction on the explorer
            </a>
          )}
        </StepRow>
        <StepRow title="Anchor the document hash on the audit trail" status={anchorStatus}>
          {attestation && (
            <p className="mt-0.5 text-soft text-xs">
              HCS topic {attestation.topicId}, message #{attestation.sequenceNumber}.{" "}
              <a
                href={attestation.link}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-ink"
              >
                View on HashScan
              </a>
            </p>
          )}
          {attestError && (
            <p className={`mt-0.5 text-xs ${skipped ? "text-soft" : "text-neg"}`} role="alert">
              {skipped
                ? "The audit trail is disabled on this API (no Hedera operator configured), so the hash was not anchored. The listing itself is live."
                : attestError instanceof ApiError && attestError.status === 409
                  ? `This document is already pledged: ${attestError.message}`
                  : attestError.message}{" "}
              {!skipped && (
                <button type="button" onClick={anchor} className="underline hover:text-ink">
                  Retry
                </button>
              )}
            </p>
          )}
        </StepRow>
      </ol>

      {tx.confirmed ? (
        <div className="mt-2 rounded-xl bg-[#e9f4ee] p-4 text-sm">
          <div className="font-medium">Invoice listed on the marketplace.</div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
            <Link
              href={`/invoices/${quote.quote.invoiceId}`}
              className="flex items-center gap-1 font-medium underline hover:text-ink"
            >
              View the listing <ArrowRight size={13} />
            </Link>
            <Link href="/issuer" className="underline hover:text-ink">
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : !address ? (
        <ConnectButton className={`${blackButton} mt-2`} />
      ) : (
        <button
          type="button"
          disabled={tx.busy || expired || chainId !== activeChain.id}
          onClick={list}
          className={`${blackButton} mt-2`}
        >
          {tx.busy
            ? "Working…"
            : chainId !== activeChain.id
              ? `Switch your wallet to ${activeChain.name}`
              : tx.error
                ? "Retry"
                : "List on-chain"}
        </button>
      )}

      {!tx.confirmed && !tx.busy && (
        <button
          type="button"
          onClick={onDiscard}
          className="mt-3 w-full text-center text-soft text-xs underline hover:text-ink"
        >
          Discard this draft and start over
        </button>
      )}
    </section>
  )
}
