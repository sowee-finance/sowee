import Link from "next/link"
import { IssuerListings } from "@/components/issuer-listings"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export default function Issuer() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Issuer</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Invoices you have tokenized on {activeChain.name}.
          </p>
        </div>
        <Link
          href="/issuer/new"
          className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-sm text-white hover:bg-emerald-700"
        >
          New invoice
        </Link>
      </div>
      <div className="mt-6">
        <IssuerListings deployment={getDeployment(activeChain.id)} />
      </div>
    </>
  )
}
