<p align="center">
  <img src="assets/brand/white/android-chrome-192x192.png#gh-dark-mode-only" alt="Sowee" width="96" />
  <img src="assets/brand/black/android-chrome-192x192.png#gh-light-mode-only" alt="Sowee" width="96" />
</p>

<h1 align="center">Sowee</h1>

<p align="center">
  Compliant invoice financing on Hedera — tokenize receivables, fund them, trade them, settle them on-chain.
</p>

<p align="center">
  <a href="https://github.com/sowee-finance/sowee/actions/workflows/ci.yml"><img src="https://github.com/sowee-finance/sowee/actions/workflows/ci.yml/badge.svg?branch=dev" alt="CI" /></a>
  <img src="https://img.shields.io/badge/network-Hedera%20Testnet-8259ef" alt="Hedera Testnet" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" />
</p>

---

Sowee takes an unpaid invoice and turns it into something an investor can actually buy: a compliant, fractional, tradable on-chain asset. The tokens come from Hedera's [Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio) (ERC-1400), settlement happens in USDC, pricing goes through an EIP-712 pull oracle, maturity settlement is scheduled on-chain, and the whole audit trail is anchored to HCS.

## Live on Hedera Testnet

This isn't a whitepaper. All four contracts are deployed, Sourcify-verified (exact match), and running right now:

| | Address | HashScan |
|---|---|---|
| DiscountOracle (UUPS proxy) | `0xD8ceb338Da5d19B29075903Fb78B469E46Ba1957` | [`0.0.10205670`](https://hashscan.io/testnet/contract/0.0.10205670) |
| InvoiceMarket (UUPS proxy) | `0xc284Ea6dF1979B2BbE8c67484505Ce0C2e6f264a` | [`0.0.10205673`](https://hashscan.io/testnet/contract/0.0.10205673) |
| MaturitySettlement (UUPS proxy) | `0xE015c2BC2870c2B5f6039946d306C9E013390426` | [`0.0.10205676`](https://hashscan.io/testnet/contract/0.0.10205676) |
| PegGuard (Chainlink USDC/USD) | `0x6732E93b91d1F4de0a38B3F8F2d4B889E26c6773` | [`0.0.10205678`](https://hashscan.io/testnet/contract/0.0.10205678) |
| HCS audit-trail topic | — | [`0.0.10206435`](https://hashscan.io/testnet/topic/0.0.10206435) |

Want to see it work? The stage-aware demo runs the full lifecycle (issuance, compliance, funding, trading, scheduled settlement) against those live contracts:

```bash
export WALLET_PK=0x...     # issuer/payor wallet (funded ECDSA key)
export INVESTOR_PK=0x...   # second wallet for the buy/claim legs — HTS rejects
                           # buyer == issuer, so one wallet can't fund itself
pnpm --filter @sowee/e2e-demo demo
```

## How it works

1. I issue the invoice as a zero-coupon ATS bond: an ERC-1400 diamond with the KYC allowlist switched on, deployed through the factory that already lives on testnet.
2. `bootstrapCompliance` then makes the fresh bond fund-ready in one call list: role grants, SSI issuer registration, and KYC for the protocol contracts and every participant. Skip any of that and transfers just revert, which is why it's a single batch.
3. The Go API signs an EIP-712 discount quote under `SoweeDiscountOracle/1/296`. When the issuer calls `InvoiceMarket.listInvoice`, the quote gets verified on-chain by the DiscountOracle. A pull oracle in miniature.
4. Investors fund in USDC at the discounted price. A Chainlink peg guard blocks new funding on a depeg or stale feed data; exits are never blocked. Until maturity, units trade on the compliant secondary market, and a transfer to a non-KYC'd wallet reverts at the token layer, even when the fill routes through the market.
5. At maturity, settlement is designed to trigger itself through a Hedera Schedule Service call (`0x16b`, HIP-1215) — implemented and capacity-checked, but the dispatch is currently disabled on testnet ([diagnosed and reported upstream](https://github.com/hiero-ledger/hiero-consensus-node/issues/26959)), so the live lifecycle used the designed fallback: `settle()` is permissionless. Holders surrender their units and claim pro-rata USDC either way.
6. Every lifecycle event lands on HCS together with the invoice document's sha256, so pledging the same invoice twice is publicly detectable.

## Compliance

Where each control is enforced, and what actually happens when it fires:

| Control | Enforced at | When triggered |
|---|---|---|
| KYC / investor eligibility | ATS bond (token layer, allowlist mode) | Any transfer to a non-KYC'd wallet reverts — including fills routed through the market |
| Dispute freeze / emergency halt | ATS partial freeze & pause facets | Frozen units can't move; pause stops all token ops |
| Court-ordered recovery | ERC-1644 controller ops / ERC-3643 `forcedTransfer` | Controller moves units without holder signature |
| Priced-funding integrity | `DiscountOracle` (EIP-712, nonce + expiry) | Expired/replayed/unsigned quotes revert listing |
| Settlement-asset integrity | `PegGuard` on Chainlink USDC/USD | New funding blocked on >100 bps depeg or stale feed — exits are never blocked |
| Guaranteed exit | Market & settlement design | Cancels work while paused; claims are pull-based and unguarded |
| Deterministic payout | Surrender-based claims | `repayment × units / supply`; double-claims impossible by construction |
| Upgrade governance | UUPS + two-step ownership | Non-owner upgrades revert; ownership transfers must be accepted |
| Audit trail & anti-double-pledge | HCS topic + API docHash guard | Duplicate invoice hash rejected (409) and publicly detectable on the topic |

Two things are documented but deliberately not enabled on testnet: a multisig owner (Safe or a Hedera threshold-key account) and a timelock on upgrades. Migrating to either is one ownership transfer per contract, no code changes ([details](https://github.com/sowee-finance/contracts#security--ownership)).

### Investor onboarding & identity

The token-layer allowlist above is the *enforcement* point; getting onto it is a real compliance flow, not a manual grant. After connecting a wallet, an investor goes through a guided onboarding wizard at `/kyc`:

1. **Suitability & declarations** — investor classification, source of funds, and enforced declarations (US person, sanctions exposure, PEP, beneficial ownership). Submitted server-side under an EIP-191 wallet-signature challenge, so only the wallet's owner can start or resume its verification.
2. **Identity & liveness** — document capture and a liveness selfie through [Sumsub](https://sumsub.com) (currently its sandbox environment). Documents and biometrics are processed inside Sumsub's widget; the API only ever reads back the review outcome and the questionnaire answers.
3. **Policy engine** — a GREEN review plus the answers are run through a suitability policy: **US persons are excluded** (Regulation S posture), residents of comprehensively sanctioned jurisdictions are **blocked**, and PEP or incomplete cases are **held** for review (fail-closed). Only an eligible verdict proceeds.
4. **On-chain grant** — an eligible investor is granted on the compliance list of **every live bond** in one pass (and revoked across all of them if their status later turns blocked). **Only the eligibility decision reaches the chain** — no name, document, image, or hash of any of it. On-chain entries reference the wallet address alone (aligned with EDPB guidance against personal data on-chain).

Grants land the moment Sumsub decides: a signature-verified webhook drives the same state machine the client poll uses, so an approval flips the investor to eligible even with the tab closed.

**Try it yourself:** open [`app.sowee.site/kyc`](https://app.sowee.site/kyc), connect a wallet, and complete the wizard using Sumsub's [sandbox test documents](https://docs.sumsub.com/docs/test-verifications) — a GREEN result grants your wallet on the live testnet bonds and unlocks the buy flow.

## Repository layout

```
packages/   Publishable TypeScript packages (@sowee/*)
  core/         Domain types, EIP-712 quote signing, Mirror Node & HCS clients
  plugin-ats/   Asset Tokenization Studio integration (issuance, compliance, lifecycle)
apps/       Applications — each tracked in its own private repository
  dapp/         Investor & issuer web app     -> sowee-finance/dapp
  landing/      Marketing site (Astro)        -> sowee-finance/landing
  backoffice/   Compliance-officer console    -> sowee-finance/backoffice
  api/          Quote/attestation service (Go)  -> sowee-finance/api
contracts/  Solidity contracts — tracked by its own repository
subgraph/   Self-hosted The Graph subgraph — tracked by its own repository (sowee-finance/subgraph)
assets/     Brand assets
```

The apps consume `@sowee/*` as `file:../../packages/*` dependencies, so clone them into `apps/` inside this checkout (`git clone git@github.com:sowee-finance/dapp apps/dapp`, and likewise for landing, backoffice, and api).

The Solidity lives in `contracts/` but is versioned in its own repository: [sowee-finance/contracts](https://github.com/sowee-finance/contracts).

## Subgraph

The Graph has no hosted indexer for Hedera, so `subgraph/` follows [Hedera's self-hosted pattern](https://docs.hedera.com/hedera/tutorials/smart-contracts/deploy-a-subgraph-using-the-graph-and-json-rpc): a local graph-node reads testnet through the Hashio JSON-RPC relay. It indexes all three proxies from their creation blocks — listings, primary purchases, secondary asks/fills/cancels (InvoiceMarket), consumed discount quotes (DiscountOracle), and registrations, repayments, settlements, and claims (MaturitySettlement).

```bash
cd subgraph
docker compose -f graph-node/docker-compose.yaml up -d   # graph-node + IPFS + Postgres
pnpm install && pnpm codegen && pnpm build
pnpm create-local && pnpm deploy-local
```

Query it at `http://localhost:8000/subgraphs/name/sowee` once synced (a few minutes — it starts at the deployment blocks, not genesis). Point the dapp at it with `NEXT_PUBLIC_SUBGRAPH_URL=http://localhost:8000/subgraphs/name/sowee`; without that variable the dapp reads the mirror node directly, so the subgraph is optional. The stack idles at ~2 GB RAM — `docker compose -f graph-node/docker-compose.yaml down` when you're done (`down -v` also drops the index data).

## Getting started

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

You'll need Node ≥ 20.19 and pnpm ≥ 10.

## License

Apache-2.0
