# @sowee/plugin-chainlink

[Sowee](https://github.com/sowee-finance/sowee) plugin for [Chainlink Data Feeds](https://docs.chain.link/data-feeds) on Hedera: read AggregatorV3 price feeds through the free Mirror Node `eth_call` — no JSON-RPC relay, no gas, no signer.

Ships the verified Hedera **testnet** aggregator proxy addresses (BTC/USD, DAI/USD, ETH/USD, HBAR/USD, LINK/USD, USDC/USD, USDT/USD; source: the Chainlink reference-data-directory) and a minimal vendored `AggregatorV3Interface` fragment (`latestRoundData`, `decimals`, `description`).

- **`FeedReader`** — `readLatestRound("HBAR/USD")` → `{ roundId, answer, updatedAt, decimals }`, `readPrice(...)` → decimal-formatted price. Accepts a feed symbol or any aggregator address; caches `decimals` per feed.
- **`formatAnswer(answer, decimals)`** — pure bigint decimal formatting, trailing zeros trimmed, no floats.
- **`isStale(round, maxAgeSeconds)`** — pure staleness check for gating quotes on fresh data.

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

## License

Apache-2.0
