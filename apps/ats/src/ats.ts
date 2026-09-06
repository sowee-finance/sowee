/**
 * Issuing an invoice bond through Asset Tokenization Studio.
 *
 * The ATS factory deploys a diamond whose facets come from a configuration registered on the
 * business-logic resolver, so a "bond" here is a full ERC-1400 security token with compliance
 * facets, not a token we wrote. This module drives three things: the deployment, the compliance
 * configuration it needs before anyone may hold units, and the issuance itself.
 */
import {
  type Address,
  createPublicClient,
  createWalletClient,
  getAddress,
  type Hex,
  http,
  keccak256,
  parseEventLogs,
  toBytes,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { hederaTestnet } from "viem/chains"
import { complianceAbi, factoryAbi, mintAbi } from "./abi"
import {
  ATS,
  CURRENCY_USD,
  GAS,
  HEDERA_TESTNET_RPC,
  REGULATION,
  REGULATION_SUBTYPE,
  ROLE,
} from "./constants"
import { isinFor } from "./isin"

export type Clients = ReturnType<typeof clients>

export function clients(privateKey: Hex, rpcUrl = HEDERA_TESTNET_RPC) {
  const account = privateKeyToAccount(privateKey)
  const transport = http(rpcUrl)
  return {
    account,
    pub: createPublicClient({ chain: hederaTestnet, transport }),
    wallet: createWalletClient({ account, chain: hederaTestnet, transport }),
  }
}

export type BondParams = {
  /** Human invoice reference; the ISIN and the on-chain id are derived from it. */
  reference: string
  name: string
  symbol: string
  /** Face value in whole currency units (a 100 USDC invoice is 100). */
  faceValue: bigint
  maturity: bigint
}

/**
 * Deploys a bond security token. Compliance is switched on at birth: the control list acts as an
 * allowlist and internal KYC is required, so an account has to be both KYC'd and listed before it
 * can hold a unit. The security is issued under Regulation S, which matches the policy the rest
 * of Sowee enforces (US persons are excluded off-chain).
 */
export async function issueBond(c: Clients, p: BondParams) {
  const admin = c.account.address
  const isin = isinFor(keccak256(toBytes(p.reference)))
  const security = {
    resolver: ATS.resolver,
    maxSupply: p.faceValue,
    resolverProxyConfiguration: { key: ATS.bondConfigId, version: ATS.bondConfigVersion },
    erc20MetadataInfo: { name: p.name, symbol: p.symbol, isin, decimals: 0 },
    // Every role the compliance operator needs to configure and issue this bond.
    rbacs: [
      { role: ROLE.DEFAULT_ADMIN, members: [admin] },
      { role: ROLE.ISSUER, members: [admin] },
      { role: ROLE.KYC, members: [admin] },
      { role: ROLE.KYC_MANAGER, members: [admin] },
      { role: ROLE.CONTROL_LIST, members: [admin] },
      { role: ROLE.CONTROL_LIST_MANAGER, members: [admin] },
      { role: ROLE.SSI_MANAGER, members: [admin] },
      { role: ROLE.CONTROLLER, members: [admin] },
      { role: ROLE.MATURITY_MANAGER, members: [admin] },
    ],
    externalPauses: [],
    externalControlLists: [],
    externalKycLists: [],
    compliance: "0x0000000000000000000000000000000000000000" as Address,
    identityRegistry: "0x0000000000000000000000000000000000000000" as Address,
    arePartitionsProtected: false,
    isMultiPartition: false,
    isControllable: true,
    isWhiteList: true, // the control list is an allowlist, not a blocklist
    clearingActive: false,
    internalKycActivated: true,
    erc20VotesActivated: false,
  }
  const bondDetails = {
    currency: CURRENCY_USD,
    nominalValue: 1n, // one unit = one currency unit of face value
    nominalValueDecimals: 0,
    startingDate: BigInt(Math.floor(Date.now() / 1000) + 60),
    maturityDate: p.maturity,
  }
  const regulation = {
    regulationType: REGULATION.REG_S,
    regulationSubType: REGULATION_SUBTYPE.NONE,
    additionalSecurityData: {
      countriesControlListType: false,
      listOfCountries: "",
      info: p.reference,
    },
  }

  const hash = await c.wallet.writeContract({
    address: ATS.factory,
    abi: factoryAbi,
    functionName: "deployBond",
    args: [{ security, bondDetails, proceedRecipients: [], proceedRecipientsData: [] }, regulation],
    gas: GAS.deployBond,
  })
  const receipt = await c.pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`deployBond reverted (${hash})`)
  const [event] = parseEventLogs({ abi: factoryAbi, eventName: "BondDeployed", logs: receipt.logs })
  const address = (event as unknown as { args: { bondAddress: Address } } | undefined)?.args
    .bondAddress
  if (!address) throw new Error(`deployBond mined but emitted no BondDeployed (${hash})`)
  return { address: getAddress(address), isin, hash }
}

/**
 * Makes an account able to hold the bond: register the operator as a credential issuer once,
 * grant KYC to the account, then add it to the allowlist. Each step is skipped when already done,
 * so this is safe to re-run.
 */
export async function allow(
  c: Clients,
  token: Address,
  account: Address,
  validFor = 365n * 86_400n,
) {
  const contract = { address: token, abi: complianceAbi } as const
  const txs: Hex[] = []
  const send = async (functionName: string, args: readonly unknown[]) => {
    const hash = await c.wallet.writeContract({
      ...contract,
      functionName,
      args,
      gas: GAS.call,
    } as never)
    const r = await c.pub.waitForTransactionReceipt({ hash })
    if (r.status !== "success") throw new Error(`${functionName} reverted (${hash})`)
    txs.push(hash)
  }

  if (
    !(await c.pub.readContract({
      ...contract,
      functionName: "isIssuer",
      args: [c.account.address],
    }))
  ) {
    await send("addIssuer", [c.account.address])
  }
  if (
    (await c.pub.readContract({
      ...contract,
      functionName: "getKycStatusFor",
      args: [account],
    })) !== 1
  ) {
    const now = BigInt(Math.floor(Date.now() / 1000))
    // The credential id records *why* the account is eligible; the decision itself lives off-chain.
    await send("grantKyc", [
      account,
      `sowee-kyc:${account.toLowerCase()}`,
      now,
      now + validFor,
      c.account.address,
    ])
  }
  if (
    !(await c.pub.readContract({ ...contract, functionName: "isInControlList", args: [account] }))
  ) {
    await send("addToControlList", [account])
  }
  return txs
}

/** Issues units of the bond to a holder. Reverts at the token if the holder is not allowed. */
export async function issueUnits(c: Clients, token: Address, to: Address, units: bigint) {
  const hash = await c.wallet.writeContract({
    address: token,
    abi: mintAbi,
    functionName: "issueByPartition",
    args: [{ partition: ATS.defaultPartition, tokenHolder: to, value: units, data: "0x" }],
    gas: GAS.call,
  })
  const receipt = await c.pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`issueByPartition reverted (${hash})`)
  return hash
}

/** Reads the parts of a deployed bond that show it is configured and holding value. */
export async function status(c: Clients, token: Address, account?: Address) {
  const read = (functionName: string, args: readonly unknown[] = []) =>
    c.pub.readContract({ address: token, abi: complianceAbi, functionName, args } as never)
  const out: Record<string, unknown> = {}
  if (account) {
    out.kycStatus = await read("getKycStatusFor", [account])
    out.allowlisted = await read("isInControlList", [account])
  }
  return out
}
