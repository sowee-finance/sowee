import { anvil, hederaTestnet } from "viem/chains"

export const chains = [hederaTestnet, anvil] as const

/** Chain the UI reads from and asks the wallet to be on. Hedera testnet unless overridden. */
export const activeChain =
  chains.find((c) => c.id === Number(process.env.NEXT_PUBLIC_CHAIN_ID)) ?? hederaTestnet

export function explorerUrl(address: string): string | undefined {
  if (activeChain.id !== hederaTestnet.id) return undefined
  return `https://hashscan.io/testnet/contract/${address}`
}

export function txUrl(hash: string): string | undefined {
  if (activeChain.id !== hederaTestnet.id) return undefined
  return `https://hashscan.io/testnet/transaction/${hash}`
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
