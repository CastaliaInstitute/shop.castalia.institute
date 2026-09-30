# Design: verify-population

## Layout

`scripts/verify-population.mjs` — single read-only script, same host/env resolution as populate.mjs (shared constant duplicated deliberately; no shared module needed at this size).

## Checks implementation

1. **Admin products** (query all 250-cap page): map by handle → compare against seed exactly (R1.2–R1.4): handles set diff both directions; per product: status/vendor/tags (sorted string compare), variants count + prices (order-sensitive: seed order), title, descriptionHtml contains pricing note + pageUrl substring (skip when seed has null pageUrl).
2. **Admin collections**: reads handle/title + member handles; seed membership exact set equality per collection (R1.5). Note: Shopify may auto-add products to `frontpage`; frontpage is not in the seed so it is ignored except reported informationally.
3. **Storefront REST proxy** (R2.1): GET `https://{host}/products.json?limit=250` — public, no auth on dev stores unless password-gated; count products, expect >= 27. If the store is password-protected (dev stores are open by default), report and fall back to admin count labelled "admin-only".
4. **Live spot check** (R2.2): GET `https://{host}/products/ark.json` (+ astrolabe, fengshui): expect HTTP 200, `product.title` correct, variant prices match; parse floats and compare to seed.
5. **Failure self-test** (`--selftest`): run comparison against a mutated in-memory seed (`astrolabe` price 219 → 999) and assert the checker reports a failure and exit non-zero — puts R3.1 honesty to the test.

## Output

Table per group: `products: 27/27 ok`, `collections: 5/5 ok`, `storefront (REST): 27 visible`, `live spot-checks: 3/3 ok`, plus `--selftest: failure detected as expected`. Exit code aggregates.
