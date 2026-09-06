"use client"

import { FileCheck2, Search } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { activeChain, networkBrand } from "@/lib/chains"
import {
  type Bond,
  type BondStatus,
  bondStatus,
  bpsToPct,
  type Contracts,
  dollars,
  impliedApr,
  pct,
  tenorDays,
} from "@/lib/market"
import { useBonds } from "@/lib/use-bonds"
import { BondCard, bondNames } from "./bond-card"
import { NotDeployed } from "./not-deployed"
import { matches } from "./search-bonds"
import { ErrorState, SkeletonGrid } from "./states"
import { CompanyAvatar, Dropdown, TrendText } from "./ui"

/* ----------------------------------- hero ---------------------------------- */

function Hero() {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl bg-hero text-white">
      <div className="relative flex flex-col justify-between gap-8 bg-[radial-gradient(120%_180%_at_85%_-20%,#14663c_0%,transparent_55%)] p-8 md:flex-row md:items-center md:p-10">
        <div className="max-w-xl">
          <h1 className="font-medium text-2xl tracking-tight md:text-[32px] md:leading-tight">
            Compliant Invoice Financing on {networkBrand}
          </h1>
          <p className="mt-2 text-[#8fd0aa] text-sm md:text-[15px]">
            Issuers tokenize unpaid invoices as compliant bonds. Investors fund them at a discount
            in USDC and trade them on a compliant secondary market — settlement is automatic at
            maturity.
          </p>
          <Link
            href="/issuer/new"
            className="mt-5 inline-block rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-white/20"
          >
            Tokenize an Invoice
          </Link>
        </div>
        <div className="flex items-center gap-6 pr-2 md:pr-8">
          <FileCheck2
            strokeWidth={1.2}
            className="h-28 w-28 text-[#7ed4a0] md:h-36 md:w-36"
            aria-hidden
          />
          <div className="whitespace-nowrap font-medium text-3xl tracking-tight md:text-4xl">
            Paid at <span className="text-[#7ed4a0]">maturity</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------- top lists -------------------------------- */

const SECONDARY = {
  apy: (b: Bond) => {
    const apr = impliedApr(b)
    return apr === undefined ? null : (
      <TrendText trend="up" arrowSize={8} className="justify-end text-[11px]">
        {pct(apr)} APY
      </TrendText>
    )
  },
  maturity: (b: Bond) => (
    <span className="tabular whitespace-nowrap text-soft text-xs">
      {Math.max(tenorDays(b.maturity), 0)}d to maturity
    </span>
  ),
  newest: (b: Bond) => (
    <span className="tabular whitespace-nowrap text-soft text-xs">
      {bpsToPct(b.discountRateBps)} discount
    </span>
  ),
} as const

function Row({ bond, secondary }: { bond: Bond; secondary: (b: Bond) => React.ReactNode }) {
  const { issuer, payor } = bondNames(bond)
  return (
    <Link
      href={`/invoices/${bond.invoiceId}`}
      className="flex items-center gap-3 py-4 hover:bg-shade/50"
    >
      <CompanyAvatar name={issuer} className="size-10 text-sm" />
      <div className="min-w-0">
        <div className="truncate font-medium text-[15px]">{issuer}</div>
        <div className="truncate text-sm text-soft">{payor ? `Payor: ${payor}` : bond.symbol}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="tabular font-medium text-[15px]">{dollars(bond.faceValue)}</div>
        <div className="mt-0.5 flex justify-end">{secondary(bond)}</div>
      </div>
    </Link>
  )
}

function RowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 py-4">
      <div className="size-10 shrink-0 animate-pulse rounded-full bg-shade" />
      <div className="flex flex-col gap-1.5">
        <div className="h-4 w-36 animate-pulse rounded bg-shade" />
        <div className="h-3 w-28 animate-pulse rounded bg-shade" />
      </div>
      <div className="ml-auto flex flex-col items-end gap-1.5">
        <div className="h-4 w-16 animate-pulse rounded bg-shade" />
        <div className="h-3 w-20 animate-pulse rounded bg-shade" />
      </div>
    </div>
  )
}

function Column({
  title,
  badge,
  bonds,
  loading,
  secondary,
}: {
  title: string
  badge?: string
  bonds: Bond[]
  loading: boolean
  secondary: (b: Bond) => React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 border-line border-b pb-3">
        <h2 className="font-medium text-2xl tracking-tight">{title}</h2>
        {badge && (
          <span className="rounded-md bg-shade px-1.5 py-0.5 font-medium text-[10px] text-soft">
            {badge}
          </span>
        )}
      </div>
      <div className="divide-y divide-line">
        {loading ? (
          ["r1", "r2", "r3"].map((k) => <RowSkeleton key={k} />)
        ) : bonds.length === 0 ? (
          <p className="py-4 text-sm text-soft">Nothing here yet.</p>
        ) : (
          bonds.map((b) => <Row key={b.invoiceId} bond={b} secondary={secondary} />)
        )}
      </div>
    </div>
  )
}

function TopLists({ bonds, loading }: { bonds: Bond[]; loading: boolean }) {
  const open = bonds.filter((b) => bondStatus(b) === "open")
  const byApy = [...open].sort((a, b) => (impliedApr(b) ?? 0) - (impliedApr(a) ?? 0)).slice(0, 3)
  const byMaturity = bonds
    .filter((b) => ["open", "funded"].includes(bondStatus(b)))
    .sort((a, b) => a.maturity - b.maturity)
    .slice(0, 3)
  // Listings are read in issue order, so the newest are the last ones.
  const byNewest = [...bonds].reverse().slice(0, 3)
  return (
    <section className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
      <Column
        title="Top Yields"
        badge="APY"
        bonds={byApy}
        loading={loading}
        secondary={SECONDARY.apy}
      />
      <Column
        title="Maturing Soon"
        bonds={byMaturity}
        loading={loading}
        secondary={SECONDARY.maturity}
      />
      <Column
        title="Newly Issued"
        bonds={byNewest}
        loading={loading}
        secondary={SECONDARY.newest}
      />
    </section>
  )
}

/* --------------------------------- explore --------------------------------- */

const CHIPS: { id: BondStatus | "all"; label: string }[] = [
  { id: "all", label: "All bonds" },
  { id: "open", label: "Funding" },
  { id: "funded", label: "Funded" },
  { id: "matured", label: "Matured" },
  { id: "settled", label: "Settled" },
]

type Sort = "apy" | "maturity" | "size" | "newest"
const SORTS: { id: Sort; label: string }[] = [
  { id: "apy", label: "Highest APY" },
  { id: "maturity", label: "Maturity: Soonest" },
  { id: "size", label: "Face Value: Largest" },
  { id: "newest", label: "Recently Issued" },
]

const PAGE_SIZE = 6

/** Marketplace filter/sort over the on-chain listings (newest = highest listing index). */
export function filterBonds(
  source: Bond[],
  opts: { q?: string; status?: BondStatus | "all"; sort?: Sort },
): Bond[] {
  const indexed = source.map((b, i) => ({ b, i }))
  let rows = indexed.filter(({ b }) => matches(b, opts.q ?? ""))
  if (opts.status && opts.status !== "all") {
    rows = rows.filter(({ b }) => bondStatus(b) === opts.status)
  } else {
    // A settled invoice has been repaid and its units burned: there is nothing left to fund or
    // trade, so it is history rather than an offer. It stays reachable under the Settled chip.
    rows = rows.filter(({ b }) => bondStatus(b) !== "settled")
  }
  switch (opts.sort) {
    case "maturity":
      rows.sort((x, y) => x.b.maturity - y.b.maturity)
      break
    case "size":
      rows.sort((x, y) =>
        y.b.faceValue > x.b.faceValue ? 1 : y.b.faceValue < x.b.faceValue ? -1 : 0,
      )
      break
    case "newest":
      rows.sort((x, y) => y.i - x.i)
      break
    default:
      rows.sort((x, y) => (impliedApr(y.b) ?? -1) - (impliedApr(x.b) ?? -1))
  }
  return rows.map(({ b }) => b)
}

/** Page numbers with gaps: 1 2 … c-1 c c+1 … n-1 n. Gap tokens are `…<previous page>`. */
function pageNumbers(current: number, pages: number): string[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => String(i + 1))
  const wanted = new Set([1, 2, current - 1, current, current + 1, pages - 1, pages])
  const nums = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push(`…${nums[i - 1]}`)
    out.push(String(nums[i]))
  }
  return out
}

function Pagination({
  current,
  pages,
  goTo,
}: {
  current: number
  pages: number
  goTo: (p: number) => void
}) {
  return (
    <nav aria-label="Pagination" className="mx-auto flex items-center gap-1">
      <button
        type="button"
        disabled={current === 1}
        onClick={() => goTo(current - 1)}
        className="px-3 py-2 text-body text-sm disabled:opacity-40"
      >
        Previous
      </button>
      {pageNumbers(current, pages).map((n) =>
        n.startsWith("…") ? (
          <span key={n} className="px-2 text-faint text-sm">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => goTo(Number(n))}
            aria-current={Number(n) === current ? "page" : undefined}
            className={`size-9 rounded-full text-sm ${
              Number(n) === current ? "bg-ink font-medium text-white" : "text-body hover:bg-shade"
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={current >= pages}
        onClick={() => goTo(current + 1)}
        className="px-3 py-2 text-body text-sm disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}

function Explore({
  initialQuery = "",
  bonds,
  loading,
  error,
  onRetry,
}: {
  initialQuery?: string
  bonds: Bond[]
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const [q, setQ] = useState(initialQuery)
  const [chip, setChip] = useState<BondStatus | "all">("all")
  const [sort, setSort] = useState<Sort>("apy")
  const [page, setPage] = useState(1)
  const sectionRef = useRef<HTMLElement>(null)

  const filtered = filterBonds(bonds, { q, status: chip, sort })
  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, pages)
  const items = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const start = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1
  const end = Math.min(current * PAGE_SIZE, total)

  const goTo = (p: number) => {
    setPage(p)
    sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })
  }

  return (
    <section ref={sectionRef} className="mt-14 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-2xl tracking-tight">Explore Invoice Bonds</h2>
      </div>

      <div className="relative mt-5">
        <Search
          size={16}
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-4 text-soft"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          aria-label="Search issuer or payor"
          placeholder="Search issuer or payor"
          className="h-11 w-full rounded-full border border-line bg-white pr-4 pl-10 text-sm outline-none placeholder:text-faint focus:border-ink"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setChip(c.id)
                setPage(1)
              }}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors ${
                chip === c.id
                  ? "border-ink bg-ink font-medium text-white"
                  : "border-line text-body hover:border-faint"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Dropdown
          value={sort}
          onChange={(v) => {
            setSort(v as Sort)
            setPage(1)
          }}
          options={SORTS.map((o) => ({ value: o.id, label: o.label }))}
          buttonClassName="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-faint"
        />
      </div>

      {loading ? (
        <div className="mt-6">
          <SkeletonGrid count={6} />
        </div>
      ) : error ? (
        <ErrorState what="the market" onRetry={onRetry} />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => (
            <BondCard key={b.invoiceId} bond={b} />
          ))}
        </div>
      )}

      {!loading && !error && total === 0 && (
        <p className="py-16 text-center text-sm text-soft">
          {bonds.length === 0
            ? `No invoice bonds are listed on ${activeChain.name} yet. New listings appear here the moment they hit the chain.`
            : "No bonds match your search or filters."}
        </p>
      )}

      {!loading && total > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <span className="tabular text-sm text-soft">
            {start}-{end} of {total}
          </span>
          <Pagination current={current} pages={pages} goTo={goTo} />
        </div>
      )}
    </section>
  )
}

/* ----------------------------------- page ---------------------------------- */

export function Marketplace({ contracts }: { contracts?: Contracts }) {
  if (!contracts) return <NotDeployed />
  return <Listings contracts={contracts} />
}

function Listings({ contracts }: { contracts: Contracts }) {
  const q = useSearchParams().get("q") ?? ""
  const { data, error, isPending, refetch } = useBonds(contracts)
  const all = data ?? []
  return (
    <>
      <Hero />
      <TopLists bonds={all} loading={isPending} />
      <Explore
        key={q}
        initialQuery={q}
        bonds={all}
        loading={isPending}
        error={!!error}
        onRetry={() => refetch()}
      />
    </>
  )
}
