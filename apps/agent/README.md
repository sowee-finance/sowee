# agent

An autonomous consumer of Sowee's paid market-insights API. It runs the full x402 loop with
its own Hedera account: **discover** the price from the `402` challenge, **pay** 0.01 USDC through
the Blocky402 facilitator, **consume** the data and pick the bond it would fund.

```sh
cp .env.example .env            # HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY of the agent's account
bun run src/index.ts --dry      # discovery only, no payment
bun run src/index.ts            # pay and consume
bun run src/index.ts --url https://api.example/v1/market/insights
```

What a run looks like (real testnet settlement):

```
resource : http://localhost:8080/v1/market/insights
           Sowee market insights: every listed invoice bond with funded %, tenor and implied APR
price    : 0.01 (asset 0.0.429274) on hedera:testnet, pay to 0.0.7162116, fee payer 0.0.7162784
paid     : 0.01 USDC by 0.0.10215221 in 5929 ms
settled  : 0.0.7162784@1788673291.830215578 (payer 0.0.10215221, network hedera:testnet)
           https://hashscan.io/testnet/transaction/0.0.7162784-1788673291-830215578
decision : nothing to fund yet (no bonds listed yet)
```

How it works, in three calls from the official x402 packages:

1. `decodePaymentRequiredHeader` reads the `PAYMENT-REQUIRED` header of the 402 — price, asset,
   network, `payTo` and the facilitator's `feePayer`.
2. `wrapFetchWithPayment(fetch, x402Client().register("hedera:testnet", new ExactHederaScheme(signer)))`
   builds a `TransferTransaction` (agent → `payTo`, fee payer = facilitator), signs it with the
   agent's key, and retries with `PAYMENT-SIGNATURE`.
3. `decodePaymentResponseHeader` reads the settlement (transaction id, payer) from
   `PAYMENT-RESPONSE`; the JSON body is the insights feed.

The agent's account needs USDC (`0.0.429274`) associated and funded; it never pays HBAR — the
facilitator sponsors the network fee. The API meters every paid call by account id
(`GET /v1/market/insights/usage`) and anchors a receipt on its HCS topic.
