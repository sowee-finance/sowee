import { ImageResponse } from "next/og"
import { networkBrand } from "@/lib/chains"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = `Sowee — Compliant Invoice Financing on ${networkBrand}`

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        background: "#0c2d1d",
        color: "#ffffff",
      }}
    >
      <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -2 }}>Sowee</div>
      <div style={{ fontSize: 46, color: "#9fd4b4", marginTop: 18 }}>
        {`Compliant Invoice Financing on ${networkBrand}`}
      </div>
      <div style={{ fontSize: 30, color: "#6fa886", marginTop: 48 }}>
        Tokenized invoices · USDC funding · Automatic settlement
      </div>
    </div>,
    size,
  )
}
