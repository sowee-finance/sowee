import { defineChain } from "viem"
import { anvil, hederaTestnet } from "viem/chains"

/** Arc testnet (Circle): USDC is the native gas token, 18 decimals on the native balance. */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
})

export const chains = [hederaTestnet, arcTestnet, anvil] as const

/** Chain the UI reads from and asks the wallet to be on. Hedera testnet unless overridden. */
export const activeChain =
  chains.find((c) => c.id === Number(process.env.NEXT_PUBLIC_CHAIN_ID)) ?? hederaTestnet

/** How copy names the network: "Hedera" for its testnet, the chain name elsewhere. */
export const networkBrand = activeChain.id === hederaTestnet.id ? "Hedera" : activeChain.name

const explorers: Record<number, { contract: string; account: string; tx: string; topic?: string }> =
  {
    [hederaTestnet.id]: {
      contract: "https://hashscan.io/testnet/contract/",
      account: "https://hashscan.io/testnet/account/",
      tx: "https://hashscan.io/testnet/transaction/",
      topic: "https://hashscan.io/testnet/topic/",
    },
    [arcTestnet.id]: {
      // Arcscan puts accounts and contracts on the same path.
      contract: "https://testnet.arcscan.app/address/",
      account: "https://testnet.arcscan.app/address/",
      tx: "https://testnet.arcscan.app/tx/",
    },
  }

export function explorerUrl(address: string): string | undefined {
  const e = explorers[activeChain.id]
  return e ? e.contract + address : undefined
}

/** A wallet rather than a contract; HashScan keeps them on separate paths. */
export function accountUrl(address: string): string | undefined {
  const e = explorers[activeChain.id]
  return e ? e.account + address : undefined
}

export function topicUrl(topicId: string): string | undefined {
  return explorers[activeChain.id]?.topic?.concat(topicId)
}

export function txUrl(hash: string): string | undefined {
  const e = explorers[activeChain.id]
  return e ? e.tx + hash : undefined
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
