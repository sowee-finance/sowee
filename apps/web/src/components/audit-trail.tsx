"use client"

import type { Hex } from "viem"
import { attestationsFor, consensusTime, hcsAvailable, topicId, topicUrl } from "@/lib/hcs"
import { useTopic } from "@/lib/use-hcs"
import { EmptyState, ErrorState, SkeletonLine } from "./states"
import { box } from "./styles"

/** This bond's `attestation.v1` messages on the HCS topic. Renders nothing off Hedera. */
export function AuditTrail({ invoiceId }: { invoiceId: Hex }) {
  if (!hcsAvailable) return null
  return <Panel invoiceId={invoiceId} />
}

function Panel({ invoiceId }: { invoiceId: Hex }) {
  const topic = useTopic()
  const rows = attestationsFor(topic.data ?? [], invoiceId)
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-medium text-lg">Audit trail</h2>
        <a
          href={topicUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:underline"
        >
          Topic {topicId} on HashScan ↗
        </a>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Lifecycle events and the invoice document's sha256, anchored on Hedera Consensus Service.
        The document itself never leaves the issuer's browser.
      </p>
      <div className={`mt-4 ${box}`}>
        {topic.isPending ? (
          <>
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-1/2" />
          </>
        ) : topic.error ? (
          <ErrorState what="the audit trail" onRetry={() => topic.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No attestations yet">
            The issuer's document hash is anchored right after listing; events for this invoice will
            appear here.
          </EmptyState>
        ) : (
          <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((m) => (
              <li
                key={m.sequenceNumber}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
              >
                <span className="rounded-full border border-emerald-300 px-2 py-0.5 font-medium text-emerald-700 text-xs capitalize dark:border-emerald-800 dark:text-emerald-400">
                  {m.body.event}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {consensusTime(m.consensusAt)}
                </span>
                <span className="font-mono text-xs text-zinc-500" title={m.body.docHash}>
                  sha256 {m.body.docHash.slice(0, 8)}…{m.body.docHash.slice(-6)}
                </span>
                <a
                  href={topicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto font-mono text-xs text-zinc-500 hover:underline"
                >
                  #{m.sequenceNumber} ↗
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
