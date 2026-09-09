# Seeding the market

A market with two rows in it does not look like a market. This lists a book of invoices the way
the issuer console does — signed quote from the API, `listInvoice` from the issuer wallet, then
the document hash and the issuer's mark anchored on the audit topic — so a seeded bond is
indistinguishable from a typed one.

```sh
bun run scripts/seed/seed-market.ts --dry-run    # the book, and what it will price at
ISSUER_PK=0x… bun run scripts/seed/seed-market.ts
```

It skips any reference already listed, so it is safe to run twice.

## The book

Grounded in what invoice finance actually charges: fees of 1.5–4% per invoice on net 30/60/90
terms, advancing 70–97% of face. The discount is not set here — the API prices it at 200 bps plus
25 bps per full 30 days — so the spread of tenors is what produces the term structure:

| Reference | Face | Tenor | Discount | Implied APY |
|---|---|---|---|---|
| INV-2026-021 | $480 | 45d | 2.25% | ~18.3% |
| INV-2026-022 | $250 | 29d | 2.00% | ~25.2% |
| INV-2026-023 | $1,250 | 60d | 2.50% | ~15.2% |
| INV-2026-024 | $320 | 90d | 2.75% | ~11.2% |
| INV-2026-025 | $2,400 | 35d | 2.25% | ~23.5% |

Short tenors carry the highest APY, which is how invoice finance behaves: the fee is per invoice,
not per year.

Face values are small on purpose. The market is funded in testnet USDC and there is only so much
of it; a progress bar that cannot move reads as a dead market, which is the opposite of the point.

## The companies are invented

Every issuer and payor here is made up, and the marks in `marks.json` were drawn for them rather
than taken from anywhere. An invoice is a claim that one business owes another money — attaching
that to a real company would be a fabricated financial record about someone who never agreed to
appear in it. The same rule governs the logos: a real mark on a fictional debt is impersonation,
whatever the intent.
