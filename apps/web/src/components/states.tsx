import { activeChain } from "@/lib/chains"
import { secondary } from "./styles"

/** A list with nothing in it: what it would show, and the one action that fills it. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-zinc-300 border-dashed px-6 py-8 text-center dark:border-zinc-700">
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** A read that failed. Never shows the raw error; the retry refetches. */
export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-6 py-6 text-center dark:border-red-900 dark:bg-red-950/40">
      <p className="font-medium text-red-800 text-sm dark:text-red-200">Could not read {what}.</p>
      <p className="mt-1 text-red-700/80 text-sm dark:text-red-300/80">
        {activeChain.name} did not answer. Check your connection and try again.
      </p>
      <button type="button" className={`${secondary} mt-4 text-sm`} onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

const shimmer = "animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"

/** Placeholder with the silhouette of a BondCard. */
export function SkeletonCard() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex justify-between">
        <div className={`${shimmer} h-5 w-40`} />
        <div className={`${shimmer} h-4 w-12`} />
      </div>
      <div className="flex flex-col gap-2">
        {["a", "b", "c", "d", "e"].map((k) => (
          <div key={k} className="flex justify-between">
            <div className={`${shimmer} h-4 w-20`} />
            <div className={`${shimmer} h-4 w-24`} />
          </div>
        ))}
      </div>
      <div className={`${shimmer} h-1.5 w-full`} />
    </div>
  )
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical static placeholders
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

/** One-line placeholder for a table or a row of text while it loads. */
export function SkeletonLine({ className = "w-48" }: { className?: string }) {
  return <div aria-hidden className={`${shimmer} mt-2 h-4 ${className}`} />
}
