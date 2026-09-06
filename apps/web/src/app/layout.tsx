import type { Metadata } from "next"
import Link from "next/link"
import { WalletButton } from "@/components/wallet-button"
import "./globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "Sowee",
  description: "Compliant invoice financing on-chain: KYC-gated, fractional invoice bonds.",
}

const nav = [
  { href: "/", label: "Marketplace" },
  { href: "/issuer", label: "Issuer" },
  { href: "/portfolio", label: "Portfolio" },
] as const

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          <header className="border-zinc-200 border-b bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
              <Link href="/" className="font-semibold text-lg tracking-tight">
                Sowee
              </Link>
              <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                {nav.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto">
                <WalletButton />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-zinc-200 border-t py-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
            Sowee runs on Hedera testnet. Nothing here is financial advice.
          </footer>
        </Providers>
      </body>
    </html>
  )
}
