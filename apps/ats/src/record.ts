/**
 * Records an issued security in `contracts/deployments/<chainId>.json` — the same file the web app
 * reads for contract addresses — so an invoice with a regulated twin can say so in the UI without
 * anyone copying an address by hand.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type Address, keccak256, toBytes } from "viem"

export type AtsBondRecord = {
  address: Address
  isin: string
  reference: string
  regulation: string
}

const deploymentsDir = join(import.meta.dir, "../../../contracts/deployments")

/** Invoice ids are `keccak256(reference)`, the same derivation the API and the market use. */
export const invoiceIdFor = (reference: string) => keccak256(toBytes(reference)).toLowerCase()

export function recordAtsBond(chainId: number, record: AtsBondRecord): string {
  const file = join(deploymentsDir, `${chainId}.json`)
  if (!existsSync(file)) {
    throw new Error(`no deployment recorded for chain ${chainId} (${file})`)
  }
  const deployment = JSON.parse(readFileSync(file, "utf8")) as {
    atsBonds?: Record<string, AtsBondRecord>
  }
  deployment.atsBonds = { ...deployment.atsBonds, [invoiceIdFor(record.reference)]: record }
  writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`)
  return file
}
