"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { bondTokenAbi } from "@/lib/abi/bondToken"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { type Bond, isMatured, usdc } from "@/lib/market"

const BPS = 10_000n
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b

function parseAmount(s: string): bigint | undefined {
  try {
    const v = parseUnits(s, 6)
    return v > 0n ? v : undefined
  } catch {
    return undefined
  }
}

export function BuyForm({ bond, deployment }: { bond: Bond; deployment: Deployment }) {
  const { address, chainId } = useAccount()
  const box =
    "rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
  if (!address) {
    return (
      <div className={box}>
        <h2 className="font-medium">Buy units</h2>
        <p className="mt-1 text-zinc-500">Connect a wallet to fund this invoice.</p>
      </div>
    )
  }
  if (chainId !== activeChain.id) {
    return (
      <div className={box}>
        <h2 className="font-medium">Buy units</h2>
        <p className="mt-1 text-zinc-500">Switch your wallet to {activeChain.name} to buy.</p>
      </div>
    )
  }
  return (
    <div className={box}>
      <h2 className="font-medium">Buy units</h2>
      <p className="mt-1 text-xs text-zinc-500">
        1 unit = 1 USDC of face value, paid at the discounted price plus the platform fee.
      </p>
      <Connected bond={bond} deployment={deployment} address={address} />
    </div>
  )
}

function Connected({
  bond,
  deployment,
  address,
}: {
  bond: Bond
  deployment: Deployment
  address: Address
}) {
  const market = deployment.invoiceMarket
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState("")
  const units = parseAmount(amount)
  const chain = { chainId: activeChain.id } as const

  const eligible = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "isEligible",
    args: [address],
  })
  const feeBps = useReadContract({
    ...chain,
    address: market,
    abi: invoiceMarketAbi,
    functionName: "feeBps",
  })
  const cost = useReadContract({
    ...chain,
    address: market,
    abi: invoiceMarketAbi,
    functionName: "primaryCost",
    args: [bond.invoiceId, units ?? 0n],
    query: { enabled: units !== undefined },
  })
  const allowance = useReadContract({
    ...chain,
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address, market],
  })
  const usdcBalance = useReadContract({
    ...chain,
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  })

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ ...chain, hash })
  useEffect(() => {
    // A confirmed approve or buy changes allowance, balances and supply: refetch everything.
    if (receipt.isSuccess) queryClient.invalidateQueries()
  }, [receipt.isSuccess, queryClient])

  const fee =
    cost.data !== undefined && feeBps.data ? ceilDiv(cost.data * BigInt(feeBps.data), BPS) : 0n
  const total = (cost.data ?? 0n) + fee
  const available = bond.faceValue - bond.supply

  const blocker = (() => {
    if (eligible.data === false)
      return "This wallet is not on the bond's allowlist. KYC onboarding arrives in #14."
    if (isMatured(bond.maturity)) return "Funding closed: the invoice has matured."
    if (available === 0n) return "Fully funded."
    if (units === undefined) return "Enter an amount in USDC of face value."
    if (units > available) return `Only ${usdc(available)} of face value is left.`
    if (usdcBalance.data !== undefined && usdcBalance.data < total)
      return `Insufficient USDC: you hold ${usdc(usdcBalance.data)}.`
    return undefined
  })()

  const needsApprove = allowance.data !== undefined && allowance.data < total
  const busy = isPending || (!!hash && receipt.isPending)

  const submit = () => {
    if (!units) return
    if (needsApprove) {
      writeContract({
        ...chain,
        address: deployment.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [market, total],
      })
    } else {
      writeContract({
        ...chain,
        address: market,
        abi: invoiceMarketAbi,
        functionName: "buyPrimary",
        args: [bond.invoiceId, units],
      })
    }
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Face value to buy (USDC)</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.000001"
          placeholder="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
        />
      </label>
      {units !== undefined && cost.data !== undefined && (
        <dl className="grid grid-cols-2 gap-y-0.5 text-xs">
          <dt className="text-zinc-500">Price</dt>
          <dd className="text-right">{usdc(cost.data)}</dd>
          <dt className="text-zinc-500">Fee ({feeBps.data ?? 0} bps)</dt>
          <dd className="text-right">{usdc(fee)}</dd>
          <dt className="text-zinc-500">Total</dt>
          <dd className="text-right font-medium">{usdc(total)}</dd>
        </dl>
      )}
      <button
        type="submit"
        disabled={!!blocker || busy}
        className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy
          ? "Confirming…"
          : needsApprove
            ? `Approve ${usdc(total)}`
            : `Buy ${units ? formatUnits(units, 6) : ""} units`}
      </button>
      {blocker && <p className="text-xs text-amber-700 dark:text-amber-400">{blocker}</p>}
      {error && <p className="break-words text-red-600 text-xs">{error.message.split("\n")[0]}</p>}
      {receipt.isSuccess && <p className="text-emerald-600 text-xs">Transaction confirmed.</p>}
    </form>
  )
}
