"use client"

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { activeChain, shortAddress } from "@/lib/chains"

const button =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()

  if (!isConnected || !address) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-red-600 text-xs">{error.message}</span>}
        <button
          type="button"
          className={button}
          disabled={isPending}
          onClick={() => connect({ connector: connectors[0] })}
        >
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
      </div>
    )
  }

  // The header pill already names the network, so a wallet on the right chain shows only its address.
  const wrongChain = chainId !== activeChain.id
  return (
    <div className="flex items-center gap-2 text-sm">
      {wrongChain && (
        <button
          type="button"
          className={`${button} border-amber-500 text-amber-700 dark:text-amber-400`}
          disabled={switching}
          onClick={() => switchChain({ chainId: activeChain.id })}
        >
          {switching ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      )}
      <button type="button" className={button} onClick={() => disconnect()} title="Disconnect">
        {shortAddress(address)}
      </button>
    </div>
  )
}
