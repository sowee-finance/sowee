import { expect, test } from "bun:test"
import { keccak256, toBytes } from "viem"
import { checkDigit, isinFor, isValidIsin, nsinFromHash } from "./isin"

test("check digit matches published ISINs", () => {
  // Apple Inc. US0378331005 and Treasury note US912828U816: both real, both end in their digit.
  expect(checkDigit("US037833100")).toBe(5)
  expect(checkDigit("US912828U81")).toBe(6)
  expect(isValidIsin("US0378331005")).toBe(true)
  expect(isValidIsin("US0378331004")).toBe(false)
})

test("rejects malformed identifiers", () => {
  expect(isValidIsin("US03783310")).toBe(false) // too short
  expect(isValidIsin("us0378331005")).toBe(false) // lower case
  expect(isValidIsin("USA378331005")).toBe(false) // three-letter prefix
})

test("an invoice reference always maps to the same valid ISIN", () => {
  const hash = keccak256(toBytes("INV-2026-010"))
  const isin = isinFor(hash)
  expect(isin).toHaveLength(12)
  expect(isin.startsWith("XS")).toBe(true)
  expect(isValidIsin(isin)).toBe(true)
  expect(isinFor(hash)).toBe(isin)
  expect(isinFor(keccak256(toBytes("INV-2026-011")))).not.toBe(isin)
})

test("the derived body is always nine characters", () => {
  for (const ref of ["a", "INV-1", "x".repeat(200)]) {
    expect(nsinFromHash(keccak256(toBytes(ref)))).toHaveLength(9)
  }
})
