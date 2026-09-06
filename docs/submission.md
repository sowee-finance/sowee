# ETHGlobal submission text (draft — paste into the Hacker Dashboard)

## Project name

Sowee

## Short description

Compliant invoice financing on Hedera: an unpaid invoice becomes a KYC-gated, fractional bond
token — priced by a signed discount quote, funded in USDC, tradable on a compliant secondary
market, settled pro-rata at maturity — with the audit trail on HCS and market data that agents
pay for over x402.

## Description

Small businesses wait 30–90 days to get paid. Sowee lets an issuer turn that invoice into a
bond investors can fund today at a discount, and it does so *compliantly*: every transfer of
bond units is checked against a KYC allowlist inside the token, so nobody who has not passed
identity, liveness and a suitability policy (US persons excluded under Regulation S, sanctioned
jurisdictions blocked, PEPs held) can ever hold a unit — not through the primary sale, not
through the secondary market. Only the decision goes on-chain; no personal data, no hashes.

The lifecycle is live on Hedera testnet with real transactions: the API signs an EIP-712
discount quote that the oracle verifies and burns on-chain; `listInvoice` deploys the bond;
investors fund in USDC (paid straight to the issuer); asks are filled on a secondary market;
after maturity the payor repays into settlement and holders surrender units for their pro-rata
share. Issuance, the invoice document's sha256 and x402 receipts are anchored on a Hedera
Consensus Service topic, and the anti-double-pledge index is rebuilt from the mirror node —
no database.

For agents, `GET /v1/market/insights` is x402-gated: 0.01 USDC per call on hedera:testnet,
verified and settled by the Blocky402 facilitator. Our agent discovers the price from the 402,
pays with its own Hedera account, and picks the bond it would fund. World Selfie Check sits in
front of KYC as an anti-sybil signal that unlocks the demo faucet and a larger API allowance.
The same finance core also runs on Arc testnet with a bond funded in native USDC.

## How it's made

- **Contracts** (Solidity 0.8.28, Foundry, OpenZeppelin 5): `BondToken` (ERC-20 with the
  allowlist in `_update`, freeze, face-value cap, roles), `DiscountOracle` (EIP-712, consume-once
  nonce), `InvoiceMarket` (deploys bonds, primary funding, allowance-based asks with partial
  fills, capped fee), `MaturitySettlement` (permissionless settle, claims that burn), and
  `HederaAssociable` (HTS association through precompile `0x167`, no-op elsewhere). 42 tests.
  Two-stage deploy on Hedera because Foundry cannot simulate the precompile.
- **API** (Go 1.25, chi, go-ethereum, Hiero SDK): quote signer with the digest pinned to the
  Solidity vector; HCS writer + mirror-node replay; hand-rolled x402 v2 gate talking to the
  facilitator's `/verify` and `/settle`; Sumsub client with HMAC-signed requests; policy engine;
  granter that pads gas for Hedera's 80%-of-limit billing; World RP signatures with the official
  idkit module; faucet and tiered rate limits.
- **Web** (Next.js 16, wagmi/viem, Tailwind 4): marketplace, bond page with secondary market,
  issuer flow with client-side sha256, portfolio with claims, KYC wizard with the Sumsub WebSDK.
- **Agent** (bun, `@x402/fetch` + `@x402/hedera`): discover → pay → consume.
- Things that bit us and are documented as partner feedback: Hedera bills ≥80% of the gas
  *limit*; HTS refuses self-transfers (a treasury cannot pay itself a fee); the relay needs
  `gasLimit × gasPrice` on the account up front; Foundry's on-chain simulation cannot execute
  the HTS precompile.

## Tech stack

Solidity, Foundry, OpenZeppelin · Go, chi, go-ethereum, hiero-sdk-go, idkit · Next.js, React,
wagmi, viem, Tailwind · bun, Turborepo, Biome · Hedera (HTS, HCS, Hashio, mirror node),
Blocky402 (x402 facilitator), Sumsub (sandbox KYC), World ID (Selfie Check), Arc (native USDC).

## Partner prizes (max 3)

1. **Hedera** — Tokenization of Anything; AI & Agentic Payments. See `docs/partners/hedera.md`.
2. **World** — Selfie Check. See `docs/partners/world.md`.
3. **Arc** — Best DeFi / Onchain Finance. See `docs/partners/arc.md`.

## Links

- Repo: https://github.com/sowee-finance/sowee
- Video: (add)
- Live links: README table.
