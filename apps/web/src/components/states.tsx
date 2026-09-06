import { activeChain } from "@/lib/chains"

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
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-medium text-sm">{title}</p>
      <p className="max-w-xs text-sm text-soft">{children}</p>
      {action && <div className="mt-1 flex justify-center">{action}</div>}
    </div>
  )
}

/** A read that failed. Never shows the raw error; the retry refetches. */
export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-medium text-sm">Could not read {what}.</p>
      <p className="max-w-xs text-sm text-soft">
        {activeChain.name} did not answer. Check your connection and try again.
      </p>
      <button
        type="button"
        className="mt-1 rounded-full border border-line px-4 py-2 font-medium text-sm hover:border-ink"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  )
}

const shimmer = "animate-pulse rounded-lg bg-shade"

/** Placeholder with the silhouette of a BondCard. */
export function SkeletonCard() {
  return (
    <div aria-hidden className="overflow-hidden rounded-3xl border border-line bg-white">
      <div className="flex items-center gap-3 p-5 pb-0">
        <div className="size-10 shrink-0 animate-pulse rounded-full bg-shade" />
        <div className="flex flex-col gap-1.5">
          <div className={`${shimmer} h-4 w-36`} />
          <div className={`${shimmer} h-3 w-28`} />
        </div>
      </div>
      <div className="px-5 pt-4">
        <div className={`${shimmer} h-8 w-32`} />
        <div className={`${shimmer} mt-2 h-3 w-44`} />
      </div>
      <div className={`${shimmer} mx-5 mt-2 mb-5 h-24 rounded-xl`} />
    </div>
  )
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
