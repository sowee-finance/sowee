"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { daysLeft, dollars, fundedPct, impliedApr } from "@/lib/bonds"

/** The page ships bigints as strings; everything below works from those. */
export type Row = {
  invoiceId: string
  issuer: string
  payor: string
  symbol: string
  faceValue: string
  supply: string
  discountRateBps: number
  maturity: number
}

const APP = "https://app.sowee.site"

/**
 * The reference this follows holds one screen at a time: a hero, then a scroll that hands the
 * screen to a single card floating on a light ground, with a spotlight that reveals a second
 * face of it under the cursor. The card here is a bond — a real listing, read from the market —
 * and the face the spotlight uncovers is the next one.
 *
 * The handover plays the reference's own clip: idle, then playing, then done. The card arrives
 * two seconds in rather than at the end, so the clip hands over to something already there.
 */
type Phase = "idle" | "playing" | "done"

export function Landing({ bonds }: { bonds: Row[] }) {
  const [phase, setPhase] = useState<Phase>("idle")
  // The card appears part way through the clip, not at the end of it, so the two are separate.
  const [shown, setShown] = useState(false)
  const [at, setAt] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  // The scroll handlers are bound once; a ref is how they read the phase they were not closed
  // over. A stale `phase` there would let a second scroll restart a clip already playing.
  const phaseRef = useRef<Phase>("idle")
  phaseRef.current = phase
  const stuck = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const finish = useCallback(() => {
    clearTimeout(stuck.current)
    setPhase("done")
    setShown(true)
  }, [])

  const play = useCallback(() => {
    if (phaseRef.current !== "idle") return
    // Nothing to sit through if the visitor asked for less motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish()
      return
    }
    setPhase("playing")
    setShown(false)
    const v = video.current
    if (!v) {
      finish()
      return
    }
    try {
      v.currentTime = 0
    } catch {}
    v.play()?.catch(finish)
    // The clip is 5s and large. If it stalls on a slow connection the visitor would be left
    // watching nothing, so the handover completes on its own either way.
    clearTimeout(stuck.current)
    stuck.current = setTimeout(finish, 8000)
  }, [finish])

  const reset = useCallback(() => {
    if (phaseRef.current !== "done") return
    clearTimeout(stuck.current)
    setPhase("idle")
    setShown(false)
    const v = video.current
    v?.pause()
    if (v) {
      try {
        v.currentTime = 0
      } catch {}
    }
  }, [])

  // Wheel, touch and the arrow keys drive the handover; the page itself never scrolls.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.deltaY > 0) play()
      else if (e.deltaY < 0) reset()
    }
    let startY: number | null = null
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      const dy = e.touches[0].clientY - startY
      if (dy < -40) {
        startY = null
        play()
      } else if (dy > 40) {
        startY = null
        reset()
      }
    }
    const onEnd = () => {
      startY = null
    }
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) play()
      if (["ArrowUp", "PageUp"].includes(e.key)) reset()
    }
    window.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("touchstart", onStart, { passive: true })
    window.addEventListener("touchmove", onMove, { passive: true })
    window.addEventListener("touchend", onEnd, { passive: true })
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("touchstart", onStart)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onEnd)
      window.removeEventListener("keydown", onKey)
    }
  }, [play, reset])

  useEffect(() => () => clearTimeout(stuck.current), [])

  // The spotlight and the grid drift toward the cursor rather than snapping to it. The reveal
  // layers are looked up each frame instead of held in refs: the card section remounts to replay
  // its entrance, and a ref taken before that points at a detached node.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Resting position, not off-screen: the light only follows a cursor once the page has
    // hydrated and the visitor has moved, and a section that is flat until then is the first
    // thing they see. Matches the fallback in `.reveal`.
    const rest = () => ({ x: window.innerWidth * 0.62, y: window.innerHeight * 0.46 })
    const target = rest()
    const at = rest()
    const drift = { x: 0, y: 0 }
    let seen = false
    let frame = 0
    const onMouse = (e: MouseEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!seen) {
        seen = true
        at.x = e.clientX
        at.y = e.clientY
      }
    }
    const onLeave = () => {
      const r = rest()
      target.x = r.x
      target.y = r.y
    }
    const tick = () => {
      at.x += (target.x - at.x) * 0.1
      at.y += (target.y - at.y) * 0.1
      const mx = `${at.x.toFixed(1)}px`
      const my = `${at.y.toFixed(1)}px`
      for (const el of document.querySelectorAll<HTMLElement>(".reveal")) {
        el.style.setProperty("--mx", mx)
        el.style.setProperty("--my", my)
      }
      const grid = document.getElementById("grid")
      if (seen && grid) {
        const w = window.innerWidth || 1
        const h = window.innerHeight || 1
        drift.x += ((at.x / w - 0.5) * 16 - drift.x) * 0.06
        drift.y += ((at.y / h - 0.5) * 16 - drift.y) * 0.06
        grid.setAttribute("x", drift.x.toFixed(2))
        grid.setAttribute("y", drift.y.toFixed(2))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener("mousemove", onMouse)
    window.addEventListener("mouseleave", onLeave)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("mouseleave", onLeave)
    }
  }, [])

  // Highest yield first: the card opens on the market's best offer.
  const sorted = [...bonds].sort((a, b) => (impliedApr(b) ?? 0) - (impliedApr(a) ?? 0))
  const front = sorted[at] ?? sorted[0]

  return (
    <div className="app" data-phase={phase} data-shown={shown} data-dark={shown}>
      <Nav dark={shown} />

      {/* ===== layer 1: the bond card ===== */}
      {/* Keyed on `shown` so the entrance replays every time the section is handed the screen,
          the way the reference re-runs its stagger. */}
      <section key={String(shown)} className="card-sec" aria-hidden={!shown}>
        <div className="card-sec__mark" aria-hidden="true">
          Sowee
        </div>

        {front ? (
          <>
            <div className="card-sec__card">
              <BondCard bond={front} />
            </div>
            {/* Light falling on the card, uncovered only where the cursor is. It is a wash over
                the one card rather than a second copy of it: two text layers in the same place
                rasterise a hair apart and the type ghosts. The mask lives out here, in viewport
                coordinates, because the card itself is rotated. */}
            <div className="reveal card-sec__card card-sec__reveal" aria-hidden="true">
              <div className="bond bond--lit" />
            </div>
            {sorted.length > 1 ? (
              <div className="card-dots stagger" style={{ animationDelay: ".9s" }}>
                {sorted.map((b, i) => (
                  <button
                    key={b.invoiceId}
                    type="button"
                    className="card-dot"
                    data-on={i === at}
                    aria-label={`Show ${b.symbol}`}
                    aria-current={i === at}
                    tabIndex={shown ? 0 : -1}
                    onClick={() => setAt(i)}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="card-sec__top">
          <h2 className="stagger" style={{ animationDelay: ".15s" }}>
            Listed right now
          </h2>
          <a
            className="pill stagger"
            href={APP}
            style={{ animationDelay: ".3s" }}
            tabIndex={shown ? 0 : -1}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            {sorted.length ? `All ${sorted.length} bonds` : "All bonds"}
          </a>
        </div>

        <div className="card-sec__bottom">
          <div
            className="card-sec__bottom-l card-sec__copy stagger"
            style={{ animationDelay: ".7s" }}
          >
            {front ? (
              <p>
                {front.issuer} is owed {dollars(BigInt(front.faceValue))} by{" "}
                {front.payor || "a customer"}, and does not want to wait for it. The invoice is a
                bond investors can fund today and the issuer is paid now. Every figure on the card
                is read live from the market contract.
              </p>
            ) : (
              <p>
                The market is not answering right now. Every figure on this page is read from the
                chain, so rather than show numbers we made up, it shows none.
              </p>
            )}
            <a className="btn btn--dark" href={APP} tabIndex={shown ? 0 : -1}>
              Open the marketplace
            </a>
          </div>
          <div className="card-sec__bottom-r">
            <h2 className="card-sec__h2-right stagger" style={{ animationDelay: ".5s" }}>
              Before It Is Paid
            </h2>
          </div>
        </div>
      </section>

      {/* ===== layer 2: the transition, played across the handover ===== */}
      <video
        ref={video}
        className="transition-video"
        muted
        playsInline
        preload="auto"
        src="/transition.mp4"
        // No controls and nothing to read: it is scenery, so it is out of the tab order too.
        tabIndex={-1}
        aria-hidden="true"
        onTimeUpdate={(e) => {
          // The card arrives part way through rather than at the end, so the clip hands over to
          // something already there instead of cutting to it.
          if (e.currentTarget.currentTime >= 2) setShown(true)
        }}
        onEnded={finish}
        onError={finish}
      />

      {/* ===== layer 3: hero ===== */}
      <section className="hero" aria-hidden={shown}>
        {/* biome-ignore lint/performance/noImgElement: one full-bleed background, already sized */}
        <img className="hero__bg" src="/hero-1.webp" alt="" />
        <svg className="hero__grid" aria-hidden="true">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#8fd0aa" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* The second frame, uncovered only where the cursor is. */}
        <div className="reveal hero__reveal" />
        <div className="hero__fade" aria-hidden="true" />

        <div className="hero__content">
          <div className="hero__left">
            <div className="hero__eyebrow anim-stagger" style={{ animationDelay: ".3s" }}>
              <span className="hero__dot" aria-hidden="true" />
              <span>Live on Hedera testnet</span>
            </div>
            <h1 className="anim-stagger" style={{ animationDelay: ".5s" }}>
              Invoices, funded
              <br />
              before they are paid
            </h1>
            <div className="hero__btns anim-stagger" style={{ animationDelay: ".7s" }}>
              <a className="btn btn--primary" href={APP} tabIndex={shown ? -1 : 0}>
                Open the marketplace
              </a>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setShown(true)}
                tabIndex={shown ? -1 : 0}
              >
                See what is listed
              </button>
            </div>
          </div>
          <div className="hero__right">
            <p className="hero__copy anim-stagger" style={{ animationDelay: ".85s" }}>
              A business that finishes a job waits 30 to 90 days to be paid. Sowee turns that
              invoice into a bond investors fund today — and the identity check that decides who may
              hold one is enforced by the token itself.
            </p>
          </div>
        </div>
      </section>

      <div className="hint" aria-hidden="true">
        {shown ? "Scroll up to go back" : "Scroll to see what is listed"}
      </div>
    </div>
  )
}

/** A listing, drawn as the card it is: face value, what it yields, and who owes it. */
function BondCard({ bond }: { bond: Row }) {
  const apr = impliedApr(bond)
  const funded = fundedPct({ supply: BigInt(bond.supply), faceValue: BigInt(bond.faceValue) })
  const days = daysLeft(bond.maturity)
  return (
    <a className="bond bond--dark" href={`${APP}/invoices/${bond.invoiceId}`}>
      <div className="bond__head">
        <span className="bond__mark">Sowee</span>
        <span className="bond__sym">{bond.symbol}</span>
      </div>
      <div className="bond__chip" aria-hidden="true" />
      <div className="bond__face">{dollars(BigInt(bond.faceValue))}</div>
      <div className="bond__meta">
        <span>{apr === undefined ? "Matured" : `${apr.toFixed(2)}% APY`}</span>
        <span>{funded.toFixed(0)}% funded</span>
        <span>{days > 0 ? `${days}D left` : "Due"}</span>
      </div>
      <div className="bond__foot">
        <span className="bond__party">{bond.issuer}</span>
        <span className="bond__payor">{bond.payor ? `Payor: ${bond.payor}` : " "}</span>
      </div>
    </a>
  )
}

function Nav({ dark }: { dark: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
  const links = [
    { href: `${APP}`, label: "Marketplace" },
    { href: `${APP}/portfolio`, label: "Portfolio" },
    { href: `${APP}/issuer`, label: "Issuer" },
    { href: "https://github.com/sowee-finance/sowee", label: "GitHub" },
  ]
  return (
    <>
      <nav className="nav" data-dark={dark} aria-label="Primary">
        <a className="nav__brand" href="/">
          <span>Sowee</span>
        </a>
        <div className="nav__center">
          {links.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="nav__right">
          <a className="nav__cta" href={APP}>
            Open the app
          </a>
        </div>
        <button
          className="nav__burger"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <>
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </>
            ) : (
              <>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* A button, not a div: the scrim is a real way to close the menu, so it takes focus and
          the keyboard like one. */}
      <button
        className="menu-overlay"
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close menu"
        data-open={open}
        onClick={() => setOpen(false)}
      />
      <div className="menu-panel" data-open={open}>
        {links.map((l, i) => (
          <a
            key={l.label}
            className="menu-panel__link"
            href={l.href}
            style={{ transitionDelay: `${80 + i * 40}ms` }}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </a>
        ))}
        <div className="menu-panel__foot">
          <a className="btn btn--primary" href={APP} style={{ transitionDelay: "300ms" }}>
            Open the app
          </a>
        </div>
      </div>
    </>
  )
}
