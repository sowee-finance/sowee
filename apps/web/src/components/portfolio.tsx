"use client"

import { ArrowLeftRight, ShieldCheck, Wallet } from "lucide-react"
import Link from "next/link"
import { formatUnits, type Hex } from "viem"
import { useAccount, useSwitchChain } from "wagmi"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { maturitySettlementAbi } from "@/lib/abi/maturitySettlement"
import { activeChain, shortAddress } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { describeState } from "@/lib/kyc"
import {
  type Ask,
  askCost,
  bondStatus,
  bpsToPct,
  dollars,
  holdingsCurve,
  impliedApr,
  maturityDate,
  type Position,
  pct,
} from "@/lib/market"
import { useAsks, useBonds, usePositions } from "@/lib/use-bonds"
import { useKycStatus } from "@/lib/use-kyc"
import { useTx } from "@/lib/use-tx"
import { BondAvatar, bondNames } from "./bond-card"
import { PriceChart } from "./charts"
import { NotDeployed } from "./not-deployed"
import { ErrorState } from "./states"
import {
  blackPill,
  Card,
  ChainChip,
  Empty,
  STATUS_TREND,
  StatusBadge,
  TxStatus,
  WalletAvatar,
} from "./ui"
import { ConnectPrompt } from "./wallet-button"

export function Portfolio({ deployment }: { deployment?: Deployment }) {
  const { address, chainId } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const wallet = address && chainId === activeChain.id ? address : undefined
  const positions = usePositions(deployment, wallet)
  const asks = useAsks(deployment?.invoiceMarket)
  const bonds = useBonds(deployment)

  if (!deployment) return <NotDeployed />
  if (!address) {
    return (
      <ConnectPrompt icon={Wallet} title="Connect your wallet">
        Connect a wallet to view your invoice bond holdings and claimable settlements in one place.
      </ConnectPrompt>
    )
  }
  if (!wallet) {
    return (
      <div className="flex flex-col items-center gap-4 py-32 text-center">
        <Wallet size={28} className="text-faint" strokeWidth={1.5} />
        <h1 className="font-medium text-2xl tracking-tight">Wrong network</h1>
        <p className="max-w-sm text-sm text-soft">
          Your holdings live on {activeChain.name}. Switch the wallet to see them.
        </p>
        <button
          type="button"
          disabled={switching}
          onClick={() => switchChain({ chainId: activeChain.id })}
          className={`${blackPill} mt-2 px-6`}
        >
          {switching ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      </div>
    )
  }

  const rows = positions.data ?? []
  const faceHeld = rows.reduce((s, p) => s + p.units, 0n)
  const claimable = rows.reduce((s, p) => s + p.claimable, 0n)
  const curve = holdingsCurve(rows)
  // Neutral once nothing is still accreting, the way STATUS_TREND treats a single bond: a green
  // rising line over a flat series claims a climb that is not happening.
  const _trend = rows.some((p) => STATUS_TREND[bondStatus(p.bond)] === "up") ? "up" : "flat"
  const mine = (asks.data ?? []).filter((a) => a.maker.toLowerCase() === wallet.toLowerCase())
  const nameOf = (id: Hex) => {
    const b = bonds.data?.find((x) => x.invoiceId === id)
    return b ? `${bondNames(b).issuer} ${b.symbol}` : shortAddress(id)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3 py-8">
        <div className="flex items-center gap-3">
          <WalletAvatar className="size-9" />
          <h1 className="font-medium text-xl tracking-tight">Welcome, {shortAddress(wallet)}</h1>
        </div>
        <ChainChip className="text-sm" />
      </div>

      <Card>
        <div className="text-sm text-soft">Face value held</div>
        <div className="tabular mt-1 font-medium text-4xl tracking-tight">
          {positions.isPending ? "…" : dollars(faceHeld)}
        </div>
        <div className="tabular mt-3 font-mono text-soft text-xs">
          {positions.isPending ? "…" : dollars(claimable)} claimable · {rows.length} bond
          {rows.length === 1 ? "" : "s"} held
        </div>
        {curve.length > 1 && (
          <>
            <div className="mt-5">
              <PriceChart points={curve} trend="up" />
            </div>
            <p className="mt-2 text-[11px] text-faint">
              What the units you hold are worth from today to maturity. Each unit is 1 USDC of face
              bought at a discount, so it accretes to par — this is the bond&apos;s own arithmetic,
              not a traded price.
            </p>
          </>
        )}
      </Card>

      {rows.some((p) => p.claimable > 0n) && (
        <Card className="mt-6">
          <h2 className="font-medium text-[15px]">Claimable Settlements</h2>
          <div className="mt-3 flex flex-col gap-2">
            {rows
              .filter((p) => p.claimable > 0n)
              .map((p) => (
                <ClaimRow key={p.bond.invoiceId} p={p} deployment={deployment} />
              ))}
          </div>
        </Card>
      )}

      <KycPanel wallet={wallet} />

      <Card className="mt-6">
        <h2 className="font-medium text-[15px]">My Holdings</h2>
        {positions.isPending ? (
          <div className="mt-4 h-32 animate-pulse rounded-xl bg-shade" />
        ) : positions.error ? (
          <ErrorState what="your holdings" onRetry={() => positions.refetch()} />
        ) : rows.length === 0 ? (
          <Empty icon={Wallet}>
            No invoice bond holdings for this wallet yet — fund an invoice from the marketplace to
            get started.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-line border-b text-soft text-xs">
                  <th className="py-2.5 pr-4 font-medium">Bond</th>
                  <th className="py-2.5 pr-4 font-medium">Face held</th>
                  <th className="py-2.5 pr-4 font-medium">Discount</th>
                  <th className="py-2.5 pr-4 font-medium">Implied APY</th>
                  <th className="py-2.5 pr-4 font-medium">Maturity</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <HoldingRow key={p.bond.invoiceId} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="font-medium text-[15px]">Your Open Asks</h2>
        {asks.isPending ? (
          <div className="mt-4 h-16 animate-pulse rounded-xl bg-shade" />
        ) : asks.error ? (
          <ErrorState what="your asks" onRetry={() => asks.refetch()} />
        ) : mine.length === 0 ? (
          <Empty icon={ArrowLeftRight}>
            No open asks. Sell units from a bond&apos;s page; asks you place stay listed here until
            filled or cancelled.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-line border-b text-soft text-xs">
                  <th className="py-2.5 pr-4 font-medium">Bond</th>
                  <th className="py-2.5 pr-4 font-medium">Units</th>
                  <th className="py-2.5 pr-4 font-medium">Price / unit</th>
                  <th className="py-2.5 pr-4 font-medium">Proceeds</th>
                  <th className="py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
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
      </Card>
    </div>
  )
}

/** Verification state for the connected wallet; the full journey lives at /kyc. */
function KycPanel({ wallet }: { wallet: `0x${string}` }) {
  const status = useKycStatus(wallet)
  if (!status.data) return null
  // A verified wallet has nothing to do here: the badge is already in the header, and the card
  // would sit above the holdings repeating a state the person just finished reaching.
  if (status.data.state === "granted") return null
  const { state, reason } = status.data
  const d = describeState(state)
  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          <ShieldCheck className="size-4 text-soft" aria-hidden />
          Identity verification
        </h2>
      </div>
      <p className={`mt-3 text-sm ${state === "blocked" ? "text-neg" : "text-soft"}`}>
        {state === "none"
          ? "Verify once (document + liveness) and this wallet becomes eligible on every live listing — enforced at the token layer."
          : `${d.title}: ${d.detail}${reason ? ` (${reason})` : ""}`}
      </p>
      {state === "none" && (
        <Link href="/kyc" className={`${blackPill} mt-4 inline-flex px-4 py-2`}>
          Start verification
        </Link>
      )}
    </Card>
  )
}

function ClaimRow({ p, deployment }: { p: Position; deployment: Deployment }) {
  const tx = useTx()
  const { issuer } = bondNames(p.bond)
  return (
    <div className="rounded-xl bg-pos/5 p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <BondAvatar bond={p.bond} className="size-8 text-[10px]" />
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">
            {issuer} <span className="font-mono text-soft text-xs">{p.bond.symbol}</span>
          </div>
          <div className="text-soft text-xs">Matured {maturityDate(p.bond.maturity)}</div>
        </div>
        <div className="tabular ml-auto font-medium text-sm">{dollars(p.claimable)}</div>
        <button
          type="button"
          disabled={tx.busy}
          onClick={() =>
            tx.send({
              address: deployment.maturitySettlement,
              abi: maturitySettlementAbi,
              functionName: "claim",
              args: [p.bond.invoiceId],
            })
          }
          className="rounded-full bg-ink px-4 py-2 font-medium text-white text-xs hover:bg-black disabled:opacity-60"
        >
          {tx.busy ? "Claiming…" : "Claim"}
        </button>
      </div>
      <TxStatus tx={tx} done="Payout claimed." />
    </div>
  )
}

function HoldingRow({ p }: { p: Position }) {
  const status = bondStatus(p.bond)
  const apr = impliedApr(p.bond)
  const { issuer } = bondNames(p.bond)
  return (
    <tr>
      <td className="py-3 pr-4">
        <Link
          href={`/invoices/${p.bond.invoiceId}`}
          className="flex items-center gap-2.5 hover:underline"
        >
          <BondAvatar bond={p.bond} className="size-7 text-[9px]" />
          <span className="font-medium">{issuer}</span>
          <span className="font-mono text-soft text-xs">{p.bond.symbol}</span>
        </Link>
        {!p.eligible && (
          <Link href="/kyc" className="mt-1 block text-amber-700 text-xs underline">
            Not on the allowlist — complete KYC to trade
          </Link>
        )}
      </td>
      <td className="tabular py-3 pr-4">{dollars(p.units)}</td>
      <td className="tabular py-3 pr-4">{bpsToPct(p.bond.discountRateBps)}</td>
      <td className="tabular py-3 pr-4">{apr === undefined ? "—" : pct(apr)}</td>
      <td className="tabular py-3 pr-4">{maturityDate(p.bond.maturity)}</td>
      <td className="py-3 pr-4">
        <StatusBadge status={status} />
      </td>
      <td className="py-3 text-right">
        {(status === "open" || status === "funded") && (
          <Link
            href={`/invoices/${p.bond.invoiceId}#market`}
            className="rounded-full border border-line px-3 py-1.5 font-medium text-soft text-xs hover:text-ink"
          >
            Sell
          </Link>
        )}
        {status === "matured" && p.claimable === 0n && (
          <span className="text-soft text-xs">awaiting repayment</span>
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
    <tr>
      <td className="py-3 pr-4">
        <Link href={`/invoices/${ask.invoiceId}#market`} className="hover:underline">
          {name}
        </Link>
      </td>
      <td className="tabular py-3 pr-4">{formatUnits(ask.units, 6)}</td>
      <td className="tabular py-3 pr-4">${(Number(ask.priceBps) / 10_000).toFixed(4)}</td>
      <td className="tabular py-3 pr-4">{dollars(askCost(ask.units, ask.priceBps))}</td>
      <td className="py-3 text-right">
        <button
          type="button"
          disabled={tx.busy}
          onClick={() =>
            tx.send({
              address: market,
              abi: invoiceMarketAbi,
              functionName: "cancelAsk",
              args: [ask.askId],
            })
          }
          className="rounded-full border border-line px-4 py-1.5 font-medium text-soft text-xs hover:text-ink disabled:opacity-60"
        >
          {tx.busy ? "Working…" : "Cancel"}
        </button>
        <TxStatus tx={tx} done="Ask cancelled." />
      </td>
    </tr>
  )
}
