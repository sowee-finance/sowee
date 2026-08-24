# @sowee/plugin-ats

[Sowee](https://github.com/sowee-finance/sowee) plugin for the [Hedera Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio): tokenize invoices as zero-coupon security bonds and drive their compliance and lifecycle.

Aligned with `@hashgraph/asset-tokenization-contracts` **v8.0.0** and the pre-deployed testnet Factory `0.0.9213391` / Resolver `0.0.9212226`. Minimal ABI fragments are vendored from the v8 hardhat artifacts (see `src/abi/`).

- **factory** — `createInvoiceBond`: builds the real v8 `Factory.deployBond` call for an invoice (zero-coupon bond, name/symbol derived from the invoice id, allowlist + internal KYC on, controllable, `maxSupply = faceValue / nominalValue`). Available as a prepared call builder (`buildCreateInvoiceBondCall`) and an `execute(walletClient)` helper.
- **compliance** — `grantKyc` / `revokeKyc`, `addToControlList` / `removeFromControlList`, `freezePartialTokens` / `unfreezePartialTokens`, `pause` / `unpause` — thin typed wrappers around the diamond's facet ABIs.
- **lifecycle** — `takeSnapshot`, `balanceOfAtSnapshot` / `totalSupplyAtSnapshot` (read-only via the mirror node), `redeemAtMaturity`, `controllerTransfer` / `controllerRedeem` / `forcedTransfer`.

Every write wrapper returns a `PreparedCall { to, data }` you can send with any signer; `sendCall(walletClient, call)` executes it with viem.

## Install

```sh
pnpm add @sowee/plugin-ats @sowee/core
```

## Usage

```ts
import { MirrorNodeClient, parseUsdc } from "@sowee/core";
import {
  balanceOfAtSnapshot,
  createInvoiceBond,
  grantKyc,
  sendCall,
  takeSnapshot,
} from "@sowee/plugin-ats";

// Deploy a bond for an invoice (defaults target the Hedera testnet ATS factory)
const hash = await createInvoiceBond(walletClient, {
  invoiceId: "0x…32 bytes…",
  faceValue: parseUsdc("50000"),
  maturityDate: 1790000000n,
  admin: walletClient.account.address,
});

// Compliance and lifecycle on the deployed diamond
await sendCall(walletClient, grantKyc(bond, investor));
await sendCall(walletClient, takeSnapshot(bond));
const held = await balanceOfAtSnapshot(new MirrorNodeClient(), bond, 1n, investor);
```

## License

Apache-2.0
