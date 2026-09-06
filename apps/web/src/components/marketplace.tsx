"use client"

import type { Deployment } from "@/lib/deployments"
import { useBonds } from "@/lib/use-bonds"
import { BondCard } from "./bond-card"
import { NotDeployed } from "./not-deployed"

export function Marketplace({ deployment }: { deployment?: Deployment }) {
  if (!deployment) return <NotDeployed />
  return <Listings market={deployment.invoiceMarket} />
}

function Listings({ market }: { market: Deployment["invoiceMarket"] }) {
  const { data, error, isPending } = useBonds(market)
  if (isPending) return <p className="text-sm text-zinc-500">Loading listings…</p>
  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
        Could not read the market: {error.message}
      </p>
    )
  }
  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-300 border-dashed p-6 text-center text-sm text-zinc-500">
        No invoices listed yet.
      </p>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((b) => (
        <BondCard key={b.invoiceId} bond={b} />
      ))}
    </div>
  )
}
