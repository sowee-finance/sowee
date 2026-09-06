import { describe, expect, test } from "bun:test"
import { countries, initialStep, missingAnswers, nextStep, questionnaire } from "./kyc"

const complete = {
  "jurisdiction.residence": "IDN",
  "jurisdiction.us_person": "false",
  "jurisdiction.sanctioned": "false",
  "classification.investor_class": "professional",
  "classification.experience": "experienced",
  "aml.source_of_funds": "salary",
  "aml.pep": "false",
  "aml.beneficial_owner": "true",
}

describe("kyc wizard", () => {
  test("selfie check is skipped without World access", () => {
    expect(nextStep("signin", false)).toBe("profile")
    expect(nextStep("signin", true)).toBe("selfie")
    expect(nextStep("identity", false)).toBe("status")
    expect(nextStep("status", false)).toBe("status")
  })

  test("a wallet with a file open resumes at status", () => {
    expect(initialStep(undefined)).toBe("welcome")
    expect(initialStep("none")).toBe("welcome")
    expect(initialStep("pending")).toBe("status")
    expect(initialStep("granted")).toBe("status")
  })

  test("every questionnaire item is required, source_other only for other", () => {
    expect(missingAnswers(complete)).toEqual([])
    expect(missingAnswers({ ...complete, "aml.pep": " " })).toEqual(["aml.pep"])
    expect(missingAnswers({ ...complete, "aml.source_of_funds": "other" })).toEqual([
      "aml.source_other",
    ])
    expect(missingAnswers({})).toHaveLength(questionnaire.length)
  })

  test("residence options are alpha-3 and never a sanctioned jurisdiction", () => {
    for (const [code] of countries) expect(code).toMatch(/^[A-Z]{3}$/)
    for (const code of ["IRN", "PRK", "CUB", "SYR"])
      expect(countries.some(([c]) => c === code)).toBe(false)
  })
})
