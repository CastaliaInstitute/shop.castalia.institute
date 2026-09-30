# shop.castalia.institute

Shopify storefront working repo for shop.castalia.institute.

## Catalog

The product data lives in `catalog/products.json`, extracted from the Atelier
repo's curated catalog (25 projects in `atelier/app.js` `CURATED_PROJECTS`,
plus `noeticon` and `inq` from the workshop tour) — 27 products across the
Devices, Tools and Studio categories.

```sh
node catalog/extract.mjs   # re-derive products.json from ../atelier
node catalog/validate.mjs  # schema + consistency checks
```

The seed is committed so changes are reviewable as diffs; re-run extract only
after Atelier's catalog changes.

