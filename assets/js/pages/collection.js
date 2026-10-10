/* Lit Neon v2 — collection landing (brief §4.5, owner P4): collection.html?c=<id> for the 10 collections that are
   landings (custom → create.html and business → business.html redirect before paint, in collection.html's head).
   Hero = live stage on the collection's scene with its sample design lit, plus the "Your words, here" mini builder
   that relights the same stage as you type and hands the words to the designer (router store, source 'collection').
   Then phrase chips (each a prefilled builder link, previewed on the stage on hover/focus), the size line, the shop
   grid filtered to the collection with a compact facet row and quick view, three FAQs, related collections and the
   SEO accordion below the grid. Seasonal collections show "Back from <month>" outside their window. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import router from 'core/router.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as clock from 'core/clock.js';
import { fmtDims } from 'core/money.js';
import { $, $$, t, icon, esc, gbp, bootPage, data, designById, collectionById, sceneFor, stateFor, createBrowse, hydrateCards,
  refreshSigns, pictureHtml, faqHtml, fillD2, absoluteMeta, galleryScenes, loadData } from 'pages/shop.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isDelivered = id => { const s = stage.getScene(id); return !!s && !s.placeholder; };

/* the hero's scene: the collection's own once delivered, else its sample design's first delivered room */
const heroSceneFor = (col, D) => {
  const sample = designById(col.prefilledDesign) || D.designs.find(d => (d.collections || []).includes(col.id));
  return isDelivered(col.scene) ? col.scene : (sample ? (galleryScenes(sample, 1)[0] || sceneFor(sample)) : 's01-living');
};
(async function init() {
  /* perf audit (LCP): a poster of the hero room goes in as soon as the data is in, before the copy */
  loadData().then(D => { const c = collectionById(new URLSearchParams(location.search).get('c')); if (c && !c.redirect) stage.addPoster($('#co-stage'), heroSceneFor(c, D), { sizes: '(min-width: 1024px) 52vw, 100vw' }); }).catch(() => {});
  await bootPage('collection', ['collection']);
  const D = data();
  const id = new URLSearchParams(location.search).get('c');
  const col = collectionById(id);
  if (!col || col.redirect) return missing(col);

  /* ---------- head + hero copy ---------- */
  document.title = col.metaTitle || t('collection.meta.title', { name: col.name });
  const desc = document.querySelector('meta[name="description"]'); if (desc) desc.content = fillD2(col.metaDescription || col.intro);
  const canonHref = `/lit-neon-preview/collection.html?c=${encodeURIComponent(col.id)}`;
  document.querySelector('link[rel="canonical"]').setAttribute('href', canonHref);
  document.querySelector('meta[property="og:url"]').setAttribute('content', canonHref);
  document.querySelector('meta[property="og:title"]').setAttribute('content', col.metaTitle || col.h1);
  document.querySelector('meta[property="og:description"]').setAttribute('content', fillD2(col.metaDescription || col.intro));
  absoluteMeta('collection');
  const ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: location.origin + '/lit-neon-preview/' },
    { '@type': 'ListItem', position: 2, name: t('collection.crumbShop'), item: location.origin + '/lit-neon-preview/shop.html' },
    { '@type': 'ListItem', position: 3, name: col.name, item: location.origin + canonHref }] });
  document.head.appendChild(ld);
  $('#co-crumb').textContent = col.name;
  $('#co-eyebrow').textContent = col.eyebrow || '';
  $('#co-h1').textContent = col.h1;
  $('#co-intro').textContent = fillD2(col.intro);
  $('#co-mini-label').textContent = t('collection.mini.title');

  /* ---------- hero stage: the collection's sample design, lit, on its scene (or the sample's delivered room) ---------- */
  const sample = designById(col.prefilledDesign) || D.designs.find(d => (d.collections || []).includes(col.id));
  const scene = heroSceneFor(col, D);
  const font = (col.defaults && col.defaults.font) || (sample && sample.font) || 'soho';
  const defColour = (col.defaults && col.defaults.colour) || 'warm';
  let colour = sample ? sample.colour : defColour;
  const colours = Array.from(new Set([colour, defColour, colour === 'warm' ? 'pink' : 'warm'])).slice(0, 2);
  const sampleState = sample ? stateFor(sample, { scene }) : R.normalise({ text: col.tile ? col.tile.words : col.name, font, colour, scene });
  const stageApi = stage.mount($('#co-stage'), { frame: 'room', scene, design: sampleState, interactive: false, qa: 'collection.hero', priority: 'high', view: { rulers: 'off' } });

  /* ---------- mini builder ---------- */
  const input = $('#co-input'); const note = $('#co-note'); const priceEl = $('#co-price'); const cta = $('#co-cta');
  input.placeholder = t('collection.mini.placeholder', { phrase: (col.phrases || [])[0] ? col.phrases[0].replace(/\n/g, ' ') : col.name });
  input.setAttribute('aria-label', t('collection.mini.label'));
  $('#co-swatches').innerHTML = colours.map(cid => { const c = R.OPTIONS.colours.find(x => x.id === cid) || {}; return `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}" style="--tube:${c.hex};--core:${c.core || c.hex}" data-qa="collection.mini.swatch" data-id="${cid}" aria-pressed="${cid === colour}" aria-label="${esc(c.name)}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`; }).join('');
  function current() {
    const raw = input.value; const typed = raw.trim().length > 0;
    const base = typed ? R.normalise({ text: raw, font, colour, scene, size: 'm' }) : R.normalise({ ...sampleState, colour });
    const res = R.resolve(base);
    return { st: { ...base, text: res.clean.text }, res, typed };
  }
  function paint() {
    const { st, res, typed } = current();
    stageApi.setDesign(st);
    const bad = res.bad || [];
    note.hidden = !bad.length;
    if (bad.length) note.innerHTML = `${icon('warning', 'ic--sm')} ${esc(t('collection.mini.bad', { glyphs: bad.join(' ') }))}`;
    const p = pricing.price({ ...st, size: 'm' });
    if (p.kind === 'price') priceEl.textContent = t('collection.mini.price', { price: gbp(p.payable), dims: fmtDims(p.res.dims.W, p.res.dims.H) });
    else if (p.kind === 'quote') priceEl.textContent = t('collection.mini.quote');
    else if (p.kind === 'wait') priceEl.textContent = t('collection.mini.priceWait');
    else priceEl.textContent = '';
    cta.href = router.builderLink({ ...st, size: 'm', view: 'room' });
    if (typed) router.design.setDebounced({ ...st, size: 'm' }, 'collection', 300);
  }
  let paintTimer = 0;
  input.addEventListener('input', () => { clearTimeout(paintTimer); paintTimer = setTimeout(paint, 60); });
  input.addEventListener('blur', () => { const v = input.value.replace(/\s+$/g, ''); if (v !== input.value) { input.value = v; paint(); } });
  $('#co-mini').addEventListener('submit', e => { e.preventDefault(); router.design.flush(); const { st } = current(); router.design.set({ ...st, size: 'm' }, 'collection'); location.href = cta.href; });
  cta.addEventListener('click', () => { const { st, typed } = current(); if (typed) { router.design.flush(); router.design.set({ ...st, size: 'm' }, 'collection'); } });
  $('#co-swatches').addEventListener('click', e => { const b = e.target.closest('[data-qa="collection.mini.swatch"]'); if (!b) return; colour = b.dataset.id; $$('[data-qa="collection.mini.swatch"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); stageApi.strike && stageApi.strike(); });
  paint();

  /* ---------- seasonal notice ---------- */
  if (col.seasonal) {
    const now = clock.now(); const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const inside = md >= col.seasonal.from && md <= col.seasonal.to;
    if (!inside) { $('#co-notice').hidden = false; $('#co-notice-text').textContent = t('collection.seasonalNotice', { name: col.name, month: MONTHS[(col.seasonal.backFromMonth || 1) - 1] }); $('#co-notice-cta').textContent = t('collection.seasonalCta'); }
  }

  /* ---------- phrases + size line ---------- */
  $('#co-phrases-h').textContent = t('collection.phrases');
  $('#co-phrases-hint').textContent = t('collection.phrasesHint');
  $('#co-phrases').innerHTML = (col.phrases || []).map((ph, i) => {
    const st = R.normalise({ text: ph, font, colour, scene, size: 'm' });
    return `<a class="c-chip co-phrase" href="${esc(router.builderLink({ ...st, view: 'room' }))}" data-qa="collection.phrase" data-i="${i}"><span class="co-phrase__txt" style="font-family:'${esc(R.fontOf(font).family)}',cursive">${esc(ph.replace(/\n/g, ' / '))}</span>${icon('arrow-right', 'ic--sm')}</a>`;
  }).join('');
  /* preview a phrase on the hero sign while the pointer or focus is on it (the link still opens the designer) */
  const preview = ph => { if (input.value.trim()) return; stageApi.setDesign(R.normalise({ text: ph, font, colour, scene, size: 'm' })); };
  const unpreview = () => { if (!input.value.trim()) paint(); };
  $$('.co-phrase').forEach((a, i) => { a.addEventListener('pointerenter', () => preview(col.phrases[i])); a.addEventListener('focus', () => preview(col.phrases[i])); a.addEventListener('pointerleave', unpreview); a.addEventListener('blur', unpreview); });
  $('#co-size-h').textContent = t('collection.sizeGuide');
  $('#co-size-text').textContent = fillD2(col.sizeGuide ? col.sizeGuide.text : '');
  $('#co-size-link').textContent = t('collection.sizeGuideLink');

  /* ---------- grid: the shop browse filtered to this collection ---------- */
  const designs = D.designs.filter(d => (d.collections || []).includes(col.id));
  $('#co-grid-h').textContent = t('collection.gridTitle', { name: col.name });
  $('#co-grid-lede').textContent = t('collection.gridLede');
  const browse = createBrowse($('#co-browse'), { designs, groups: ['style', 'occasion', 'room', 'colour'], qa: 'collection', layout: 'compact', keepParams: ['c'] });

  /* ---------- FAQ (3), related collections, SEO ---------- */
  $('#co-faq-h').textContent = t('collection.faqH2');
  $('#co-faq-more').textContent = t('collection.faqMore');
  $('#co-faq').innerHTML = faqHtml(col.faq || [], { qa: 'collection.faq', self: `/lit-neon-preview/collection.html?c=${encodeURIComponent(col.id)}` });
  ui.accordion($('#co-faq'), { single: false });
  $('#co-related-h').textContent = t('collection.related');
  const rel = (col.related || []).map(collectionById).filter(c => c && !c.redirect);
  $('#co-related').innerHTML = rel.map(rc => {
    const rs = designById(rc.prefilledDesign) || D.designs.find(d => (d.collections || []).includes(rc.id));
    const sc = isDelivered(rc.scene) ? rc.scene : (rs ? (galleryScenes(rs, 1)[0] || sceneFor(rs)) : 's01-living');
    const S = stage.getScene(sc) || {}; const a = (S.portrait && S.portrait.anchor) || { x: .5, y: .32 };
    const n = D.designs.filter(d => (d.collections || []).includes(rc.id)).length;
    return `<a class="co-tile" href="/lit-neon-preview/collection.html?c=${encodeURIComponent(rc.id)}" data-qa="collection.related.link" data-id="${esc(rc.id)}">
      <span class="co-tile__media" data-composite style="--ax:${(a.x * 100).toFixed(1)}%;--ay:${(a.y * 100).toFixed(1)}%">${pictureHtml(sc, { cls: 'plate', sizes: '(max-width: 768px) 90vw, 33vw' })}<span class="co-tile__sign" data-words="${esc((rc.tile && rc.tile.words) || rc.name)}" data-font="${esc((rc.defaults && rc.defaults.font) || 'soho')}" data-colour="${esc((rc.defaults && rc.defaults.colour) || 'warm')}"></span>${ui.pill('rendered')}</span>
      <span class="co-tile__eyebrow">${esc(rc.eyebrow || '')}</span><span class="co-tile__name">${esc(rc.name)}</span><span class="co-tile__line">${esc(fillD2(rc.tile ? rc.tile.line : ''))}</span><span class="co-tile__more">${esc(t('collection.relatedCount', { n }))} ${icon('arrow-right', 'ic--sm')}</span></a>`;
  }).join('');
  const relHandles = $$('.co-tile__sign').map(el => R.mountNeon(el, R.normalise({ text: el.dataset.words, font: el.dataset.font, colour: el.dataset.colour }), { fitW: .92, fitH: .9, spill: .45 }));
  $('#co-seo-h').textContent = t('collection.seoTitle', { name: col.name.toLowerCase() });
  $('#co-seo-body').innerHTML = `<p>${esc(fillD2(col.intro))}</p><p>${esc(fillD2(col.metaDescription || ''))}</p>`;
  ui.accordion($('#co-seo'), { deepLink: false });

  R.ensureFonts().then(() => { browse.refresh(); refreshSigns(); relHandles.forEach(h => h.fit()); paint(); });
  R.onFonts(() => { browse.refresh(); refreshSigns(); relHandles.forEach(h => h.fit()); paint(); });
  window.__collection = { col, browse, stage: stageApi, current: () => current().st };
})();

/** unknown id: one honest screen (same H1 slot), no empty hero */
function missing() {
  document.title = t('collection.notFound.title') + ' | Lit Neon';
  $('#co-h1').textContent = t('collection.notFound.title');
  $('#co-intro').textContent = t('collection.notFound.body');
  $('#co-crumb').textContent = t('collection.notFound.title');
  $('#co-eyebrow').textContent = t('collection.crumbShop');
  $('#co-mini').outerHTML = `<div class="cluster"><a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/shop.html" data-qa="collection.missing.shop">${esc(t('collection.notFound.cta'))}</a><a class="c-btn c-btn--ghost c-btn--lg" href="/lit-neon-preview/create.html" data-qa="collection.missing.design">${esc(t('shop.custom.cta'))}</a></div>`;
  $('#co-stage').remove();
  document.querySelector('.co-hero').classList.add('is-missing');
  ['.co-ideas', '.co-grid', '.co-faq', '.co-related', '.sh-seo'].forEach(s => $(s)?.remove());
  const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
}
