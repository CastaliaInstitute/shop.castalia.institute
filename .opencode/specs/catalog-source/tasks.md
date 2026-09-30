# Tasks: catalog-source

## 1. Catalog module
- [x] 1.1 Write `catalog/schema.json` per design (27 products, 5 collections, enums, variant floor).
- [x] 1.2 Write `catalog/extract.mjs`: brace-depth scanner over CURATED_PROJECTS, keyed field extraction, \u escape decode, tour.json merge, EXTRAS records (noeticon, inq), price parsing + VARIANT_TABLE enforcement, fengshui title fallback from hotspots, tag + collection builders, `generatedFrom` header, write products.json.
- [x] 1.3 Write `catalog/validate.mjs`: mini JSON Schema validator (types/required/enum/minItems/maxItems), cross-checks (unique ids/handles, membership resolution, tag/offer consistency, ark=4 variants), summary table, exit codes.

## 2. Generate and verify data
- [x] 2.1 Run extract.mjs against ../atelier; commit generated products.json.
- [x] 2.2 Run validate.mjs; zero errors. Spot-check fidelity for ark (4 variants $299/$529/$999/$1,999), astrolabe (2 variants), fengshui (title "Feng Shui", not-for-sale tag), noeticon + inq present, 27 total, collection counts add up per rules.
- [x] 2.3 Re-run extraction twice, diff clean (idempotence).

## 3. Wrap-up
- [x] 3.1 Update README with a Catalog section (commands, data source pointer).
- [x] 3.2 Commit; all tasks verified.
