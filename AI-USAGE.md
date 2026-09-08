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
| security review + fixes (#58) | yes | a sub-agent produced an adversarial review; the fixes (bound quote, settlement policy, role revocation) were drafted from it | findings verified against the code and tests by the team; every fix has a test; one encoding regression was caught by the tamper test before merge |
| API hardening (#59) | yes | fixes drafted from the review: payer-filtered HCS replay, revoke on blocked, immutable declarations after review, address canonicalisation, proxy-gated XFF, per-key tx lock, replay reservation | reviewed by the team; tests added for each |
| `apps/agent/src/{plan,market}.ts` + `--execute` | yes | drafted from issue #62 (sizing rule, eligibility check, approve + buyPrimary) | reviewed by the team; run for real on testnet, and a unit-scale bug in the first draft was caught by the team before merge |
| `contracts/script/DeploySettlement.s.sol`, deploy-role env | yes | drafted while redeploying the reviewed build to Hedera | the two-stage split and the key separation were the team's call; run against testnet |
| `apps/ats/` | yes | drafted from issue #70 against the published ATS artifacts (factory payload, compliance steps, ISIN) | the team read the ATS interfaces and decided the compliance posture; the ISIN check digit is verified against real published ISINs, and the whole flow was run on testnet |
| `docs/plan.md`, `docs/partners/*.md` | yes | drafted from the team's plan and from partner docs fetched during the build (x402 Hedera scheme spec, docs.world.org, Arc docs) | facts checked against the sources (`cast chain-id`, facilitator `/supported`) by the team |
| `contracts/src/BondToken.sol`, `contracts/test/BondToken.t.sol` | yes | drafted from the system design (allowlist on `_update`, freeze, mint cap, roles) | design decisions and review by the team; every test run locally |
| `contracts/src/MaturitySettlement.sol`, `contracts/src/HederaAssociable.sol`, their tests, `test/mocks/MockHTS.sol`, `test/QuoteVector.t.sol` | yes | drafted from flow F5 (surrender-and-claim, permissionless settle) and the HTS association requirement | review by the team; tests run locally; the simulation limitation was found by running the script |
| `contracts/src/DiscountOracle.sol`, `contracts/src/InvoiceMarket.sol`, their tests, `test/mocks/MockUSDC.sol`, `script/Deploy.s.sol` | yes | drafted from the system design flows F1, F3, F4 (EIP-712 quote struct, consume-once nonce, direct USDC settlement, allowance-based asks) | design decisions, fee policy and review by the team; every test run locally, script dry-run on Hedera testnet |
| `apps/web/src/app/(site)/legal/*` (#86) | yes | a sub-agent drafted the disclaimers, terms, privacy and cookies pages from a written brief, checking each factual claim against this codebase rather than the brief | the compliance posture and what may not be claimed are the team's; reviewed line by line, and two claims the brief got wrong were corrected against the code before merge |
| finalized shortcuts + UI fixes (#83, #88) | yes | drafted from the two issues: Selfie Check replay from the topic, origin-scoped CORS, map pruning, mirror-node pagination, explorer links, and the browser-side logo downscaler with its server-side type and size check | reviewed by the team; every change has a test or was exercised in the running app; the logo format policy (raster only, 12 KB) was the team's call |
| logo end-to-end fixes (#100, #102, #103) | yes | drafted while attaching a real mark to a live bond: the attest body limit that was a tenth of the logo limit, the HCS 1 KB chunking both readers ignored, and making docHash optional for an attestation that carries only a logo | found by the team attaching a designed logo rather than a test image; each fix has a test, and the chunk rejoin was verified against the live topic before merge |
| `docs/partners/world-feedback.md` (#111) | yes | drafted from what the integration actually hit — the feature flag, the missing non-JS RP-signature example, the 3.0-shaped proof, the nullifier durability gap | the six findings are the team's own experience; the team decided what could and could not be claimed as tested |
| contract verification (#113) | yes | verified the factory-deployed bond tokens on Sourcify and rewrote the README's blanket claim | the team decided not to force verification of Hedera's own ATS proxy and to publish the byte-for-byte check instead |
| container images + CI pipeline (#105–#108) | yes | Dockerfiles for the web app and the API, and a GitHub Actions workflow that builds them and pushes to GHCR, after building on the host took the machine down | the decision that a deploy is a pull and never a build on that host was the team's, taken after the second outage |
| `apps/api/internal/server/openapi.go` (#115) | yes | an OpenAPI 3.1 document served by the running process, describing the paid resource, its price and the 402 a caller must handle | reviewed by the team; a test asserts the price, the 402 and the request-derived server URL |
| demo readiness (#96–#99) | yes | `scripts/demo.sh status` now probes the web port and warns when the served build is older than the source; screenshots retaken | both checks came from failures the team hit while working, and were verified by reproducing them |
| deploy of `app.sowee.site` / `api.sowee.site` | yes | container images built in CI, shipped as artifacts and loaded on the host; nginx cutover script with a rollback path | the decision to overwrite the existing site was the team's; the root step was run by the team, not by the assistant |
| portfolio value curve + chain marks (#134, #139) | yes | drafted the holdings payoff curve, the marketplace summary card, the shortened hero and the chain marks; then a review agent found a matured-only wallet reading \$0, a headline claiming a valuation the chain gives no input for, and a duplicated curve implementation | the team decided the headline goes back to face value held rather than a mark-to-market we cannot defend, and that a settled bond must contribute what it actually pays; every finding acted on has a test |

