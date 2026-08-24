import { MirrorNodeClient, trimTrailingZeros } from "@sowee/core";
import type { Address } from "viem";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { aggregatorV3Abi } from "./abi.js";
import { CHAINLINK_FEEDS_TESTNET, type FeedSymbol } from "./feeds.js";

/** Latest round of a Chainlink AggregatorV3 feed. */
export interface LatestRound {
  roundId: bigint;
  /** Raw signed answer in `decimals` fixed-point units. */
  answer: bigint;
  /** Unix seconds of the last on-chain update. */
  updatedAt: number;
  decimals: number;
}

/** A feed price with the raw answer decimal-formatted. */
export interface FeedPrice {
  /** Decimal string, e.g. `"0.12345678"` (bigint math, trailing zeros trimmed). */
  price: string;
  raw: bigint;
  decimals: number;
  updatedAt: number;
}

/** Format a raw feed answer as a decimal string. Pure bigint math, no floats. */
export function formatAnswer(answer: bigint, decimals: number): string {
  const negative = answer < 0n;
  const abs = negative ? -answer : answer;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = trimTrailingZeros((abs % base).toString().padStart(decimals, "0"));
  const sign = negative ? "-" : "";
  return frac.length > 0 ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

/**
 * True when the round is strictly older than `maxAgeSeconds`
 * (a round exactly `maxAgeSeconds` old is still fresh).
 */
export function isStale(
  round: Pick<LatestRound, "updatedAt">,
  maxAgeSeconds: number,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  return now - round.updatedAt > maxAgeSeconds;
}

/** Resolve a known feed symbol to its testnet proxy address; addresses pass through. */
export function resolveFeed(feedOrSymbol: FeedSymbol | Address): Address {
  const known = (CHAINLINK_FEEDS_TESTNET as Record<string, Address>)[feedOrSymbol];
  return known ?? (feedOrSymbol as Address);
}

/**
 * Read-only Chainlink feed reader over the free Mirror Node `/contracts/call`
 * (no gas, no signer). Defaults to the public Hedera testnet mirror node.
 */
export class FeedReader {
  private readonly mirror: MirrorNodeClient;
  private readonly decimalsCache = new Map<Address, number>();

  constructor(mirror: MirrorNodeClient = new MirrorNodeClient()) {
    this.mirror = mirror;
  }

  /** Feed `decimals()`, cached per feed for the lifetime of this reader. */
  async getDecimals(feedOrSymbol: FeedSymbol | Address): Promise<number> {
    const feed = resolveFeed(feedOrSymbol);
    const cached = this.decimalsCache.get(feed);
    if (cached !== undefined) {
      return cached;
    }
    const data = await this.mirror.contractCall({
      to: feed,
      data: encodeFunctionData({ abi: aggregatorV3Abi, functionName: "decimals" }),
    });
    const decimals = decodeFunctionResult({
      abi: aggregatorV3Abi,
      functionName: "decimals",
      data,
    });
    this.decimalsCache.set(feed, decimals);
    return decimals;
  }

  /** Latest `latestRoundData()` for a feed, with its decimals. */
  async readLatestRound(feedOrSymbol: FeedSymbol | Address): Promise<LatestRound> {
    const feed = resolveFeed(feedOrSymbol);
    const [decimals, data] = await Promise.all([
      this.getDecimals(feed),
      this.mirror.contractCall({
        to: feed,
        data: encodeFunctionData({ abi: aggregatorV3Abi, functionName: "latestRoundData" }),
      }),
    ]);
    const [roundId, answer, , updatedAt] = decodeFunctionResult({
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
      data,
    });
    return { roundId, answer, updatedAt: Number(updatedAt), decimals };
  }

  /** Latest price of a feed, decimal-formatted. */
  async readPrice(feedOrSymbol: FeedSymbol | Address): Promise<FeedPrice> {
    const { answer, decimals, updatedAt } = await this.readLatestRound(feedOrSymbol);
    return { price: formatAnswer(answer, decimals), raw: answer, decimals, updatedAt };
  }
}
