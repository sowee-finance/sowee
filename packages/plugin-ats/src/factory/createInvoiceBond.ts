import type { Address, Hash, Hex, WalletClient } from "viem";
import { encodeFunctionData, keccak256, stringToHex, zeroAddress } from "viem";
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
  /** ISIN (ISO 6166, 12 chars, checksum-valid). Defaults to `deriveIsin(invoiceId)` —
   * the v8 factory validates ISINs and reverts `WrongISIN` on the old empty default. */
  isin?: string;
  /** Resolver configuration version. Defaults to 1n. */
  configVersion?: bigint;
  regulationType?: RegulationType;
  regulationSubType?: RegulationSubType;
}

const ONE_USDC = 1_000_000n;

/** ISO 6166 shape: 2-letter prefix, 9 alphanumerics, 1 check digit. */
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
/** Number of distinct 9-char base-36 ISIN bodies. */
const ISIN_BODY_SPACE = 36n ** 9n;

/**
 * ISO 6166 check digit: expand letters to two digits (A=10 … Z=35), then run Luhn over
 * the expanded digit string. The check digit occupies the rightmost (undoubled) slot,
 * so doubling starts at the stem's last digit.
 */
function isinCheckDigit(stem: string): string {
  const digits: number[] = [];
  for (const ch of stem) {
    const value = Number.parseInt(ch, 36);
    if (value >= 10) {
      digits.push(Math.trunc(value / 10), value % 10);
    } else {
      digits.push(value);
    }
  }
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    const term = double ? (digits[i] ?? 0) * 2 : (digits[i] ?? 0);
    sum += term > 9 ? term - 9 : term;
    double = !double;
  }
  return String((10 - (sum % 10)) % 10);
}

/** True when `isin` is a well-formed ISO 6166 ISIN with a correct Luhn check digit. */
export function isValidIsin(isin: string): boolean {
  return ISIN_REGEX.test(isin) && isin.slice(11) === isinCheckDigit(isin.slice(0, 11));
}

/**
 * Derive a deterministic, checksum-valid ISIN from an invoice id: "SW" + 9 base-36 chars
 * of keccak256(invoiceId) + the ISO 6166 check digit. The v8 ATS factory enforces ISIN
 * validity (`WrongISIN`), so every bond needs one; the derived value is a synthetic
 * placeholder, not an NNA-issued identifier.
 */
export function deriveIsin(invoiceId: Hex): string {
  const body = (BigInt(keccak256(invoiceId)) % ISIN_BODY_SPACE)
    .toString(36)
    .toUpperCase()
    .padStart(9, "0");
  const stem = `SW${body}`;
  return stem + isinCheckDigit(stem);
}

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
    isin = deriveIsin(params.invoiceId),
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
  if (!isValidIsin(isin)) {
    throw new Error(
      `invalid ISIN "${isin}" — must be 12 chars (2 letters + 9 alphanumerics + Luhn check digit); ` +
        "the v8 factory reverts WrongISIN otherwise. Omit it to derive one from the invoice id.",
    );
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
