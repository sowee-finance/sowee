"use client"

// Guided onboarding: light-blue step sidebar (desktop) / progress bars (mobile) alongside a
// vertical stepper — the steps stack as cards, the active one expanded and the rest collapsed
// (done cards carry a check, upcoming cards are dimmed). Wallet sign-in lives inside Welcome;
// profile and declarations are native forms submitted to the API; Sumsub handles document +
// liveness at the end, and the same card then shows the decision.

import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListChecks,
  Loader2,
  ScanFace,
  ShieldCheck,
  UserRound,
  UserSquare2,
  X,
  XCircle,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { Address } from "viem"
import { useAccount, useConnect, useSignMessage } from "wagmi"
import { ApiError } from "@/lib/api"
import { shortAddress, txUrl } from "@/lib/chains"
import { describeError } from "@/lib/errors"
import {
  type Answers,
  countries,
  createSession,
  describeState,
  getChallenge,
  initialStep,
  type KycAuth,
  type KycStatus,
  missingAnswers,
  nextStep,
  type Profile,
  questionnaire,
  type Step,
  submitProfile,
} from "@/lib/kyc"
import { useKycStatus } from "@/lib/use-kyc"
import { SelfieCheckStep } from "./selfie-check-step"
import { SumsubWebSdk } from "./sumsub-websdk"

// World Selfie Check is only offered once the app has access (see selfie-check-step.tsx).
const selfieCheck = !!process.env.NEXT_PUBLIC_WORLD_APP_ID

const message = (e: unknown) => (e instanceof Error ? describeError(e) : String(e))

type Group = {
  label: string
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  steps: readonly Step[]
}

/** Sidebar entries; each groups the wizard steps it covers. */
const GROUPS: readonly Group[] = [
  { label: "Welcome", Icon: UserRound, steps: ["welcome", "signin"] },
  ...(selfieCheck ? [{ label: "Selfie Check", Icon: ScanFace, steps: ["selfie"] as const }] : []),
  { label: "Investor Profile", Icon: Layers, steps: ["profile"] },
  { label: "Declarations", Icon: ListChecks, steps: ["declarations"] },
  { label: "Identity Verification", Icon: ShieldCheck, steps: ["identity", "status"] },
]

/* ---------------------------------- chrome --------------------------------- */

/** Deterministic bar skyline along the sidebar's bottom (hydration-safe). */
function DecorBars() {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    height: 12 + ((i * 53) % 82),
    dark: i % 4 === 2,
  }))
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-6 bottom-0 flex h-[380px] items-end gap-[9px] overflow-hidden"
    >
      {bars.map((bar) => (
        <span
          key={bar.height}
          className={`w-[2px] shrink-0 ${bar.dark ? "bg-[#5d6b96]/70" : "bg-[#a5c0ef]"}`}
          style={{ height: `${bar.height}%` }}
        />
      ))}
    </div>
  )
}

function SideStep({
  label,
  Icon,
  state,
}: {
  label: string
  Icon: Group["Icon"]
  state: "done" | "active" | "todo"
}) {
  return (
    <li className="relative flex items-center gap-3.5">
      {state === "done" ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3c5fce] text-white">
          <Check className="size-4" aria-hidden />
        </span>
      ) : (
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
            state === "active"
              ? "bg-[#c4d6fa] text-[#1f3a7c] ring-1 ring-[#a9c2f2]"
              : "bg-white/70 text-[#94a3c4]"
          }`}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
      )}
      <span
        className={`text-[15px] ${state === "todo" ? "text-[#8a99bd]" : "font-medium text-[#111b3e]"}`}
      >
        {label}
      </span>
    </li>
  )
}

/** A non-active step: a compact card row. Completed steps reopen on click. */
function CollapsedStep({
  index,
  label,
  Icon,
  done,
  onEdit,
}: {
  index: number
  label: string
  Icon: Group["Icon"]
  done: boolean
  onEdit?: () => void
}) {
  const body = (
    <>
      {done ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3c5fce] text-white">
          <Check className="size-4" aria-hidden />
        </span>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-shade text-[#94a3c4]">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <span
        className={`flex-1 text-left text-[15px] ${done ? "font-medium text-ink" : "text-faint"}`}
      >
        {label}
      </span>
      {done && onEdit ? (
        <span className="text-[13px] text-soft">Edit</span>
      ) : (
        <span className="text-[13px] text-faint">Step {index + 1}</span>
      )}
    </>
  )
  const shell =
    "flex w-full items-center gap-4 rounded-[20px] border border-line/60 bg-white px-6 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
  if (done && onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className={`${shell} transition-colors hover:bg-shade/40`}
      >
        {body}
      </button>
    )
  }
  return <div className={`${shell} ${done ? "" : "opacity-70"}`}>{body}</div>
}

/* ----------------------------------- atoms --------------------------------- */

export function StepCard({
  title,
  lede,
  children,
  footer,
}: {
  title?: string
  lede?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="rounded-[20px] border border-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
      {title && (
        <h1 className="font-semibold text-[22px] tracking-tight sm:text-[24px]">{title}</h1>
      )}
      {lede && <p className="mt-2 text-[15px] text-soft leading-relaxed">{lede}</p>}
      <div className={`flex flex-col ${title || lede ? "mt-6" : ""}`}>{children}</div>
      {footer}
    </section>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block pl-4 text-sm text-soft">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  "h-14 w-full rounded-xl bg-[#f4f4f5] px-4 text-base outline-none transition-shadow focus:ring-2 focus:ring-ink/15"

function FooterNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  busy = false,
  busyLabel = "Working…",
  submit = false,
}: {
  onBack?: () => void
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  busy?: boolean
  busyLabel?: string
  submit?: boolean
}) {
  return (
    <div className="mt-auto flex items-center gap-3 pt-5 lg:pt-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink hover:bg-shade"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
      )}
      <button
        type={submit ? "submit" : "button"}
        disabled={nextDisabled || busy}
        onClick={onNext}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#141416] font-medium text-base text-white transition-colors hover:bg-black disabled:text-white/40"
      >
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {busy ? busyLabel : nextLabel}
        {!busy && <ChevronRight className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

const errorText = "mt-4 text-sm text-neg"

/* ---------------------------------- wizard --------------------------------- */

export function KycWizard() {
  const { address, isConnected } = useAccount()
  const wallet = isConnected ? address : undefined
  const status = useKycStatus(wallet)
  const [override, setOverride] = useState<Step>()
  const [auth, setAuth] = useState<KycAuth>()
  const [profile, setProfile] = useState<Profile>()
  const queryClient = useQueryClient()

  // Switching wallets starts over: the signature and the resume point belong to the old one.
  const prev = useRef(wallet)
  useEffect(() => {
    if (prev.current && prev.current !== wallet) {
      setOverride(undefined)
      setAuth(undefined)
      setProfile(undefined)
    }
    prev.current = wallet
  }, [wallet])

  const step = override ?? (!wallet ? "welcome" : status.data && initialStep(status.data.state))

  // Resume: a wallet that already has a file open never re-enters the flow from the front.
  const open = !!status.data && status.data.state !== "none"
  useEffect(() => {
    if (open && (step === "welcome" || step === "signin")) setOverride("status")
  }, [open, step])

  const go = (s: Step) => setOverride(s)
  const next = (s: Step) => go(nextStep(s, selfieCheck))
  const active = step ? GROUPS.findIndex((g) => g.steps.includes(step)) : 0

  const card = (): React.ReactNode => {
    if (status.error) {
      const disabled = status.error instanceof ApiError && status.error.status === 503
      return (
        <StepCard title="Verification unavailable">
          <p className={disabled ? "text-sm text-soft" : "text-neg text-sm"}>
            {disabled
              ? "KYC is disabled on this API (no Sumsub credentials), so onboarding is not available."
              : `Could not read your status: ${status.error.message}`}
          </p>
        </StepCard>
      )
    }
    if (!step) {
      return (
        <div className="flex items-center justify-center py-24 text-soft">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span className="sr-only">Checking the status of {wallet && shortAddress(wallet)}…</span>
        </div>
      )
    }
    if (step === "welcome" || step === "signin") {
      return (
        <Welcome
          wallet={wallet}
          onSigned={(a) => {
            setAuth(a)
            next("signin")
          }}
        />
      )
    }
    if (step === "status" && wallet)
      return <StatusStep wallet={wallet} onRestart={() => go("welcome")} />
    // Every step in between needs the signature; a disconnect sends the user back here.
    if (!wallet || !auth) return <Welcome wallet={wallet} onSigned={setAuth} />
    if (step === "selfie")
      return <SelfieCheckStep wallet={wallet} onVerified={() => next("selfie")} />
    if (step === "profile") {
      return (
        <ProfileStep
          initial={profile}
          onDone={(p) => {
            setProfile(p)
            next("profile")
          }}
        />
      )
    }
    if (step === "declarations") {
      return profile ? (
        <Declarations
          auth={auth}
          profile={profile}
          onBack={() => go("profile")}
          onSignIn={() => go("signin")}
          onDone={(s) => {
            // The 202 carries the new status: the header badge flips to "Under review" now.
            queryClient.setQueryData(["kyc", wallet.toLowerCase()], s)
            next("declarations")
          }}
        />
      ) : (
        <ProfileStep initial={profile} onDone={setProfile} />
      )
    }
    return (
      <Identity auth={auth} onBack={() => go("declarations")} onDone={() => next("identity")} />
    )
  }

  return (
    <div className="min-h-dvh bg-[#dbe7fd] p-3 lg:bg-white lg:p-4">
      <div className="grid min-h-[calc(100dvh-2rem)] gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden rounded-3xl bg-[#dbe7fd] p-7 lg:sticky lg:top-4 lg:block lg:h-[calc(100dvh-2rem)]">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/favicons/black/android-chrome-192x192.png"
              alt="Sowee"
              width={32}
              height={32}
            />
            <span className="font-semibold text-[#111b3e] text-xl tracking-tight">Sowee</span>
          </Link>
          <ol className="relative mt-12 space-y-7">
            <span aria-hidden className="absolute top-5 bottom-5 left-[19px] w-px bg-[#b3c8ef]" />
            {GROUPS.map((g, i) => (
              <SideStep
                key={g.label}
                label={g.label}
                Icon={g.Icon}
                state={i < active ? "done" : i === active ? "active" : "todo"}
              />
            ))}
          </ol>
          <p className="mt-12 text-[#7285ad] text-[13px]">
            For questions, email{" "}
            <a href="mailto:support@sowee.site" className="underline">
              support@sowee.site
            </a>
          </p>
          <DecorBars />
        </aside>

        <div className="flex w-full flex-col pb-4 lg:pt-2">
          <div className="flex items-center justify-between gap-4 px-1 lg:px-2">
            <div className="flex items-center gap-2 lg:hidden">
              <Image
                src="/favicons/black/android-chrome-192x192.png"
                alt="Sowee"
                width={26}
                height={26}
              />
              <span className="font-semibold text-[#111b3e] text-lg tracking-tight">Sowee</span>
            </div>
            <span className="hidden lg:block" />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[#111b3e] text-[15px] hover:opacity-70"
            >
              Exit <X className="size-[18px]" aria-hidden />
            </Link>
          </div>

          {/* mobile progress bars */}
          <div className="mt-4 flex gap-2 px-1 lg:hidden" aria-hidden>
            {GROUPS.map((g, i) => (
              <span
                key={g.label}
                className={`h-2 flex-1 rounded-full ${
                  i < active ? "bg-[#9fbdf3]" : i === active ? "bg-[#3c5fce]" : "bg-[#e6e9f0]"
                }`}
              />
            ))}
          </div>

          <div className="mx-auto mt-5 w-full max-w-[680px] space-y-3 lg:mt-6">
            {GROUPS.map((g, i) =>
              i === active ? (
                <div key={g.label}>{card()}</div>
              ) : (
                <CollapsedStep
                  key={g.label}
                  index={i}
                  label={g.label}
                  Icon={g.Icon}
                  done={i < active}
                  // Data-entry steps reopen; the signature and the decision do not.
                  onEdit={
                    i < active && !open && ["profile", "declarations"].includes(g.steps[0])
                      ? () => go(g.steps[0])
                      : undefined
                  }
                />
              ),
            )}
          </div>

          <p className="mt-6 pb-4 text-center text-[#7285ad] text-[13px] lg:hidden">
            For questions, email{" "}
            <a href="mailto:support@sowee.site" className="underline">
              support@sowee.site
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------- steps --------------------------------- */

/** Intro plus the wallet sign-in: connect, then sign the API's challenge (no gas). */
function Welcome({ wallet, onSigned }: { wallet?: Address; onSigned: (a: KycAuth) => void }) {
  const { connect, connectors, isPending, error: connectError } = useConnect()
  const { signMessageAsync } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const sign = async () => {
    if (!wallet) return
    setBusy(true)
    setError(undefined)
    try {
      const c = await getChallenge(wallet)
      const signature = await signMessageAsync({ message: c.message })
      onSigned({ wallet: c.wallet, issuedAt: c.issuedAt, signature })
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepCard
      title="Welcome to Sowee"
      lede="Invest in compliant invoice bonds at any time. By regulation, we need to collect specific information before this wallet can hold bond units."
      footer={
        <FooterNav
          onNext={wallet ? sign : () => connect({ connector: connectors[0] })}
          nextLabel={wallet ? `Sign in as ${shortAddress(wallet)}` : "Connect Wallet"}
          busy={busy || isPending}
          busyLabel={busy ? "Confirm the signature in your wallet…" : "Connecting…"}
        />
      }
    >
      <div className="rounded-xl bg-[#f4f4f5] p-5 sm:p-6">
        <p className="text-[15px]">Getting on the allowlist takes about ten minutes:</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] text-body">
          <li>Sign a message with your wallet to prove you own it. No transaction, no gas.</li>
          <li>Tell us who you are and answer a short suitability questionnaire.</li>
          <li>Scan a government ID and take a liveness selfie with Sumsub.</li>
          <li>Once approved, eligibility is written to every bond on-chain.</li>
        </ol>
      </div>
      <p className="mt-4 text-sm text-soft">
        Your name, date of birth, documents and answers go to Sumsub and to Sowee&apos;s compliance
        service only. The chain holds one thing per wallet: eligible or not. No name, document, hash
        or answer is ever stored on-chain.
      </p>
      {(error || connectError) && <p className={errorText}>{error ?? connectError?.message}</p>}
    </StepCard>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

function CountrySelect(props: { id: string; name: string; defaultValue?: string }) {
  return (
    <select required className={inputClass} defaultValue={props.defaultValue ?? ""} {...props}>
      <option value="" disabled>
        Select…
      </option>
      {countries.map(([code, name]) => (
        <option key={code} value={code}>
          {name} ({code})
        </option>
      ))}
    </select>
  )
}

function ProfileStep({ initial, onDone }: { initial?: Profile; onDone: (p: Profile) => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onDone(Object.fromEntries(new FormData(e.currentTarget)) as Profile)
      }}
    >
      <StepCard
        title="Investor Profile"
        lede="Exactly as printed on the ID you will scan. Your country of residence decides which regulatory framework applies to you."
        footer={<FooterNav submit />}
      >
        <div className="space-y-4">
          <Field id="firstName" label="Legal First Name">
            <input
              id="firstName"
              name="firstName"
              required
              autoComplete="given-name"
              defaultValue={initial?.firstName}
              className={inputClass}
            />
          </Field>
          <Field id="lastName" label="Legal Last Name">
            <input
              id="lastName"
              name="lastName"
              required
              autoComplete="family-name"
              defaultValue={initial?.lastName}
              className={inputClass}
            />
          </Field>
          <Field id="dob" label="Date of Birth">
            <input
              id="dob"
              name="dob"
              type="date"
              required
              max={today()}
              defaultValue={initial?.dob}
              className={inputClass}
            />
          </Field>
          <Field id="country" label="Location of Residence">
            <CountrySelect id="country" name="country" defaultValue={initial?.country} />
          </Field>
        </div>
      </StepCard>
    </form>
  )
}

function Declarations({
  auth,
  profile,
  onBack,
  onSignIn,
  onDone,
}: {
  auth: KycAuth
  profile: Profile
  onBack: () => void
  onSignIn: () => void
  onDone: (status: KycStatus) => void
}) {
  const [other, setOther] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error>()

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const answers = Object.fromEntries(new FormData(e.currentTarget)) as Answers
    if (!other) delete answers["aml.source_other"]
    const missing = missingAnswers(answers)
    if (missing.length) {
      setError(new Error(`Please answer: ${missing.join(", ")}`))
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      onDone(await submitProfile(auth, profile, answers))
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setBusy(false)
    }
  }

  const expired = error instanceof ApiError && error.status === 401

  return (
    <form onSubmit={submit}>
      <StepCard
        title="Declarations"
        lede="These declarations are enforced: they are reviewed by the suitability policy together with the identity check, and false statements void your eligibility."
        footer={
          <FooterNav
            onBack={onBack}
            submit
            nextLabel="Submit declarations"
            busy={busy}
            busyLabel="Submitting…"
          />
        }
      >
        <div className="space-y-4">
          {questionnaire.map((q) => (
            <Field key={q.id} id={q.id} label={q.label}>
              {q.id === "jurisdiction.residence" ? (
                <CountrySelect id={q.id} name={q.id} defaultValue={profile.country} />
              ) : (
                <select
                  id={q.id}
                  name={q.id}
                  required
                  defaultValue=""
                  className={inputClass}
                  onChange={
                    q.id === "aml.source_of_funds"
                      ? (e) => setOther(e.target.value === "other")
                      : undefined
                  }
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {q.options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ))}
          {other && (
            <Field id="aml.source_other" label="Please describe the source of funds">
              <input
                id="aml.source_other"
                name="aml.source_other"
                required
                className={inputClass}
              />
            </Field>
          )}
        </div>
        {error && (
          <p className={errorText}>
            {error.message}{" "}
            {expired && (
              <button type="button" onClick={onSignIn} className="underline">
                Sign in again
              </button>
            )}
          </p>
        )}
      </StepCard>
    </form>
  )
}

/** The stacked-squares mark, floating gently (reduced-motion aware). */
function FloatingMark() {
  return (
    <div className="grid place-items-center py-2">
      <div className="animate-kyc-float relative size-14">
        <span aria-hidden className="absolute inset-0 translate-y-2 rounded-2xl bg-[#010334]" />
        <span aria-hidden className="absolute inset-0 translate-y-1 rounded-2xl bg-[#DFE0FF]" />
        <span aria-hidden className="absolute inset-0 translate-y-0.5 rounded-2xl bg-[#A7ABFE]" />
        <span className="absolute inset-0 grid place-items-center rounded-2xl bg-[#7379FD] font-bold text-2xl text-white">
          ✳
        </span>
      </div>
    </div>
  )
}

function Identity({
  auth,
  onBack,
  onDone,
}: {
  auth: KycAuth
  onBack: () => void
  onDone: () => void
}) {
  const [started, setStarted] = useState(false)
  const [token, setToken] = useState<string>()
  const [error, setError] = useState<string>()

  const start = () => {
    setStarted(true)
    setError(undefined)
    createSession(auth)
      .then(setToken)
      .catch((e) => setError(message(e)))
  }

  return (
    <StepCard
      title={started ? undefined : "Identity Verification"}
      lede={
        started
          ? undefined
          : "Our KYC, powered by Sumsub, protects you from fraud and identity theft while ensuring regulatory compliance. Please prepare the following items before starting."
      }
      footer={
        started ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {error && (
              <button type="button" onClick={start} className="text-sm underline">
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onDone}
              className="ml-auto text-sm text-soft underline hover:text-ink"
            >
              I have finished, show my status
            </button>
          </div>
        ) : (
          <FooterNav onBack={onBack} onNext={start} nextLabel="Start KYC" />
        )
      }
    >
      {!started ? (
        <div className="rounded-xl bg-[#f4f4f5] p-6 sm:p-8">
          <FloatingMark />
          <ul className="mt-6 space-y-5">
            <li className="flex gap-3.5">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-soft"
              >
                <UserSquare2 className="size-5" />
              </span>
              <div>
                <p className="font-medium text-base">Photo ID</p>
                <p className="mt-1 text-sm text-soft">
                  ID card, passport, driver license supported.
                </p>
              </div>
            </li>
            <li className="flex gap-3.5">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-soft"
              >
                <ScanFace className="size-5" />
              </span>
              <div>
                <p className="font-medium text-base">Facial Recognition</p>
                <p className="mt-1 text-sm text-soft">
                  Confirm that the portrait matches the picture on the identification document.
                </p>
              </div>
            </li>
          </ul>
          <p className="mt-6 text-sm text-soft">
            Sowee uses Sumsub, a secure, leading identity verification solution, to help us verify
            your identity. The process takes around 5 minutes — it runs in Sumsub&apos;s sandbox,
            the camera is used by Sumsub only, and only your eligibility status ever reaches the
            chain.
          </p>
        </div>
      ) : token ? (
        <SumsubWebSdk
          token={token}
          refreshToken={() => createSession(auth)}
          onSubmitted={onDone}
          onError={setError}
        />
      ) : error ? (
        <p className="text-neg text-sm">{error}</p>
      ) : (
        <p className="flex items-center gap-2 py-12 text-sm text-soft">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading verification…
        </p>
      )}
      {started && token && error && <p className={errorText}>{error}</p>}
    </StepCard>
  )
}

function StatusStep({ wallet, onRestart }: { wallet: Address; onRestart: () => void }) {
  const status = useKycStatus(wallet, 5000)
  if (!status.data) {
    return (
      <StepCard title="Identity Verification">
        <p className="flex items-center gap-2 text-sm text-soft">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading your status…
        </p>
      </StepCard>
    )
  }
  const { state, reason, grantTxs } = status.data
  const d = describeState(state)
  return (
    <StepCard title="Identity Verification">
      <div className="rounded-xl bg-[#f4f4f5] p-6">
        {state === "granted" ? (
          <div className="text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <BadgeCheck className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-semibold text-ink text-lg">You&apos;re verified</p>
            <p className="mt-1 text-sm text-soft">{d.detail}</p>
            <Link
              href="/"
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#141416] font-medium text-[15px] text-white transition-colors hover:bg-black"
            >
              Start investing <ArrowRight className="size-4" aria-hidden />
            </Link>
            {grantTxs && grantTxs.length > 0 && (
              <ul className="mt-4 space-y-1 text-left font-mono text-xs">
                {grantTxs.map((h) => (
                  <li key={h} className="truncate">
                    <a href={txUrl(h)} target="_blank" rel="noreferrer" className="underline">
                      {h}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <p
              className={`flex items-center gap-2 font-medium text-sm ${
                state === "blocked" ? "text-neg" : "text-ink"
              }`}
            >
              {state === "blocked" ? (
                <XCircle className="size-5 shrink-0" aria-hidden />
              ) : state === "none" ? null : (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              )}
              {d.title}
            </p>
            <p className="mt-2 text-sm text-soft">{d.detail}</p>
            {reason && <p className="mt-1 text-soft text-xs">Reason: {reason}.</p>}
            {(state === "pending" || state === "granting") && (
              <p className="mt-3 text-faint text-xs">The review updates here automatically.</p>
            )}
            {state === "none" && (
              <button
                type="button"
                onClick={onRestart}
                className="mt-4 rounded-full bg-ink px-4 py-2 font-medium text-sm text-white hover:bg-black"
              >
                Start verification
              </button>
            )}
          </>
        )}
      </div>
    </StepCard>
  )
}
