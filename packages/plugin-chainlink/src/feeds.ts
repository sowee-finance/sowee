import type { Address } from "viem";

/**
 * Chainlink Data Feed aggregator proxy addresses on Hedera TESTNET.
 * Source: Chainlink reference-data-directory (docs.chain.link → Data Feeds → Hedera testnet).
 * Verified against the public testnet mirror node; guarded by the regression fixture.
 */
export const CHAINLINK_FEEDS_TESTNET = {
  "BTC/USD": "0x058fE79CB5775d4b167920Ca6036B824805A9ABd",
  "DAI/USD": "0xdA2aBF7C90aDC73CDF5cA8d720B87bD5F5863389",
  "ETH/USD": "0xb9d461e0b962aF219866aDfA7DD19C52bB9871b9",
  "HBAR/USD": "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
  "LINK/USD": "0xF111b70231E89D69eBC9f6C9208e9890383Ef432",
  "USDC/USD": "0xb632a7e7e02d76c0Ce99d9C62c7a2d1B5F92B6B5",
  "USDT/USD": "0x06823de8E77d708C4cB72Cbf04495D67afF4Bd37",
} as const satisfies Record<string, Address>;

/** Symbol of a Chainlink feed available on Hedera testnet, e.g. `"HBAR/USD"`. */
export type FeedSymbol = keyof typeof CHAINLINK_FEEDS_TESTNET;
