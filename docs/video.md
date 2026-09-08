# Demo video — runbook and narration

Rules: 2–4 minutes, ≥720p screen capture, your own voice, no music, no speed-up, no phone.
Intro under 20 seconds. Everything shown must be live. Target 3:30.

Prepare (off camera): `scripts/demo.sh up` with a filled `.env.demo` brings up the API and the web
app against Hedera testnet and prints the links; MetaMask holding the investor wallet (`0x05F2…a6af`, USDC and
a few HBAR) and the issuer wallet (`0xbD6b…e910`); a terminal in `apps/agent` with `.env` filled;
HashScan tabs for the market contract and the HCS topic; `sowee.site` open in its own tab for the
opening shot.

Hedera reserves `gasLimit × gasPrice` up front, so keep 2–3 HBAR on any wallet that will sign
during the recording — a wallet with "enough for the fee" still gets rejected.

| Time | Screen | Say |
|---|---|---|
| 0:00 | `sowee.site`: hero, then one scroll to the card | "Sowee turns an unpaid invoice into a compliant, tradable bond on Hedera. That card is a real listing — the page read it out of the market contract a moment ago. Everything you'll see is live on testnet and was built from scratch this week." |
| 0:20 | `/issuer/new`: issuer company (pick a logo next to it), payor, reference, face value, due date, drop a PDF | "The issuer submits an invoice, with their own logo. The document is hashed in the browser — only the sha256 leaves the device, and the logo rides along to the audit trail so the bond carries its issuer's mark without a file store anywhere." |
| 0:40 | Click *Get a Quote* → discount and implied APY shown in the checklist | "The API prices it and signs an EIP-712 quote; the oracle verifies signer, expiry and burns the nonce on-chain — no price feed needed." |
| 0:55 | *List on-chain* → wallet confirms → *Anchor the document hash* runs → HCS link; the bond appears in Newly Issued | "One transaction deploys the bond and opens funding. The issuance and the document hash are anchored to a Hedera Consensus Service topic — a public audit trail without a database." |
| 1:20 | Switch to the investor wallet; open the bond → *Fund Invoice* blocked with the allowlist notice linking to `/kyc` | "Investors can't buy until they're eligible. Compliance lives in the token itself." |
| 1:30 | `/kyc` wizard (sidebar stepper): Welcome → Connect Wallet + sign → Investor Profile → Declarations (toggle *US person* to show *blocked*, then set it back) → Identity Verification opens Sumsub | "KYC: a wallet-signed session, a suitability questionnaire, and Sumsub document plus liveness. A US person is blocked under Regulation S; a PEP is held. Only the decision goes on-chain — never a name or a document." |
| 2:05 | Status page flips `granting → granted`; HashScan `setEligible` tx | "On a green review the API grants the wallet on every live bond." |
| 2:15 | Back to the bond → *Fund Invoice*, 10 units → approve + confirm → Funding Progress moves, position shows | "Funding in USDC at the discounted price. USDC goes straight to the issuer; units are minted to the investor." |
| 2:30 | Secondary Market → sell 4 units at 98% → ask listed; second wallet fills it → ask gone | "A compliant secondary market: units stay with the maker until a fill, and a fill to a non-granted wallet reverts at the token layer." |
| 2:45 | Terminal: `bun run src/index.ts issue …` in `apps/ats`, then the HashScan page for the security | "The same invoice can also be issued as a regulated security through Hedera's Asset Tokenization Studio: an ERC-1400 with an ISIN and Reg S on chain. Issuing units to a wallet that never passed KYC reverts." |
| 2:55 | Portfolio → matured bond row → *Claim* → USDC arrives, units burned | "At maturity the payor repays into settlement and holders surrender units for their pro-rata share — claims burn, so double claims are impossible." |
| 3:05 | Terminal: `bun run src/index.ts --execute 1` in `apps/agent` — 402 → paid → settled → decision → approve → funded | "Agents pay for market data over x402: the API answers 402 with the price in USDC, the agent signs a Hedera transfer, the Blocky402 facilitator settles it, and the receipt lands on the same HCS topic. Then the agent acts on what it bought and funds the bond — and it only can because that wallet passed the same KYC a human does." |
| 3:25 | Bond page *Audit trail* panel, then the HashScan topic with attestation + receipt messages | "Invoice, compliance decision, payment — one auditable trail on Hedera. Thanks." |

Cuts are fine; waiting for a transaction can be cut. Keep the wallet confirmations visible once.
If Selfie Check access lands before recording, insert it as the first wizard step (0:05 of
narration: "a World Selfie Check gates the demo faucet before the heavier KYC").
