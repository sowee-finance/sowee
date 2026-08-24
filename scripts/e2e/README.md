# @sowee/e2e-demo

Reproducible end-to-end demo of the full Sowee invoice-financing lifecycle against **Hedera
testnet**, driving the real deployed contracts (`SOWEE_TESTNET` in `@sowee/core`), the real ATS
factory, the Go quote/attestation API in `apps/api`, USDC (HTS `0.0.429274`), HCS, and the Hedera
Schedule Service.

## Run

```sh
pnpm install
pnpm -r build           # builds @sowee/core and @sowee/plugin-ats
pnpm --filter @sowee/e2e-demo demo
```

Requirements:

- `WALLET_PK` in the repo-root `.env` — the raw hex ECDSA key of the deployer/owner/oracle-signer
  EOA `0x17CaD6366c73955bBb05194882D5B906B5D1c116` (Hedera account `0.0.7162116`), with HBAR for
  gas.
- Go toolchain (the demo spawns `go run ./cmd/api` from `apps/api`; logs land in
  `scripts/e2e/api.log`).
- Testnet USDC on the wallet. On first run the demo associates the wallet to USDC and then **halts
  with faucet instructions** if the balance is 0 — get 10 USDC from
  <https://faucet.circle.com> (network: Hedera Testnet) and re-run.

## Stage-aware and idempotent

Progress is checkpointed in `scripts/e2e/state.json` (gitignored together with `api.log` via this
package's `.gitignore`, so the repo stays clean). Re-running resumes at the first incomplete step;
completed steps print `ok ... already ...` and are skipped. Every on-chain step prints a HashScan
link. Delete `state.json` to restart the whole demo from a fresh bond (necessary if a previous
run's 20-minute maturity has already passed before listing/settlement registration).

## Stages and what each proves

| Stage | What happens | What it proves |
| --- | --- | --- |
| a. preflight | Checks HBAR/USDC balances; associates the EOA to USDC by calling `associate()` (`0x0a754de6`) on the token's EVM facade | HIP-719 EOA token association works from plain EVM tooling |
| b. api-up | Spawns the Go API with the quote-signer + Hedera operator env; waits for `/v1/healthz`; records the HCS topic it creates | The off-chain pricing/attestation service boots against testnet and provisions its own HCS topic |
| c. issue-bond | Registers a 10 USDC invoice (maturity ~20 min out) with the API, then `deployBond` on the ATS factory via `@sowee/plugin-ats`; reads the new diamond address from the mirror node's `call_result` | Invoices become real ERC-1400/ERC-3643 security diamonds through Asset Tokenization Studio |
| d. compliance | Self-grants the ATS `SSI manager`, `KYC`, `control list`, and `issuer` roles, adds the deployer as SSI issuer, runs `bootstrapCompliance` (KYC + allowlist for InvoiceMarket, MaturitySettlement, and the wallet), then mints the 10 bond units | ATS compliance gating is real: nothing moves until KYC/allowlist are in place (see discoveries below) |
| e. quote+list | `POST /quote` returns an EIP-712-signed discount quote; `listInvoice` submits it to InvoiceMarket, which verifies it on-chain via DiscountOracle and escrows the units | Off-chain signed pricing is enforced on-chain (domain `SoweeDiscountOracle`, nonce burned) |
| f. fund | `buyPrimary` pays USDC (via the PegGuard circuit-breaker check) and receives bond units from escrow | Primary funding settles atomically in USDC with compliance checks inside the token transfer |
| g. attest | `POST /attest` anchors `issued` + `funded` events to HCS; the demo verifies them via mirror-node topic messages | A tamper-evident audit trail exists independent of the EVM state |
| h. settle | `registerInvoice`, deposit the 10 USDC repayment, `scheduleSettlement` via the Hedera Schedule Service (HSS, `0x16b`), wait out maturity, fall back to permissionless `settle()` if the schedule does not fire, then `claim()` surrenders units for the payout | Zero-coupon redemption at maturity, automated by HSS with a trustless manual fallback |

Single-wallet demo: the deployer plays issuer, investor, payor, compliance officer, and oracle
signer at once. That is fine for demonstrating the mechanics — every transfer still passes the
same on-chain compliance and signature checks a multi-party setup would.

## ATS discoveries baked into this demo

- The v8 factory validates a full ISO 6166 ISIN (12 characters + Luhn checksum) and reverts
  `WrongISIN` on `@sowee/plugin-ats`'s empty-string default — the demo passes the checksum-valid
  placeholder `SW0WEE000004`.
- The bond creator only gets `DEFAULT_ADMIN_ROLE` from the factory `rbacs`; the operational roles
  must be self-granted. Role ids are keccak hashes of
  `asset.tokenization.standard.role.<Name>` — the exact constants are vendored in `src/abi.ts`
  from `@hashgraph/asset-tokenization-contracts@8.0.0` `contracts/constants/roles.sol`.
- `grantKyc` rejects the zero address as KYC issuer (`AccountIsNotIssuer`): the granting wallet
  must first be added to the bond's SSI issuer list (`addIssuer`, `ROLE_SSI_MANAGER`), and the
  grant must name it via the `issuer` parameter.
- Bond units are minted with the ERC-1594 `issue(address,uint256,bytes)` facet (`ROLE_ISSUER`),
  and only to an address that already passes KYC + control-list checks — compliance before mint.
- The Go API's `hiero-sdk-go` parses a raw 32-byte hex key as **Ed25519**; the demo passes
  `HEDERA_OPERATOR_KEY` wrapped in the ECDSA-secp256k1 DER envelope
  (`3030020100300706052b8104000a04220420` + key) so HCS transactions are signed correctly.
