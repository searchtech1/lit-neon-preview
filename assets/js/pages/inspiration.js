/* Lit Neon v2 — inspiration gallery (brief §4.9, owner P5). "Ideas, rendered": every catalogue design composited on
   its scene (delivered plates only), in an even 4:5 grid (4 / 3 / 2). Filters: room · occasion · colour (chips,
   URL-synced, counts, clear). Each card: day/night toggle (the honest off state by day), "Apply this style to my
   words" (inline input that previews your words on the card in that lettering and colour, then opens the designer
   with them), "Open in the designer" (the design's own words). A lightbox (live stage on the design's scene, day /
   night, prev / next, the same two actions + the product page) opens from the image. No customer, town or date
   captions (rule 4); the header disclaimer and a pill on every render say what these are. data-qa="inspiration.*". */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import router from 'core/router.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import { esc } from 'core/money.js';
import { collectionById } from 'pages/shop.js';
import { $, $$, t, icon, bootHub, tileHtml, hydrateTiles, cleanText, stripGlyphs, reduced } from 'pages/business.js';

const GROUPS = ['room', 'use', 'colour'];

(async function init() {
  if (document.body.dataset.page !== 'inspiration') return;
  const D = await bootHub('inspiration', ['shop']);
  const colours = R.OPTIONS.colours;
  const colourName = id => (colours.find(c => c.id === id) || {}).name || id;
  const fontName = id => (R.fontOf(id) || {}).name || id;

  /* designs → ideas (use = occasion tags, plus Business for the business collection) */
  const ideas = D.designs.map((d, i) => ({ d, i, room: d.tags.room || [], use: [...(d.tags.occasion || []), ...((d.collections || []).includes('business') ? ['business'] : [])], colour: [d.colour] }));
  const facetValues = {
    room: (D.facets.room || []).map(f => ({ id: f.id, label: f.label })),
    use: [...(D.facets.occasion || []).map(f => ({ id: f.id, label: f.label })), { id: 'business', label: t('inspiration.filters.business') }],
    colour: colours.filter(c => ideas.some(x => x.colour.includes(c.id))).map(c => ({ id: c.id, label: c.name, hex: c.hex, core: c.core, rgb: !!c.rgb }))
  };

  /* ---------- filter state (URL-synced, one value per group) ---------- */
  const q = new URLSearchParams(location.search);
  const sel = Object.fromEntries(GROUPS.map(g => [g, facetValues[g].some(v => v.id === q.get(g)) ? q.get(g) : '']));
  const matches = (x, except) => GROUPS.every(g => g === except || !sel[g] || x[g].includes(sel[g]));
  function writeUrl() { const p = new URLSearchParams(); GROUPS.forEach(g => sel[g] && p.set(g, sel[g])); history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); }

  function paintFilters() {
    GROUPS.forEach(g => {
      const el = $('#in-f-' + g); el.setAttribute('aria-label', t('inspiration.filters.' + g));
      const counts = v => ideas.filter(x => matches(x, g) && x[g].includes(v)).length;
      const all = `<button type="button" class="c-chip in-chip" aria-pressed="${!sel[g]}" data-qa="inspiration.filter.${g}" data-id="">${esc(t('inspiration.filters.all'))}</button>`;
      const chips = facetValues[g].map(v => { const n = counts(v.id); const on = sel[g] === v.id;
        if (g === 'colour') return `<button type="button" class="c-swatch in-swatch${v.rgb ? ' c-swatch--rgb' : ''}" style="--tube:${v.hex};--core:${v.core || v.hex}" aria-pressed="${on}" data-qa="inspiration.filter.colour" data-id="${v.id}" ${!n && !on ? 'disabled' : ''} aria-label="${esc(`${v.label} (${n})`)}"><span class="tube"></span><span class="name">${esc(v.label)}</span></button>`;
        return `<button type="button" class="c-chip in-chip" aria-pressed="${on}" data-qa="inspiration.filter.${g}" data-id="${v.id}" ${!n && !on ? 'disabled' : ''}>${esc(v.label)} <span class="in-chip__n">${n}</span></button>`; }).join('');
      el.innerHTML = `<span class="in-fgroup__label">${esc(t('inspiration.filters.' + g))}</span><div class="in-fgroup__chips">${g === 'colour' ? '' : all}${chips}</div>`;
    });
    $('#in-clear').hidden = !GROUPS.some(g => sel[g]);
  }
  $('.in-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-qa^="inspiration.filter."]'); if (!b || b.disabled) return;
    const g = b.dataset.qa.split('.').pop(); const id = b.dataset.id;
    sel[g] = sel[g] === id ? '' : id; writeUrl(); paintFilters(); paintGrid();
  });
  $('#in-clear').addEventListener('click', () => { GROUPS.forEach(g => (sel[g] = '')); writeUrl(); paintFilters(); paintGrid(); });

  /* ---------- scenes: spread the delivered rooms down the grid (own scene and alternatives first, then the studios),
     picking the least recently used so the masonry never shows one room four times in a row ---------- */
  const isDelivered = id => { const s = stage.getScene(id); return !!s && !s.placeholder; };
  const recent = []; const sceneMap = new Map();
  ideas.forEach(x => {
    /* one consistent default across the grid: every card opens at night, lit. The daylight studio is left out (its
       plate has no night state, so it read as "off" beside lit neighbours); the per-card toggle shows the day view. */
    const d = x.d;
    const cands = Array.from(new Set([d.scene, ...(d.altScenes || []), 's00-studio-dark'])).filter(id => isDelivered(id) && id !== 's00-studio-light');
    const pick = cands.slice().sort((a, b) => { const ra = recent.lastIndexOf(a), rb = recent.lastIndexOf(b); return ra - rb || cands.indexOf(a) - cands.indexOf(b); })[0] || 's00-studio-dark';
    sceneMap.set(d.id, pick); recent.push(pick);
  });
  const sceneFor = d => sceneMap.get(d.id) || 's00-studio-dark';

  /* phones (two narrow columns): ONE action per card (round-2 review). The card itself opens the designer with that
     design's style and words (you change the words there), so neither "Apply this style to my words" nor "Open in the
     designer" is stacked under all 48 cards; the action row is hidden and the whole tile becomes the designer link.
     Wider screens keep both actions and the larger view. */
  const compactMq = matchMedia('(max-width: 599px)');
  function paintCompact() {
    const c = compactMq.matches;
    document.querySelectorAll('.in-card').forEach(card => {
      const acts = card.querySelector('.in-card__actions'); if (acts) acts.hidden = c;
      if (c) { const form = card.querySelector('.in-apply'); if (form && !form.hidden) closeApply(card); }
      const open = card.querySelector('[data-qa="inspiration.card.open"]'); if (!open) return;
      const name = card.querySelector('.in-card__name')?.textContent || '';
      if (c) { open.removeAttribute('aria-haspopup'); open.setAttribute('aria-label', t('inspiration.openNamed', { name }, `Open ${name} in the designer`)); open.classList.add('is-designer'); }
      else { open.setAttribute('aria-haspopup', 'dialog'); open.setAttribute('aria-label', t('inspiration.view', { name })); open.classList.remove('is-designer'); }
    });
  }
  compactMq.addEventListener('change', paintCompact);

  /* ---------- cards ---------- */
  const stateOf = (d, extra = {}) => R.normalise({ text: (d.lines || []).join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', iconPos: d.iconPos || 'above', size: 'm', scene: sceneFor(d), view: 'room', ...extra });
  function cardHtml(x, n) {
    const d = x.d; const scene = sceneFor(d); const col = collectionById((d.collections || [])[0]);
    return `<article class="in-card" data-qa="inspiration.card" data-id="${esc(d.id)}" data-colour="${esc(d.colour)}" data-font="${esc(d.font)}">
      <div class="in-card__media">
        ${tileHtml({ scene, words: (d.lines || []).join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', qa: 'inspiration.card.render', id: d.id, portrait: true, lazy: n >= 8, cls: 'in-card__tile hub-tile--portrait' })}
        <button type="button" class="in-card__open" data-qa="inspiration.card.open" data-id="${esc(d.id)}" aria-haspopup="dialog" aria-label="${esc(t('inspiration.view', { name: d.name }))}"></button>
        <div class="in-dn" role="group" aria-label="${esc(d.name)}">
          <button type="button" aria-pressed="true" data-qa="inspiration.card.night" data-id="${esc(d.id)}" aria-label="${esc(t('inspiration.nightLabel', { name: d.name }))}">${icon('moon')}</button>
          <button type="button" aria-pressed="false" data-qa="inspiration.card.day" data-id="${esc(d.id)}" aria-label="${esc(t('inspiration.dayLabel', { name: d.name }))}">${icon('sun')}</button>
        </div>
      </div>
      <div class="in-card__body">
        <p class="in-card__eyebrow">${esc(col ? col.name : '')}</p>
        <h2 class="in-card__name">${esc(d.name)}</h2>
        <p class="in-card__meta">${esc(t('inspiration.meta', { colour: colourName(d.colour), font: fontName(d.font) }))}</p>
        <div class="in-card__actions">
          <button type="button" class="c-btn c-btn--ghost in-card__apply" data-qa="inspiration.card.apply" data-id="${esc(d.id)}" aria-expanded="false">${icon('pencil')}<span>${esc(t('inspiration.apply'))}</span></button>
          <a class="c-btn c-btn--text" href="${esc(router.builderLink(stateOf(d)))}" data-qa="inspiration.card.designer" data-id="${esc(d.id)}"><span class="label">${esc(t('inspiration.open'))}</span>${icon('arrow-right')}</a>
        </div>
        <form class="in-apply" data-qa="inspiration.card.applyform" data-id="${esc(d.id)}" hidden novalidate>
          <label class="sr-only" for="in-apply-${esc(d.id)}">${esc(t('inspiration.applyLabel', { font: fontName(d.font), colour: colourName(d.colour) }))}</label>
          <input id="in-apply-${esc(d.id)}" class="c-input" type="text" maxlength="24" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="go" placeholder="${esc(t('inspiration.applyPlaceholder'))}" data-qa="inspiration.card.apply.input" data-id="${esc(d.id)}">
          <p class="in-apply__note" aria-live="polite" hidden></p>
          <div class="in-apply__row">
            <a class="c-btn c-btn--primary" href="${esc(router.builderLink(stateOf(d)))}" data-qa="inspiration.card.apply.go" data-id="${esc(d.id)}">${esc(t('inspiration.applyGo'))}</a>
            <button type="button" class="c-btn c-btn--text" data-qa="inspiration.card.apply.cancel" data-id="${esc(d.id)}"><span class="label">${esc(t('inspiration.applyCancel'))}</span></button>
          </div>
        </form>
      </div>
    </article>`;
  }
  let tiles = null, shown = [];
  function paintGrid() {
    shown = ideas.filter(x => matches(x));
    $('#in-count').textContent = shown.length === 1 ? t('inspiration.countOne') : t('inspiration.count', { n: shown.length });
    const grid = $('#in-grid'); const empty = $('#in-empty');
    if (!shown.length) {
      grid.innerHTML = ''; empty.hidden = false;
      empty.innerHTML = `<div class="c-empty in-empty"><p>${esc(t('inspiration.empty'))}</p><button type="button" class="c-btn c-btn--primary" data-qa="inspiration.empty.clear">${esc(t('inspiration.emptyCta'))}</button></div>`;
      $('[data-qa="inspiration.empty.clear"]').addEventListener('click', () => $('#in-clear').click());
      return;
    }
    empty.hidden = true; empty.innerHTML = '';
    grid.innerHTML = shown.map(cardHtml).join('');
    tiles = hydrateTiles(grid, { fitW: .9, fitH: .9, margin: '1600px 0px' });
    paintCompact();
  }

  /* ---------- card interactions (delegated) ---------- */
  const ideaById = id => ideas.find(x => x.d.id === id);
  function setDay(card, day) {
    const tile = $('.hub-tile', card); tiles && tiles.setLit(tile, !day);
    $('[data-qa="inspiration.card.night"]', card).setAttribute('aria-pressed', String(!day));
    $('[data-qa="inspiration.card.day"]', card).setAttribute('aria-pressed', String(day));
  }
  function applyPaint(card, form) {
    const x = ideaById(card.dataset.id); const inp = $('input', form); const note = $('.in-apply__note', form);
    const c = cleanText(inp.value, x.d.font); const typed = inp.value.trim() ? stripGlyphs(c.text, c.bad) : '';
    const words = typed || (x.d.lines || []).join('\n');
    tiles && tiles.update($('.hub-tile', card), { words, icon: typed ? '' : (x.d.icon || '') });
    note.hidden = !c.bad.length; if (c.bad.length) note.textContent = t('inspiration.applyBad', { glyphs: c.bad.join(' ') });
    $('[data-qa="inspiration.card.apply.go"]', form).href = router.builderLink(stateOf(x.d, typed ? { text: typed, icon: '' } : {}));
    return { typed, state: stateOf(x.d, typed ? { text: typed, icon: '' } : {}) };
  }
  function closeApply(card) {
    const form = $('.in-apply', card); const btn = $('.in-card__apply', card); if (form.hidden) return;
    form.hidden = true; btn.setAttribute('aria-expanded', 'false'); $('input', form).value = ''; applyPaint(card, form); btn.focus({ preventScroll: true });
  }
  const grid = $('#in-grid');
  grid.addEventListener('click', e => {
    const card = e.target.closest('.in-card'); if (!card) return;
    if (e.target.closest('[data-qa="inspiration.card.day"]')) return setDay(card, true);
    if (e.target.closest('[data-qa="inspiration.card.night"]')) return setDay(card, false);
    if (e.target.closest('[data-qa="inspiration.card.open"]')) {
      if (compactMq.matches) { const x = ideaById(card.dataset.id); if (x) { location.href = router.builderLink(stateOf(x.d)); return; } }
      return openLightbox(card.dataset.id, e.target.closest('button'));
    }
    if (e.target.closest('[data-qa="inspiration.card.apply"]')) {
      const form = $('.in-apply', card); const btn = $('.in-card__apply', card);
      if (!form.hidden) return closeApply(card);
      form.hidden = false; btn.setAttribute('aria-expanded', 'true'); setDay(card, false); $('input', form).focus(); return;
    }
    if (e.target.closest('[data-qa="inspiration.card.apply.cancel"]')) return closeApply(card);
    const go = e.target.closest('[data-qa="inspiration.card.apply.go"]');
    if (go) { const { typed, state } = applyPaint(card, $('.in-apply', card)); if (typed) { router.design.flush(); router.design.set(state, 'collection'); } }
  });
  grid.addEventListener('input', e => { const form = e.target.closest('.in-apply'); if (form) applyPaint(form.closest('.in-card'), form); });
  grid.addEventListener('submit', e => { const form = e.target.closest('.in-apply'); if (!form) return; e.preventDefault(); const go = $('[data-qa="inspiration.card.apply.go"]', form); const { typed, state } = applyPaint(form.closest('.in-card'), form); if (typed) { router.design.flush(); router.design.set(state, 'collection'); } location.href = go.href; });
  grid.addEventListener('keydown', e => { if (e.key === 'Escape') { const form = e.target.closest('.in-apply'); if (form) { e.stopPropagation(); closeApply(form.closest('.in-card')); } } });

  /* ---------- lightbox: one live stage, prev / next, the same actions ---------- */
  let lb = null, lbStage = null, lbIndex = 0, lbDay = false;
  function lbBody() {
    return `<div class="in-lb">
      <div class="in-lb__stage" id="in-lb-stage"></div>
      <div class="in-lb__bar">
        <div class="c-seg in-lb__dn" role="group" aria-label="${esc(t('inspiration.night'))} / ${esc(t('inspiration.day'))}">
          <button type="button" aria-pressed="true" data-qa="inspiration.lightbox.night">${icon('moon')}<span>${esc(t('inspiration.night'))}</span></button>
          <button type="button" aria-pressed="false" data-qa="inspiration.lightbox.day">${icon('sun')}<span>${esc(t('inspiration.day'))}</span></button>
        </div>
        <p class="in-lb__of" id="in-lb-of" aria-live="polite"></p>
        <div class="in-lb__nav">
          <button type="button" class="c-btn c-btn--icon c-btn--ghost" data-qa="inspiration.lightbox.prev" aria-label="${esc(t('inspiration.lightbox.prev'))}">${icon('arrow-left')}</button>
          <button type="button" class="c-btn c-btn--icon c-btn--ghost" data-qa="inspiration.lightbox.next" aria-label="${esc(t('inspiration.lightbox.next'))}">${icon('arrow-right')}</button>
        </div>
      </div>
      <div class="in-lb__info">
        <div><p class="in-card__eyebrow" id="in-lb-eyebrow"></p><p class="in-lb__meta" id="in-lb-meta"></p></div>
        <form class="in-lb__apply" id="in-lb-apply" novalidate>
          <label class="sr-only" for="in-lb-input" id="in-lb-label"></label>
          <input id="in-lb-input" class="c-input" type="text" maxlength="24" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="${esc(t('inspiration.applyPlaceholder'))}" data-qa="inspiration.lightbox.input">
          <a class="c-btn c-btn--primary" id="in-lb-go" href="/lit-neon-preview/create.html" data-qa="inspiration.lightbox.go">${esc(t('inspiration.applyGo'))}</a>
        </form>
        <div class="cluster in-lb__links">
          <a class="c-btn c-btn--text" id="in-lb-designer" href="/lit-neon-preview/create.html" data-qa="inspiration.lightbox.designer"><span class="label">${esc(t('inspiration.open'))}</span>${icon('arrow-right')}</a>
          <a class="c-btn c-btn--text" id="in-lb-product" href="/lit-neon-preview/shop.html" data-qa="inspiration.lightbox.product"><span class="label">${esc(t('inspiration.lightbox.shop'))}</span>${icon('arrow-right')}</a>
        </div>
      </div>
    </div>`;
  }
  function lbState() {
    const x = shown[lbIndex]; const inp = $('#in-lb-input'); const c = cleanText(inp ? inp.value : '', x.d.font); const typed = inp && inp.value.trim() ? stripGlyphs(c.text, c.bad) : '';
    const light = false;   /* no daylight-only scene in this gallery (see sceneMap) */
    return { x, typed, light, state: stateOf(x.d, { ...(typed ? { text: typed, icon: '' } : {}), night: !lbDay && !light, on: !lbDay }) };
  }
  function lbPaint(full) {
    const { x, typed, light, state } = lbState(); const d = x.d; const scene = sceneFor(d);
    if (full) { lb.el.querySelector('.c-dialog__head .title').textContent = d.name; $('#in-lb-input').value = ''; }
    $('#in-lb-of').textContent = t('inspiration.lightbox.of', { i: lbIndex + 1, n: shown.length });
    $('#in-lb-eyebrow').textContent = (collectionById((d.collections || [])[0]) || {}).name || '';
    $('#in-lb-meta').textContent = t('inspiration.meta', { colour: colourName(d.colour), font: fontName(d.font) });
    $('#in-lb-label').textContent = t('inspiration.applyLabel', { font: fontName(d.font), colour: colourName(d.colour) });
    $('#in-lb-go').href = router.builderLink(stateOf(d, typed ? { text: typed, icon: '' } : {}));
    $('#in-lb-designer').href = router.builderLink(stateOf(d));
    $('#in-lb-product').href = `/lit-neon-preview/product.html?id=${encodeURIComponent(d.id)}`;
    $$('[data-qa="inspiration.lightbox.night"], [data-qa="inspiration.lightbox.day"]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.qa.endsWith('day')) === lbDay)));
    if (!lbStage) lbStage = stage.mount($('#in-lb-stage'), { frame: 'guide', scene, design: state, interactive: false, rulers: false, qa: 'inspiration.lightbox.stage', view: { night: !lbDay && !light, on: !lbDay, rulers: 'off' } });
    else { if (full) lbStage.setScene(scene); lbStage.setView({ night: !lbDay && !light, on: !lbDay }); lbStage.setDesign(state); }
  }
  function openLightbox(id, opener) {
    lbIndex = Math.max(0, shown.findIndex(x => x.d.id === id)); lbDay = false;
    if (!lb) {
      lb = ui.modal({ title: shown[lbIndex].d.name, body: lbBody(), qa: 'inspiration.lightbox', onClose: () => {} });
      lb.el.classList.add('in-lightbox');
      lb.el.addEventListener('click', e => {
        if (e.target.closest('[data-qa="inspiration.lightbox.prev"]')) step(-1);
        else if (e.target.closest('[data-qa="inspiration.lightbox.next"]')) step(1);
        else if (e.target.closest('[data-qa="inspiration.lightbox.day"]')) { lbDay = true; lbPaint(false); }
        else if (e.target.closest('[data-qa="inspiration.lightbox.night"]')) { lbDay = false; lbPaint(false); }
        else if (e.target.closest('#in-lb-go')) { const { typed, state } = lbState(); if (typed) { router.design.flush(); router.design.set(state, 'collection'); } }
      });
      lb.el.addEventListener('input', e => { if (e.target.id === 'in-lb-input') lbPaint(false); });
      lb.el.addEventListener('submit', e => { e.preventDefault(); const { typed, state } = lbState(); if (typed) { router.design.flush(); router.design.set(state, 'collection'); } location.href = $('#in-lb-go').href; });
      lb.el.addEventListener('keydown', e => { if (e.target.matches('input')) return; if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } });
    }
    lb.open(opener);
    requestAnimationFrame(() => lbPaint(true));
  }
  function step(dir) { lbIndex = (lbIndex + dir + shown.length) % shown.length; lbPaint(true); }

  paintFilters(); paintGrid();
  $('#in-end-design').href = router.builderLink(R.normalise(router.getDesign ? (router.getDesign() || {}) : {}));
  R.ensureFonts().then(() => tiles && tiles.refit()); R.onFonts(() => tiles && tiles.refit());
  document.documentElement.dataset.ready = 'inspiration';
  window.__inspiration = { ideas, sel, shown: () => shown, openLightbox };
})();
