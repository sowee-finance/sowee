# Demo video — runbook and narration

ETHGlobal's rules for the video: **2 to 4 minutes, at least 720p, screen capture, your own voice.**
No speed-up, no phone recording, no text in place of narration, and **no AI voiceover or
text-to-speech**. A text-to-speech track can be used to rehearse the timing; it must not be in the
submitted video.

Record against the **deployed** sites — `sowee.site`, `app.sowee.site`, `api.sowee.site` — not a
local run. A localhost URL in the corner invites the question of whether any of it is real.

## Wallets

| Wallet | Role | State |
|---|---|---|
| a **new** MetaMask account | the investor who goes through KYC on camera | must never have touched the app — see below |
| `0x05F2…a6af` (`0.0.10215221`) | the agent's wallet in the x402 beat | granted, holds USDC, USDC associated |
| `0xbD6b…e910` | the issuer, and the compliance operator | never ran KYC |
| `0xf4e4…410f` | **spent** — granted on 10 September | cannot show the KYC wizard from the front any more |

**A wallet can record the KYC beat only once.** The wizard sends any wallet with an open file
straight to its status page. Use a new account, and give it **10 HBAR** from portal.hedera.com
before recording: Hedera reserves `gasLimit × gasPrice` up front, about 2.24 HBAR per signature, so
a wallet holding "enough for the fee" is rejected mid-take. It also needs USDC for the funding beat,
sent with `scripts/send-usdc.ts` after the wallet associates. The treasury holds **2.74 USDC** —
enough for two units, not ten — so top it up first, or fund two units and say "two" on camera.

**Selfie Check** runs in the Sandbox World App with the API on `WORLD_ENVIRONMENT=sandbox`. Scan the
code with the iPhone camera; under `sandbox` it opens the app directly. Under `staging` or
`production` it opens a download page instead — see `docs/partners/world-feedback.md` §10.

## Script

Target **3:52**. About 500 words at 129 words a minute, which leaves room to breathe. A copy laid
out for reading aloud is `sowee-script.txt`, kept next to the recording.

| Time | Screen | Say |
|---|---|---|
| 0:00 | a bond page, or `sowee.site` | "Sowee turns an unpaid invoice into a compliant bond on Hedera. Everything you'll see is live on testnet — built from scratch this week." |
| 0:10 | issuer console → *Tokenize an Invoice*: company, payor, reference, face value, due date, the PDF | "First, the issuer: a business that's owed money, and doesn't want to wait ninety days for it. They enter the invoice — company, payor, face value, due date — and attach the document. It's hashed in the browser. Only the sha256 ever leaves the device." |
| 0:30 | *Get a Quote* → *List on-chain* → *Anchor the document hash* | "The API prices it and signs an EIP-712 quote. The oracle checks the signature and burns the nonce on chain, so a quote works exactly once. One transaction deploys the bond and opens funding, and the issuance is anchored to a Hedera Consensus Service topic." |
| 0:50 | the new bond's page → *HCS Audit Trail* | "There it is, with its audit trail. A public record — with no database anywhere behind it." |
| 1:00 | new wallet → `/kyc` → *Connect Wallet* → sign | "Now the investor. Nobody can hold this bond until they're eligible, and that starts with a signature from their own wallet." |
| 1:10 | phone: Selfie Check in the Sandbox World App | "First, a World Selfie Check — a few seconds of liveness that proves one real person. It's an anti-sybil signal, not identity, and it doesn't decide eligibility. The nullifier is anchored on the same topic, so one World ID can't verify a second wallet." |
| 1:30 | Declarations → Sumsub → *Approved* | "Then the real check: a suitability questionnaire, and Sumsub documents plus liveness. A US person is blocked under Regulation S. A politically exposed person is held for review. And only the decision goes on chain — never a name, never a document." |
| 1:50 | HashScan: the grant transaction | "Approved, the API grants the wallet on every live bond. That's the grant transaction." |
| 1:58 | marketplace | "Back to the market. The short invoice pays thirty per cent annualised, the ninety-day one ten — because the fee is per invoice, not per year." |
| 2:10 | a bond → *Associate USDC* → one transaction | "One Hedera detail: an account can't hold a token it hasn't associated with. So the app says exactly that — instead of showing an empty balance." |
| 2:20 | *Fund Invoice*, 10 units → approve → confirm → the progress bar | "Now funding: ten units, in USDC, at the discounted price. The USDC goes straight to the issuer, units are minted to the investor, and the funding bar moves." |
| 2:35 | portfolio | "And the position — held by a wallet that passed the same checks a regulated investor would." |
| 2:45 | terminal in `apps/agent`: `bun run src/index.ts --execute 1` | "Investors don't have to be people. This agent asks for market data, and gets back a 402 — with the price, in USDC, on Hedera. It signs a transfer from its own account, Blocky402 settles it, and the data comes back. Then it acts on what it bought: it picks a bond, and funds it — which it can only do because its wallet passed the same KYC." |
| 3:10 | [HashScan, topic `0.0.10388277`](https://hashscan.io/testnet/topic/0.0.10388277), refreshed | "And here's that payment — on the same topic as the invoice and the Selfie Check. Issuance. Compliance. Payment. One trail — and anyone can read it." |
| 3:22 | [HashScan, the ATS security](https://hashscan.io/testnet/contract/0xb438390fE710b12d1951E3b250889A673356e078) | "When an invoice needs the regulated wrapper, it's issued through Hedera's Asset Tokenization Studio instead — an ERC-1400 security, with an ISIN, and Reg S on chain." |
| 3:32 | [arcscan, `sARC001`](https://testnet.arcscan.app/address/0x86478cB59EDab4E899BeC5D0637fe0771D68574E) | "And the same finance core runs on Arc, where USDC is the gas token — an invoice listed, the same KYC decision, a bond funded in native USDC." |
| 3:44 | `sowee.site` | "Invoices, funded before they're paid — and compliant by construction. That's Sowee. Thanks." |

Waiting for a transaction can be cut. Keep one wallet confirmation visible.

## Beats that need care

**The agent (2:45).** Needs `apps/agent/.env` with `SOWEE_API_URL=https://api.sowee.site`,
`HEDERA_ACCOUNT_ID=0.0.10215221` and that wallet's key; the market and USDC addresses come from
`contracts/deployments/296.json`. Rehearse with `--dry`, which stops before paying. Run it
**before** the topic beat and refresh HashScan afterwards, so the receipt that was just written is
at the top.

**The ATS security (3:22).** Show the security that already exists — ISIN `XSHUZWMQSU19`. Running
`issue` again on camera creates a second issuance.

**Settlement and claim.** Not in the script: `sINV011` is the only matured bond and nobody holds
it, so there is nothing to claim live. If there is time left, show the settle and claim that are
already on chain — the lifecycle in [`contracts/README.md`](../contracts/README.md) — for ten
seconds before the close.

**The secondary market.** Dropped. Its point — the allowlist holds on a transfer — is already made
when funding is blocked for a wallet that has not passed KYC.

## Fitting under four minutes

The first recording (3:46) had no agent, topic, ATS or Arc beat. To make room for them, cut from it:
the "1. Issuer" title card, the loading screen after listing, most of the Selfie Check on the phone
(keep the QR, the liveness and "Congratulations"), and the censored identity step down to a few
seconds.
