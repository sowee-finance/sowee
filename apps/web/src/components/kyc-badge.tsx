"use client"

import Link from "next/link"
import { useAccount } from "wagmi"
import { describeState } from "@/lib/kyc"
import { useKycStatus } from "@/lib/use-kyc"

/** Header pill with the connected wallet's KYC state; hidden when KYC is unavailable. */
export function KycBadge() {
  const { address, isConnected } = useAccount()
  const status = useKycStatus(isConnected ? address : undefined)
  if (!address || !status.data) return null
  const state = status.data.state
  const granted = state === "granted"
  return (
    <Link
      href="/kyc"
      title={describeState(state).detail}
      className={`rounded-full border px-2.5 py-1 text-xs ${
        granted
          ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
          : "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
      }`}
    >
      {granted ? "✓ Verified" : state === "none" ? "Verify" : describeState(state).title}
    </Link>
  )
}
