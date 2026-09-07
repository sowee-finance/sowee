"use client"

import { CalendarDays, FilePlus2, FileText, Landmark } from "lucide-react"
import Link from "next/link"
import { useAccount } from "wagmi"
import { activeChain, shortAddress } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { type Bond, bondStatus, dollars, fundedPct, maturityDate } from "@/lib/market"
import { useBonds } from "@/lib/use-bonds"
import { bondNames } from "./bond-card"
import { NotDeployed } from "./not-deployed"
import { ErrorState } from "./states"
import { Card, Empty, Progress, StatTile, StatusBadge, UsdcIcon, WalletAvatar } from "./ui"
import { ConnectPrompt } from "./wallet-button"

function InvoiceRow({ bond }: { bond: Bond }) {
  const { payor } = bondNames(bond)
  return (
    <tr>
      <td className="py-3 pr-4">
        <Link href={`/invoices/${bond.invoiceId}`} className="font-mono text-xs hover:underline">
          {bond.symbol}
        </Link>
      </td>
      <td className="py-3 pr-4">{payor ?? "—"}</td>
      <td className="tabular py-3 pr-4">{dollars(bond.faceValue)}</td>
      <td className="tabular py-3 pr-4">{maturityDate(bond.maturity)}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <Progress pct={fundedPct(bond)} className="w-20" />
          <span className="tabular text-soft text-xs">{fundedPct(bond).toFixed(0)}%</span>
        </div>
      </td>
      <td className="py-3">
        <StatusBadge status={bondStatus(bond)} />
      </td>
    </tr>
  )
}

/** The connected wallet's own listings: stat tiles and a table. */
export function IssuerDashboard({ deployment }: { deployment?: Deployment }) {
  const { address } = useAccount()
  const { data, error, isPending, refetch } = useBonds(deployment)
  if (!deployment) return <NotDeployed />
  if (!address) {
    return (
      <ConnectPrompt icon={Landmark} title="Issuer dashboard">
        Connect the wallet that issues invoices to manage your tokenized invoices.
      </ConnectPrompt>
    )
  }
  const mine = (data ?? []).filter((b) => b.issuer.toLowerCase() === address.toLowerCase())
  const outstanding = mine
    .filter((b) => bondStatus(b) !== "settled")
    .reduce((s, b) => s + b.faceValue, 0n)
  const next = mine
    .filter((b) => b.maturity * 1000 > Date.now())
    .map((b) => b.maturity)
    .sort((a, b) => a - b)[0]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 py-8">
        <div className="flex items-center gap-3">
          <WalletAvatar className="size-9" />
          <div>
            <h1 className="font-medium text-xl tracking-tight">{shortAddress(address)}</h1>
            <p className="text-soft text-xs">Issuer wallet · {activeChain.name}</p>
          </div>
        </div>
        <Link
          href="/issuer/new"
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-medium text-sm text-white hover:bg-black"
        >
          <FilePlus2 size={16} />
          Tokenize an Invoice
        </Link>
      </div>

      <Card>
        <h2 className="font-medium text-[15px]">My Invoices</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            icon={<FileText size={24} className="text-soft" strokeWidth={1.75} />}
            name="Invoices tokenized"
            value={isPending ? "…" : String(mine.length)}
            tint="bg-[#f6f6f4]"
          />
          <StatTile
            icon={<UsdcIcon size={26} />}
            name="Outstanding face value"
            value={isPending ? "…" : dollars(outstanding)}
            tint="bg-[#e9f1fc]"
          />
          <StatTile
            icon={<CalendarDays size={24} className="text-pos" strokeWidth={1.75} />}
            name="Next maturity"
            value={isPending ? "…" : next ? maturityDate(next) : "—"}
            tint="bg-[#e9f4ee]"
          />
        </div>

        {isPending ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-shade" />
        ) : error ? (
          <ErrorState what="the market" onRetry={() => refetch()} />
        ) : mine.length === 0 ? (
          <Empty icon={FileText}>
            No invoices issued by this wallet yet. Tokenize your first invoice to list it on the
            marketplace.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-line border-b text-soft text-xs">
                  <th className="py-2.5 pr-4 font-medium">Invoice</th>
                  <th className="py-2.5 pr-4 font-medium">Payor</th>
                  <th className="py-2.5 pr-4 font-medium">Face value</th>
                  <th className="py-2.5 pr-4 font-medium">Due</th>
                  <th className="py-2.5 pr-4 font-medium">Funded</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {mine.map((b) => (
                  <InvoiceRow key={b.invoiceId} bond={b} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
