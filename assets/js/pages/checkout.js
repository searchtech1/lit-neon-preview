/* Lit Neon v2 — checkout hand-off (brief §4.18, §3.7a, owner P7). Stands in for Shopify's checkout and proves the
   payload. It is the ONLY surface that shows the launch discount as a row, because it mirrors Shopify's cart: lines at
   their EVERYDAY prices, the subtotal, one discount row ("Launch price (−20%)") while the promo is live, the total.
   - Discount code (B41): one code per order, never stacked with the launch price — the better of the two applies and
     the row names which (copy promo.codeWins / codeLoses). Test codes: qa/fixtures/codes.json.
   - Delivery postcode is REQUIRED: "Continue to secure checkout" enables only for a valid, non-excluded mainland-GB
     postcode; an excluded one shows the amber state with the contact route (spec §10).
   - Express row (hidden while any line is a quote) and "Continue" both end on the test confirmation
     (#confirmed / #express=<provider>): "Test order LN-T-… — no payment taken", what happens next, the
     everyday → launch mapping per line, and (review + ?debug=1 only) the exact /cart/add.js payload. The basket is
     cleared on confirmation; the order snapshot lives in sessionStorage so a reload shows the same confirmation.
   Line descriptions come from basket-page.js so the basket, drawer and checkout use the same words.
   Every control carries data-qa="checkout.*" and is listed in qa/matrix/checkout.json. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import basket from 'core/basket.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import * as clock from 'core/clock.js';
import { gbp, gbp2, round2, esc } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import { t, $, $$, lineName, specRows, kindLabel, mountLineMini, hoursText, daysRange, fontIds, loadDesigns, setDesignList, contactLink } from 'pages/basket-page.js';

const icon = ui.icon;
const SNAP = 'checkout.last', CODE = 'checkout.code';
const ss = { get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const money = n => (Number.isInteger(+n) ? gbp(n) : gbp2(n));

let CODES = [], PAY = { express: [], marks: [] }, chromeApi = null;
let pc = { status: 'empty' };          // pricing.deliveryLine() result for the entered postcode
let code = null;                      // applied code object from the fixture
let codeMsg = null;                   // { kind: 'ok'|'bad', text }
const minis = new Map();              // uid → stage
let summaryBuiltFor = '';

boot();

async function boot() {
  /* sequential so checkout.json wins over basket.json on shared keys (both are page copy files) */
  /* perf audit: facts, icons and the order data load while the copy files merge one after another */
  const factsP = Promise.all([facts.load(), ui.ensureSprite()]);
  const getJson = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const dataP = Promise.all([getJson('/lit-neon-preview/qa/fixtures/codes.json'), getJson('/lit-neon-preview/qa/fixtures/variants.json'), ui.paymentsConfig(), loadDesigns()]);
  await copy.load(['chrome']); await copy.load(['basket']); await copy.load(['checkout']);
  await factsP;
  applyCopy();
  mountChrome({ page: 'checkout' }).then(api => { chromeApi = api; update(); }).catch(() => {});
  const [codes, variants, pay, designs] = await dataP;
  CODES = (codes && codes.codes) || []; PAY = pay || PAY; setDesignList(designs);
  if (variants && variants.variants) basket.useVariants(variants.variants);
  stage.loadScenes().catch(() => {});
  R.ensureFonts(fontIds(basket.lines())).catch(() => {});
  let queued = 0; const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; route(); }); };
  R.onFonts(schedule);
  basket.subscribe(type => { if (type === 'change') schedule(); });
  window.addEventListener('hashchange', route);
  matchMedia('(max-width: 1023px)').addEventListener('change', placeSummary);
  /* restore the saved postcode and code */
  const saved = basket.postcode.get(); if (saved) { $('#co-pc-in').value = saved; pc = basket.delivery(saved); }
  const savedCode = ss.get(CODE); if (savedCode) { const c = findCode(savedCode); if (c) { code = c; $('#co-code-in').value = c.code; } }
  wireForms();
  route();
}

function applyCopy() {
  $$('[data-copy]').forEach(el => { const v = t(el.dataset.copy); if (v) el.textContent = v; });
  $('#co-pc-in').placeholder = t('postcode.placeholder', {}, 'e.g. E1 6AN');
  $('#co-code-in').placeholder = t('code.placeholder', {}, 'Enter a code');
  document.title = t('meta.title', {}, document.title);
}

/* ============================================================ routing ============================================================ */
function parseHash() { const h = location.hash.replace(/^#/, ''); const out = {}; h.split('&').forEach(p => { if (!p) return; const i = p.indexOf('='); if (i < 0) out[decodeURIComponent(p)] = true; else out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1)); }); return out; }
const providerName = id => (PAY.express.find(p => p.id === id) || {}).name || id;

function route() {
  const h = parseHash();
  if (h.confirmed) return showConfirm(ss.get(SNAP));
  if (h.express) {
    const snap = ss.get(SNAP);
    if (!basket.lines().length) return showConfirm(snap && snap.provider === h.express ? snap : null);
    if (basket.subtotal().quotes > 0) { showForm(); return; }
    if (!hasPriced() || isWaiting()) { showForm(); return; }   /* fonts still measuring: the next font event re-routes */
    const s = placeOrder(h.express); if (s) showConfirm(s);
    return;
  }
  if (!basket.lines().length) return showEmpty();
  showForm();
}

const hasPriced = () => basket.subtotal().items > 0;
const isWaiting = () => basket.lines().some(l => basket.priceLine(l).kind === 'wait');

function setView(name) {
  $('#co-form-view').hidden = name !== 'form'; $('#co-empty').hidden = name !== 'empty'; $('#co-confirm').hidden = name !== 'confirm';
  const done = name === 'confirm';
  /* Basket is only "done" when there is (or was, for the confirmation) a basket: an empty one stays an open step 1, still a link back */
  const bk = $('.co-progress [data-step="basket"]'); if (bk) { const filled = name !== 'empty'; bk.classList.toggle('is-done', filled); const dot = bk.querySelector('.dot'); if (dot) dot.innerHTML = filled ? icon('check') : '1'; }
  $('.co-progress [data-step="checkout"]').classList.toggle('is-current', !done); $('.co-progress [data-step="checkout"]').classList.toggle('is-done', done);
  $('.co-progress [data-step="checkout"] .dot').innerHTML = done ? icon('check') : '2';
  $('.co-progress [data-step="done"]').classList.toggle('is-current', done);
  done ? $('.co-progress [data-step="done"]').setAttribute('aria-current', 'step') : $('.co-progress [data-step="done"]').removeAttribute('aria-current');
  done ? $('.co-progress [data-step="checkout"]').removeAttribute('aria-current') : $('.co-progress [data-step="checkout"]').setAttribute('aria-current', 'step');
}

/* ============================================================ form view ============================================================ */
function showForm() {
  setView('form');
  $('#co-h1').textContent = t('h1', {}, 'Checkout'); $('#co-eyebrow').textContent = t('eyebrow');
  buildSummaryLines();
  update();
}

function showEmpty() {
  setView('empty');
  $('#co-h1').textContent = t('h1', {}, 'Checkout');
  $('#co-empty').innerHTML = `<div class="co-empty"><img src="/lit-neon-preview/assets/img/empty/basket.svg" alt="" width="160" height="120"><h2 class="t-display-3">${esc(t('empty.title'))}</h2><p class="t-lead">${esc(t('empty.text'))}</p>
    <div class="co-empty__acts"><a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/create.html" data-qa="checkout.empty.design">${esc(t('empty.design'))}</a><a class="c-btn c-btn--ghost c-btn--lg" href="/lit-neon-preview/shop.html" data-qa="checkout.empty.shop">${esc(t('empty.shop'))}</a></div></div>`;
}

/** order-summary lines (built once per basket shape so the live minis are not re-mounted on every keystroke) */
function buildSummaryLines() {
  const lines = basket.lines();
  const shape = lines.map(l => l.uid + ':' + l.specHash).join('|');
  const box = $('#co-sum');
  if (shape === summaryBuiltFor && box.children.length) return;
  summaryBuiltFor = shape;
  minis.forEach(s => { try { s && s.destroy && s.destroy(); } catch {} }); minis.clear();
  box.innerHTML = `<ul class="co-lines" data-qa="checkout.lines"></ul><div class="co-quoted" data-qa="checkout.quoted" hidden></div><p class="co-note co-preview" data-caption="rendered">${icon('image', 'ic--sm')}${esc(t('preview', {}, 'Signs shown as rendered previews.'))}</p><div class="co-totals" data-qa="checkout.totals"></div><div class="co-bnpl" data-slot="bnpl"></div>`;
  const ul = box.querySelector('.co-lines'), quoted = box.querySelector('.co-quoted');
  const qItems = [];
  lines.forEach(l => {
    const p = basket.priceLine(l);
    if (l.kind === 'quote' || p.kind === 'quote') { qItems.push(l); return; }
    const li = document.createElement('li'); li.className = 'co-line'; li.dataset.uid = l.uid; li.dataset.kind = l.kind; li.dataset.qa = 'checkout.line';
    li.innerHTML = lineHtml(l);
    ul.appendChild(li);
    minis.set(l.uid, mountLineMini(li.querySelector('[data-mini]'), l, 'checkout.mini'));
  });
  if (qItems.length) {
    quoted.hidden = false;
    quoted.innerHTML = `<h3 class="t-eyebrow">${esc(t('quoted', {}, 'Quoted separately'))}</h3><ul class="co-lines co-lines--quoted">${qItems.map(l => `<li class="co-line co-line--quote" data-uid="${esc(l.uid)}" data-qa="checkout.quoted.line"><div class="co-line__thumb" data-mini></div><div class="co-line__main"><p class="co-line__name">${esc(lineName(l))}</p><p class="co-line__spec">${esc(shortSpec(l))}</p></div><span class="co-line__price">${esc(t('line.quote', {}, 'Quote'))}</span><span class="sr-only" data-caption="rendered">${esc(t('line.preview', {}, 'Rendered preview'))}</span></li>`).join('')}</ul><p class="co-note">${esc(t('quotedNote', { hours: hoursText() }))}</p>`;
    quoted.querySelectorAll('.co-line').forEach(li => { const l = basket.get(li.dataset.uid); if (l) minis.set(l.uid, mountLineMini(li.querySelector('[data-mini]'), l, 'checkout.mini')); });
  }
  placeSummary();
}
const shortSpec = l => { const rows = specRows(l); const pick = k => (rows.find(r => r.k === k) || {}).value; return [pick('size'), pick('colour'), pick('backing'), pick('symbol') && `${t('spec.symbol', {}, 'Symbol')}: ${pick('symbol')}`].filter(Boolean).join(' · '); };
function lineHtml(l) {
  return `<div class="co-line__thumb"><div class="co-line__mini" data-mini></div><span class="co-line__qty" data-qa="checkout.line.qty" aria-label="${esc(t('qty', { n: l.qty }, 'Quantity {n}'))}">${l.qty}</span></div>
    <div class="co-line__main"><p class="co-line__name"><span class="co-kind">${esc(kindLabel(l))}</span>${esc(lineName(l))}</p><p class="co-line__spec">${esc(shortSpec(l))}</p></div>
    <span class="co-line__price" data-qa="checkout.line.price"></span><span class="sr-only" data-caption="rendered">${esc(t('line.preview', {}, 'Rendered preview'))}</span>`;
}

/** on phones/tablets the one summary card moves into the collapsible "Show order summary" at the top (Shopify's pattern) */
function placeSummary() {
  const card = $('.co-summary__card'); const small = matchMedia('(max-width: 1023px)').matches;
  const target = small ? $('#co-mob-body') : $('#co-summary');
  if (card.parentElement !== target) target.appendChild(card);
  $('#co-summary').hidden = small;
}

/* ---------------------------------------------------------------- totals (Shopify mirror) ---------------------------------------------------------------- */
function findCode(raw) { const k = String(raw || '').trim().toUpperCase(); return CODES.find(c => c.code.toUpperCase() === k) || null; }
function codeAmount(c, everyday) { if (!c) return 0; if (c.minSubtotal && everyday < c.minSubtotal) return 0; return c.type === 'percent' ? round2(everyday * c.value / 100) : Math.min(+c.value, everyday); }
/** the better of the launch price and the code — never both (§3.7a, B41) */
export function totalsFor(sub, c, promoPct) {
  const everyday = sub.everyday; const launch = sub.promo ? sub.discount : 0; const codeAmt = codeAmount(c, everyday);
  let winner = null, discount = 0;
  if (c && codeAmt > 0 && codeAmt > launch) { winner = 'code'; discount = codeAmt; } else if (launch > 0) { winner = 'launch'; discount = launch; }
  const label = winner === 'launch' ? t('discount', { pct: promoPct }, 'Launch price (−{pct}%)') : winner === 'code' ? (c.type === 'percent' ? t('codeRow', { code: c.code, pct: c.value }) : t('codeRowFixed', { code: c.code })) : '';
  const note = c && launch > 0 && codeAmt > 0 ? (winner === 'code' ? t('promo.codeWins') : t('promo.codeLoses')) : '';
  return { everyday, launch, codeAmt, winner, discount: round2(discount), total: round2(everyday - discount), label, note, items: sub.items };
}
const totals = () => totalsFor(basket.subtotal(), code, pricing.promoPct());

function update() {
  if ($('#co-form-view').hidden) return;
  const lines = basket.lines(); if (!lines.length) return;
  const sub = basket.subtotal(); const hasQuote = sub.quotes > 0; const priced = sub.items > 0; const waiting = isWaiting();
  /* line prices: EVERYDAY × qty (Shopify shows variant prices; the discount is a row) */
  $$('#co-sum .co-line[data-kind]').forEach(li => { const l = basket.get(li.dataset.uid); if (!l) return; const p = basket.priceLine(l); li.querySelector('[data-qa="checkout.line.price"]').textContent = p.kind === 'price' ? money(p.everyday * l.qty) : '…'; li.querySelector('.co-line__spec').textContent = shortSpec(l); });
  $$('#co-sum .co-line--quote').forEach(li => { const l = basket.get(li.dataset.uid); if (l) li.querySelector('.co-line__spec').textContent = shortSpec(l); });
  const T = totals();
  const box = $('#co-sum .co-totals');
  box.innerHTML = priced ? `
    <div class="co-row"><span>${esc(t('subtotal', {}, 'Subtotal'))}</span><span class="num" data-qa="checkout.subtotal">${waiting ? '…' : money(T.everyday)}</span></div>
    ${T.winner ? `<div class="co-row co-row--disc" data-qa="checkout.discount" data-winner="${T.winner}"><span>${esc(T.label)}</span><span class="num">−${money(T.discount)}</span></div>` : ''}
    ${T.note ? `<p class="co-note co-note--disc" data-qa="checkout.discount.note">${esc(T.note)}</p>` : ''}
    <div class="co-row"><span>${esc(t('delivery', {}, 'Delivery'))}</span><span>${esc(t('deliveryFree', {}, 'Free'))}</span></div>
    ${pc.status === 'ok' ? `<p class="co-note" data-qa="checkout.delivery.line">${esc(pc.text)}</p>` : ''}
    <div class="co-row co-row--total"><span>${esc(t('total', {}, 'Total'))} <small>${esc(t('items', { n: T.items, unit: t(T.items === 1 ? 'unit.one' : 'unit.many') }))}</small></span><b class="num" data-qa="checkout.total">${waiting ? '…' : money(T.total)}</b></div>`
    : `<p class="co-note">${esc(t('onlyQuotes'))}</p>`;
  const bn = $('#co-sum [data-slot="bnpl"]'); if (priced && !waiting) ui.bnpl(bn, T.total, { qa: 'checkout.bnpl' }).catch(() => {}); else bn.hidden = true;
  $('[data-qa="checkout.mobilesummary.total"]').textContent = priced && !waiting ? money(T.total) : '';
  $('#co-mob [data-mob-label]').textContent = $('#co-mob').open ? t('hideSummary', {}, 'Hide order summary') : t('showSummary', {}, 'Show order summary');

  /* express: hidden with a quote line, and when nothing is payable */
  const exBlock = $('#co-express');
  exBlock.hidden = !priced;
  if (!exBlock.dataset.built) { exBlock.dataset.built = '1'; ui.expressRow($('#co-express-row'), { qa: 'checkout.express', onPick: id => { location.hash = 'express=' + encodeURIComponent(id); } }).then(r => { exBlock._row = r; r.setHidden(hasQuoteNow()); }).catch(() => {}); }
  if (exBlock._row) exBlock._row.setHidden(hasQuote);
  $('#co-express-blocked').hidden = !hasQuote; $('#co-express-blocked').textContent = hasQuote ? t('express.blocked') : '';
  $('#co-or').hidden = hasQuote;

  /* legal statements by line kind */
  const kinds = new Set(lines.map(l => l.kind));
  const legal = [];
  if (kinds.has('custom') || kinds.has('photo') || kinds.has('quote')) legal.push(['drawing', t('ccr'), 'ccr']);
  if (kinds.has('ready')) legal.push(['rotate', t('readyReturns', { returns: facts.get('readyMadeReturnsDays') || '14-day returns' }), 'ready']);
  if (kinds.has('photo')) legal.push(['image', t('photoProof'), 'photo']);
  legal.push(['box', t('invoice'), 'invoice']);
  $('#co-legal').innerHTML = legal.map(([ic, txt, k]) => `<li data-qa="checkout.legal.${k}">${icon(ic)}<span>${esc(txt)}</span></li>`).join('');

  /* postcode message */
  paintPostcode();
  /* continue: needs something payable, measured prices and a deliverable postcode */
  const btn = $('#co-continue'); let why = '';
  if (!priced) why = t('onlyQuotes');
  else if (pc.status === 'excluded') why = t('excludedBlock');
  else if (pc.status !== 'ok') why = t('postcodeRequired', {}, 'Add a delivery postcode above to continue.');
  else if (waiting) why = '…';
  btn.disabled = !!why; $('#co-why').textContent = why === '…' ? '' : why; $('#co-why').classList.toggle('is-bad', pc.status === 'excluded');
  if (!$('#co-marks').dataset.built) { $('#co-marks').dataset.built = '1'; ui.paymentMarks($('#co-marks'), { qa: 'checkout.marks' }).catch(() => {}); }
  paintDebug($('#co-debug'), () => basket.payload({ postcode: pc.status === 'ok' ? pc.formatted : undefined }));
}
const hasQuoteNow = () => basket.subtotal().quotes > 0;

function paintPostcode() {
  const msg = $('#co-pc-msg'), input = $('#co-pc-in'), form = $('#co-pc');
  const bad = pc.status === 'excluded' || pc.status === 'invalid';
  form.classList.toggle('is-bad', bad); form.classList.toggle('is-ok', pc.status === 'ok');
  bad ? input.setAttribute('aria-invalid', 'true') : input.removeAttribute('aria-invalid');
  if (pc.status === 'ok') msg.innerHTML = `${icon('check', 'ic--sm')}<span data-qa="checkout.postcode.ok">${esc(pc.prefix || '')}</span>`;
  else if (pc.status === 'excluded') { const href = contactLink(chromeApi, pc.formatted); msg.innerHTML = `${icon('warning', 'ic--sm')}<span>${esc(pc.text)}.</span> <a href="${esc(href)}" data-qa="checkout.postcode.ask">${esc(t('postcode.excludedRoute', {}, 'Ask us about delivery'))}</a>`; }
  else if (pc.status === 'invalid') msg.innerHTML = `${icon('warning', 'ic--sm')}<span>${esc(pc.text)}</span>`;
  else msg.innerHTML = '';
  msg.className = 'co-pc__msg' + (bad ? ' is-bad' : pc.status === 'ok' ? ' is-ok' : '');
}

function wireForms() {
  const check = () => { const v = $('#co-pc-in').value; if (!v.trim()) { pc = { status: 'invalid', text: t('postcode.required', {}, 'Add a mainland-GB postcode to continue.') }; update(); return; } pc = basket.delivery(v); if (pc.status === 'ok' || pc.status === 'excluded') $('#co-pc-in').value = pc.formatted; if (pc.status === 'ok') basket.postcode.set(pc.formatted); update(); };
  $('#co-pc').addEventListener('submit', e => { e.preventDefault(); check(); });
  $('#co-pc-in').addEventListener('blur', () => { if ($('#co-pc-in').value.trim()) check(); });
  $('#co-pc-in').addEventListener('input', () => { if (pc.status !== 'empty') { pc = { status: 'empty' }; update(); } });
  $('#co-code').addEventListener('submit', e => { e.preventDefault(); applyCode(); });
  $('#co-mob').addEventListener('toggle', () => { $('#co-mob [data-mob-label]').textContent = $('#co-mob').open ? t('hideSummary') : t('showSummary'); });
  $('#co-continue').addEventListener('click', () => { if ($('#co-continue').disabled) return; const s = placeOrder(null); if (s) location.hash = 'confirmed'; });
}

function applyCode() {
  const input = $('#co-code-in'); const raw = input.value.trim(); const msg = $('#co-code-msg');
  const set = (kind, text) => { msg.className = 'co-pc__msg' + (kind === 'bad' ? ' is-bad' : ' is-ok'); msg.innerHTML = `${icon(kind === 'bad' ? 'warning' : 'check', 'ic--sm')}<span>${esc(text)}</span>${kind === 'ok' ? ` <button type="button" class="co-linkbtn" data-qa="checkout.code.remove">${esc(t('code.remove', {}, 'Remove code'))}</button>` : ''}`; };
  if (!raw) { input.setAttribute('aria-invalid', 'true'); set('bad', t('code.empty')); return; }
  const c = findCode(raw);
  if (!c) { input.setAttribute('aria-invalid', 'true'); code = null; ss.set(CODE, null); set('bad', t('code.invalid')); update(); return; }
  if (c.minSubtotal && basket.subtotal().everyday < c.minSubtotal) { input.setAttribute('aria-invalid', 'true'); code = null; ss.set(CODE, null); set('bad', t('code.min', { min: money(c.minSubtotal) })); update(); return; }
  input.removeAttribute('aria-invalid'); input.value = c.code; code = c; ss.set(CODE, c.code);
  const T = totals();
  set('ok', T.winner === 'launch' ? t('code.loses', { code: c.code }) : t('code.applied', { code: c.code }));
  msg.querySelector('[data-qa="checkout.code.remove"]').addEventListener('click', () => { code = null; ss.set(CODE, null); input.value = ''; msg.innerHTML = ''; msg.className = 'co-pc__msg'; update(); input.focus(); });
  update();
}

/* ============================================================ placing the (test) order ============================================================ */
function placeOrder(provider) {
  const lines = basket.lines(); if (!lines.length) return null;
  const T = totals(); const postcode = pc.status === 'ok' ? pc.formatted : (provider ? null : null);
  const payload = basket.payload({ postcode: postcode || undefined });
  const snapLines = [], quoted = [];
  lines.forEach(l => {
    const p = basket.priceLine(l);
    const m = l.meta || {};
    const row = { uid: l.uid, kind: l.kind, name: lineName(l), spec: shortSpec(l), qty: l.qty, state: l.state, ...(l.kind === 'photo' ? { meta: { png: m.png || null, widthCm: m.widthCm || null, heightCm: m.heightCm || null, ledMetres: m.ledMetres || null } } : {}) };
    if (l.kind === 'quote' || p.kind !== 'price') quoted.push({ ...row, reason: (l.meta && l.meta.reason) || p.reason || '' });
    else snapLines.push({ ...row, everyday: p.everyday, payable: p.payable });
  });
  const snap = { ref: 'LN-T-' + clock.now().getTime().toString(36).toUpperCase(), provider: provider || null, providerName: provider ? providerName(provider) : null,
    postcode, delivery: postcode ? pc.line || pc.text : null, promo: pricing.promoLive(), lines: snapLines, quoted, totals: T, payload, at: clock.now().toISOString() };
  ss.set(SNAP, snap); ss.set(CODE, null); code = null;
  basket.clear();
  return snap;
}

/* ============================================================ confirmation ============================================================ */
function showConfirm(snap) {
  setView('confirm');
  const root = $('#co-confirm');
  minis.forEach(s => { try { s && s.destroy && s.destroy(); } catch {} }); minis.clear(); summaryBuiltFor = '';
  if (!snap) {
    $('#co-h1').textContent = t('confirm.none'); $('#co-eyebrow').textContent = t('progress.done', {}, 'Confirmation');
    root.innerHTML = `<div class="wrap"><div class="co-empty"><p class="t-lead">${esc(t('confirm.noneText'))}</p><div class="co-empty__acts"><a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/basket.html" data-qa="checkout.confirm.basket">${esc(t('progress.basket', {}, 'Basket'))}</a><a class="c-btn c-btn--ghost c-btn--lg" href="/lit-neon-preview/shop.html" data-qa="checkout.confirm.back">${esc(t('confirm.back'))}</a></div></div></div>`;
    return;
  }
  const title = t('confirm.title', { ref: snap.ref }) + (snap.providerName ? t('confirm.via', { provider: snap.providerName }) : '');
  $('#co-h1').textContent = title; $('#co-eyebrow').textContent = t('confirm.eyebrow');
  const { min, max } = daysRange(); const hours = hoursText();
  const steps = [['drawing', 's1t', 's1'], ['check', 's2t', 's2'], ['ruler', 's3t', 's3'], ['truck', 's4t', 's4']];
  const T = snap.totals;
  root.innerHTML = `<div class="wrap co-confirm__grid">
    <div class="co-confirm__main">
      <div class="co-tick" aria-hidden="true"><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="28"/><path d="M20 33l8 8 16-17"/></svg></div>
      <p class="t-lead co-confirm__lede">${esc(t('confirm.lede'))}</p>
      <p class="co-confirm__ref" data-qa="checkout.confirm.ref">${esc(snap.ref)}</p>
      <p class="co-confirm__to" data-qa="checkout.confirm.deliver">${icon('truck')}<span>${esc(snap.postcode ? t('confirm.deliverTo', { postcode: snap.postcode }) : snap.providerName ? t('confirm.deliverExpress', { provider: snap.providerName }) : '')}</span></p>
      ${snap.delivery ? `<p class="co-note">${esc(snap.delivery)}</p>` : ''}
      <h2 class="t-display-3 co-confirm__h">${esc(t('confirm.next'))}</h2>
      <ol class="co-timeline" data-qa="checkout.confirm.next">${steps.map(([ic, ti, tx], i) => `<li><span class="co-timeline__dot">${icon(ic)}</span><div><h3 class="t-title">${i + 1} · ${esc(t('confirm.' + ti))}</h3><p>${esc(t('confirm.' + tx, { hours, min, max }))}</p></div></li>`).join('')}</ol>
      <div class="co-confirm__acts"><a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/shop.html" data-qa="checkout.confirm.back">${esc(t('confirm.back'))}</a><a class="c-btn c-btn--ghost c-btn--lg" href="/lit-neon-preview/create.html" data-qa="checkout.confirm.another">${esc(t('confirm.another'))}</a></div>
    </div>
    <aside class="co-summary__card co-confirm__recap" aria-labelledby="co-recap-h">
      <h2 id="co-recap-h" class="t-title">${esc(t('confirm.recap'))}</h2>
      <ul class="co-lines" data-qa="checkout.confirm.lines">${snap.lines.map(l => `<li class="co-line" data-uid="${esc(l.uid)}" data-qa="checkout.confirm.line"><div class="co-line__thumb"><div class="co-line__mini" data-mini></div><span class="co-line__qty">${l.qty}</span></div>
        <div class="co-line__main"><p class="co-line__name">${esc(l.name)}</p><p class="co-line__spec">${esc(l.spec)}</p>${snap.promo && l.payable !== l.everyday ? `<p class="co-line__map" data-qa="checkout.confirm.mapping">${esc(t('confirm.mapping', { everyday: money(l.everyday), payable: money(l.payable) }))}${l.qty > 1 ? ` × ${l.qty}` : ''}</p>` : l.qty > 1 ? `<p class="co-line__map" data-qa="checkout.confirm.mapping">${esc(money(l.everyday))} × ${l.qty}</p>` : ''}</div>
        <span class="co-line__price">${money(l.everyday * l.qty)}</span><span class="sr-only" data-caption="rendered">${esc(t('line.preview', {}, 'Rendered preview'))}</span></li>`).join('')}</ul>
      ${snap.quoted.length ? `<h3 class="t-eyebrow co-confirm__q">${esc(t('quoted'))}</h3><ul class="co-qlist">${snap.quoted.map(q => `<li>${esc(q.name)}${q.reason ? ` — ${esc(q.reason)}` : ''}</li>`).join('')}</ul>` : ''}
      <p class="co-note co-preview" data-caption="rendered">${icon('image', 'ic--sm')}${esc(t('preview'))}</p>
      <div class="co-totals">
        <div class="co-row"><span>${esc(t('subtotal'))}</span><span class="num">${money(T.everyday)}</span></div>
        ${T.winner ? `<div class="co-row co-row--disc" data-qa="checkout.confirm.discount"><span>${esc(T.label)}</span><span class="num">−${money(T.discount)}</span></div>` : ''}
        <div class="co-row"><span>${esc(t('delivery'))}</span><span>${esc(t('deliveryFree'))}</span></div>
        <div class="co-row co-row--total"><span>${esc(t('total'))}</span><b class="num" data-qa="checkout.confirm.total">${money(T.total)}</b></div>
      </div>
      <div data-debug></div>
    </aside></div>`;
  root.querySelectorAll('.co-confirm__recap .co-line').forEach(li => { const l = snap.lines.find(x => x.uid === li.dataset.uid); if (l) minis.set(l.uid, mountLineMini(li.querySelector('[data-mini]'), { kind: l.kind, state: l.state, meta: l.meta || {} }, 'checkout.mini')); });
  paintDebug(root.querySelector('[data-debug]'), () => snap.payload);
  window.scrollTo({ top: 0 });
}

/** "What the store receives" — the exact /cart/add.js payload, review mode + ?debug=1 only */
function paintDebug(host, get) {
  if (!host) return;
  const on = !!(window.LN_BOOT && window.LN_BOOT.debug);
  if (!on) { host.innerHTML = ''; return; }
  const open = host.querySelector('details')?.open;
  host.innerHTML = `<details class="co-debug" ${open ? 'open' : ''}><summary data-qa="checkout.debug">${esc(t('debug', {}, 'What the store receives'))}</summary><pre data-qa="checkout.payload">${esc(JSON.stringify({ items: get().items }, null, 2))}</pre></details>`;
}
