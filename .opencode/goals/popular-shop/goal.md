# Goal: popular-shop

## Outcome

Populate the Shopify store at shop.castalia.institute with the Atelier product catalog: create every curated Atelier product and its collections via the Shopify Admin API, verified live on the dev store.

## Success metrics

- 27 committed seed products; schema validation passes with zero errors
- Read-back on the dev store (u30qxt-cz.myshopify.com) shows 27 products matching the seed and 5 collections with correct membership
- Storefront domain shop.castalia.institute exposes the products via Storefront API; spot-check of at least 3 products live

## Constraints

- Data source is Atelier's `CURATED_PROJECTS` (atelier/app.js) plus noeticon and inq from tour.json; do not invent products
- Dev store: checkout is not testable; products are created ACTIVE so they are visible on the storefront
- Admin API writes only to the dev store; no storefront theme work in this goal
- Free items must not block storefront visibility; "Not for sale" items get correct tags/pricing rather than being skipped

## Specs

- catalog-source
- shopify-population (depends: catalog-source)
- verify-population (depends: shopify-population)