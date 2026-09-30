#!/usr/bin/env node
// Extract the Atelier curated catalog into catalog/products.json.
// Sources: atelier/app.js (CURATED_PROJECTS), atelier/workshop/tour.json,
// atelier/workshop/hotspots.json. The Atelier repo is only read, never written.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const atelierDir = resolve(here, process.env.ATELIER_DIR || '../../atelier');

// ---- Atelier app.js: slice CURATED_PROJECTS and split entries -------------

function readCuratedBlock(src) {
  const start = src.indexOf('const CURATED_PROJECTS = [');
  if (start < 0) throw new Error('CURATED_PROJECTS not found in app.js');
  const open = src.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(open + 1, end);
}

// Split a "[ {...}, {...} ]" inner block into object texts using brace depth,
// ignoring braces inside string literals.
function splitEntries(block) {
  const entries = [];
  let depth = 0, inStr = null, esc = false, cur = '', started = false;
  for (const c of block) {
    if (inStr) {
      cur += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { inStr = c; if (!started && depth > 0) started = true; cur += c; continue; }
    if (c === '{') { depth++; started = true; cur += c; continue; }
    if (c === '}') { depth--; cur += c; if (depth === 0 && started) { entries.push(cur); cur = ''; started = false; } continue; }
    if (depth > 0) cur += c;
  }
  return entries;
}

// Decode JS string escapes (\uXXXX, \u2014, \', \n) by routeing through JSON.
function decodeJs(s) {
  const q = JSON.parse('"' + s.replace(/\n/g, '\\n').replace(/"/g, '\\"') + '"');
  return q;
}

function extractField(text, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*('((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"|([^,\\n}]+))`);
  const m = text.match(re);
  if (!m) return undefined;
  let raw = m[2] ?? m[3] ?? m[4];
  if (raw === undefined) return undefined;
  raw = raw.trim();
  if (m[2] !== undefined || m[3] !== undefined) return decodeJs(raw);
  return raw;
}

// Explicit variant tables for products whose Atelier price text is a tier list.
// Values come straight from priceDetail; do not invent.
const VARIANT_TABLE = {
  'ark': [
    { title: 'Library', price: 299 },
    { title: 'Librarian', price: 529 },
    { title: 'Archivist', price: 999 },
    { title: 'Athenaeum', price: 1999 },
  ],
  lunasay: [
    { title: 'Pocket 1.85B', price: 229 },
    { title: 'Four-inch', price: 329 },
  ],
  mynah: [
    { title: 'Provisioned device', price: 449 },
    { title: 'Software alone', price: 59 },
  ],
  astrolabe: [
    { title: 'Instrument', price: 219 },
    { title: 'Beta reservation', price: 49 },
  ],
};

// Products present in the workshop tour/hotspots but not in CURATED_PROJECTS.
const EXTRAS = [
  {
    id: 'noeticon',
    title: 'Noeticon',
    description: 'A ritual instrument for developmental readiness and learning attunement: a study of how thinking actually works, and what happens when you give it good instruments.',
    price: 'Free',
    category: 'devices',
    maturity: 'Seedling',
    pageUrl: 'https://castaliainstitute.github.io/atelier/noeticon/',
  },
  {
    id: 'inq',
    title: 'iNQ — Classics in Inquiry',
    description: 'A continuous shelf of Homer, Virgil, Dante, Milton and Joyce: the old books treated as questions worth arguing with rather than monuments to admire.',
    price: 'Free',
    category: 'studio',
    maturity: 'In bloom',
    pageUrl: 'https://inq.castalia.institute/',
  },
];

function parsePrice(raw) {
  const t = raw.trim();
  if (/^not for sale$/i.test(t)) return { price: 0, pricingNote: t, notForSale: true };
  if (/^free$/i.test(t)) return { price: 0, pricingNote: t };
  const dollar = t.match(/^\$(\d+(?:\.\d+)?)$/);
  if (dollar) return { price: Number(dollar[1]), pricingNote: t };
  const range = t.match(/^\$(\d+(?:\.\d+)?)\s*[–\-]\s*\$?(\d+(?:,\d{3})*(?:\.\d+)?)$/i);
  if (range) return { price: Number(range[1]), pricingNote: t };
  const unit = t.match(/^\$(\d+(?:\.\d+)?)\s+(a\s+\w+|\w+)$/i);
  if (unit) return { price: Number(unit[1]), pricingNote: t };
  throw new Error(`Unrecognised price format: "${t}" (add to VARIANT_TABLE or parser)`);
}

function buildTags(p, priceInfo) {
  const tags = [`category:${p.category}`];
  if (p.maturity) tags.push(`orchard:${p.maturity.toLowerCase().replace(/\s+/g, '-')}`);
  if (priceInfo.notForSale) tags.push('not-for-sale');
  else if (priceInfo.price === 0) tags.push('free');
  if (/available now/i.test(p.availability || '')) tags.push('available-now');
  return tags;
}

// Atelier entries lacking pageUrl but with a known public location.
const PAGE_URL_FALLBACKS = {
  'persona-reliquary': 'https://castaliainstitute.github.io/atelier/reliquary/',
  'atma-ambisonic': 'https://castaliainstitute.github.io/atelier/atma-ambisonic/',
  'mcp-tools': 'https://github.com/CastaliaInstitute/atelier',
};
const SITE_BASE = 'https://castaliainstitute.github.io/atelier';

function main() {
  const appJs = readFileSync(resolve(atelierDir, 'app.js'), 'utf8');
  const tour = JSON.parse(readFileSync(resolve(atelierDir, 'workshop/tour.json'), 'utf8'));
  let hotspots = [];
  try {
    hotspots = JSON.parse(readFileSync(resolve(atelierDir, 'workshop/hotspots.json'), 'utf8'));
  } catch { /* cross-check is best-effort */ }
  const hotspotById = new Map(hotspots.map((h) => [h.id, h]));

  const block = readCuratedBlock(appJs);
  const entries = splitEntries(block);
  if (entries.length !== 25) throw new Error(`Expected 25 CURATED_PROJECTS entries, got ${entries.length}`);

  const products = [];
  const usedTitles = new Set();

  for (const text of entries) {
    const p = {
      id: extractField(text, 'id'),
      title: extractField(text, 'title'),
      description: extractField(text, 'description') || tour.narration[extractField(text, 'id')] || '',
      priceDetail: extractField(text, 'priceDetail') || '',
      category: extractField(text, 'category'),
      maturity: extractField(text, 'maturity'),
      status: extractField(text, 'status'),
      availability: extractField(text, 'availability'),
      offerKind: extractField(text, 'offerKind'),
      checkoutProductId: extractField(text, 'checkoutProductId'),
      facultySponsor: extractField(text, 'facultySponsor'),
      pageUrl: extractField(text, 'pageUrl'),
    };
    if (!p.id) throw new Error(`Entry without id: ${text.slice(0, 80)}`);
    // fengshui has no title in CURATED_PROJECTS; fall back to hotspots label.
    if (!p.title) {
      const h = hotspotById.get(p.id);
      if (!h || !h.label) throw new Error(`No title for ${p.id} and no hotspots label`);
      p.title = h.label;
    }
    if (usedTitles.has(p.title)) throw new Error(`Duplicate title: ${p.title}`);
    usedTitles.add(p.title);
    if (!p.pageUrl) {
      const h = hotspotById.get(p.id);
      p.pageUrl = PAGE_URL_FALLBACKS[p.id] || (h && h.href && /^https?:/.test(h.href) ? h.href : null);
      if (!p.pageUrl) throw new Error(`No pageUrl for ${p.id} and no fallback`);
    } else if (p.pageUrl.startsWith('/')) {
      p.pageUrl = SITE_BASE + p.pageUrl;
    }

    const priceRaw = extractField(text, 'price') || 'Not for sale';
    const priceInfo = parsePrice(priceRaw);
    const variants = VARIANT_TABLE[p.id]
      ? VARIANT_TABLE[p.id].slice()
      : [{ title: p.title, price: priceInfo.price }];

    products.push({
      id: p.id,
      title: p.title,
      description: p.description,
      priceDetail: p.priceDetail || priceInfo.pricingNote,
      category: p.category,
      maturity: p.maturity,
      status: p.status,
      availability: p.availability,
      offerKind: p.offerKind,
      checkoutProductId: p.checkoutProductId || null,
      facultySponsor: p.facultySponsor || null,
      pageUrl: p.pageUrl,
      offer: {
        price: variants[0].price,
        currency: 'USD',
        pricingNote: priceInfo.pricingNote,
        notForSale: Boolean(priceInfo.notForSale),
      },
      variants,
      tags: buildTags(p, priceInfo),
    });
  }

  for (const extra of EXTRAS) {
    if (products.some((p) => p.id === extra.id)) continue;
    const priceInfo = parsePrice(extra.price);
    products.push({
      id: extra.id,
      title: extra.title,
      description: extra.description,
      priceDetail: priceInfo.pricingNote,
      category: extra.category,
      maturity: extra.maturity,
      status: 'development',
      availability: undefined,
      offerKind: undefined,
      checkoutProductId: null,
      facultySponsor: null,
      pageUrl: extra.pageUrl,
      offer: {
        price: priceInfo.price,
        currency: 'USD',
        pricingNote: priceInfo.pricingNote,
        notForSale: Boolean(priceInfo.notForSale),
      },
      variants: [{ title: extra.title, price: priceInfo.price }],
      tags: buildTags(extra, priceInfo),
    });
  }

  // Cross-check titles against hotspots (warn only).
  for (const p of products) {
    const h = hotspotById.get(p.id);
    if (h && h.label && h.label !== p.title) {
      console.warn(`note: hotspots label "${h.label}" != title "${p.title}" for ${p.id}`);
    }
  }

  const byCategory = (cat) => products.filter((p) => p.category === cat).map((p) => p.id);
  const collections = [
    {
      handle: 'devices', title: 'Devices', rule: 'category:devices',
      description: 'Hardware instruments from the Atelier bench: round instruments, rebuilt phones, and contraptions for when the grid goes down.',
      members: byCategory('devices'),
    },
    {
      handle: 'tools', title: 'Tools', rule: 'category:tools',
      description: 'Open tools that earn their keep: the playgrounds and connectors behind the work.',
      members: byCategory('tools'),
    },
    {
      handle: 'studio', title: 'Studio', rule: 'category:studio',
      description: 'The published side of the Atelier: books, scores, plans and teaching.',
      members: byCategory('studio'),
    },
    {
      handle: 'available-now', title: 'Available now', rule: 'tag:available-now',
      description: 'Hardware you can order today.',
      members: products.filter((p) => p.tags.includes('available-now')).map((p) => p.id),
    },
    {
      handle: 'free-open', title: 'Free & open', rule: 'tag:free',
      description: 'Everything the Atelier gives away: free instruments, feeds and firmware.',
      members: products.filter((p) => p.tags.includes('free')).map((p) => p.id),
    },
  ];

  let generatedFrom = 'unknown';
  try {
    generatedFrom = execSync(`git -C ${JSON.stringify(atelierDir)} rev-parse --short HEAD`, { encoding: 'utf8' }).trim()
      + ' (atelier HEAD; clean unless noted)';
  } catch { /* non-fatal */ }

  const out = { version: 1, generatedFrom, products, collections };
  const dest = resolve(here, 'products.json');
  writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${dest}: ${products.length} products, ${collections.length} collections`);
  for (const c of collections) console.log(`  ${c.handle}: ${c.members.length} members`);
}

main();
