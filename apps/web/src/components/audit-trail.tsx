"use client"

import { CircleCheckBig, FileText, Fingerprint, Landmark } from "lucide-react"
import type { Hex } from "viem"
import { attestationsFor, consensusTime, hcsAvailable, topicId, topicUrl } from "@/lib/hcs"
import { useTopic } from "@/lib/use-hcs"
import { ErrorState, SkeletonLine } from "./states"
import { SectionTitle } from "./ui"

const ICONS: Record<string, typeof FileText> = {
  issued: Landmark,
  settled: CircleCheckBig,
  hashed: Fingerprint,
}

const label = (event: string) => event.charAt(0).toUpperCase() + event.slice(1).replace(/_/g, " ")

/** This bond's `attestation.v1` messages on the HCS topic, oldest first. Renders nothing off Hedera. */
export function AuditTrail({ invoiceId }: { invoiceId: Hex }) {
  if (!hcsAvailable) return null
  return <Panel invoiceId={invoiceId} />
}

function Panel({ invoiceId }: { invoiceId: Hex }) {
  const topic = useTopic()
  const rows = attestationsFor(topic.data ?? [], invoiceId).reverse()
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>HCS Audit Trail</SectionTitle>
        <a
          href={topicUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-soft text-xs hover:underline"
        >
          Topic {topicId}
        </a>
      </div>
      <p className="mt-1 text-soft text-xs">
        Lifecycle events and the invoice document&apos;s sha256, anchored on Hedera Consensus
        Service. The document itself never leaves the issuer&apos;s browser.
      </p>
      {topic.isPending ? (
        <>
          <SkeletonLine className="mt-4 w-full" />
          <SkeletonLine className="w-1/2" />
        </>
      ) : topic.error ? (
        <ErrorState what="the audit trail" onRetry={() => topic.refetch()} />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-soft">No attestations anchored for this invoice yet.</p>
      ) : (
        <ol className="mt-6">
          {rows.map((m, i) => {
            const Icon = ICONS[m.body.event] ?? FileText
            return (
              <li key={m.sequenceNumber} className="relative flex gap-4 pb-6 last:pb-0">
                {i < rows.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-9 left-[17px] h-[calc(100%-2.25rem)] w-px bg-line"
                  />
                )}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-soft">
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-sm">{label(m.body.event)}</span>
                    <a
                      href={topicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-faint hover:underline"
                    >
                      #{m.sequenceNumber}
                    </a>
                  </div>
                  <p className="mt-0.5 text-body text-sm" title={m.body.docHash}>
                    Attested &quot;{m.body.event}&quot; — doc sha256 {m.body.docHash.slice(0, 10)}…
                    {m.body.docHash.slice(-8)}
                  </p>
                  <div className="tabular mt-0.5 text-soft text-xs">
                    {consensusTime(m.consensusAt)}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
