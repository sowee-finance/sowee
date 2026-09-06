# contracts

Solidity core of Sowee, built with [Foundry](https://getfoundry.sh).

| Contract | Role |
|---|---|
| `BondToken` | fractional bond units with a KYC allowlist enforced on every transfer |
| `DiscountOracle` | verifies EIP-712 discount quotes (nonce + expiry) signed by the API |
| `InvoiceMarket` | primary funding in USDC at the quoted discount; compliant secondary asks |
| `MaturitySettlement` | payor repays in USDC; holders surrender units for a pro-rata claim |

Contracts are listed as they land; a row without a deployed address is not live yet.

## Commands

```sh
forge build
forge test -vvv
forge fmt --check
```

## Networks

| Network | Chain id | RPC | Explorer |
|---|---|---|---|
| Hedera testnet | 296 | `https://testnet.hashio.io/api` | https://hashscan.io/testnet |

Copy `.env.example` to `.env` and fill it, then:

```sh
# local: anvil in another terminal, then (deploys a MockUSDC too)
DEPLOYER_PK=<anvil key 0> QUOTE_SIGNER=<anvil addr 0> WRITE_DEPLOYMENTS=true \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# hedera testnet
forge script script/Deploy.s.sol --rpc-url hedera_testnet                       # dry run (local execution only)
WRITE_DEPLOYMENTS=true forge script script/Deploy.s.sol --rpc-url hedera_testnet \
  --broadcast --skip-simulation --gas-estimate-multiplier 200                     # deploy
```

Hedera specifics worth knowing:

- The relay charges at least 80% of the gas *limit*, so pad estimates rather than trust them.
- USDC on Hedera testnet is an HTS token (`0.0.429274`); any account or contract that
  receives it must be associated first. `MaturitySettlement` associates itself in its
  constructor through the HTS precompile at `0x167` (`HederaAssociable`).
- Foundry's on-chain simulation cannot execute that precompile (the relay reports `0xfe`
  there), so a broadcast needs `--skip-simulation`. The script etches a mock at `0x167` for
  its local execution phase; the gas multiplier covers the real association cost.

`deployments/<chainId>.json` is written on deploy and consumed by `apps/web` and `apps/api`.

## Deployments

None yet.
