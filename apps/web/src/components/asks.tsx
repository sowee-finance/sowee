"use client"

import Link from "next/link"
import { useState } from "react"
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract } from "wagmi"
import { bondTokenAbi } from "@/lib/abi/bondToken"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { activeChain, shortAddress } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { type Ask, askCost, type Bond, bpsToPct, feeOn, usdc } from "@/lib/market"
import { useAsks } from "@/lib/use-bonds"
import { useTx } from "@/lib/use-tx"
import { EmptyState, ErrorState, SkeletonLine } from "./states"
import { box, errorText, input, primary, secondary, warnText } from "./styles"

const chain = { chainId: activeChain.id } as const

function parseUnitsOrZero(s: string): bigint {
  try {
    return parseUnits(s, 6)
  } catch {
    return 0n
  }
}

/** Open asks on one bond, with fill, sell and cancel. */
export function SecondaryMarket({ bond, deployment }: { bond: Bond; deployment: Deployment }) {
  const { address, chainId } = useAccount()
  const wallet = address && chainId === activeChain.id ? address : undefined
  const asks = useAsks(deployment.invoiceMarket)
  const open = (asks.data ?? []).filter((a) => a.invoiceId === bond.invoiceId)

  return (
    <section className="mt-8">
      <h2 className="font-medium text-lg">Secondary market</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Holders offer units at a price per unit quoted as a percentage of face value. Fills settle
        USDC to the maker directly and move units through the bond's allowlist.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_20rem]">
        <div className={box}>
          <h3 className="font-medium">Open asks</h3>
          {asks.isPending ? (
            <>
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-2/3" />
            </>
          ) : asks.error ? (
            <div className="mt-2">
              <ErrorState what="the open asks" onRetry={() => asks.refetch()} />
            </div>
          ) : open.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="No open asks">
                Holders who want out before maturity list units here; you would be the first.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Maker</th>
                    <th className="py-1 pr-3 font-normal">Units</th>
                    <th className="py-1 pr-3 font-normal">Price / unit</th>
                    <th className="py-1 pr-3 font-normal">Total</th>
                    <th className="py-1 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {open.map((a) => (
                    <AskRow
                      key={a.askId}
                      ask={a}
                      bond={bond}
                      deployment={deployment}
                      wallet={wallet}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <SellForm bond={bond} deployment={deployment} wallet={wallet} mine={open} />
      </div>
    </section>
  )
}

function AskRow({
  ask,
  bond,
  deployment,
  wallet,
}: {
  ask: Ask
  bond: Bond
  deployment: Deployment
  wallet?: Address
}) {
  const market = deployment.invoiceMarket
  const own = !!wallet && ask.maker.toLowerCase() === wallet.toLowerCase()
  const [amount, setAmount] = useState(formatUnits(ask.units, 6))
  const units = parseUnitsOrZero(amount)
  const tx = useTx()

  const eligible = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "isEligible",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet && !own },
  })
  const feeBps = useReadContract({
    ...chain,
    address: market,
    abi: invoiceMarketAbi,
    functionName: "feeBps",
  })
  const allowance = useReadContract({
    ...chain,
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: wallet ? [wallet, market] : undefined,
    query: { enabled: !!wallet && !own },
  })

  const cost = askCost(units, ask.priceBps)
  const total = cost + feeOn(cost, feeBps.data ?? 0)
  const needsApprove = allowance.data !== undefined && allowance.data < total

  const act = () => {
    if (own) {
      tx.send({
        address: market,
        abi: invoiceMarketAbi,
        functionName: "cancelAsk",
        args: [ask.askId],
      })
    } else if (needsApprove) {
      tx.send({
        address: deployment.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [market, total],
      })
    } else {
      tx.send({
        address: market,
        abi: invoiceMarketAbi,
        functionName: "fillAsk",
        args: [ask.askId, units],
      })
    }
  }

  const blocked = !wallet
    ? "Connect a wallet to fill."
    : eligible.data === false
      ? "kyc"
      : units === 0n || units > ask.units
        ? "Enter up to the ask's units."
        : undefined

  return (
    <tr className="border-zinc-100 border-t align-top dark:border-zinc-800">
      <td className="py-2 pr-3 font-mono text-xs" title={ask.maker}>
        {own ? "you" : shortAddress(ask.maker)}
      </td>
      <td className="py-2 pr-3">{formatUnits(ask.units, 6)}</td>
      <td className="py-2 pr-3">{bpsToPct(Number(ask.priceBps))}</td>
      <td className="py-2 pr-3">{usdc(askCost(ask.units, ask.priceBps))}</td>
      <td className="py-2">
        {own ? (
          <button type="button" className={secondary} disabled={tx.busy} onClick={act}>
            {tx.busy ? "Confirming…" : "Cancel"}
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.000001"
                aria-label="Units to fill"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${input} w-28`}
              />
              <button
                type="button"
                className={primary}
                disabled={!!blocked || tx.busy}
                onClick={act}
              >
                {tx.busy ? "Confirming…" : needsApprove ? `Approve ${usdc(total)}` : "Fill"}
              </button>
            </div>
            {blocked === "kyc" ? (
              <KycNotice />
            ) : blocked ? (
              <span className={warnText}>{blocked}</span>
            ) : (
              <span className="text-xs text-zinc-500">
                {usdc(cost)} + {usdc(total - cost)} fee
              </span>
            )}
          </div>
        )}
        {tx.error && <p className={`mt-1 ${errorText}`}>{tx.error}</p>}
      </td>
    </tr>
  )
}

function SellForm({
  bond,
  deployment,
  wallet,
  mine,
}: {
  bond: Bond
  deployment: Deployment
  wallet?: Address
  mine: Ask[]
}) {
  const market = deployment.invoiceMarket
  const [amount, setAmount] = useState("")
  const [price, setPrice] = useState("")
  const units = parseUnitsOrZero(amount)
  const priceBps = BigInt(Math.round(Number(price || 0) * 100))
  const tx = useTx()

  const balance = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  })
  const allowance = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "allowance",
    args: wallet ? [wallet, market] : undefined,
    query: { enabled: !!wallet },
  })

  // Units stay with the maker until a fill, so the market needs allowance for every open ask.
  const openUnits = mine
    .filter((a) => wallet && a.maker.toLowerCase() === wallet.toLowerCase())
    .reduce((s, a) => s + a.units, 0n)
  const needed = openUnits + units
  const needsApprove = allowance.data !== undefined && allowance.data < needed

  const blocked = !wallet
    ? `Connect a wallet on ${activeChain.name} to sell.`
    : balance.data === 0n
      ? "You hold no units of this bond."
      : units === 0n
        ? "Enter the units to sell."
        : balance.data !== undefined && units > balance.data
          ? `You hold ${formatUnits(balance.data, 6)} units.`
          : priceBps <= 0n || priceBps > 10_000n
            ? "Price must be between 0 and 100% of face."
            : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (needsApprove) {
      tx.send({
        address: bond.bond,
        abi: bondTokenAbi,
        functionName: "approve",
        args: [market, needed],
      })
    } else {
      tx.send({
        address: market,
        abi: invoiceMarketAbi,
        functionName: "makeAsk",
        args: [bond.invoiceId, units, priceBps],
      })
    }
  }

  return (
    <form onSubmit={submit} className={`${box} flex flex-col gap-2`}>
      <h3 className="font-medium">Sell units</h3>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">
          Units{balance.data !== undefined && ` (you hold ${formatUnits(balance.data, 6)})`}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.000001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Price per unit (% of face)</span>
        <input
          type="number"
          inputMode="decimal"
          min="0.01"
          max="100"
          step="0.01"
          placeholder="97.50"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={input}
        />
      </label>
      {!blocked && (
        <p className="text-xs text-zinc-500">
          You receive {usdc(askCost(units, priceBps))} on a full fill.
        </p>
      )}
      <button type="submit" className={primary} disabled={!!blocked || tx.busy}>
        {tx.busy
          ? "Confirming…"
          : needsApprove
            ? `Approve ${formatUnits(needed, 6)} units`
            : "Place ask"}
      </button>
      {blocked && wallet && <p className={warnText}>{blocked}</p>}
      {tx.error && <p className={errorText}>{tx.error}</p>}
      {tx.confirmed && <p className="text-emerald-600 text-xs">Transaction confirmed.</p>}
    </form>
  )
}

export function KycNotice() {
  return (
    <span className={warnText}>
      This wallet is not on the allowlist.{" "}
      <Link href="/kyc" className="underline">
        Complete KYC
      </Link>{" "}
      to trade.
    </span>
  )
}
