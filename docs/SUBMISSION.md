# ETHGlobal Submission Draft — Sowee

> Paste-ready draft for the ETHOnline 2026 submission form. Edit before submitting; every claim below is verifiable via the linked artifacts.

## Project name

Sowee

## Tagline

Compliant invoice financing on Hedera — tokenize receivables, fund them in USDC, trade them under KYC, settle them on-chain automatically.

## What it does

Small businesses wait 30–90 days for invoices to be paid. Sowee turns those receivables into compliant, fractional, tradable on-chain assets:

- Invoices are issued as **zero-coupon bonds via Hedera's Asset Tokenization Studio** (ERC-1400, KYC allowlist enforced at the token layer).
- Investors fund them in **USDC** at a discount priced by **EIP-712 signed quotes** (a pull oracle — the same model Pyth uses, in miniature).
- Before maturity, units trade on Sowee's **compliant secondary market** — the piece ATS itself doesn't have; transfers to non-KYC'd wallets revert inside the token.
- A **Chainlink USDC/USD peg guard** blocks new funding during a depeg (exits are never blocked).
- At maturity, settlement **schedules itself on-chain** via the Hedera Schedule Service (HIP-1215) — no keeper; holders claim pro-rata USDC by surrendering units.
- Every lifecycle event is anchored to **HCS** with the invoice document's sha256 — double-pledging the same invoice becomes publicly detectable.

## How it's made

Three layers, all open source (Apache-2.0), all tested and CI-gated:

- **Contracts** ([sowee-finance/contracts](https://github.com/sowee-finance/contracts)): Foundry, 76 tests incl. fuzz, zero-lint-note gate. `DiscountOracle` (EIP-712, replay-protected), `InvoiceMarket` (primary + secondary, USDC/HTS association handled), `MaturitySettlement` (HSS-scheduled, surrender-based claims), `PegGuard` (Chainlink). All UUPS behind ERC-1967 proxies with ERC-7201 namespaced storage and two-step ownership; Sourcify-verified exact match. Hedera-specific traps solved: HTS association from initializers (proxy address holds funds), the relay's `0xfe` system-contract bytecode in fork simulations, daily-heartbeat testnet feeds.
- **Packages** ([sowee-finance/sowee](https://github.com/sowee-finance/sowee), npm-ready `@sowee/*`): `core` (domain, EIP-712 signing — golden vectors pinned in three languages/components, Mirror Node client, HCS schemas), `plugin-ats` (v8 factory issuance with derived Luhn-valid ISINs, role/SSI/KYC/mint wrappers, `bootstrapCompliance` — the exact sequence proven on-chain), `plugin-chainlink` (feed reads through the mirror node, no RPC needed). 87 unit/regression tests + live-testnet integration suites.
- **Apps** (untracked by design): Next.js dapp (live mirror-node reads, Dynamic wallet on chain 296, real approve/buy/claim flows with human error mapping) and a Go API (chi/slog, EIP-712 quote signer, HCS attestation, double-pledge guard).
- **Reproducible E2E demo** (`scripts/e2e`): one command drives issuance → compliance → quote → funding → HCS attestation → scheduled settlement live on testnet, stage-aware and resumable.

## Live artifacts

- InvoiceMarket proxy: https://hashscan.io/testnet/contract/0.0.10205673
- DiscountOracle proxy: https://hashscan.io/testnet/contract/0.0.10205670
- MaturitySettlement proxy: https://hashscan.io/testnet/contract/0.0.10205676
- PegGuard: https://hashscan.io/testnet/contract/0.0.10205678
- HCS audit topic: https://hashscan.io/testnet/topic/0.0.10206435
- Compliance control matrix: [COMPLIANCE.md](../COMPLIANCE.md)

## Track fit — Hedera "Tokenization of Anything"

Requirements: ATS on testnet ✓ (v8 pre-deployed factory), public repos ✓, verified contracts on HashScan ✓, demo video ≤5 min (issuance → configuration → lifecycle ops) — script the video from the E2E demo's stages.

Extra points hit: **secondary market for ATS assets** (the gap the track calls out), **active compliance controls** (KYC grants, freezes, pauses, control lists — exercised, not just available), **fee schedules & distributions** (market fee hook, pro-rata settlement), **oracle integration** (EIP-712 pull oracle + Chainlink peg guard), **Scheduled Transactions** (HSS-scheduled settlement).

## Video outline (≤5 min)

1. (30s) Problem: invoice financing is trust-starved — slow verification, double-pledging fraud, locked-out SMEs.
2. (60s) Issue an invoice bond via ATS: derived ISIN, KYC allowlist on, HCS anchor of the document hash.
3. (60s) Fund it: signed quote → USDC purchase in the dapp; show a non-KYC wallet reverting and the peg guard config.
4. (60s) Trade it: secondary ask filled under compliance; HashScan trail.
5. (60s) Settle it: HSS-scheduled call fires at maturity, holder claims USDC; audit trail end-to-end on the HCS topic.
6. (30s) What's real: verified contracts, test counts, npm-ready packages, production posture (multisig/timelock documented).
