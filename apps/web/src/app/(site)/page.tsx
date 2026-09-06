import type { Metadata } from "next"
import { Suspense } from "react"
import { Marketplace } from "@/components/marketplace"
import { activeChain, explorerUrl, networkBrand } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

// The root segment shares the layout's segment, so the `%s | Sowee` template does not apply here.
export const metadata: Metadata = {
  title: `Sowee | Compliant Invoice Financing on ${networkBrand}`,
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
        marketUrl={d && explorerUrl(d.invoiceMarket)}
      />
    </Suspense>
  )
}
