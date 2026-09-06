import Image from "next/image"
import Link from "next/link"
import { networkBrand } from "@/lib/chains"
import { GithubIcon } from "./ui"

export function Footer() {
  return (
    <footer className="mt-20 border-line border-t bg-[#fafaf8]">
      <div className="container-page py-10">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/favicons/black/android-chrome-192x192.png"
              alt="Sowee"
              width={22}
              height={22}
            />
            <span className="font-medium text-sm">Sowee © 2026</span>
          </div>
          <Link href="/terms" className="text-sm text-soft hover:text-ink">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-sm text-soft hover:text-ink">
            Privacy Policy
          </Link>
          <a
            href="https://github.com/sowee-finance/sowee"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="ml-auto text-soft hover:text-ink"
          >
            <GithubIcon size={18} />
          </a>
        </div>

        <div className="mt-8 columns-1 gap-10 text-[11px] text-faint leading-relaxed md:columns-2 [&>p]:mb-3">
          <p>
            Sowee is a demonstration of compliant invoice financing running live on {networkBrand}{" "}
            testnet. Invoices, bonds, orders, and audit events are real on-chain records in
            test-value assets that carry no monetary value — nothing on this page is an offer to
            sell, or a solicitation of an offer to buy, any security or other financial instrument,
            and nothing here constitutes investment, legal, tax, or financial advice.
          </p>
          <p>
            Invoice-backed bonds involve significant risk, including payor default and possible loss
            of the entire amount invested. Implied APY figures are derived from issuance discounts
            and assume repayment in full at maturity; they are not a guarantee of return. Where such
            instruments are genuinely offered, availability is limited to eligible jurisdictions and
            verified investors, and additional restrictions apply.
          </p>
        </div>
      </div>
    </footer>
  )
}
