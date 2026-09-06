# CLAUDE.md — Sowee

Working guide for this repository.

## What this is

An **ETHOnline 2026** submission, built from scratch inside the hacking window
(4 September 2026 16:00 UTC → 13 September 2026 16:00 UTC). Monorepo:

| Directory | Contents |
|---|---|
| `contracts/` | Solidity (Foundry) — bond token, market, oracle, settlement; deployed to Hedera testnet |
| `apps/web/` | Next.js dapp — onboarding wizard, marketplace, portfolio, issuer console |
| `apps/api/` | Go service — discount-quote signer, KYC orchestration, x402 gate, HCS anchor |
| `apps/agent/` | x402 consumer agent that discovers, pays for and uses the market-insights API |

Sowee turns an unpaid invoice into a KYC-gated, fractional, tradable bond token:
issue → price (signed discount quote) → fund in USDC → trade → settle pro-rata at maturity.

## Rules that bind this repository (ETHGlobal)

1. **From scratch.** Every line of code here was written after the window opened. Public
   libraries, boilerplate and starter kits are fine; no code from any earlier project is
   copied in. The **visual design and brand assets** (logo, colours, layout) follow Sowee's
   existing brand by the team's decision — the web app re-implements that look in new code.
2. **Integrations must actually run.** A partner integration is only claimed when it works
   end-to-end on a live network. A claim that does not run is a full disqualification.
3. **AI attribution.** `AI-USAGE.md` states exactly where and how AI assisted. Update it in
   the same PR as the code it describes.
4. **Commit history must be natural.** Small, descriptive commits through issues and PRs —
   never a handful of giant commits.
5. **Demo video:** 2–4 minutes, ≥720p, screen capture, clear human voice, no music,
   no speed-up, no phone recording.
6. **At most 3 partner prizes.** Targets: Hedera, World, Arc.

## Conventions

- **English** for everything committed: docs, comments, commit messages, PR text.
- Conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`.
- Work flows **issue → branch → small commits → PR → merge**. Every PR references its issue.
- Secrets never enter git. `.env` is ignored; each app documents its keys in `.env.example`.
- Nothing is claimed before it is proven. If something is not live yet, say so.

## Networks

| Network | Chain id | RPC |
|---|---|---|
| Hedera testnet | 296 | `https://testnet.hashio.io/api` |
| Arc testnet | 5042002 | `https://rpc.testnet.arc.network` |

## Commands

Root scripts (Turborepo + Biome). Per-package commands live in each directory's README.

```sh
bun install          # workspace deps
bun run lint         # biome check across the workspace
bun run build        # turbo: build every package
bun run test         # turbo: test every package
```

Pre-commit runs `biome check --staged` via husky.
