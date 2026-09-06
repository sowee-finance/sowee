"use client"

import { Check, Copy, LogOut } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { activeChain, shortAddress } from "@/lib/chains"
import { useOutsideClick, WalletAvatar } from "./ui"

/** Black "Connect Wallet" pill; connects wagmi's injected connector. */
export function ConnectButton({ className = "" }: { className?: string }) {
  const { connect, connectors, isPending, error } = useConnect()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => connect({ connector: connectors[0] })}
      title={error?.message}
      className={`rounded-full bg-ink px-4 py-2 font-medium text-sm text-white hover:bg-black disabled:opacity-60 ${className}`}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  )
}

/** Connected-wallet pill with a Copy Address / Disconnect menu, plus a switch-chain nudge. */
function WalletMenu({ address }: { address: `0x${string}` }) {
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClick(ref, close, open)

  const copy = async () => {
    await navigator.clipboard?.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape dismissal for the popover; the trigger button is the interactive element
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full bg-shade px-4 py-2 font-mono text-xs hover:bg-line"
      >
        <WalletAvatar address={address} className="size-4" />
        {shortAddress(address)}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-line bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.10)]">
          <div className="flex items-center gap-2 px-2 py-2">
            <WalletAvatar address={address} className="size-6" />
            <span className="font-mono text-xs">{shortAddress(address)}</span>
          </div>
          <div className="mt-1 rounded-xl bg-shade/60 p-1">
            <button
              type="button"
              onClick={copy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy Address"}
            </button>
            <button
              type="button"
              onClick={() => disconnect()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white"
            >
              <LogOut size={14} />
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Full-page prompt for the wallet-scoped pages (portfolio, issuer). */
export function ConnectPrompt({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-32 text-center">
      <Icon size={28} className="text-faint" strokeWidth={1.5} />
      <h1 className="font-medium text-2xl tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-soft">{children}</p>
      <ConnectButton className="mt-2 px-6 py-2.5" />
    </div>
  )
}

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  if (!isConnected || !address) return <ConnectButton className="hidden sm:block" />
  return (
    <div className="flex items-center gap-2">
      {chainId !== activeChain.id && (
        <button
          type="button"
          disabled={switching}
          onClick={() => switchChain({ chainId: activeChain.id })}
          className="rounded-full bg-amber-400 px-3 py-2 font-medium text-ink text-xs hover:bg-amber-300 disabled:opacity-60"
        >
          {switching ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      )}
      <WalletMenu address={address} />
    </div>
  )
}
