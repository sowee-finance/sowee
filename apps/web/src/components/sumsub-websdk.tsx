"use client"

import { useEffect } from "react"

// Sumsub WebSDK from its CDN (no npm package): document capture and liveness run inside the
// iframe it mounts. `next.config.ts` allows static.sumsub.com in script-src and *.sumsub.com in
// frame-src / connect-src / img-src.

type Builder = {
  withConf(conf: { lang: string }): Builder
  withOptions(opts: { addViewportTag: boolean; adaptIframeHeight: boolean }): Builder
  on(event: string, handler: (payload?: unknown) => void): Builder
  build(): { launch(selector: string): void }
}

declare global {
  interface Window {
    snsWebSdk?: { init(token: string, refresh: () => Promise<string>): Builder }
  }
}

const src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js"
let loading: Promise<NonNullable<Window["snsWebSdk"]>> | undefined

function loadSdk() {
  if (window.snsWebSdk) return Promise.resolve(window.snsWebSdk)
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.onload = () =>
      window.snsWebSdk
        ? resolve(window.snsWebSdk)
        : reject(new Error("The Sumsub SDK loaded but did not initialise."))
    s.onerror = () => {
      loading = undefined
      reject(new Error("Could not load the Sumsub SDK. Check your connection and retry."))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function SumsubWebSdk({
  token,
  refreshToken,
  onSubmitted,
  onError,
}: {
  token: string
  /** Called by the SDK when the token expires; returns a fresh one from `/v1/kyc/session`. */
  refreshToken: () => Promise<string>
  onSubmitted: () => void
  onError: (message: string) => void
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: launches once per token
  useEffect(() => {
    let cancelled = false
    loadSdk()
      .then((sdk) => {
        if (cancelled) return
        sdk
          .init(token, refreshToken)
          .withConf({ lang: "en" })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .on("idCheck.onApplicantSubmitted", () => onSubmitted())
          .on("idCheck.onError", (e) => {
            const err = e as { code?: string; error?: string } | undefined
            onError(err?.error ?? err?.code ?? "The verification widget reported an error.")
          })
          .build()
          .launch("#sumsub-websdk-container")
      })
      .catch((e: Error) => onError(e.message))
    return () => {
      cancelled = true
    }
  }, [token])

  return <div id="sumsub-websdk-container" className="min-h-96" />
}
