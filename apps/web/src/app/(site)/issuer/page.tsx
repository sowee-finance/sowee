import type { Metadata } from "next"
import { IssuerDashboard } from "@/components/issuer-listings"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export const metadata: Metadata = {
  title: "Issuer Dashboard",
  description: "Manage your tokenized invoices and track their funding and settlement.",
}

export default function Issuer() {
  return <IssuerDashboard deployment={getDeployment(activeChain.id)} />
}
