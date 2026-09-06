"use client"

import { BadgeCheck } from "lucide-react"
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
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-xs ${
        granted ? "bg-emerald-50 text-emerald-700" : "bg-amber-400 text-ink hover:bg-amber-300"
      }`}
    >
      {granted && <BadgeCheck className="size-3.5" aria-hidden />}
      {granted ? "Verified" : state === "none" ? "Verify now" : describeState(state).title}
    </Link>
  )
}
