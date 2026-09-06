import { Marketplace } from "@/components/marketplace"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export default function Home() {
  return (
    <>
      <h1 className="font-semibold text-2xl">Marketplace</h1>
      <p className="mt-2 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Invoice bonds open for funding on {activeChain.name}.
      </p>
      <Marketplace deployment={getDeployment(activeChain.id)} />
    </>
  )
}
