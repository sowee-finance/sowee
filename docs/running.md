# Running Sowee

The README covers the one command that brings the stack up against Hedera testnet. This file has
the rest: a purely local chain, and walking through KYC yourself.

## On a local chain

Nothing here needs a vendor account. Quotes are signed by a key you control and the marketplace
reads a chain running on your own machine.

```sh
# 1. contracts on anvil
anvil &                                    # prints account 0's key
cd contracts && DEPLOYER_PK=<anvil key 0> QUOTE_SIGNER=<anvil address 0> WRITE_DEPLOYMENTS=true \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast && cd ..

# 2. api — quotes work without any vendor credential
cd apps/api && PORT=8080 CHAIN_ID=31337 DISCOUNT_ORACLE=<from contracts/deployments/31337.json> \
  QUOTE_SIGNER_PK=<anvil key 0> go run ./cmd/api & cd ../..

# 3. web
cd apps/web && NEXT_PUBLIC_CHAIN_ID=31337 bun run dev
```

`bun run build && bun run start` works against the local chain too. The Content-Security-Policy
follows `NEXT_PUBLIC_CHAIN_ID` rather than the build mode, so a local build is allowed to reach
anvil while a testnet build is not — otherwise a production build against anvil renders an empty
marketplace with nothing but a console violation to explain it.

## Against Hedera testnet

`scripts/demo.sh up` reads `.env.demo`. The addresses come from `contracts/deployments/296.json`;
the keys are the Hedera operator (HCS), the Sumsub sandbox pair (KYC), the quote signer and the
compliance operator, and optionally `WORLD_*` for Selfie Check.

`scripts/demo.sh status` says what is actually listening — it probes the ports rather than
assuming — and warns when the served build is older than the source, which is the quiet failure:
the page loads, and it is yesterday's page.

## Trying KYC yourself

The Sumsub **sandbox** never checks real documents.

Open the wizard at `/kyc`, sign the challenge, fill in the profile and the declarations, then in
the identity step upload one of Sumsub's
[document templates](https://docs.sumsub.com/docs/verification-document-templates) — a sample
passport plus the liveness selfie from your webcam.

Upload the template exactly as downloaded. Re-saving or screenshotting it makes Sumsub treat it
as an ordinary document, and the expected result never comes back.

The review lands within a minute. The wizard polls `GET /v1/kyc/status` and shows `held`,
`blocked` — answer "US person: yes" to watch Regulation S refuse a wallet — or `granted`, with
the on-chain grant transactions beside it.

Without a webcam, a sandbox review can be driven through Sumsub's `status/testCompleted`
endpoint. That is how the grant linked from the README was produced.

### One person, one eligible wallet

`REQUIRE_SELFIE_CHECK=true` makes the Selfie Check a condition of eligibility rather than a
convenience. A nullifier is spent exactly once, so with it on, one person can hold at most one
wallet on the allowlist.

```sh
REQUIRE_SELFIE_CHECK=true go run ./cmd/api    # in apps/api
```

A wallet whose review came back GREEN but which never passed a check now reports `held`, with
"a World Selfie Check is required before eligibility" as the reason, and no grant is sent. Pass
the check and the same wallet proceeds. A second wallet cannot spend the same World ID: the
verify route answers `409` and names the wallet the proof already belongs to.

Two things to know before turning it on:

- **Turn it on before granting anyone, not after.** A wallet already granted will report `held`
  while its on-chain eligibility stands — `held` does not revoke, only `blocked` does, and
  flipping a flag is not a reason to take someone's eligibility away.
- With it on, an investor without a World App cannot be granted at all. That is the point, and it
  is also why it is off by default.

## Tests

```sh
forge test                      # contracts, in contracts/
go test ./...                   # api, in apps/api
bun test                        # apps/web and apps/agent
bun run lint                    # biome across the workspace
```

CI runs Biome, Foundry, Go and the web and agent suites on every pull request.

## Design choices

- **A plain-EVM compliance token** we fully control, tested in-process, portable to Arc unchanged.
- **USDC never sits in the market.** The issuer and makers are paid directly; only settlement
  escrows anything.
- **Pull-based claims that burn.** No loops, no double claims, no gas cliffs.
- **Status only on chain**, fail-closed off chain.
- **Receipts and attestations on HCS**, replayed from the mirror node at startup — no database.
