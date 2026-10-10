/* Lit Neon v2 — guide article template (brief §4.11; owner P6). One module for all ten guides/<slug>.html pages:
   facts and rules resolved into the prose (CONTRACT §D2 tokens), reading time computed from the real word count,
   the §5 interactives mounted from their data-ix embeds (gated ones collapse and take their heading with them), a sticky
   table of contents with scroll-spy built AFTER the embeds settle, the size table, the backing demo (a live stage with
   backing + finish controls and the price difference from pricing.js), the troubleshooting checklist, neon tiles drawn
   with the renderer, the end CTA prefilled for the guide's context, and Article/BreadcrumbList JSON-LD (static) —
   no literal price, date or workshop claim lives in this file. data-qa="article.*". */
import { bootContent, neonTile, applyTokens, buildToc, whenFonts, paintPrices, copyLink, askHref, $, $$, t, esc, icon, DATA, R, router, pricing, copy } from 'pages/info.js';
import stage from 'core/stage.js';
import { gbp, fmtDate } from 'core/money.js';

const SLUG = document.body.dataset.slug;
const WPM = 220;

(async function boot() {
  await bootContent('article', ['info', 'guides', 'ix'], { data: ['guides', 'designs'] });
  const guide = (DATA.guides.guides || []).find(g => g.slug === SLUG) || {};
  applyTokens($('.ar-body'));
  readingTime();
  updatedDate();
  tiles(guide);
  sizeTable();
  backingDemo();
  checklist();
  cta(guide);
  related();
  progress();
  $('[data-qa="article.copy"]').addEventListener('click', e => copyLink(e.currentTarget, location.pathname));
  /* the interactives: mount, let gated ones collapse, then build the TOC from what's really on the page */
  const body = $('.ar-body');
  let offToc = () => {};
  const toc = () => { offToc(); offToc = buildToc(body, $$('[data-toc-wrap] nav'), { qa: 'article.toc' }); };
  toc();
  document.addEventListener('ln:ix-gated', () => setTimeout(toc, 0));   /* before mounting (a gated module can collapse within a microtask); deferred because cost.js fires the event just before it removes the block */
  if ($('[data-ix]', body)) {
    try { const ix = await import('ix/_ix.js'); await ix.autoMount(body); } catch (e) { console.error('article: ix mount failed', e); }
    toc();
  }
  whenFonts(() => { paintPrices(); sizeTable(); });
  readingTime();
  document.documentElement.dataset.ready = 'article';
})();

/* reading time from the article's own words (embeds excluded) — §4.11 AT */
function readingTime() {
  const clone = $('.ar-body').cloneNode(true);
  $$('.ar-ix, [data-ix], [data-backing-demo], .ar-table, table, figure', clone).forEach(n => n.remove());
  const words = (clone.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  const n = Math.max(1, Math.round(words / WPM));
  const el = $('[data-qa="article.minutes"]'); el.textContent = t('guides.article.minutes', { n }, `${n} min read`); el.dataset.words = String(words); el.dataset.minutes = String(n);
  return n;
}
function updatedDate() {
  const el = $('[data-qa="article.updated"]'); const iso = el.getAttribute('datetime');
  if (iso) el.textContent = t('guides.article.updated', { date: fmtDate(new Date(iso + 'T12:00')) });
}

/* neon tiles: the renderer's DOM neon (no plate, no canvas) in the guide's lettering and colour */
function tiles(guide) {
  const tileOf = slug => { const v = copyGet(`guides.tiles.${slug}`); return v && typeof v === 'object' ? v : { text: 'Lit', font: 'shoreditch', colour: 'warm' }; };
  neonTile($('[data-tile]'), tileOf(SLUG), { fitW: .8, fitH: .42, lit: false, strike: true, rendered: true });
  neonTile($('[data-cta-tile]'), tileOf(SLUG), { fitW: .8, fitH: .45, rendered: true });
  $$('[data-card-tile]').forEach(el => neonTile(el, tileOf(el.dataset.cardTile), { rendered: true }));
  R.initStrikes && R.initStrikes();
}
function copyGet(path) { const v = copy.get(path); return v === undefined ? null : v; }

/* size table: every size's letter height and how wide one phrase measures, from the renderer (never typed) */
function sizeTable() {
  const box = $('[data-size-table]'); if (!box) return;
  const words = box.dataset.words || 'After dark'; const font = box.dataset.font || 'shoreditch';
  const rows = R.OPTIONS.sizes.map(s => {
    const res = R.resolve(R.normalise({ ...R.DEFAULT_DESIGN, text: words, font, size: s.id }));
    const W = res.dims ? Math.round(res.dims.W) : null; const H = res.dims ? Math.round(res.dims.H) : null;
    return `<tr data-size="${s.id}"><th scope="row">${esc(s.name)}</th><td>${s.letterCm} cm</td><td>${W ? `${W} × ${H} cm` : '…'}</td></tr>`;
  }).join('');
  box.innerHTML = `<table class="ar-sizes" data-qa="article.sizes"><caption>“${esc(words)}” in ${esc(R.fontOf(font).name)}, measured at each size</caption><thead><tr><th scope="col">Size</th><th scope="col">Letter height</th><th scope="col">“${esc(words)}” measures</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* backing demo: a live stage + backing and finish controls + the price difference at Medium (pricing.deltas) */
function backingDemo() {
  const host = $('[data-backing-demo]'); if (!host) return;
  const tile = copyGet('guides.tiles.backing-types') || { text: 'Cut to shape', font: 'shoreditch', colour: 'cool' };
  const rec = router.design.get();
  const base = R.normalise({ ...R.DEFAULT_DESIGN, ...(rec ? rec.state : {}), size: 'm', use: 'in' });
  if (!rec || !rec.state.text) { base.text = tile.text; base.font = tile.font; base.colour = tile.colour; }
  let st = { ...base, backing: 'cut', board: 'clear' };
  host.innerHTML = `<div class="ar-bk__stage" data-qa="article.backing.stage"></div>
    <div class="ar-bk__ui">
      <div class="ar-bk__group"><p class="ar-bk__label" id="bk-l1">${esc(t('guides.backing.label'))}</p><div class="c-chips" role="group" aria-labelledby="bk-l1">${R.OPTIONS.backings.map(b => `<button type="button" class="c-chip" aria-pressed="${b.id === st.backing}" data-backing="${b.id}" data-qa="article.backing.option" data-id="${b.id}">${icon(b.id === 'stand' ? 'stand' : b.id === 'rect' ? 'grid' : 'drawing')}<span>${esc(b.name)}</span></button>`).join('')}</div></div>
      <div class="ar-bk__group"><p class="ar-bk__label" id="bk-l2">${esc(t('guides.backing.finish'))}</p><div class="c-chips" role="group" aria-labelledby="bk-l2">${R.OPTIONS.finishes.map(f => `<button type="button" class="c-chip ar-bk__fin" aria-pressed="${f.id === st.board}" data-board="${f.id}" data-qa="article.backing.finish" data-id="${f.id}"><span class="ar-bk__sw" data-sw="${f.id}" aria-hidden="true"></span><span>${esc(f.name)}</span></button>`).join('')}</div></div>
      <div class="ar-bk__read" aria-live="polite"><p class="ar-bk__name" data-qa="article.backing.name"></p><p class="ar-bk__sub"></p><p class="ar-bk__price" data-qa="article.backing.price"></p></div>
      <a class="c-btn c-btn--primary" href="/lit-neon-preview/create.html" data-qa="article.backing.open">${esc(t('guides.backing.open'))}${icon('arrow-right')}</a>
    </div>`;
  /* finish swatches are product data (renderer OPTIONS), painted inline like the builder's */
  $$('[data-sw]', host).forEach(el => { const f = R.finishOf(el.dataset.sw); el.style.background = f.swatch; });
  let api = null;
  try { api = stage.mount($('.ar-bk__stage', host), { frame: 'room', scene: 's01-living', design: st, view: { night: true, on: true, rulers: 'cm' }, interactive: false, pill: true, qa: 'article.backing.stage' }); } catch (e) { console.error(e); }
  const paint = () => {
    $$('[data-backing]', host).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.backing === st.backing)));
    $$('[data-board]', host).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.board === st.board)));
    const b = R.backingOf(st.backing), f = R.finishOf(st.board);
    $('.ar-bk__name', host).textContent = `${b.name} · ${f.name}`;
    $('.ar-bk__sub', host).textContent = b.sub;
    const ref = pricing.everyday({ ...st, backing: 'cut', board: 'clear' }); const now = pricing.everyday(st);
    const priceEl = $('.ar-bk__price', host);
    if (ref == null || now == null) priceEl.textContent = '';
    else { const d = now - ref; priceEl.textContent = d > 0 ? t('guides.backing.delta', { delta: `+${gbp(d)}` }) : t('guides.backing.included'); }
    $('[data-qa="article.backing.open"]', host).href = router.builderLink(st, { step: 'backing' });
    if (api) api.setDesign({ backing: st.backing, board: st.board });
  };
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-backing]'); if (b) { st = { ...st, backing: b.dataset.backing }; paint(); }
    const f = e.target.closest('[data-board]'); if (f) { st = { ...st, board: f.dataset.board }; paint(); }
  });
  paint(); R.onFonts(paint);
}

/* troubleshooting: one check at a time, "That fixed it" ends happily, the last "still dark" routes to us */
function checklist() {
  const root = $('[data-checklist]'); if (!root) return;
  const steps = $$('[data-step]', root); const uiBox = $('.ar-check__ui', root); let i = 0; let done = null;
  root.classList.add('is-live');
  const render = () => {
    steps.forEach((s, k) => { s.hidden = done !== null ? true : k !== i; s.classList.toggle('is-past', k < i); });
    if (done === 'fixed') { uiBox.innerHTML = `<div class="ar-check__end ar-check__end--ok" data-qa="article.checklist.fixed">${icon('check')}<div><p class="ar-check__t">${esc(t('guides.checklist.fixed'))}</p><p>${esc(t('guides.checklist.fixedBody'))}</p><button type="button" class="c-btn c-btn--ghost" data-act="restart" data-qa="article.checklist.restart">${esc(t('guides.checklist.restart'))}</button></div></div>`; return; }
    if (done === 'still') { uiBox.innerHTML = `<div class="ar-check__end ar-check__end--amber" data-qa="article.checklist.still">${icon('warning')}<div><p class="ar-check__t">${esc(t('guides.checklist.still'))}</p><p>${esc(t('guides.checklist.stillBody'))}</p><div class="ar-check__btns"><a class="c-btn c-btn--primary" href="${esc(askHref(t('guides.checklist.askText')))}" data-qa="article.checklist.ask">${esc(t('common.form'))}${icon('arrow-right')}</a><button type="button" class="c-btn c-btn--ghost" data-act="restart" data-qa="article.checklist.restart">${esc(t('guides.checklist.restart'))}</button></div></div></div>`; return; }
    uiBox.innerHTML = `<div class="ar-check__bar"><span class="ar-check__count" data-qa="article.checklist.count">${esc(t('guides.checklist.progress', { n: i + 1, total: steps.length }))}</span><span class="ar-check__meter" aria-hidden="true"><span style="width:${((i + 1) / steps.length) * 100}%"></span></span></div>
      <div class="ar-check__btns"><button type="button" class="c-btn c-btn--primary" data-act="fixed" data-qa="article.checklist.fixedbtn">${icon('check')}${esc(t('guides.checklist.no'))}</button><button type="button" class="c-btn c-btn--ghost" data-act="next" data-qa="article.checklist.next">${esc(t('guides.checklist.yes'))}${icon('arrow-right')}</button>${i > 0 ? `<button type="button" class="c-btn c-btn--text" data-act="back" data-qa="article.checklist.back">${icon('arrow-left')}<span class="label">${esc(t('guides.checklist.back'))}</span></button>` : ''}</div>`;
  };
  uiBox.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'fixed') done = 'fixed';
    else if (act === 'next') { if (i < steps.length - 1) i++; else done = 'still'; }
    else if (act === 'back') i = Math.max(0, i - 1);
    else if (act === 'restart') { i = 0; done = null; }
    render();
    const focusTarget = done ? $('.ar-check__end', uiBox) : steps[i].querySelector('h3');
    if (focusTarget) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
  });
  render();
}

/* end CTA: builder prefilled for the guide's context (+ the visitor's words when they have some) */
function cta(guide) {
  $$('[data-qa="article.cta"]').forEach(a => {
    let ctx = {}; try { ctx = JSON.parse(a.dataset.ctx || '{}'); } catch {}
    const rec = router.design.get(); const st = { ...(rec ? rec.state : {}) };
    ['font', 'colour', 'size', 'scene'].forEach(k => { if (ctx[k] && !(rec && rec.state && rec.state[k] && k !== 'scene')) st[k] = ctx[k]; });
    if (ctx.scene) st.scene = ctx.scene;
    if (!st.text) { const tile = copyGet(`guides.tiles.${guide.slug || SLUG}`); if (tile) { st.text = tile.text; st.font = st.font || tile.font; st.colour = st.colour || tile.colour; } }
    a.href = router.builderLink(R.normalise(st));
  });
}

/* related cards: hide any whose target is this page (data guard) */
function related() { $$('[data-qa="article.related.card"]').forEach(a => { if (a.dataset.slug === SLUG) a.remove(); }); }

/* reading progress (decorative; aria-hidden) */
function progress() {
  const bar = $('.ar-progress span'); const body = $('.ar-body'); if (!bar || !body) return;
  let tick = false;
  const upd = () => { tick = false; const r = body.getBoundingClientRect(); const total = r.height - innerHeight * .6; const p = Math.min(1, Math.max(0, (-r.top + innerHeight * .2) / (total || 1))); bar.style.transform = `scaleX(${p})`; };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true }); upd();
}
