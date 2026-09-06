import type { Metadata } from "next"
import { networkBrand } from "@/lib/chains"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Sowee collects and why: identity verification via Sumsub, wallet-keyed eligibility, and what never reaches the chain.",
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl py-16">
      <h1 className="font-medium text-3xl tracking-tight">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-[15px] text-body leading-relaxed">
        <p>
          Sowee runs on {networkBrand} testnet with sandboxed identity verification. No real funds
          are involved, but the flows below handle real personal data and are described as they
          actually work.
        </p>

        <h2 className="pt-2 font-medium text-ink text-lg">Identity verification (KYC)</h2>
        <p>
          Investing on Sowee requires identity verification. During onboarding we collect your legal
          name, date of birth, country of residence, investor-suitability answers, and declarations,
          and submit them to Sumsub, our verification provider, under your wallet address as the
          applicant reference. Document capture and the liveness selfie happen inside Sumsub&apos;s
          widget and are processed by Sumsub (currently in its sandbox environment); Sowee&apos;s
          servers never receive your documents or biometrics — we read back only the review outcome
          and your questionnaire answers to decide eligibility.
        </p>
        <p>
          Your eligibility decision (and nothing else) is written to the chain: a grant or
          revocation of your wallet on each bond&apos;s compliance list. No name, document, image,
          or other personal data — and no hash of any of it — ever reaches the ledger. On-chain
          entries reference only your wallet address.
        </p>

        <h2 className="pt-2 font-medium text-ink text-lg">Wallets and market data</h2>
        <p>
          Connecting a wallet uses the browser extension you already have; no third-party wallet
          service is involved. We use your wallet address to key your verification status and
          eligibility. Marketplace activity (invoices, bonds, orders, audit events) lives on{" "}
          {networkBrand} testnet and its public mirror nodes — like all public-ledger data it is
          world-readable and cannot be deleted.
        </p>

        <h2 className="pt-2 font-medium text-ink text-lg">Documents, logs, and trackers</h2>
        <p>
          Invoice documents selected in the issuer form are hashed in your browser via Web Crypto
          and never leave your device. Our servers keep standard request logs (IP address, request
          path, timestamp) briefly for operations and abuse prevention, and rate-limit requests by
          client IP. This site does not use advertising trackers.
        </p>

        <h2 className="pt-2 font-medium text-ink text-lg">Contact</h2>
        <p>
          Questions or removal requests for off-chain data:{" "}
          <a className="underline" href="mailto:support@sowee.site">
            support@sowee.site
          </a>
          .
        </p>
      </div>
    </div>
  )
}
