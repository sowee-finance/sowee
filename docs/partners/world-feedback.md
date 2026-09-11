# World — developer feedback

Required by the Selfie Check track. Written from integrating Selfie Check into Sowee's
onboarding during ETHOnline 2026: `@worldcoin/idkit` 4.2 in the browser, the RP signature and
verify forwarding in a Go API. Configuration notes and the code paths are in
[`world.md`](world.md).

**What we could test, and what we could not.** Selfie Check has run on a device and passed. A
code shown on a laptop was scanned with an iPhone, the check completed in the Sandbox World App, the
Developer Portal's verify endpoint accepted the proof, and the pass is anchored on our audit topic
(`0.0.10388277`, messages #46 and #47, 10 September). It ran in World's `sandbox` environment; it
has not run on the production World App. Nothing below is a guess about behaviour we did not see;
where we could not observe something, it says so.

## What the track asked us to report on, and where it is

| Asked for | Here |
|---|---|
| Selfie Check docs and integration flow | §3 RP signature, §4 proof shape, §6 nullifier durability, §7 assurance level |
| Developer Portal — navigation, product discovery, debugging | **§2 an action cannot be created there at all**, §1 flag state is invisible, §5 two gates behind two addresses, §8 no request log, §9 an error code that hides the error |
| Sandbox App — states, proof flows, test users, errors, edge cases | **§10 — the environment decides which app a code opens, and the only check for it gives the wrong answer.** One journey run: cross-device QR |
| What was confusing, missing, broken, hard to test | §1–§10; *Still to report* lists what we have not run |

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

**What this actually looks like, 10 September 2026.** The integration was finished and the
sandbox World App installed, so we ran it. Our API served the request and logged it:

```
11:11:11  GET /v1/kyc/challenge   200
11:11:13  GET /v1/world/request   200   415B
```

with a well-formed context — 65-byte signature, `v = 28`, 32-byte nonce, 300 seconds of validity,
`environment: sandbox`, `action: sowee-selfie-check`. IDKit answered:

```
World ID: generic_error
```

That is the whole of it. We spent the afternoon eliminating causes:

| Cause | How we ruled it out |
|---|---|
| RP key mismatch | derived the address from the server's key: `0xBbF111cE…682AD`, byte for byte what World ID Configuration displays |
| App or RP id wrong | read off that page and compared |
| Malformed request | 65-byte signature, 32-byte nonce, 300s validity, and the `sig` → `signature` rename IDKit expects |
| RP not registered | `get_world_id_registration_status`: registered and on-chain initialised, both production and staging |
| Environment invalid | `sandbox` is in IDKit's own union, alongside `production` and `staging` |

**The action did not exist.** `get_app_config` for our app returns no `action` key at all — not
an empty list, no mention of the word anywhere in the document. IDKit was asking for
`sowee-selfie-check` and the app had never heard of it. That was real, and it had to be fixed (§2).

It was not what produced `generic_error`. After the action was created, the error was identical.
The browser had never reached World at all: our page's Content-Security-Policy stopped IDKit's
WebAssembly from compiling, and IDKit reported that as `generic_error` too. That is §9. We had
found a genuine problem, and it was not the one we were looking at.

## 2. A World ID 4.0 action cannot be created in the Developer Portal

We walked the entire Portal navigation looking for where to declare an action — Projects,
Dashboard, World ID Configuration, Verification, Develop, Transactions, Notifications, General,
Members, API Keys. World ID Configuration shows the app id, RP id, signer address, a rotate
button and a danger zone; there is no actions list and no way to add one. The page called
*Verification* is the Mini App store submission wizard, which is a different thing entirely.

The only way to create one is `create_world_id_action` on the developer-portal MCP, or the API
behind it. We found it by attaching the MCP and reading its tool list. Two calls later — one for
`staging`, one for `production` — the action existed and was `registered`.

We had reasoned, wrongly, that 4.0 needed no action registration because the action travels inside
the RP context. Nothing contradicted that until the tool list did. A developer working from the
docs and the Portal alone has no way to discover otherwise, because the missing piece is invisible
in both places and the error names nothing.

**Suggestions, in the order they would have helped.**

1. Put an actions list on the app's World ID Configuration page, with an add button. Everything
   else about the RP is on that page already; its absence reads as "4.0 does not need one".
2. Reject a request that names an unregistered action with an error that says so. We never saw
   what IDKit shows for it — our browser failed first, for a reason of its own (§9) — which is
   itself the point: nothing in the flow would have told us.
3. Say in the Selfie Check and IDKit docs that an action must exist before a request naming it
   will be accepted, and where to create it.

## 3. The RP signature has no worked example outside JavaScript

World ID 4.0 requires a server-signed RP context. The layout is documented — secp256k1 over
`version ‖ nonce(32) ‖ created_at(8) ‖ expires_at(8) ‖ [action hash]`, EIP-191 prefixed — but
the only usable example is JavaScript. We are a Go service. We ended up on
`github.com/worldcoin/idkit/go/idkit`, which does the right thing, but finding it and
confirming the byte layout took longer than writing the handler.

**Suggestion.** A short worked example in one non-JavaScript language, and — more useful than
any example — **a known-good test vector**: fixed nonce, timestamps, action, key, and the
expected signature. A vector turns "I think this is right" into a unit test. We would have
pinned ours to it the way we pin our EIP-712 digest to a Solidity vector.

## 4. A 4.0 request flow receives a 3.0-shaped proof

Selfie Check today returns a result in the World ID 3.0 shape, while the request flow around it
is 4.0. We only found this by reading both payload definitions and deciding to accept either.
Our verify handler now takes both shapes. A team that codes to the 4.0 documentation and tests
with Selfie Check will get a payload that does not match what they wrote, at the last step of
the flow, where the failure is most expensive to debug.

**Suggestion.** Say it in the Selfie Check page itself: *this credential currently returns a
3.0-shaped result; handle both.* One sentence would have saved the discovery.

## 5. Sandbox access is a second gate, behind a different address

There are two things to obtain and they are not the same request: the Selfie Check flag on the
app (developers@toolsforhumanity.com) and the Sandbox World ID app on a phone
(sandbox.access@toolsforhumanity.org, distributed by TestFlight or a private Play link). A
newcomer reasonably assumes that being granted one implies the other.

**Suggestion.** One page listing every gate between "I have an app id" and "I can complete a
check on a device", with who grants each. For a hackathon in particular, the lead time on these
is the difference between a demonstrated integration and a described one.

## 6. The docs never say the nullifier must outlive the process

The anti-sybil property is entirely carried by storing the nullifier: one World ID, one
account. Nothing in the documentation says where that belongs, and the obvious first
implementation — a set in memory — quietly loses the guarantee on the next restart. We shipped
exactly that, and caught it only while auditing our own shortcuts: after a restart the same
World ID could have verified a second wallet. We now anchor each pass on a Hedera Consensus
Service topic and replay it at startup, so the used nullifiers come back with the service.

**Suggestion.** State it where the nullifier is introduced: *this value must be stored durably;
if you lose it you lose the uniqueness guarantee.* This is the one item on this list that is a
security property rather than an ergonomic one.

## 7. Medium assurance invites a stronger reading than it deserves

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

## 8. The Portal tells you nothing about a request that failed

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

## 9. IDKit is a WebAssembly module, and its error taxonomy hides what that costs

`@worldcoin/idkit-core` 4.2.4 ships `idkit_wasm_bg.wasm` and builds every request inside it.
Compiling WebAssembly is script generation as far as a Content Security Policy is concerned, so a
site with a policy at all needs `'wasm-unsafe-eval'` in `script-src`. Nothing says so: not the
integration guide, not the package README, not the widget's props.

A site that does not know loses the credential entirely, and loses it in the worst possible shape.
Our policy is the ordinary one — `script-src 'self' 'unsafe-inline'` plus the KYC vendor's CDN —
and the whole integration passed in development, because Next's dev overlay asks for
`'unsafe-eval'`, which permits wasm as a side effect. The deployed site answered:

```
World ID: generic_error
```

That is the entire message a user and a developer both get. `toErrorCode` compares the thrown
error against the `IDKitErrorCodes` list, finds no match, and returns `GenericError` — the real
one is gone by the time `onError` fires:

```
Failed to initialize IDKit WASM: CompileError: WebAssembly.instantiateStreaming(): Compiling or
instantiating WebAssembly module violates the following Content Security policy directive because
'unsafe-eval' is not an allowed source of script…
```

A client-side environment failure is indistinguishable from a rejected proof, an unregistered
action, a bad RP signature or a World outage — so we spent a day proving the server side correct,
which it always was. Adding one token to `script-src` produced an invite code on the first try.

**Suggestions,** in the order we would want them:

1. Say it in the integration guide. One line — "IDKit uses WebAssembly; your CSP needs
   `'wasm-unsafe-eval'` in `script-src`" — is the whole fix, and it belongs next to the install
   command rather than in a troubleshooting page nobody reaches while things still work.
2. Give the failure its own code. `WasmInitFailed` (or `EnvironmentUnsupported`) separates "this
   browser or this page cannot run IDKit" from "World said no", which are different problems with
   different owners.
3. Let the message survive. `IDKitDebugReport` exists and the hooks expose `getDebugReport()`, but
   the widget components do not, and `setDebug(true)` has to be decided before the failure you did
   not expect. Passing the original error to `onError` alongside the code would cost nothing.

The wasm choice itself we have no complaint about — it is fast, it keeps the proof logic in one
implementation across SDKs, and 870 KB is reasonable for what it does. It is the silence around it
that turned a one-token header change into the longest debugging session of the integration.

## 10. Sandbox App — the environment decides which app opens, and the only check for it is wrong

The Sandbox World ID app reached us on 9 September, after the client, the server and the wizard
were finished. On 10 September it ran: a code shown on a laptop, scanned with an iPhone, the
Selfie Check completed in the Sandbox App, the proof accepted by the verify endpoint, and the pass
anchored on our topic (message #47, 14:36:45 UTC). The check itself took about half a minute.
Getting to it took three settings, and why is the finding.

**The environment decides which app a scanned code opens.** IDKit's connector URL is
`https://<host>/verify?…`. Each host's apple-app-site-association says:

| Host | App it names | Claims the bare `/verify` |
|---|---|---|
| `world.org` | `org.worldcoin.insight`, `org.world.id` | no — only `/verify/*` |
| `staging.world.org` | `org.worldcoin.insight.staging`, `org.world.staging.id` | no — only `/verify/*` |
| `sandbox.world.org` | `org.world.sandbox.id` | **yes** |

`/verify/*` does not match `/verify`. Under `staging`, the iPhone camera found no app for the URL
and opened Safari, which redirected to `world.org/partner-download` — a page asking the user to
download World ID, with a *Get* button, on a phone that had the Sandbox App installed. The
association files say `production` resolves the same way. Under `sandbox`, the Sandbox App opened.

**The one endpoint that validates the environment gave us the wrong answer.** When the app did
not open, we checked our context against World:

```
POST /api/v4/proof-context/rp_4e66ef1ffe9c2f54
{"code":"validation_error","detail":"environment must be one of the following values: production,
 staging","attribute":"environment"}
```

`rp-status` and the Portal's action API agree: two environments, no third. So we concluded
`sandbox` was invalid, moved our API to `staging`, and added a startup check that refused
`sandbox` — the one setting under which the Sandbox App opens. Moving back to `sandbox` is what
made the check pass, and our startup check has been reverted. We do not know what the Sandbox App
calls in place of `proof-context`, and we are not guessing. We know the endpoint a developer can
call to check a context rejected the only context that works.

**What we could not tell.** The two passes on our topic, #46 and #47, carry different nullifiers
for the same person and the same wallet. Whether the Sandbox App issues a fresh test identity for
each check, or #46 ran under a different environment, we could not establish — so the one-person
rule, a second proof from the same World ID answering 409, is still untested against a real repeat.

**Suggestions.**

1. Say in the Sandbox App docs that it runs against `environment: "sandbox"`, and that `staging`
   will not open it.
2. Make `proof-context` accept `sandbox`, or document that it is not the path the Sandbox App
   takes. It is the only thing a developer can call to check a context, and it says no to the
   right one.
3. Claim the bare `/verify` in the `world.org` and `staging.world.org` associations, as
   `sandbox.world.org` does — or have IDKit emit `/verify/`. A code scanned with the phone's own
   camera should open World App, not a download page.

The ordering is the older finding, the same one as §1 and §4: the gates that decide whether an
integration can be *demonstrated* rather than *described* are the last thing a developer
discovers and the longest to wait for.

## What worked without friction

- `@worldcoin/idkit` 4.2 dropped in cleanly *as code*. `IDKitInviteCodeRequestWidget` plus
  `selfieCheckLegacy({ signal })` is a small amount of code for what it does, and the invite-code
  path meant we could build the whole wizard step before having a device. The one thing it needed
  from the page around it went unmentioned, which is §9.
- The RP context model is the right shape: the signing key stays on the server, the browser
  never holds it, and the context is short-lived. It made the security review of our own flow
  short.
- Credential validity (90 days of inactivity) is documented plainly, which is more than we can
  say for most identity vendors.

## Still to report

What has not run: the hot, cold and semi-cold journeys one by one (we ran one — a cross-device QR
from a laptop), the production World App, and a real repeat of the same World ID to see the `409`.
The test plan is in [`world.md`](world.md). This document is extended with what we find rather
than rewritten, except where a run proved it wrong — as §1, §2 and §10 were on 10 September.
