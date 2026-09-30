# Design: shopify-population

## Layout

```
scripts/populate.mjs          # single script, sub-commands via flags
state/population-state.json   # written after successful runs (gitignored)
```

`.gitignore` gets `state/` (machine state, regenerated).

## Connection

- `node --env-file=.env scripts/populate.mjs` — env read via Node's built-in `--env-file` (Node 26). Also tolerate being run with env already set.
- Host: `const host = /^\S+\.myshopify\.com$/.test(process.env.SHOPIFY_STORE || '') ? process.env.SHOPIFY_STORE : \`${process.env.SHOPIFY_STORE_HANDLE}.myshopify.com\`;`
- Endpoint `https://${host}/admin/api/2025-07/graphql.json`, header `X-Shopify-Access-Token`.
- One shared `gql(query, variables)` helper: parses `errors` (hard fail with verbatim print), resolves `throttleStatus` from `extensions.cost` when present, sleeps `(100 - available) / restoreRate` seconds when `currentlyAvailable < 100`.

## Product operations

1. Read: `products(first: 250)` with `handle title status tags vendor description; variants(first: 50) { title price }` → map by handle.
2. For each seed product:
   - absent → `productCreate(input)`: title, descriptionHtml (description + blank line + `<p><strong>Pricing:</strong> priceDetail</p>` when priceDetail meaningful and not bare price), vendor, status ACTIVE, tags, productOptions handled implicitly: create single default variant price = first variant price via input `variants`; for multi-variant products create variants with titles "Library" etc.
   - present → compare title/price set/tags; if different and not `--force`-skip semantics: `productUpdate` + `productVariantsBulkUpdate`; else skip.
3. Multi-variant creation: `productCreate` supports `variants: [{title, price}]` directly (2025-07 Admin API) — one call per product, simplifies options handling (single option "Title"-style implicit; Shopify 2024+ uses options+variants — pass `productOptions` null and legacy variants; if userErrors, fall back to productSet with the modern structure).
   Decision: use `productSet` (sync-first, handles legacy+new formats in one call) with `input: {title, descriptionHtml, vendor, status, tags, productOptions: [{name: 'Tier'|'Title', values}], variants: [{optionValues, price}]}`. Single-variant products get option name 'Title' + value 'Default Title'.

## Collection operations

- Read existing `collections(first: 50) { id handle title products { edges { node { id } } } }` — but collecting members can be expensive; simpler: memberships after creation via collection query per collection.
- Create missing collections `productCollectionCreate` (2025-07) or `collectionCreate` + rule free with manual membership.
- Add members `collectionAddProductsV2(collectionId, productIds)`, skipping products already members (checked from the read in step 2 per collection).
- Available-now/free-open/collections by rule are physical member lists in seed; implementer uses `members` arrays.

## Handles/state

- Shopify handle auto-derives from title; enforce `handle` field to equal seed id by setting the product's handle on create (productCreate input accepts handle) and treating lookup by handle authoritative.
- State file records `{ products: {<id>: {gqlId, updatedAt}}, collections: {...} }`; on re-run, if store read matches seed and state has the id, action = skip (no writes at all).

## Failure semantics

- `userErrors` → print `field: message` list verbatim, exit 1 immediately; state not updated for the failing item (already-written items remain, noted in output).
- 401/403/empty store query → exit 1 before writes with message.

## Alternatives rejected

- REST Admin API (deprecated for product writes in 2025-07 era; GraphQL is required).
- Bulk operations API (overkill for 27 items, result polling complexity).
- StagedUploads/media upload — out of scope (no images).
