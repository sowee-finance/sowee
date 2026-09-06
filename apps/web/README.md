# web

Next.js dapp for Sowee: marketplace, bond detail with primary buy, and the shell the
issuer console and portfolio (#14) plug into.

## Run

```sh
bun install                 # from the repo root
cp .env.example .env.local  # optional; defaults to Hedera testnet
bun run dev                 # http://localhost:3000
bun run build && bun run start
bun run lint                # next typegen + tsc
bun test                    # data-mapping unit test
```

`NEXT_PUBLIC_CHAIN_ID` picks the chain the UI reads from and asks the wallet to join:
`296` (Hedera testnet, default) or `31337` (anvil). Only injected wallets are supported.

## How contracts flow in

- **ABIs**: `bun run abi` copies the ABI of each core contract from `contracts/out` into
  `src/lib/abi/*.ts` as `as const` modules. Run `forge build` in `contracts/` first, then
  commit the generated files.
- **Addresses**: `src/lib/deployments.ts` reads `contracts/deployments/<chainId>.json`, which
  `script/Deploy.s.sol` writes with `WRITE_DEPLOYMENTS=true`. No file for the active chain
  means every page shows "Not deployed on this chain yet" instead of crashing. Pages read the
  file on the server at render time, so a redeploy needs no code change.

## Pages

| Route | What it reads |
|---|---|
| `/` | `listingCount`, `invoiceIds(i)`, `listing(id)` on `InvoiceMarket`; `name`, `symbol`, `totalSupply`, `faceValue` on each `BondToken` |
| `/invoices/[id]` | the above plus `balanceOf` and `isEligible` for the wallet, `primaryCost`, `feeBps`, USDC `allowance` and `balanceOf`; writes `approve` then `buyPrimary` |
| `/issuer`, `/portfolio` | placeholders until #14 |

## Local chain

```sh
anvil                                                          # terminal 1
cd contracts && DEPLOYER_PK=$ANVIL_PK QUOTE_SIGNER=$ANVIL_ADDR WRITE_DEPLOYMENTS=true \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd ../apps/web && NEXT_PUBLIC_CHAIN_ID=31337 bun run dev        # terminal 2
```

On chain 31337 the deploy script also deploys a `MockUSDC` and uses it as the settlement asset.

`contracts/deployments/31337.json` is local state; do not commit it. Listing an invoice needs
an EIP-712 quote signed by `QUOTE_SIGNER` (`cast wallet sign --data --from-file quote.json`)
passed to `InvoiceMarket.listInvoice`; the issuer console in #14 does this through the API.
