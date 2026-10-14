/* Lit Neon v2 — search.js (WS0-C, brief §4.0 search, §4.23, §6.2). Same signatures as the freeze stub (CONTRACT.md E11):
     search(q, { limit=8 }) → Promise<[{ title, url, type, excerpt }]>                       (flat, best first)
     query(q, { limit }) → Promise<{ designs[], collections[], guides[], help[], pages[] }>    (items { id, title, sub, href, mini?, card?, excerpt, score })
     ready() → Promise<index>      setIndex(json)  (tests / pages that already hold the index)
   Source: /lit-neon-preview/rework/data/search-index.json (tools/build-search-index.mjs). Without it, the same items are built at runtime from
   data/{designs,collections,guides,faq}.json plus the fixed ROUTES, so search is never a dead control.
   Matching: accents folded, '&' read as 'and', light English stemming (signs→sign, weddings→wedding, lighting→light),
   UK/US and everyday synonyms (color→colour, ship→delivery, cost→price, mount→hang…), prefix matching while typing,
   one-typo tolerance on words of 5+ letters (two on 9+), field weights (title > tags > subtitle/excerpt > body), a phrase
   bonus, and an AND-ish coverage rule (with 2+ words, an item must match at least half of them). Default group sizes
   match the header (designs 6, the rest 4); `limit` overrides every group. */
export const STUB = false;

export const ROUTES = [
  { title: 'Design your sign', url: '/lit-neon-preview/rework/create.html', type: 'page', excerpt: 'Type your words, pick lettering, colour and size — a price as you go.', tags: 'design custom builder neon sign words price create' },
  { title: 'Ready-made signs', url: '/lit-neon-preview/rework/shop.html', type: 'page', excerpt: 'Our catalogue designs by room, occasion and style.', tags: 'shop ready made designs catalogue bestsellers' },
  { title: 'Upload a logo', url: '/lit-neon-preview/rework/upload.html', type: 'page', excerpt: 'A designer redraws your logo in tube and emails a free mockup.', tags: 'logo upload mockup business artwork photo' },
  { title: 'Help centre', url: '/lit-neon-preview/rework/help.html', type: 'page', excerpt: 'Ordering, delivery, returns, fitting and care.', tags: 'help faq questions' },
  { title: 'Delivery', url: '/lit-neon-preview/rework/delivery.html', type: 'page', excerpt: 'Free, tracked delivery across mainland GB; check your postcode.', tags: 'delivery postcode shipping when arrive' },
  { title: 'Returns and warranty', url: '/lit-neon-preview/rework/returns.html', type: 'page', excerpt: 'How returns and the warranty work for custom and ready-made signs.', tags: 'returns warranty refund faulty' },
  { title: 'Weddings and events', url: '/lit-neon-preview/rework/weddings.html', type: 'page', excerpt: 'Names, dates and lines from the vows, lit for the day and kept after.', tags: 'wedding event names mr mrs' },
  { title: 'Business signs', url: '/lit-neon-preview/rework/business.html', type: 'page', excerpt: 'Shopfronts, cafés, salons and offices — logos and words.', tags: 'business shop cafe salon office bulk' },
  { title: 'Guides', url: '/lit-neon-preview/rework/guides.html', type: 'page', excerpt: 'Sizing, installation, colours, care.', tags: 'guide sizing install hang colours care' },
  { title: 'Contact', url: '/lit-neon-preview/rework/contact.html', type: 'page', excerpt: 'WhatsApp, email or the form — a person replies.', tags: 'contact email whatsapp talk' }
];

/* ---------- text normalisation ---------- */
const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'my', 'your', 'our', 'and', 'or', 'with', 'is', 'it', 'do', 'you', 'i', 'can', 'me', 'be', 'are', 'what', 'how', 'does', 'at', 'by']);
export const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/['’‘`]/g, '');
export function stem(t) {
  if (t.length <= 3 || /\d/.test(t)) return t;
  /* plural first, then -ing / -ed on what is left, so "weddings" and "wedding" meet at the same stem */
  if (t.endsWith('ies') && t.length > 4) t = t.slice(0, -3) + 'y';
  else if (/(ches|shes|xes|sses|zes)$/.test(t)) t = t.slice(0, -2);
  else if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) t = t.slice(0, -1);
  if (t.endsWith('ing') && t.length > 5) { const b = t.slice(0, -3); return /(.)\1$/.test(b) && !/(ll|ss)$/.test(b) ? b.slice(0, -1) : b; }
  if (t.endsWith('ed') && t.length > 4 && !t.endsWith('eed')) return t.slice(0, -2);
  return t;
}
export const words = s => fold(s).split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t));
export const tokens = s => words(s).map(stem);

const SYN = [
  ['colour', 'color'], ['grey', 'gray'], ['centre', 'center'], ['personalise', 'personalize', 'custom', 'bespoke'],
  ['price', 'cost', 'much', 'cheap', 'pricing'], ['delivery', 'deliver', 'ship', 'shipping', 'postage', 'courier', 'arrive'],
  ['return', 'refund', 'exchange'], ['warranty', 'guarantee', 'faulty', 'broken', 'repair'], ['hang', 'mount', 'install', 'fit', 'fix', 'wall', 'screw'],
  ['size', 'big', 'dimension', 'measure', 'large', 'small', 'width'], ['wedding', 'bride', 'marriage', 'engagement', 'mr', 'mrs'],
  ['game', 'gamer', 'gaming'], ['logo', 'brand', 'artwork'], ['bar', 'pub', 'drink', 'cocktail'], ['salon', 'beauty', 'hair', 'nail', 'lash'],
  ['office', 'work', 'workplace'], ['kid', 'child', 'nursery', 'baby'], ['mum', 'mom', 'mother'], ['christmas', 'xmas'], ['birthday', 'bday'],
  ['font', 'lettering', 'typeface', 'letter'], ['led', 'neon', 'light', 'tube'], ['dimmer', 'dim', 'brightness', 'remote'], ['plug', 'power', 'cable', 'adapter', 'mains'],
  ['outdoor', 'outside', 'garden', 'waterproof'], ['gift', 'present'], ['photo', 'picture', 'image'], ['cafe', 'coffee', 'restaurant']
].map(g => g.map(stem));
const SYN_OF = new Map(); SYN.forEach(g => g.forEach(t => SYN_OF.set(t, g)));

/* Damerau–Levenshtein with an early exit above `max` */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false; if (a === b) return true;
  const n = a.length, m = b.length; let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) { const cur = [i]; let best = i; for (let j = 1; j <= m; j++) { const cost = a[i - 1] === b[j - 1] ? 0 : 1; let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost); if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1); cur.push(v); if (v < best) best = v; } if (best > max) return false; prev2 = prev; prev = cur; }
  return prev[m] <= max;
}

/* ---------- index ---------- */
const W = { title: 6, tags: 3, sub: 2, excerpt: 2, body: 1 };
function prepare(items) {
  return items.map(it => {
    const f = {}; for (const k of Object.keys(W)) f[k] = new Set(tokens(it[k] || ''));
    const all = new Set(); Object.values(f).forEach(s => s.forEach(t => all.add(t)));
    return { it, f, all: Array.from(all), titleFold: fold(it.title).replace(/[^a-z0-9]+/g, ' ').trim() };
  });
}
/* same rule as tools/build-search-index.mjs: help.html renders only help:true questions, the rest live on the hubs that
   list them in `pages`, and a question rendered nowhere links to its own first link (never a dead #anchor) */
const FAQ_HUBS = ['business', 'weddings', 'upload'];
export function faqHref(q) {
  const id = encodeURIComponent(q.id);
  if (q.help) return `/lit-neon-preview/rework/help.html#${id}`;
  const hub = FAQ_HUBS.find(p => (q.pages || []).includes(p));
  if (hub) return `/lit-neon-preview/rework/${hub}.html#${id}`;
  const l = (q.links || []).map(x => String(x.href || '').replace(/^\//, '')).find(h => h && !/^[a-z]+:/i.test(h));
  return l ? `/lit-neon-preview/rework/${l}` : null;
}
function fromData([d, c, g, f]) {
  const designs = (d && (d.designs || d)) || [], cols = (c && (c.collections || c)) || [], guides = (g && (g.guides || g)) || [], faq = (f && (f.questions || f.faq || f)) || [];
  const strip = s => String(s || '').replace(/\{[a-z]+:[^}]*\}/gi, '').replace(/\s{2,}/g, ' ').trim();
  const colName = id => (cols.find(x => x.id === id) || {}).name || id;
  return [
    ...(Array.isArray(designs) ? designs : []).map(x => ({ type: 'designs', id: x.id, title: x.name, sub: (x.collections || [])[0] ? colName(x.collections[0]).replace(/ neon signs?$/i, '') : '', href: `/lit-neon-preview/rework/product.html?id=${encodeURIComponent(x.id)}`, excerpt: strip(x.blurb), tags: [...(x.lines || []), ...(x.collections || []).map(colName), ...Object.values(x.tags || {}).flat()].join(' '), mini: { text: (x.lines || []).join(' ') || x.name, font: x.font, colour: x.colour }, rank: x.bestseller ? (x.bestsellerRank || 50) : 100 })),
    ...(Array.isArray(cols) ? cols : []).map(x => { const s = designs.find(y => y.id === x.prefilledDesign) || designs.find(y => (y.collections || []).includes(x.id)); return { type: 'collections', id: x.id, title: x.name, sub: x.eyebrow || '', href: x.redirect ? `/lit-neon-preview/rework/${x.redirect}` : `/lit-neon-preview/rework/collection.html?c=${encodeURIComponent(x.id)}`, excerpt: strip(x.intro).split('. ')[0], tags: [x.nav, x.h1, ...(x.phrases || [])].join(' '), body: strip(x.intro), ...(s ? { mini: { text: (s.lines || []).join(' ') || s.name, font: s.font, colour: s.colour } } : {}) }; }),
    ...(Array.isArray(guides) ? guides : []).map(x => ({ type: 'guides', id: x.slug, title: x.title, sub: x.readingMinutes ? `${x.readingMinutes} min read` : '', href: '/lit-neon-preview/rework/' + String(x.href || `guides/${x.slug}.html`).replace(/^\//, ''), excerpt: strip(x.excerpt), tags: [x.category, ...(x.keywords || [])].join(' ') })),
    ...(Array.isArray(faq) ? faq : []).map(x => ({ x, href: faqHref(x) })).filter(o => o.href).map(({ x, href }) => ({ type: 'help', id: x.id, title: strip(x.q), sub: '', href, excerpt: strip(x.a).split('. ')[0], tags: [...(x.keywords || []), ...(x.tags || [])].join(' '), body: strip(x.a) })),
    ...ROUTES.map(r => ({ type: 'pages', id: r.url.replace(/^\/|\.html$/g, ''), title: r.title, sub: '', href: r.url, excerpt: r.excerpt, tags: r.tags }))
  ];
}
const getJSON = url => (typeof fetch === 'function' ? fetch(url, { cache: 'no-store' }).then(r => (r && r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
let indexPromise = null, prepared = null;
export function setIndex(json) { const items = Array.isArray(json) ? json : (json && json.items) || []; indexPromise = Promise.resolve({ items }); prepared = prepare(items); return prepared.length; }
export const ready = () => indexPromise || (indexPromise = getJSON('/lit-neon-preview/rework/data/search-index.json').then(async idx => {
  if (idx && Array.isArray(idx.items) && idx.items.length) return idx;
  const data = await Promise.all(['designs', 'collections', 'guides', 'faq'].map(n => getJSON(`/lit-neon-preview/rework/data/${n}.json`)));
  return { items: fromData(data), fallback: true };
}));
const prep = async () => { if (prepared) return prepared; const idx = await ready(); prepared = prepare(idx.items || []); return prepared; };

/* ---------- scoring ---------- */
function scoreOf(p, qTerms, qFold, last) {
  let total = 0, matched = 0;
  for (let qi = 0; qi < qTerms.length; qi++) {
    const t = qTerms[qi]; let best = 0;
    const syns = SYN_OF.get(t) || [t];
    for (const [field, w] of Object.entries(W)) {
      const set = p.f[field]; let s = 0;
      if (set.has(t)) s = 1;
      else if (syns.some(x => x !== t && set.has(x))) s = .75;
      else if (t.length >= 2 && (qi === last || t.length >= 3)) { for (const x of set) if (x.length > t.length && x.startsWith(t)) { s = qi === last ? .8 : .6; break; } }
      if (!s && t.length >= 5) { const max = t.length >= 9 ? 2 : 1; for (const x of set) if (x.length >= 3 && within(t, x, max)) { s = .45; break; } }
      if (s * w > best) best = s * w;
    }
    if (best > 0) matched++; total += best;
  }
  if (!matched) return 0;
  const cover = matched / qTerms.length;
  if (qTerms.length >= 2 && cover < .5) return 0;
  let score = total * cover * cover;
  if (qFold.length >= 3 && p.titleFold.includes(qFold)) score += 8;
  if (p.titleFold === qFold) score += 6;
  if (p.it.rank) score += (100 - Math.min(100, p.it.rank)) / 200;
  return score;
}
async function ranked(q) {
  const qTerms = tokens(q); if (!qTerms.length) return [];
  const qFold = fold(q).replace(/[^a-z0-9]+/g, ' ').trim(); const list = await prep();
  const hits = list.map(p => ({ p, s: scoreOf(p, qTerms, qFold, qTerms.length - 1) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || String(a.p.it.title).localeCompare(String(b.p.it.title)));
  /* drop the long tail: anything under a fifth of the best hit is noise (a synonym in a blurb, a typo-match in a body) */
  const floor = hits.length ? hits[0].s * .2 : 0; return hits.filter(x => x.s >= floor);
}

export async function search(q, { limit = 8 } = {}) {
  return (await ranked(q)).slice(0, limit).map(({ p }) => ({ title: p.it.title, url: p.it.url || p.it.href, type: p.it.type === 'pages' ? 'page' : (p.it.type || 'page'), excerpt: p.it.excerpt || '' }));
}
const GROUPS = { designs: 6, collections: 4, guides: 4, help: 4, pages: 3 };
export async function query(q, { limit } = {}) {
  const out = { designs: [], collections: [], guides: [], help: [], pages: [] };
  for (const { p, s } of await ranked(q)) {
    const g = out[p.it.type]; if (!g || g.length >= (limit || GROUPS[p.it.type])) continue;
    g.push({ id: p.it.id, title: p.it.title, sub: p.it.sub || '', href: p.it.href || p.it.url, excerpt: p.it.excerpt || '', score: Math.round(s * 100) / 100, ...(p.it.mini ? { mini: p.it.mini } : {}), ...(p.it.card ? { card: p.it.card } : {}) });
  }
  return out;
}
export default { search, query, ready, setIndex, tokens, stem, fold, STUB, ROUTES };
