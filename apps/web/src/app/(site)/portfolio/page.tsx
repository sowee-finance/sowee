import type { Metadata } from "next"
import { Portfolio } from "@/components/portfolio"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Your invoice bond holdings and claimable settlements in one place.",
}

export default function PortfolioPage() {
  return <Portfolio deployment={getDeployment(activeChain.id)} />
}
