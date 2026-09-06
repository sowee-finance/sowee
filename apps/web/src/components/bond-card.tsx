import Link from "next/link"
import { explorerUrl, shortAddress } from "@/lib/chains"
import {
  type Bond,
  bpsToPct,
  fundedPct,
  impliedApr,
  maturityDate,
  pct,
  relativeMaturity,
  usdc,
} from "@/lib/market"

export function BondCard({ bond }: { bond: Bond }) {
  const funded = fundedPct(bond)
  const apr = impliedApr(bond)
  const explorer = explorerUrl(bond.bond)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/invoices/${bond.invoiceId}`} className="font-medium hover:underline">
          {bond.name}
        </Link>
        <span className="font-mono text-xs text-zinc-500">{bond.symbol}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-500">Discount</dt>
        <dd className="text-right">{bpsToPct(bond.discountRateBps)}</dd>
        <dt className="text-zinc-500">Implied APR</dt>
        <dd className="text-right">{apr === undefined ? "—" : pct(apr)}</dd>
        <dt className="text-zinc-500">Face value</dt>
        <dd className="text-right">{usdc(bond.faceValue)}</dd>
        <dt className="text-zinc-500">Maturity</dt>
        <dd className="text-right">
          {maturityDate(bond.maturity)}
          <span className="block text-xs text-zinc-500">{relativeMaturity(bond.maturity)}</span>
        </dd>
        <dt className="text-zinc-500">Issuer</dt>
        <dd className="text-right font-mono text-xs" title={bond.issuer}>
          {shortAddress(bond.issuer)}
        </dd>
      </dl>
      <div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Funded</span>
          <span>{pct(funded)}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.min(funded, 100)}%` }} />
        </div>
      </div>
      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:underline"
        >
          View on HashScan
        </a>
      )}
    </div>
  )
}
