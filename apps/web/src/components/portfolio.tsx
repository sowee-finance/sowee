"use client"

import Link from "next/link"
import { formatUnits, type Hex } from "viem"
import { useAccount } from "wagmi"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { maturitySettlementAbi } from "@/lib/abi/maturitySettlement"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import {
  type Ask,
  askCost,
  bpsToPct,
  isMatured,
  maturityDate,
  type Position,
  usdc,
} from "@/lib/market"
import { useAsks, useBonds, usePositions } from "@/lib/use-bonds"
import { useTx } from "@/lib/use-tx"
import { KycNotice } from "./asks"
import { NotDeployed } from "./not-deployed"
import { EmptyState, ErrorState, SkeletonLine } from "./states"
import { box, errorText, primary, secondary } from "./styles"

export function Portfolio({ deployment }: { deployment?: Deployment }) {
  const { address, chainId } = useAccount()
  const wallet = address && chainId === activeChain.id ? address : undefined
  const positions = usePositions(deployment, wallet)
  const asks = useAsks(deployment?.invoiceMarket)
  const bonds = useBonds(deployment?.invoiceMarket)

  if (!deployment) return <NotDeployed />
  if (!wallet) {
    return (
      <div className="mt-6">
        <EmptyState title="No wallet connected">
          Connect a wallet on {activeChain.name} to see its bond units, open asks and claims.
        </EmptyState>
      </div>
    )
  }
  const mine = (asks.data ?? []).filter((a) => a.maker.toLowerCase() === wallet.toLowerCase())
  const nameOf = (id: Hex) => bonds.data?.find((b) => b.invoiceId === id)?.name ?? id

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className={box}>
        <h2 className="font-medium">Holdings</h2>
        {positions.isPending ? (
          <>
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-2/3" />
          </>
        ) : positions.error ? (
          <div className="mt-2">
            <ErrorState what="your holdings" onRetry={() => positions.refetch()} />
          </div>
        ) : positions.data.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              title="No positions yet"
              action={
                <Link href="/" className={primary}>
                  Browse the marketplace
                </Link>
              }
            >
              Units you buy or receive show up here with their settlement status.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-normal">Bond</th>
                  <th className="py-1 pr-3 font-normal">Units</th>
                  <th className="py-1 pr-3 font-normal">Face value</th>
                  <th className="py-1 pr-3 font-normal">Discount</th>
                  <th className="py-1 pr-3 font-normal">Maturity</th>
                  <th className="py-1 pr-3 font-normal">Eligible</th>
                  <th className="py-1 font-normal">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {positions.data.map((p) => (
                  <PositionRow key={p.bond.invoiceId} p={p} deployment={deployment} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={box}>
        <h2 className="font-medium">Your open asks</h2>
        {asks.isPending ? (
          <SkeletonLine className="w-full" />
        ) : asks.error ? (
          <div className="mt-2">
            <ErrorState what="your asks" onRetry={() => asks.refetch()} />
          </div>
        ) : mine.length === 0 ? (
          <div className="mt-2">
            <EmptyState title="No open asks">
              Sell units from a bond's page; asks you place stay listed here until filled or
              cancelled.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-normal">Bond</th>
                  <th className="py-1 pr-3 font-normal">Units</th>
                  <th className="py-1 pr-3 font-normal">Price / unit</th>
                  <th className="py-1 pr-3 font-normal">Total</th>
                  <th className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {mine.map((a) => (
                  <AskRow
                    key={a.askId}
                    ask={a}
                    name={nameOf(a.invoiceId)}
                    market={deployment.invoiceMarket}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function PositionRow({ p, deployment }: { p: Position; deployment: Deployment }) {
  const tx = useTx()
  const matured = isMatured(p.bond.maturity)
  return (
    <tr className="border-zinc-100 border-t align-top dark:border-zinc-800">
      <td className="py-2 pr-3">
        <Link href={`/invoices/${p.bond.invoiceId}`} className="hover:underline">
          {p.bond.name}
        </Link>{" "}
        <span className="font-mono text-xs text-zinc-500">{p.bond.symbol}</span>
      </td>
      <td className="py-2 pr-3">{formatUnits(p.units, 6)}</td>
      <td className="py-2 pr-3">{usdc(p.bond.faceValue)}</td>
      <td className="py-2 pr-3">{bpsToPct(p.bond.discountRateBps)}</td>
      <td className="py-2 pr-3">{maturityDate(p.bond.maturity)}</td>
      <td className="py-2 pr-3">{p.eligible ? "yes" : <KycNotice />}</td>
      <td className="py-2">
        {!matured ? (
          <span className="text-zinc-500">not matured</span>
        ) : p.claimable > 0n ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className={primary}
              disabled={tx.busy}
              onClick={() =>
                tx.send({
                  address: deployment.maturitySettlement,
                  abi: maturitySettlementAbi,
                  functionName: "claim",
                  args: [p.bond.invoiceId],
                })
              }
            >
              {tx.busy ? "Confirming…" : `Claim ${usdc(p.claimable)}`}
            </button>
            {tx.error && <span className={errorText}>{tx.error}</span>}
          </div>
        ) : (
          <span className="text-zinc-500">matured, awaiting repayment</span>
        )}
      </td>
    </tr>
  )
}

function AskRow({
  ask,
  name,
  market,
}: {
  ask: Ask
  name: string
  market: Deployment["invoiceMarket"]
}) {
  const tx = useTx()
  return (
    <tr className="border-zinc-100 border-t align-top dark:border-zinc-800">
      <td className="py-2 pr-3">
        <Link href={`/invoices/${ask.invoiceId}`} className="hover:underline">
          {name}
        </Link>
      </td>
      <td className="py-2 pr-3">{formatUnits(ask.units, 6)}</td>
      <td className="py-2 pr-3">{bpsToPct(Number(ask.priceBps))}</td>
      <td className="py-2 pr-3">{usdc(askCost(ask.units, ask.priceBps))}</td>
      <td className="py-2">
        <button
          type="button"
          className={secondary}
          disabled={tx.busy}
          onClick={() =>
            tx.send({
              address: market,
              abi: invoiceMarketAbi,
              functionName: "cancelAsk",
              args: [ask.askId],
            })
          }
        >
          {tx.busy ? "Confirming…" : "Cancel"}
        </button>
        {tx.error && <p className={`mt-1 ${errorText}`}>{tx.error}</p>}
      </td>
    </tr>
  )
}
