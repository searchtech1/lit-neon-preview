/* Lit Neon v2 — ix/anatomy.js (brief §5.2): what's in the box. A drafting-style flat-lay illustration (IMG's
   img/anatomy/flatlay.svg, inlined with unique ids) with numbered hotspot buttons; hover/focus/tap a hotspot highlights
   its row and opens a popover (name, one-line spec from facts, a close-up crop of the drawing); hovering a row pulses its
   hotspot; on phones a row opens the popover as a bottom sheet. A "How it connects" strip (plug → supply → dimmer →
   sign) draws the cable ruler only when cableLengthM is confirmed. Only confirmed contents appear in customer mode;
   unconfirmed parts are hidden in the drawing too (review mode shows them with a chip). When facts.photos.flatlay
   lands, the photo replaces the drawing with the same hotspot coordinates. mount(el) → { destroy, setState }. */
import { boot, t, esc, icon, facts, ui, inlineSvg, uid, h, $, $$, reviewMode } from './_ix.js';

const SVG = '/lit-neon-preview/assets/img/anatomy/flatlay.svg';
/* fallback hotspot geometry (fractions of the drawing, from IMG's data-hx/hy/crop) if the SVG attributes are missing */
const GEO = { sign: { hx: .275, hy: .3125, crop: '140 70 380 380' }, cable: { hx: .275, hy: .66, crop: '230 400 260 200' }, dimmer: { hx: .51, hy: .6725, crop: '460 480 260 280' }, psu: { hx: .67, hy: .674, crop: '700 470 440 230' }, fixings: { hx: .64, hy: .28, crop: '630 100 290 250' }, card: { hx: .86, hy: .29, crop: '930 110 220 240' } };
const PARTS = [
  { id: 'sign', gate: null, spec: () => facts.has('acrylicThicknessMm') ? t('anatomy.parts.sign.specAcrylic', { thickness: `${facts.value('acrylicThicknessMm')} mm` }) : t('anatomy.parts.sign.spec') },
  { id: 'cable', gate: null, spec: () => facts.has('cableLengthM') ? t('anatomy.parts.cable.specLength', { length: `${facts.value('cableLengthM')} m` }) : t('anatomy.parts.cable.spec') },
  { id: 'dimmer', gate: 'dimmerRemoteIncluded', spec: () => t('anatomy.parts.dimmer.spec') },
  { id: 'psu', gate: 'ukPlug', spec: () => facts.has('psuVoltage') && facts.has('psuMarking') ? t('anatomy.parts.psu.specMarked', { voltage: `${facts.value('psuVoltage')} V`, marking: facts.value('psuMarking') }) : t('anatomy.parts.psu.spec') },
  { id: 'fixings', gate: 'kitContents.screws', spec: () => t('anatomy.parts.fixings.spec', { kit: facts.has('kitContents.screws') ? facts.get('kitContents.screws') : '' }) },
  { id: 'card', gate: 'instructionCard', spec: () => t('anatomy.parts.card.spec') }
];

export function mount(el, opts = {}) {
  el.classList.add('ix', 'ix-anatomy'); el.dataset.qa = 'ix.anatomy';
  const id = uid('an'); let killed = false, open = null, sheet = null, offEsc = null, offDoc = null;
  const api = { destroy, setState: () => paint() };
  const review = () => reviewMode();
  const shown = () => PARTS.filter(p => !p.gate || facts.has(p.gate) || review());
  const mobile = () => matchMedia('(max-width: 767px)').matches;

  el.innerHTML = `
    <div class="ix-anatomy__grid">
      <figure class="ix-anatomy__fig">
        <div class="ix-anatomy__art" data-qa="ix.anatomy.art"><span class="c-pill c-pill--illustration ix__pill">${esc(t('common.illustration'))}</span></div>
        <div class="ix-anatomy__pop" role="dialog" aria-modal="false" hidden data-qa="ix.anatomy.pop"></div>
      </figure>
      <ol class="ix-anatomy__list" aria-label="${esc(t('anatomy.title'))}"></ol>
    </div>
    <div class="ix-anatomy__connect">
      <p class="ix__label">${esc(t('anatomy.connects'))}</p>
      <ol class="ix-anatomy__chain">
        <li>${icon('plug-uk')}<span>${esc(t('anatomy.chain.plug'))}</span></li><li class="arrow" aria-hidden="true">${icon('arrow-right')}</li>
        <li>${icon('power')}<span>${esc(t('anatomy.chain.psu'))}</span></li><li class="arrow" aria-hidden="true">${icon('arrow-right')}</li>
        <li>${icon('dimmer')}<span>${esc(t('anatomy.chain.dimmer'))}</span></li><li class="arrow" aria-hidden="true">${icon('arrow-right')}</li>
        <li>${icon('drawing')}<span>${esc(t('anatomy.chain.sign'))}</span></li>
      </ol>
      <div class="ix-anatomy__ruler" hidden><span class="line"></span><span class="val"></span></div>
    </div>`;
  const art = $(el, '.ix-anatomy__art'), list = $(el, '.ix-anatomy__list'), pop = $(el, '.ix-anatomy__pop');

  function geo(part) {
    const g = art.querySelector(`#${id}-part-${part}`); if (!g) return GEO[part];
    const hx = +g.dataset.hx, hy = +g.dataset.hy, crop = g.dataset.crop; return { hx: Number.isFinite(hx) ? hx : GEO[part].hx, hy: Number.isFinite(hy) ? hy : GEO[part].hy, crop: crop || GEO[part].crop };
  }
  function paint() {
    const parts = shown();
    /* the drawing: hide parts that are not listed (never draw a claim) */
    PARTS.forEach(p => { const g = art.querySelector(`#${id}-part-${p.id}`); if (g) g.style.display = parts.includes(p) ? '' : 'none'; });
    const desc = art.querySelector(`#${id}-d`); if (desc) desc.textContent = t('anatomy.svgDesc', { parts: parts.map(p => t(`anatomy.parts.${p.id}.name`).toLowerCase()).join(', ') });
    /* hotspots */
    $$(art, '.ix-anatomy__hot').forEach(x => x.remove());
    parts.forEach((p, i) => { const g = geo(p.id); art.appendChild(h(`<button type="button" class="ix-anatomy__hot" style="left:${(g.hx * 100).toFixed(2)}%;top:${(g.hy * 100).toFixed(2)}%" aria-expanded="false" aria-controls="${id}-pop" data-part="${p.id}" data-qa="ix.anatomy.hot" aria-label="${esc(t(`anatomy.parts.${p.id}.name`))}"><span>${i + 1}</span></button>`)); });
    pop.id = `${id}-pop`;
    /* list */
    list.innerHTML = parts.map((p, i) => `<li><button type="button" class="ix-anatomy__row" aria-pressed="false" data-part="${p.id}" data-qa="ix.anatomy.row"><span class="num">${i + 1}</span><span class="txt"><b>${esc(t(`anatomy.parts.${p.id}.name`))}${p.gate && !facts.has(p.gate) ? ' ' + facts.chip(p.gate) : ''}</b><span class="spec">${esc(p.spec())}</span></span>${icon('chevron-right', 'ic--sm')}</button></li>`).join('');
    /* the cable ruler */
    const ruler = $(el, '.ix-anatomy__ruler'); const hasLen = facts.has('cableLengthM');
    ruler.hidden = !hasLen && !review(); if (!ruler.hidden) { ruler.querySelector('.val').innerHTML = hasLen ? esc(t('anatomy.rulerCable', { length: `${facts.value('cableLengthM')} m` })) : facts.chip('cableLengthM'); }
    close();
  }
  function openPart(part, opener) {
    const p = PARTS.find(x => x.id === part); if (!p) return; const g = geo(part);
    const body = `<div class="ix-anatomy__crop" aria-hidden="true"><svg viewBox="${g.crop}" focusable="false"><use href="#${id}-part-${part}"/></svg></div><h4 class="ix-anatomy__popname" id="${id}-pn">${esc(t(`anatomy.parts.${part}.name`))}</h4><p class="ix-anatomy__popspec">${esc(p.spec())}</p>`;
    close(true);
    open = part;
    $$(art, '.ix-anatomy__hot').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.part === part)));
    $$(list, '.ix-anatomy__row').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.part === part)));
    if (mobile()) {
      if (!sheet) sheet = ui.sheet({ title: t('anatomy.title'), qa: 'ix.anatomy.sheet', onClose: () => { if (open) { open = null; $$(art, '.ix-anatomy__hot').forEach(b => b.setAttribute('aria-expanded', 'false')); $$(list, '.ix-anatomy__row').forEach(b => b.setAttribute('aria-pressed', 'false')); } } });
      sheet.setBody(`<div class="ix-anatomy__sheetbody">${body}</div>`); sheet.open(opener); return;
    }
    pop.innerHTML = `${body}<button type="button" class="c-btn c-btn--icon ix-anatomy__close" aria-label="${esc(t('anatomy.close'))}" data-qa="ix.anatomy.pop.close">${icon('close')}</button>`;
    pop.setAttribute('aria-labelledby', `${id}-pn`); pop.hidden = false;
    pop.classList.toggle('is-right', g.hx > .58); pop.classList.toggle('is-low', g.hy > .55);
    pop.style.setProperty('--hx', (g.hx * 100).toFixed(2) + '%'); pop.style.setProperty('--hy', (g.hy * 100).toFixed(2) + '%');
    offEsc = e => { if (e.key === 'Escape') { close(); opener && opener.focus && opener.focus(); } }; document.addEventListener('keydown', offEsc);
    offDoc = e => { if (!pop.contains(e.target) && !e.target.closest('.ix-anatomy__hot, .ix-anatomy__row')) close(); }; setTimeout(() => document.addEventListener('pointerdown', offDoc), 0);
  }
  function close(silent) {
    if (offEsc) { document.removeEventListener('keydown', offEsc); offEsc = null; } if (offDoc) { document.removeEventListener('pointerdown', offDoc); offDoc = null; }
    pop.hidden = true; pop.innerHTML = ''; open = null;
    if (!silent) { $$(art, '.ix-anatomy__hot').forEach(b => b.setAttribute('aria-expanded', 'false')); $$(list, '.ix-anatomy__row').forEach(b => b.setAttribute('aria-pressed', 'false')); }
  }
  /* events: hotspot click toggles; row click opens (scrolls the drawing into view on phones); row hover pulses */
  el.addEventListener('click', e => {
    const c = e.target.closest('[data-qa="ix.anatomy.pop.close"]'); if (c) { const part = open; close(); const b = art.querySelector(`.ix-anatomy__hot[data-part="${part}"]`); b && b.focus(); return; }
    const hot = e.target.closest('.ix-anatomy__hot'); if (hot) { if (open === hot.dataset.part) close(); else openPart(hot.dataset.part, hot); return; }
    const row = e.target.closest('.ix-anatomy__row'); if (row) { if (mobile()) art.scrollIntoView({ block: 'center', behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') }); if (open === row.dataset.part && !mobile()) close(); else openPart(row.dataset.part, row); }
  });
  list.addEventListener('pointerover', e => { const row = e.target.closest('.ix-anatomy__row'); if (!row) return; const b = art.querySelector(`.ix-anatomy__hot[data-part="${row.dataset.part}"]`); if (b) { b.classList.add('is-pulse'); setTimeout(() => b.classList.remove('is-pulse'), 1200); } });
  list.addEventListener('focusin', e => { const row = e.target.closest('.ix-anatomy__row'); if (!row) return; const b = art.querySelector(`.ix-anatomy__hot[data-part="${row.dataset.part}"]`); b && b.classList.add('is-pulse'); });
  list.addEventListener('focusout', () => $$(art, '.is-pulse').forEach(b => b.classList.remove('is-pulse')));

  function destroy() { killed = true; close(); sheet && sheet.destroy(); el.innerHTML = ''; }

  boot().then(async () => {
    if (killed) return;
    const photo = facts.has('photos.flatlay') ? facts.value('photos.flatlay') : null;
    if (photo && typeof photo === 'string') { art.insertAdjacentHTML('afterbegin', `<img class="ix-anatomy__photo" data-photo src="${esc(photo)}" alt="${esc(t('anatomy.title'))}">`); $(art, '.c-pill').remove(); }
    else { const svg = await inlineSvg(SVG, id); if (svg) { svg.classList.add('ix-anatomy__svg'); art.insertAdjacentElement('afterbegin', svg); } }
    paint();
  });
  return api;
}
export default { mount };
