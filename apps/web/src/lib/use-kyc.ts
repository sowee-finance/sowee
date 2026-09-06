import { skipToken, useQuery } from "@tanstack/react-query"
import type { Address } from "viem"
import { getStatus } from "./kyc"

/** The wallet's KYC decision from the API. `refetchInterval` turns on polling (status step). */
export function useKycStatus(wallet: Address | undefined, refetchInterval?: number) {
  return useQuery({
    queryKey: ["kyc", wallet?.toLowerCase()],
    queryFn: wallet ? () => getStatus(wallet) : skipToken,
    refetchInterval,
    retry: false,
  })
}
