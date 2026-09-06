"use client"

import { ChevronDown } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { accountUrl, explorerUrl, shortAddress, txUrl } from "@/lib/chains"
import { type BondStatus, statusLabel } from "@/lib/market"

// Shared design-system primitives: identity marks, badges, popovers, sheets and the
// section idioms every page is built from.

/* ---------------------------------- hooks ---------------------------------- */

/** Calls `onOutside` when a mousedown lands outside `ref` (popover dismiss). */
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside()
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [ref, onOutside, active])
}

/* ---------------------------------- marks ---------------------------------- */

/** Curated 2-tone palettes (gradient stops + foreground) for generated company marks. */
const PALETTES = [
  { a: "#0c2d1d", b: "#14663c", fg: "#eafff3" },
  { a: "#101d3b", b: "#2b4d9e", fg: "#eaf1ff" },
  { a: "#3b1020", b: "#8f2d4e", fg: "#ffeaf1" },
  { a: "#2c1b0a", b: "#8a5a1d", fg: "#fff4e0" },
  { a: "#0b2b2e", b: "#1d7a72", fg: "#e6fffb" },
  { a: "#221038", b: "#5d3a9b", fg: "#f1eaff" },
  { a: "#33250b", b: "#a08114", fg: "#fffbe6" },
  { a: "#131313", b: "#4a4a4a", fg: "#f2f2f2" },
  { a: "#0f2f16", b: "#3f8f2d", fg: "#efffe9" },
  { a: "#301616", b: "#a04c2d", fg: "#ffefe9" },
]

function hashName(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = (h * 33) ^ name.charCodeAt(i)
  return h >>> 0
}

const SKIP = new Set(["PT", "CV", "UD"])

/**
 * Deterministic mark for a company name: same name, same mark, everywhere it appears. No real
 * logos are used; the letter is the first of the distinctive word (skips PT/CV/UD prefixes).
 */
export function CompanyAvatar({
  name,
  className = "size-10 text-sm",
}: {
  name: string
  className?: string
}) {
  const h = hashName(name)
  const p = PALETTES[h % PALETTES.length]
  const motif = Math.floor(h / PALETTES.length) % 6
  const words = name.split(" ").filter(Boolean)
  const letter = (words.find((w) => !SKIP.has(w.toUpperCase())) ?? words[0] ?? "?")[0].toUpperCase()
  const gid = `g${h.toString(36)}`
  return (
    <span aria-hidden className={`flex shrink-0 overflow-hidden rounded-full ${className}`}>
      <svg className="h-full w-full" role="presentation" viewBox="0 0 40 40">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.b} />
            <stop offset="100%" stopColor={p.a} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill={`url(#${gid})`} />
        {motif === 0 && <circle cx="30" cy="10" r="14" fill={p.fg} opacity="0.16" />}
        {motif === 1 && (
          <g fill={p.fg} opacity="0.18">
            <rect x="6" y="24" width="6" height="12" rx="1.5" />
            <rect x="15" y="18" width="6" height="18" rx="1.5" />
            <rect x="24" y="12" width="6" height="24" rx="1.5" />
          </g>
        )}
        {motif === 2 && <path d="M-4 30 20 14l24 16v14H-4z" fill={p.fg} opacity="0.15" />}
        {motif === 3 && (
          <g fill="none" stroke={p.fg} opacity="0.22" strokeWidth="2">
            <circle cx="20" cy="20" r="15" />
            <circle cx="20" cy="20" r="9" />
          </g>
        )}
        {motif === 4 && (
          <g fill={p.fg} opacity="0.2">
            {[8, 20, 32].map((x) =>
              [8, 20, 32].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" />),
            )}
          </g>
        )}
        {motif === 5 && <path d="M0 40 40 0v12L12 40H0z" fill={p.fg} opacity="0.16" />}
        <text
          x="20"
          y="26.5"
          textAnchor="middle"
          fontFamily="var(--font-sans)"
          fontSize="18"
          fontWeight="600"
          fill={p.fg}
        >
          {letter}
        </text>
      </svg>
    </span>
  )
}

/** The connected-wallet identicon (blue radial orb); size via className. */
/**
 * The connected wallet's mark. Derived from the address so a person recognises their own account
 * wherever it appears, and identical in the header and on the portfolio. Falls back to a plain
 * disc before a wallet is connected, when there is no address to derive anything from.
 */
export function WalletAvatar({
  address,
  className = "",
}: {
  address?: string
  className?: string
}) {
  if (!address) {
    return (
      <span
        className={`inline-block shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#7fb2ff_0%,#2f6fed_45%,#1b2f6e_100%)] ${className}`}
      />
    )
  }
  return <CompanyAvatar name={address} className={`${className} text-[9px]`} />
}

export function UsdcIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#2775ca" />
      <path
        d="M13 25.2a10 10 0 0 1 0-18.4M19 6.8a10 10 0 0 1 0 18.4"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <text
        x="16"
        y="20.6"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        $
      </text>
    </svg>
  )
}

export function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7 0-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .6 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
        fill="currentColor"
      />
    </svg>
  )
}

/* ---------------------------------- trend ---------------------------------- */

export type Trend = "up" | "down" | "flat"

// CSS tokens from globals.css; SVG attributes cannot resolve var(), so fills are literal.
export const TREND_COLOR: Record<Trend, string> = {
  up: "var(--color-pos)",
  down: "var(--color-neg)",
  flat: "var(--color-faint)",
}
export const TREND_FILL: Record<Trend, string> = {
  up: "#1DA66A",
  down: "#E5484D",
  flat: "#9CA1A6",
}

/** Funding and accretion only ever rise; matured and settled sit at neutral gray. */
export const STATUS_TREND: Record<BondStatus, Trend> = {
  open: "up",
  funded: "up",
  matured: "flat",
  settled: "flat",
}

function TrendArrow({ dir, size = 10 }: { dir: "up" | "down"; size?: number }) {
  return (
    <svg
      viewBox="0 0 9 8"
      width={size}
      height={size * 0.89}
      style={dir === "down" ? { transform: "rotate(180deg)" } : undefined}
      aria-hidden="true"
    >
      <path
        d="M3.557 1.034c.408-.579 1.278-.579 1.686 0l3.373 4.783c.471.669-.016 1.583-.844 1.583H1.028c-.828 0-1.315-.914-.844-1.583z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Trend-colored change row: arrow + tabular mono text. */
export function TrendText({
  trend,
  arrowSize = 10,
  className = "",
  children,
}: {
  trend: Trend
  arrowSize?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`tabular flex items-center gap-1.5 font-mono ${className}`}
      style={{ color: TREND_COLOR[trend] }}
    >
      {trend !== "flat" && <TrendArrow dir={trend} size={arrowSize} />}
      {children}
    </div>
  )
}

/* --------------------------------- badges ---------------------------------- */

/** Status badge: a dot + text-sm font-medium, green while funding, gray otherwise. */
export function StatusBadge({
  status,
  className = "",
}: {
  status: BondStatus
  className?: string
}) {
  const active = status === "open"
  return (
    <span
      className={`flex items-center gap-1.5 whitespace-nowrap font-medium text-sm ${
        active ? "text-pos" : "text-soft"
      } ${className}`}
    >
      <span className={`size-1.5 rounded-full ${active ? "bg-pos" : "bg-faint"}`} />
      {statusLabel[status]}
    </span>
  )
}

/** Thin funding-progress bar (0-100). */
export function Progress({ pct, className = "" }: { pct: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-shade ${className}`}
    >
      <div className="h-full rounded-full bg-pos" style={{ width: `${clamped}%` }} />
    </div>
  )
}

/* -------------------------------- popovers --------------------------------- */

export type DropdownOption = { value: string; label: React.ReactNode }

export function Dropdown({
  value,
  options,
  onChange,
  buttonClassName = "",
}: {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClick(ref, close, open)
  const current = options.find((o) => o.value === value)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape dismissal for the popover; the trigger button is the interactive element
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 ${buttonClassName}`}
      >
        {current?.label ?? value}
        <ChevronDown size={15} strokeWidth={2} className="text-soft" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 min-w-44 rounded-2xl border border-line bg-white py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10)]">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-shade ${
                o.value === value ? "font-medium text-ink" : "text-body"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const EXIT_MS = 200 // keep in sync with duration-200 below

/**
 * Bottom sheet with slide-up/fade transitions, portalled to <body> so the sticky header's
 * stacking context cannot paint over it. Locks body scroll and closes on Escape.
 */
export function Sheet({
  open,
  onClose,
  closeLabel,
  className = "",
  panelClassName = "",
  children,
}: {
  open: boolean
  onClose: () => void
  closeLabel: string
  className?: string
  panelClassName?: string
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  // Mount in the same pass the sheet opens so the panel exists before the enter transition.
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      // Double rAF: the panel must paint off-screen once before the class flips.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(raf)
    }
    const raf = requestAnimationFrame(() => setShown(false))
    const t = setTimeout(() => setMounted(false), EXIT_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [open])

  if (!mounted) return null
  return createPortal(
    <div className={`fixed inset-0 z-50 ${className}`} role="dialog" aria-modal>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl bg-white transition-transform duration-200 ease-out motion-reduce:transition-none ${
          shown ? "translate-y-0" : "translate-y-full"
        } ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------- sections --------------------------------- */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-5 ${className}`}>
      {children}
    </section>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-medium text-xl tracking-tight">{children}</h2>
}

/**
 * A short address that goes to the explorer. Every address on a page is a thing a reader may want
 * to check, so they all behave the same way rather than some being links and some being text.
 */
export function AddressLink({
  address,
  kind = "contract",
  className = "font-mono text-[13px]",
}: {
  address: string
  kind?: "contract" | "account"
  className?: string
}) {
  const href = kind === "account" ? accountUrl(address) : explorerUrl(address)
  if (!href) return <span className={className}>{shortAddress(address)}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={address}
      className={`${className} hover:underline`}
    >
      {shortAddress(address)} ↗
    </a>
  )
}

export function KVRow({
  label,
  children,
  info,
}: {
  label: React.ReactNode
  children: React.ReactNode
  info?: string
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-line border-b py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-soft" title={info}>
        {label}
        {info && (
          <span className="inline-grid size-3.5 place-items-center rounded-full border border-faint text-[9px] text-faint">
            i
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right font-medium text-sm">
        {children}
      </span>
    </div>
  )
}

export function StatTile({
  icon,
  name,
  value,
  tint,
}: {
  icon: React.ReactNode
  name: string
  value: string
  tint: string
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${tint}`}>
      {icon}
      <div>
        <div className="font-medium text-soft text-xs">{name}</div>
        <div className="tabular font-medium text-sm">{value}</div>
      </div>
    </div>
  )
}

/** Centered empty state inside a card. */
export function Empty({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon size={22} className="text-faint" strokeWidth={1.5} />
      <p className="max-w-xs text-sm text-soft">{children}</p>
    </div>
  )
}

/** Amount box: label, a big bare input and a token chip on the right. */
export function AmountPanel({
  label,
  value,
  onChange,
  tokenChip,
  readOnly = false,
  inputMode = "decimal",
  placeholder = "0",
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  tokenChip: React.ReactNode
  readOnly?: boolean
  inputMode?: "decimal" | "numeric"
  placeholder?: string
}) {
  return (
    <div className="rounded-2xl bg-[#f6f6f4] p-4">
      <div className="text-soft text-xs">{label}</div>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value.replace(/[^0-9.]/g, ""))}
          readOnly={readOnly}
          inputMode={inputMode}
          placeholder={placeholder}
          aria-label={label}
          className="tabular w-full min-w-0 bg-transparent font-medium text-[28px] outline-none placeholder:text-faint"
        />
        {tokenChip}
      </div>
    </div>
  )
}

export function TokenChip({
  icon,
  children,
}: {
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pr-3 font-medium text-sm ${
        icon ? "pl-1.5" : "pl-3"
      }`}
    >
      {icon}
      {children}
    </span>
  )
}

export const UsdcChip = () => <TokenChip icon={<UsdcIcon size={22} />}>USDC</TokenChip>

export const blackPill =
  "rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
export const blackButton =
  "flex h-12 w-full items-center justify-center rounded-xl bg-ink text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
export const pillInput =
  "h-11 w-full rounded-full border border-line bg-white px-4 text-sm outline-none placeholder:text-faint focus:border-ink"

/** Result strip under an action: busy label, error, confirmation and the explorer link. */
export function TxStatus({
  tx,
  done = "Transaction confirmed.",
}: {
  tx: { busy: boolean; error?: string; confirmed: boolean; hash?: `0x${string}` }
  done?: string
}) {
  if (!tx.busy && !tx.error && !tx.confirmed) return null
  const link = tx.hash && txUrl(tx.hash)
  return (
    <div className="mt-3 text-xs" role="status">
      {tx.busy && <p className="text-soft">Confirm in your wallet, then wait for the receipt…</p>}
      {tx.confirmed && <p className="font-medium text-pos">{done}</p>}
      {tx.error && (
        <p className="break-words text-neg" role="alert">
          {tx.error}
        </p>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block underline hover:text-ink"
        >
          View transaction on the explorer
        </a>
      )}
    </div>
  )
}
