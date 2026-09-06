/**
 * The agent's on-chain side: read the bond, check its own eligibility, and fund it.
 *
 * The market and USDC addresses come from `contracts/deployments/<chainId>.json` — the same file
 * the web app reads — so the agent always targets whatever is deployed.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Address,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  publicActions,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { hederaTestnet } from "viem/chains"

// Only the fragments the agent calls.
export const marketAbi = [
  {
    type: "function",
    name: "bondOf",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "primaryCost",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "buyPrimary",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "uint256" }],
    outputs: [],
  },
] as const

export const bondAbi = [
  {
    type: "function",
    name: "isEligible",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "faceValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const

export type Deployment = {
  chainId: number
  usdc: Address
  invoiceMarket: Address
}

/** Reads the deployment the repo records for a chain; env vars win when set. */
export function deploymentFor(chainId: number): Deployment | undefined {
  const market = process.env.INVOICE_MARKET as Address | undefined
  const usdc = process.env.USDC as Address | undefined
  if (market && usdc) return { chainId, usdc, invoiceMarket: market }
  const file = join(import.meta.dir, "../../../contracts/deployments", `${chainId}.json`)
  if (!existsSync(file)) return undefined
  const d = JSON.parse(readFileSync(file, "utf8")) as Deployment
  return market || usdc
    ? { ...d, ...(market && { invoiceMarket: market }), ...(usdc && { usdc }) }
    : d
}

/** Arc testnet is not in viem/chains yet; the finance core runs there too. */
const arcTestnet = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const

const chains = { 296: hederaTestnet, 5042002: arcTestnet } as const

/** A viem client pair signing with the agent's own key (the one that pays for x402). */
export function clientFor(chainId: number, privateKey: Hex, rpcUrl?: string) {
  const chain = chains[chainId as keyof typeof chains] ?? hederaTestnet
  const account = privateKeyToAccount(privateKey)
  const transport = http(rpcUrl ?? chain.rpcUrls.default.http[0])
  const wallet = createWalletClient({ account, chain, transport }).extend(publicActions)
  return { account, wallet, pub: createPublicClient({ chain, transport }) }
}

export { erc20Abi }
