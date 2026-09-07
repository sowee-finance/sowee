# ETHGlobal submission text (draft — paste into the Hacker Dashboard)

## Project name

Sowee

## Short description

Compliant invoice financing on Hedera: an unpaid invoice becomes a KYC-gated, fractional bond —
priced by a signed discount quote, funded in USDC, traded on a compliant secondary market, settled
pro-rata at maturity — issuable as a regulated ERC-1400 security, with the audit trail on Hedera
Consensus Service and market data that agents pay for, and act on, over x402.

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
no database. There is no file store either: an issuer who attaches a company logo has it
downscaled in their own browser and carried onto the same topic with the attestation, so the
mark lives with the record instead of behind a link that can rot.

An invoice can be tokenized two ways. The marketplace runs on our own compliance token, whose
allowlist is checked on every transfer. An invoice that needs the regulated wrapper is issued
through Hedera's **Asset Tokenization Studio** instead: an ERC-1400 security with partitions, a
controller, an ISIN and `Reg S` recorded on chain, whose units nobody can hold without the same
KYC — issuing to an unverified wallet reverts.

For agents, `GET /v1/market/insights` is x402-gated: 0.01 USDC per call on hedera:testnet,
verified and settled by the Blocky402 facilitator. Our agent discovers the price from the 402,
pays with its own Hedera account, reads the ranked bonds, and then **funds the one it chose** —
and it is refused by the same allowlist a human faces until that wallet passes KYC. World Selfie
Check sits in front of KYC as an anti-sybil signal that unlocks the demo faucet and a larger API
allowance. The same finance core also runs on **Arc testnet**, Circle's USDC-native L1, with an
invoice listed, granted from the same KYC decision, funded in native USDC and offered on the
secondary market.

## How it's made

- **Contracts** (Solidity 0.8.28, Foundry, OpenZeppelin 5): `BondToken` (ERC-20 with the
  allowlist in `_update`, freeze, face-value cap, roles), `DiscountOracle` (EIP-712 quote that
  binds issuer, face value and maturity, consume-once nonce), `InvoiceMarket` (deploys bonds,
  primary funding, allowance-based asks with partial fills, capped fee, role revocation),
  `MaturitySettlement` (settle gated on cover or a grace period, claims that burn, withdrawal for
  a repayment nobody can claim), and `HederaAssociable` (HTS association through precompile
  `0x167`, no-op elsewhere). 50 tests. Two-stage deploy on Hedera because Foundry cannot simulate
  the precompile. An adversarial review mid-build found a quote that did not bind maturity or
  issuer and a settlement that could lock funds at zero supply; both are fixed and tested, and the
  contracts were redeployed rather than patched.
- **Asset Tokenization Studio** (`apps/ats`): a viem integration against the published ATS v8
  artifacts that deploys a bond security through the factory, registers the credential issuer,
  grants KYC, allowlists the holder and issues units. ISINs are generated with a Luhn check digit,
  tested against real published ISINs, because a malformed one fails the deployment.
- **API** (Go 1.25, chi, go-ethereum, Hiero SDK): quote signer with the digest pinned to the
  Solidity vector; HCS writer + mirror-node replay; hand-rolled x402 v2 gate talking to the
  facilitator's `/verify` and `/settle`; Sumsub client with HMAC-signed requests; policy engine;
  granter that pads gas for Hedera's 80%-of-limit billing; World RP signatures with the official
  idkit module; faucet and tiered rate limits.
- **Web** (Next.js 16, wagmi/viem, Tailwind 4): marketplace, bond page with secondary market,
  issuer flow with client-side sha256, portfolio with claims, KYC wizard with the Sumsub WebSDK.
  A legal section — disclaimers, terms, privacy and cookies — states what this is and is not:
  no entity, no registration, no licence, no offer, test-value assets, and a Regulation S posture
  that is a demonstration of the mechanism. Every claim in it was checked against the code, which
  is why the privacy policy names the two records nobody can delete and the cookies page says
  there is no banner because nothing is set.
- **Agent** (bun, `@x402/fetch` + `@x402/hedera`, viem): discover → pay → consume → fund, with the
  order sized against remaining capacity and balance.
- Things that bit us and are documented as partner feedback: Hedera bills ≥80% of the gas *limit*
  and the relay reserves `gasLimit × gasPrice` up front; HTS refuses self-transfers; Foundry's
  on-chain simulation cannot execute the HTS precompile; in ATS, `grantKyc` names a credential
  issuer that must already be registered with `addIssuer` on the same token; and go-ethereum
  copies a single return value into a struct's *first field*, which silently broke the paid
  endpoint until a tuple was unpacked through a wrapper.

## Tech stack

Solidity, Foundry, OpenZeppelin · Go, chi, go-ethereum, hiero-sdk-go, idkit · Next.js, React,
wagmi, viem, Tailwind · bun, Turborepo, Biome · Hedera (HTS, HCS, Hashio, mirror node),
Blocky402 (x402 facilitator), Sumsub (sandbox KYC), World ID (Selfie Check), Arc (native USDC).

## Partner prizes (max 3)

Three partners, several tracks inside them (multiple tracks from one partner count as one slot):

1. **Hedera** — *Tokenization of Anything* (the invoice issued as an ATS security, compliance
   configured, units issued) and *AI & Agentic Payments* (x402 service via Blocky402 plus an agent
   that completes real paid requests and acts on them). See `docs/partners/hedera.md`.
2. **Arc** — *Best DeFi / Onchain Finance* and *Launch on Arc Testnet & Push to Mainnet*: the same
   finance core live on Arc, funded in native USDC, with the mainnet step a configuration change.
   See `docs/partners/arc.md`.
3. **World** — *Selfie Check*, as an anti-sybil signal in front of KYC. See `docs/partners/world.md`,
   and the required feedback document at `docs/partners/world-feedback.md`.

## Links

- Live app: https://app.sowee.site
- Live API: https://api.sowee.site/v1/healthz
- Repo: https://github.com/sowee-finance/sowee
- Video: (add)
- Contracts, transactions and the HCS topic: README table.
