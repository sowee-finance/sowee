"use client"

import type { Address } from "viem"
import { box, secondary } from "./styles"

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
    <section className={box}>
      <h2 className="font-medium">Selfie Check</h2>
      <p className="mt-2 text-amber-700 dark:text-amber-400">
        Coming soon: requires Selfie Check access.
      </p>
      <p className="mt-1 text-zinc-500">
        A one-time World Selfie Check will prove that {wallet} belongs to one real person before the
        identity check. Until access is granted this step does nothing.
      </p>
      <button type="button" className={`${secondary} mt-3`} onClick={onVerified}>
        Continue
      </button>
    </section>
  )
}
