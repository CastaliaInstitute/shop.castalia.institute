# Requirements: catalog-source

## Overview

Produce a committed, versioned seed file `catalog/products.json` in shop.castalia.institute containing every Atelier product and the collection assignment plan, derived from the Atelier repo — the single source of truth the population script will consume. No Shopify calls in this spec.

## Data sources (single authority)

1. `CastaliaInstitute/atelier/app.js` — `CURATED_PROJECTS` array (25 products): `id, title, description, price, priceDetail, category ('devices'|'tools'|'studio'), maturity (orchard stage), status, availability, offerKind, checkoutProductId, facultySponsor, pageUrl`.
2. `atelier/workshop/tour.json` — narration text for every product (usable as/with description) plus 2 products not in CURATED_PROJECTS: `noeticon` (own page at `atelier/noeticon/`, "NOETICON — A Ritual Instrument for Developmental Readiness and Learning Attunement") and `inq` (hotspots label: "iNQ — Classics in Inquiry: a continuous shelf of Homer, Virgil, Dante, Milton and Joyce", href https://inq.castalia.institute/).
3. `atelier/workshop/hotspots.json` — labels/href cross-check; note `fengshui` has no `title` in CURATED_PROJECTS (label in hotspots: "Feng Shui", tour narration present).

Total: **27 products**.

## Products and pricing facts

Tiered/multi-variant products (from price/priceDetail):
- `ark` — variants: Library $299, Librarian $529, Archivist $999, Athenaeum $1,999 (comms sled sold separately, noted in description)
- `lunasay` — Pocket 1.85B $229, four-inch $329
- `mynah` — provisioned device $449; software alone (device you own) $59
- `astrolabe` — instrument $219; beta reservation $49 (refundable/creditable)
- All others: single variant. Non-numeric prices map to $0 variant + explicit `pricingNote` retained verbatim in body text ("Not for sale", "Free", "$29 a volume" → price 29 with note, "… a month" → 29 with note).

Member prices (30% member benefit) are preserved as text in the body, not as second variants.

## Requirements

### R1 — Seed file
- **R1.1** — WHEN the extraction script runs, THE SYSTEM SHALL emit `catalog/products.json` containing exactly 27 product objects, one per Atelier product listed above.
- **R1.2** — EACH product object SHALL carry: `id` (Atelier id, also Shopify handle), `title`, `description` (Atelier description, HTML-escaped safe text; tour narration may supplement), `priceDetail` (verbatim), `category`, `maturity`, `status`, `availability` (when present in source), `checkoutProductId` (when present), `facultySponsor` (when present), `pageUrl`, `offer` (kind + resolved numeric price + currency USD + pricingNote), `variants` (array of {title, price}), `tags`.
- **R1.3** — THE SYSTEM SHALL tag every product with `category:<devices|tools|studio>`, `orchard:<Seedling|Sapling|In bloom>`, plus `not-for-sale` when Atelier says "Not for sale", `free` when price is Free, and `available-now` when availability says hardware is available now (astrolabe, mynah).
- **R1.4** — IF a source price is a range or tier list, THE SYSTEM SHALL expand it into explicit variants (R1.2) and SHALL NOT store the range string as a numeric price.

### R2 — Collections plan
- **R2.1** — THE SEED FILE SHALL declare exactly 5 collections: `devices` ("Devices"), `tools` ("Tools"), `studio` ("Studio"), `available-now` ("Available now", membership = products tagged available-now), `free-open` ("Free & open", membership = free items + astrolabe-firmware + MCP tools group), each with title, handle, description, and member product ids.

### R3 — Validation
- **R3.1** — WHEN `node catalog/validate.mjs` runs, THE SYSTEM SHALL validate products.json against a JSON schema committed alongside it (required fields, category/maturity enums, 27-count assertion, unique ids/handles, collection membership refers to existing ids) and exit non-zero on any violation.
- **R3.2** — THE SYSTEM SHALL print a summary table (products by category, collections with counts) on successful validation.

### R4 — Reproducibility
- **R4.1** — THE extraction script (`catalog/extract.mjs`) SHALL read only from the atelier working copy path (configurable, default `../atelier`) and SHALL be committed so the seed can be re-derived when Atelier's catalog changes.
- **R4.2** — SHALL NOT mutate Atelier repo files.

## Out of scope
- Shopify API calls (shopify-population spec), images/artwork, storefront theme.

## Acceptance
`node catalog/extract.mjs && node catalog/validate.mjs` passes from a clean clone; committed products.json reviewed for fidelity against app.js excerpt for at least: ark (4 variants), astrolabe, fengshui, noeticon, inq.
