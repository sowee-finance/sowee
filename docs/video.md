# Demo video — runbook and narration

Rules: 2–4 minutes, ≥720p screen capture, your own voice, no music, no speed-up, no phone.
Intro under 20 seconds. Everything shown must be live. Target 3:30.

Record against the **deployed** sites, not a local run: `sowee.site`, `app.sowee.site`,
`api.sowee.site` are what a judge can open, and a localhost URL in the corner of the frame invites
the question of whether any of it is real.

Prepare (off camera): MetaMask holding the three wallets below; a terminal in `apps/agent` and one
in `apps/ats` with `.env` filled; HashScan tabs for the market contract and the HCS topic;
`sowee.site` open in its own tab for the opening shot.

### Which wallet does what, and the one that is single-use

| Wallet | Role | State today |
|---|---|---|
| `0xf4e4…410f` | the newcomer who goes through KYC on camera | **`none` — the only wallet left that can show the wizard from the front** |
| `0x05F2…A6Af` | the investor who funds, sells and pays over x402 | granted, holds 13 units of `sINV010`, USDC associated |
| `0xbD6b…e910` | the issuer, and the compliance operator | never ran KYC; 1000+ HBAR |

The wizard sends any wallet with an open file straight to its status page, so **a wallet can only
record the KYC beat once**. `0x05F2…A6Af` and `0x3B4f…85F5` are both spent. If `0xf4e4…410f` is
used for a rehearsal, the next take needs a wallet that has never touched the app.

The same is true of the World ID: a nullifier binds to one wallet permanently, so run the Selfie
Check on the wallet you intend to record.

Hedera reserves `gasLimit × gasPrice` up front, not the gas actually used, so a wallet holding
"enough for the fee" is still rejected. Measured on testnet: gas price 0.00000112 HBAR/gas, so a
2,000,000-gas limit reserves **2.24 HBAR** for one transaction. Two or three HBAR therefore covers
about one signature, which is how a take dies in the middle.

**Top each signing wallet to 10 HBAR before recording** (portal.hedera.com — the in-app faucet
drips 1 USDC, not HBAR). The investor signs approve, `buyPrimary`, `makeAsk` and a fill, so it
needs the most.

### The claim beat cannot be performed live as it stands

`sINV011` is the only matured bond and **no wallet holds units in it**, so there is nothing to
click in the portfolio. Funding closes at maturity, so it cannot be bought into now either. Two
ways out, in order of preference:

1. **Show it on HashScan** from the lifecycle already on chain — the ten transactions in
   [`contracts/README.md`](../contracts/README.md) include the settle and the claim. Live evidence,
   just not performed on camera, and it costs fifteen seconds instead of a day.
2. **Stage one.** List a bond maturing in about an hour, fund it from the investor wallet, let it
   mature, `settle`, then claim on camera. Real, and a whole afternoon of waiting.

| Time | Screen | Say |
|---|---|---|
| 0:00 | `sowee.site`: hero, then one scroll to the card | "Sowee turns an unpaid invoice into a compliant, tradable bond on Hedera. That card is a real listing — the page read it out of the market contract a moment ago. Everything you'll see is live on testnet and was built from scratch this week." |
| 0:18 | Marketplace: seven listings, Top Yields and Maturing Soon | "Seven invoices are listed right now. The short one pays thirty per cent annualised, the ninety-day one ten — because the fee is per invoice, not per year. That is the shape a receivables book actually has." |
| 0:32 | `/issuer/new`: issuer company (pick a logo next to it), payor, reference, face value, due date, drop a PDF | "The issuer submits an invoice, with their own logo. The document is hashed in the browser — only the sha256 leaves the device, and the logo rides along to the audit trail so the bond carries its issuer's mark without a file store anywhere." |
| 0:52 | Click *Get a Quote* → discount and implied APY shown in the checklist | "The API prices it and signs an EIP-712 quote; the oracle verifies signer, expiry and burns the nonce on-chain — no price feed needed." |
| 1:05 | *List on-chain* → wallet confirms → *Anchor the document hash* runs → HCS link; the bond appears in Newly Issued | "One transaction deploys the bond and opens funding. The issuance and the document hash are anchored to a Hedera Consensus Service topic — a public audit trail without a database." |
| 1:25 | Switch to `0xf4e4…410f`; open the bond → *Fund Invoice* blocked with the allowlist notice linking to `/kyc` | "Investors can't buy until they're eligible. Compliance lives in the token itself." |
| 1:35 | `/kyc` wizard (sidebar stepper): Welcome → Connect Wallet + sign → **Selfie Check** → Investor Profile → Declarations (toggle *US person* to show *blocked*, then set it back) → Identity Verification opens Sumsub | "A World Selfie Check first — a few seconds of liveness that proves one real person, spent once and bound to this wallet on the audit topic. It is not identity, and it does not decide eligibility; it gates the faucet and a larger API allowance. Then the real thing: a wallet-signed session, a suitability questionnaire, and Sumsub document plus liveness. A US person is blocked under Regulation S; a PEP is held. Only the decision goes on-chain — never a name or a document." |
| 2:10 | Status page flips `granting → granted`; HashScan `setEligible` tx | "On a green review the API grants the wallet on every live bond." |
| 2:18 | Open a bond → the button reads *Associate USDC* → one transaction | "One Hedera detail worth showing: an account cannot hold a token it has not associated with, so a new wallet's balance is a zero nothing can move. One transaction, once, and the app says so instead of reporting an empty balance." |
| 2:25 | Back to the bond → *Fund Invoice*, 10 units → approve + confirm → Funding Progress moves, position shows | "Funding in USDC at the discounted price. USDC goes straight to the issuer; units are minted to the investor." |
| 2:42 | Secondary Market → sell 4 units at 98% → ask listed; second wallet fills it → ask gone | "A compliant secondary market: units stay with the maker until a fill, and a fill to a non-granted wallet reverts at the token layer." |
| 2:56 | Terminal: `bun run src/index.ts issue …` in `apps/ats`, then the HashScan page for the security | "The same invoice can also be issued as a regulated security through Hedera's Asset Tokenization Studio: an ERC-1400 with an ISIN and Reg S on chain. Issuing units to a wallet that never passed KYC reverts." |
| 3:06 | Portfolio: the investor's 13 units of `sINV010`, then HashScan for the settle and claim already on chain | "At maturity the payor repays into settlement and holders surrender units for their pro-rata share — claims burn, so double claims are impossible." |
| 3:16 | Terminal: `bun run src/index.ts --execute 1` in `apps/agent` — 402 → paid → settled → decision → approve → funded | "Agents pay for market data over x402: the API answers 402 with the price in USDC, the agent signs a Hedera transfer, the Blocky402 facilitator settles it, and the receipt lands on the same HCS topic. Then the agent acts on what it bought and funds the bond — and it only can because that wallet passed the same KYC a human does." |
| 3:36 | Bond page *Audit trail* panel, then the HashScan topic with attestation + receipt messages | "Invoice, compliance decision, payment — one auditable trail on Hedera. Thanks." |

Cuts are fine; waiting for a transaction can be cut. Keep the wallet confirmations visible once.

Running total is about 3:50 against a 4:00 ceiling, so it is tight. If it overruns, the secondary
market at 2:42 is the beat to drop: it is the one whose point — the allowlist holds on a transfer —
is already made when funding is blocked at 1:25.
