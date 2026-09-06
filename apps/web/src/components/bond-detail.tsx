"use client"

import Link from "next/link"
import type { Hex } from "viem"
import { useAccount, useReadContract } from "wagmi"
import { bondTokenAbi } from "@/lib/abi/bondToken"
import { activeChain, explorerUrl, shortAddress } from "@/lib/chains"
import type { Deployment } from "@/lib/deployments"
import { type Bond, bpsToPct, fundedPct, maturityDate, usdc } from "@/lib/market"
import { useBond } from "@/lib/use-bonds"
import { BuyForm } from "./buy-form"
import { NotDeployed } from "./not-deployed"

export function BondDetail({ deployment, invoiceId }: { deployment?: Deployment; invoiceId: Hex }) {
  if (!deployment) return <NotDeployed />
  return <Loaded deployment={deployment} invoiceId={invoiceId} />
}

function Loaded({ deployment, invoiceId }: { deployment: Deployment; invoiceId: Hex }) {
  const { data: bond, error, isPending } = useBond(deployment.invoiceMarket, invoiceId)
  if (isPending) return <p className="text-sm text-zinc-500">Loading bond…</p>
  if (error) {
    const unknown = error.message.includes("UnknownInvoice")
    return (
      <p className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
        {unknown ? "No listing with this invoice id." : `Could not read the bond: ${error.message}`}
      </p>
    )
  }
  const explorer = explorerUrl(bond.bond)
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
      <section>
        <Link href="/" className="text-xs text-zinc-500 hover:underline">
          ← Marketplace
        </Link>
        <h1 className="mt-2 font-semibold text-2xl">{bond.name}</h1>
        <p className="font-mono text-sm text-zinc-500">{bond.symbol}</p>
        <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <Row k="Discount" v={bpsToPct(bond.discountRateBps)} />
          <Row k="Face value" v={usdc(bond.faceValue)} />
          <Row k="Funded" v={`${usdc(bond.supply)} (${fundedPct(bond)}%)`} />
          <Row k="Maturity" v={maturityDate(bond.maturity)} />
          <Row k="Issuer" v={<Mono text={bond.issuer} />} />
          <Row k="Bond token" v={<Mono text={bond.bond} href={explorer} />} />
          <Row k="Invoice id" v={<Mono text={bond.invoiceId} />} />
        </dl>
      </section>
      <aside className="flex flex-col gap-4">
        <Holdings bond={bond} />
        <BuyForm bond={bond} deployment={deployment} />
      </aside>
    </div>
  )
}

function Holdings({ bond }: { bond: Bond }) {
  const { address, chainId } = useAccount()
  const enabled = !!address && chainId === activeChain.id
  const balance = useReadContract({
    chainId: activeChain.id,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled },
  })
  const eligible = useReadContract({
    chainId: activeChain.id,
    address: bond.bond,
    abi: bondTokenAbi,
    functionName: "isEligible",
    args: address ? [address] : undefined,
    query: { enabled },
  })
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">Your position</h2>
      {!address ? (
        <p className="mt-1 text-zinc-500">Connect a wallet to see your balance.</p>
      ) : !enabled ? (
        <p className="mt-1 text-zinc-500">Switch your wallet to {activeChain.name}.</p>
      ) : (
        <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1">
          <Row k="Balance" v={balance.data === undefined ? "…" : usdc(balance.data)} />
          <Row
            k="Eligible"
            v={eligible.data === undefined ? "…" : eligible.data ? "yes" : "no (KYC required)"}
          />
        </dl>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{k}</dt>
      <dd className="min-w-0">{v}</dd>
    </>
  )
}

function Mono({ text, href }: { text: string; href?: string }) {
  const body = (
    <span className="font-mono text-xs" title={text}>
      {shortAddress(text)}
    </span>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
      {body} ↗
    </a>
  ) : (
    body
  )
}
