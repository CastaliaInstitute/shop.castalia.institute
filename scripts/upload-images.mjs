// Upload product images rendered from the Atelier bench to the dev store.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const env = process.env;
const host = `${env.SHOPIFY_STORE_HANDLE.trim()}.myshopify.com`;
const token = env.SHOPIFY_ACCESS_TOKEN.trim();
const state = JSON.parse(readFileSync(resolve(root, 'state/population-state.json'), 'utf8'));
const seed = JSON.parse(readFileSync(resolve(root, 'catalog/products.json'), 'utf8'));

const only = process.argv[2] ? process.argv[2].split(',') : null;

async function gql(query, variables) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://${host}/admin/api/2025-07/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
      return j.data;
    } catch (e) {
      if (a === 2) throw e;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

for (const p of seed.products) {
  if (only && !only.includes(p.id)) continue;
  const png = `/tmp/arts/${p.id}.png`;
  if (!existsSync(png)) { console.log(`skip ${p.id} (no render)`); continue; }
  const st = state.products[p.id];
  if (!st?.gqlId) { console.log(`skip ${p.id} (no gql id)`); continue; }
  const b64 = readFileSync(png).toString('base64');
  const data = await gql(
    `mutation ($productId: ID!, $src: String!, $filename: String!) {
       productCreateMedia(productId: $productId, mediaSources: [{ originalSource: $src, mediaContentType: IMAGE }]) { media { id } mediaUserErrors { field message } }
     }`,
    { productId: st.gqlId, src: `data:image/png;base64,${b64}`, filename: `${p.id}.png` }
  ).catch(() => null);
  // productCreateMedia may not accept data URLs; fall back to REST attachment
  if (!data) {
    const res = await fetch(`https://${host}/admin/api/2025-01/products/${st.gqlId.split('/').pop()}/images.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: { attachment: b64, filename: `${p.id}.png` } }),
    });
    if (res.ok) console.log(`${p.id}: uploaded (rest)`);
    else console.log(`${p.id}: FAILED ${res.status} ${(await res.text()).slice(0, 150)}`);
    continue;
  }
  const errs = data.productCreateMedia.mediaUserErrors;
  if (errs?.length) console.log(`${p.id}: FAILED ${JSON.stringify(errs).slice(0, 150)}`);
  else console.log(`${p.id}: uploaded`);
}
