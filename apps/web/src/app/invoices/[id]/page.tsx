import { notFound } from "next/navigation"
import { isHex } from "viem"
import { BondDetail } from "@/components/bond-detail"
import { activeChain } from "@/lib/chains"
import { getDeployment } from "@/lib/deployments"

export default async function Invoice({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params
  // invoiceId is a bytes32: 0x + 64 hex chars
  if (!isHex(id) || id.length !== 66) notFound()
  return <BondDetail deployment={getDeployment(activeChain.id)} invoiceId={id} />
}
