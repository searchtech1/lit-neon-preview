/* Lit Neon v2 — basket page (brief §4.19, owner P7): the full-page fallback of the basket drawer, built on the same
   store (core/basket.js) so the two always agree. Lines are re-priced from the stored spec on every render (never a
   stored price), identical specs merge (qty stepper), Edit reopens the line in the builder (or the product page for a
   ready-made line), Remove collapses the line into an inline "Removed · Undo" row for 5 s (no toast, C14).
   The summary shows ONE payable subtotal plus the §3.7a promo line while the promo is live — never a saving — the
   delivery postcode check, BNPL inside its limits, the express row (hidden with a quoted line), the checkout CTA,
   the assurances and the payment marks. A sticky checkout bar takes over on phones once the summary CTA is off-screen.
   Every control carries data-qa="basket.page.*" (the drawer owns basket.*) and is listed in qa/matrix/basket.json.

   Also exports the line helpers checkout.js reuses (name, spec rows, edit link, mini render, hours text), so the two
   pages describe a line in exactly the same words. The page code runs only when body[data-page="basket"]. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import basket from 'core/basket.js';
import router from 'core/router.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import { gbp, fmtDims, esc } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import { track } from 'core/analytics.js';

export const t = (k, v, f) => copy.t(k, v, f);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const icon = ui.icon;

/* ============================================================ shared line helpers ============================================================ */
let DESIGNS = null;
/** designs.json (names for ready-made lines, empty-state picks). Cached; never throws. */
export function loadDesigns() {
  if (DESIGNS) return DESIGNS;
  DESIGNS = fetch('/lit-neon-preview/rework/data/designs.json').then(r => (r.ok ? r.json() : null)).then(j => (j && j.designs) || []).catch(() => []);
  return DESIGNS;
}
let designList = [];
export const setDesignList = list => { designList = list || []; };
const designById = id => designList.find(d => d.id === id) || null;

/** the words a shopper typed, or the design name for a ready-made line */
export function lineName(line) {
  if (line.kind === 'photo') return t('line.photoName', {}, 'Your photo, traced in neon');
  if (line.kind === 'ready' && line.meta && line.meta.design) { const d = designById(line.meta.design); if (d) return d.name; }
  const res = R.resolve(line.state);
  if (res.lines.length) return res.lines.join(' ');
  if (res.icon) return t('line.symbolOnly', { symbol: symbolName(res.icon) }, '{symbol} symbol');
  return t('line.fallbackName', {}, 'Your sign');
}
export const symbolName = id => t('symbols.' + id, {}, id);
export const kindLabel = line => t('kind.' + line.kind, {}, line.kind);

/** customer-facing spec rows (names only, never ids or hex; brief §3.7 Spec table) */
export function specRows(line) {
  if (line.kind === 'photo') return photoRows(line);
  const res = R.resolve(line.state), st = res.state;
  const colour = st.colours ? res.lineColours.map(c => c.name).join(' / ') : res.colour.name;
  const sizeName = res.sizeId === 'custom' ? 'Custom' : R.sizeOf(res.sizeId).name;
  const rows = [
    { k: 'lettering', label: t('spec.lettering', {}, 'Lettering'), value: res.font.name },
    { k: 'colour', label: t('spec.colour', {}, 'Colour'), value: `${colour}, ${R.jacketOf(st.jacket).name.toLowerCase()}` },
    { k: 'size', label: t('spec.size', {}, 'Size'), value: `${sizeName}, ${res.dims ? fmtDims(res.dims.W, res.dims.H, st.unit === 'in' ? 'in' : 'cm') : '—'}` },
    { k: 'backing', label: t('spec.backing', {}, 'Backing'), value: `${res.backing.name}, ${res.finish.name.toLowerCase()}` },
    { k: 'hangs', label: t('spec.hangs', {}, 'Hangs'), value: `${st.backing === 'stand' ? t('spec.stand', {}, 'On its stand') : res.hang.name} · ${t('spec.plug', {}, 'UK plug')}` }
  ];
  if (st.icon) rows.push({ k: 'symbol', label: t('spec.symbol', {}, 'Symbol'), value: symbolName(st.icon) + (st.iconPos === 'inline' ? `, ${t('spec.inline', {}, 'inline')}` : '') });
  if (st.use === 'out') rows.push({ k: 'where', label: t('spec.where', {}, 'Where'), value: t('spec.outdoors', {}, 'Outdoors') });
  if (line.kind === 'photo') rows.push({ k: 'proof', label: t('spec.proof', {}, 'Proof'), value: t('spec.photoProof', {}, 'A designer draws your proof before anything is made') });
  return rows;
}
/** a photo line is the traced design, not a text sign: size and LED length come from the photo meta (upload.html),
    never from resolving the text state (which would read "Medium, 65 × 18 cm" for words nobody typed) */
export function photoSize(line) {
  const m = line.meta || {}; const W = m.widthCm, H = m.heightCm; const unit = line.state && line.state.unit === 'in' ? 'in' : 'cm';
  if (!(W && H)) return '—';
  const led = m.ledMetres ? ` · ${t('spec.ledMetres', { m: (Math.round(m.ledMetres * 10) / 10).toFixed(1) }, '{m} m of LED')}` : '';
  return `${t('spec.about', {}, 'About')} ${fmtDims(W, H, unit)}${led}`;
}
function photoRows(line) {
  const res = R.resolve(line.state), st = res.state;
  return [
    { k: 'made', label: t('spec.made', {}, 'Made from'), value: t('spec.madeFromPhoto', {}, 'Your photo, traced in neon') },
    { k: 'colour', label: t('spec.colour', {}, 'Colour'), value: res.colour.name },
    { k: 'size', label: t('spec.size', {}, 'Size'), value: photoSize(line) },
    { k: 'backing', label: t('spec.backing', {}, 'Backing'), value: `${res.backing.name}, ${res.finish.name.toLowerCase()}` },
    { k: 'hangs', label: t('spec.hangs', {}, 'Hangs'), value: `${st.backing === 'stand' ? t('spec.stand', {}, 'On its stand') : res.hang.name} · ${t('spec.plug', {}, 'UK plug')}` },
    { k: 'proof', label: t('spec.proof', {}, 'Proof'), value: t('spec.photoProof', {}, 'A designer draws your proof before anything is made') }
  ];
}
/** Edit design: the builder with the line's state and its uid (CTA reads "Update basket"), or the product page */
export function editHref(line) {
  if (line.kind === 'ready') return router.productLink(line.meta.design || '', { edit: line.uid });
  return router.builderLink(line.state, { edit: line.uid });
}
/** the mini render: the stage engine on the dark studio wall, lit, card frame (same as the drawer) */
export function mountMini(host, state, qa = 'basket.page.mini') {
  try { return stage.mount(host, { frame: 'card', scene: 's00-studio-dark', design: { ...state, on: true, night: true }, interactive: false, pill: false, rulers: false, qa }); } catch { return null; }
}
/** the mini for any line: a photo line shows its traced preview (meta.png), never the text stage ("Your words") */
export function mountLineMini(host, line, qa = 'basket.page.mini') {
  if (!host || !line) return null;
  if (line.kind === 'photo') {
    const png = line.meta && line.meta.png;
    host.classList.add('is-photo');
    host.innerHTML = png ? `<img src="${esc(png)}" alt="" data-qa="${esc(qa)}.photo" decoding="async">` : `<span class="mini-photo-fallback">${icon('image')}</span>`;
    return { destroy() { host.innerHTML = ''; host.classList.remove('is-photo'); } };
  }
  return mountMini(host, line.state, qa);
}
/** "12 hours" from the facts registry (confirmed), else a safe phrase */
export const hoursText = () => (facts.has('mockupHours') ? `${facts.value('mockupHours')} hours` : '12 hours');
export const daysRange = () => { try { const d = pricing.rules().delivery; return { min: d.minDays, max: d.maxDays }; } catch { return { min: 7, max: 10 }; } };
/** where an excluded-postcode shopper can ask: the chrome's WhatsApp → email → contact.html chain, prefilled */
export function contactLink(chromeApi, postcode) {
  const text = `Hi, can you deliver a sign to ${postcode || 'my postcode'}?`;
  const c = chromeApi && chromeApi.contactHref ? chromeApi.contactHref(text) : null;
  if (c && c.href && c.kind !== 'contact') return c.href;
  return `/lit-neon-preview/rework/contact.html?topic=delivery${postcode ? `&postcode=${encodeURIComponent(postcode)}` : ''}`;
}
export const fontIds = lines => Array.from(new Set(lines.map(l => R.resolve(l.state).font.id)));

/** price text for one line (payable × qty), recomputed every call */
export function linePrice(line) {
  const p = basket.priceLine(line);
  if (p.kind === 'price') return { kind: 'price', total: p.payable * line.qty, each: p.payable, everyday: p.everyday, p };
  if (p.kind === 'wait') return { kind: 'wait', p };
  return { kind: 'quote', p, reason: (line.meta && line.meta.reason) || p.reason || '' };
}

/* ============================================================ page ============================================================ */
const isPage = typeof document !== 'undefined' && document.body && document.body.dataset.page === 'basket';
if (isPage) boot();

let chromeApi = null;
const nodes = new Map();          // uid → { el, hash, mini }
const removedRows = new Map();    // uid → { name, index, timer, undo }
let editingPostcode = false;
let pcResult = null;

async function boot() {
  copy.load(['chrome']).catch(() => {});
  await Promise.all([copy.load(['basket']), facts.load(), ui.ensureSprite()]);
  applyCopy();
  mountChrome({ page: 'basket' }).then(api => { chromeApi = api; renderSummary(); }).catch(() => {});
  /* the header basket button opens the drawer elsewhere; on this page the basket IS the page */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-qa="chrome.basket"]');
    if (!b) return; e.preventDefault(); e.stopImmediatePropagation();
    window.scrollTo({ top: 0, behavior: R.reducedMotion() ? 'auto' : 'smooth' }); const h = $('#bk-h1'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
  }, true);
  setDesignList(await loadDesigns());
  stage.loadScenes().then(() => pricing.setScenes(stage.scenes())).catch(() => {});
  R.ensureFonts(fontIds(basket.lines())).catch(() => {});
  R.onFonts(scheduleRender);
  basket.subscribe(type => { if (type === 'change') scheduleRender(); });
  render();
  renderNext();
  initBar();
}

function applyCopy() {
  $$('[data-copy]').forEach(el => { const v = t(el.dataset.copy); if (v) el.textContent = v; });
  document.title = t('meta.title', {}, document.title);
}

let renderQueued = 0;
function scheduleRender() { if (renderQueued) return; renderQueued = requestAnimationFrame(() => { renderQueued = 0; render(); }); }

let emptyBuilt = false;
function render() {
  const lines = basket.lines();
  const root = $('#bk-lines');
  const n = lines.length;
  /* the title counts signs (summed quantities), like the header badge and the drawer: one line at quantity 10 is 10 signs */
  const nSigns = basket.signs ? basket.signs() : n;
  $('[data-qa="basket.page.count"]').textContent = n ? `(${t('count', { n: nSigns, unit: t(nSigns === 1 ? 'unit.one' : 'unit.many') }, '{n} {unit}')})` : '';
  if (!n && !removedRows.size) { renderEmpty(); return; }
  emptyBuilt = false;
  document.body.classList.remove('bk--empty');
  $('#bk-summary').hidden = false; $('#bk-next').hidden = false;
  root.querySelector('.bk-skel')?.remove(); root.querySelector('.bk-empty')?.remove();

  /* keyed update: reuse a line's node (and its live mini) while its spec is unchanged */
  const seen = new Set();
  const order = [];
  lines.forEach(l => {
    seen.add(l.uid);
    let rec = nodes.get(l.uid);
    if (!rec || rec.hash !== l.specHash) { if (rec) destroyRec(rec); rec = buildLine(l); nodes.set(l.uid, rec); }
    updateLine(rec, l);
    order.push(rec.el);
  });
  nodes.forEach((rec, uid) => { if (!seen.has(uid)) { destroyRec(rec); nodes.delete(uid); } });
  /* splice the undo rows back in at the position the line had */
  removedRows.forEach((r, uid) => { if (!r.el) r.el = buildUndo(uid, r); order.splice(Math.min(r.index, order.length), 0, r.el); });
  order.forEach((el, i) => { if (root.children[i] !== el) root.insertBefore(el, root.children[i] || null); });
  Array.from(root.children).forEach(ch => { if (!order.includes(ch)) ch.remove(); });
  renderSummary();
}

function destroyRec(rec) { try { rec.mini && rec.mini.destroy && rec.mini.destroy(); } catch {} rec.el.remove(); }

function buildLine(l) {
  const el = document.createElement('article');
  el.className = 'bk-line'; el.dataset.uid = l.uid; el.dataset.kind = l.kind; el.dataset.qa = 'basket.page.line';
  const name = lineName(l);
  el.setAttribute('aria-label', name);
  const rows = specRows(l).map(r => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('');
  el.innerHTML = `
    <figure class="bk-line__fig"><div class="bk-line__mini" data-mini></div><figcaption class="bk-line__cap" data-caption="rendered">${icon('image', 'ic--sm')}${esc(t('line.preview', {}, 'Rendered preview'))}</figcaption></figure>
    <div class="bk-line__main">
      <div class="bk-line__top">
        <div class="bk-line__title"><span class="c-pill bk-kind bk-kind--${esc(l.kind)}">${esc(kindLabel(l))}</span><h2 class="t-title bk-line__name" data-qa="basket.page.line.name">${esc(name)}</h2></div>
        <div class="bk-line__price" data-qa="basket.page.line.price"></div>
      </div>
      <dl class="bk-spec">${rows}</dl>
      <div class="bk-line__acts">
        <div class="bk-line__qtywrap" data-qtywrap></div>
        <div class="bk-line__links">
          ${l.kind === 'photo' ? '' : `<a class="c-btn c-btn--text" href="${esc(editHref(l))}" data-qa="basket.page.line.edit">${icon('pencil')}<span class="label">${esc(t('line.edit', {}, 'Edit design'))}</span></a>`}
          <button type="button" class="c-btn c-btn--text" data-remove data-qa="basket.page.line.remove">${icon('trash')}<span class="label">${esc(t('line.remove', {}, 'Remove'))}</span></button>
        </div>
      </div>
    </div>`;
  el.querySelector('[data-remove]').addEventListener('click', () => removeLine(l.uid));
  const mini = mountLineMini(el.querySelector('[data-mini]'), l);
  return { el, hash: l.specHash, mini, qty: null };
}

const specHtml = l => specRows(l).map(r => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('');
function updateLine(rec, l) {
  const el = rec.el; const lp = linePrice(l);
  /* sizes are measured from the lettering face, so the spec text refreshes when a face lands */
  const spec = specHtml(l); const dl = el.querySelector('.bk-spec'); if (dl.dataset.html !== spec) { dl.innerHTML = spec; dl.dataset.html = spec; }
  el.querySelector('[data-qa="basket.page.line.name"]').textContent = lineName(l);
  const priceEl = el.querySelector('[data-qa="basket.page.line.price"]');
  if (lp.kind === 'price') {
    priceEl.innerHTML = `<b>${gbp(lp.total)}</b>${l.qty > 1 ? `<span>${esc(t('line.each', { price: gbp(lp.each) }, '{price} each'))}</span>` : ''}`;
    priceEl.removeAttribute('aria-busy');
  } else if (lp.kind === 'wait') { priceEl.innerHTML = '<b class="is-wait">…</b>'; priceEl.setAttribute('aria-busy', 'true'); }
  else priceEl.innerHTML = `<b>${esc(t('line.quote', {}, 'Quote'))}</b>`;
  const wrap = el.querySelector('[data-qtywrap]');
  if (l.kind === 'quote') {
    if (rec.qty !== 'quote') { wrap.innerHTML = `<p class="bk-line__note">${esc(lp.reason ? lp.reason + '. ' : '')}${esc(t('line.quoteNote', { hours: hoursText() }, 'A designer prices this one by hand.'))}</p>`; rec.qty = 'quote'; }
    return;
  }
  if (rec.qty == null) {
    wrap.innerHTML = `<div class="c-qty" role="group" aria-label="${esc(t('line.qty', {}, 'Quantity'))}" data-qa="basket.page.line.qty">
      <button type="button" data-step="-1" aria-label="${esc(t('line.fewer', {}, 'One fewer'))}" data-qa="basket.page.line.minus">${icon('minus')}</button>
      <output aria-live="polite" data-qa="basket.page.line.qtyvalue"></output>
      <button type="button" data-step="1" aria-label="${esc(t('line.more', {}, 'One more'))}" data-qa="basket.page.line.plus">${icon('plus')}</button></div>
      <a class="bk-line__bulk" href="/lit-neon-preview/rework/bulk-quote.html" data-qa="basket.page.line.bulk" hidden>${esc(t('line.bulk', {}, 'Need more? Bulk quote'))}</a>`;
    wrap.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { const cur = basket.get(l.uid); if (cur) basket.setQty(l.uid, cur.qty + (+b.dataset.step)); }));
  }
  rec.qty = l.qty;
  wrap.querySelector('output').value = String(l.qty);
  wrap.querySelector('[data-step="-1"]').disabled = l.qty <= 1;
  wrap.querySelector('[data-step="1"]').disabled = l.qty >= 10;
  wrap.querySelector('.bk-line__bulk').hidden = l.qty < 10;
}

function removeLine(uid) {
  const lines = basket.lines(); const index = lines.findIndex(l => l.uid === uid); if (index < 0) return;
  const name = lineName(lines[index]);
  const { undo } = basket.remove(uid);
  const r = { name, index, undo, el: null, timer: setTimeout(() => { removedRows.delete(uid); render(); }, 5000) };
  removedRows.set(uid, r);
  render();
  r.el && r.el.querySelector('button').focus();
}

function buildUndo(uid, r) {
  const el = document.createElement('div');
  el.className = 'bk-undo'; el.setAttribute('role', 'status'); el.dataset.qa = 'basket.page.undo';
  el.innerHTML = `<span>${esc(t('line.removed', { name: r.name }, 'Removed'))}</span><button type="button" class="c-btn c-btn--ghost c-btn--sm bk-undo__btn" data-qa="basket.page.undo.button">${icon('rotate')}${esc(t('line.undo', {}, 'Undo'))}</button>`;
  el.querySelector('button').addEventListener('click', () => { clearTimeout(r.timer); removedRows.delete(uid); r.undo(); /* render() runs from the basket change */ requestAnimationFrame(() => { const back = nodes.get(uid); back && back.el.querySelector('[data-remove]')?.focus(); }); });
  return el;
}

/* ============================================================ summary ============================================================ */
function renderSummary() {
  const box = $('#bk-sum'); if (!box) return;
  const lines = basket.lines(); if (!lines.length) return;
  const sub = basket.subtotal(); const hasQuote = sub.quotes > 0; const priced = sub.items > 0;
  const pc = basket.postcode.get(); const d = pcResult || basket.delivery(pc);
  const promoLine = priced && sub.promo ? pricing.promoLine(sub.everyday) : null;
  const waiting = lines.some(l => basket.priceLine(l).kind === 'wait');
  const quoteNote = sub.quotes === 1 ? t('summary.quotedOne', { hours: hoursText() }) : t('summary.quotedMany', { n: sub.quotes, hours: hoursText() });
  box.innerHTML = `
    ${priced ? `<div class="bk-row"><span>${esc(t('summary.signs', { n: sub.items }, 'Signs ({n})'))}</span><span class="num">${waiting ? '…' : gbp(sub.payable)}</span></div>` : ''}
    <div class="bk-row"><span>${esc(t('summary.delivery', {}, 'Delivery'))}</span><span>${esc(t('summary.free', {}, 'Free'))}</span></div>
    ${priced ? `<div class="bk-row bk-row--total"><span>${esc(t('summary.subtotal', {}, 'Subtotal'))}</span><b class="num" data-qa="basket.page.subtotal">${waiting ? '…' : gbp(sub.payable)}</b></div>` : ''}
    ${promoLine ? `<p class="bk-promo" data-qa="basket.page.promo"><span class="c-pill c-pill--launch">${esc(t('pills.launch', {}, 'Launch price'))}</span>${esc(promoLine.replace(/^Launch price · /, ''))}</p>` : ''}
    ${hasQuote ? `<p class="bk-note" data-qa="basket.page.quoted">${esc(priced ? quoteNote : t('summary.onlyQuotes'))}</p>` : ''}
    <div class="bk-deliv" data-qa="basket.page.delivery">${deliveryHtml(d)}</div>
    <div class="bk-bnpl" data-slot="bnpl"></div>
    ${priced
      ? `<a class="c-btn c-btn--primary c-btn--lg c-btn--block bk-cta" href="/lit-neon-preview/rework/checkout.html" data-qa="basket.page.checkout">${icon('lock')}<span>${esc(t('summary.checkout', {}, 'Go to checkout'))}</span></a>`
      : `<button type="button" class="c-btn c-btn--primary c-btn--lg c-btn--block bk-cta" disabled data-qa="basket.page.checkout">${icon('lock')}<span>${esc(t('summary.checkout', {}, 'Go to checkout'))}</span></button>`}
    <div class="bk-express" data-slot="express"></div>
    <ul class="bk-assure" aria-label="${esc(t('assure.title', {}, 'Before anything is made'))}">
      <li>${icon('drawing')}<span>${esc(t('assure.drawing'))}</span></li>
      <li>${icon('shield')}<span>${esc(t('assure.warranty', { warranty: facts.get('warrantyYears') || '3-year warranty' }))}</span></li>
      <li>${icon('truck')}<span>${esc(t('assure.delivery'))}</span></li>
      <li>${icon('remote')}<span>${esc(t('assure.kit'))}</span></li>
    </ul>
    <div class="bk-marks" data-slot="marks"></div>
    <p class="bk-note bk-note--center">${esc(t('summary.invoice'))}</p>`;
  if (priced) ui.bnpl(box.querySelector('[data-slot="bnpl"]'), sub.payable, { qa: 'basket.page.bnpl' }).catch(() => {});
  else box.querySelector('[data-slot="bnpl"]').hidden = true;
  ui.expressRow(box.querySelector('[data-slot="express"]'), { hidden: hasQuote || !priced, qa: 'basket.page.express', onPick: id => { location.href = '/lit-neon-preview/rework/checkout.html#express=' + encodeURIComponent(id); } }).catch(() => {});
  ui.paymentMarks(box.querySelector('[data-slot="marks"]'), { qa: 'basket.page.marks' }).catch(() => {});
  wireDelivery(box);
  const cta = box.querySelector('a.bk-cta'); if (cta) cta.addEventListener('click', () => track('basket_checkout', { items: sub.items, subtotal: sub.payable, from: 'basket-page' }));
  $('[data-qa="basket.page.bar.total"]').textContent = priced ? gbp(sub.payable) : '—';
  observeCta();
}

function deliveryHtml(d) {
  if (d.status === 'ok' && !editingPostcode) {
    return `<p class="bk-deliv__ok">${icon('check')}<b data-qa="basket.page.postcode.ok">${esc(d.prefix || '')}</b><button type="button" class="c-btn c-btn--text bk-deliv__change" data-qa="basket.page.postcode.change"><span class="label">${esc(t('postcode.change', {}, 'Change'))}</span></button></p><p class="bk-note" data-qa="basket.page.postcode.line">${esc(d.line || '')}</p>`;
  }
  const bad = d.status === 'excluded' || d.status === 'invalid';
  const contact = d.status === 'excluded' ? contactLink(chromeApi, d.formatted) : '';
  return `<form class="bk-pc${bad ? ' is-bad' : ''}" novalidate data-pc>
      <label class="bk-pc__label" for="bk-pc-in">${esc(t('postcode.label', {}, 'Delivery postcode'))}</label>
      <div class="bk-pc__row"><input id="bk-pc-in" class="c-input" name="postcode" inputmode="text" autocomplete="postal-code" autocapitalize="characters" spellcheck="false" maxlength="10" placeholder="${esc(t('postcode.placeholder', {}, 'e.g. E1 6AN'))}" value="${esc(d.formatted || basket.postcode.get() || '')}" ${bad ? 'aria-invalid="true"' : ''} aria-describedby="bk-pc-msg" data-qa="basket.page.postcode.input">
      <button type="submit" class="c-btn c-btn--ghost" data-qa="basket.page.postcode.check">${esc(t('postcode.check', {}, 'Check'))}</button></div>
      <p id="bk-pc-msg" class="bk-pc__msg${bad ? ' is-bad' : ''}" data-qa="basket.page.postcode.msg">${bad ? icon('warning', 'ic--sm') : ''}<span>${esc(d.status === 'empty' ? `${t('postcode.hint', {}, 'Free delivery across mainland GB.')} ${d.text}` : d.text)}</span>${d.status === 'excluded' ? ` <a href="${esc(contact)}" data-qa="basket.page.postcode.ask">${esc(t('postcode.ask', {}, 'Ask us about delivery'))}</a>` : ''}</p>
    </form>`;
}

function wireDelivery(box) {
  const form = box.querySelector('[data-pc]');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault(); const v = form.querySelector('input').value; const d = basket.delivery(v);
    pcResult = d; editingPostcode = false;
    if (d.status === 'ok') { basket.postcode.set(d.formatted); router.postcode.set(d.formatted); pcResult = null; /* the store change re-renders */ requestAnimationFrame(() => box.querySelector('[data-qa="basket.page.postcode.change"]')?.focus()); }
    else { renderSummary(); box.querySelector('input')?.focus(); }
  });
  const ch = box.querySelector('[data-qa="basket.page.postcode.change"]');
  if (ch) ch.addEventListener('click', () => { editingPostcode = true; pcResult = null; renderSummary(); const i = $('#bk-pc-in'); i && i.focus(); i && i.select(); });
}

/* ============================================================ empty state ============================================================ */
async function renderEmpty() {
  if (emptyBuilt) { refreshPicks(); return; }
  emptyBuilt = true;
  document.body.classList.add('bk--empty');
  $('#bk-summary').hidden = true; $('#bk-next').hidden = true; nodes.forEach(destroyRec); nodes.clear();
  const root = $('#bk-lines');
  root.innerHTML = `<div class="bk-empty" data-qa="basket.page.empty">
      <img src="/lit-neon-preview/rework/assets/img/empty/basket.svg" alt="" width="160" height="120">
      <h2 class="t-display-3">${esc(t('empty.title', {}, 'Nothing in here yet'))}</h2>
      <p class="t-lead">${esc(t('empty.text'))}</p>
      <div class="bk-empty__acts"><a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/rework/create.html" data-qa="basket.page.empty.design">${esc(t('empty.design', {}, 'Design a sign'))}</a><a class="c-btn c-btn--ghost c-btn--lg" href="/lit-neon-preview/rework/shop.html" data-qa="basket.page.empty.shop">${esc(t('empty.shop', {}, 'Browse ready-made'))}</a></div>
      <div class="bk-picks" data-picks hidden><h3 class="t-eyebrow">${esc(t('empty.picks', {}, 'Start from a favourite'))}</h3><div class="bk-picks__row" data-row></div></div>
    </div>`;
  $('#bk-bar').hidden = true; document.body.classList.remove('bk-has-bar');
  const list = (designList.length ? designList : await loadDesigns()).filter(d => d.bestseller).sort((a, b) => a.bestsellerRank - b.bestsellerRank).slice(0, 4);
  if (!list.length) return;
  const picks = root.querySelector('[data-picks]'); if (!picks) return;
  picks.querySelector('[data-row]').innerHTML = list.map(d => `<a class="bk-pick" href="${esc(router.productLink(d.id))}" data-qa="basket.page.pick" data-id="${esc(d.id)}">
      <span class="bk-pick__tile" data-tile aria-hidden="true"></span>
      <span class="bk-pick__name">${esc(d.name)}</span><span class="bk-pick__from" data-from></span></a>`).join('');
  picks.hidden = false;
  /* each tile is the real renderer in the design's own lettering face, lit */
  $$('.bk-pick[data-id]', picks).forEach(a => { const d = designById(a.dataset.id); if (d) { try { R.mountNeon(a.querySelector('[data-tile]'), { ...R.normalise({ text: d.lines.join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', iconPos: d.iconPos || 'above' }) }, { fitW: .8, fitH: .62, lit: true }); } catch {} } });
  refreshPicks();
  R.ensureFonts(list.map(d => d.font)).catch(() => {});   /* each face that lands re-runs refreshPicks via onFonts → render */
}
/** from-prices need the lettering metrics, so they fill in as the faces load (never a wrong number meanwhile) */
/** the cheapest size this design can actually be made in (a face's minimum letter height can rule out Small) */
function pickFrom(d) { for (const size of ['s', 'm', 'l', 'xl', 'xxl']) { const v = pricing.fromPrice(d, { size }); if (v != null) return v; } return null; }
function refreshPicks() {
  $$('.bk-pick[data-id]').forEach(a => { const d = designById(a.dataset.id); const from = d ? pickFrom(d) : null; a.querySelector('[data-from]').textContent = from != null ? t('empty.from', { price: gbp(from) }, 'from {price}') : ''; });
}

/* ============================================================ what happens next (paper band) ============================================================ */
function renderNext() {
  const { min, max } = daysRange();
  const steps = [['drawing', 's1t', 's1'], ['check', 's2t', 's2'], ['ruler', 's3t', 's3'], ['truck', 's4t', 's4']];
  $('#bk-next-steps').innerHTML = steps.map(([ic, ti, tx], i) => `<li><span class="bk-next__num">${i + 1}</span>${icon(ic, 'ic--lg')}<h3 class="t-title">${esc(t('next.' + ti))}</h3><p>${esc(t('next.' + tx, { hours: hoursText(), min, max }))}</p></li>`).join('');
}

/* ============================================================ mobile sticky checkout bar ============================================================ */
let ctaObserver = null, ctaVisible = true;
function initBar() {
  const mq = matchMedia('(max-width: 767px)');
  const paint = () => {
    const sub = basket.subtotal(); const overlay = document.documentElement.dataset.scrollLock === '1' || document.body.classList.contains('has-overlay');
    const show = mq.matches && sub.items > 0 && !ctaVisible && !overlay && !keyboardUp();
    $('#bk-bar').hidden = !show; document.body.classList.toggle('bk-has-bar', show);
  };
  initBar.paint = paint;
  mq.addEventListener('change', paint);
  document.addEventListener('ln:overlay', paint); document.addEventListener('ln:basket', () => requestAnimationFrame(paint));
  if (window.visualViewport) visualViewport.addEventListener('resize', paint);
  $('#bk-bar a').addEventListener('click', () => track('basket_checkout', { from: 'basket-bar' }));
  paint();
}
const keyboardUp = () => !!(window.visualViewport && visualViewport.height < window.innerHeight * 0.75);
function observeCta() {
  const cta = $('#bk-sum .bk-cta'); if (!cta || !('IntersectionObserver' in window)) return;
  if (ctaObserver) ctaObserver.disconnect();
  ctaObserver = new IntersectionObserver(([e]) => { ctaVisible = e.isIntersecting; initBar.paint && initBar.paint(); }, { threshold: 0.01 });
  ctaObserver.observe(cta);
}
