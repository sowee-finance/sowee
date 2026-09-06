"use client"

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
  missingAnswers,
  nextStep,
  type Profile,
  questionnaire,
  type Step,
  steps,
  submitProfile,
} from "@/lib/kyc"
import { useKycStatus } from "@/lib/use-kyc"
import { SelfieCheckStep } from "./selfie-check-step"
import { box, errorText, input, primary, secondary, warnText } from "./styles"
import { SumsubWebSdk } from "./sumsub-websdk"

// World Selfie Check is only offered once the app has access (see selfie-check-step.tsx).
const selfieCheck = !!process.env.NEXT_PUBLIC_WORLD_APP_ID

const message = (e: unknown) => (e instanceof Error ? describeError(e) : String(e))

export function KycWizard() {
  const { address, isConnected } = useAccount()
  const wallet = isConnected ? address : undefined
  const status = useKycStatus(wallet)
  const [override, setOverride] = useState<Step>()
  const [auth, setAuth] = useState<KycAuth>()
  const [profile, setProfile] = useState<Profile>()

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

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Progress current={step} />
      {status.error ? (
        <p className={box}>
          <span
            className={
              status.error instanceof ApiError && status.error.status === 503 ? warnText : errorText
            }
          >
            {status.error instanceof ApiError && status.error.status === 503
              ? "KYC is disabled on this API (no Sumsub credentials), so onboarding is not available."
              : `Could not read your status: ${status.error.message}`}
          </span>
        </p>
      ) : !step ? (
        <p className={`${box} text-zinc-500`}>
          Checking the status of {wallet && shortAddress(wallet)}…
        </p>
      ) : step === "welcome" ? (
        <Welcome onNext={() => next("welcome")} />
      ) : step === "signin" ? (
        <SignIn
          wallet={wallet}
          onSigned={(a) => {
            setAuth(a)
            next("signin")
          }}
        />
      ) : step === "status" && wallet ? (
        <StatusStep wallet={wallet} onRestart={() => go("welcome")} />
      ) : !wallet || !auth ? (
        // Every step in between needs the signature; a disconnect sends the user back here.
        <SignIn wallet={wallet} onSigned={setAuth} />
      ) : step === "selfie" ? (
        <SelfieCheckStep wallet={wallet} onVerified={() => next("selfie")} />
      ) : step === "profile" ? (
        <ProfileStep
          initial={profile}
          onDone={(p) => {
            setProfile(p)
            next("profile")
          }}
        />
      ) : step === "declarations" ? (
        profile ? (
          <Declarations
            auth={auth}
            profile={profile}
            onBack={() => go("profile")}
            onSignIn={() => go("signin")}
            onDone={() => next("declarations")}
          />
        ) : (
          <ProfileStep initial={profile} onDone={(p) => setProfile(p)} />
        )
      ) : (
        <Identity auth={auth} onDone={() => next("identity")} />
      )}
    </div>
  )
}

function Progress({ current }: { current?: Step }) {
  const at = steps.findIndex(([s]) => s === current)
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {steps.map(([id, label], i) => (
        <li
          key={id}
          aria-current={id === current ? "step" : undefined}
          className={
            id === current
              ? "font-medium text-zinc-900 dark:text-zinc-100"
              : i < at
                ? "text-emerald-600"
                : "text-zinc-400"
          }
        >
          {i + 1}. {label}
          {id === "selfie" && !selfieCheck && " (coming soon)"}
        </li>
      ))}
    </ol>
  )
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <section className={box}>
      <h2 className="font-medium">Before you start</h2>
      <p className="mt-2">
        Bond units can only be held by wallets on the allowlist. Getting there takes about ten
        minutes:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Sign a message with your wallet to prove you own it. No transaction, no gas.</li>
        <li>Tell us who you are and answer a short suitability questionnaire.</li>
        <li>Scan a government ID and take a liveness selfie with Sumsub.</li>
        <li>Once approved, eligibility is written to every bond on-chain.</li>
      </ol>
      <p className="mt-3 text-zinc-500">
        Your name, date of birth, documents and answers go to Sumsub and to Sowee's compliance
        service only. The chain holds one thing per wallet: eligible or not. No name, document, hash
        or answer is ever stored on-chain.
      </p>
      <button type="button" className={`${primary} mt-4`} onClick={onNext}>
        Get started
      </button>
    </section>
  )
}

function SignIn({ wallet, onSigned }: { wallet?: Address; onSigned: (a: KycAuth) => void }) {
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
    <section className={box}>
      <h2 className="font-medium">Sign in with your wallet</h2>
      <p className="mt-1 text-zinc-500">
        The signature ties your verification to this wallet. It is kept in this tab for an hour and
        never sent anywhere except Sowee's API.
      </p>
      <div className="mt-3 flex items-center gap-3">
        {wallet ? (
          <button type="button" className={primary} disabled={busy} onClick={sign}>
            {busy ? "Waiting for the wallet…" : `Sign as ${shortAddress(wallet)}`}
          </button>
        ) : (
          <button
            type="button"
            className={primary}
            disabled={isPending}
            onClick={() => connect({ connector: connectors[0] })}
          >
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        )}
        {(error || connectError) && (
          <span className={errorText}>{error ?? connectError?.message}</span>
        )}
      </div>
    </section>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

function ProfileStep({ initial, onDone }: { initial?: Profile; onDone: (p: Profile) => void }) {
  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault()
        onDone(Object.fromEntries(new FormData(e.currentTarget)) as Profile)
      }}
    >
      <h2 className="font-medium">Profile</h2>
      <p className="mt-1 text-zinc-500">Exactly as printed on the ID you will scan.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field id="firstName" label="First name">
          <input
            id="firstName"
            name="firstName"
            required
            autoComplete="given-name"
            defaultValue={initial?.firstName}
            className={input}
          />
        </Field>
        <Field id="lastName" label="Last name">
          <input
            id="lastName"
            name="lastName"
            required
            autoComplete="family-name"
            defaultValue={initial?.lastName}
            className={input}
          />
        </Field>
        <Field id="dob" label="Date of birth">
          <input
            id="dob"
            name="dob"
            type="date"
            required
            max={today()}
            defaultValue={initial?.dob}
            className={input}
          />
        </Field>
        <Field id="country" label="Country of residence">
          <CountrySelect id="country" name="country" defaultValue={initial?.country} />
        </Field>
      </div>
      <button type="submit" className={`${primary} mt-4`}>
        Continue
      </button>
    </form>
  )
}

function CountrySelect(props: { id: string; name: string; defaultValue?: string }) {
  return (
    <select required className={input} defaultValue={props.defaultValue ?? ""} {...props}>
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
  onDone: () => void
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
      await submitProfile(auth, profile, answers)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setBusy(false)
    }
  }

  const expired = error instanceof ApiError && error.status === 401

  return (
    <form className={box} onSubmit={submit}>
      <h2 className="font-medium">Declarations</h2>
      <p className="mt-1 text-zinc-500">
        Every answer is required. They are reviewed by the suitability policy together with the
        identity check; answering honestly is the only way to be granted.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                className={input}
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
            <input id="aml.source_other" name="aml.source_other" required className={input} />
          </Field>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={secondary} disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="submit" className={primary} disabled={busy}>
          {busy ? "Submitting…" : "Submit declarations"}
        </button>
        {error && <span className={errorText}>{error.message}</span>}
        {expired && (
          <button type="button" className={secondary} onClick={onSignIn}>
            Sign in again
          </button>
        )}
      </div>
    </form>
  )
}

function Identity({ auth, onDone }: { auth: KycAuth; onDone: () => void }) {
  const [token, setToken] = useState<string>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    setError(undefined)
    createSession(auth)
      .then(setToken)
      .catch((e) => setError(message(e)))
  }, [auth, attempt])

  return (
    <section className={box}>
      <h2 className="font-medium">Identity</h2>
      <p className="mt-1 text-zinc-500">
        Scan your ID and take a selfie in the Sumsub frame below. The camera is used by Sumsub only;
        nothing is uploaded to Sowee.
      </p>
      <div className="mt-3">
        {token ? (
          <SumsubWebSdk
            token={token}
            refreshToken={() => createSession(auth)}
            onSubmitted={onDone}
            onError={setError}
          />
        ) : error ? null : (
          <p className="text-zinc-500">Preparing the verification widget…</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {error && (
          <>
            <span className={errorText}>{error}</span>
            <button type="button" className={secondary} onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </>
        )}
        <button type="button" className={secondary} onClick={onDone}>
          I have finished, show my status
        </button>
      </div>
    </section>
  )
}

function StatusStep({ wallet, onRestart }: { wallet: Address; onRestart: () => void }) {
  const status = useKycStatus(wallet, 5000)
  if (!status.data) {
    return <p className={`${box} text-zinc-500`}>Reading your status…</p>
  }
  const { state, reason, grantTxs } = status.data
  const d = describeState(state)
  const tone =
    state === "granted"
      ? "text-emerald-600"
      : state === "blocked"
        ? "text-red-600"
        : "text-amber-700 dark:text-amber-400"
  return (
    <section className={box}>
      <h2 className="font-medium">
        Status: <span className={tone}>{d.title}</span>
      </h2>
      <p className="mt-1">{d.detail}</p>
      {reason && <p className="mt-1 text-xs text-zinc-500">Reason: {reason}.</p>}
      {state === "granted" && (
        <>
          <p className="mt-3">
            <Link href="/" className={primary}>
              Go to the marketplace
            </Link>
          </p>
          {grantTxs && grantTxs.length > 0 && (
            <ul className="mt-3 space-y-1 font-mono text-xs">
              {grantTxs.map((h) => (
                <li key={h}>
                  <a href={txUrl(h)} target="_blank" rel="noreferrer" className="underline">
                    {h}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {state === "none" && (
        <button type="button" className={`${secondary} mt-3`} onClick={onRestart}>
          Start verification
        </button>
      )}
      {(state === "pending" || state === "granting") && (
        <p className="mt-3 text-xs text-zinc-400">Refreshing every 5 seconds.</p>
      )}
    </section>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  )
}
