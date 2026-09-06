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
| `contracts/src/BondToken.sol`, `contracts/test/BondToken.t.sol` | yes | drafted from the system design (allowlist on `_update`, freeze, mint cap, roles) | design decisions and review by the team; every test run locally |
| `contracts/src/DiscountOracle.sol`, `contracts/src/InvoiceMarket.sol`, their tests, `test/mocks/MockUSDC.sol`, `script/Deploy.s.sol` | yes | drafted from the system design flows F1, F3, F4 (EIP-712 quote struct, consume-once nonce, direct USDC settlement, allowance-based asks) | design decisions, fee policy and review by the team; every test run locally, script dry-run on Hedera testnet |
