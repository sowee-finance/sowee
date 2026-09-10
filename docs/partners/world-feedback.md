# World — developer feedback

Required by the Selfie Check track. Written from integrating Selfie Check into Sowee's
onboarding during ETHOnline 2026: `@worldcoin/idkit` 4.2 in the browser, the RP signature and
verify forwarding in a Go API. Configuration notes and the code paths are in
[`world.md`](world.md).

**What we could test, and what we could not.** Everything up to the camera is running: the RP
context is signed server-side and its signature recovers to the registered signer, the wizard
renders the Selfie Check step, and the verify route forwards a result to the Developer Portal.
The live check itself is untested, because Selfie Check (Beta) is feature-flagged per app and
ours has not been enabled. Nothing below is a guess about behaviour we did not see; where we
could not observe something, it says so.

## What the track asked us to report on, and where it is

| Asked for | Here |
|---|---|
| Selfie Check docs and integration flow | §2 RP signature, §3 proof shape, §5 nullifier durability, §6 assurance level |
| Developer Portal — navigation, product discovery, debugging | §1 flag state is invisible, §4 two gates behind two addresses, §7 |
| Sandbox App — states, proof flows, test users, errors, edge cases | **§8 — not yet reportable.** Access arrived 9 September; the journeys are written and unrun |
| What was confusing, missing, broken, hard to test | §1–§6, and §8 says plainly what is still untested |

We would rather leave a row visibly empty than fill it with something we did not observe.

---

## 1. The feature flag has no self-serve path, and nothing warns you

Selfie Check is enabled per app on request. The Developer Portal does not show that the app
lacks the flag, and the credential appears in the documentation like any other, so the natural
order of work is: read the docs, build the client, build the server, wire the wizard — and only
then find out that World App will refuse the credential. The flag is discovered at the end of
the integration rather than the start.

**Suggestion.** Show the flag's state on the app's page in the Portal, with a request button.
Even a red "Selfie Check: not enabled for this app — request access" line would move the
discovery from the end of a day's work to the beginning.

**What this actually looks like, 10 September 2026, 11:11 UTC.** The integration is finished and
the sandbox World App is installed, so we ran it. Our API served the request and logged it:

```
11:11:11  GET /v1/kyc/challenge   200
11:11:13  GET /v1/world/request   200   415B
```

with a well-formed context — 65-byte signature, `v = 28`, 32-byte nonce, 300 seconds of validity,
`environment: sandbox`, `action: sowee-selfie-check`. IDKit then answered:

```
World ID: generic_error
```

That is the whole of it. `generic_error` is indistinguishable between *the credential is not
enabled for this app*, *the action is not registered*, *the RP key does not match the one in the
Portal*, and *the environment does not line up* — four different problems, three of which the
developer can fix alone, all wearing the same face.

We eliminated them one at a time, which took the afternoon:

| Cause | How we ruled it out |
|---|---|
| RP key mismatch | derived the address from the server's key: `0xBbF111cE…682AD`, byte for byte what World ID Configuration displays |
| App or RP id wrong | both read straight off that page and compared |
| Malformed request | 65-byte signature, `v = 28`, 32-byte nonce, 300s validity, and the `sig` → `signature` rename IDKit expects |
| Action not registered | there is nowhere to register one — in World ID 4.0 the action travels inside the RP context, which we send |

Which leaves the flag, and here is the finding at its sharpest: **we walked the entire Developer
Portal navigation** — Projects, Dashboard, World ID Configuration, Verification, Develop,
Transactions, Notifications, General, Members, API Keys — and there is no page that shows whether
Selfie Check is enabled for an app, and no control that requests it. The one page called
*Verification* is the Mini App store submission wizard, which is a different thing entirely and
was sitting in "In review. Editing is locked until review completes."

So the developer's only remaining move is to email someone and wait, having spent a day proving
a negative. There is no request log to consult (§7), no flag state anywhere (§1), and no signing
test vector to rule one's own side out (§2). Three gaps that are individually small compose into
an afternoon.

**Suggestion, sharpened.** Two fields would have replaced this entire finding: a reason string on
`generic_error` — `"credential not enabled for this app"` — and a line on the app's page saying
which credentials it may request. Neither costs more than the support thread that replaces them.

**Also worth checking on your side:** the app was in Mini App store review while this was
attempted. If credential access is gated on that review completing, saying so would itself be the
fix.

## 2. The RP signature has no worked example outside JavaScript

World ID 4.0 requires a server-signed RP context. The layout is documented — secp256k1 over
`version ‖ nonce(32) ‖ created_at(8) ‖ expires_at(8) ‖ [action hash]`, EIP-191 prefixed — but
the only usable example is JavaScript. We are a Go service. We ended up on
`github.com/worldcoin/idkit/go/idkit`, which does the right thing, but finding it and
confirming the byte layout took longer than writing the handler.

**Suggestion.** A short worked example in one non-JavaScript language, and — more useful than
any example — **a known-good test vector**: fixed nonce, timestamps, action, key, and the
expected signature. A vector turns "I think this is right" into a unit test. We would have
pinned ours to it the way we pin our EIP-712 digest to a Solidity vector.

## 3. A 4.0 request flow receives a 3.0-shaped proof

Selfie Check today returns a result in the World ID 3.0 shape, while the request flow around it
is 4.0. We only found this by reading both payload definitions and deciding to accept either.
Our verify handler now takes both shapes. A team that codes to the 4.0 documentation and tests
with Selfie Check will get a payload that does not match what they wrote, at the last step of
the flow, where the failure is most expensive to debug.

**Suggestion.** Say it in the Selfie Check page itself: *this credential currently returns a
3.0-shaped result; handle both.* One sentence would have saved the discovery.

## 4. Sandbox access is a second gate, behind a different address

There are two things to obtain and they are not the same request: the Selfie Check flag on the
app (developers@toolsforhumanity.com) and the Sandbox World ID app on a phone
(sandbox.access@toolsforhumanity.org, distributed by TestFlight or a private Play link). A
newcomer reasonably assumes that being granted one implies the other.

**Suggestion.** One page listing every gate between "I have an app id" and "I can complete a
check on a device", with who grants each. For a hackathon in particular, the lead time on these
is the difference between a demonstrated integration and a described one.

## 5. The docs never say the nullifier must outlive the process

The anti-sybil property is entirely carried by storing the nullifier: one World ID, one
account. Nothing in the documentation says where that belongs, and the obvious first
implementation — a set in memory — quietly loses the guarantee on the next restart. We shipped
exactly that, and caught it only while auditing our own shortcuts: after a restart the same
World ID could have verified a second wallet. We now anchor each pass on a Hedera Consensus
Service topic and replay it at startup, so the used nullifiers come back with the service.

**Suggestion.** State it where the nullifier is introduced: *this value must be stored durably;
if you lose it you lose the uniqueness guarantee.* This is the one item on this list that is a
security property rather than an ergonomic one.

## 6. Medium assurance invites a stronger reading than it deserves

The docs are clear that Selfie Check is liveness plus facial similarity and **not** a
one-person-one-account guarantee. But it sits in an anti-sybil-shaped hole in most products,
and the temptation is to treat it as identity. We use it deliberately as a signal *in front of*
identity: passing it unlocks the demo faucet and a larger API allowance, and nothing else. Real
eligibility still requires the document check and the suitability policy.

**Suggestion.** A short "what this is not sufficient for" box next to the credential, with one
worked example of a defensible use. Teams building anything regulated have to make this call
early, and the honest answer — *a signal, not a decision* — is easy to state and easy to get
wrong.

---

## 7. The Portal tells you nothing about a request that failed

What we did in the Developer Portal: created the app, took its `app_id`, created the RP and its
`rp_id`, generated the RP signing key. That much was quick and the navigation was not the
problem.

What it does not give you is any view of what happened afterwards. There is no log of verify
attempts, no record of a rejected proof and why, no indication that an app has never completed a
single check. Our verify route forwards a result and gets back a code and a detail string; when
that string is unhelpful, there is nowhere else to look. For an integration whose failure modes
are a missing flag (§1), a payload shape mismatch (§3) and a device gate (§4) — three different
things that all surface as "it did not work at the last step" — a per-app request log would be
the single most useful thing the Portal could add.

**Suggestion.** A recent-requests view per app: timestamp, credential, outcome, and the error as
the server saw it. Even fifty rows with a day's retention would turn most of this document into
something a developer could have diagnosed alone.

We are not reporting on the Portal's search: we navigated to what we needed from the docs' links
and never used it, so we have nothing worth saying about it.

## 8. Sandbox App — access arrived after the integration, so this section is empty

The Sandbox World ID app reached us on 9 September, after the client, the server and the wizard
were finished. The journeys the docs describe — hot, cold, semi-cold, and cross-device QR — are
written into our test plan in [`world.md`](world.md) and have not been run at the time of
writing, so we have nothing to report on sandbox states, proof flows, test users, or the errors
and edge cases around them.

That order is itself the finding, and it is the same one as §1 and §4: the gates that decide
whether an integration can be *demonstrated* rather than *described* are the last thing a
developer discovers and the longest thing to wait for. Everything a team can do alone, we did in
a day. Everything requiring a grant took longer than the build.

## What worked without friction

- `@worldcoin/idkit` 4.2 dropped in cleanly. `IDKitInviteCodeRequestWidget` plus
  `selfieCheckLegacy({ signal })` is a small amount of code for what it does, and the invite-code
  path meant we could build the whole wizard step before having a device.
- The RP context model is the right shape: the signing key stays on the server, the browser
  never holds it, and the context is short-lived. It made the security review of our own flow
  short.
- Credential validity (90 days of inactivity) is documented plainly, which is more than we can
  say for most identity vendors.

## Still to report

The camera flow itself — the hot, cold and semi-cold journeys on a device, cross-device QR, and
what the Portal's verify endpoint answers for a legacy-shaped proof. The test plan is in
[`world.md`](world.md). This document will be extended with what we find rather than replaced,
and §8 is where it will go.
