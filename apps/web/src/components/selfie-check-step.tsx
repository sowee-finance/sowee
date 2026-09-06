"use client"

import { IDKitInviteCodeRequestWidget, selfieCheckLegacy } from "@worldcoin/idkit"
import { ChevronRight, ScanFace } from "lucide-react"
import { useEffect, useState } from "react"
import type { Address } from "viem"
import { ApiError } from "@/lib/api"
import type { KycAuth } from "@/lib/kyc"
import {
  getWorldRequest,
  toRpContext,
  verifyWorld,
  type WorldRequest,
  worldSignal,
} from "@/lib/world"
import { StepCard } from "./kyc-wizard"

/**
 * World Selfie Check — the anti-sybil signal in front of full KYC.
 *
 * Rendered only when `NEXT_PUBLIC_WORLD_APP_ID` is set (access to Selfie Check is gated per
 * app). The API signs the request (`/v1/world/request`), IDKit opens World App with the
 * `selfieCheckLegacy` preset bound to the wallet, and the proof goes back to the API
 * (`/v1/world/verify`) which records `selfieCheck` for the wallet. Nothing personal is kept.
 */
export function SelfieCheckStep({
  wallet,
  auth,
  onVerified,
  onSkip,
}: {
  wallet: Address
  auth: KycAuth
  onVerified: () => void
  /** Selfie Check is a signal, not a gate: the wizard can continue without it. */
  onSkip: () => void
}) {
  const [request, setRequest] = useState<WorldRequest>()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)

  useEffect(() => {
    getWorldRequest()
      .then(setRequest)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 503
            ? "Selfie Check is not configured on this server yet."
            : "Could not prepare the Selfie Check request.",
        ),
      )
  }, [])

  return (
    <StepCard
      title="Selfie Check"
      lede="A one-time World Selfie Check proves this wallet belongs to one real person before the identity check. It unlocks the demo faucet and a larger API allowance; full eligibility still needs the identity check."
      footer={
        <div className="mt-auto flex flex-col gap-3 pt-5 lg:pt-6">
          <button
            type="button"
            onClick={() => (done ? onVerified() : setOpen(true))}
            disabled={!request || !!error}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#141416] font-medium text-base text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {done ? "Continue" : "Verify with World ID"}
            {done ? (
              <ChevronRight className="size-4" aria-hidden />
            ) : (
              <ScanFace className="size-4" aria-hidden />
            )}
          </button>
          {!done && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-soft underline-offset-4 hover:underline"
            >
              Skip for now
            </button>
          )}
        </div>
      }
    >
      <div className="rounded-xl bg-[#f4f4f5] p-6 text-sm">
        {done ? (
          <p className="font-medium text-pos">
            Selfie Check verified for {wallet.slice(0, 6)}…{wallet.slice(-4)}.
          </p>
        ) : error ? (
          <p className="font-medium text-neg">{error}</p>
        ) : (
          <p className="text-soft">
            World App opens with a 6-character code or a QR; the camera flow runs inside World App,
            and only the proof reaches Sowee.
          </p>
        )}
      </div>
      {request && (
        <IDKitInviteCodeRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={request.app_id}
          action={request.action}
          rp_context={toRpContext(request)}
          allow_legacy_proofs={true}
          preset={selfieCheckLegacy({ signal: worldSignal(wallet) })}
          environment={request.environment}
          handleVerify={async (result) => {
            await verifyWorld(auth, result)
          }}
          onSuccess={() => {
            setDone(true)
            setError(undefined)
          }}
          onError={(code) => setError(`World ID: ${code}`)}
        />
      )}
    </StepCard>
  )
}
