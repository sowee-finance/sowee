# contracts

Solidity core of Sowee, built with [Foundry](https://getfoundry.sh).

| Contract | Role |
|---|---|
| `BondToken` | fractional bond units with a KYC allowlist enforced on every transfer |
| `DiscountOracle` | verifies EIP-712 discount quotes (nonce + expiry) signed by the API; the quote binds issuer, face value and maturity |
| `InvoiceMarket` | primary funding in USDC at the quoted discount; compliant secondary asks |
| `MaturitySettlement` | payor repays in USDC; holders surrender units for a pro-rata claim; permissionless settle once holders are covered or after a 7-day grace, issuer may settle a partial repayment; unfunded repayments can be withdrawn |

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
| Arc testnet | 5042002 | `https://rpc.testnet.arc.network` | https://testnet.arcscan.app |

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

## Security review (6 Sep)

An adversarial pass over the contracts produced these changes, all covered by tests:

- `DiscountOracle.Quote` now carries `issuer` and `maturity`; `listInvoice` takes the maturity from
  the quote and refuses a caller other than the quoted issuer. Before, a quote priced for a short
  tenor could open a multi-year listing, and any holder of a quote could list it as the issuer.
- `MaturitySettlement.settle` refuses a bond with no units outstanding (the repayment would have
  been locked forever), is only permissionless once holders are fully covered or after
  `GRACE` (7 days), and lets the issuer settle a partial repayment early; `withdrawRepayment`
  returns a deposit nobody can claim.
- `InvoiceMarket.revokeBondRole` (operator rotation), `setSettlement` grants the burn role on
  bonds listed earlier, and `setFee` refuses a non-zero fee without a treasury.

Both networks below run this build; the pre-review deployment was replaced rather than patched.

## Deployments

### Hedera testnet (chain 296)

| Contract | Address | HashScan |
|---|---|---|
| DiscountOracle | `0xb6d7F1e018195E0000eb0EE017E36c61113e9010` | https://hashscan.io/testnet/contract/0xb6d7F1e018195E0000eb0EE017E36c61113e9010 |
| InvoiceMarket | `0xe7f89692940f5BCc30096cd48f360F2144155962` | https://hashscan.io/testnet/contract/0xe7f89692940f5BCc30096cd48f360F2144155962 |
| MaturitySettlement | `0x68faa98A8e42ef8ffC946e3d571C3940Dc0f6219` | https://hashscan.io/testnet/contract/0x68faa98A8e42ef8ffC946e3d571C3940Dc0f6219 |
| USDC (HTS) | `0x0000000000000000000000000000000000068cDa` (`0.0.429274`) | https://hashscan.io/testnet/token/0.0.429274 |

Duties are held by different keys, which is what `COMPLIANCE_OPERATOR` and `TREASURY` are for:

| Role | Wallet |
|---|---|
| Quote signer (the API signs discount quotes with it) | `0x17CaD6366c73955bBb05194882D5B906B5D1c116` (`0.0.7162116`) |
| Owner, compliance operator, treasury | `0xbD6bB4c460B60F61eF0B0A5d2241Bf0765Bae910` (`0.0.10394443`) |

Fee 0.5%. Sources are exact-match verified on Sourcify. Addresses live in
[`deployments/296.json`](deployments/296.json), which `apps/web` and `apps/api` read.

### Live lifecycle (testnet transactions)

Issuer and payor = `0xbD6b…e910`; investor = `0x05F2…a6af` (`0.0.10215221`), granted through the
KYC flow; the agent uses the investor account.

| Step | Transaction |
|---|---|
| `listInvoice` INV-2026-010 (100 USDC, 2.25%, 30 days) with an API-signed quote → bond `sINV010` [`0xCb4056Da…`](https://hashscan.io/testnet/contract/0xCb4056Da92692877d5587eD51f63a5A410F39E8c) | [`0x64b74a03…`](https://hashscan.io/testnet/transaction/0x64b74a035f41e0ca3dc8c01832ea89121faa6caf23a697b29c3ae66383d8c5ac) |
| KYC grant written by the API's compliance operator after a GREEN review (`setEligible`) | [`0x689e5db9…`](https://hashscan.io/testnet/transaction/0x689e5db97611383e2004b9fce12490f6e2723a0c33d8277de15cec36a3b187a6) |
| `buyPrimary` 12 units — 11.73 USDC to the issuer, 0.05865 fee to the treasury, 12 units minted | [`0x82052ee7…`](https://hashscan.io/testnet/transaction/0x82052ee7835d4e79aab0920ca3923a3dd6d980accb15c81d8b5d715d4ad63820) |
| `makeAsk` 4 units at 99% of face | [`0x1388a4d4…`](https://hashscan.io/testnet/transaction/0x1388a4d4fa1bdf28401527d42cf52abd80b4b9928ad5745ccbe6a40bd52cb65c) |
| The **agent** pays 0.01 USDC for the insights, then funds 1 unit of the bond they pointed it at | [`0x89d2462b…`](https://hashscan.io/testnet/transaction/0x89d2462bb54ca04f90437e02de567e998f84abc2698571732db18f7148f0e8ec) |
| `listInvoice` INV-2026-011 (20 USDC, short-dated) → bond `sINV011` [`0x09ce7ABE…`](https://hashscan.io/testnet/contract/0x09ce7ABE9373cf3ef55B4da8478ea32f4C97c502) | [`0x5d18cee1…`](https://hashscan.io/testnet/transaction/0x5d18cee1ed31da841b92d6d6695221572ebc2b6cb93d450724d83f7262cf31bf) |
| `buyPrimary` 5 units of INV-2026-011 | [`0xf1394661…`](https://hashscan.io/testnet/transaction/0xf1394661376780c94713ad9976a26fd5de3d5ab92c8a242b4f96af7d44012266) |
| `registerRepayment` 5 USDC by the payor | [`0x19de2780…`](https://hashscan.io/testnet/transaction/0x19de27801cad6e72f264682677fe1e4991622f23177f61404a802c5bf0cd0594) |
| `settle` after maturity — permissionless because the repayment covers every unit | [`0x32a150bd…`](https://hashscan.io/testnet/transaction/0x32a150bd5ef18a0bb1bce31913374281b988384fe8f9118fe19f94f40a8f2c51) |
| `claim` — 5 units burned, 5 USDC paid to the holder | [`0xb83a7e12…`](https://hashscan.io/testnet/transaction/0xb83a7e12d19e9d3dfb3cd0a64fadae4e1f03f44d3f511d2ca960f0622e53243d) |

Checked with `eth_call` on the same state: a second `claim` reverts `NothingToClaim(0x05F2…)`,
and a bond transfer to a wallet that was never granted reverts `NotEligible` at the token layer.

### Arc testnet (chain 5042002)

Same bytecode, one stage (`forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast`,
no precompile involved); gas is paid in USDC, the native token of Arc.

| Contract | Address |
|---|---|
| DiscountOracle | [`0x8811c54E2961612F94C11EbFc7F4873210CC3949`](https://testnet.arcscan.app/address/0x8811c54E2961612F94C11EbFc7F4873210CC3949) |
| InvoiceMarket | [`0x4ED35623ed0DbCf42d07438D1AA7a526E2D22Be7`](https://testnet.arcscan.app/address/0x4ED35623ed0DbCf42d07438D1AA7a526E2D22Be7) |
| MaturitySettlement | [`0x15BBde11682eBD77f91d563A1999873F7727369e`](https://testnet.arcscan.app/address/0x15BBde11682eBD77f91d563A1999873F7727369e) |
| USDC (native, ERC-20 interface) | `0x3600000000000000000000000000000000000000` |

Sources exact-match verified on Sourcify. Live on Arc:

| Step | Transaction |
|---|---|
| `listInvoice` ARC-INV-001 (50 USDC, 2.25%, 45 days) → bond `sARC001` [`0x179Bbd5c…`](https://testnet.arcscan.app/address/0x179Bbd5c8c3F9Db0ff7b8c68c4A81C6cEbD71EcC) | [`0xf51c18f8…`](https://testnet.arcscan.app/tx/0xf51c18f8799141542130416c75957d4d9fb38198b40c79c08ed975cb2554d892) |
| `setEligible` investor | [`0xfa96eaf9…`](https://testnet.arcscan.app/tx/0xfa96eaf94ffe7db9f59ab305682d116ae5e6391d56db5bfae9eef0e1667a96e8) |
| `buyPrimary` 2 units in native USDC (1.955 USDC to the issuer, fee to the treasury) | [`0x861cdc38…`](https://testnet.arcscan.app/tx/0x861cdc380b15f292e85b0d829e86555ffb2579e91b67164fbd88ef06588dbabc) |

**Known limitation of the Hedera deployment.** HTS refuses a transfer whose sender and receiver are
the same account (`ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS`), so a buyer that is also the treasury
cannot pay the fee to itself. The secondary fill above was run with the fee set to 0 and
restored to 0.5% afterwards. `InvoiceMarket._takeFee` now skips the fee when the payer is the
treasury; the fix is in the source and tests but not in the deployed bytecode.
