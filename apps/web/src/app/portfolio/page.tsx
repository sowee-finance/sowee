import { Portfolio } from "@/components/portfolio"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export default function PortfolioPage() {
  return (
    <>
      <h1 className="font-semibold text-2xl">Portfolio</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Your bond units, open asks and settlement claims on {activeChain.name}.
      </p>
      <Portfolio deployment={getDeployment(activeChain.id)} />
    </>
  )
}
