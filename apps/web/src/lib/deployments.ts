import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Address } from "viem"

/** An invoice also issued as a regulated security through Asset Tokenization Studio. */
export type AtsBond = {
  address: Address
  isin: string
  reference: string
  regulation: string
}

/**
 * Shape of `contracts/deployments/<chainId>.json`, written by `script/Deploy.s.sol` and, for
 * `atsBonds`, by `apps/ats` when it issues a security. Keyed by invoice id.
 */
export type Deployment = {
  chainId: number
  usdc: Address
  quoteSigner: Address
  discountOracle: Address
  invoiceMarket: Address
  maturitySettlement: Address
  atsBonds?: Record<string, AtsBond>
}

// Server-only: read from the repo at render time, so the UI picks up a new deployment
// without a code change. Resolved relative to apps/web, which is where `next` runs.
const dir = join(process.cwd(), "../../contracts/deployments")

export function getDeployment(chainId: number): Deployment | undefined {
  const file = join(dir, `${chainId}.json`)
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, "utf8")) as Deployment
}
