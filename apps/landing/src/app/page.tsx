import { Landing } from "@/components/landing"
import { fetchBonds } from "@/lib/bonds"

// Read at request time: the page is a demonstration, so it shows what the market holds now.
export const revalidate = 60

export default async function Page() {
  const bonds = await fetchBonds()
  return (
    <Landing
      bonds={bonds.map((b) => ({
        ...b,
        faceValue: b.faceValue.toString(),
        supply: b.supply.toString(),
      }))}
    />
  )
}
