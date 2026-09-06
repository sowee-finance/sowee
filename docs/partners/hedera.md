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

| What | Link |
|---|---|
| DiscountOracle | https://hashscan.io/testnet/contract/0xb6d7F1e018195E0000eb0EE017E36c61113e9010 |
| InvoiceMarket | https://hashscan.io/testnet/contract/0xe7f89692940f5BCc30096cd48f360F2144155962 |
| MaturitySettlement (USDC-associated via `0x167`) | https://hashscan.io/testnet/contract/0x68faa98A8e42ef8ffC946e3d571C3940Dc0f6219 |
| HCS audit topic | https://hashscan.io/testnet/topic/0.0.10388277 (message 1 = first attestation, written by `POST /v1/invoices/{id}/attest`) |

| Agent pays, then acts | after the paid call the agent funded the bond itself: approve `0xd8311058…` and `buyPrimary` https://hashscan.io/testnet/transaction/0x026fd7d2337c7b3555374801909e8f117d185559191bba76d62350903f1b6856 — the same allowlist applies to the agent wallet |
| x402 paid request | agent `0.0.10215221` paid 0.01 USDC for `GET /v1/market/insights`, settled by Blocky402: https://hashscan.io/testnet/transaction/0.0.7162784-1788720477-579246898 — receipt anchored on the HCS topic (message 2) |
| x402 challenge | `GET /v1/market/insights` answers `402` with `accepts[0] = {exact, hedera:testnet, 10000 (0.01 USDC), asset 0.0.429274, payTo 0.0.7162116, feePayer 0.0.7162784}` — fee payer resolved live from the facilitator's `/supported` |

| Lifecycle (list → KYC grant → fund → ask → fill → repay → settle → claim) | ten transactions listed in [`contracts/README.md`](../../contracts/README.md#live-lifecycle-testnet-transactions) |

### Agent identity and metering

Agents are identified by the Hedera account that signs the payment transfer — the facilitator
recovers it during `/verify` and it is what `GET /v1/market/insights/usage` meters per call.
No API keys: the payment *is* the credential. The receipt anchored on HCS carries the same
account id, so usage is publicly auditable.

## Track checklist

| Item | Status |
|---|---|
| **Asset Tokenization Studio** | invoice `INV-2026-010` issued as a `Reg S` bond security token through the ATS v8 factory: https://hashscan.io/testnet/contract/0xb438390fE710b12d1951E3b250889A673356e078 — ISIN `XSHUZWMQSU19`, compliance configured (credential issuer, `grantKyc`, allowlist) and 25 units issued; issuing to a wallet that was never KYC'd reverts. Code and every transaction: [`apps/ats/`](../../apps/ats/) |
| Token issuance with compliance controls | `BondToken` allowlist on every transfer, freeze, face-value cap — live |
| Full lifecycle on testnet | issue → fund → trade → settle, ten transactions — live |
| Secondary market | allowance-based asks with partial fills — live fill |
| Oracle | EIP-712 pull oracle, consume-once nonce — live |
| Custom fees | 0.5% platform fee buyer → treasury on primary and secondary — live |
| Consensus Service audit trail | attestations + x402 receipts on topic `0.0.10388277`, replayed from the mirror node — live |
| Agentic payments (x402) | 402 challenge, facilitator verify/settle, receipt, metering; real paid request — live |
| Scheduled transactions (HSS) | not used: settlement is permissionless instead, so anyone can settle after maturity without relying on scheduled dispatch |
| Upstream contribution (hedera-harness) | not attempted in the window |

## Feedback on Asset Tokenization Studio

- `deployBond` is one call carrying the whole compliance posture, which is the right shape:
  `isWhiteList` and `internalKycActivated` are decided at issuance instead of being a step someone
  can forget. It took reading `IFactory.json` to see that, though — the nested `SecurityData`
  tuple has seventeen fields and the docs example does not show them all.
- `grantKyc` names a credential issuer that must first be registered with `addIssuer` **on the
  same token**. The revert when it is not is not obviously about that, and it is the one ordering
  constraint a first integration will hit.
- A malformed ISIN fails the deployment, so an integration needs check-digit generation before it
  can issue anything. A helper in the SDK would save everyone writing the same Luhn variant.
- The published `@hashgraph/asset-tokenization-contracts` package exposing `./artifacts/*` is what
  made a viem-only integration possible without pulling in the whole SDK. Worth keeping.
- Config ids are small integers (`bond = 2`) while the resolver takes them as `bytes32`; padding
  them by hand is easy to get wrong. Naming them in the package export helped.

## Feedback (honest, specific)

- **Gas billing.** The relay charges at least 80% of the gas *limit*, not the gas used, so the
  usual "pad the estimate generously" habit costs real HBAR. Worth a prominent docs callout.
- **Precompiles in local simulation.** Foundry's on-chain simulation cannot execute `0x167`
  (the relay reports `0xfe` bytecode there). A deploy that associates a token in a constructor
  needs `--skip-simulation`. A documented mock or a relay hint would save an afternoon.
- **Self-transfers.** HTS rejects a token transfer whose sender equals the receiver
  (`ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS`), which plain ERC-20s allow. A contract that routes a
  fee to a treasury breaks the moment the treasury itself trades. Worth a line in the "EVM
  differences" docs.
- **Read-after-write.** An `eth_call` issued right after a mined transaction can still see the
  previous state for a second or two on the relay; polling is needed before trusting a read.
- **Balance check on send.** The relay rejects a transaction unless `gasLimit × gasPrice` is on
  the account up front, even though only ~80% of the limit is billed — a wallet with 2 ℏ cannot
  send a 1.2M-gas transaction that actually uses 130k. `eth_estimateGas` first, then a modest pad.
