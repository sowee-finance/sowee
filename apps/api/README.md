# @sowee/api

Go service behind the Sowee dapp. Today it prices invoices and signs EIP-712 discount
quotes that `contracts/src/DiscountOracle.sol` verifies on chain. KYC orchestration, the
x402 gate and the HCS anchor land here later.

## Run

```sh
cd apps/api
cp .env.example .env            # then fill in DISCOUNT_ORACLE and QUOTE_SIGNER_PK
set -a; source .env; set +a
go run ./cmd/api
```

Checks (also wired into Turborepo as `build`, `test`, `lint`):

```sh
go build ./...
go test ./...
go vet ./...
```

Dependencies are `go-chi/chi` and `go-ethereum` only.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `CHAIN_ID` | `296` | EIP-712 domain `chainId` (Hedera testnet) |
| `DISCOUNT_ORACLE` | — | Deployed `DiscountOracle` address, the EIP-712 `verifyingContract` |
| `QUOTE_SIGNER_PK` | — | Hex private key; its address must equal `DiscountOracle.signer()` |

The process refuses to start without a valid key and oracle address.

## Endpoints

### `GET /v1/healthz`

```sh
curl -s localhost:8080/v1/healthz
```

```json
{"chainId":296,"signer":"0x5B1916478Ac7270101951888bD3B5193d5113083","status":"ok"}
```

### `POST /v1/invoices/{id}/quote`

Prices an invoice and returns a signed quote that `InvoiceMarket.listInvoice` can submit.

- `{id}`: a `0x`-prefixed 32-byte hex is used as `invoiceId` verbatim; anything else becomes
  `keccak256(id)`.
- Body: `faceValue` in USDC base units (6 decimals) as a decimal string, `maturity` as unix
  seconds. Maturity must be in the future.

```sh
curl -s -X POST localhost:8080/v1/invoices/INV-1/quote \
  -H 'Content-Type: application/json' \
  -d '{"faceValue":"10000000000","maturity":1796500000}'
```

```json
{
  "quote": {
    "invoiceId": "0x80066d42cb1d1876d3f91ddfce739f4649eb223e815f12756f733eb185548803",
    "faceValue": "10000000000",
    "discountRateBps": 275,
    "validUntil": 1788672981,
    "nonce": 117222413500416
  },
  "signature": "0x2988e35fca3ba6edbbc2bcf7a1e7fc13908ac88313c5937fcaf25ae7f29a21ec12704fe498b9a48759017000f96f9f81da86adc90670cb2ba49f2637b247b8e51c",
  "digest": "0xfef9ec71c7880348ad9c4da608f37b2b5aff241434369013c1b43df4ac671071",
  "signer": "0x5B1916478Ac7270101951888bD3B5193d5113083"
}
```

(Recorded on 2026-09-06 with a throwaway key against oracle `0x1111…1111`; the rate is 275 bps
because the maturity was 90 days out.)

Bad input returns `400 {"error":"…"}`.

## Quote semantics

- **Typed data.** Domain `SoweeDiscountOracle` / `1` / `CHAIN_ID` / `DISCOUNT_ORACLE`; primary type
  `Quote(bytes32 invoiceId,uint256 faceValue,uint16 discountRateBps,uint64 validUntil,uint64 nonce)`.
  `internal/quote` pins the digest of a fixed quote against `contracts/test/QuoteVector.t.sol`,
  so Go and Solidity are checked byte for byte.
- **Signature.** 65 bytes `r||s||v`, `v ∈ {27,28}`, recoverable with OpenZeppelin `ECDSA.recover`.
- **Pricing.** `200 + 25 × floor(daysToMaturity / 30)` bps, capped at `2000`.
- **Validity.** `validUntil = now + 15 min`. The oracle burns each nonce on `consume`, so a quote
  opens at most one listing.
- **Nonce.** `unix_seconds << 16 | counter`, unique across restarts, below 2^53 for JSON clients.

### Quote body

`POST /v1/invoices/{id}/quote` takes `{"issuer":"0x…","faceValue":"<base units>","maturity":<unix>}`.
`issuer` and `maturity` are part of the signed EIP-712 message, so the quote can only open that
listing, for that tenor, from that wallet. Digest vector: see `contracts/test/QuoteVector.t.sol`.

## Audit trail (HCS)

Lifecycle events and the invoice document's sha256 are anchored to a Hedera Consensus Service
topic. The document itself never leaves the issuer's browser; only the hash is written.

Live topic (testnet): [`0.0.10388277`](https://hashscan.io/testnet/topic/0.0.10388277)

```sh
curl -s -X POST localhost:8080/v1/invoices/INV-1/attest \
  -H 'content-type: application/json' \
  -d '{"docHash":"0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08","event":"issued"}'
# 201 {"topicId":"0.0.10388277","sequenceNumber":1,"link":"https://hashscan.io/testnet/topic/0.0.10388277"}
```

Pledging the same document under a second invoice is refused with `409` naming the invoice that
owns the hash. The index behind that check is rebuilt from the topic on every start (mirror
node replay), so a restart cannot forget a pledge.

An attestation may carry `logo`: a `data:` URI holding the issuer's mark, downscaled to a small square by
the browser before it is sent. `docHash` is optional when a logo is present — a mark is not a
document, so attaching or replacing one pledges nothing and binds nothing. An attestation with
neither is refused. Only `webp`, `png` and `jpeg` are accepted, at most 12 KB — an SVG
would carry script into every visitor's browser. The mark then lives with the record instead of
behind a link that can rot, and the web app reads it back off the topic.

Message shapes:

```json
{"type":"attestation.v1","invoiceId":"INV-1","docHash":"9f86…0a08","event":"issued","logo":"data:image/webp;base64,…","timestamp":"2026-09-06T05:31:36Z"}
{"type":"x402.receipt.v1","endpoint":"/v1/market/insights","payer":"0.0.x","amount":"10000","asset":"0.0.429274","settlementTx":"0.0.y@…","timestamp":"…"}
{"type":"selfie.v1","wallet":"0x…","nullifier":"0x…","timestamp":"…"}
```

The `selfie.v1` records are replayed too: a passed Selfie Check and the World nullifier it spent
both come back after a restart, so one World ID still cannot verify twice under two wallets.

| Env | Meaning |
|---|---|
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | account that pays for topic messages (ECDSA hex key) |
| `HCS_TOPIC_ID` | topic to write to; created and logged when empty |
| `MIRROR_URL` | mirror node used to replay the topic at startup; only messages paid for by the operator are replayed, so a stranger posting to the public topic cannot poison the double-pledge index |

## The API describes itself

`GET /openapi.json` — OpenAPI 3.1, built by the running process, so it cannot drift from the
service. It names the paid operation, its price, the response shape and the 402 a caller has to
handle first. The `servers` URL follows the request, so it is right behind a proxy without being
told where it lives. This is what an agent framework or a gateway reads instead of this README.

## Paid market insights (x402)

`GET /v1/market/insights` is pay-per-call: **0.01 USDC on Hedera testnet**, settled through the
[Blocky402](https://api.testnet.blocky402.com/supported) facilitator using the x402 v2 exact
scheme. The response lists every bond with funded %, tenor and implied APR, best first.

```sh
curl -si localhost:8080/v1/market/insights | grep -iE 'HTTP|payment-required'
# HTTP/1.1 402 Payment Required
# Payment-Required: eyJ4NDAyVmVyc2lvbiI6Miw…   (base64 JSON, also mirrored in the body)
```

Decoded challenge:

```json
{"x402Version":2,
 "resource":{"url":"http://localhost:8080/v1/market/insights","description":"Sowee market insights: …","mimeType":"application/json"},
 "accepts":[{"scheme":"exact","network":"hedera:testnet","amount":"10000","asset":"0.0.429274",
             "payTo":"0.0.7162116","maxTimeoutSeconds":180,"extra":{"feePayer":"0.0.7162784"}}]}
```

The client builds a `TransferTransaction` (client → `payTo`, `transactionId.accountId` = `feePayer`),
signs it, and retries with `PAYMENT-SIGNATURE: base64(PaymentPayload)`. The API forwards the
payload to the facilitator's `/verify` and `/settle`, answers `200` with the data and
`PAYMENT-RESPONSE: base64(SettlementResponse)`, anchors an `x402.receipt.v1` on the HCS topic, and
meters the payer. A replayed payload, a mismatched requirement or a failed verification is a `402`
again with the reason in `error`; a malformed header is `400`; a facilitator outage is `502`.

`GET /v1/market/insights/usage` → `{"payers":[{"payer":"0.0.x","calls":3,"spent":"30000","last":"…"}]}`
(pay-per-call metering; identities are Hedera account ids only).

| Env | Meaning |
|---|---|
| `X402_FACILITATOR_URL` | facilitator base URL (`/supported`, `/verify`, `/settle`) |
| `X402_NETWORK` / `X402_ASSET` / `X402_PAY_TO` / `X402_AMOUNT` | the single accepted requirement; `extra.feePayer` is read from `/supported` |
| `RPC_URL` / `INVOICE_MARKET` | where insights read live state from; empty market → empty list, payment still works |

## KYC and on-chain eligibility

Wallet → Sumsub (document + liveness + suitability questionnaire) → policy → `BondToken.setEligible`
on every live bond. Only the decision reaches the chain; no name, document or hash ever does.

| Route | Auth | Does |
|---|---|---|
| `GET /v1/kyc/challenge?wallet=0x…` | — | the exact text to `personal_sign` (`Sowee KYC session` + wallet + `Issued-At`), valid 1 h |
| `POST /v1/kyc/session` | signed | mints a Sumsub WebSDK access token bound to the wallet (`externalUserId`) and level |
| `POST /v1/kyc/profile` | signed | creates the applicant if needed, writes `fixedInfo` and the suitability questionnaire; answers `202` with the status |
| `GET /v1/kyc/status?wallet=0x…` | — | `none · pending · held · blocked · granting · granted` + reason + grant txs |
| `POST /v1/kyc/webhook` | HMAC | Sumsub `applicantReviewed` → re-evaluate → grant if eligible |

"signed" means the body carries `{wallet, issuedAt, signature}` from the challenge; a signature
for another wallet, an expired timestamp or a tampered message is a `401`.

### Policy (fail-closed)

On a `GREEN` review with the `sowee-investor-suitability` questionnaire complete:

| Condition | Decision |
|---|---|
| `jurisdiction.us_person = true` | **blocked** (Regulation S) |
| `jurisdiction.sanctioned = true` or residence in IRN / PRK / CUB / SYR | **blocked** |
| `aml.pep = true` or not the sole beneficial owner | **held** (manual review) |
| any required answer missing | **held** |
| review not `GREEN` | **pending** (`RED` + `FINAL` → blocked) |
| otherwise | **eligible** → granted on-chain |

Blocked and held wallets are never granted. Declarations are immutable once a review has
completed (`409` on resubmission), and a granted wallet that later evaluates to *blocked* is
revoked on-chain in the background. The grant runs in the background once per wallet
(`granting` → `granted`), skips bonds that already have it, and retries on the next status read
if a transaction failed (a wallet that becomes eligible before a bond exists is granted on the
next check after listing).

```sh
# sign the challenge with the wallet, then:
curl -s -X POST localhost:8080/v1/kyc/profile -H 'content-type: application/json' -d '{
  "wallet":"0x…","issuedAt":"2026-09-06T05:51:07Z","signature":"0x…",
  "profile":{"firstName":"Ana","lastName":"Sandbox","dob":"1990-01-01","country":"IDN"},
  "answers":{"jurisdiction.residence":"IDN","jurisdiction.us_person":"false","jurisdiction.sanctioned":"false",
             "classification.investor_class":"professional","classification.experience":"experienced",
             "aml.source_of_funds":"salary","aml.pep":"false","aml.beneficial_owner":"true"}}'
# 202 {"wallet":"0x…","state":"pending","reason":"identity verification not completed",...}
```

Then the WebSDK (token from `/v1/kyc/session`) collects the document and the liveness selfie in
the browser; the Sumsub sandbox reviews it and calls the webhook.

| Env | Meaning |
|---|---|
| `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` | sandbox App Token pair; KYC routes answer 503 without them |
| `SUMSUB_LEVEL` / `SUMSUB_QUESTIONNAIRE_ID` | the level applicants are created on and its questionnaire |
| `SUMSUB_WEBHOOK_SECRET` | verifies `x-payload-digest` on the webhook |
| `COMPLIANCE_OPERATOR_PK` | key holding `COMPLIANCE_ROLE` on every bond (defaults to `QUOTE_SIGNER_PK`) |
| `WEB_ORIGIN` | origins a browser may call this API from, comma-separated; defaults to `http://localhost:3000`, `*` opens it |

## World Selfie Check — a signal in front of KYC

Selfie Check (World ID credential 11) is a medium-assurance liveness + face-similarity proof.
Sowee uses it as an **anti-sybil signal**, not as KYC: it unlocks the demo faucet and a larger
API allowance before the heavier Sumsub flow, and full eligibility still needs the review +
policy pass above.

| Route | Auth | Does |
|---|---|---|
| `GET /v1/world/request` | — | `{app_id, rp_id, action, environment, rp_context:{sig,nonce,created_at,expires_at}}` — the RP signature IDKit needs (World ID 4.0, signed server-side with the Developer Portal key, 5-minute validity) |
| `POST /v1/world/verify` | signed | `{…, result: <IDKit success payload>}` → forwarded as-is to `POST https://developer.world.org/api/v4/verify/{rp_id}`; on success the nullifier is bound to the wallet (one proof per person) and `selfieCheck=true`; `409` on a reused proof, naming the wallet it is already bound to, `400` when the portal rejects it |
| `POST /v1/faucet` | signed | drips `FAUCET_USDC_AMOUNT` from the treasury to the wallet; `403` without the Selfie Check signal, `429` inside the cooldown, `502` if the wallet is not associated with USDC |

Rate limits on `/v1/invoices/*/quote`, `/v1/invoices/*/attest`, `/v1/kyc/*`, `/v1/world/*` and `/v1/faucet`: `RATE_BASE_PER_MIN` per client IP, or
`RATE_VERIFIED_PER_MIN` for a request that has **proved** it controls a wallet carrying the
signal. The proof is the same signed challenge the KYC writes use, in headers so the body is left
alone: `X-Wallet`, `X-Wallet-Issued-At`, `X-Wallet-Signature` over `GET /v1/kyc/challenge`.
Naming a wallet is not enough — grants are public on chain, so an unauthenticated header would
hand the larger allowance to anyone who can read HashScan, and let them spend an allowance its
owner earned.
### One person, one eligible wallet — `REQUIRE_SELFIE_CHECK`

Off by default. On, a wallet cannot reach `granted` without the Selfie Check signal, and since a
nullifier is spent exactly once, that gives a property the signal alone does not: **one person can
hold at most one eligible wallet**. The binding lives on the audit topic (`selfie.v1` carries both
the wallet and the nullifier) and is replayed at startup, so it outlives a restart rather than a
process.

The limit is worth stating plainly, because it is the reason this is a mode and not the default:
with the requirement **off**, a second wallet that simply never opens the Selfie Check step
presents no nullifier, so nothing links it to the first and nothing constrains it. The signal
reaches the faucet and the rate limit and stops there. Only requiring the check closes that, and
the cost is that someone without a World App cannot invest at all — a product decision, so it is
a flag rather than a default.

A wallet held this way is **held, not blocked**: it is one check away from eligible and nothing
about it is disqualifying, which is the same fail-closed posture the rest of the policy takes.

The Selfie Check step in the web wizard is skipped until `WORLD_*` is configured; the routes
answer `503` meanwhile. `X-Forwarded-For` is ignored unless `TRUSTED_PROXY=true`; the granter
and the faucet serialise transactions per key so they never race on the account nonce.
