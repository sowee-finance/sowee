# Prompts used with the coding assistant

ETHGlobal allows spec-driven AI workflows when the specs and prompts are included. This file
keeps the substantive prompts the team gave Claude Code during the build, condensed but
faithful. Every result was reviewed by the team before it was merged; see `AI-USAGE.md`.

## Standing instructions (all sessions)

- Build from scratch inside the window; never read or copy the team's earlier project.
- Work issue → branch → small commits → pull request; comment on the issue; keep `AI-USAGE.md`
  current; English everywhere; conventional commits.
- Prefer the simplest thing that works: standard library first, one dependency only when a
  few lines cannot do it, no speculative abstractions.

## Task prompts (paraphrased to their essentials)

**Scaffold.** "Init a fresh monorepo with bun workspaces, Turborepo, Biome (advanced config)
and husky; commit the empty scaffold first as proof of start."

**Contracts.** "Implement T-103/T-104/T-204 to their acceptance criteria: a bond token with a
KYC allowlist enforced on every transfer, an EIP-712 pull oracle with a consume-once nonce, a
market with primary funding and allowance-based asks, a settlement with surrender-and-claim.
Tests for every revert path. Deploy script for anvil and Hedera."

**API skeleton + quote signer.** "Go 1.25 + chi. `/v1/healthz` and `POST /v1/invoices/{id}/quote`
signing `DiscountOracle.Quote` under domain `SoweeDiscountOracle` v1; the digest must match the
Solidity vector byte for byte; nonce unique across restarts; simple tenor-based pricing."

**HCS anchor.** "Anchor `{invoiceId, docHash, event}` to a Hedera Consensus Service topic;
reject a document hash pledged under a second invoice; rebuild that index from the mirror
node on start so it survives restarts without a database."

**x402.** "Gate `GET /v1/market/insights` with x402 v2 (`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE`
/ `PAYMENT-RESPONSE`), exact scheme on `hedera:testnet`, 0.01 USDC, Blocky402 facilitator;
replay guard; receipt on HCS; per-payer metering. Then an agent on the official `@x402/fetch` +
`@x402/hedera` packages that discovers, pays and uses the data."

**KYC.** "Wallet challenge (EIP-191), Sumsub sandbox client (signed requests, access tokens,
applicants, questionnaire, webhook digest), a fail-closed policy (US person blocked under Reg S,
sanctioned blocked, PEP held, missing answers held), a granter that sets eligibility on every
live bond and skips bonds already granted. Table tests on every policy branch."

**World Selfie Check.** "RP signature with the official idkit Go module; forward the IDKit
result unchanged to the Developer Portal verify endpoint; one nullifier per person; use the
signal to gate a demo faucet and to raise the API allowance."

**Web (three briefs to a sub-agent).** "Next.js + wagmi injected wallet, chains 296 and 31337,
ABIs generated from `contracts/out`, addresses from `contracts/deployments/<chainId>.json`,
'not deployed' state instead of a crash." Then: "issuer form hashing the document client-side,
quote → `listInvoice` → attest; portfolio with claims; secondary asks on the bond page;
readable revert decoding." Then: "the KYC wizard against the live API with the Sumsub WebSDK
from the CDN, resumable, with a Selfie Check step that switches on when the World app id is
configured."

**Docs.** "Judge-facing README with live links, a Mermaid architecture diagram, run steps and a
'try KYC yourself' section; partner notes with verified facts and honest feedback; a timed
video runbook."
