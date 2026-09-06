import type { Metadata } from "next"
import { KycWizard } from "@/components/kyc-wizard"

export const metadata: Metadata = { title: "Investor onboarding" }

export default function Kyc() {
  return (
    <>
      <h1 className="font-semibold text-2xl">Investor onboarding</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Buying, filling and receiving bond units requires a wallet on the bond's allowlist. Verify
        once; the grant applies to every bond.
      </p>
      <KycWizard />
    </>
  )
}
