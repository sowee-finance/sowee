import type { Address } from "viem";

/** Hedera testnet network parameters. */
export const HEDERA_TESTNET = {
  chainId: 296,
  rpcUrl: "https://testnet.hashio.io/api",
  mirrorNodeUrl: "https://testnet.mirrornode.hedera.com/api/v1",
  explorerUrl: "https://hashscan.io/testnet",
} as const;

/** USDC on Hedera testnet (HTS token). */
export const USDC_TESTNET = {
  tokenId: "0.0.429274",
  evmAddress: "0x0000000000000000000000000000000000068cDa" as Address,
  decimals: 6,
} as const;

/**
 * Hedera Asset Tokenization Studio, pre-deployed on testnet.
 * Aligned with @hashgraph/asset-tokenization-contracts v8.0.0.
 */
export const ATS_TESTNET = {
  factoryId: "0.0.9213391",
  resolverId: "0.0.9212226",
  contractsVersion: "8.0.0",
} as const;

/**
 * Sowee protocol deployment on Hedera testnet — proxy (stable) addresses only.
 * All contracts are Sourcify-verified (exact match); implementations are
 * intentionally omitted: nothing should ever call an implementation directly.
 */
export const SOWEE_TESTNET = {
  /** EIP-712 verifying contract for discount quotes. */
  discountOracle: "0xD8ceb338Da5d19B29075903Fb78B469E46Ba1957" as Address,
  discountOracleId: "0.0.10205670",
  invoiceMarket: "0xc284Ea6dF1979B2BbE8c67484505Ce0C2e6f264a" as Address,
  invoiceMarketId: "0.0.10205673",
  maturitySettlement: "0xE015c2BC2870c2B5f6039946d306C9E013390426" as Address,
  maturitySettlementId: "0.0.10205676",
  pegGuard: "0x6732E93b91d1F4de0a38B3F8F2d4B889E26c6773" as Address,
  pegGuardId: "0.0.10205678",
} as const;

/** Hedera Schedule Service system contract address (0x16b). */
export const HSS_SYSTEM_CONTRACT: Address = "0x000000000000000000000000000000000000016b";

/** Hedera Token Service system contract address (0x167). */
export const HTS_SYSTEM_CONTRACT: Address = "0x0000000000000000000000000000000000000167";

const DECIMAL_DIGITS_REGEX = /^\d+$/;

/**
 * Convert a Hedera entity id (`shard.realm.num`) to its long-zero EVM address.
 * Only valid for entities without an explicit EVM alias (contracts, HTS tokens, auto accounts).
 */

export function hederaIdToEvmAddress(id: string): Address {
  const [shard, realm, num, ...rest] = id.split(".");
  if (
    shard !== "0" ||
    realm !== "0" ||
    !num ||
    rest.length > 0 ||
    !DECIMAL_DIGITS_REGEX.test(num)
  ) {
    throw new Error(`Unsupported Hedera id for long-zero address: ${id}`);
  }
  return `0x${BigInt(num).toString(16).padStart(40, "0")}` as Address;
}
