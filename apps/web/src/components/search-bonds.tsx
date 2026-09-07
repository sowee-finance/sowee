"use client"

import { Search, TrendingUp, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { type Bond, bondStatus, type Contracts, dollars, impliedApr, pct } from "@/lib/market"
import { useBonds } from "@/lib/use-bonds"
import { BondAvatar, bondNames } from "./bond-card"
import { Sheet, TrendText, useOutsideClick } from "./ui"

/** Case-insensitive match on issuer, payor or symbol. */
export function matches(b: Bond, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const { issuer, payor } = bondNames(b)
  return [issuer, payor ?? "", b.symbol].some((t) => t.toLowerCase().includes(s))
}

function SuggestionRow({ bond, onSelect }: { bond: Bond; onSelect: () => void }) {
  const { issuer, payor } = bondNames(bond)
  const apr = impliedApr(bond)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-shade"
    >
      <BondAvatar bond={bond} className="size-9 text-xs" />
      <div className="min-w-0">
        <div className="truncate font-medium text-sm">{issuer}</div>
        <div className="truncate text-soft text-xs">{payor ? `Payor: ${payor}` : bond.symbol}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="tabular font-medium text-sm">{dollars(bond.faceValue)}</div>
        {apr !== undefined && (
          <TrendText trend="up" arrowSize={8} className="justify-end text-[11px]">
            {pct(apr)} APY
          </TrendText>
        )}
      </div>
    </button>
  )
}

/** Top-APY open bonds when the query is empty, live matches otherwise. */
function Suggestions({
  q,
  contracts,
  onSelect,
}: {
  q: string
  contracts?: Contracts
  onSelect: (bond: Bond) => void
}) {
  const { data } = useBonds(contracts)
  const trending = q.trim() === ""
  const bonds = (data ?? [])
    .filter((b) => (trending ? bondStatus(b) === "open" : matches(b, q)))
    .sort((a, b) => (impliedApr(b) ?? 0) - (impliedApr(a) ?? 0))
    .slice(0, 5)
  return (
    <div>
      {trending && (
        <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm text-soft">
          <TrendingUp size={15} />
          Trending
        </div>
      )}
      {bonds.map((b) => (
        <SuggestionRow key={b.invoiceId} bond={b} onSelect={() => onSelect(b)} />
      ))}
      {bonds.length === 0 && (
        <p className="px-2 py-4 text-sm text-soft">
          {trending ? "No bonds open for funding right now." : "No invoice bonds found."}
        </p>
      )}
    </div>
  )
}

/** Desktop: search input with a suggestions popover. */
export function HeaderSearch({
  contracts,
  className = "",
}: {
  contracts?: Contracts
  className?: string
}) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClick(ref, close, open)

  const go = (bond: Bond) => {
    setOpen(false)
    setQ("")
    router.push(`/invoices/${bond.invoiceId}`)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape/blur dismissal for the popover; the input is the interactive element
    <div
      ref={ref}
      className={`relative ${className}`}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setOpen(false)
          router.push(q ? `/?q=${encodeURIComponent(q)}` : "/")
        }}
      >
        <Search
          size={16}
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-4 text-soft"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          aria-label="Search invoice bonds"
          placeholder="Search invoice bonds"
          className="h-10 w-full rounded-full border border-transparent bg-shade pr-4 pl-10 text-sm outline-none placeholder:text-faint focus:border-ink"
        />
      </form>
      {open && (
        <div className="absolute inset-x-0 top-12 z-40 rounded-2xl border border-line bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <Suggestions q={q} contracts={contracts} onSelect={go} />
        </div>
      )}
    </div>
  )
}

/** Mobile: a search icon that opens a full sheet. */
export function MobileSearch({
  contracts,
  className = "",
}: {
  contracts?: Contracts
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const close = useCallback(() => setOpen(false), [])

  const go = (bond: Bond) => {
    setOpen(false)
    setQ("")
    router.push(`/invoices/${bond.invoiceId}`)
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-label="Search invoice bonds"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
      >
        <Search size={17} />
      </button>
      <Sheet
        open={open}
        onClose={close}
        closeLabel="Close search"
        panelClassName="flex max-h-[92svh] flex-col p-4"
      >
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-medium text-xl">Search</h2>
          <button
            type="button"
            aria-label="Close search"
            onClick={close}
            className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <Suggestions q={q} contracts={contracts} onSelect={go} />
        </div>
        <div className="relative pt-2">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-4 translate-y-[-30%] text-soft"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search issuer or payor"
            placeholder="Search issuer or payor"
            className="h-11 w-full rounded-xl border border-transparent bg-shade pr-4 pl-10 text-sm outline-none placeholder:text-faint focus:border-ink"
          />
        </div>
      </Sheet>
    </div>
  )
}
