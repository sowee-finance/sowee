# AI usage

ETHGlobal asks every team to state exactly where and how AI assisted. This file is the
record. It is updated in the same pull request as the code it describes.

## Tool

Claude Code (Anthropic), run in the terminal by the team.

## How it was used

The team wrote the build plan by hand — product scope, milestones, system design,
compliance policy, and a task list with acceptance criteria — then drove Claude Code task
by task from that plan. A typical instruction was: *"implement task T-xxx to its acceptance
criteria; small commits; open a PR against its issue."* The team reviewed every diff,
requested changes where needed, and merged. Architecture, product decisions, partner-track
choices and the security-sensitive compliance logic are the team's.

## Attribution

| Path | AI-assisted | What the AI produced | Human review |
|---|---|---|---|
| `README.md`, `CLAUDE.md`, `AI-USAGE.md`, `LICENSE`, `.gitignore`, `.editorconfig`, `turbo.json`, `biome.json`, husky hook, workspace `package.json` | yes | drafted from the team's plan and the ETHGlobal rules pages | edited and approved by the team |
| `contracts/` scaffold (`foundry.toml`, `.env.example`, `script/Deploy.s.sol`, `README.md`) | yes | drafted from the task list; network values from Hedera docs | reviewed and dry-run against Hedera testnet by the team |
| `.github/workflows/ci.yml` | yes | Biome + Foundry jobs | reviewed by the team |
| `apps/api/` (config, chi server, EIP-712 quote signer, pricing policy, tests, README) | yes | drafted from issues #5 and #10 against `DiscountOracle.sol` and the pinned digest vector | reviewed line by line by the team; `go test` and a live curl run before merge |
| `apps/api/internal/hcs/` + attest endpoint | yes | drafted from issue #12 and the Hiero SDK docs (topic create/submit, mirror-node replay) | reviewed by the team; run live on testnet (topic 0.0.10388277) before merge |
| `apps/api/internal/x402/`, `internal/market/`, insights + usage routes | yes | drafted from issues #24 and #26 against the x402 v2 spec (HTTP transport, Hedera exact scheme) and the facilitator's `/supported` | reviewed by the team; a self-caught hashing bug fixed before commit; 402 challenge verified live against Blocky402 |
| `apps/agent/` | yes | drafted from issue #25 on top of the official `@x402/fetch` + `@x402/hedera` client packages | reviewed by the team; run for real on testnet (0.01 USDC settlement) before merge |
| `apps/api/internal/kyc/`, `internal/grant/`, KYC routes | yes | drafted from issues #17–#20 and the Sumsub API reference (signing, applicants, questionnaires, webhooks) | policy rules decided by the team; reviewed line by line; table tests plus a live sandbox run before merge |
| `apps/api/internal/world/`, `internal/faucet/`, `internal/ratelimit/`, their routes | yes | drafted from issues #21–#22 and docs.world.org (RP signature spec, verify endpoint) using the official `idkit` Go module | reviewed by the team; verify path exercised against a fake portal in tests; live Selfie Check pending World access |
| `apps/web/` (shell, marketplace, bond page, issuer flow, portfolio, secondary market, KYC wizard, chain config) | yes | built by a coding-assistant sub-agent from issues #5, #14, #23 with written briefs (see `docs/ai/prompts.md`) against the contracts and the API | every PR reviewed by the team; verified in a headless browser against anvil and the live API before merge |
| `apps/web/` design port (#52) | yes | sub-agent re-implemented the look of Sowee's existing dapp (tokens, layouts, components) in this codebase from screenshots and its stylesheets, with our data layer | design choice and brand assets are the team's; reviewed against the reference page by page before merge |
| `apps/web/src/components/selfie-check-step.tsx`, `src/lib/world.ts` | yes | drafted from the IDKit React reference (invite-code widget, `selfieCheckLegacy`, RP context) | reviewed by the team; builds with and without the flag; live test pending World access |
| `docs/plan.md`, `docs/partners/*.md` | yes | drafted from the team's plan and from partner docs fetched during the build (x402 Hedera scheme spec, docs.world.org, Arc docs) | facts checked against the sources (`cast chain-id`, facilitator `/supported`) by the team |
| `contracts/src/BondToken.sol`, `contracts/test/BondToken.t.sol` | yes | drafted from the system design (allowlist on `_update`, freeze, mint cap, roles) | design decisions and review by the team; every test run locally |
| `contracts/src/MaturitySettlement.sol`, `contracts/src/HederaAssociable.sol`, their tests, `test/mocks/MockHTS.sol`, `test/QuoteVector.t.sol` | yes | drafted from flow F5 (surrender-and-claim, permissionless settle) and the HTS association requirement | review by the team; tests run locally; the simulation limitation was found by running the script |
| `contracts/src/DiscountOracle.sol`, `contracts/src/InvoiceMarket.sol`, their tests, `test/mocks/MockUSDC.sol`, `script/Deploy.s.sol` | yes | drafted from the system design flows F1, F3, F4 (EIP-712 quote struct, consume-once nonce, direct USDC settlement, allowance-based asks) | design decisions, fee policy and review by the team; every test run locally, script dry-run on Hedera testnet |
