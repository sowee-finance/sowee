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
node replay), so a restart cannot forget a pledge. Message shapes:

```json
{"type":"attestation.v1","invoiceId":"INV-1","docHash":"9f86…0a08","event":"issued","timestamp":"2026-09-06T05:31:36Z"}
{"type":"x402.receipt.v1","endpoint":"/v1/market/insights","payer":"0.0.x","amount":"10000","asset":"0.0.429274","settlementTx":"0.0.y@…","timestamp":"…"}
```

| Env | Meaning |
|---|---|
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | account that pays for topic messages (ECDSA hex key) |
| `HCS_TOPIC_ID` | topic to write to; created and logged when empty |
| `MIRROR_URL` | mirror node used to replay the topic at startup |
