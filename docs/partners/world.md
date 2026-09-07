# World — Selfie Check integration notes and feedback

Track: **Selfie Check**. Status: **waiting for access** — Selfie Check (Beta) is feature-flagged
per app and the sandbox World ID app is distributed through TestFlight / a private Play link.

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

## Implemented (API side, waiting for access to test live)

- `GET /v1/world/request` — RP signature via `github.com/worldcoin/idkit/go/idkit` (`NewSigner(key).SignRequest(WithAction("sowee-selfie-check"))`), 5-minute validity, sandbox/production switch.
- `POST /v1/world/verify` — forwards the IDKit result unchanged to `POST /api/v4/verify/{rp_id}`, enforces one nullifier per person, records `selfieCheck=true` for the wallet (visible in `GET /v1/kyc/status`).
- The signal gates `POST /v1/faucet` (403 without it) and lifts the API allowance from 30 to 300 requests per minute for the wallet.
- The web wizard's Selfie Check step is implemented with `@worldcoin/idkit` 4.2 —
  `IDKitInviteCodeRequestWidget` + `selfieCheckLegacy({ signal: wallet })`, RP context from the
  API, `handleVerify` posting the result to `/v1/world/verify` — and switches on when
  `NEXT_PUBLIC_WORLD_APP_ID` is set. The API accepts both World ID 3.0 (what Selfie Check
  returns today) and 4.0 result shapes.

## Configuration (sandbox)

| | |
|---|---|
| App ID | `app_96e61382eeeabdae6887e00434ab8edf` |
| RP ID | `rp_4e66ef1ffe9c2f54` |
| RP signer | `0xBbF111cE5E37134Fe7E907c2b8B1874B8Bb682AD` — the signing key stays on the API, never in the browser |
| Action | `sowee-selfie-check` |
| Environment | `sandbox` |
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

`GET /v1/world/request` answers with the app id, the action and a fresh RP context whose
signature recovers to the signer above; the wizard then shows **Selfie Check** between Welcome and
Investor Profile. Both are confirmed working. What is still pending is the Selfie Check (Beta)
feature flag on the app — until World enables it, World App will refuse the credential itself.

## Test plan once access lands

1. Developer Portal: app id, RP id, RP signing key, action `sowee-selfie-check`, Selfie Check flag on.
2. API: `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ENVIRONMENT=sandbox`; web: `NEXT_PUBLIC_WORLD_APP_ID`.
3. Sandbox World App (TestFlight): run the hot, cold and semi-cold journeys from the wizard; confirm `GET /v1/kyc/status` shows `selfieCheck: true`, the faucet drips, and a second proof from the same World ID answers `409`.
4. Record what the Developer Portal verify endpoint answers for a legacy (3.0) Selfie Check proof; if it rejects legacy proofs, switch the API to the v3 verify endpoint and note it here.

## Feedback document (required by the track)

[`world-feedback.md`](world-feedback.md) — six findings from the integration: the feature flag
having no self-serve path, the RP signature having no worked example outside JavaScript, a 4.0
request flow receiving a 3.0-shaped proof, sandbox access being a separate gate, the nullifier's
durability going unmentioned even though the anti-sybil property depends on it, and how easily
a medium-assurance credential is read as identity. It states plainly what we could and could
not test.
