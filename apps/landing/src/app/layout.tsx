import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

// The icons, the manifest and the shape of this metadata are the app's (`apps/web`), so the two
// sites are one brand in a browser tab, a bookmark and a shared link.

const fontSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sowee.site"

const description =
  "A business waits 30 to 90 days to be paid. Sowee turns that invoice into a bond investors " +
  "fund today in USDC, settled automatically at maturity on Hedera — and the identity check " +
  "that decides who may hold one is enforced by the token itself."

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: "Sowee | Invoices, funded before they are paid",
    template: "%s | Sowee",
  },
  description,
  applicationName: "Sowee",
  // This is the canonical home of the product; the app lives on its own subdomain.
  alternates: { canonical: "/" },
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
    title: "Sowee | Invoices, funded before they are paid",
    description,
    siteName: "Sowee",
    url: site,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "finance",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body>
        {children}
        {/* What the page is, in the form a search engine reads it. Same facts as the copy. */}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a literal object, no input
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Sowee",
              url: site,
              description,
              publisher: {
                "@type": "Organization",
                name: "Sowee",
                url: site,
                logo: `${site}/favicons/black/android-chrome-512x512.png`,
              },
            }),
          }}
        />
      </body>
    </html>
  )
}
