import type { Address, Hash, Hex, WalletClient } from "viem";

/** A prepared contract call: pass to any sender, or use `sendCall`. */
export interface PreparedCall {
  to: Address;
  data: Hex;
}

/** Send a prepared call with a viem wallet client (uses the client's account and chain). */
export function sendCall(walletClient: WalletClient, call: PreparedCall): Promise<Hash> {
  const account = walletClient.account;
  if (!account) {
    throw new Error("walletClient has no account configured");
  }
  return walletClient.sendTransaction({
    to: call.to,
    data: call.data,
    account,
    chain: walletClient.chain ?? null,
  });
}
