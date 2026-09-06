/** HashScan page for a Hedera transaction id such as `0.0.7162784@1787822906.384230320`. */
export function txLink(transactionId: string, network = "testnet"): string {
  const [account, ts] = transactionId.split("@")
  const path = ts ? `${account}-${ts.replace(".", "-")}` : transactionId
  return `https://hashscan.io/${network}/transaction/${path}`
}

/** Base units → decimal string for a 6-decimal asset (USDC). */
export function formatUsdc(baseUnits: string): string {
  const n = BigInt(baseUnits)
  const whole = n / 1_000_000n
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : `${whole}`
}
