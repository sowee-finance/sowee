"use client"

import Link from "next/link"
import {
  type Bond,
  bondStatus,
  dollars,
  fundedPct,
  impliedApr,
  pct,
  pricePath,
  splitName,
  tenorDays,
} from "@/lib/market"
import { Sparkline } from "./charts"
import { CompanyAvatar, STATUS_TREND, StatusBadge, TREND_FILL, TrendText } from "./ui"

/** Issuer company and payor from the token name; a bond named otherwise shows its symbol. */
export const bondNames = (b: Pick<Bond, "name">) => splitName(b.name)

/** Marketplace card for one invoice bond. */
export function BondCard({ bond }: { bond: Bond }) {
  const status = bondStatus(bond)
  const trend = STATUS_TREND[status]
  const apr = impliedApr(bond)
  const days = Math.max(tenorDays(bond.maturity), 0)
  const { issuer, payor } = bondNames(bond)
  return (
    <Link
      href={`/invoices/${bond.invoiceId}`}
      className="asset-card block overflow-hidden rounded-3xl border border-line"
      style={{ "--card-tint": TREND_FILL[trend] } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 p-5 pb-0">
        <CompanyAvatar name={issuer} />
        <div className="min-w-0">
          <div className="truncate font-medium text-[15px]">{issuer}</div>
          <div className="truncate text-[13px] text-soft">
            {payor ? `Payor: ${payor}` : bond.symbol}
          </div>
        </div>
        <StatusBadge status={status} className="ml-auto" />
      </div>

      <div className="px-5 pt-4">
        <div className="tabular font-medium text-[28px] tracking-tight">
          {dollars(bond.faceValue)}
        </div>
        <TrendText trend={trend} className="mt-1 text-xs">
          {apr === undefined ? "Matured" : `${pct(apr)} APY`} ({fundedPct(bond).toFixed(0)}% funded){" "}
          {days}D
        </TrendText>
      </div>

      {/* h-27.5 = 110px, the Sparkline viewBox height */}
      <div className="mt-2 h-27.5">
        <Sparkline values={pricePath(bond)} trend={trend} />
      </div>
    </Link>
  )
}
