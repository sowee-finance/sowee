import { describe, expect, test } from "bun:test"
import { maturityFrom, nameFor, sha256Hex, symbolFor } from "./issuer"

describe("issuer", () => {
  test("sha256Hex hashes the file bytes", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  test("symbol is s + uppercase alphanumerics, 8 chars max", () => {
    expect(symbolFor("INV-2026-001")).toBe("sINV2026")
    expect(symbolFor("ab 1")).toBe("sAB1")
    expect(nameFor("INV-1")).toBe("Sowee Bond INV-1")
  })

  test("maturity is UTC midnight of the due date", () => {
    expect(maturityFrom("2027-01-15")).toBe(1_799_971_200)
  })
})
