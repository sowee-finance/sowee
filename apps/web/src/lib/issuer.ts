import { bytesToHex, type Hex } from "viem"

/** sha256 of a file, computed in the browser. The file itself never leaves the machine. */
export async function sha256Hex(file: Blob): Promise<Hex> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return bytesToHex(new Uint8Array(digest))
}

export const nameFor = (ref: string) => `Sowee Bond ${ref}`

/** `s<REF>`: uppercase alphanumerics of the reference, 8 characters at most. */
export const symbolFor = (ref: string) =>
  `s${ref
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7)}`

/** `<input type="date">` value (UTC midnight) to unix seconds. */
export const maturityFrom = (date: string) => Math.floor(Date.parse(date) / 1000)
