import { bytesToHex, type Hex } from "viem"

/** sha256 of a file, computed in the browser. The file itself never leaves the machine. */
export async function sha256Hex(file: Blob): Promise<Hex> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return bytesToHex(new Uint8Array(digest))
}

/**
 * The mark is stored with the record on a public topic, so it is deliberately tiny. 96px covers
 * twice the largest place it is drawn (a 40px card avatar), so it stays sharp on a retina screen
 * without the file growing to the point where it does not belong on a topic.
 */
export const LOGO_SIZE = 96
const LOGO_MAX_BYTES = 12 * 1024

/**
 * Turns a picked image into a small square data URI, drawn cover-style so a wide logo is cropped
 * rather than squashed. WebP first because it is the smallest; PNG when a browser cannot encode
 * it. Throws when the result is still too large for the topic, which a photograph will be.
 */
export async function downscaleLogo(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = LOGO_SIZE
  canvas.height = LOGO_SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser cannot resize the image.")

  const side = Math.min(bitmap.width, bitmap.height)
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    LOGO_SIZE,
    LOGO_SIZE,
  )
  bitmap.close?.()

  let uri = canvas.toDataURL("image/webp", 0.85)
  if (!uri.startsWith("data:image/webp")) uri = canvas.toDataURL("image/png")
  if (uri.length > LOGO_MAX_BYTES) {
    throw new Error("That image is too detailed to store on the audit trail. Try a flat logo.")
  }
  return uri
}

/** Token name `<issuer company> · <payor>`; the marketplace splits it back (`market.ts`). */
export const nameFor = (company: string, payor: string) =>
  `${company.trim().replaceAll(" · ", " - ")} · ${payor.trim().replaceAll(" · ", " - ")}`

/**
 * `s<PREFIX><NUMBER>`: the letters an invoice reference opens with, then the number it ends with.
 *
 * Taking the first seven characters instead reads the year and stops: `INV-2026-001` and
 * `INV-2026-002` both become `sINV2026`, and so does every other invoice raised that year. The
 * distinguishing part of a reference is at the end, which is why it is the part that is kept.
 */
export const symbolFor = (ref: string) => {
  const parts = ref
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
  const letters = parts[0]?.match(/^[A-Z]+/)?.[0] ?? ""
  const number = parts.at(-1)?.match(/\d+$/)?.[0] ?? ""
  return `s${(letters + number || parts.join("")).slice(0, 7)}`
}

/** `<input type="date">` value (UTC midnight) to unix seconds. */
export const maturityFrom = (date: string) => Math.floor(Date.parse(date) / 1000)
