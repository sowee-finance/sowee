# landing

The marketing site at `sowee.site`. Two screens on one page: a hero, then a scroll that hands the
screen to a bond — a real listing, drawn as a card, read from `InvoiceMarket` on Hedera testnet.

The app at `app.sowee.site` (`apps/web`) is where anything is actually done. This page only shows
what the market holds and links into it.

## Run

```sh
bun install    # from the repo root
bun run dev    # http://localhost:3000
bun run build && bun run start
bun run lint   # next typegen + tsc
```

| Env | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | `https://testnet.hashio.io/api` | the JSON-RPC the listings are read from; the CSP `connect-src` is derived from its origin at build time |
| `NEXT_PUBLIC_INVOICE_MARKET` | the address in `contracts/deployments/296.json` | market contract, if you need to point at another deployment |

The market address is read from `contracts/deployments/296.json` — the file `script/Deploy.s.sol`
writes and `apps/web` reads — rather than kept as a second copy here.

## What it reads

`listingCount` → `invoiceIds` → `listing`, then `name`, `symbol` and `totalSupply` from each bond
token. The page is a server component with `revalidate = 60`, so the figures are at most a minute
old and no key or wallet is involved.

If the RPC cannot be reached the page says so and shows no listings. It never falls back to
numbers of its own: every figure on it is either from the chain or absent.

## The motion

One screen at a time — the page itself never scrolls. Wheel, swipe and the arrow keys hand the
screen between the hero and the card; a spotlight follows the cursor, revealing a lighter field on
the hero and light falling across the card. The light rests at a fixed point until the visitor
moves, so nothing is flat on arrival, and `prefers-reduced-motion` turns the whole thing off.

The layout follows a reference the team picked. Its photography and footage are not ours and are
not used: the hero is the brand's own green over a drifting grid, and the object in the second
screen is the bond card rather than a product shot.
