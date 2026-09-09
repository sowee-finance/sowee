import { describe, expect, test } from "bun:test"
import { htsIdOf } from "./association"

describe("htsIdOf", () => {
  test("reads an HTS token's EVM address back as its entity id", () => {
    // The USDC the app is deployed against, and the id every Hedera tool shows for it.
    expect(htsIdOf("0x0000000000000000000000000000000000068cDa")).toBe("0.0.429274")
  })

  test("handles the low end without dropping leading zeros into the id", () => {
    expect(htsIdOf("0x0000000000000000000000000000000000000001")).toBe("0.0.1")
    expect(htsIdOf("0x0000000000000000000000000000000000000000")).toBe("0.0.0")
  })
})
