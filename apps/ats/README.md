# ats

Issuing an invoice as a **regulated security** through Hedera's
[Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio).

Sowee's own `BondToken` is a light compliance token: an allowlist checked on every transfer, which
is all the marketplace needs. Some invoices want the other thing — a security token with the full
ERC-1400 surface, partitions, controller powers, an ISIN and a regulation type recorded on chain.
That is what ATS deploys, and this package is how an issuer reaches it: the same invoice, wrapped
as a `Reg S` bond whose units nobody can hold without passing the same KYC.

```sh
export ATS_OPERATOR_PK=0x…            # admin, KYC issuer and issuer of the security
bun run src/index.ts issue  --ref INV-2026-010 --name "Nusantara Textile Mills · Bavaria Machinery Group" --symbol sATS010 --face 100 --days 30
bun run src/index.ts allow  --token 0x… --account 0x…   # SSI issuer, KYC grant, allowlist
bun run src/index.ts mint   --token 0x… --to 0x… --units 25
bun run src/index.ts status --token 0x… --account 0x…
```

## Live on Hedera testnet

| | |
|---|---|
| Bond security token | [`0xb438390fE710b12d1951E3b250889A673356e078`](https://hashscan.io/testnet/contract/0xb438390fE710b12d1951E3b250889A673356e078) |
| ISIN | `XSHUZWMQSU19` (derived from the invoice reference, check digit valid) |
| Invoice | `INV-2026-010`, the same one listed on the marketplace |
| Deployment | [`0x21b3194a…`](https://hashscan.io/testnet/transaction/0x21b3194a6ef56e1a7a6b7d2afa36a9ec17dceeaae926dcfb32d7dafd6d9b7d60) |
| Register the operator as a credential issuer | [`0x13d4e3dd…`](https://hashscan.io/testnet/transaction/0x13d4e3ddb6aa16de3f867e7cd88691d8a090921c1f88e8af145a8279ff44de03) |
| `grantKyc` for the investor | [`0xd5a027c0…`](https://hashscan.io/testnet/transaction/0xd5a027c0de157228a2bbbe46933b9d1a41d93e75e347637072c40e5410603705) |
| `addToControlList` (the list is an allowlist) | [`0x8123943f…`](https://hashscan.io/testnet/transaction/0x8123943f2dfceddb1e7ea1f3399d95c38d4ab04370fa6a39adb0248ff8937240) |
| `issueByPartition` — 25 units to the investor | [`0xaf32794b…`](https://hashscan.io/testnet/transaction/0xaf32794b8771fbedaa8f82f335d25c168c0f1511317e38b23af219994d025c9d) |

Checked on the same state: issuing to a wallet that was never KYC'd reverts, and that wallet reads
back as `kycStatus 0`, `isInControlList false`, while the investor reads `1` and `true`.

## How it is put together

| File | Does |
|---|---|
| `src/constants.ts` | the ATS testnet factory and resolver, the bond configuration id and version, role hashes, regulation enums |
| `src/isin.ts` | ISIN derivation and its check digit, tested against real published ISINs |
| `src/ats.ts` | `deployBond` payload, the compliance steps, issuance |
| `src/index.ts` | the CLI above |

Three things are worth knowing if you build on ATS yourself.

- **The security is configured at birth.** `isWhiteList: true` turns the control list into an
  allowlist and `internalKycActivated: true` requires a KYC record, so the compliance posture is
  part of `deployBond` rather than something to remember afterwards.
- **KYC needs an issuer first.** `grantKyc` names the credential issuer, and that address has to
  be registered with `addIssuer` on the same token. A first-time `grantKyc` fails without it.
- **A malformed ISIN fails the deployment**, so the identifier is generated and check-digited
  rather than typed.

Gas limits are set rather than estimated: Hedera reserves `gasLimit × gasPrice` before accepting a
transaction and charges at least 80% of the limit, and deploying the diamond is by far the most
expensive call here.
