import type { Metadata } from "next"
import { IssuerForm } from "@/components/issuer-form"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export const metadata: Metadata = {
  title: "Tokenize an Invoice",
  description: "Price an unpaid invoice with a signed quote and list it as a bond.",
}

export default function NewInvoice() {
  return <IssuerForm deployment={getDeployment(activeChain.id)} />
}
