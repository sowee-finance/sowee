# Arc (Circle) — integration notes and feedback

Track: **Best DeFi / Onchain Finance** (stretch; first to cut if time runs short).

## Verified facts we build on

| Item | Value |
|---|---|
| Chain id | 5042002 (testnet) — checked with `cast chain-id` |
| RPC | `https://rpc.testnet.arc.network` |
| USDC | `0x3600000000000000000000000000000000000000` — ERC-20 interface, `symbol() = USDC`, `decimals() = 6`; USDC is also the native gas token (18-decimal native units) |
| Faucet | `https://faucet.circle.com` (select Arc Testnet) |
| Explorer | `https://testnet.arcscan.app` |

## Plan

The finance core is plain EVM: `BondToken`, `DiscountOracle`, `InvoiceMarket`,
`MaturitySettlement` deploy unchanged (`HederaAssociable` is a no-op off Hedera). The only Arc
specifics are the USDC address and gas paid in USDC. Deploy script: `--rpc-url arc_testnet`.

## Status — live on Arc testnet

| Contract | Address |
|---|---|
| DiscountOracle | https://testnet.arcscan.app/address/0x8811c54E2961612F94C11EbFc7F4873210CC3949 |
| InvoiceMarket | https://testnet.arcscan.app/address/0x4ED35623ed0DbCf42d07438D1AA7a526E2D22Be7 |
| MaturitySettlement | https://testnet.arcscan.app/address/0x15BBde11682eBD77f91d563A1999873F7727369e |
| Bond `sARC001` | https://testnet.arcscan.app/address/0x179Bbd5c8c3F9Db0ff7b8c68c4A81C6cEbD71EcC |

Transactions: list https://testnet.arcscan.app/tx/0xf51c18f8799141542130416c75957d4d9fb38198b40c79c08ed975cb2554d892 · grant https://testnet.arcscan.app/tx/0xfa96eaf94ffe7db9f59ab305682d116ae5e6391d56db5bfae9eef0e1667a96e8 · **funded position in native USDC** https://testnet.arcscan.app/tx/0x861cdc380b15f292e85b0d829e86555ffb2579e91b67164fbd88ef06588dbabc

The deploy and the whole lifecycle used exactly the Hedera bytecode: `HederaAssociable` is a
no-op off Hedera, and the market/settlement only ever call the ERC-20 interface. The API signs
Arc quotes by pointing `CHAIN_ID=5042002` and `DISCOUNT_ORACLE` at the Arc oracle (EIP-712
domain binds chain and contract), so one service can price both chains.

## Circle developer tools used

- **Native USDC on Arc** as gas and as the settlement asset, through the ERC-20 interface at
  `0x3600…0000` (6 decimals for the interface, 18 for the native balance).
- **Circle faucet** (`faucet.circle.com`) for testnet USDC.
- Sources verified through Sourcify (Arc testnet is supported); Arcscan links above.

Architecture: see the diagram in the root README — Arc replaces the Hedera box; HCS and x402
stay on Hedera.

## Feedback

- Gas in USDC with 18-decimal native units next to a 6-decimal ERC-20 view of the same
  balance is easy to trip over in tooling that assumes one decimals value per asset.
- Foundry, cast and Sourcify worked out of the box on chain 5042002 — the smoothest of the
  three networks in this build.
- A transfer shows two `Transfer` logs (one from the native precompile at `0xff…fe`, one from
  `0x3600…`), which double-counts in naive indexers.
