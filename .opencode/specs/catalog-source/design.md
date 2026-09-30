# Design: catalog-source

## Layout

```
catalog/
  extract.mjs      # parses atelier sources -> products.json (idempotent, re-runnable)
  validate.mjs     # schema + consistency validation, exit non-zero on failure
  schema.json      # JSON Schema for products.json
  products.json    # committed artifact (generated, committed for reviewability)
```

## extract.mjs

- Node 26, no dependencies (regex + JSON parsing; the Atelier data is a plain JS object literal, not ESM-importable, so slice the `CURATED_PROJECTS` block between anchors `const CURATED_PROJECTS = [` and `].map(` and split entries on top-level `{`...`}` pairs using a small brace-depth scanner).
- Reads:
  - `${ATELIER_DIR:-../atelier}/app.js` — entries, via brace scanner; then per entry a keyed extraction (`id`, `title`, `description`, `price`, `priceDetail`, `category`, `maturity`, `status`, `availability`, `offerKind`, `checkoutProductId`, `facultySponsor`, `pageUrl`). Handles `fengshui` lacking `title` (falls back to hotspots label "Feng Shui") and `\uXXXX` escapes via JSON.parse on a quoted wrapper.
  - `${ATELIER_DIR}/workshop/tour.json` — narration map (supplementary text) and the two extra products `noeticon`, `inq` with hand-maintained records in the script's `EXTRAS` constant (title/description/pageUrl as read from hotspots.json + tour.json narration), so the Atelier repo stays untouched.
  - `${ATELIER_DIR}/workshop/hotspots.json` — labels for cross-check; warn on mismatch, don't fail.
- Price parsing: single-values (`$219`) → number; `Free`/`Not for sale` → 0 with pricingNote; `$X a volume`/`a score` → number + unit note; ranges/tiers parsed from the three known multi-variant products via a `VARIANT_TABLE` constant (ark, lunasay, mynah, astrolabe — explicit values from requirements) since these four are curated decisions, not parseable text. Any future unknown price format fails loudly.
- Tags per R1.3; collections per R2.1 built from category + availability/free rules plus explicit member lists for `free-open` (astrolabe-firmware, openscad-playground, maybe-something-seasonal, mcp-tools) — wait: maybe-something-seasonal is tagged category studio AND free; it belongs in free-open too by rule "price Free".
- Writes `catalog/products.json` with a `generatedFrom` header (atelier git sha if clean, else timestamp) for traceability.

## schema.json (draft skeleton)

- `type: object`, required `version, generatedFrom, products, collections`
- `products: array minItems 27 maxItems 27`, items require the R1.2 fields; `category` enum, `maturity` enum, `variants` minItems 1, prices `>= 0` numbers.
- `collections: array minItems 5 maxItems 5`, unique handles, `members` all resolve to product ids.

## validate.mjs

- Loads schema.json, runs a minimal in-repo validator (~60 lines: type/required/enum/min-max, no external lib), then cross-checks: unique ids/handles, collection membership ⊆ product ids, tag rules consistent with offer (free ⇒ tag free; "Not for sale" ⇒ tag not-for-sale; available-now ⇒ astrolabe|mynah), price-detail variant spot rules (ark = 4 variants).
- Prints summary table; non-zero exit + first 10 errors listed on failure.

## Alternatives rejected

- Importing app.js as a module (it's a browser script with DOM listeners at top level — cannot import cleanly).
- Python extractor (repo is Shopify/Node oriented; keep one runtime).
- Generating products.json only, not committing it (reviewability of the data diff is the point of this spec).
