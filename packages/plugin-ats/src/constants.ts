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
