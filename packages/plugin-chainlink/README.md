# @sowee/plugin-chainlink

The [Sowee](https://github.com/sowee-finance/sowee) plugin for [Chainlink Data Feeds](https://docs.chain.link/data-feeds) on Hedera. It reads AggregatorV3 price feeds through the Mirror Node's free `eth_call`, which means no JSON-RPC relay, no gas, and no signer. Handy when all you want is a price.

It ships the verified Hedera testnet aggregator proxy addresses (BTC/USD, DAI/USD, ETH/USD, HBAR/USD, LINK/USD, USDC/USD, USDT/USD, straight from the Chainlink reference-data-directory) and a minimal vendored `AggregatorV3Interface` fragment covering `latestRoundData`, `decimals`, and `description`.

`FeedReader` does the work: `readLatestRound("HBAR/USD")` gives you `{ roundId, answer, updatedAt, decimals }`, and `readPrice(...)` gives you the decimal-formatted price. It takes a feed symbol or any aggregator address, and caches `decimals` per feed. Alongside it there are two pure helpers: `formatAnswer(answer, decimals)` for bigint decimal formatting (trailing zeros trimmed, no floats), and `isStale(round, maxAgeSeconds)` for gating quotes on fresh data.

## Install

```sh
pnpm add @sowee/plugin-chainlink @sowee/core
```

## Usage

```ts
import { FeedReader, isStale } from "@sowee/plugin-chainlink";

const reader = new FeedReader(); // defaults to the public Hedera testnet mirror node

const { price, updatedAt } = await reader.readPrice("HBAR/USD");
console.info(`HBAR/USD = $${price}`);

const round = await reader.readLatestRound("USDC/USD");
if (isStale(round, 3600)) throw new Error("feed stale, refusing to quote");
```

Part of the [Sowee monorepo](https://github.com/sowee-finance/sowee).

## License

Apache-2.0
