import { skipToken, useQuery } from "@tanstack/react-query"
import type { Address, Hex } from "viem"
import { usePublicClient } from "wagmi"
import { activeChain } from "./chains"
import type { Deployment } from "./deployments"
import { type Contracts, fetchAsks, fetchBond, fetchBonds, fetchPositions } from "./market"

// Reads always go to the active chain, whatever chain the wallet is on.
export function useBonds(d: Contracts | undefined) {
  const client = usePublicClient({ chainId: activeChain.id })
  return useQuery({
    queryKey: ["bonds", activeChain.id, d?.invoiceMarket],
    queryFn: client && d ? () => fetchBonds(client, d) : skipToken,
  })
}

export function useBond(d: Contracts | undefined, invoiceId: Hex) {
  const client = usePublicClient({ chainId: activeChain.id })
  return useQuery({
    queryKey: ["bond", activeChain.id, d?.invoiceMarket, invoiceId],
    queryFn: client && d ? () => fetchBond(client, d, invoiceId) : skipToken,
  })
}

export function useAsks(market: Address | undefined) {
  const client = usePublicClient({ chainId: activeChain.id })
  return useQuery({
    queryKey: ["asks", activeChain.id, market],
    queryFn: client && market ? () => fetchAsks(client, market) : skipToken,
  })
}

export function usePositions(deployment: Deployment | undefined, wallet: Address | undefined) {
  const client = usePublicClient({ chainId: activeChain.id })
  return useQuery({
    queryKey: ["positions", activeChain.id, deployment?.invoiceMarket, wallet],
    queryFn:
      client && deployment && wallet ? () => fetchPositions(client, deployment, wallet) : skipToken,
  })
}
