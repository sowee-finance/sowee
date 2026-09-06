import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  UserRejectedRequestError,
} from "viem"
import { bondTokenAbi } from "./abi/bondToken"
import { discountOracleAbi } from "./abi/discountOracle"
import { invoiceMarketAbi } from "./abi/invoiceMarket"
import { maturitySettlementAbi } from "./abi/maturitySettlement"

// A revert can come from a contract other than the one called (oracle and bond errors bubble
// up through the market), so decode against every core ABI.
const errorAbi = [
  ...invoiceMarketAbi,
  ...discountOracleAbi,
  ...bondTokenAbi,
  ...maturitySettlementAbi,
].filter((x) => x.type === "error")

const messages: Record<string, string> = {
  AlreadyListed: "This invoice is already listed.",
  QuoteExpired: "The quote has expired. Request a new one.",
  NonceUsed: "This quote was already used. Request a new one.",
  BadSigner: "The quote was not signed by the oracle's signer.",
  FundingClosed: "Funding is closed: the invoice has matured.",
  NotEligible: "This wallet is not on the allowlist (KYC required).",
  Frozen: "This wallet is frozen.",
  ExceedsFaceValue: "That is more than the remaining face value.",
  InsufficientUnits: "Not enough units available.",
  UnknownAsk: "This ask no longer exists.",
  NotMaker: "Only the maker can cancel this ask.",
  NotSettled: "Repayment has not been settled yet.",
  NothingToClaim: "Nothing to claim for this wallet.",
  ZeroAmount: "Amount must be greater than zero.",
}

/** One readable line for a failed simulation, transaction or wallet prompt. */
export function describeError(err: unknown): string {
  if (!(err instanceof BaseError)) return err instanceof Error ? err.message : String(err)
  if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Rejected in the wallet."
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
  if (revert instanceof ContractFunctionRevertedError) {
    let name = revert.data?.errorName
    if (!name && revert.raw) {
      try {
        name = decodeErrorResult({ abi: errorAbi, data: revert.raw }).errorName
      } catch {}
    }
    if (name) return messages[name] ?? `Reverted with ${name}.`
    if (revert.reason) return revert.reason
  }
  return err.shortMessage
}
