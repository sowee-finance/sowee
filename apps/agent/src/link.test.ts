import { expect, test } from "bun:test"
import { formatUsdc, txLink } from "./link"

test("hashscan link uses the dash form of a transaction id", () => {
  expect(txLink("0.0.7162784@1787822906.384230320")).toBe(
    "https://hashscan.io/testnet/transaction/0.0.7162784-1787822906-384230320",
  )
})

test("usdc base units format", () => {
  expect(formatUsdc("10000")).toBe("0.01")
  expect(formatUsdc("1000000")).toBe("1")
  expect(formatUsdc("0")).toBe("0")
})
