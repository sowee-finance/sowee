# @sowee/plugin-ats

[Sowee](https://github.com/sowee-finance/sowee) plugin for the [Hedera Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio): tokenize invoices as zero-coupon security bonds and drive their compliance and lifecycle.

Aligned with `@hashgraph/asset-tokenization-contracts` **v8.0.0** and the pre-deployed testnet Factory `0.0.9213391` / Resolver `0.0.9212226`. Minimal ABI fragments are vendored from the v8 hardhat artifacts (see `src/abi/`).

- **factory** — `createInvoiceBond`: builds the real v8 `Factory.deployBond` call for an invoice (zero-coupon bond, name/symbol derived from the invoice id, allowlist + internal KYC on, controllable, `maxSupply = faceValue / nominalValue`). The factory enforces ISO 6166 ISINs, so a deterministic checksum-valid ISIN is derived from the invoice id (`deriveIsin` / `isValidIsin`) unless one is passed explicitly. Available as a prepared call builder (`buildCreateInvoiceBondCall`) and an `execute(walletClient)` helper.
- **compliance** — `grantRole` / `revokeRole` (with the `ROLE_*` id constants), `addIssuer` / `removeIssuer` (SSI issuer list), `grantKyc` / `revokeKyc`, `addToControlList` / `removeFromControlList`, `issueUnits` (ERC-1594 mint), `freezePartialTokens` / `unfreezePartialTokens`, `pause` / `unpause` — thin typed wrappers around the diamond's facet ABIs. `bootstrapCompliance` batches the whole fresh-bond sequence.
- **lifecycle** — `takeSnapshot`, `balanceOfAtSnapshot` / `totalSupplyAtSnapshot` (read-only via the mirror node), `redeemAtMaturity`, `controllerTransfer` / `controllerRedeem` / `forcedTransfer`.

Every write wrapper returns a `PreparedCall { to, data }` you can send with any signer; `sendCall(walletClient, call)` executes it with viem.

## Install

```sh
pnpm add @sowee/plugin-ats @sowee/core
```

## Usage

```ts
import { parseUsdc } from "@sowee/core";
import { bootstrapCompliance, createInvoiceBond, issueUnits, sendCall } from "@sowee/plugin-ats";

const admin = walletClient.account.address;

// 1. Issuance: deploy a bond for an invoice (defaults target the Hedera testnet ATS
//    factory; a checksum-valid ISIN is derived from the invoice id automatically).
const hash = await createInvoiceBond(walletClient, {
  invoiceId: "0x…32 bytes…",
  faceValue: parseUsdc("50000"),
  maturityDate: 1790000000n,
  admin,
});
// … resolve the deployed diamond address from the receipt/mirror node …

// 2. Compliance: on a fresh bond the admin only holds DEFAULT_ADMIN_ROLE. `selfSetup`
//    prepends the role grants (SSI manager, KYC, control list, issuer) + SSI issuer
//    registration, then KYCs and allowlists the market, settlement and participants.
for (const call of bootstrapCompliance(bond, { issuer: admin, selfSetup: { admin } })) {
  await sendCall(walletClient, call);
}

// 3. Mint: issue bond units to the (now compliant) issuer wallet.
await sendCall(walletClient, issueUnits(bond, admin, 50_000n));
```

## License

Apache-2.0
