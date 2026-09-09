import { describe, expect, test } from "bun:test"
import { maturityFrom, nameFor, sha256Hex, symbolFor } from "./issuer"

describe("issuer", () => {
  test("sha256Hex hashes the file bytes", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  test("symbol is s + uppercase alphanumerics, 8 chars max", () => {
    expect(symbolFor("INV-2026-001")).toBe("sINV001")
    expect(symbolFor("ab 1")).toBe("sAB1")
    // The whole point: two invoices from the same year must not share a symbol.
    expect(symbolFor("INV-2026-021")).not.toBe(symbolFor("INV-2026-022"))
    expect(symbolFor("INV-010")).toBe("sINV010")
    // A reference with no number, and one with no letters, still produce something usable.
    expect(symbolFor("INVOICE")).toBe("sINVOICE") // s + 7 is the cap, so 8 characters
    expect(symbolFor("2026-021")).toBe("s021")
    expect(nameFor(" Acme GmbH ", "Globex Corp")).toBe("Acme GmbH · Globex Corp")
    // The separator is reserved for splitting the name back into issuer and payor.
    expect(nameFor("A · B", "C")).toBe("A - B · C")
  })

  test("maturity is UTC midnight of the due date", () => {
    expect(maturityFrom("2027-01-15")).toBe(1_799_971_200)
  })
})
