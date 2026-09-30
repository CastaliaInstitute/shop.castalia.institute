# Requirements: verify-population

## Overview

Script `scripts/verify-population.mjs` compares the live dev store against `catalog/products.json` using read-only Admin GraphQL queries plus one Storefront GraphQL check and one live HTTP check of the storefront. Write-only elsewhere; never mutates.

## Requirements

### R1 — Admin read-back comparison
- **R1.1** — THE script SHALL read all products (handle, title, status, tags, vendor, descriptionHtml, variants{title, price}) and all collections (handle, title, members) from the dev store.
- **R1.2** — THE script SHALL assert the set of product handles equals the seed's 27 ids exactly (no extras, no missing).
- **R1.3** — FOR each product, THE script SHALL assert: status ACTIVE, vendor "Castalia Institute", tags equal seed tags, variant count and per-variant prices equal seed variant prices, title equal seed title.
- **R1.4** — FOR each product with seed priceDetail, THE script SHALL assert the pricing paragraph is present in descriptionHtml; for each product with a pageUrl, that the pageUrl appears in descriptionHtml.
- **R1.5** — FOR each collection, THE script SHALL assert handle+title exist and member handles equal the seed member list.

### R2 — Storefront exposure
- **R2.1** — THE script SHALL query the Storefront GraphQL API (`/api/2025-07/graphql.json`, public X-Shopify-Storefront-Access-Token if available, else unauthenticated `products.json` REST proxy) for the first 50 products, and assert >= 27 products visible.
- **R2.2** — THE script SHALL spot-check the live storefront over HTTPS: `https://u30qxt-cz.myshopify.com/products/ark.json` returns 200 with JSON containing title "Ark" and variant prices 299/529/999/1999; same for 2 more arbitrary handles (e.g. astrolabe, fengshui).

### R3 — Reporting
- **R3.1** — THE script SHALL print a pass/fail line per check group and exit 0 only if every check passes; failures printed per-item, exit 1.
- **R3.2** — THE script SHALL take a `--quiet` flag printing only the summary.

## Acceptance
`node --env-file=.env scripts/verify-population.mjs` exits 0 with the full check table; deliberately corrupting one seed price locally (without saving) would make exit 1 — verified mentally by test harness or a one-off `-t` self-test demonstrating failure detection.
