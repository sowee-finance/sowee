/**
 * Sends testnet USDC from the treasury wallet to a demo wallet.
 *
 *   ISSUER_PK=0x… bun run scripts/send-usdc.ts 0xWallet 10
 *
 * It exists because of one failure that looks like nothing: USDC on Hedera is an HTS token, and a
 * transfer to an account that has not associated with it reverts. The sender sees a failed
 * transaction, the recipient sees a balance that never moved, and neither is told why. So this
 * checks the association before spending gas and says so in words.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatUnits,
  type Hex,
  http,
  parseUnits,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { hederaTestnet } from "viem/chains"

const RPC = process.env.RPC_URL ?? "https://testnet.hashio.io/api"
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"
const root = join(import.meta.dir, "..")
const deployment = JSON.parse(readFileSync(join(root, "contracts/deployments/296.json"), "utf8"))
const usdc = deployment.usdc as Address

const [to, amount] = process.argv.slice(2)
const pk = process.env.ISSUER_PK as Hex | undefined
if (!to || !amount || !pk) {
  console.error("usage: ISSUER_PK=0x… bun run scripts/send-usdc.ts <to> <amount in USDC>")
  process.exit(1)
}

const erc20 = [
  {
    type: "function",
    name: "transfer",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const

/** An HTS token's EVM address is its entity number in the low bytes. */
const htsId = `0.0.${BigInt(usdc).toString(10)}`

/** Whether the account holds a relationship with the token — the thing a failed transfer means. */
async function associated(wallet: string): Promise<boolean> {
  const res = await fetch(`${MIRROR}/accounts/${wallet}/tokens?token.id=${htsId}&limit=1`)
  if (!res.ok) throw new Error(`mirror node answered ${res.status}`)
  const body = (await res.json()) as { tokens?: unknown[] }
  return (body.tokens?.length ?? 0) > 0
}

const account = privateKeyToAccount(pk)
const publicClient = createPublicClient({ chain: hederaTestnet, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http(RPC) })
const value = parseUnits(amount, 6)

const balanceOf = (who: Address) =>
  publicClient.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [who] })

const held = await balanceOf(account.address)
console.log(`treasury ${account.address} holds ${formatUnits(held, 6)} USDC`)
if (held < value) {
  console.error(`not enough: asked to send ${amount}, holds ${formatUnits(held, 6)}`)
  process.exit(1)
}

if (!(await associated(to))) {
  console.error(`${to} has not associated with USDC (${htsId}); the transfer would revert.`)
  console.error("The recipient associates it themselves — the app's buy form has the button.")
  process.exit(1)
}

const hash = await wallet.writeContract({
  address: usdc,
  abi: erc20,
  functionName: "transfer",
  args: [to as Address, value],
})
const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== "success") {
  console.error(`transfer reverted (${hash})`)
  process.exit(1)
}

console.log(`sent ${amount} USDC to ${to}`)
console.log(`  ${hash}`)
console.log(`  treasury now ${formatUnits(await balanceOf(account.address), 6)} USDC`)
console.log(`  recipient now ${formatUnits(await balanceOf(to as Address), 6)} USDC`)
