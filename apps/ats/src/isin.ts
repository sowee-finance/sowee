/**
 * ISIN generation. The ATS factory rejects a security whose ISIN is malformed, so the
 * identifier has to be a real one: two-letter prefix, nine alphanumeric characters, and a check
 * digit over the whole thing.
 *
 * We use the `XS` prefix, which is what international issues cleared outside a single national
 * numbering agency carry, and derive the nine characters from the invoice reference so the same
 * invoice always maps to the same ISIN.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/** Expands letters to their two-digit values (A = 10 … Z = 35) and keeps digits as they are. */
function expand(body: string): string {
  let out = ""
  for (const ch of body) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) throw new Error(`ISIN body has a character outside 0-9A-Z: ${ch}`)
    out += v < 10 ? String(v) : String(v)
  }
  return out
}

/** Luhn check digit over the expanded body, doubling every second digit from the right. */
export function checkDigit(body: string): number {
  const digits = expand(body)
  let sum = 0
  let double = true // the rightmost digit of the body is doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return (10 - (sum % 10)) % 10
}

/** True when `isin` is 12 characters, well formed, and carries the right check digit. */
export function isValidIsin(isin: string): boolean {
  if (!/^[A-Z]{2}[0-9A-Z]{9}[0-9]$/.test(isin)) return false
  return checkDigit(isin.slice(0, 11)) === Number(isin[11])
}

/** Nine base-36 characters taken from a 32-byte hash, left-padded so the length is fixed. */
export function nsinFromHash(hash: `0x${string}`): string {
  const n = BigInt(hash) % 36n ** 9n
  return n.toString(36).toUpperCase().padStart(9, "0")
}

/** `XS` + nine characters derived from the hash + the check digit. */
export function isinFor(hash: `0x${string}`, prefix = "XS"): string {
  const body = prefix + nsinFromHash(hash)
  return body + checkDigit(body)
}
