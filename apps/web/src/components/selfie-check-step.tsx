"use client"

import { ChevronRight } from "lucide-react"
import type { Address } from "viem"
import { StepCard } from "./kyc-wizard"

/**
 * World Selfie Check: the anti-sybil signal in front of full KYC.
 *
 * Extension point, rendered only when `NEXT_PUBLIC_WORLD_APP_ID` is set. Once Selfie Check
 * access is granted: add `@worldcoin/idkit`, open `IDKitWidget` here with that app id, an
 * action such as `sowee-kyc` and `signal = wallet`, send the proof to the API for server-side
 * verification (it records `selfieCheck` on the wallet), then call `onVerified()`.
 */
export function SelfieCheckStep({
  wallet,
  onVerified,
}: {
  wallet: Address
  onVerified: () => void
}) {
  return (
    <StepCard
      title="Selfie Check"
      lede="A one-time World Selfie Check proves that this wallet belongs to one real person before the identity check."
      footer={
        <div className="mt-auto pt-5 lg:pt-6">
          <button
            type="button"
            onClick={onVerified}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#141416] font-medium text-base text-white transition-colors hover:bg-black"
          >
            Continue <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      }
    >
      <div className="rounded-xl bg-[#f4f4f5] p-6">
        <p className="font-medium text-amber-700 text-sm">
          Coming soon: requires Selfie Check access.
        </p>
        <p className="mt-2 text-sm text-soft">
          Until access is granted this step does nothing for {wallet}.
        </p>
      </div>
    </StepCard>
  )
}
