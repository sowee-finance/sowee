import { ImageResponse } from "next/og"

// The card a shared link unfurls into. Drawn rather than photographed, so it costs nothing to
// serve and never goes stale against the brand.

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Sowee — invoices, funded before they are paid"

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
        Invoices, funded before they are paid
      </div>
      <div style={{ fontSize: 30, color: "#6fa886", marginTop: 48 }}>
        Tokenized invoices · USDC funding · Automatic settlement
      </div>
    </div>,
    size,
  )
}
