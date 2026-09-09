"use client"

import { ArrowDown } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract, useSwitchChain } from "wagmi"
import { bondTokenAbi } from "@/lib/abi/bondToken"
import { invoiceMarketAbi } from "@/lib/abi/invoiceMarket"
import { hip719Abi, useUsdcAssociation } from "@/lib/association"
import { activeChain } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { type Bond, bondStatus, dollars, feeOn, maturityDate, usdc, usdcAmount } from "@/lib/market"
import { useTx } from "@/lib/use-tx"
import { BondAvatar } from "./bond-card"
import { AmountPanel, blackButton, TokenChip, TxStatus, UsdcChip } from "./ui"
import { ConnectButton } from "./wallet-button"

const chain = { chainId: activeChain.id } as const

function parseAmount(s: string): bigint | undefined {
  try {
    const v = parseUnits(s, 6)
    return v > 0n ? v : undefined
  } catch {
    return undefined
  }
}

function closedMessage(bond: Bond): string {
  switch (bondStatus(bond)) {
    case "funded":
      return "The primary sale is fully funded. Units trade on the secondary market below; holdings appear on the Portfolio page."
    case "matured":
      return `This bond matured on ${maturityDate(bond.maturity)}. Holders claim their payout from the Portfolio page once the payor's repayment is settled.`
    default:
      return `This bond was repaid in full and settled. Holders receive ${dollars(bond.faceValue)} pro-rata from the Portfolio page.`
  }
}

/** Primary buy: units of face value in, USDC (price + fee) out, `approve` then `buyPrimary`. */
export function BuyForm({ bond, deployment }: { bond: Bond; deployment: Deployment }) {
  const { address, chainId } = useAccount()
  const open = bondStatus(bond) === "open"
  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <div className="border-line border-b pb-3 font-medium text-[15px]">
        {open ? "Fund this Invoice" : "Primary sale closed"}
      </div>
      {open ? (
        <Order
          bond={bond}
          deployment={deployment}
          address={address}
          onChain={chainId === activeChain.id}
        />
      ) : (
        <div className="mt-4 rounded-2xl bg-shade/60 p-4 text-body text-sm">
          {closedMessage(bond)}
        </div>
      )}
    </div>
  )
}

function Order({
  bond,
  deployment,
  address,
  onChain,
}: {
  bond: Bond
  deployment: Deployment
  address?: Address
  onChain: boolean
}) {
  const market = deployment.invoiceMarket
  const [amount, setAmount] = useState("")
  const units = parseAmount(amount)
  const tx = useTx()
  const { switchChain, isPending: switching } = useSwitchChain()
  const wallet = address && onChain ? address : undefined

  const eligible = useReadContract({
    ...chain,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "isEligible",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
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
    args: wallet ? [wallet, market] : undefined,
    query: { enabled: !!wallet },
  })
  const usdcBalance = useReadContract({
    ...chain,
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  })

  // Hedera's USDC is an HTS token: an account that never associated with it cannot hold one,
  // so its balance is a zero that no purchase, faucet or claim can move.
  const association = useUsdcAssociation(wallet, deployment.usdc)
  const unassociated = association.data === false

  const fee = cost.data !== undefined ? feeOn(cost.data, feeBps.data ?? 0) : 0n
  const total = (cost.data ?? 0n) + fee
  const available = bond.faceValue - bond.supply
  const unitPrice = 1 - bond.discountRateBps / 10_000

  const blocker = ((): string | undefined => {
    if (!wallet) return undefined
    if (units === undefined) return "Enter the face value to buy, in USDC."
    if (units > available) return `Only ${dollars(available)} of face value is left.`
    if (unassociated) return undefined // the button below says what to do instead
    if (usdcBalance.data !== undefined && usdcBalance.data < total)
      return `Insufficient USDC: you hold ${usdc(usdcBalance.data)}.`
    return undefined
  })()
  const needsApprove = allowance.data !== undefined && allowance.data < total

  const submit = () => {
    if (!units) return
    if (needsApprove) {
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
        functionName: "buyPrimary",
        args: [bond.invoiceId, units],
      })
    }
  }

  return (
    <>
      <div className="relative mt-4 flex flex-col gap-1.5">
        <AmountPanel
          label="Face value at maturity"
          value={amount}
          onChange={setAmount}
          tokenChip={
            <TokenChip icon={<BondAvatar bond={bond} className="size-5.5 text-[9px]" />}>
              {bond.symbol}
            </TokenChip>
          }
        />
        <span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-10 flex size-9 items-center justify-center rounded-full border border-line bg-white">
          <ArrowDown size={16} className="text-soft" />
        </span>
        <AmountPanel
          label="You pay now"
          value={units && cost.data !== undefined ? usdcAmount(total) : ""}
          tokenChip={<UsdcChip />}
          readOnly
        />
      </div>

      <div className="tabular mt-3 text-soft text-xs">
        ${unitPrice.toFixed(4)} per unit · {formatUnits(available, 6)} units left · matures{" "}
        {maturityDate(bond.maturity)}
        {units && cost.data !== undefined
          ? ` · ${usdc(cost.data)} + ${usdc(fee)} fee (${feeBps.data ?? 0} bps)`
          : ""}
      </div>
      {usdcBalance.data !== undefined && !unassociated && (
        <div className="tabular mt-1 text-soft text-xs">
          Wallet USDC: {dollars(usdcBalance.data)}
        </div>
      )}
      {unassociated && (
        <p className="mt-2 text-soft text-xs">
          This wallet has not associated USDC yet. On Hedera an account cannot hold a token it has
          not associated with, so its balance stays at zero until it does — one transaction, sent by
          you, and it only has to happen once.
        </p>
      )}

      {!address ? (
        <ConnectButton className={`${blackButton} mt-4`} />
      ) : !onChain ? (
        <button
          type="button"
          disabled={switching}
          onClick={() => switchChain({ chainId: activeChain.id })}
          className={`${blackButton} mt-4`}
        >
          {switching ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      ) : eligible.data === false ? (
        <Link href="/kyc" className={`${blackButton} mt-4`}>
          Verify Identity to Invest
        </Link>
      ) : unassociated ? (
        // Before the balance means anything, the account has to be able to hold the token at all.
        <button
          type="button"
          disabled={tx.busy}
          onClick={() =>
            tx.send({
              address: deployment.usdc,
              abi: hip719Abi,
              functionName: "associate",
              args: [],
            })
          }
          className={`${blackButton} mt-4`}
        >
          {tx.busy ? "Working…" : "Associate USDC"}
        </button>
      ) : (
        <button
          type="button"
          disabled={!!blocker || tx.busy || eligible.data === undefined}
          onClick={submit}
          className={`${blackButton} mt-4`}
        >
          {tx.busy ? "Working…" : needsApprove ? `Approve ${dollars(total)}` : "Fund Invoice"}
        </button>
      )}
      {blocker && units !== undefined && <p className="mt-2 text-amber-700 text-xs">{blocker}</p>}
      <TxStatus tx={tx} done="Purchase confirmed." />

      <p className="mt-4 text-[11px] text-faint leading-relaxed">
        1 unit = 1 USDC of face value, paid at the discounted price plus the platform fee. Orders
        execute on {activeChain.name} with testnet USDC. Invoice bonds are offered only to verified
        investors in eligible jurisdictions.
      </p>
    </>
  )
}
