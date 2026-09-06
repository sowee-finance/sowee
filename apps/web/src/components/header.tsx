"use client"

import { Menu, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useState } from "react"
import { useAccount } from "wagmi"
import type { Contracts } from "@/lib/market"
import { KycBadge } from "./kyc-badge"
import { HeaderSearch, MobileSearch } from "./search-bonds"
import { Sheet } from "./ui"
import { ConnectButton, WalletButton } from "./wallet-button"

const NAV = [
  { href: "/", label: "Marketplace" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/issuer", label: "Issuer" },
] as const

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href)

/** Mobile: hamburger button opening a nav sheet. */
function MobileMenu({ className = "" }: { className?: string }) {
  const pathname = usePathname()
  const { isConnected } = useAccount()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className={className}>
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
      >
        <Menu size={19} />
      </button>
      <Sheet open={open} onClose={close} closeLabel="Close menu" panelClassName="p-4 pb-6">
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-medium text-xl">Menu</h2>
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={`rounded-xl px-3 py-3 text-[15px] ${
                isActive(pathname, item.href)
                  ? "bg-shade font-medium text-ink"
                  : "text-body hover:bg-shade"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {!isConnected && (
          <ConnectButton className="mt-3 h-12 w-full rounded-xl border border-line bg-white text-ink hover:border-ink hover:bg-white" />
        )}
      </Sheet>
    </div>
  )
}

export function Header({ contracts }: { contracts?: Contracts }) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-40 border-line border-b bg-white">
      <div className="container-page flex h-16 items-center gap-5">
        <Link href="/" aria-label="Home" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/favicons/black/android-chrome-192x192.png"
            alt="Sowee"
            width={28}
            height={28}
            priority
          />
          <span className="font-medium text-[17px] tracking-tight">Sowee</span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm ${
                isActive(pathname, item.href) ? "font-medium text-ink" : "text-soft hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <HeaderSearch contracts={contracts} className="mx-auto hidden w-full max-w-110 md:block" />

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <MobileSearch contracts={contracts} className="md:hidden" />
          <KycBadge />
          <WalletButton />
          <MobileMenu className="lg:hidden" />
        </div>
      </div>
    </header>
  )
}
