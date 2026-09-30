# Tasks: shopify-population

- [ ] 4.1 Write `scripts/populate.mjs` core: env/host resolution (R1.1), gql helper with throttle + userErrors handling (R1.2, R2.5), read-products step.
- [ ] 4.2 Implement product create/update via productSet (single + multi-variant), description assembly with priceDetail (R2.1, R2.2), handle enforcement.
- [ ] 4.3 Implement collection ensure + membership add (R2.3) with existing-membership check.
- [ ] 4.4 Implement `--dry-run` (R3.1) and state file skip logic (R3.2, R4.1); add `state/` to .gitignore.
- [ ] 4.5 Run dry-run: 27 product actions + 5 collections, zero writes, exit 0 (verify product count unchanged).
- [ ] 4.6 Real run against dev store: products + collections created; spot-verify via Admin API read-back (titles/variants/prices/tags for ark, fengshui, noeticon; collections membership counts).
- [ ] 4.7 Re-run: all skip, zero product/collection mutations (R4.1).
- [ ] 4.8 Commit; report any failure verbatim.
