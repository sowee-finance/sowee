import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Sowee — invoices, funded today",
  description:
    "Get paid for an invoice today. Investors put up the cash and collect when your customer pays.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
