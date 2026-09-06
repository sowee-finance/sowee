"use client"

import { X } from "lucide-react"
import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import type { Hex } from "viem"
import { activeChain, explorerUrl, shortAddress } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { hcsAvailable, topicId } from "@/lib/hcs"
import {
  type Bond,
  bondStatus,
  bpsToPct,
  dollars,
  fundedPct,
  impliedApr,
  maturityDate,
  pct,
  relativeMaturity,
  tenorDays,
} from "@/lib/market"
import { useBond } from "@/lib/use-bonds"
import { SecondaryMarket } from "./asks"
import { AuditTrail } from "./audit-trail"
import { bondNames } from "./bond-card"
import { BuyForm } from "./buy-form"
import { type Point, PriceChart } from "./charts"
import { NotDeployed } from "./not-deployed"
import { EmptyState, ErrorState, SkeletonLine } from "./states"
import {
  blackPill,
  CompanyAvatar,
  KVRow,
  Progress,
  SectionTitle,
  Sheet,
  STATUS_TREND,
  StatusBadge,
} from "./ui"

export function BondDetail({ deployment, invoiceId }: { deployment?: Deployment; invoiceId: Hex }) {
  if (!deployment) return <NotDeployed />
  return <Loaded deployment={deployment} invoiceId={invoiceId} />
}

/**
 * Whole-issue value from today to maturity: the discounted cost accreting linearly to face
 * (synthetic; there is no on-chain price history). Flat at face once matured.
 */
function accretion(bond: Bond, now: number, n = 96): Point[] {
  const face = Number(bond.faceValue) / 1e6
  const end = bond.maturity * 1000
  if (end <= now) {
    return [
      { timestamp: end - 30 * 86_400_000, value: face },
      { timestamp: end, value: face },
    ]
  }
  const cost = face * (1 - bond.discountRateBps / 10_000)
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return { timestamp: Math.round(now + (end - now) * t), value: cost + (face - cost) * t }
  })
}

function Loaded({ deployment, invoiceId }: { deployment: Deployment; invoiceId: Hex }) {
  const { data: bond, error, isPending, refetch } = useBond(deployment, invoiceId)
  const [sheetOpen, setSheetOpen] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  // Client-only clock, fixed per load, so the chart never renders on the server.
  const [now] = useState(() => Date.now())
  const points = useMemo(() => (bond ? accretion(bond, now) : []), [bond, now])

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 py-8 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_488px]">
        <div>
          <SkeletonLine className="h-9 w-72" />
          <SkeletonLine className="mt-8 h-10 w-32" />
          <SkeletonLine className="w-64" />
          <div className="mt-6 h-[380px] animate-pulse rounded-2xl bg-shade" />
        </div>
        <div className="hidden h-96 animate-pulse rounded-3xl bg-shade lg:block" />
      </div>
    )
  }
  if (error) {
    if (error.message.includes("UnknownInvoice")) {
      return (
        <EmptyState
          title="No bond with this invoice id"
          action={
            <Link href="/" className={blackPill}>
              Back to Marketplace
            </Link>
          }
        >
          Nothing is listed under this id on {activeChain.name}. The link may be for another chain.
        </EmptyState>
      )
    }
    return <ErrorState what="this bond" onRetry={() => refetch()} />
  }

  const status = bondStatus(bond)
  const trend = STATUS_TREND[status]
  const { issuer, payor } = bondNames(bond)
  const apr = impliedApr(bond)
  const days = tenorDays(bond.maturity)
  const explorer = explorerUrl(bond.bond)
  const target = (bond.faceValue * BigInt(10_000 - bond.discountRateBps)) / 10_000n
  const raised = (bond.supply * BigInt(10_000 - bond.discountRateBps)) / 10_000n
  const widget = <BuyForm bond={bond} deployment={deployment} />

  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 py-8 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_488px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              aria-label="Back to Marketplace"
              className="flex size-9 items-center justify-center rounded-full border border-line text-soft hover:text-ink"
            >
              <X size={16} />
            </Link>
            <CompanyAvatar name={issuer} className="size-7 text-[9px]" />
            <h1 className="font-medium text-lg">
              {issuer} <span className="font-normal text-soft">{bond.symbol}</span>
            </h1>
            <div className="ml-auto">
              <StatusBadge status={status} />
            </div>
          </div>

          <div className="mt-6">
            <div className="tabular font-medium text-4xl tracking-tight">
              {apr === undefined ? bpsToPct(bond.discountRateBps) : pct(apr)}
            </div>
            <div className="mt-1.5 text-[13px] text-soft">
              {apr === undefined
                ? `issuance discount · ${relativeMaturity(bond.maturity)}`
                : `implied APY · ${bpsToPct(bond.discountRateBps)} discount over ${days} days`}
            </div>
          </div>

          {/* Zero-coupon carrying value: the discounted cost accreting to face. */}
          <div className="mt-5">
            <PriceChart points={points} trend={trend} />
          </div>

          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionTitle>Funding Progress</SectionTitle>
              <span className="tabular text-sm text-soft">
                {dollars(raised)} raised · {fundedPct(bond).toFixed(0)}% of target
              </span>
            </div>
            <Progress pct={fundedPct(bond)} className="mt-4 h-2" />
            <div className="mt-2 flex justify-between text-soft text-xs">
              <span>
                Target <span className="tabular">{dollars(target)}</span> (face − discount)
              </span>
              <span>
                Repays <span className="tabular">{dollars(bond.faceValue)}</span> at maturity
              </span>
            </div>
          </section>

          <SecondaryMarket bond={bond} deployment={deployment} />

          <section className="mt-12">
            <SectionTitle>About this Invoice</SectionTitle>
            <p className="mt-3 text-[15px] text-body leading-relaxed">
              An unpaid invoice from {issuer}
              {payor ? ` to ${payor}` : ""}, tokenized as a compliant bond on {activeChain.name}.
              Investors fund it at a {bpsToPct(bond.discountRateBps)} discount and holders receive{" "}
              {dollars(bond.faceValue)} in USDC pro-rata when the payor settles at maturity.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-x-10 md:grid-cols-2">
              <KVRow label="Face Value">{dollars(bond.faceValue)}</KVRow>
              {payor && (
                <KVRow label="Payor">
                  <span className="flex items-center gap-2">
                    <CompanyAvatar name={payor} className="size-5 text-[9px]" />
                    {payor}
                  </span>
                </KVRow>
              )}
              <KVRow label="Issuer wallet">
                <span className="font-mono text-[13px]" title={bond.issuer}>
                  {shortAddress(bond.issuer)}
                </span>
              </KVRow>
              <KVRow label="Maturity">{maturityDate(bond.maturity)}</KVRow>
              <KVRow label="Time to Maturity">{days > 0 ? `${days} days` : "Matured"}</KVRow>
              <KVRow label="Issuance Discount">{bpsToPct(bond.discountRateBps)}</KVRow>
              <KVRow label="Price per 1 USDC Face">
                ${(1 - bond.discountRateBps / 10_000).toFixed(4)}
              </KVRow>
              <KVRow label="Funded">
                {dollars(bond.supply)} of {dollars(bond.faceValue)}
              </KVRow>
              <KVRow label="Bond token">
                {explorer ? (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[13px] hover:underline"
                    title={bond.bond}
                  >
                    {shortAddress(bond.bond)} ↗
                  </a>
                ) : (
                  <span className="font-mono text-[13px]">{shortAddress(bond.bond)}</span>
                )}
              </KVRow>
              <KVRow
                label="Invoice id"
                info="keccak256 of the issuer's invoice reference; the key of every on-chain record."
              >
                <span className="font-mono text-[13px]" title={bond.invoiceId}>
                  {shortAddress(bond.invoiceId)}
                </span>
              </KVRow>
              {hcsAvailable && (
                <KVRow label="HCS Topic">
                  <span className="font-mono text-[13px]">{topicId}</span>
                </KVRow>
              )}
            </div>
          </section>

          <AuditTrail invoiceId={bond.invoiceId} />
        </div>

        <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">{widget}</div>
      </div>

      {/* Below lg the buy panel lives in a bottom sheet. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-line border-t bg-white p-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="h-12 w-full rounded-xl bg-ink font-medium text-sm text-white"
        >
          {status === "open" ? "Fund Invoice" : "View Order Panel"}
        </button>
      </div>
      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        closeLabel="Close order panel"
        className="lg:hidden"
        panelClassName="max-h-[85svh] overflow-y-auto p-3"
      >
        {widget}
      </Sheet>
    </>
  )
}
