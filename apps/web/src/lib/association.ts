import { skipToken, useQuery } from "@tanstack/react-query"
import type { Address } from "viem"
import { hederaTestnet } from "viem/chains"
import { activeChain } from "./chains"

/**
 * USDC on Hedera is an HTS token, and an account cannot hold one it has not associated with. A
 * new wallet therefore reads a balance of zero that no faucet, sale or claim can ever move, and
 * the only symptom is "insufficient USDC" — which is true, and useless.
 *
 * Association is one transaction the holder sends themselves. HIP-719 puts a facade at the
 * token's EVM address exposing `associate()`, so it needs no special client: the same wallet that
 * signs everything else signs this.
 *
 * Nothing here applies off Hedera. Arc's USDC is a plain ERC-20 and anvil's is our own mock, so
 * both are treated as always associated rather than pretending the question exists.
 */

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"

/** `associate()` on the token's own EVM address (HIP-719). Returns an HTS response code. */
export const hip719Abi = [
  {
    type: "function",
    name: "associate",
    inputs: [],
    outputs: [{ name: "responseCode", type: "int64" }],
    stateMutability: "nonpayable",
  },
] as const

/** Whether Hedera's token association applies to the chain the app is pointed at. */
const associationApplies = activeChain.id === hederaTestnet.id

type Relationship = { tokens?: { token_id: string }[] }

/**
 * Asks the mirror node whether this account holds a relationship with the USDC token. The mirror
 * node accepts an EVM address, so no account-id lookup is needed first.
 *
 * A failed query answers `undefined`, not `false`: the difference between "not associated" and
 * "we could not ask" is the difference between showing someone a real next step and inventing one.
 */
export function useUsdcAssociation(wallet: Address | undefined, usdc: Address | undefined) {
  return useQuery({
    queryKey: ["hts-association", wallet?.toLowerCase(), usdc?.toLowerCase()],
    queryFn:
      associationApplies && wallet && usdc
        ? async () => {
            const token = htsIdOf(usdc)
            const res = await fetch(`${MIRROR}/accounts/${wallet}/tokens?token.id=${token}`)
            if (!res.ok) throw new Error(`mirror node answered ${res.status}`)
            const body = (await res.json()) as Relationship
            return (body.tokens?.length ?? 0) > 0
          }
        : skipToken,
    retry: 1,
    staleTime: 30_000,
  })
}

/**
 * `0x0000000000000000000000000000000000068cDa` → `0.0.429274`. An HTS token's EVM address is its
 * entity number in the low bytes, so the id is the address read as a number.
 */
export function htsIdOf(address: Address): string {
  return `0.0.${BigInt(address).toString(10)}`
}
