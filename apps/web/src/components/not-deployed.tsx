import { activeChain } from "@/lib/chains"

export function NotDeployed() {
  return (
    <div className="rounded-lg border border-amber-300 border-dashed bg-amber-50 p-6 text-amber-900 text-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">Not deployed on {activeChain.name} yet.</p>
      <p className="mt-1">
        No <code>contracts/deployments/{activeChain.id}.json</code> was found. Run the deploy script
        in <code>contracts/</code> with <code>WRITE_DEPLOYMENTS=true</code>, or set{" "}
        <code>NEXT_PUBLIC_CHAIN_ID</code> to a chain that has one.
      </p>
    </div>
  )
}
