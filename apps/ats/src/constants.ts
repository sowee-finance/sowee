/**
 * Asset Tokenization Studio, as deployed on Hedera testnet.
 *
 * Addresses are the ATS v8 infrastructure Hedera publishes; ids, role hashes and enum values are
 * the ones `@hashgraph/asset-tokenization-contracts@8` ships (`build/scripts/domain/constants.js`
 * and `contracts/constants/roles.sol`). They are repeated here so a reader can see exactly what
 * this integration sends, rather than tracing through the package.
 */
import type { Address, Hex } from "viem"

export const ATS = {
  /** FactoryFacet — deploys bond, equity and deposit-token diamonds. */
  factory: "0xd1F118A40f3b02883D35909eF2517e7EDd78379d" as Address, // 0.0.9213391
  /** BusinessLogicResolver — holds the facet sets each configuration resolves to. */
  resolver: "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a" as Address, // 0.0.9212226
  /** Configuration id for a plain bond, and the version registered on the resolver. */
  bondConfigId: "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex,
  bondConfigVersion: 1n,
  /** ERC-1400 default partition: this bond is single-partition. */
  defaultPartition: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
} as const

/** Role hashes from `contracts/constants/roles.sol`. */
export const ROLE = {
  DEFAULT_ADMIN: "0x0000000000000000000000000000000000000000000000000000000000000000",
  ISSUER: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  KYC: "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc",
  KYC_MANAGER: "0xec811504e835acf29535b5b62307b08000468f0c61ca6163ed6f17a03629b91e",
  CONTROL_LIST: "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d",
  CONTROL_LIST_MANAGER: "0xccf29bda8369877bcc921e38f30df86156a571ca5c5b8e777bf7ff75270313ea",
  SSI_MANAGER: "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1",
  CONTROLLER: "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e",
  MATURITY_MANAGER: "0xc20b7fd7efe1a2c9f69003a21c2c55c79ef84e16252b62599246ff01f6207314",
} as const satisfies Record<string, Hex>

/** `RegulationType` / `RegulationSubType` from the ATS domain constants. */
export const REGULATION = { NONE: 0, REG_S: 1, REG_D: 2 } as const
export const REGULATION_SUBTYPE = { NONE: 0, REG_D_506_B: 1, REG_D_506_C: 2 } as const

/** ISO-4217 currency code as the `bytes3` the bond details take. */
export const CURRENCY_USD = "0x555344" as Hex // "USD"

export const HEDERA_TESTNET_RPC = "https://testnet.hashio.io/api"

/**
 * Hedera charges at least 80% of the gas *limit*, and the relay reserves `limit × price` before
 * it will accept the transaction, so limits here are deliberate rather than estimated: deploying
 * a bond diamond is by far the most expensive call.
 */
export const GAS = { deployBond: 12_000_000n, call: 1_200_000n } as const
