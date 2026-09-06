import { skipToken, useQuery } from "@tanstack/react-query"
import type { Address, Hex } from "viem"
import { usePublicClient } from "wagmi"
import { activeChain } from "./chains"
import { fetchBond, fetchBonds } from "./market"

// Reads always go to the active chain, whatever chain the wallet is on.
export function useBonds(market: Address | undefined) {
  const client = usePublicClient({ chainId: activeChain.id })
  return useQuery({
    queryKey: ["bonds", activeChain.id, market],
    queryFn: client && market ? () => fetchBonds(client, market) : skipToken,
  })
}

export function useBond(market: Address | undefined, invoiceId: Hex) {
  const client = usePublicClient({ chainId: activeChain.id })
  return useQuery({
    queryKey: ["bond", activeChain.id, market, invoiceId],
    queryFn: client && market ? () => fetchBond(client, market, invoiceId) : skipToken,
  })
}
