# @sowee/core

Core primitives for [Sowee](https://github.com/sowee-finance/sowee) — compliant invoice financing on Hedera.

- **Domain model** — `Invoice`, `InvoiceStatus`, `Quote` with zod runtime validation, branded `InvoiceId`, and bigint-only USDC 6-decimal math (`parseUsdc`, `formatUsdc`, `applyDiscountBps`).
- **EIP-712** — typed-data builder, `signQuote`, and `verifyQuote` for the `Quote(bytes32 invoiceId,uint256 faceValue,uint16 discountRateBps,uint64 validUntil,uint64 nonce)` struct under the `SoweeDiscountOracle` domain.
- **Mirror Node client** — minimal typed REST client (native fetch): accounts, tokens, balances, contracts, contract results/logs, HCS topic messages (base64-decoded), cursor pagination, and read-only `contractCall`.
- **HCS audit trail** — `AttestationEvent` schema, JSON encode/decode with a 1024-byte HCS payload guard, and a `sha256Hex` document-hash helper.
- **Constants** — verified Hedera testnet values: chainId 296, RPC/mirror/explorer URLs, USDC `0.0.429274`, ATS factory `0.0.9213391` / resolver `0.0.9212226`, HTS/HSS system contracts.

## Install

```sh
pnpm add @sowee/core
```

## Usage

```ts
import {
  HEDERA_TESTNET,
  MirrorNodeClient,
  parseUsdc,
  signQuote,
  verifyQuote,
} from "@sowee/core";
import { privateKeyToAccount } from "viem/accounts";

const quote = {
  invoiceId: "0x…32 bytes…",
  faceValue: parseUsdc("50000"),
  discountRateBps: 250,
  validUntil: 1760000000n,
  nonce: 1n,
} as const;

const domain = { chainId: HEDERA_TESTNET.chainId, verifyingContract: "0x…" };
const signature = await signQuote(privateKeyToAccount("0x…"), quote, domain);
await verifyQuote(signature, quote, domain, oracleAddress); // true

const mirror = new MirrorNodeClient();
const usdc = await mirror.getTokenInfo("0.0.429274"); // symbol USDC, 6 decimals
```

`sha256Hex` uses `node:crypto`; in browsers use `crypto.subtle.digest("SHA-256", …)` instead. The mirror client's topic-message decoding uses `node:buffer`.

## License

Apache-2.0
