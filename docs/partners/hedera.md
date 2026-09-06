# Hedera — integration notes and feedback

Tracks: **Tokenization of Anything** and **AI & Agentic Payments**. This file grows as the
integration lands; nothing below is claimed until it has run on testnet.

## Verified facts we build on

| Item | Value |
|---|---|
| Chain id | 296 (testnet) |
| JSON-RPC relay | `https://testnet.hashio.io/api` |
| Mirror node | `https://testnet.mirrornode.hedera.com/api/v1` |
| Explorer | `https://hashscan.io/testnet` |
| USDC (HTS) | `0.0.429274` = `0x0000000000000000000000000000000000068cDa`, 6 decimals |
| HTS precompile | `0x167` (`associateToken`), response `22` = success, `194` = already associated |
| x402 facilitator | `https://api.testnet.blocky402.com` — `/supported` lists `hedera:testnet`, exact scheme, `extra.feePayer = 0.0.7162784` |

### x402 on Hedera (exact scheme)

From the scheme spec in `x402-foundation/x402` (`specs/schemes/exact/scheme_exact_hedera.md`):

- `PaymentRequirements`: `scheme: "exact"`, `network: "hedera:testnet"`, `asset` = HTS token id
  (`"0.0.0"` for HBAR), `amount` in the token's smallest unit, `payTo` = account id,
  `maxTimeoutSeconds`, `extra.feePayer` = the facilitator account.
- `PaymentPayload.payload.transaction` = base64 of a **partially signed** `TransferTransaction`
  whose `transactionId.accountId` is the fee payer; the client signs, the facilitator adds the
  fee-payer signature on `/settle`.
- The facilitator rejects anything that is not a bare transfer of exactly `amount` from the
  client to `payTo`, and checks the client's signature against its on-chain key.
- Reference client/server: `@x402/hedera` (npm, v2.25) with `@x402/core` / `@x402/fetch`.

## How Sowee uses Hedera

- **Bond token, market, oracle, settlement** — `contracts/` (see its README for addresses).
- **HCS** — lifecycle events and the invoice document sha256 are anchored to a topic (#12).
- **x402** — `GET /v1/market/insights` is paid per call in USDC through Blocky402; receipts go
  to the same HCS topic (#24, #25).

## Live proof

Filled in as transactions land (contract links, lifecycle txs, HCS topic, x402 settlement).

## Feedback (honest, specific)

- **Gas billing.** The relay charges at least 80% of the gas *limit*, not the gas used, so the
  usual "pad the estimate generously" habit costs real HBAR. Worth a prominent docs callout.
- **Precompiles in local simulation.** Foundry's on-chain simulation cannot execute `0x167`
  (the relay reports `0xfe` bytecode there). A deploy that associates a token in a constructor
  needs `--skip-simulation`. A documented mock or a relay hint would save an afternoon.
- More as we go.
