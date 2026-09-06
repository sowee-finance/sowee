"use client"

import Link from "next/link"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { hcsAvailable, isReceipt } from "@/lib/hcs"
import { type Bond, impliedApr, pct, usdcAmount } from "@/lib/market"
import { useBonds } from "@/lib/use-bonds"
import { useTopic } from "@/lib/use-hcs"
import { BondCard } from "./bond-card"
import { NotDeployed } from "./not-deployed"
import { EmptyState, ErrorState, SkeletonGrid } from "./states"
import { primary } from "./styles"

export function Marketplace({ deployment }: { deployment?: Deployment }) {
  if (!deployment) return <NotDeployed />
  return <Listings market={deployment.invoiceMarket} />
}

function Listings({ market }: { market: Deployment["invoiceMarket"] }) {
  const { data, error, isPending, refetch } = useBonds(market)
  return (
    <>
      <Stats bonds={data} />
      <h2 className="mt-8 mb-4 font-medium text-lg">Open for funding</h2>
      {isPending ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorState what="the market" onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="No bonds listed yet"
          action={
            <Link href="/issuer/new" className={primary}>
              Tokenize an invoice
            </Link>
          }
        >
          The first invoice tokenized on {activeChain.name} will show up here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((b) => (
            <BondCard key={b.invoiceId} bond={b} />
          ))}
        </div>
      )}
    </>
  )
}

/** Four live numbers from the same reads the list makes, plus the paid-call count from HCS. */
function Stats({ bonds }: { bonds?: Bond[] }) {
  const topic = useTopic()
  const funded = bonds?.reduce((s, b) => s + b.supply, 0n)
  const best = bonds
    ?.map((b) => ({ b, apr: impliedApr(b) }))
    .filter((x): x is { b: Bond; apr: number } => x.apr !== undefined)
    .sort((x, y) => y.apr - x.apr)[0]
  const calls = topic.data?.filter(isReceipt).length
  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Bonds listed" value={bonds?.length} hint="live on the market contract" />
      <Tile
        label="USDC funded"
        value={funded === undefined ? undefined : usdcAmount(funded)}
        hint="units minted across every bond"
      />
      <Tile
        label="Best implied APR"
        value={bonds && (best ? pct(best.apr) : "—")}
        hint={best ? `${best.b.symbol}, simple, discount over tenor` : "nothing open right now"}
      />
      {hcsAvailable && (
        <Tile
          label="x402 calls paid"
          value={topic.error ? "—" : calls}
          hint="market-insights receipts on the HCS topic"
        />
      )}
    </dl>
  )
}

function Tile({ label, value, hint }: { label: string; value?: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-2xl tabular-nums">
        {value === undefined ? (
          <span
            aria-hidden
            className="block h-8 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
          />
        ) : (
          value
        )}
      </dd>
      <dd className="mt-1 truncate text-xs text-zinc-500" title={hint}>
        {hint}
      </dd>
    </div>
  )
}
