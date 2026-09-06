import { describe, expect, test } from "bun:test"
import { ContractFunctionRevertedError, encodeErrorResult, UserRejectedRequestError } from "viem"
import { discountOracleAbi } from "./abi/discountOracle"
import { invoiceMarketAbi } from "./abi/invoiceMarket"
import { describeError } from "./errors"

// What viem raises from simulateContract, decoded against the ABI of the contract called.
const revert = (data: `0x${string}`) =>
  new ContractFunctionRevertedError({ abi: invoiceMarketAbi, functionName: "listInvoice", data })

describe("describeError", () => {
  test("names an error from the called contract", () => {
    const data = encodeErrorResult({
      abi: invoiceMarketAbi,
      errorName: "AlreadyListed",
      args: [`0x${"1".repeat(64)}`],
    })
    expect(describeError(revert(data))).toBe("This invoice is already listed.")
  })

  test("decodes an error that bubbled up from another contract", () => {
    const data = encodeErrorResult({
      abi: discountOracleAbi,
      errorName: "QuoteExpired",
      args: [1n],
    })
    expect(describeError(revert(data))).toBe("The quote has expired. Request a new one.")
  })

  test("wallet rejection and plain errors", () => {
    expect(describeError(new UserRejectedRequestError(new Error("denied")))).toBe(
      "Rejected in the wallet.",
    )
    expect(describeError(new Error("offline"))).toBe("offline")
  })
})
