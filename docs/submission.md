# ETHGlobal submission text (draft — paste into the Hacker Dashboard)

## Project name

Sowee

## Short description

Compliant invoice financing on Hedera: an unpaid invoice becomes a KYC-gated, fractional bond —
priced by a signed discount quote, funded in USDC, traded on a compliant secondary market, settled
pro-rata at maturity — issuable as a regulated ERC-1400 security, with the audit trail on Hedera
Consensus Service and market data that agents pay for, and act on, over x402.

## Description

A small business finishes a job, sends the invoice, and then waits 30 to 90 days to actually see the money. The work is done and the customer is good for it — the cash just isn't there yet. That gap is what kills small companies.

Sowee turns that unpaid invoice into something an investor can fund today. The business gets most of the money now; investors put up the cash and collect the full invoice amount when the customer pays. What makes it more than a spreadsheet with a promise attached is that the rules are enforced by the token itself.

Every transfer is checked against an allowlist inside the bond token. If a wallet has not passed identity, liveness and a suitability questionnaire, it cannot hold a unit — not by buying in the primary sale, not by being sent one on the secondary market. The transfer reverts. US persons are excluded under Regulation S, sanctioned jurisdictions are blocked, and politically exposed persons are held for review. Only the yes-or-no decision goes on chain: no names, no documents, not even a hash of one.

All of it runs live on Hedera testnet, with real transactions anyone can open on HashScan. The API signs an EIP-712 discount quote; the oracle verifies the signature and burns the nonce on chain, so a quote can be used exactly once. One transaction deploys the bond and opens it for funding. Investors fund in USDC, which goes straight to the issuer. Holders post asks on a compliant secondary market, and a fill moves units only between allowlisted wallets. At maturity the payor repays into a settlement contract and holders surrender units for their pro-rata share; claims burn, so nobody can claim twice.

There is no database anywhere in this, and no file store. Issuance, the sha256 of the invoice document, and payment receipts are anchored to a Hedera Consensus Service topic. The index that stops one document being pledged against two invoices is rebuilt by replaying that topic from the mirror node at startup. Even a logo an issuer attaches is shrunk in their own browser and carried onto the topic with the record, instead of living behind a link that can rot.

An invoice can be tokenized two ways. The marketplace runs on our own compliance token. An invoice that needs the regulated wrapper is issued through Hedera's Asset Tokenization Studio instead: an ERC-1400 security with partitions, a controller, an ISIN and Reg S recorded on chain — and issuing units there to a wallet that never passed KYC reverts as well.

Agents are buyers here, not an afterthought. GET /v1/market/insights is paid per call over x402: 0.01 USDC on Hedera testnet, verified and settled by the Blocky402 facilitator, with the receipt anchored to the same public topic. Our agent discovers the price from the 402 response, pays from its own Hedera account, reads the ranked bonds, and then funds the one it picked — and it is refused by exactly the same allowlist a human faces until its wallet passes KYC. The endpoint is publicly hosted and describes itself at /openapi.json.

World's Selfie Check sits in front of the heavier identity check as an anti-sybil signal: passing it unlocks the demo faucet and a larger API allowance, while real eligibility still needs the document check and the policy. The nullifier is anchored on the audit topic and replayed at startup, so one World ID cannot quietly verify a second wallet after a restart.

The same finance core also runs on Arc, Circle's USDC-native L1 where USDC is the gas token: an invoice listed, the same KYC decision granted on chain, a bond funded in native USDC, and an open ask on the secondary market.

One thing we will not overstate. The Selfie Check flow is built on both sides, but the credential is feature-flagged per app and ours was never enabled, so we have never run the camera check on a device. Everything else described here has run on a live network.

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
3. **World** — *Selfie Check*, as an anti-sybil signal in front of KYC: a wallet that passes it
   unlocks the demo faucet and a larger API allowance, while real eligibility still needs the
   document check and the suitability policy. RP signature server-side, IDKit in the wizard,
   nullifiers replayed from the audit topic so one World ID cannot verify twice. See
   `docs/partners/world.md` and the required feedback document at
   `docs/partners/world-feedback.md`.

## Links

- Live app: https://app.sowee.site
- Live API: https://api.sowee.site/v1/healthz — spec at https://api.sowee.site/openapi.json
- Repo: https://github.com/sowee-finance/sowee
- Video: (add)
- Contracts, transactions and the HCS topic: README table.
