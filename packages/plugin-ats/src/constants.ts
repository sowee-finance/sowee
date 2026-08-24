import type { Address, Hex } from "viem";

/**
 * Constants sourced from @hashgraph/asset-tokenization-contracts@8.0.0
 * (build/scripts/domain/constants and contracts/constants/values.sol).
 */

/** ResolverProxy configuration id for bond securities. */
export const BOND_CONFIG_ID: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000002";

/** AccessControl DEFAULT_ADMIN_ROLE (bytes32 zero). */
export const DEFAULT_ADMIN_ROLE: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** ERC-1410 default partition used by single-partition ATS securities. */
export const DEFAULT_PARTITION: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

/**
 * AccessControl role ids from v8 `contracts/constants/roles.sol`:
 * `keccak256("asset.tokenization.standard.role.<Name>")` with names `Kyc`, `ControlList`,
 * `SsiManager` and `Issuer`. The bond creator only receives DEFAULT_ADMIN_ROLE via rbacs;
 * each operational role must be granted explicitly before compliance calls or minting work.
 */
export const ROLE_KYC: Hex = "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
export const ROLE_CONTROL_LIST: Hex =
  "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d";
export const ROLE_SSI_MANAGER: Hex =
  "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1";
export const ROLE_ISSUER: Hex =
  "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";

/** Solidity `enum RegulationType { NONE, REG_S, REG_D }`. */
export const RegulationType = {
  NONE: 0,
  REG_S: 1,
  REG_D: 2,
} as const;
export type RegulationType = (typeof RegulationType)[keyof typeof RegulationType];

/** Solidity `enum RegulationSubType { NONE, REG_D_506_B, REG_D_506_C }`. */
export const RegulationSubType = {
  NONE: 0,
  REG_D_506_B: 1,
  REG_D_506_C: 2,
} as const;
export type RegulationSubType = (typeof RegulationSubType)[keyof typeof RegulationSubType];

/**
 * Pre-deployed ATS Factory diamond on Hedera testnet (0.0.9213391).
 * EVM alias verified against the testnet mirror node — these contracts were deployed
 * through the EVM, so they have real aliases, not long-zero addresses.
 */
export const ATS_FACTORY_TESTNET: Address = "0xd1F118A40f3b02883D35909eF2517e7EDd78379d";

/** Pre-deployed ATS BusinessLogicResolver on Hedera testnet (0.0.9212226), EVM alias. */
export const ATS_RESOLVER_TESTNET: Address = "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a";
