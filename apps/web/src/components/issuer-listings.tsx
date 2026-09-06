"use client"

import Link from "next/link"
import { useAccount } from "wagmi"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { useBonds } from "@/lib/use-bonds"
import { BondCard } from "./bond-card"
import { NotDeployed } from "./not-deployed"
import { EmptyState, ErrorState, SkeletonGrid } from "./states"
import { primary } from "./styles"

/** The connected wallet's own listings. */
export function IssuerListings({ deployment }: { deployment?: Deployment }) {
  const { address } = useAccount()
  const { data, error, isPending, refetch } = useBonds(deployment?.invoiceMarket)
  if (!deployment) return <NotDeployed />
  if (!address) {
    return (
      <EmptyState title="No wallet connected">
        Connect the wallet that issues invoices to see its listings.
      </EmptyState>
    )
  }
  if (isPending) return <SkeletonGrid />
  if (error) return <ErrorState what="the market" onRetry={() => refetch()} />
  const mine = data.filter((b) => b.issuer.toLowerCase() === address.toLowerCase())
  if (mine.length === 0) {
    return (
      <EmptyState
        title="Nothing listed from this wallet"
        action={
          <Link href="/issuer/new" className={primary}>
            Tokenize an invoice
          </Link>
        }
      >
        Invoices this wallet tokenizes on {activeChain.name} will show up here.
      </EmptyState>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {mine.map((b) => (
        <BondCard key={b.invoiceId} bond={b} />
      ))}
    </div>
  )
}
