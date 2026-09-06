import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

/** Every page except the onboarding wizard: sticky header, page container, legal footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const d = getDeployment(activeChain.id)
  const contracts = d && {
    invoiceMarket: d.invoiceMarket,
    maturitySettlement: d.maturitySettlement,
  }
  return (
    <>
      <Header contracts={contracts} />
      <main className="container-page flex-1 pb-24">{children}</main>
      <Footer />
    </>
  )
}
