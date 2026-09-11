# Showcase cards

The three 1620×1620 cards the root README opens with, and the gallery images for the submission.

| File | Where it is used |
|---|---|
| `1-marketplace.png` | root README — the market, with the portfolio strip and the three lists |
| `2-compliance.png` | root README — a bond page, whose buy panel carries the eligibility rule |
| `3-portfolio.png` | root README — holdings, with the network and timestamp in the header |
| `cover.png`, `cover-640x360.png` | the submission's cover image |
| `meta.png` | the wordmark at the top of the root README |
| `og-1200x630.png` | the share card: copied to `apps/web` and `apps/landing` as `opengraph-image.png` |
| `og-square-1024.png` | the same card in a square, for the **logo** field on ETHGlobal — see below |
| `16x9/` | the 1920×1080 submission screenshots |

## Rebuilding a card

`make-card.py` composes one: the dark ground, the heading and subhead in Geist, and the
screenshot rounded and dropped in. The type comes from `fonts/` — Geist 400 and 700 as static
TrueType, under the SIL Open Font License (`fonts/OFL.txt`).

Why TrueType and not the `.woff2` the app ships: ffmpeg's freetype cannot read `.woff2`, and
`drawtext` does not fail when it cannot — it draws in DejaVu Sans and says nothing. The first
version of these cards did exactly that while this file claimed Geist. A render is only Geist if it
differs from the fallback: compare it against the same text with a font file that does not exist.

```sh
python3 docs/showcase/make-card.py '["shot.png","Heading",["First line.","Second line."],"out.png"]'
```

The layout is derived, not hardcoded: the card keeps its screenshot's aspect ratio and the free
space is split above and below, so a shot of any shape still lands balanced. Ground `#0c2d1d`,
heading white, subhead `#8fd0aa`, 88px margins, 22px corner radius.

Screenshots go in `../screenshots/` at their natural size; these cards are built from them.

## The share card, and why there is a square one

`make-og.py` draws both. The bond card on it shows the face value, the discount and the maturity
date — figures fixed at listing — rather than an APY that would be wrong the next day.

ETHGlobal's showcase page uses the project's **logo** as its `og:image`, with a
`summary_large_image` card. A logo is square; X shows a 1.91:1 band cut from the middle of it. So
`og-square-1024.png` puts the whole share card inside that band — rows 244 to 780 — and leaves only
ground above and below. Unfurled on X it is the card; in ETHGlobal's own lists, where the logo is
drawn small, it reads as a green tile. Uploading the plain mark instead gives a better small logo
and a cropped, zoomed share image. It is one field, and it cannot be both.

After changing it, share the link with a query string (`…/showcase/sowee-wux84?v=2`): X caches a
card per URL.
