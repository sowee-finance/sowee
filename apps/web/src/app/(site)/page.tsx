import type { Metadata } from "next"
import { Suspense } from "react"
import { Marketplace } from "@/components/marketplace"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

// No `title` here: the template in the root layout applies to this page like any other, so
// setting the same string the layout already uses as its default rendered it twice —
// "Sowee | Compliant Invoice Financing on Hedera | Sowee". The default covers this page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

// Suspense boundary: the marketplace reads ?q= via useSearchParams.
export default function Home() {
  const d = getDeployment(activeChain.id)
  return (
    <Suspense>
      <Marketplace
        contracts={
          d && { invoiceMarket: d.invoiceMarket, maturitySettlement: d.maturitySettlement }
        }
      />
    </Suspense>
  )
}
