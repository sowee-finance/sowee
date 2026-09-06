# Build plan — ETHOnline 2026

Written on day one of the build and kept current. This is the roadmap the work follows; each
milestone maps to GitHub issues, and every issue lands through a pull request.

## What Sowee is

An unpaid invoice becomes a compliance-gated, fractional bond token. The lifecycle:

1. **Issue** — the issuer tokenizes an invoice; the document is hashed client-side (sha256) and
   only the hash is anchored, never the file.
2. **Price** — the API signs an EIP-712 discount quote; the oracle verifies it on-chain
   (nonce + expiry), so pricing needs no live feed.
3. **Fund** — investors buy units in USDC at the discounted price; USDC goes straight to the
   issuer.
4. **Trade** — a secondary market of asks; every transfer is checked against the KYC allowlist
   at the token layer, so a fill to a non-eligible wallet reverts.
5. **Settle** — the payor repays in USDC; holders surrender units for a pro-rata claim.
6. **Comply** — mandatory KYC (Sumsub) → suitability policy (US person, sanctions, PEP) →
   on-chain eligibility, status only. A World Selfie Check sits in front as an anti-sybil signal.
7. **Audit** — lifecycle events and document hashes anchored to a Hedera Consensus Service topic.

## Partner tracks (max three)

| Partner | Track | What earns it |
|---|---|---|
| Hedera | Tokenization of Anything | bond token + full lifecycle + HCS trail on Hedera testnet |
| Hedera | AI & Agentic Payments | x402-gated market-insights API + an agent that pays per call |
| World | Selfie Check | anti-sybil gate in front of full KYC, verified server-side |
| Arc | DeFi / Onchain Finance (stretch) | the same finance core on Arc testnet with native USDC |

## Milestones

| # | Milestone | Issues | Status |
|---|---|---|---|
| M1 | Foundations: scaffold, contracts, app shells | #1 #2 #3 #4 #5 | done — contracts live on Hedera testnet |
| M2 | Core lifecycle end-to-end on testnet | #10 #11 #12 #13 #14 | done — ten live transactions |
| M3 | Compliance: Sumsub KYC, policy engine, on-chain grant, World Selfie Check | #17 #18 #19 #20 #21 #22 #23 | KYC live end-to-end; World API done, live test pending access; wizard in progress |
| M4 | x402-gated API + agent consumer | #24 #25 #26 | done — real paid request on testnet |
| M5 | Arc testnet port (stretch, cut first) | to be filed | |
| M6 | Hedera Harness PR (stretch) | to be filed | |
| M7 | Polish, README, video, submission | to be filed | |

## Design decisions

- **Plain-EVM compliance token** instead of a chain-specific tokenization factory: a few hundred
  lines we fully control and test in-process, and the same bytecode ports to Arc.
- **USDC never sits in the market.** Primary buys pay the issuer directly; secondary fills pay
  the maker directly. Only settlement escrows funds, and only what the payor deposited.
- **Allowance-based asks.** Units stay with the maker until a fill; no escrow, trivial cancel.
- **Pull-based claims that burn.** A claim burns the holder's units and pays against a snapshot
  taken at settle time. Double claims are impossible by construction.
- **Status only on-chain.** Eligibility is a boolean per wallet; no names, documents or hashes.
- **Fail-closed policy.** Incomplete or ambiguous KYC results are held, never granted.

## Cut order if time runs short

1. M6 Harness PR
2. M5 Arc
3. Never: M1–M4 and M7 — that is the complete submission.
