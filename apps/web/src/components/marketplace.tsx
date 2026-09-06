"use client"

import Link from "next/link"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { useBonds } from "@/lib/use-bonds"
import { BondCard } from "./bond-card"
import { NotDeployed } from "./not-deployed"
import { EmptyState, ErrorState, SkeletonGrid } from "./states"
import { primary } from "./styles"

export function Marketplace({ deployment }: { deployment?: Deployment }) {
  if (!deployment) return <NotDeployed />
  return <Listings market={deployment.invoiceMarket} />
}

function Listings({ market }: { market: Deployment["invoiceMarket"] }) {
  const { data, error, isPending, refetch } = useBonds(market)
  if (isPending) return <SkeletonGrid />
  if (error) return <ErrorState what="the market" onRetry={() => refetch()} />
  if (data.length === 0) {
    return (
      <EmptyState
        title="No bonds listed yet"
        action={
          <Link href="/issuer/new" className={primary}>
            Tokenize an invoice
          </Link>
        }
      >
        The first invoice tokenized on {activeChain.name} will show up here.
      </EmptyState>
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
