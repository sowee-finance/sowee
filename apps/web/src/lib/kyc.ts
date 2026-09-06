import type { Address, Hex } from "viem"
import { get, post } from "./api"

// Client for the API's KYC routes (apps/api README, "KYC and on-chain eligibility").

export type KycState = "none" | "pending" | "held" | "blocked" | "granting" | "granted"

/** `GET /v1/kyc/status`: the decision for a wallet, never personal data. */
export type KycStatus = {
  wallet: string
  state: KycState
  reason?: string
  applicantId?: string
  selfieCheck: boolean
  grantTxs?: Hex[]
  updatedAt: string
}

/** Proof of key ownership from the signed challenge. Valid one hour; lives in React state only. */
export type KycAuth = { wallet: Address; issuedAt: string; signature: Hex }

export type Profile = { firstName: string; lastName: string; dob: string; country: string }

/** Questionnaire values keyed `section.item` (`sowee-investor-suitability`). */
export type Answers = Record<string, string>

export const getChallenge = (wallet: Address) =>
  get<{ wallet: Address; issuedAt: string; message: string }>(`/v1/kyc/challenge?wallet=${wallet}`)

/** Sumsub WebSDK access token bound to the wallet. */
export const createSession = (auth: KycAuth) =>
  post<{ token: string }>("/v1/kyc/session", auth).then((r) => r.token)

/** Writes profile and declarations to the applicant; answers 202 with the status. */
export const submitProfile = (auth: KycAuth, profile: Profile, answers: Answers) =>
  post<KycStatus>("/v1/kyc/profile", { ...auth, profile, answers })

export const getStatus = (wallet: Address) => get<KycStatus>(`/v1/kyc/status?wallet=${wallet}`)

// ---- wizard -------------------------------------------------------------------------------

export const steps = [
  ["welcome", "Welcome"],
  ["signin", "Sign in"],
  ["selfie", "Selfie Check"],
  ["profile", "Profile"],
  ["declarations", "Declarations"],
  ["identity", "Identity"],
  ["status", "Status"],
] as const

export type Step = (typeof steps)[number][0]

/** The step after `step`; Selfie Check only exists when World access is configured. */
export function nextStep(step: Step, selfieCheck: boolean): Step {
  const i = steps.findIndex(([s]) => s === step)
  const n = steps[Math.min(i + 1, steps.length - 1)][0]
  return n === "selfie" && !selfieCheck ? "profile" : n
}

/** Where a wallet lands on load: a wallet with a file open resumes at its status. */
export const initialStep = (state?: KycState): Step =>
  state && state !== "none" ? "status" : "welcome"

export function describeState(state: KycState): { title: string; detail: string } {
  switch (state) {
    case "none":
      return { title: "Not started", detail: "No verification has been submitted for this wallet." }
    case "pending":
      return {
        title: "Under review",
        detail:
          "Your documents are being checked. This usually takes a few minutes; you can close this page and come back.",
      }
    case "held":
      return {
        title: "On hold",
        detail: "A compliance officer has to review your file before trading can be enabled.",
      }
    case "blocked":
      return {
        title: "Not eligible",
        detail: "This wallet cannot be granted eligibility under the offering's rules.",
      }
    case "granting":
      return {
        title: "Approved",
        detail: "Eligibility is being written to every live bond on-chain. Almost there.",
      }
    case "granted":
      return { title: "Verified", detail: "This wallet is on the allowlist and can trade." }
  }
}

// ---- questionnaire ------------------------------------------------------------------------

export type Question = {
  id: string
  label: string
  options: readonly (readonly [value: string, label: string])[]
}

const yesNo = [
  ["false", "No"],
  ["true", "Yes"],
] as const

/** ISO 3166-1 alpha-3 codes offered for residence. Sanctioned jurisdictions are left out. */
export const countries = [
  ["ARE", "United Arab Emirates"],
  ["ARG", "Argentina"],
  ["AUS", "Australia"],
  ["AUT", "Austria"],
  ["BEL", "Belgium"],
  ["BRA", "Brazil"],
  ["CAN", "Canada"],
  ["CHE", "Switzerland"],
  ["CHL", "Chile"],
  ["CHN", "China"],
  ["CZE", "Czechia"],
  ["DEU", "Germany"],
  ["DNK", "Denmark"],
  ["ESP", "Spain"],
  ["FIN", "Finland"],
  ["FRA", "France"],
  ["GBR", "United Kingdom"],
  ["GRC", "Greece"],
  ["HKG", "Hong Kong"],
  ["HUN", "Hungary"],
  ["IDN", "Indonesia"],
  ["IND", "India"],
  ["IRL", "Ireland"],
  ["ISR", "Israel"],
  ["ITA", "Italy"],
  ["JPN", "Japan"],
  ["KOR", "South Korea"],
  ["MEX", "Mexico"],
  ["MYS", "Malaysia"],
  ["NLD", "Netherlands"],
  ["NOR", "Norway"],
  ["NZL", "New Zealand"],
  ["PHL", "Philippines"],
  ["POL", "Poland"],
  ["PRT", "Portugal"],
  ["SAU", "Saudi Arabia"],
  ["SGP", "Singapore"],
  ["SWE", "Sweden"],
  ["THA", "Thailand"],
  ["TUR", "Türkiye"],
  ["TWN", "Taiwan"],
  ["USA", "United States"],
  ["VNM", "Viet Nam"],
  ["ZAF", "South Africa"],
] as const

/** The `sowee-investor-suitability` questionnaire. Every item is required; the policy decides. */
export const questionnaire: readonly Question[] = [
  { id: "jurisdiction.residence", label: "Country of residence", options: countries },
  {
    id: "jurisdiction.us_person",
    label: "Are you a US person (citizen, resident or taxpayer)?",
    options: yesNo,
  },
  {
    id: "jurisdiction.sanctioned",
    label: "Do you live in a comprehensively sanctioned jurisdiction?",
    options: yesNo,
  },
  {
    id: "classification.investor_class",
    label: "Investor classification",
    options: [
      ["retail", "Retail"],
      ["professional", "Professional"],
      ["institutional", "Institutional"],
    ],
  },
  {
    id: "classification.experience",
    label: "Experience with debt instruments",
    options: [
      ["none", "None"],
      ["some", "Some"],
      ["experienced", "Experienced"],
    ],
  },
  {
    id: "aml.source_of_funds",
    label: "Source of funds",
    options: [
      ["salary", "Salary"],
      ["business", "Business income"],
      ["investments", "Investments"],
      ["inheritance", "Inheritance"],
      ["other", "Other"],
    ],
  },
  {
    id: "aml.pep",
    label: "Are you a politically exposed person, or close to one?",
    options: yesNo,
  },
  {
    id: "aml.beneficial_owner",
    label: "Are you the sole beneficial owner of the funds you invest?",
    options: yesNo,
  },
]

/** Ids of the answers still missing; `aml.source_other` is required only for "other". */
export function missingAnswers(a: Answers): string[] {
  const missing = questionnaire.filter((q) => !a[q.id]?.trim()).map((q) => q.id)
  if (a["aml.source_of_funds"] === "other" && !a["aml.source_other"]?.trim())
    missing.push("aml.source_other")
  return missing
}
