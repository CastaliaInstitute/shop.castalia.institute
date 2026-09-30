#!/usr/bin/env node
// Populate the Shopify dev store from catalog/products.json.
// Usage: node --env-file=.env scripts/populate.mjs [--dry-run] [--force]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

// ---- config (R1.1) ---------------------------------------------------------

const env = process.env;
// Known-good host = <handle>.myshopify.com. SHOPIFY_STORE may be present but
// wrong in .env (observed: "my-store.myshopify.com"); the handle is authoritative.
const handle = (env.SHOPIFY_STORE_HANDLE || '').trim();
const storeEnv = (env.SHOPIFY_STORE || '').trim();
const host = handle
  ? `${handle}.myshopify.com`
  : /^\S+\.myshopify\.com$/.test(storeEnv)
    ? storeEnv
    : (() => { console.error('Missing SHOPIFY_STORE_HANDLE and SHOPIFY_STORE is not a shopify domain'); process.exit(1); })();
const token = (env.SHOPIFY_ACCESS_TOKEN || '').trim();
if (!token) {
  console.error('No SHOPIFY_ACCESS_TOKEN in environment. Run with: node --env-file=.env scripts/populate.mjs');
  process.exit(1);
}
const endpoint = `https://${host}/admin/api/2025-07/graphql.json`;

// derive SHOPIFY_ACCESS_TOKEN from env passed via --env-file
// Node --env-file loads ./.env relative to cwd; document in README.
// Design note (R1.1): the store host is derived from SHOPIFY_STORE_HANDLE
// even when SHOPIFY_STORE looks like a domain, because .env's SHOPIFY_STORE
// value was observed to be a stale placeholder ("my-store.myshopify.com").

const seed = JSON.parse(readFileSync(resolve(root, 'catalog/products.json'), 'utf8'));

// ---- GraphQL helper (R1.2, R2.5) ------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error ${res.status}: token rejected for ${host}. Check SHOPIFY_ACCESS_TOKEN.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${endpoint}: ${await res.text()}`);
    process.exit(1);
  }
  const body = await res.json();
  if (body.errors) {
    console.error('GraphQL errors:', JSON.stringify(body.errors, null, 2));
    process.exit(1);
  }
  const cost = body.extensions?.cost;
  if (cost?.throttleStatus) {
    const { currentlyAvailable, restoreRate } = cost.throttleStatus;
    if (currentlyAvailable < 100) {
      const wait = Math.max(0, (100 - currentlyAvailable) / (restoreRate || 100));
      if (!dryRun) await sleep(wait * 1000);
    }
  }
  return body.data;
}

function assertNoUserErrors(result, what) {
  const errs = result?.userErrors || [];
  if (errs.length) {
    console.error(`userErrors for ${what}:`);
    for (const e of errs) console.error(` - ${e.field?.join('.') || ''}: ${e.message}`);
    process.exit(1);
  }
}

// ---- description assembly (R2.2) -------------------------------------------

function buildDescriptionHtml(p) {
  const parts = [p.description];
  const note = p.offer.pricingNote && p.offer.pricingNote !== p.title ? p.offer.pricingNote : null;
  if (p.priceDetail && p.priceDetail.trim()) {
    parts.push(`<p><strong>Atelier pricing:</strong> ${escapeHtml(p.priceDetail)}</p>`);
  } else if (note) {
    parts.push(`<p><strong>Atelier pricing:</strong> ${escapeHtml(note)}</p>`);
  }
  if (p.pageUrl) {
    parts.push(`<p>See the work at <a href="${p.pageUrl}">${p.title} →</a></p>`);
  }
  return parts.join('\n\n');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- read current store ----------------------------------------------------

async function readProducts() {
  const q = `{
    products(first: 250) {
      edges {
        node {
          id handle title status tags vendor
          variants(first: 50) { edges { node { id title price } } }
        }
      }
    }
  }`;
  const data = await gql(q);
  return new Map(data.products.edges.map(({ node }) => [node.handle, node]))
}

async function readCollections() {
  const q = `{
    collections(first: 50) {
      edges {
        node {
          id handle title description
          products(first: 250) { edges { node { id } } }
        }
      }
    }
  }`;
  const data = await gql(q);
  return new Map(data.collections.edges.map(({ node }) => [node.handle, node]));
}

// ---- productSet input builder ----------------------------------------------

function productSetInput(p) {
  const multi = p.variants.length > 1;
  const optionName = multi ? 'Tier' : 'Title';
  return {
    title: p.title,
    descriptionHtml: buildDescriptionHtml(p),
    vendor: 'Castalia Institute',
    status: 'ACTIVE',
    tags: p.tags,
    productOptions: [
      { name: optionName, values: p.variants.map((v) => ({ name: multi ? v.title : 'Default Title' })) },
    ],
    variants: p.variants.map((v, i) => ({
      optionValues: [
        { optionName, name: multi ? v.title : 'Default Title' },
      ],
      price: String(v.price),
      ...(multi ? {} : { title: undefined }),
      ...(i === 0 ? {} : {}),
    })),
    handle: p.id,
  };
}

// ---- main actions -----------------------------------------------------------

const statePath = resolve(root, 'state/population-state.json');
let state = { products: {}, collections: {} };
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'));
} catch { /* fresh */ }

let writes = 0;

async function ensureProduct(p, existing) {
  const wanted = productSetInput(p);
  const cur = existing.get(p.id);
  const sameVariants = cur &&
    cur.variants.edges.map((e) => ({ t: e.node.title, pr: Number(e.node.price) }))
      .every((v, i) => {
        const w = p.variants[i];
        return w && w.price === v.pr;
      }) &&
    cur.variants.edges.length === p.variants.length;
  const sameMeta = cur &&
    cur.title === p.title &&
    cur.status === 'ACTIVE' &&
    JSON.stringify([...cur.tags].sort()) === JSON.stringify([...p.tags].sort());

  if (cur && sameMeta && sameVariants && !force) {
    return `skip (${p.title} — exact match)`;
  }

  const action = cur ? 'update' : 'create';
  if (dryRun) {
    return `${action} (${p.title}${cur ? ' — differs' : ' — new'})`;
  }

  const input = wanted;
  if (cur) input.id = cur.id;
  const data = await gql(
    `mutation ($input: ProductSetInput!) { productSet(input: $input) { product { id handle } userErrors { field message } } }`,
    { input },
  );
  assertNoUserErrors(data.productSet, `productSet ${p.id}`);
  writes++;
  return `${action}d ${p.title} → ${data.productSet.product.id}`;
}

async function ensureCollection(c, existing, productIdsByHandle) {
  const cur = existing.get(c.handle);
  const missingHandles = c.members.filter((h) => !cur || !cur.products.edges.some((e) => productIdsByHandle.get(h) === e.node.id));
  if (cur && missingHandles.length === 0 && !force) {
    return `skip (${c.title} — membership complete)`;
  }
  const action = cur ? 'update' : 'create';
  if (dryRun) {
    return `${action} (${c.title}${cur ? ` — add ${missingHandles.length} members` : ' — new'})`;
  }
  let id = cur?.id;
  if (!id) {
    const data = await gql(
      `mutation ($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }`,
      { input: { title: c.title, descriptionHtml: c.description, handle: c.handle } },
    );
    assertNoUserErrors(data.collectionCreate, `collectionCreate ${c.handle}`);
    id = data.collectionCreate.collection.id;
    writes++;
  }
  if (missingHandles.length) {
    const ids = missingHandles.map((h) => productIdsByHandle.get(h)).filter(Boolean);
    if (ids.length) {
      // collectionAddProductsV2 is asynchronous (returns a Job) — no collection
      // payload to inspect; userErrors only.
      const data = await gql(
        `mutation ($id: ID!, $productIds: [ID!]!) { collectionAddProductsV2(id: $id, productIds: $productIds) { job { id done } userErrors { field message } } }`,
        { id, productIds: ids },
      );
      assertNoUserErrors(data.collectionAddProductsV2, `collectionAddProductsV2 ${c.handle}`);
      writes++;
    }
  }
  return `${cur ? 'updated' : 'created'} ${c.title}`;
}

// ---- main -------------------------------------------------------------------

async function main() {
  console.log(`Store: ${host}${dryRun ? ' (dry run — no writes)' : ''}\n`);

  const existing = await readProducts();
  const existingCols = await readCollections();

  // products
  const productActions = [];
  for (const p of seed.products) {
    productActions.push(ensureProduct(p, existing));
  }
  const productResults = await Promise.all(productActions);
  productResults.forEach((r, i) => console.log(`  [${seed.products[i].id}] ${r}`));

  // resolve product gql ids by handle for collection membership
  const now = await readProducts();
  const productIdsByHandle = new Map([...now.entries()].map(([h, n]) => [h, n.id]));

  // collections
  for (const c of seed.collections) {
    const line = await ensureCollection(c, existingCols, productIdsByHandle);
    console.log(`  [${c.handle}] ${line}`);
  }

  // state
  if (!dryRun) {
    mkdirSync(resolve(root, 'state'), { recursive: true });
    state.lastRun = new Date().toISOString();
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  }

  const totalWrites = productResults.filter((r) => !r.startsWith('skip')).length;
  console.log(`\nDone: ${totalWrites} product mutations${dryRun ? ' (dry run — none executed)' : `, ~${writes} API writes`}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
