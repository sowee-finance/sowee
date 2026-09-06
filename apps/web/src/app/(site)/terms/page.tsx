import type { Metadata } from "next"
import { networkBrand } from "@/lib/chains"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for the Sowee invoice financing demo.",
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl py-16">
      <h1 className="font-medium text-3xl tracking-tight">Terms of Service</h1>
      <div className="mt-6 space-y-4 text-[15px] text-body leading-relaxed">
        <p>
          Sowee is a demonstration of compliant invoice financing running live on {networkBrand}{" "}
          testnet. By using this site you acknowledge that it is provided as-is, without warranties
          of any kind. Transactions you sign are real and permanently recorded on the public testnet
          ledger, but they involve only test-value assets with no monetary value; Sowee does not
          custody assets or provide brokerage services.
        </p>
        <p>
          Investing requires identity verification. The declarations you make during onboarding are
          enforced: they determine your on-chain eligibility, and false statements void it.
          Verification currently runs in our provider&apos;s sandbox environment.
        </p>
        <p>
          Nothing on this site constitutes investment, legal, tax, or financial advice, or an offer
          to buy or sell any security or other financial instrument. Implied yields are illustrative
          calculations, not promises of return.
        </p>
        <p>
          You are responsible for complying with the laws of your jurisdiction when interacting with
          digital assets.
        </p>
      </div>
    </div>
  )
}
