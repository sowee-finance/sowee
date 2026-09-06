# contracts

Solidity core of Sowee, built with [Foundry](https://getfoundry.sh).

| Contract | Role |
|---|---|
| `BondToken` | fractional bond units with a KYC allowlist enforced on every transfer |
| `DiscountOracle` | verifies EIP-712 discount quotes (nonce + expiry) signed by the API |
| `InvoiceMarket` | primary funding in USDC at the quoted discount; compliant secondary asks |
| `MaturitySettlement` | payor repays in USDC; holders surrender units for a pro-rata claim |

Contracts are listed as they land; a row without a deployed address is not live yet.

## Commands

```sh
forge build
forge test -vvv
forge fmt --check
```

## Networks

| Network | Chain id | RPC | Explorer |
|---|---|---|---|
| Hedera testnet | 296 | `https://testnet.hashio.io/api` | https://hashscan.io/testnet |

Copy `.env.example` to `.env` and fill it, then:

```sh
# local: anvil in another terminal, then (deploys a MockUSDC too)
DEPLOYER_PK=<anvil key 0> QUOTE_SIGNER=<anvil addr 0> WRITE_DEPLOYMENTS=true \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# hedera testnet — two stages
forge script script/Deploy.s.sol --rpc-url hedera_testnet                       # dry run (local execution only)
WRITE_DEPLOYMENTS=true WITH_SETTLEMENT=false forge script script/Deploy.s.sol \
  --rpc-url hedera_testnet --broadcast --skip-simulation --gas-estimate-multiplier 120
WRITE_DEPLOYMENTS=true forge script script/DeploySettlement.s.sol \
  --rpc-url hedera_testnet --broadcast --skip-simulation --gas-estimate-multiplier 200
```

The settlement stage carries a larger multiplier because its constructor calls the HTS
precompile, which the local execution only mocks; the core stage needs no headroom.

Hedera specifics worth knowing:

- The relay charges at least 80% of the gas *limit*, so pad estimates rather than trust them.
- USDC on Hedera testnet is an HTS token (`0.0.429274`); any account or contract that
  receives it must be associated first. `MaturitySettlement` associates itself in its
  constructor through the HTS precompile at `0x167` (`HederaAssociable`).
- Foundry's on-chain simulation cannot execute that precompile (the relay reports `0xfe`
  there), so a broadcast needs `--skip-simulation`. The script etches a mock at `0x167` for
  its local execution phase; the gas multiplier covers the real association cost.

`deployments/<chainId>.json` is written on deploy and consumed by `apps/web` and `apps/api`.

## Deployments

### Hedera testnet (chain 296)

| Contract | Address | HashScan |
|---|---|---|
| DiscountOracle | `0xc144F01296809442850E342464b3d01fd812c32c` | https://hashscan.io/testnet/contract/0xc144F01296809442850E342464b3d01fd812c32c |
| InvoiceMarket | `0x707c7C611CfaBD75815785cbfc18D3d4F2BCB0ac` | https://hashscan.io/testnet/contract/0x707c7C611CfaBD75815785cbfc18D3d4F2BCB0ac |
| MaturitySettlement | `0x80D0C4E0A991485A980614eB46b3224b2ACBe930` (`0.0.10388595`) | https://hashscan.io/testnet/contract/0x80D0C4E0A991485A980614eB46b3224b2ACBe930 |
| USDC (HTS) | `0x0000000000000000000000000000000000068cDa` (`0.0.429274`) | https://hashscan.io/testnet/token/0.0.429274 |

Quote signer, owner, compliance operator and treasury: `0x17CaD6366c73955bBb05194882D5B906B5D1c116`
(`0.0.7162116`). Fee 0.5%. Sources are exact-match verified on Sourcify. Addresses are in
[`deployments/296.json`](deployments/296.json), which `apps/web` and `apps/api` read.

### Live lifecycle (testnet transactions)

Issuer = `0x17Ca…c116`; investor = `0x05F2…a6af` (`0.0.10215221`), granted through the KYC flow.

| Step | Transaction |
|---|---|
| `listInvoice` INV-2026-001 (100 USDC, 2.25%, 30 days) with an API-signed quote → bond `sINV001` [`0xcfDeA74C…`](https://hashscan.io/testnet/contract/0xcfDeA74C43784D10364Befa3a2a3aDD472306600) | [`0x501e0396…`](https://hashscan.io/testnet/transaction/0x501e0396e23da2dfc6c06b331dd97f32504a38d0c15a5d9d8d2d11ccd685447e) |
| KYC grant by the API's granter after a GREEN review (`setEligible`) | [`0xf6e57aa1…`](https://hashscan.io/testnet/transaction/0xf6e57aa1a6e27897f47b4862a3b0f176b6fd673015803db0b3cc0bdfe714b499) |
| `buyPrimary` 10 units — 9.775 USDC to the issuer, 0.048875 fee to the treasury, 10 units minted | [`0x9d844c34…`](https://hashscan.io/testnet/transaction/0x9d844c34099b1332c1587b9b1a2b10376890d3e192be156c4e3bad002a789b90) |
| `makeAsk` 4 units at 98% of face | [`0xeebacfbb…`](https://hashscan.io/testnet/transaction/0xeebacfbb447c1e19a8ff20430b6f8bac392cc430fcf576d0c49c47baf18ff756) |
| `fillAsk` by a second granted wallet — 3.92 USDC to the maker, 4 units moved | [`0x71e14678…`](https://hashscan.io/testnet/transaction/0x71e14678b3674001af5d8a0430cf0ae2a76e593ebaf4066c85dd753d22cd0c7a) |
| `listInvoice` INV-2026-002 (20 USDC, short-dated) → bond `sINV002` [`0xcD846554…`](https://hashscan.io/testnet/contract/0xcD84655473dc6a076B4aFCDAc05aF67DC776C24A) | [`0xad1fc59c…`](https://hashscan.io/testnet/transaction/0xad1fc59c138aebcd963095f6b1a39659a1de0e9f893dcb3a47c99ec7d0cbec0a) |
| `buyPrimary` 5 units of INV-2026-002 | [`0xe98888cc…`](https://hashscan.io/testnet/transaction/0xe98888cc93db1d147777c0673c46f2575d81d9a4e9f0cde4afae23741f716f7f) |
| `registerRepayment` 5 USDC by the payor | [`0x6e57ef2f…`](https://hashscan.io/testnet/transaction/0x6e57ef2f96162b0ba99c89171987eae38ddbdfb7e0f29a0da85a9e636a6cfd41) |
| `settle` after maturity (permissionless) | [`0x799d9c72…`](https://hashscan.io/testnet/transaction/0x799d9c723014713566b035c26f8232843fd300d2ef67f90f1af6e66f01085179) |
| `claim` — 5 units burned, 5 USDC paid to the holder | [`0x7567c713…`](https://hashscan.io/testnet/transaction/0x7567c713e0497517c0102ae54da285431729e033eb946d9dfe5ce38e2a662608) |

Checked with `eth_call` on the same state: a bond transfer to a wallet that was never granted
reverts `NotEligible(0x…dEaD)` at the token layer, and a second `claim` reverts `NothingToClaim`.

**Known limitation of this deployment.** HTS refuses a transfer whose sender and receiver are
the same account (`ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS`), so a buyer that is also the treasury
cannot pay the fee to itself. The secondary fill above was run with the fee set to 0 and
restored to 0.5% afterwards. `InvoiceMarket._takeFee` now skips the fee when the payer is the
treasury; the fix is in the source and tests but not in the deployed bytecode.
