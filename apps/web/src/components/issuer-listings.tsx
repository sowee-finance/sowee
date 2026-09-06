"use client"

import { useAccount } from "wagmi"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { useBonds } from "@/lib/use-bonds"
import { BondCard } from "./bond-card"
import { NotDeployed } from "./not-deployed"

/** The connected wallet's own listings. */
export function IssuerListings({ deployment }: { deployment?: Deployment }) {
  const { address } = useAccount()
  const { data, error, isPending } = useBonds(deployment?.invoiceMarket)
  if (!deployment) return <NotDeployed />
  if (!address)
    return <p className="text-sm text-zinc-500">Connect a wallet to see your listings.</p>
  if (isPending) return <p className="text-sm text-zinc-500">Loading listings…</p>
  if (error)
    return <p className="text-red-600 text-sm">Could not read the market: {error.message}</p>
  const mine = data.filter((b) => b.issuer.toLowerCase() === address.toLowerCase())
  if (mine.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-300 border-dashed p-6 text-center text-sm text-zinc-500">
        This wallet has not listed an invoice on {activeChain.name} yet.
      </p>
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
