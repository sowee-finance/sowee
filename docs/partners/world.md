# World — Selfie Check integration notes and feedback

Track: **Selfie Check**. Status: **live** — passed on a device on 10 September in World's
`sandbox` environment with the Sandbox World App, and anchored on the audit topic (messages #46
and #47). It has not run on the production World App.

## Verified facts we build on (docs.world.org)

| Item | Value |
|---|---|
| Credential | `11` — "Selfie Check (Beta)", medium assurance: liveness + facial similarity, **not** a one-person-one-account guarantee |
| Validity | 90 days of inactivity, then the camera flow must be repeated |
| Access | feature flag enabled per app on request (developers@toolsforhumanity.com / World point of contact) |
| Client | `@worldcoin/idkit` — `IDKitRequestWidget` / `useIDKitRequest` with `app_id`, `action`, `rp_context`, `preset`, `environment`, `onSuccess`, `onError` |
| RP signature | World ID 4.0 requires a server-side **RP signature**: secp256k1 + keccak over `version ‖ nonce(32) ‖ created_at(8) ‖ expires_at(8) ‖ [action hash]` with an EIP-191 prefix; Go module `github.com/worldcoin/idkit/go/idkit` (`NewSigner(key).SignRequest(WithAction(...))`) |
| Sandbox | isolated environment; test journeys **hot** (app installed, enrolled), **cold** (install → account → DOB → invite code → enrol → check), **semi-cold** (reinstall + recover) on native and cross-device QR |

## How Sowee uses it

A **signal in front of full KYC**, not a KYC replacement. The onboarding wizard asks for a
Selfie Check proof first; the API verifies it, records `selfieCheck = true` for the wallet, and
uses that to unlock the demo faucet and a looser rate limit. Full eligibility still requires the
Sumsub review plus the suitability policy. Issues: #21, #22, #23.

## Continuity: one person, one eligible wallet

Selfie Check gives a nullifier — a pseudonym for one person, scoped to our action. Nothing else
about them is legible from it. Spending it once and only once turns it into a continuity key, and
`REQUIRE_SELFIE_CHECK=true` makes that key a condition of eligibility: since one person can spend
one nullifier, one person can hold at most one wallet on the allowlist. The binding is written to
the audit topic as `selfie.v1` (wallet + nullifier) and replayed at startup, so it survives a
restart rather than living in a process.

This is the strongest thing a low-assurance credential can honestly do here. It is not identity,
it is not uniqueness in the Orb sense, and it does not touch what Sumsub is for: the document
check, the sanctions and PEP screening, the jurisdiction that decides Regulation S, and the
retained record a regulator would ask for. It is an **abuse-prevention and continuity** control,
which is the use the credential's own documentation describes.

Its limit, stated because it is the reason the requirement is a mode and not the default: with the
requirement off, a second wallet that never opens the Selfie Check step presents no nullifier, so
nothing links it to the first. The signal reaches the faucet and the rate limit and stops there.
Only requiring the check closes it, and the cost is that someone without a World App cannot invest
at all — a product decision, not one to take by default.

## Implemented, and run on a device

- `GET /v1/world/request` — RP signature via `github.com/worldcoin/idkit/go/idkit` (`NewSigner(key).SignRequest(WithAction("sowee-selfie-check"))`), 5-minute validity, sandbox/production switch.
- `POST /v1/world/verify` — forwards the IDKit result unchanged to `POST /api/v4/verify/{rp_id}`, enforces one nullifier per person, records `selfieCheck=true` for the wallet (visible in `GET /v1/kyc/status`).
- The signal gates `POST /v1/faucet` (403 without it) and lifts the API allowance from 30 to 300 requests per minute for the wallet.
- The web wizard's Selfie Check step is implemented with `@worldcoin/idkit` 4.2 —
  `IDKitInviteCodeRequestWidget` + `selfieCheckLegacy({ signal: wallet })`, RP context from the
  API, `handleVerify` posting the result to `/v1/world/verify` — and switches on when
  `NEXT_PUBLIC_WORLD_APP_ID` is set. The API accepts both World ID 3.0 (what Selfie Check
  returns today) and 4.0 result shapes.
- The page serving that widget must allow WebAssembly: `@worldcoin/idkit-core` builds every
  request inside a wasm module, so `script-src` carries `'wasm-unsafe-eval'`
  (`apps/web/next.config.ts`). Without it IDKit answers `generic_error` and says nothing else —
  see [`world-feedback.md`](world-feedback.md) §9. `scripts/verify-claims.ts` checks the deployed
  header so it cannot come back.

## Configuration

| | |
|---|---|
| App ID | `app_96e61382eeeabdae6887e00434ab8edf` |
| RP ID | `rp_4e66ef1ffe9c2f54` |
| RP signer | `0xBbF111cE5E37134Fe7E907c2b8B1874B8Bb682AD` — the signing key stays on the API, never in the browser |
| Action | `sowee-selfie-check` |
| Environment | `sandbox` — see below |
| Verify endpoint | `https://developer.world.org/api/v4/verify/rp_4e66ef1ffe9c2f54` |

Running it:

```sh
# API — the signing key is a backend secret
WORLD_APP_ID=app_96e61382eeeabdae6887e00434ab8edf \
WORLD_RP_ID=rp_4e66ef1ffe9c2f54 \
WORLD_RP_SIGNING_KEY=0x… \
WORLD_ENVIRONMENT=sandbox go run ./cmd/api

# web — the app id is public and is what makes the wizard show the step
NEXT_PUBLIC_WORLD_APP_ID=app_96e61382eeeabdae6887e00434ab8edf bun run build
```

**Why `sandbox`.** The environment decides which app a scanned code opens. IDKit's connector
URL is the bare `https://<host>/verify?…`, and `sandbox.world.org` is the only host whose
apple-app-site-association claims that path — for the Sandbox World App. `world.org` and
`staging.world.org` claim only `/verify/*`, so under `staging` the phone opened a download page
instead of the app. World's `POST /api/v4/proof-context/{rp_id}` does reject `sandbox`
(`environment must be one of the following values: production, staging`); we believed it, moved
to `staging`, and broke the flow. That endpoint is not the path the Sandbox App takes — the pass on
the topic was made under `sandbox`. Details in [`world-feedback.md`](world-feedback.md) §10.

`GET /v1/world/request` answers with the app id, the action and a fresh RP context whose
signature recovers to the signer above; the wizard then shows **Selfie Check** between Welcome and
Investor Profile. Scanning the code with the Sandbox World App completes the check, the API
verifies the proof with the Developer Portal, and `GET /v1/kyc/status` reports `selfieCheck: true`.

## Test plan, and what has run

1. Developer Portal: app id, RP id, RP signing key, action `sowee-selfie-check` in both
   environments. **Done** — the action had to be created through the developer-portal MCP; the
   Portal has no page for it (feedback §2).
2. API `WORLD_ENVIRONMENT=sandbox`, web `NEXT_PUBLIC_WORLD_APP_ID`, and a page CSP that allows
   `'wasm-unsafe-eval'`. **Done.**
3. Sandbox World App: cross-device QR from a laptop. **Passed** — topic message #47, and
   `selfieCheck: true` on the wallet. The hot, cold and semi-cold journeys have not been run one by
   one.
4. A second proof from the same World ID answers `409`. **Not observed**: our two passes produced
   different nullifiers, so a real repeat never happened (feedback §10).
5. What the verify endpoint answers for the proof Selfie Check returns. **It accepted it.**

## Feedback document (required by the track)

[`world-feedback.md`](world-feedback.md) — ten findings from the integration. The three that cost
the most: an action cannot be created in the Developer Portal at all (§2); IDKit is a WebAssembly
module that needs `'wasm-unsafe-eval'`, and reports a blocked page as the same `generic_error` as
everything else (§9); and the environment decides which app a scanned code opens, while the only
endpoint that validates it rejects the one that works (§10). The rest: the feature flag has no
self-serve path, the RP signature has no worked example outside JavaScript, a 4.0 flow receives a
3.0-shaped proof, sandbox access is a separate gate, the nullifier's durability goes unmentioned,
a medium-assurance credential is easily read as identity, and the Portal keeps no request log. It
says plainly what we could and could not test.
