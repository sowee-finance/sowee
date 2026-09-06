import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { chains } from "./chains"

// Injected wallets only (MetaMask, HashPack EVM, Rabby...). No WalletConnect project id needed.
export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: { [chains[0].id]: http(), [chains[1].id]: http() },
  ssr: true,
})

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig
  }
}
