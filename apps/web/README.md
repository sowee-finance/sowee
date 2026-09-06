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
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | origin of `apps/api` (quotes, attestations, KYC); read at build time and added to the CSP `connect-src` |
| `NEXT_PUBLIC_WORLD_APP_ID` | unset | World app id; unset hides the Selfie Check step of the KYC wizard |

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
| `/kyc` | the investor onboarding wizard (below); every "not eligible" notice links here |

Every write is simulated with `eth_call` first, so a revert (`AlreadyListed`, `QuoteExpired`,
`NonceUsed`, `NotEligible`, ...) shows as a readable message instead of an opaque wallet error
(`src/lib/errors.ts`).

## KYC wizard (`/kyc`)

Wallet → Sumsub → suitability policy → on-chain grant, driven by the API's `/v1/kyc/*` routes
(`apps/api/README.md`, "KYC and on-chain eligibility"). `src/components/kyc-wizard.tsx`:

| Step | What happens |
|---|---|
| Welcome | what will be asked and what never reaches the chain (only eligible / not eligible per wallet) |
| Sign in | connect, `GET /v1/kyc/challenge`, `personal_sign` the message; `{issuedAt, signature}` stay in React state for the hour they are valid and authenticate every write |
| Selfie Check | World anti-sybil gate. Skipped unless `NEXT_PUBLIC_WORLD_APP_ID` is set; with it set, `src/components/selfie-check-step.tsx` renders a "coming soon" placeholder that is the extension point for `@worldcoin/idkit` (it receives `wallet` and calls `onVerified()`) |
| Profile | first and last name, date of birth (`<input type="date">`), country of residence (ISO 3166-1 alpha-3 `<select>`) |
| Declarations | the `sowee-investor-suitability` questionnaire; every answer is required and submitted as-is with the profile in one `POST /v1/kyc/profile` (`202` + status). The policy decides, the form does not filter |
| Identity | `POST /v1/kyc/session` for a WebSDK token, then the Sumsub WebSDK from `static.sumsub.com` (no npm package) mounts its iframe for document + liveness; `idCheck.onApplicantSubmitted` moves on, the token refresh callback mints a new one |
| Status | `GET /v1/kyc/status` every 5 s: `pending / held / blocked / granting / granted` in plain words with the API's reason; `granted` links to the marketplace and lists the grant transactions on HashScan |

On load the wizard reads the status: a wallet with a file open (`pending`, `held`, `blocked`,
`granting`, `granted`) lands on Status, `none` starts at Welcome. Switching wallets starts
over. The header shows a `KycBadge` with the connected wallet's state ("Verify" for `none`, a
check mark once `granted`). The CSP allows `static.sumsub.com` scripts and `*.sumsub.com`
frames, connections and images; `Permissions-Policy` already grants camera and microphone.

The API needs `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` (sandbox), the level with its
questionnaire, and a compliance key for the grant; without Sumsub credentials the routes answer
`503` and the wizard says so.

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

## Chains

| `NEXT_PUBLIC_CHAIN_ID` | Network | Addresses from |
|---|---|---|
| `296` (default) | Hedera testnet | `contracts/deployments/296.json` |
| `5042002` | Arc testnet (USDC is the gas token) | `contracts/deployments/5042002.json` |
| `31337` | anvil | `contracts/deployments/31337.json` (local, git-ignored) |

Explorer links follow the active chain (HashScan or Arcscan). The API pricing quotes for Arc
must run with `CHAIN_ID=5042002` and the Arc oracle address.
