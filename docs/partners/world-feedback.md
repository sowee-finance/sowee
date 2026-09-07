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
what the Portal's verify endpoint answers for a legacy-shaped proof. The test plan is written in
[`world.md`](world.md) and will run the day the flag lands; this document will be extended with
what we find rather than replaced.
