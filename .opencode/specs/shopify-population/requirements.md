# Requirements: shopify-population

## Overview

Script `scripts/populate.mjs` reads `catalog/products.json` (from spec catalog-source) and creates/updates the products and collections in the Shopify dev store through the Admin GraphQL API, idempotently, with a dry-run mode. Store: u30qxt-cz.myshopify.com ("Castalia Institute"), API version 2025-07.

## Requirements

### R1 — Configuration & connection
- **R1.1** — THE script SHALL read `.env` (via `node --env-file` or dotenv parsing in-script) for `SHOPIFY_ACCESS_TOKEN`; THE script SHALL derive the admin host from `SHOPIFY_STORE_HANDLE` as `${SHOPIFY_STORE_HANDLE}.myshopify.com` and SHALL ignore `SHOPIFY_STORE` if it does not end in `.myshopify.com` (known wrong: `my-store.myshopify.com`).
- **R1.2** — WHEN the token is missing or the API responds 401/403, THE script SHALL stop with a clear message and exit non-zero before any writes.

### R2 — Population behavior
- **R2.1** — WHEN run, THE script SHALL ensure each of the 27 products exists: lookup by handle `id`; create via `productCreate` when absent; update price/description/tags via `productUpdate`/`productVariantsBulkUpdate` and `productSet` when the store state differs from seed.
- **R2.2** — EACH product SHALL be created with: title, description (seed description + priceDetail/pricingNote paragraph), status ACTIVE, vendor "Castalia Institute", tags (seed tags), and the variants from the seed (first variant = default).
- **R2.3** — THE script SHALL create exactly the 5 collections from the seed (`productCollectionCreate` or `collectionCreate`) and add each member product (`collectionAddProductsV2`), matching membership before adding (re-runs must not duplicate members).
- **R2.4** — WHEN any API mutation returns userErrors, THE script SHALL stop, print them verbatim, and exit non-zero; partial success before the failure is acceptable but reported.
- **R2.5** — THE script SHALL respect GraphQL cost throttling: wait when `throttleStatus.currentlyAvailable` falls below a 100-cost buffer (restoreRate 100/s at observed values).

### R3 — Dry-run & state
- **R3.1** — WHEN `--dry-run` is passed, THE script SHALL perform reads only and print per-product intended actions (create|update|skip + reason); no mutations.
- **R3.2** — AFTER each successful run, THE script SHALL write `state/population-state.json` recording product/collection Shopify IDs by seed id, so re-runs skip unchanged items unless `--force` is passed.

### R4 — Idempotence
- **R4.1** — WHEN the script is run twice successively (store unchanged, seed unchanged), THE second run SHALL perform zero writes (all skip).

## Out of scope
- Images/artwork upload, Storefront API verification (verify-population spec), theme work, Metaobject TLC-style content.

## Acceptance
1. `--dry-run` prints 27 create actions + 5 collection actions and exits 0, making zero writes (verified by product count before/after).
2. Real run: admin shows 27 products ACTIVE with correct titles/variants/prices, tags; 5 collections with seed membership.
3. Second real run reports all skip, writes state only.
