# Showcase cards

The three 1620×1620 cards the root README opens with, and the gallery images for the submission.

| File | Where it is used |
|---|---|
| `1-marketplace.png` | root README — the market, with the portfolio strip and the three lists |
| `2-compliance.png` | root README — a bond page, whose buy panel carries the eligibility rule |
| `3-portfolio.png` | root README — holdings, with the network and timestamp in the header |
| `cover.png`, `cover-640x360.png` | the submission's cover image |
| `meta.png` | the wordmark at the top of the root README |
| `16x9/` | the 1920×1080 submission screenshots |

## Rebuilding a card

`make-card.py` composes one: the dark ground, the heading and subhead in Geist, and the
screenshot rounded and dropped in. It reads the type from the app's own font, so the cards and
the product cannot drift apart.

```sh
python3 docs/showcase/make-card.py '["shot.png","Heading",["First line.","Second line."],"out.png"]'
```

The layout is derived, not hardcoded: the card keeps its screenshot's aspect ratio and the free
space is split above and below, so a shot of any shape still lands balanced. Ground `#0c2d1d`,
heading white, subhead `#8fd0aa`, 88px margins, 22px corner radius.

Screenshots go in `../screenshots/` at their natural size; these cards are built from them.
