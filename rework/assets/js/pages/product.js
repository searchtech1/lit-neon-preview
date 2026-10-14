/* Lit Neon v2 — product page for ready-made designs (brief §4.6, owner P4): product.html?id=<design>.
   Gallery = the live stage (room frame) on the design's delivered scenes + a close-up studio, with on/off, day/night,
   rulers (cm · in · off), Real size, AR / On your phone, and a Drawing thumb that swaps in the proof sheet for the
   options picked. Buy box: one payable price (§3.7a promo line only while live) with a reason line and itemised
   breakdown, BNPL inside provider limits, numbered option tabs 01 Size · 02 Colour · 03 Backing · 04 Extras (each tab
   label carries the current choice), Deliver to (postcode check with firm dates when leadTimeFrom is confirmed),
   quantity, Add to basket (kind 'ready'; Update basket when opened from the basket with #edit=<uid>), the express row
   (hidden in quote states), and Customise this design (builder, prefilled with every option). Quote states (outdoor,
   over 2 m, over the maximum) keep the indoor price as the reference and swap the CTA for a real quote form.
   Below: Drawing · What's in the box (ix/anatomy) · How it hangs (ix/hanging) · Built to last · How it arrives · FAQ,
   then a related rail and Product + BreadcrumbList JSON-LD. Mobile: a sticky price + Add bar. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import basket, { drawer } from 'core/basket.js';
import router from 'core/router.js';
import * as sheet from 'core/sheet.js';
import * as ar from 'core/ar.js';
import * as forms from 'core/forms.js';
import * as drawingExport from 'core/drawing-export.js';
import * as ui from 'core/ui.js';
import * as facts from 'core/facts.js';
import { fmtDims, fmtLen } from 'core/money.js';
import { track } from 'core/analytics.js';
import { $, $$, t, icon, esc, gbp, bootPage, data, designById, collectionById, stateFor, sceneFor, galleryScenes, defaultSize,
  cheapest, availableSizes, promoInfo, pictureHtml, cardHtml, priceTextFor, hydrateCards, refreshSigns, faqHtml, fillD2, absoluteMeta, loadData } from 'pages/shop.js';

const O = R.OPTIONS;
const isPhone = () => matchMedia('(max-width: 767px)').matches;
let d = null, st = null, editUid = null, stageApi = null, view = { night: true, on: true, rulers: 'cm' }, frame = 'room', current = 'scene';
let lastEveryday = null, reason = '', reasonOk = true, priceUi = null, stickyPrice = null, qty = null, expressApi = null, arApi = null;
let quoteSheet = null, infoTabs = null, optTabs = null;

(async function init() {
  /* perf audit (LCP): as soon as the designs and scenes are in (before the copy), put a poster of the gallery's first room
     in the frame; mountGallery() below picks the same room and the stage replaces the poster when its plates load */
  loadData().then(() => {
    const dd = designById(new URLSearchParams(location.search).get('id')); if (!dd) return;
    const own = sceneFor(dd); const list = Array.from(new Set([...galleryScenes(dd, 3), ...(/studio/.test(own) ? [] : [own])])).slice(0, 3);
    stage.addPoster($('#pd-stage'), list[0] || own, { portraitMedia: '(max-width: 767px)', sizes: '(min-width: 1024px) 52vw, 100vw' });
  }).catch(() => {});
  await bootPage('product', ['product']);
  const id = new URLSearchParams(location.search).get('id');
  d = designById(id);
  if (!d) return missing();

  /* ---------- state: defaults (rule 7: Medium when it can be made), then #d= options, then #edit=<uid> from the basket ---------- */
  st = stateFor(d, { size: defaultSize(d) });
  const h = router.parseHash(location.hash);
  if (h.d && h.d.text === st.text) st = R.normalise({ ...st, ...pickOptions(h.d) });
  if (h.edit) { const line = basket.get(h.edit); if (line && line.kind === 'ready' && line.meta && line.meta.design === d.id) { editUid = h.edit; st = R.normalise({ ...st, ...pickOptions(line.state) }); } }
  if (!availableSizes(d).includes(st.size) && pricing.sizeCards(st).find(c => c.id === st.size)?.available === false) st.size = defaultSize(d);

  fillHead();
  fillStatic();
  mountGallery();
  renderOptions();
  renderDeliver();
  wireCta();
  renderInfo();
  renderRelated();
  wireSticky();
  paint({ first: true });

  R.ensureFonts().then(() => { paint({ silent: true }); refreshSigns(); });
  R.onFonts(() => { paint({ silent: true }); refreshSigns(); });
  /* the basket drawer's "Edit design" (or a quick-view "Full details") on this same page only changes the hash: reopen with it */
  window.addEventListener('hashchange', () => { const nh = router.parseHash(location.hash); if (nh.edit || nh.d) location.reload(); });
  window.__product = { get state() { return st; }, design: d, get stage() { return stageApi; }, frameInfo: () => stageApi && stageApi.frameInfo() };
})();

/** only the option keys a ready-made line may change (words, face and symbol stay the design's) */
function pickOptions(s) { const o = {}; ['colour', 'jacket', 'size', 'backing', 'board', 'hang', 'use'].forEach(k => { if (s && s[k] != null) o[k] = s[k]; }); return o; }

/* ====================================================================== head ====================================================================== */
function fillHead() {
  const col = collectionById((d.collections || [])[0]);
  const title = t('product.meta.title', { name: d.name }); document.title = title;
  const desc = t('product.meta.description', { blurb: d.blurb || '' });
  document.querySelector('meta[name="description"]').content = desc;
  const canon = `/lit-neon-preview/rework/product.html?id=${encodeURIComponent(d.id)}`;
  document.querySelector('link[rel="canonical"]').setAttribute('href', canon);
  document.querySelector('meta[property="og:url"]').setAttribute('content', canon);
  document.querySelector('meta[property="og:title"]').setAttribute('content', title);
  document.querySelector('meta[property="og:description"]').setAttribute('content', desc);
  absoluteMeta('product');
  const prices = ['s', 'm', 'l', 'xl', 'xxl'].map(z => cheapest(d, new Set([z]))?.payable).filter(v => v != null);
  const ld = [{ '@context': 'https://schema.org', '@type': 'Product', name: `${d.name} LED neon sign`, description: d.blurb || desc, sku: d.id,
    image: [location.origin + '/lit-neon-preview/rework/assets/img/og/product.jpg'], brand: { '@type': 'Brand', name: 'Lit Neon' }, category: 'LED neon signs',
    offers: { '@type': 'AggregateOffer', priceCurrency: 'GBP', lowPrice: prices.length ? Math.min(...prices) : undefined, highPrice: prices.length ? Math.max(...prices) : undefined, offerCount: prices.length, availability: 'https://schema.org/MadeToOrder', url: location.origin + canon } },
  { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: location.origin + '/lit-neon-preview/rework/' },
    { '@type': 'ListItem', position: 2, name: t('product.crumbShop'), item: location.origin + '/lit-neon-preview/rework/shop.html' },
    ...(col && !col.redirect ? [{ '@type': 'ListItem', position: 3, name: col.name, item: `${location.origin}/lit-neon-preview/rework/collection.html?c=${col.id}` }] : []),
    { '@type': 'ListItem', position: col && !col.redirect ? 4 : 3, name: d.name, item: location.origin + canon }] }];
  ld.forEach(o => { const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(o); document.head.appendChild(s); });
}
function fillStatic() {
  const col = collectionById((d.collections || [])[0]);
  const colHref = col ? (col.redirect ? `/lit-neon-preview/rework/${col.redirect}` : `/lit-neon-preview/rework/collection.html?c=${encodeURIComponent(col.id)}`) : '/lit-neon-preview/rework/shop.html';
  $('#pd-crumb').textContent = d.name;
  const cc = $('#pd-crumb-col'); cc.textContent = col ? col.name : t('product.crumbShop'); cc.href = colHref;
  const eb = $('#pd-eyebrow'); eb.textContent = col ? col.name : ''; eb.href = colHref;
  $('#pd-h1').textContent = d.name;
  $('#pd-kind').textContent = t('product.kind');
  $('#pd-blurb').textContent = d.blurb || '';
  $('#pd-express-k').textContent = t('product.buy.express');
  $('#pd-custom').innerHTML = `${icon('pencil')}<span><b>${esc(t('product.buy.customise'))}</b><small>${esc(t('product.buy.customiseSub'))}</small></span>`;
  if (editUid) { const e = $('#pd-edit'); e.hidden = false; e.innerHTML = `${icon('pencil', 'ic--sm')} ${esc(t('product.buy.editing'))}`; }
}

/* ====================================================================== gallery ====================================================================== */
function mountGallery() {
  const scenes = galleryScenes(d, 3);
  /* the gallery opens on a room (furniture in frame gives the scale); the dark studio is the close-up thumb */
  const own = sceneFor(d);
  const list = Array.from(new Set([...scenes, ...(/studio/.test(own) ? [] : [own])])).slice(0, 3);
  const first = list[0] || own;
  const thumbs = [...list.map(id => ({ id, kind: id === 's00-studio-dark' ? 'studio' : 'scene' })), ...(list.includes('s00-studio-dark') ? [] : [{ id: 's00-studio-dark', kind: 'studio' }]), { id: 'drawing', kind: 'drawing' }];
  $('#pd-thumbs').innerHTML = thumbs.map((th, i) => {
    const sc = stage.getScene(th.id);
    const label = th.kind === 'drawing' ? t('product.gallery.drawing') : th.kind === 'studio' ? t('product.gallery.studio') : (sc ? sc.name : th.id);
    const aria = th.kind === 'drawing' ? t('product.gallery.drawingLabel') : t('product.gallery.scene', { scene: label.toLowerCase() });
    const media = th.kind === 'drawing' ? `<span class="pd-thumb__draw">${icon('drawing', 'ic--lg')}</span>` : pictureHtml(th.id, { portrait: false, cls: 'pd-thumb__img', sizes: '120px', max: 600 });
    return `<button type="button" class="pd-thumb" data-qa="product.thumb" data-id="${esc(th.id)}" data-kind="${th.kind}" aria-pressed="${i === 0}" aria-label="${esc(aria)}">${media}<span class="pd-thumb__label">${esc(label)}</span></button>`;
  }).join('');
  stageApi = stage.mount($('#pd-stage'), { frame, scene: first, design: { ...st, scene: first }, interactive: true, qa: 'product.gallery', priority: 'high', view: { ...view } });
  $('#pd-stage').setAttribute('data-qa', 'product.gallery');
  $('#pd-stage').setAttribute('aria-label', t('product.gallery.label', { name: d.name }));
  $('#pd-thumbs').addEventListener('click', e => {
    const b = e.target.closest('.pd-thumb'); if (!b) return;
    $$('.pd-thumb').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (b.dataset.kind === 'drawing') return showDrawing(true);
    showDrawing(false); current = b.dataset.kind; stageApi.setScene(b.dataset.id); st = { ...st, scene: b.dataset.id };
  });
  /* toolbar: light · day/night · rulers on top; real size + AR along the bottom */
  const tools = $('#pd-tools');
  tools.innerHTML = `
    <button type="button" class="c-btn c-btn--icon pd-tool" data-qa="product.tool.light" aria-pressed="true" aria-label="${esc(t('product.gallery.light'))}" title="${esc(t('product.gallery.on'))}">${icon('power')}</button>
    <button type="button" class="c-btn c-btn--icon pd-tool" data-qa="product.tool.daynight" aria-pressed="false" aria-label="${esc(t('product.gallery.dayNight'))}" title="${esc(t('product.gallery.night'))}">${icon('moon')}</button>
    <button type="button" class="c-btn pd-tool pd-tool--text" data-qa="product.tool.rulers" aria-label="${esc(t('product.gallery.rulersLabel', { unit: t('product.gallery.units.cm') }))}">${icon('ruler')}<span class="v">cm</span></button>`;
  const bottom = $('#pd-tools-bottom');
  bottom.innerHTML = `<button type="button" class="c-btn pd-tool pd-tool--text" data-qa="product.tool.real" aria-pressed="false" aria-label="${esc(t('product.gallery.realLabel'))}">${icon('image')}<span class="v">${esc(t('product.gallery.real'))}</span></button><button type="button" class="c-btn pd-tool pd-tool--text pd-ar" data-qa="product.ar">${icon('ar-cube')}<span class="lbl"></span></button>`;
  tools.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const q = b.dataset.qa;
    if (q === 'product.tool.light') { view.on = !view.on; stageApi.setView({ on: view.on }); b.setAttribute('aria-pressed', String(view.on)); b.title = t(view.on ? 'product.gallery.on' : 'product.gallery.off'); }
    if (q === 'product.tool.daynight') { view.night = !view.night; stageApi.setView({ night: view.night }); b.setAttribute('aria-pressed', String(!view.night)); b.innerHTML = icon(view.night ? 'moon' : 'sun'); b.title = t(view.night ? 'product.gallery.night' : 'product.gallery.day'); }
    if (q === 'product.tool.rulers') { const order = ['cm', 'in', 'off']; view.rulers = order[(order.indexOf(view.rulers) + 1) % 3]; stageApi.setView({ rulers: view.rulers, unit: view.rulers === 'off' ? 'cm' : view.rulers }); b.querySelector('.v').textContent = view.rulers === 'off' ? t('product.gallery.units.off') : view.rulers; b.setAttribute('aria-label', t('product.gallery.rulersLabel', { unit: t('product.gallery.units.' + view.rulers) })); b.classList.toggle('is-off', view.rulers === 'off'); }
  });
  bottom.querySelector('[data-qa="product.tool.real"]').addEventListener('click', e => {
    const b = e.currentTarget; frame = frame === 'real' ? 'room' : 'real'; stageApi.setFrame(frame); b.setAttribute('aria-pressed', String(frame === 'real'));
    b.querySelector('.v').textContent = t(frame === 'real' ? 'product.gallery.realOff' : 'product.gallery.real');
  });
  const arBtn = bottom.querySelector('.pd-ar');
  try { arApi = ar.mount(arBtn, { stage: stageApi, getState: () => R.normalise({ ...st, on: true }), link: arLink, qa: 'product.ar', onFallback: f => openOwnWall(f && f.message) }); } catch { arBtn.remove(); }
  paintCloseThumb();
}
/* the AR / On your phone link carries the options picked here (size, colour, backing, extras), so the phone opens the
   same configuration instead of the default Medium (init() reads #d= back when the words match the design) */
function arLink() { return location.origin + location.pathname + location.search + router.buildHash(R.normalise({ ...st, on: true })); }
/* the close-up thumb: the dark studio plate is black on its own, so the lit sign is baked (stage.toPNG) on top of it */
let closeTimer = 0;
function paintCloseThumb() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(async () => {
    const tb = document.querySelector('.pd-thumb[data-kind="studio"]'); if (!tb || !stageApi) return;
    try {
      await stageApi.ready; if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const png = await stageApi.toPNG({ transparent: true, bakeGlow: true }); if (!png) return;
      let img = tb.querySelector('.pd-thumb__sign');
      if (!img) { img = document.createElement('img'); img.className = 'pd-thumb__sign'; img.alt = ''; img.decoding = 'async'; tb.insertBefore(img, tb.querySelector('.pd-thumb__label')); } /* a sibling of <picture>, never inside it: an <img> in <picture> takes the <source> srcset */
      img.src = png.dataUrl; tb.classList.add('has-sign');
    } catch { /* the plate stays; the label still names it */ }
  }, 120);
}
/* AR unsupported → say so, then hand over to See it on your wall (own photo, never uploaded) inside the gallery */
function openOwnWall(message) {
  const plain = String(message || t('product.gallery.wall.fallback')).replace(/<[^>]+>/g, '');
  showDrawing(false);
  const fr = document.querySelector('.pd-frame'); if (!fr) return;
  let box = fr.querySelector('.pd-wall');
  if (!box) {
    box = document.createElement('div'); box.className = 'pd-wall'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'false'); box.setAttribute('aria-labelledby', 'pd-wall-h'); box.dataset.qa = 'product.ownwall';
    box.innerHTML = `<button type="button" class="c-btn c-btn--icon pd-tool pd-wall__x" data-qa="product.ownwall.close" aria-label="${esc(t('product.gallery.wall.close'))}">${icon('close')}</button>
      <p class="pd-wall__msg" role="status" data-qa="product.ownwall.msg"></p>
      <h2 class="pd-wall__h" id="pd-wall-h">${esc(t('product.gallery.wall.title'))}</h2>
      <p class="pd-wall__sub">${icon('lock', 'ic--sm')} ${esc(t('product.gallery.wall.private'))}</p>
      <div class="pd-wall__acts">
        <label class="c-btn c-btn--primary" data-qa="product.ownwall.take"><input type="file" accept="image/*" capture="environment" data-wall-file data-qa="product.ownwall.take.file">${icon('camera')}<span>${esc(t('product.gallery.wall.take'))}</span></label>
        <label class="c-btn c-btn--ghost" data-qa="product.ownwall.choose"><input type="file" accept="image/*" data-wall-file data-qa="product.ownwall.choose.file">${icon('upload')}<span>${esc(t('product.gallery.wall.choose'))}</span></label>
      </div>`;
    fr.appendChild(box);
    const close = () => { box.hidden = true; arBtnFocus(); };
    box.querySelector('.pd-wall__x').addEventListener('click', close);
    box.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    box.querySelectorAll('[data-wall-file]').forEach(inp => inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      try { await stageApi.ownWall.load(file); frame = 'real'; current = 'wall'; box.hidden = true; $$('.pd-thumb').forEach(x => x.setAttribute('aria-pressed', 'false')); ui.toast(t('product.gallery.wall.loaded'), { kind: 'info', duration: 5200 }); }
      catch { box.querySelector('.pd-wall__msg').textContent = t('product.gallery.wall.failed'); }
      inp.value = '';
    }));
  }
  box.querySelector('.pd-wall__msg').textContent = plain;
  box.hidden = false;
  requestAnimationFrame(() => box.querySelector('[data-qa="product.ownwall.take.file"]').focus({ preventScroll: true }));
  if (fr.getBoundingClientRect().top < 0) fr.scrollIntoView({ block: 'start', behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
}
const arBtnFocus = () => { const b = document.querySelector('[data-qa="product.ar"]'); b && b.focus({ preventScroll: true }); };
function showDrawing(on) {
  const el = $('#pd-drawing');
  el.hidden = !on; $('#pd-stage').hidden = on;
  $$('#pd-tools button, #pd-tools-bottom button').forEach(b => { b.disabled = on; });
  if (on) { sheet.render(el, R.normalise({ ...st, on: true }), { compact: isPhone(), title: d.name }); current = 'drawing'; }
}

/* ====================================================================== options ====================================================================== */
const OPT_TABS = ['size', 'colour', 'backing', 'extras'];
function renderOptions() {
  $('#pd-tablist').innerHTML = OPT_TABS.map((k, i) => `<button type="button" role="tab" id="pd-tab-${k}" aria-controls="pd-panel-${k}" aria-selected="${i === 0}" data-qa="product.opttab" data-id="${k}"><span class="k">${esc(t('product.buy.tabs.' + k))}</span><span class="v" id="pd-tabv-${k}"></span></button>`).join('');
  $('#pd-panels').innerHTML = OPT_TABS.map((k, i) => `<div role="tabpanel" id="pd-panel-${k}" aria-labelledby="pd-tab-${k}" class="pd-panel" data-qa="product.panel.${k}" ${i ? 'hidden' : ''} tabindex="0"></div>`).join('');
  optTabs = ui.tabs($('#pd-tablist'), { activate: 'auto' });
  $('#pd-panels').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const q = b.dataset.qa, v = b.dataset.id; const before = st;
    if (q === 'product.size') set({ size: v }, sizeName(v));
    else if (q === 'product.colour') set({ colour: v, jacket: v === 'rgb' ? 'white' : st.jacket }, colourName(v));
    else if (q === 'product.jacket') set({ jacket: v }, (O.jackets.find(j => j.id === v) || {}).name);
    else if (q === 'product.backing') set({ backing: v }, (O.backings.find(x => x.id === v) || {}).name);
    else if (q === 'product.finish') set({ board: v }, (O.finishes.find(x => x.id === v) || {}).name);
    else if (q === 'product.hang') set({ hang: v }, (O.hangs.find(x => x.id === v) || {}).name);
    else if (q === 'product.use') set({ use: v }, (O.uses.find(x => x.id === v) || {}).name);
    else return;
    if (before !== st) { const again = $(`#pd-panels [data-qa="${q}"][data-id="${CSS.escape(v)}"]`); again && again.focus({ preventScroll: true }); }
  });
}
const sizeName = id => (O.sizes.find(s => s.id === id) || {}).name || id;
const colourName = id => (O.colours.find(c => c.id === id) || {}).name || id;
function set(partial, label) { st = R.normalise({ ...st, ...partial }); paint({ label }); }
function renderPanels() {
  /* verdicts ('Fits nicely above the sofa') read best against a room, so studio views borrow the design's room */
  const sc = stage.getScene(galleryScenes(d, 1)[0] || sceneFor(d));
  const cards = pricing.sizeCards(st, sc).filter(c => c.id !== 'custom');
  $('#pd-panel-size').innerHTML = `<p class="pd-help">${esc(t('product.buy.sizeHelp'))}</p><div class="c-sizes pd-sizes">${cards.map(c => {
    const can = c.available !== false; const quote = c.kind === 'quote' && can;
    return `<button type="button" class="c-size" data-qa="product.size" data-id="${c.id}" aria-pressed="${c.id === st.size}" ${can ? '' : `disabled title="${esc(c.reason || '')}"`} aria-label="${esc(`${c.name}, ${c.W} by ${c.H} centimetres, ${can ? (quote ? t('price.quote', {}, 'Quote') : gbp(c.payable)) : (c.reason || '')}`)}">
      <span class="name">${esc(c.name)}</span><span class="dims">${c.W} × ${c.H} cm <span class="in">(${c.inches ? `${c.inches[0]} × ${c.inches[1]} in` : ''})</span></span>
      <span class="dims">${esc(t('product.buy.letter', { cm: c.letterCm }))}</span>
      <span class="price${quote || !can ? ' is-quote' : ''}">${can ? (quote ? esc(t('price.quote', {}, 'Quote')) : gbp(c.payable)) : '—'}</span>
      <span class="verdict">${esc(can ? (c.verdict || '') : (c.reason || ''))}</span></button>`; }).join('')}</div>`;
  const rgb = st.colour === 'rgb';
  const offHex = c => R.offTube ? R.offTube(c, 'colour') : c.hex;
  const colObj = O.colours.find(c => c.id === st.colour) || O.colours[0];
  $('#pd-panel-colour').innerHTML = `<p class="pd-help">${esc(t('product.buy.colourName', { name: colObj.name }))}</p>
    <div class="c-swatches pd-swatches" role="group" aria-label="${esc(t('shop.quick.colour'))}">${O.colours.map(c => `<button type="button" class="c-swatch c-swatch--lg${c.rgb ? ' c-swatch--rgb' : ''}" style="--tube:${c.hex};--core:${c.core || c.hex}" data-qa="product.colour" data-id="${c.id}" aria-pressed="${c.id === st.colour}" aria-label="${esc(c.name)}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`).join('')}</div>
    <h3 class="pd-sub">${esc(t('product.buy.jacket'))}</h3>
    <div class="c-seg c-seg--lg pd-jackets" role="group" aria-label="${esc(t('product.buy.jacket'))}">${O.jackets.map(j => `<button type="button" data-qa="product.jacket" data-id="${j.id}" aria-pressed="${!rgb && j.id === st.jacket || (rgb && j.id === 'white')}" ${rgb && j.id !== 'white' ? 'disabled' : ''}><span class="pd-jacket"><span class="c-swatch c-swatch--off" style="--tube:${j.id === 'white' ? 'var(--paper)' : offHex(colObj)}"><span class="tube"></span></span>${esc(j.name)}</span><span class="delta">${esc(j.sub || '')}</span></button>`).join('')}</div>
    ${rgb ? `<p class="pd-note">${icon('info', 'ic--sm')} ${esc(t('product.buy.rgbJacket'))}</p>` : ''}`;
  const bd = pricing.deltas(st, 'backing', O.backings.map(b => b.id)); const fd = pricing.deltas(st, 'board', O.finishes.map(f => f.id));
  const bIcon = { cut: 'drawing', rect: 'box', stand: 'stand' };
  $('#pd-panel-backing').innerHTML = `<div class="c-opts">${O.backings.map(b => `<button type="button" class="c-opt" data-qa="product.backing" data-id="${b.id}" aria-pressed="${b.id === st.backing}">${icon(bIcon[b.id] || 'box')}<span><span class="name">${esc(b.name)}</span><span class="sub">${esc(b.sub)}</span></span><span class="delta${bd[b.id] ? '' : ' is-included'}">${bd[b.id] ? '+' + gbp(bd[b.id]) : esc(t('pills.included', {}, 'Included'))}</span></button>`).join('')}</div>
    <h3 class="pd-sub">${esc(t('product.buy.finish'))}</h3>
    <div class="pd-finishes" role="group" aria-label="${esc(t('product.buy.finish'))}">${O.finishes.map(f => `<button type="button" class="pd-finish" data-qa="product.finish" data-id="${f.id}" aria-pressed="${f.id === st.board}"><span class="chip" style="background:${esc(f.swatch)}"></span><span class="name">${esc(f.name)}</span><span class="delta">${fd[f.id] ? '+' + gbp(fd[f.id]) : esc(t('pills.included', {}, 'Included'))}</span></button>`).join('')}</div>`;
  const hIcon = { screws: 'standoff', chains: 'chain', strips: 'strip' };
  const stand = st.backing === 'stand';
  const quoteOut = t('pills.quote', {}, 'Quote');
  $('#pd-panel-extras').innerHTML = `<h3 class="pd-sub pd-sub--first">${esc(t('product.buy.hang'))}</h3>
    ${stand ? `<p class="pd-note">${icon('stand', 'ic--sm')} ${esc(t('product.buy.standNote'))}</p>` : `<div class="c-opts">${O.hangs.map(x => `<button type="button" class="c-opt" data-qa="product.hang" data-id="${x.id}" aria-pressed="${x.id === st.hang}">${icon(hIcon[x.id] || 'standoff')}<span><span class="name">${esc(x.name)}</span><span class="sub">${esc(x.sub)}</span></span><span class="delta is-included">${esc(t('pills.included', {}, 'Included'))}</span></button>`).join('')}</div>`}
    <h3 class="pd-sub">${esc(t('product.buy.where'))}</h3>
    <div class="c-seg c-seg--lg" role="group" aria-label="${esc(t('product.buy.where'))}">${O.uses.map(u => `<button type="button" data-qa="product.use" data-id="${u.id}" aria-pressed="${u.id === st.use}">${esc(u.name)}<span class="delta">${u.id === 'out' ? esc(quoteOut) : esc(t('pills.included', {}, 'Included'))}</span></button>`).join('')}</div>
    ${st.use === 'out' ? `<p class="pd-note">${icon('info', 'ic--sm')} ${esc(t('product.buy.outdoorNote'))} ${esc(facts.get('outdoorIndicativePct'))}</p>` : ''}
    <h3 class="pd-sub">${esc(t('product.buy.included'))}</h3>
    <ul class="pd-included">${[['dimmer', 'remote'], ['plug', 'plug-uk'], ['warranty', 'shield'], ['delivery', 'truck']].map(([k, ic]) => `<li>${icon(ic)}<span>${esc(t('product.buy.includedItems.' + k, { warranty: facts.get('warrantyYears') }))}</span></li>`).join('')}</ul>`;
  /* tab labels carry the current choice */
  const fin = O.finishes.find(f => f.id === st.board) || {}; const bk = O.backings.find(b => b.id === st.backing) || {};
  $('#pd-tabv-size').textContent = sizeName(st.size);
  $('#pd-tabv-colour').textContent = colourName(st.colour);
  $('#pd-tabv-backing').textContent = `${bk.name || ''}`;
  $('#pd-tabv-extras').textContent = stand ? (bk.name || '') : ((O.hangs.find(x => x.id === st.hang) || {}).name || '');
}

/* ====================================================================== price + CTA ====================================================================== */
function paint({ first = false, label = '', silent = false } = {}) {
  const p = pricing.price(st);
  renderPanels();
  if (stageApi) { const { scene: _s, ...rest } = st; stageApi.setDesign({ ...rest, on: view.on, night: view.night, unit: view.rulers === 'in' ? 'in' : 'cm' }); paintCloseThumb(); }
  if ($('#pd-drawing').hidden === false) showDrawing(true);
  const quote = p.kind === 'quote';
  if (p.kind === 'price') {
    if (label && lastEveryday != null && p.everyday !== lastEveryday) { const delta = p.everyday - lastEveryday; reason = `${delta > 0 ? '+' : '−'}${gbp(Math.abs(delta))} · ${label}`; reasonOk = false; }
    else { reason = p.res && p.res.dims ? `${fmtDims(p.res.dims.W, p.res.dims.H)} · ${t('product.buy.letter', { cm: p.res.letterCm })}` : ''; reasonOk = true; }
    lastEveryday = p.everyday;
  }
  const bdn = pricing.breakdown(st);
  const rows = bdn && bdn.rows ? bdn.rows.map(r => ({ label: r.label, amount: r.amount, step: { base: 'size', symbol: 'size', rgb: 'colour', colours: 'colour', backing: 'backing', finish: 'backing' }[r.id] || null, delta: r.id !== 'base' })) : [];
  const indoor = quote && p.indoor != null ? p.indoor : null; /* quoteReason already names the indoor reference price */
  const priceData = quote
    ? { quote: true, quoteReason: pricing.quoteReason(p) || (indoor != null ? t('product.quote.indoor', { price: gbp(indoor) }) : ''), variant: 'dock', qa: 'product.price' }
    : p.kind === 'price' ? { quote: false, payable: p.payable, everyday: p.everyday, promo: promoInfo(), reason, reasonOk, breakdown: rows, variant: 'dock', qa: 'product.price', onEdit: step => { optTabs.select(`pd-tab-${step}`, { focus: true }); $('#pd-tablist').scrollIntoView({ block: 'nearest', behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' }); } }
    : { quote: true, quoteReason: t('collection.mini.priceWait'), variant: 'dock', qa: 'product.price' };
  if (!priceUi) priceUi = ui.price($('#pd-price'), priceData); else priceUi.render({ breakdown: undefined, reason: '', ...priceData });
  ui.bnpl($('#pd-bnpl'), p.kind === 'price' ? p.payable * (qty ? qty.value : 1) : 0, { quote: p.kind !== 'price', qa: 'product.bnpl' });
  /* CTA */
  const add = $('#pd-add');
  add.textContent = quote ? t('product.buy.quoteCta') : (editUid ? t('product.buy.update') : t('product.buy.add'));
  add.disabled = p.kind !== 'price' && !quote;
  add.dataset.mode = quote ? 'quote' : 'add';
  $('#pd-qty').hidden = quote;
  expressApi && expressApi.setHidden(quote || !!editUid);
  $('#pd-express-k').hidden = quote || !!editUid;
  $('#pd-custom').href = router.builderLink(R.normalise({ ...st, view: 'room', on: true }));
  const db = $('[data-qa="product.drawing.builder"]'); if (db) db.href = router.builderLink(R.normalise({ ...st, view: 'drawing', on: true }));
  $('#pd-returns').innerHTML = quote ? '' : `${icon('check', 'ic--sm')}<span>${esc(t('product.buy.returns', { returns: facts.get('readyMadeReturnsDays') }))}</span>`;
  if (stickyPrice) { stickyPrice.innerHTML = p.kind === 'price' ? `<b>${gbp(p.payable)}</b><span>${esc(sizeName(st.size))} · ${esc(colourName(st.colour))}</span>` : `<b class="is-quote">${esc(t('price.quote', {}, 'Quote'))}</b><span>${esc(pricing.quoteReason(p))}</span>`; $('#pd-sticky-add').textContent = add.textContent; }
  /* drawing tab follows the options */
  const dt = $('#pd-drawing-sheet'); if (dt && !dt.closest('[hidden]')) sheet.render(dt, R.normalise({ ...st, on: true }), { compact: isPhone(), title: d.name });
}
function wireCta() {
  qty = ui.stepper($('#pd-qty'), { min: 1, max: 10, value: 1, moreHref: '/lit-neon-preview/rework/bulk-quote.html', qa: 'product.qty', onChange: () => { const p = pricing.price(st); if (p.kind === 'price') ui.bnpl($('#pd-bnpl'), p.payable * qty.value, { qa: 'product.bnpl' }); } });
  $('#pd-qty').setAttribute('aria-label', t('product.buy.qty'));
  $('#pd-add').addEventListener('click', e => (e.currentTarget.dataset.mode === 'quote' ? openQuote(e.currentTarget) : addToBasket(e.currentTarget)));
  ui.expressRow($('#pd-express'), { qa: 'product.express', hidden: !!editUid, onPick: (provider, btn) => {
    const p = pricing.price(st); if (p.kind !== 'price') return;
    ui.setBusy(btn, true);
    basket.add({ kind: 'ready', state: lineState(), qty: qty.value, meta: { design: d.id } });
    track('builder_add_to_basket', { kind: 'ready', design: d.id, source: 'express', provider });
    location.href = `/lit-neon-preview/rework/checkout.html#express=${encodeURIComponent(provider)}`;
  } }).then(api => { expressApi = api; paint({ silent: true }); });
}
const lineState = () => { const { view: _v, on: _o, ...spec } = st; return R.normalise({ ...spec, on: true }); };
function addToBasket(btn) {
  const p = pricing.price(st); if (p.kind !== 'price') return;
  if (editUid && basket.get(editUid)) { basket.update(editUid, lineState(), { design: d.id }); if (qty.value > 1) basket.setQty(editUid, qty.value); }
  else basket.add({ kind: 'ready', state: lineState(), qty: qty.value, meta: { design: d.id } });
  track('builder_add_to_basket', { kind: 'ready', design: d.id, source: 'product' });
  ui.flashSuccess(btn, editUid ? t('product.buy.updated') : t('ui.added', {}, 'Added ✓'));
  setTimeout(() => drawer && drawer.open(), 450);
}

/* ---------- quote form (outdoor, over 2 m, over the maximum): a real submission through forms.submit('quote') ---------- */
function openQuote(opener) {
  const p = pricing.price(st); const res = R.resolve(st);
  const fin = O.finishes.find(f => f.id === st.board) || {}; const bk = O.backings.find(b => b.id === st.backing) || {};
  const spec = [[t('shop.quick.sizes'), `${sizeName(st.size)}${res.dims ? `, ${res.dims.W} × ${res.dims.H} cm` : ''}`], [t('shop.quick.colour'), colourName(st.colour)], [t('shop.quick.backing'), `${bk.name}, ${String(fin.name || '').toLowerCase()}`], [t('product.buy.where'), (O.uses.find(u => u.id === st.use) || {}).name]];
  const hours = facts.value('mockupHours') || '';
  const body = `<p class="pd-quote__lede">${esc(t('product.quote.lede', { hours }))}</p>
    <section class="pd-quote__spec" aria-labelledby="pq-spec-h"><header class="pd-quote__head"><p class="t-eyebrow" id="pq-spec-h">${esc(t('product.quote.spec'))}</p><p class="pd-quote__name">${esc(d.name)}</p></header>
      <table class="c-spec pd-quote__table"><tbody>${spec.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>
    <form class="pd-quote__form" id="pd-quote-form" novalidate>
      <div class="c-field"><label for="pq-name">${esc(t('product.quote.name'))}</label><input class="c-input" id="pq-name" name="name" autocomplete="name" data-qa="product.quote.name"></div>
      <div class="c-field"><label for="pq-email">${esc(t('product.quote.email'))}</label><input class="c-input" id="pq-email" name="email" type="email" autocomplete="email" inputmode="email" data-qa="product.quote.email"></div>
      <div class="c-field"><label for="pq-notes">${esc(t('product.quote.notes'))}</label><textarea class="c-input" id="pq-notes" name="notes" rows="3" data-qa="product.quote.notes"></textarea><p class="help">${esc(t('product.quote.notesHint'))}</p></div>
      <label class="c-check" data-qa="product.quote.consent"><input type="checkbox" name="consent"> <span>${esc(t('product.quote.consent'))}</span></label>
      <button type="submit" class="c-btn c-btn--primary c-btn--lg c-btn--block" data-qa="product.quote.submit">${esc(t('product.quote.submit'))}</button>
    </form>`;
  if (!quoteSheet) quoteSheet = ui.sheet({ title: t('product.quote.title'), qa: 'product.quote', body });
  else quoteSheet.setBody(body);
  const form = $('#pd-quote-form', quoteSheet.el);
  forms.bind(form, { kind: 'quote', qa: 'product.quote', extra: () => ({ design: d.id, designName: d.name, reason: p.kind === 'quote' ? p.reason : '', spec: JSON.stringify(basket.specFor ? basket.specFor({ kind: 'quote', state: lineState(), qty: 1, meta: { design: d.id } }) : lineState()), link: location.origin + `/lit-neon-preview/rework/product.html?id=${encodeURIComponent(d.id)}${router.buildHash(lineState())}` }),
    onSuccess: res => { forms.renderSuccess(quoteSheet.body(), { ref: res.ref, local: res.local, title: t('product.quote.doneTitle'), body: esc(t('product.quote.doneBody', { hours })), qa: 'product.quote' }); track('mockup_request', { kind: 'quote', design: d.id }); } });
  quoteSheet.open(opener);
}

/* ====================================================================== deliver to ====================================================================== */
function renderDeliver() {
  const box = $('#pd-deliver');
  box.innerHTML = `<div class="pd-deliver__head">${icon('truck')}<span>${esc(t('product.delivery.label'))}</span></div>
    <form class="pd-deliver__form" id="pd-pc-form" novalidate><label class="sr-only" for="pd-pc">${esc(t('product.delivery.label'))}</label><input class="c-input" id="pd-pc" name="postcode" autocomplete="postal-code" autocapitalize="characters" enterkeyhint="go" placeholder="${esc(t(matchMedia('(max-width: 400px)').matches ? 'product.delivery.placeholderShort' : 'product.delivery.placeholder', {}, t('product.delivery.placeholder')))}" data-qa="product.postcode.input"><button type="submit" class="c-btn c-btn--ghost" data-qa="product.postcode.check">${esc(t('product.delivery.check'))}</button></form>
    <p class="pd-deliver__msg" id="pd-pc-msg" data-qa="product.postcode.msg" aria-live="polite"></p>`;
  const input = $('#pd-pc'), form = $('#pd-pc-form'), msg = $('#pd-pc-msg');
  function show(raw, { save = true } = {}) {
    const r = pricing.deliveryLine(raw);
    msg.className = 'pd-deliver__msg is-' + r.status;
    if (r.status === 'empty') { msg.innerHTML = `${esc(t('product.delivery.hint'))} ${esc(facts.get('leadTimeDays'))} ${esc(facts.get('leadTimeFrom'))}.`; return; }
    if (r.status === 'invalid') { input.setAttribute('aria-invalid', 'true'); msg.innerHTML = `${icon('warning', 'ic--sm')} ${esc(t('product.delivery.invalid'))}`; return; }
    input.removeAttribute('aria-invalid'); input.value = r.formatted || input.value;
    if (save) { router.postcode.set(r.formatted); }
    if (r.status === 'excluded') {
      const ask = `/lit-neon-preview/rework/contact.html?topic=delivery&postcode=${encodeURIComponent(r.formatted || '')}`;
      const contact = facts.has('whatsappNumber') ? `https://wa.me/${String(facts.value('whatsappNumber')).replace(/\D/g, '')}?text=${encodeURIComponent(`Delivery to ${r.formatted}? ${location.href}`)}` : (facts.has('supportEmail') ? `mailto:${facts.value('supportEmail')}?subject=${encodeURIComponent('Delivery to ' + r.formatted)}&body=${encodeURIComponent(location.href)}` : ask);
      msg.innerHTML = `${icon('warning', 'ic--sm')} <span>${esc(r.text)}. <a href="${esc(contact)}" data-qa="product.postcode.ask">${esc(t('product.delivery.excludedCta'))}</a></span>`;
      return;
    }
    msg.innerHTML = `${icon('check', 'ic--sm')} <span><b>${esc(r.prefix || '')}</b> · ${esc(r.line || r.text)}</span> <button type="button" class="c-btn c-btn--text pd-deliver__change" data-qa="product.postcode.change"><span class="label">${esc(t('product.delivery.change'))}</span></button>`;
    form.hidden = true;
    msg.querySelector('[data-qa="product.postcode.change"]').addEventListener('click', () => { form.hidden = false; input.focus(); input.select(); msg.className = 'pd-deliver__msg'; msg.textContent = ''; });
  }
  form.addEventListener('submit', e => { e.preventDefault(); show(input.value); });
  input.addEventListener('blur', () => { const f = pricing.formatPostcode(input.value); if (f) input.value = f; });
  const saved = router.postcode.get();
  if (saved) { input.value = saved; show(saved, { save: false }); } else show('');
}

/* ====================================================================== info tabs ====================================================================== */
function renderInfo() {
  const tabs = ['drawing', 'box', 'hang', 'built', 'arrives', 'faq'];
  $('#pd-infotabs').innerHTML = tabs.map((k, i) => `<button type="button" role="tab" id="pd-itab-${k}" aria-controls="pd-ipanel-${k}" aria-selected="${i === 0}" data-qa="product.tab.${k}">${esc(t('product.tabs.' + k))}</button>`).join('');
  $('#pd-infopanels').innerHTML = tabs.map((k, i) => `<div role="tabpanel" class="pd-ipanel pd-ipanel--${k}" id="pd-ipanel-${k}" aria-labelledby="pd-itab-${k}" data-qa="product.panel.${k}" ${i ? 'hidden' : ''} tabindex="0"></div>`).join('');
  /* Drawing */
  $('#pd-ipanel-drawing').innerHTML = `<div class="pd-drawtab"><div><h3 class="t-display-3">${esc(t('product.drawingTab.title'))}</h3><p class="t-lead">${esc(t('product.drawingTab.body'))}</p>
    <div class="cluster"><button type="button" class="c-btn c-btn--ghost" data-qa="product.drawing.pdf">${icon('download')}${esc(t('product.drawingTab.pdf'))}</button><a class="c-btn c-btn--text" href="${esc(router.builderLink(R.normalise({ ...st, view: 'drawing', on: true })))}" data-qa="product.drawing.builder"><span class="label">${esc(t('product.drawingTab.builder'))}</span></a></div></div>
    <div class="pd-drawtab__sheet" id="pd-drawing-sheet"></div></div>`;
  $('[data-qa="product.drawing.pdf"]').addEventListener('click', async e => { const b = e.currentTarget; ui.setBusy(b, true); try { await drawingExport.download(R.normalise({ ...st, on: true }), { filename: `lit-neon-${d.id}-drawing.pdf` }); } finally { ui.setBusy(b, false); } });
  /* Built to last: only confirmed fact cards; the confirmed statements always */
  const groups = [
    { k: 'tube', facts: ['ledLifetimeHours'], ic: 'power' }, { k: 'backing', facts: ['acrylicThicknessMm'], ic: 'box' },
    { k: 'power', facts: ['psuVoltage', 'psuMarking', 'psuFuseA'], ic: 'plug-uk' }, { k: 'tested', facts: ['benchTestHours'], ic: 'check' }];
  const cards = groups.filter(g => g.facts.some(f => facts.has(f)));
  $('#pd-ipanel-built').innerHTML = `<div class="pd-built"><p class="t-eyebrow">${esc(t('product.built.eyebrow'))}</p><h3 class="t-display-3">${esc(t('product.built.title'))}</h3>
    <ul class="pd-built__list">${[['shield', t('product.built.warranty', { warranty: facts.get('warrantyYears') })], ['drawing', t('product.built.proof')], ['box', t('product.built.workshop')]].map(([ic, s]) => `<li>${icon(ic)}<span>${esc(s)}</span></li>`).join('')}</ul>
    ${cards.length ? `<div class="pd-built__cards" data-qa="product.built.cards">${cards.map(g => `<div class="pd-built__card">${icon(g.ic, 'ic--lg')}<h4>${esc(t('product.built.cards.' + g.k))}</h4><p>${esc(g.facts.filter(f => facts.has(f)).map(f => facts.get(f)).join(' '))}</p></div>`).join('')}</div>` : ''}
    <a class="c-btn c-btn--text" href="/lit-neon-preview/rework/guides/how-led-neon-is-made.html" data-qa="product.built.guide"><span class="label">${esc(t('product.built.guide'))}</span>${icon('arrow-right', 'ic--sm')}</a></div>`;
  /* How it arrives */
  const optional = ['packaging', 'signWeightKg', 'benchTestHours'].filter(k => facts.has(k)).map(k => facts.get(k));
  $('#pd-ipanel-arrives').innerHTML = `<div class="pd-arrives"><figure class="pd-arrives__fig c-paper"><img src="/lit-neon-preview/rework/assets/img/process/05-boxed.svg" alt="" width="480" height="300" loading="lazy">${ui.pill('illustration')}</figure>
    <div><h3 class="t-display-3">${esc(t('product.arrives.title'))}</h3><p class="t-lead">${esc(t('product.arrives.lede'))}</p>
    <ul class="pd-built__list"><li>${icon('truck')}<span>${esc(t('product.arrives.tracked'))}</span></li>${optional.map(s => `<li>${icon('box')}<span>${esc(s)}</span></li>`).join('')}<li>${icon('shield')}<span data-qa="product.arrives.damage">${esc(facts.get('damageReportDays'))}</span></li></ul></div></div>`;
  /* FAQ */
  const ids = data().faq.questions.filter(q => (q.pages || []).includes('product')).map(q => q.id).slice(0, 5);
  $('#pd-ipanel-faq').innerHTML = `<div class="pd-faq"><div class="c-acc" data-qa="product.faq">${faqHtml(ids, { qa: 'product.faq' })}</div><a class="c-btn c-btn--ghost" href="/lit-neon-preview/rework/help.html" data-qa="product.faq.more">${esc(t('product.faqMore'))}</a></div>`;
  ui.accordion($('#pd-ipanel-faq .c-acc'), { deepLink: true });
  /* ix modules mount lazily the first time their tab opens (P1b's mount contract) */
  const mounted = {};
  const lazy = { box: () => import('ix/anatomy.js'), hang: () => import('ix/hanging.js') };
  infoTabs = ui.tabs($('#pd-infotabs'), { onChange: (el, panelId) => {
    const k = panelId.replace('pd-ipanel-', '');
    if (k === 'drawing') sheet.render($('#pd-drawing-sheet'), R.normalise({ ...st, on: true }), { compact: isPhone(), title: d.name });
    if (lazy[k] && !mounted[k]) { mounted[k] = true; const host = document.createElement('div'); host.className = k === 'box' ? 'pd-ix pd-ix--paper paper' : 'pd-ix'; host.dataset.ix = k === 'box' ? 'anatomy' : 'hanging'; $(`#${panelId}`).appendChild(host);
      lazy[k]().then(m => (m.mount || m.default.mount)(host, {})).catch(() => { host.innerHTML = `<p class="t-lead">${esc(k === 'box' ? fillD2(data().faq.questions.find(q => q.id === 'q-box')?.a || '') : fillD2(data().faq.questions.find(q => q.id === 'q-hang')?.a || ''))}</p>`; }); }
  } });
  sheet.render($('#pd-drawing-sheet'), R.normalise({ ...st, on: true }), { compact: isPhone(), title: d.name });
  const hashTab = { '#box': 'box', '#hang': 'hang', '#arrives': 'arrives', '#drawing': 'drawing', '#faq': 'faq', '#built': 'built' }[location.hash];
  if (hashTab) infoTabs.select(`pd-itab-${hashTab}`);
}

/* ====================================================================== related rail ====================================================================== */
function renderRelated() {
  const D = data(); const same = D.designs.filter(x => x.id !== d.id && (x.collections || []).some(c => (d.collections || []).includes(c)));
  const fill = D.designs.filter(x => x.id !== d.id && !same.includes(x)).sort((a, b) => (a.bestsellerRank || 99) - (b.bestsellerRank || 99));
  const list = [...same, ...fill].slice(0, 8);
  const rail = $('#pd-rail');
  rail.innerHTML = list.map(x => cardHtml(x, { qa: 'product.related', priceText: priceTextFor(x) })).join('');
  hydrateCards(rail, { qa: 'product.related' });
  const step = dir => { const c = rail.querySelector('.sh-card'); const w = c ? c.getBoundingClientRect().width + 16 : 300; rail.scrollBy({ left: dir * w, behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' }); };
  $('#pd-rel-prev').addEventListener('click', () => step(-1)); $('#pd-rel-next').addEventListener('click', () => step(1));
  const edges = () => { $('#pd-rel-prev').disabled = rail.scrollLeft < 8; $('#pd-rel-next').disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 8; };
  rail.addEventListener('scroll', () => requestAnimationFrame(edges), { passive: true }); edges(); window.addEventListener('resize', edges);
}

/* ====================================================================== mobile sticky bar ====================================================================== */
function wireSticky() {
  const bar = $('#pd-sticky'); stickyPrice = $('#pd-sticky-price');
  $('#pd-sticky-add').addEventListener('click', e => { const add = $('#pd-add'); if (add.dataset.mode === 'quote') openQuote(e.currentTarget); else addToBasket(e.currentTarget); });
  let ctaVisible = true, overlay = false, footerNear = false;
  const paintBar = () => { const show = isPhone() && !ctaVisible && !overlay && !footerNear; bar.classList.toggle('is-visible', show); bar.setAttribute('aria-hidden', String(!show)); $('#pd-sticky-add').tabIndex = show ? 0 : -1; document.body.classList.toggle('has-pdsticky', show); };
  new IntersectionObserver(([e]) => { ctaVisible = e.isIntersecting || e.boundingClientRect.top > innerHeight; paintBar(); }, { threshold: 0 }).observe($('#pd-cta'));
  document.addEventListener('ln:overlay', e => { overlay = !!(e.detail && e.detail.open); paintBar(); });
  const watchFooter = () => { const f = document.querySelector('.ch-footer'); if (!f) return setTimeout(watchFooter, 400); new IntersectionObserver(([e]) => { footerNear = e.isIntersecting; paintBar(); }, { rootMargin: '120px 0px 0px 0px' }).observe(f); };
  watchFooter();
  matchMedia('(max-width: 767px)').addEventListener('change', paintBar);
}

/* ====================================================================== unknown id ====================================================================== */
function missing() {
  document.title = t('product.notFound.title') + ' | Lit Neon';
  const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
  $('#pd-crumb').textContent = t('product.notFound.title');
  $('.pd-grid').outerHTML = `<div class="pd-missing" data-qa="product.missing"><h1 class="t-display-2" id="pd-h1">${esc(t('product.notFound.title'))}</h1><p class="t-lead">${esc(t('product.notFound.body'))}</p><div class="cluster"><a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/rework/shop.html" data-qa="product.missing.shop">${esc(t('product.notFound.cta'))}</a><a class="c-btn c-btn--ghost c-btn--lg" href="/lit-neon-preview/rework/create.html" data-qa="product.missing.design">${esc(t('product.notFound.ghost'))}</a></div></div>`;
  ['#pd-info', '.pd-related', '#pd-sticky'].forEach(s => $(s)?.remove());
}
