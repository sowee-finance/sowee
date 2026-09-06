"use client"

import Link from "next/link"
import { useState } from "react"
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract } from "wagmi"
import { bondTokenAbi } from "@/lib/abi/bondToken"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { activeChain, shortAddress } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import {
  type Ask,
  askCost,
  type Bond,
  bondStatus,
  dollars,
  feeOn,
  pct,
  tenorDays,
} from "@/lib/market"
import { useAsks } from "@/lib/use-bonds"
import { useTx } from "@/lib/use-tx"
import { ErrorState, SkeletonLine } from "./states"
import { AmountPanel, blackButton, SectionTitle, TokenChip, TxStatus, UsdcChip } from "./ui"
import { ConnectButton } from "./wallet-button"

const chain = { chainId: activeChain.id } as const

function parseUnitsOrZero(s: string): bigint {
  try {
    return parseUnits(s, 6)
  } catch {
    return 0n
  }
}

/** Annualised yield of buying a unit at `priceBps` of face and receiving 1 USDC at maturity. */
function askYtm(priceBps: bigint, maturity: number): number | undefined {
  const p = Number(priceBps) / 10_000
  const days = tenorDays(maturity)
  return p > 0 && days > 0 ? ((1 - p) / p) * (365 / days) * 100 : undefined
}

const unitPrice = (priceBps: bigint) => `$${(Number(priceBps) / 10_000).toFixed(4)}`

/** Open asks on one bond, with fill, sell and cancel. Hidden once the bond has matured. */
export function SecondaryMarket({ bond, deployment }: { bond: Bond; deployment: Deployment }) {
  const { address, chainId } = useAccount()
  const wallet = address && chainId === activeChain.id ? address : undefined
  const asks = useAsks(deployment.invoiceMarket)
  const open = (asks.data ?? [])
    .filter((a) => a.invoiceId === bond.invoiceId)
    .sort((a, b) => Number(a.priceBps - b.priceBps))
  const balance = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  })
  const held = balance.data ?? 0n
  if (!["open", "funded"].includes(bondStatus(bond))) return null

  return (
    <section id="market" className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Secondary Market</SectionTitle>
        {wallet && held > 0n && (
          <span className="tabular text-sm text-soft">You hold {formatUnits(held, 6)} units</span>
        )}
      </div>
      <p className="mt-1 text-soft text-xs">
        Holders offer units at a price per unit; fills settle USDC to the maker and move units
        through the bond&apos;s allowlist.
      </p>

      {asks.isPending ? (
        <>
          <SkeletonLine className="mt-4 w-full" />
          <SkeletonLine className="w-2/3" />
        </>
      ) : asks.error ? (
        <ErrorState what="the open asks" onRetry={() => asks.refetch()} />
      ) : open.length === 0 ? (
        <p className="mt-4 text-sm text-soft">No open asks for this bond yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-line border-b text-soft text-xs">
                <th className="py-2.5 pr-4 font-medium">Seller</th>
                <th className="py-2.5 pr-4 font-medium">Units</th>
                <th className="py-2.5 pr-4 font-medium">Price / unit</th>
                <th className="py-2.5 pr-4 font-medium">Implied YTM</th>
                <th className="py-2.5 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {open.map((a) => (
                <AskRow key={a.askId} ask={a} bond={bond} deployment={deployment} wallet={wallet} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wallet && held > 0n && (
        <SellForm bond={bond} deployment={deployment} wallet={wallet} held={held} mine={open} />
      )}
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
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(formatUnits(ask.units, 6))
  const units = parseUnitsOrZero(amount)
  const tx = useTx()
  const ytm = askYtm(ask.priceBps, bond.maturity)

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
  const valid = units > 0n && units <= ask.units

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

  const pill =
    "rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-60"

  return (
    <>
      <tr>
        <td className="py-3 pr-4 font-mono text-xs" title={ask.maker}>
          {own ? "You" : shortAddress(ask.maker)}
        </td>
        <td className="tabular py-3 pr-4">{formatUnits(ask.units, 6)}</td>
        <td className="tabular py-3 pr-4">{unitPrice(ask.priceBps)}</td>
        <td className="tabular py-3 pr-4">{ytm === undefined ? "—" : pct(ytm)}</td>
        <td className="py-3 text-right">
          {own ? (
            <button
              type="button"
              disabled={tx.busy}
              onClick={act}
              className="rounded-full border border-line px-4 py-1.5 font-medium text-soft text-xs hover:text-ink disabled:opacity-60"
            >
              {tx.busy ? "Working…" : "Cancel"}
            </button>
          ) : !wallet ? (
            <ConnectButton className="px-4 py-1.5 text-xs" />
          ) : eligible.data === false ? (
            <Link href="/kyc" className={`inline-block ${pill}`}>
              Verify to Fill
            </Link>
          ) : (
            <button type="button" onClick={() => setEditing((v) => !v)} className={pill}>
              Fill
            </button>
          )}
        </td>
      </tr>
      {editing && !own && (
        <tr>
          <td colSpan={5} className="pb-3">
            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-shade/60 p-3">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                aria-label="Units to buy"
                className="tabular h-8 w-28 rounded-full border border-line bg-white px-3 text-xs outline-none focus:border-ink"
              />
              <span className="tabular text-soft text-xs">
                of {formatUnits(ask.units, 6)} units · pay {dollars(cost)} + {dollars(total - cost)}{" "}
                fee
              </span>
              <button
                type="button"
                disabled={tx.busy || !valid}
                onClick={act}
                className={`ml-auto ${pill}`}
              >
                {tx.busy
                  ? "Working…"
                  : needsApprove
                    ? `Approve ${dollars(total)}`
                    : "Confirm Purchase"}
              </button>
            </div>
          </td>
        </tr>
      )}
      {(tx.busy || tx.error || tx.confirmed) && (
        <tr>
          <td colSpan={5} className="pb-3">
            <TxStatus
              tx={tx}
              done={own ? "Ask cancelled — units stay in your wallet." : "Purchase confirmed."}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function SellForm({
  bond,
  deployment,
  wallet,
  held,
  mine,
}: {
  bond: Bond
  deployment: Deployment
  wallet: Address
  held: bigint
  mine: Ask[]
}) {
  const market = deployment.invoiceMarket
  const [amount, setAmount] = useState("")
  // Default ask price: the primary price per unit.
  const [price, setPrice] = useState(() => (1 - bond.discountRateBps / 10_000).toFixed(4))
  const units = parseUnitsOrZero(amount)
  const priceBps = BigInt(Math.round(Number(price || 0) * 10_000))
  const tx = useTx()

  const allowance = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "allowance",
    args: [wallet, market],
  })

  // Units stay with the maker until a fill, so the market needs allowance for every open ask.
  const openUnits = mine
    .filter((a) => a.maker.toLowerCase() === wallet.toLowerCase())
    .reduce((s, a) => s + a.units, 0n)
  const needed = openUnits + units
  const needsApprove = allowance.data !== undefined && allowance.data < needed
  const ytm = askYtm(priceBps, bond.maturity)

  const blocked =
    units === 0n
      ? "Enter units and a price per unit to preview proceeds."
      : units > held
        ? `You hold ${formatUnits(held, 6)} units.`
        : priceBps <= 0n || priceBps > 10_000n
          ? "Price must be between $0 and $1 per unit."
          : undefined

  const submit = () => {
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
    <div className="mt-8">
      <h3 className="font-medium text-[15px]">Sell Your Units</h3>
      <p className="mt-1 text-soft text-xs">
        You hold {formatUnits(held, 6)} units (1 unit = 1 USDC face). Units stay in your wallet
        until a fill; the market only needs an allowance for them.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <AmountPanel
          label={`Units to sell (max ${formatUnits(held, 6)})`}
          value={amount}
          onChange={setAmount}
          tokenChip={<TokenChip>Units</TokenChip>}
        />
        <AmountPanel
          label="Price per unit"
          value={price}
          onChange={setPrice}
          tokenChip={<UsdcChip />}
        />
      </div>
      <div className="tabular mt-3 text-soft text-xs">
        {blocked ??
          `Proceeds ${dollars(askCost(units, priceBps))} if fully filled${
            ytm === undefined ? "" : ` · buyer's implied YTM ${pct(ytm)}`
          }`}
      </div>
      <button
        type="button"
        disabled={!!blocked || tx.busy}
        onClick={submit}
        className={`${blackButton} mt-4`}
      >
        {tx.busy
          ? "Working…"
          : needsApprove
            ? `Approve ${formatUnits(needed, 6)} units`
            : "Place Ask"}
      </button>
      <TxStatus tx={tx} done="Ask placed — it stays listed until filled or cancelled." />
    </div>
  )
}
