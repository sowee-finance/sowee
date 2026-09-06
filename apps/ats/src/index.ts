/**
 * Issue an invoice as a regulated security through Asset Tokenization Studio.
 *
 *   bun run src/index.ts issue   --ref INV-2026-010 --name "…" --symbol sATS010 --face 100 --days 30
 *   bun run src/index.ts allow   --token 0x… --account 0x…
 *   bun run src/index.ts mint    --token 0x… --to 0x… --units 10
 *   bun run src/index.ts status  --token 0x… --account 0x…
 *
 * Needs ATS_OPERATOR_PK: the wallet that becomes the security's admin, KYC issuer and issuer.
 */
import type { Address, Hex } from "viem"
import { allow, clients, issueBond, issueUnits, status } from "./ats"

const argv = process.argv.slice(2)
const [command] = argv
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const need = (name: string) => {
  const v = flag(name)
  if (!v) {
    console.error(`missing --${name}`)
    process.exit(1)
  }
  return v
}
const link = (hash: string) => `https://hashscan.io/testnet/transaction/${hash}`

const pk = process.env.ATS_OPERATOR_PK
if (!pk) {
  console.error("set ATS_OPERATOR_PK to the wallet that administers the security")
  process.exit(1)
}
const c = clients(pk as Hex, process.env.RPC_URL)

switch (command) {
  case "issue": {
    const reference = need("ref")
    const days = BigInt(flag("days") ?? 30)
    const bond = await issueBond(c, {
      reference,
      name: flag("name") ?? `Sowee Invoice Bond ${reference}`,
      symbol: flag("symbol") ?? "sATS",
      faceValue: BigInt(need("face")),
      maturity: BigInt(Math.floor(Date.now() / 1000)) + days * 86_400n,
    })
    console.log(`bond     : ${bond.address}`)
    console.log(`isin     : ${bond.isin}`)
    console.log(`deployed : ${link(bond.hash)}`)
    console.log(`contract : https://hashscan.io/testnet/contract/${bond.address}`)
    break
  }
  case "allow": {
    const token = need("token") as Address
    const account = need("account") as Address
    const txs = await allow(c, token, account)
    console.log(txs.length ? `allowed  : ${account}` : `allowed  : ${account} (already configured)`)
    for (const t of txs) console.log(`           ${link(t)}`)
    break
  }
  case "mint": {
    const hash = await issueUnits(
      c,
      need("token") as Address,
      need("to") as Address,
      BigInt(need("units")),
    )
    console.log(`issued   : ${link(hash)}`)
    break
  }
  case "status": {
    console.log(await status(c, need("token") as Address, flag("account") as Address | undefined))
    break
  }
  default:
    console.error("commands: issue | allow | mint | status")
    process.exit(1)
}
