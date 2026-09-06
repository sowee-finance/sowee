import type { Metadata } from "next"
import { KycWizard } from "@/components/kyc-wizard"

export const metadata: Metadata = {
  title: "Identity Verification",
  description:
    "Verify your identity once and this wallet becomes eligible on every live listing — compliance enforced at the token layer.",
}

// The onboarding wizard is a focused, full-page journey with its own chrome (no app header).
export default function Kyc() {
  return <KycWizard />
}
