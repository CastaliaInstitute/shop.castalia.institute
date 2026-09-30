#!/usr/bin/env node
// Validate catalog/products.json against catalog/schema.json plus
// cross-checks that the flat schema cannot express. Exit non-zero on failure.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(resolve(here, 'products.json'), 'utf8'));
const schema = JSON.parse(readFileSync(resolve(here, 'schema.json'), 'utf8'));

const errors = [];

// ---- minimal JSON Schema validator (the slice we use) ---------------------

function checkAgainstSchema(value, sch, path, errs) {
  if (sch.const !== undefined && value !== sch.const) {
    errs.push(`${path}: expected const ${JSON.stringify(sch.const)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (sch.enum && !sch.enum.includes(value)) {
    errs.push(`${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(sch.enum)}`);
    return;
  }
  const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const types = Array.isArray(sch.type) ? sch.type : (sch.type ? [sch.type] : null);
  if (types) {
    const ok = types.some((want) => {
      if (want === 'integer' && typeof value === 'number' && Number.isInteger(value)) return true;
      if (want === 'number' && typeof value === 'number') return true;
      const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
      return t === want;
    });
    if (!ok) {
      errs.push(`${path}: expected ${JSON.stringify(sch.type)}, got ${JSON.stringify(value)}`);
      return;
    }
  }
  if (typeof value === 'string') {
    if (sch.minLength !== undefined && value.length < sch.minLength) errs.push(`${path}: shorter than ${sch.minLength}`);
    if (sch.pattern && !new RegExp(sch.pattern).test(value)) errs.push(`${path}: ${JSON.stringify(value)} fails pattern ${sch.pattern}`);
  }
  if (typeof value === 'number') {
    if (sch.minimum !== undefined && value < sch.minimum) errs.push(`${path}: ${value} < minimum ${sch.minimum}`);
  }
  if (Array.isArray(value)) {
    if (sch.minItems !== undefined && value.length < sch.minItems) errs.push(`${path}: ${value.length} items < minItems ${sch.minItems}`);
    if (sch.maxItems !== undefined && value.length > sch.maxItems) errs.push(`${path}: ${value.length} items > maxItems ${sch.maxItems}`);
    if (sch.uniqueItems) {
      const seen = new Set();
      for (const v of value) {
        const k = JSON.stringify(v);
        if (seen.has(k)) { errs.push(`${path}: duplicate item ${k}`); break; }
        seen.add(k);
      }
    }
    for (const [i, v] of value.entries()) checkAgainstSchema(v, sch.items || {}, `${path}[${i}]`, errs);
  }
  if (t === 'object') {
    for (const req of sch.required || []) {
      if (!(req in value)) errs.push(`${path}: missing required "${req}"`);
    }
    for (const [k, sub] of Object.entries(sch.properties || {})) {
      if (k in value) checkAgainstSchema(value[k], sub, `${path}.${k}`, errs);
    }
  }
}

// ---- run flat schema ------------------------------------------------------

checkAgainstSchema(seed, schema, '$', errors);

// ---- cross-checks ---------------------------------------------------------

const products = seed.products || [];
const collections = seed.collections || [];
const ids = products.map((p) => p.id);
const handles = products.map((p) => p.id); // handle == id by design
const idSet = new Set(ids);
const handleSet = new Set(handles);
if (idSet.size !== ids.length) errors.push('ids: duplicates present');
if (handleSet.size !== handles.length) errors.push('handles: duplicates present');

const colHandles = collections.map((c) => c.handle);
if (new Set(colHandles).size !== colHandles.length) errors.push('collection handles: duplicates present');
for (const c of collections) {
  for (const m of c.members || []) {
    if (!idSet.has(m)) errors.push(`collection ${c.handle}: member "${m}" is not a product id`);
  }
}

for (const p of products) {
  const free = p.offer.price === 0 && !p.offer.notForSale;
  if (free !== p.tags.includes('free') && !p.offer.notForSale) errors.push(`${p.id}: tag 'free' inconsistent with price ${p.offer.price}`);
  if (p.offer.notForSale !== p.tags.includes('not-for-sale')) errors.push(`${p.id}: tag 'not-for-sale' inconsistent with offer`);
  if (p.tags.includes('available-now') && !/available now/i.test(p.availability || '')) errors.push(`${p.id}: 'available-now' tag but availability is "${p.availability}"`);
  // variants must be consistent with offer price: offer.price is the lead variant
  if (p.variants[0].price !== p.offer.price) errors.push(`${p.id}: offer.price ${p.offer.price} != first variant price ${p.variants[0].price}`);
}

// collection rules produce the same membership as declared
const ruleMembers = (rule) => {
  const [kind, value] = rule.split(':');
  return products.filter((p) => {
    if (kind === 'category') return p.category === value;
    if (kind === 'tag') return p.tags.includes(value);
    return false;
  }).map((p) => p.id);
};
for (const c of collections) {
  const want = ruleMembers(c.rule);
  const got = c.members || [];
  const missing = want.filter((x) => !got.includes(x));
  const extra = got.filter((x) => !want.includes(x));
  if (missing.length || extra.length) {
    errors.push(`collection ${c.handle}: rule ${c.rule} mismatch — missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`);
  }
}

// curated facts that must hold (ark's four tiers)
const ark = products.find((p) => p.id === 'ark');
if (ark && JSON.stringify(ark.variants.map((v) => [v.title, v.price])) !==
  JSON.stringify([['Library', 299], ['Librarian', 529], ['Archivist', 999], ['Athenaeum', 1999]])) {
  errors.push('ark: variants do not match the four curated tiers');
}

// ---- summary + result -----------------------------------------------------

if (errors.length) {
  console.error(`VALIDATION FAILED: ${errors.length} error(s)`);
  for (const e of errors.slice(0, 10)) console.error(' - ' + e);
  if (errors.length > 10) console.error(`   …and ${errors.length - 10} more`);
  process.exit(1);
}

const byCat = {};
for (const p of products) byCat[p.category] = (byCat[p.category] || 0) + 1;
console.log(`products.json OK — ${products.length} products, ${collections.length} collections (generated from ${seed.generatedFrom})`);
for (const [cat, n] of Object.entries(byCat)) console.log(`  ${cat}: ${n}`);
for (const c of collections) console.log(`  collection ${c.handle}: ${c.members.length} members`);
