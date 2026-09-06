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
- The web wizard has a Selfie Check step that switches on when `NEXT_PUBLIC_WORLD_APP_ID` is set.

## Feedback document (required by the track)

To be filled while integrating:

- Docs & integration flow — what worked, what was missing (result payload shape, credential naming, validity handling)
- Developer Portal — feature-flag latency, app/action/rp_id configuration
- Sandbox app — states, proof flows, test users, errors
- What was confusing, missing, broken, or hard to test (expected vs actual, repro, fix)
- Suggestions (e.g. a non-JS server verify example; guidance on using a medium-assurance signal inside a compliance stack)
