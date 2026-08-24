import type { Address, Hash, Hex, WalletClient } from "viem";
import { encodeFunctionData, stringToHex, zeroAddress } from "viem";
import { factoryAbi } from "../abi/factory.js";
import {
  ATS_FACTORY_TESTNET,
  ATS_RESOLVER_TESTNET,
  BOND_CONFIG_ID,
  DEFAULT_ADMIN_ROLE,
  RegulationSubType,
  RegulationType,
} from "../constants.js";
import { type PreparedCall, sendCall } from "../tx.js";

export interface CreateInvoiceBondParams {
  /** Invoice id (bytes32) — bond name/symbol are derived from it. */
  invoiceId: Hex;
  /** Invoice face value in USDC base units (6 decimals). */
  faceValue: bigint;
  /** Bond maturity, unix seconds (the invoice due date). */
  maturityDate: bigint;
  /** Account granted DEFAULT_ADMIN_ROLE on the new security diamond. */
  admin: Address;
  /** ATS factory diamond. Defaults to the pre-deployed Hedera testnet factory. */
  factory?: Address;
  /** BusinessLogicResolver. Defaults to the pre-deployed Hedera testnet resolver. */
  resolver?: Address;
  /** Bond issuance date, unix seconds. Defaults to now. */
  startingDate?: bigint;
  /** Token decimals. Defaults to 6 (USDC-aligned). */
  decimals?: number;
  /** Nominal value per bond unit in USDC base units. Defaults to 1 USDC (1_000_000). */
  nominalValue?: bigint;
  /** ISO 4217 currency code (3 chars). Defaults to "USD". */
  currency?: string;
  /** Optional ISIN. Defaults to "". */
  isin?: string;
  /** Resolver configuration version. Defaults to 1n. */
  configVersion?: bigint;
  regulationType?: RegulationType;
  regulationSubType?: RegulationSubType;
}

const ONE_USDC = 1_000_000n;

/**
 * Build the `deployBond` argument tuple for a zero-coupon invoice bond:
 * single partition, allowlist (isWhiteList) ON, internal KYC ON, controllable,
 * maxSupply = faceValue / nominalValue units.
 *
 * Struct layout follows the real v8 `IFactory.BondData` / `FactoryRegulationData` ABI.
 */
export function buildDeployBondArgs(params: CreateInvoiceBondParams) {
  const {
    invoiceId,
    faceValue,
    maturityDate,
    admin,
    resolver = ATS_RESOLVER_TESTNET,
    startingDate = BigInt(Math.floor(Date.now() / 1000)),
    decimals = 6,
    nominalValue = ONE_USDC,
    currency = "USD",
    isin = "",
    configVersion = 1n,
    regulationType = RegulationType.REG_S,
    regulationSubType = RegulationSubType.NONE,
  } = params;

  if (nominalValue <= 0n || faceValue <= 0n) {
    throw new Error("faceValue and nominalValue must be positive");
  }
  if (faceValue % nominalValue !== 0n) {
    throw new Error(
      `faceValue ${faceValue} is not divisible by nominalValue ${nominalValue}; pick a nominal value without dust`,
    );
  }
  if (maturityDate <= startingDate) {
    throw new Error("maturityDate must be after startingDate");
  }

  const shortId = invoiceId.slice(2, 10).toUpperCase();
  const bondData = {
    security: {
      resolver,
      maxSupply: faceValue / nominalValue,
      resolverProxyConfiguration: { key: BOND_CONFIG_ID, version: configVersion },
      erc20MetadataInfo: {
        name: `Sowee Invoice Bond ${shortId}`,
        symbol: `INV-${shortId.slice(0, 6)}`,
        isin,
        decimals,
      },
      rbacs: [{ role: DEFAULT_ADMIN_ROLE, members: [admin] }],
      externalPauses: [],
      externalControlLists: [],
      externalKycLists: [],
      compliance: zeroAddress,
      identityRegistry: zeroAddress,
      arePartitionsProtected: false,
      isMultiPartition: false,
      isControllable: true,
      isWhiteList: true,
      clearingActive: false,
      internalKycActivated: true,
      erc20VotesActivated: false,
    },
    bondDetails: {
      currency: stringToHex(currency, { size: 3 }) as Hex,
      nominalValue,
      nominalValueDecimals: decimals,
      startingDate,
      maturityDate,
    },
    proceedRecipients: [],
    proceedRecipientsData: [],
  } as const;

  const regulationData = {
    regulationType,
    regulationSubType,
    additionalSecurityData: {
      countriesControlListType: false,
      listOfCountries: "",
      info: "",
    },
  } as const;

  return [bondData, regulationData] as const;
}

/** Prepared viem transaction request for `Factory.deployBond`. */
export function buildCreateInvoiceBondCall(params: CreateInvoiceBondParams): PreparedCall {
  return {
    to: params.factory ?? ATS_FACTORY_TESTNET,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: "deployBond",
      args: buildDeployBondArgs(params),
    }),
  };
}

/** Execute `deployBond` with a viem wallet client. Returns the transaction hash. */
export function createInvoiceBond(
  walletClient: WalletClient,
  params: CreateInvoiceBondParams,
): Promise<Hash> {
  return sendCall(walletClient, buildCreateInvoiceBondCall(params));
}
