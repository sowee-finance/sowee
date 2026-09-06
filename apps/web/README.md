# web

Next.js dapp for Sowee: marketplace, bond detail with primary buy and secondary asks, issuer
console and portfolio.

## Run

```sh
bun install                 # from the repo root
cp .env.example .env.local  # optional; defaults to Hedera testnet
bun run dev                 # http://localhost:3000
bun run build && bun run start
bun run lint                # next typegen + tsc
bun test                    # unit tests (data mapping, hashing, error decoding)
```

| Env | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `296` | chain the UI reads from and asks the wallet to join: `296` (Hedera testnet) or `31337` (anvil) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | origin of `apps/api` (quotes, attestations); read at build time and added to the CSP `connect-src` |

Only injected wallets are supported.

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
| `/invoices/[id]` | the above plus `balanceOf` and `isEligible` for the wallet, `primaryCost`, `feeBps`, USDC `allowance` and `balanceOf`; writes `approve` then `buyPrimary`. Secondary market: `nextAskId` and `asks(i)`; writes USDC `approve` + `fillAsk`, bond `approve` + `makeAsk`, `cancelAsk` |
| `/issuer` | the wallet's own listings (`listing(id).issuer`) with a link to `/issuer/new` |
| `/issuer/new` | three steps: `POST /v1/invoices/{ref}/quote` on the API, `listInvoice(name, symbol, maturity, quote, signature)`, then `POST /v1/invoices/{ref}/attest` with the document's sha256 (hashed in the browser with Web Crypto; the file is never uploaded) |
| `/portfolio` | every bond with `balanceOf > 0` plus `isEligible` and `MaturitySettlement.claimable`; writes `claim`; the wallet's open asks with `cancelAsk` |
| `/kyc` | placeholder linked from every "not eligible" notice; onboarding arrives in #23 |

Every write is simulated with `eth_call` first, so a revert (`AlreadyListed`, `QuoteExpired`,
`NonceUsed`, `NotEligible`, ...) shows as a readable message instead of an opaque wallet error
(`src/lib/errors.ts`).

## Local chain

```sh
anvil                                                          # terminal 1
cd contracts && DEPLOYER_PK=$ANVIL_PK QUOTE_SIGNER=$ANVIL_ADDR WRITE_DEPLOYMENTS=true \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd apps/api && PORT=8080 CHAIN_ID=31337 DISCOUNT_ORACLE=$ORACLE QUOTE_SIGNER_PK=$ANVIL_PK \
  go run ./cmd/api                                             # terminal 2 (quote signer)
cd apps/web && NEXT_PUBLIC_CHAIN_ID=31337 bun run dev          # terminal 3
```

On chain 31337 the deploy script also deploys a `MockUSDC` and uses it as the settlement asset;
`$ORACLE` is `discountOracle` from `contracts/deployments/31337.json` (local state, not
committed). The API signs quotes with the deployer key because the script made it the oracle's
signer. Without Hedera operator credentials the attest step answers 503 and the issuer console
says so; the listing itself still goes through.

A wallet needs eligibility on a bond before it can buy or fill, and USDC to pay with:

```sh
cast send $BOND "setEligible(address,bool)" $WALLET true --private-key $ANVIL_PK   # deployer holds COMPLIANCE_ROLE
cast send $USDC "mint(address,uint256)" $WALLET 100000000000 --private-key $ANVIL_PK
```
