import type { Hex } from "viem"
import { explorerUrl } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"

/**
 * Some invoices are also issued as a security through Hedera's Asset Tokenization Studio: an
 * ERC-1400 with an ISIN and a regulation type on chain, next to the marketplace's own compliance
 * token. Shown only for invoices that have one.
 */
export function RegulatedIssuance({
  deployment,
  invoiceId,
}: {
  deployment?: Deployment
  invoiceId: Hex
}) {
  const ats = deployment?.atsBonds?.[invoiceId.toLowerCase()]
  if (!ats) return null
  const href = explorerUrl(ats.address)

  return (
    <section className="mt-12">
      <h2 className="font-medium text-xl">Regulated issuance</h2>
      <p className="mt-1 text-soft text-sm">
        This invoice is also issued as a security token through Hedera's Asset Tokenization Studio.
        Its units carry the same allowlist: an account has to pass KYC before it can hold one.
      </p>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        <Cell label="ISIN">
          <span className="font-mono text-[13px]">{ats.isin}</span>
        </Cell>
        <Cell label="Regulation">{ats.regulation}</Cell>
        <Cell label="Security token">
          {href ? (
            <a
              className="font-mono text-[13px] text-pos hover:underline"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {short(ats.address)} ↗
            </a>
          ) : (
            <span className="font-mono text-[13px]">{short(ats.address)}</span>
          )}
        </Cell>
      </dl>
    </section>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-soft text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  )
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
