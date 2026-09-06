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

## Status

Not started. The deployer has no USDC on Arc testnet yet.

## Feedback

To be filled if the track is attempted.
