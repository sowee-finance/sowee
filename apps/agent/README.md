# agent

An autonomous consumer of Sowee's paid market-insights API. It runs the full x402 loop with
its own Hedera account: **discover** the price from the `402` challenge, **pay** 0.01 USDC through
the Blocky402 facilitator, **consume** the data and pick the bond it would fund.

```sh
cp .env.example .env            # HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY of the agent's account
bun run src/index.ts --dry      # discovery only, no payment
bun run src/index.ts            # pay and consume
bun run src/index.ts --execute 1  # pay, then fund 1 unit of the best bond on-chain
bun run src/index.ts --url https://api.example/v1/market/insights
```

What a run looks like (real testnet settlement and a real primary buy):

```
resource : http://localhost:8080/v1/market/insights
           Sowee market insights: every listed invoice bond with funded %, tenor and implied APR
price    : 0.01 (asset 0.0.429274) on hedera:testnet, pay to 0.0.7162116, fee payer 0.0.7162784
paid     : 0.01 USDC by 0.0.10215221 in 9542 ms
settled  : 0.0.7162784@1788719886.590987462 (payer 0.0.10215221, network hedera:testnet)
           https://hashscan.io/testnet/transaction/0.0.7162784-1788719886-590987462
decision : fund sINV001 (0xae5c05cb…) — implied APR 28.31%
           sINV001  disc 2.25%  tenor 29d  apr 28.31%  funded 10.0%
wallet   : 0x05F2…A6Af on chain 296, 27.321597 USDC
order    : 1 units for 0.9775 USDC + 0.004888 fee (as requested)
approve  : 0xd831105895ac9ab39ea0a25f6e72ad6fab034e428c1817d6faf6650544c186b3
funded   : 0x026fd7d2337c7b3555374801909e8f117d185559191bba76d62350903f1b6856
position : 7.000027 units of sINV001
```

How it works, in three calls from the official x402 packages:

1. `decodePaymentRequiredHeader` reads the `PAYMENT-REQUIRED` header of the 402 — price, asset,
   network, `payTo` and the facilitator's `feePayer`.
2. `wrapFetchWithPayment(fetch, x402Client().register("hedera:testnet", new ExactHederaScheme(signer)))`
   builds a `TransferTransaction` (agent → `payTo`, fee payer = facilitator), signs it with the
   agent's key, and retries with `PAYMENT-SIGNATURE`.
3. `decodePaymentResponseHeader` reads the settlement (transaction id, payer) from
   `PAYMENT-RESPONSE`; the JSON body is the insights feed.

## Acting on what it bought

`--execute [units]` closes the loop. The agent reads the market and USDC addresses from
`contracts/deployments/<chainId>.json`, resolves the bond behind the best invoice, and:

- **checks its own eligibility.** An agent is an investor like any other: `isEligible(agent)` is
  false until that wallet has passed KYC, and the run stops with that message rather than a revert.
- **sizes the order** as the smallest of what was asked, the bond's remaining capacity and what
  its USDC balance affords (`src/plan.ts`, unit-tested).
- **approves exactly the cost plus fee**, then calls `buyPrimary`, and prints both HashScan links
  and the resulting position.

The x402 payment is sponsored by the facilitator, but this buy is an ordinary EVM transaction, so
the agent pays its own gas. Hedera reserves `gasLimit × gasPrice` up front — around 1 ℏ for an HTS
approve — so keep a couple of HBAR on the agent account.

The agent's account needs USDC (`0.0.429274`) associated and funded; the paid call itself never
costs it HBAR — the facilitator sponsors that network fee. The API meters every paid call by
account id (`GET /v1/market/insights/usage`) and anchors a receipt on its HCS topic.
