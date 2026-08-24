# Compliance Control Matrix

How Sowee enforces securities-style compliance for tokenized invoices on Hedera testnet — where each control lives, what happens when it triggers, and how it is demonstrated. Contracts referenced below are deployed and Sourcify-verified; addresses are in [`@sowee/core`](packages/core/src/constants.ts) (`SOWEE_TESTNET`) and the [contracts README](https://github.com/sowee-finance/contracts#deployed-hedera-testnet).

## Token-layer controls (enforced by the ATS bond, ERC-1400/3643)

These execute inside the invoice bond token itself — no Sowee contract can bypass them.

| Control | Mechanism | Behavior when triggered | Demonstrated by |
|---|---|---|---|
| KYC / investor eligibility | ATS KYC facet + allowlist (`isWhiteList: true` at issuance) | Any transfer to/from a non-KYC'd wallet **reverts at the token layer**, including fills routed through `InvoiceMarket` | Market tests with allowlist mock; `bootstrapCompliance` in `@sowee/plugin-ats` |
| Protocol contracts as compliant holders | Market & settlement proxies must themselves be KYC'd per bond | Un-bootstrapped bond → every escrow/claim transfer reverts | `bootstrapCompliance` batches grants for market + settlement + participants atomically |
| Dispute freeze | ATS partial freeze (`freezePartialTokens`) | Frozen units cannot move while a dispute is open; other holders unaffected | `@sowee/plugin-ats` compliance wrappers |
| Emergency halt | ATS pause facet | All token operations stop | plugin-ats `pause`/`unpause` |
| Court-ordered recovery | ERC-1644 controller transfer / ERC-3643 `forcedTransfer` | Regulator/controller can move units without holder signature | plugin-ats lifecycle wrappers |
| Offering regulation flags | ATS issuance `FactoryRegulationData` (Reg S default) | Regulation type + country allow/block lists recorded on-chain at issuance | `createInvoiceBond` defaults in plugin-ats |

## Protocol-layer controls (Sowee contracts)

| Control | Mechanism | Behavior when triggered | Demonstrated by |
|---|---|---|---|
| Priced-funding integrity | `DiscountOracle` EIP-712 signed quotes (nonce + expiry) | Expired/replayed/unsigned quotes revert `buyPrimary` listing | 10 oracle tests incl. fuzz |
| Settlement-asset integrity | `PegGuard` on Chainlink USDC/USD | New funding blocked on >100 bps depeg or stale feed; **exits (cancel/claim) never blocked** | 17 peg-guard tests; funding-blocked/exit-allowed suite |
| Guaranteed exit | Cancels work while paused; claims are pull-based and unguarded | A halt or depeg can stop new money in, never lock money up | Market pause tests + settlement claim tests |
| Deterministic payout | Surrender-based claims: `repayment × units / supply` | Double-claims structurally impossible; rounding documented (payouts round down) | 20 settlement tests |
| Upgrade governance | UUPS, `_authorizeUpgrade` owner-gated, two-step ownership | Non-owner upgrades revert; ownership cannot be fat-fingered | 7 upgrade + 3 ownership tests |

## Audit trail (Hedera Consensus Service)

| Control | Mechanism | Demonstrated by |
|---|---|---|
| Immutable event log | Every lifecycle event (`issued`/`verified`/`funded`/`traded`/`settled`) published to an HCS topic with consensus timestamps, readable by anyone on HashScan | `@sowee/core` hcs module; Go API `/attest` endpoint |
| Double-pledge detection | Invoice document sha256 anchored on first issuance; duplicate `docHash` rejected (HTTP 409) and detectable publicly on the topic | Go API double-pledge guard + tests |

## Documented, deliberately not enabled on testnet

Per the [contracts security section](https://github.com/sowee-finance/contracts#security--ownership): multisig owner (2-of-3 Safe or Hedera threshold-key account), timelock on upgrades, and production-tight PegGuard staleness (testnet Chainlink feeds heartbeat daily). Migration requires no code changes — one ownership transfer per contract.

## Known limitations

- KYC grants assert an off-chain verification happened; Sowee does not perform identity verification itself (an ATS SSI/Terminal 3 integration is the production path).
- The demo rate strategy prices tenor, not credit risk.
- HCS anchoring proves existence and ordering of documents, not their truthfulness.
