# @sowee/core

The shared foundation of [Sowee](https://github.com/sowee-finance/sowee), compliant invoice financing on Hedera. It carries the domain model, the EIP-712 quote signing, and the read-only Hedera clients that everything else builds on. Nothing here needs a signer except signing itself.

The domain model gives you `Invoice`, `InvoiceStatus`, and `Quote` with zod validation at runtime, a branded `InvoiceId`, and USDC 6-decimal math that's bigint-only (`parseUsdc`, `formatUsdc`, `applyDiscountBps`). No floats anywhere near money.

On the pricing side there's a typed-data builder plus `signQuote` and `verifyQuote` for the `Quote(bytes32 invoiceId,uint256 faceValue,uint16 discountRateBps,uint64 validUntil,uint64 nonce)` struct under the `SoweeDiscountOracle` domain.

`MirrorNodeClient` is a minimal typed REST client on native fetch: accounts, tokens, balances, contracts, contract results and logs, HCS topic messages (base64-decoded for you), cursor pagination, and a read-only `contractCall`. For the HCS audit trail you get the `AttestationEvent` schema, JSON encode/decode with a guard for the 1024-byte HCS payload limit, and a `sha256Hex` document-hash helper.

The constants are verified Hedera testnet values: chainId 296, RPC/mirror/explorer URLs, USDC `0.0.429274`, ATS factory `0.0.9213391` / resolver `0.0.9212226`, and the HTS/HSS system contracts.

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

One Node caveat: `sha256Hex` uses `node:crypto`, so in browsers reach for `crypto.subtle.digest("SHA-256", …)` instead. The mirror client's topic-message decoding uses `node:buffer`.

Part of the [Sowee monorepo](https://github.com/sowee-finance/sowee).

## License

Apache-2.0
