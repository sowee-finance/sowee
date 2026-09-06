import type { Metadata } from "next"
import Link from "next/link"
import { Marketplace } from "@/components/marketplace"
import { primary, secondary } from "@/components/styles"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

// The root segment shares the layout's segment, so the `%s · Sowee` template does not apply here.
export const metadata: Metadata = { title: "Marketplace · Sowee" }

export default function Home() {
  return (
    <>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
            Invoice bonds, funded in USDC
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Sowee turns an unpaid invoice into a KYC-gated, fractional bond token on{" "}
            {activeChain.name}: fund it at a discount, trade it before maturity, and get paid
            pro-rata when the payor settles.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-sm">
          <Link href="/kyc" className={secondary}>
            Verify to invest
          </Link>
          <Link href="/issuer/new" className={primary}>
            Tokenize an invoice
          </Link>
        </div>
      </section>
      <Marketplace deployment={getDeployment(activeChain.id)} />
    </>
  )
}
