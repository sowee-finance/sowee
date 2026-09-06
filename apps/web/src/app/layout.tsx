import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { networkBrand } from "@/lib/chains"
import "./globals.css"
import { Providers } from "./providers"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

const description =
  `Sowee turns unpaid invoices into compliant bonds on ${networkBrand}: issuers tokenize invoices, ` +
  "investors fund them at a discount in USDC, and settlement happens automatically at maturity."

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: `Sowee | Compliant Invoice Financing on ${networkBrand}`,
    template: "%s | Sowee",
  },
  description,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      {
        url: "/favicons/black/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicons/white/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: "/favicons/black/apple-touch-icon.png",
  },
  openGraph: {
    title: `Sowee — Compliant Invoice Financing on ${networkBrand}`,
    description,
    siteName: "Sowee",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} h-full font-sans antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
