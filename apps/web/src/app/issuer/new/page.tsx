import Link from "next/link"
import { IssuerForm } from "@/components/issuer-form"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export default function NewInvoice() {
  return (
    <>
      <Link href="/issuer" className="text-xs text-zinc-500 hover:underline">
        ← Issuer
      </Link>
      <h1 className="mt-2 font-semibold text-2xl">Tokenize an invoice</h1>
      <p className="mt-2 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Price it with a signed quote, open funding on {activeChain.name}, then anchor the document
        hash on the audit trail.
      </p>
      <IssuerForm deployment={getDeployment(activeChain.id)} />
    </>
  )
}
