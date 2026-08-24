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

Sowee turns unpaid invoices into compliant, fractional, tradable on-chain assets. Built on Hedera's [Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio) (ERC-1400) with settlement in USDC, EIP-712 pull-oracle pricing, scheduled on-chain maturity settlement, and an HCS-anchored audit trail.

## Live on Hedera Testnet

Everything below is deployed, Sourcify-verified (exact match), and running today:

| | Address | HashScan |
|---|---|---|
| DiscountOracle (UUPS proxy) | `0xD8ceb338Da5d19B29075903Fb78B469E46Ba1957` | [`0.0.10205670`](https://hashscan.io/testnet/contract/0.0.10205670) |
| InvoiceMarket (UUPS proxy) | `0xc284Ea6dF1979B2BbE8c67484505Ce0C2e6f264a` | [`0.0.10205673`](https://hashscan.io/testnet/contract/0.0.10205673) |
| MaturitySettlement (UUPS proxy) | `0xE015c2BC2870c2B5f6039946d306C9E013390426` | [`0.0.10205676`](https://hashscan.io/testnet/contract/0.0.10205676) |
| PegGuard (Chainlink USDC/USD) | `0x6732E93b91d1F4de0a38B3F8F2d4B889E26c6773` | [`0.0.10205678`](https://hashscan.io/testnet/contract/0.0.10205678) |
| HCS audit-trail topic | — | [`0.0.10206435`](https://hashscan.io/testnet/topic/0.0.10206435) |

Run the whole lifecycle yourself — issuance → compliance → funding → trading → scheduled settlement — with the stage-aware demo:

```bash
export WALLET_PK=0x...   # funded Hedera testnet ECDSA key
pnpm --filter @sowee/e2e-demo demo
```

## How it works

1. An issuer tokenizes an unpaid invoice as a **zero-coupon ATS bond** (ERC-1400 diamond, KYC allowlist on) via the pre-deployed testnet factory.
2. `bootstrapCompliance` makes the bond fund-ready in one call list: role grants, SSI issuer, KYC for the protocol contracts and participants.
3. The Go API signs an **EIP-712 discount quote** (`SoweeDiscountOracle/1/296`); `InvoiceMarket.listInvoice` verifies it on-chain through the DiscountOracle — a pull oracle in miniature.
4. Investors fund in **USDC** at the discounted price; a **Chainlink peg guard** blocks new funding on depeg/stale data (exits are never blocked). Before maturity, units trade on the compliant secondary market — transfers revert at the token layer for non-KYC'd wallets.
5. At maturity the contract **settles itself** via a Hedera Schedule Service call (`0x16b`); holders claim pro-rata USDC by surrendering units.
6. Every lifecycle event is anchored to **HCS** with the invoice document's sha256 — double-pledging the same invoice is publicly detectable.

Control-by-control enforcement details: [COMPLIANCE.md](COMPLIANCE.md).

## Repository layout

```
packages/   Publishable TypeScript packages (@sowee/*)
  core/         Domain types, EIP-712 quote signing, Mirror Node & HCS clients
  plugin-ats/   Asset Tokenization Studio integration (issuance, compliance, lifecycle)
apps/       Applications (not tracked in this repository)
  dapp/         Investor & issuer web app
  api/          Quote/attestation service (Go)
contracts/  Solidity contracts — tracked by its own repository
assets/     Brand assets
```

Smart contracts live in `contracts/` but are versioned in a dedicated repository: [sowee-finance/contracts](https://github.com/sowee-finance/contracts).

How compliance is enforced — token-layer KYC, freezes, audit trail, circuit breakers — is documented control-by-control in [COMPLIANCE.md](COMPLIANCE.md).

## Getting started

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

Requires Node ≥ 20.19 and pnpm ≥ 10.

## License

Apache-2.0
