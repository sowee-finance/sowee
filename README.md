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
