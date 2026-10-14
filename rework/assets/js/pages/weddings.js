/* Lit Neon v2 — weddings & events (brief §4.8, owner P5).
   Hero: copy + the surname builder (input → "The Smiths" · "Mr & Mrs Smith" · "Smith est. {year}", couple toggle
   Mr & Mrs / Mr & Mr / Mrs & Mrs; each chip a prefilled builder link that previews on the hero stage on hover/focus)
   and a live stage showing the first chip's words (the example surname until one is typed). Then: three backdrop sizes drawn to scale on paper (widths and
   prices from pricing.js for the current words) · the order-by timeline with the standalone "Need it by?" check
   (pricing.needBy with a week spare; rush route via WhatsApp → email → contact form) · after the day (ix/daynight with
   home scenes and the couple's words) · the wedding collection grid (shop kit) · venues → bulk quote · five FAQs.
   Dates: clock.now() and the rules only. data-qa="weddings.*". */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import router from 'core/router.js';
import * as copy from 'core/copy.js';
import * as clock from 'core/clock.js';
import { gbp, fmtDims, fmtDay, fmtRange, esc } from 'core/money.js';
import { createBrowse, refreshSigns } from 'pages/shop.js';
import { $, $$, t, icon, bootHub, sceneOr, cleanText, stripGlyphs, contactRoute, renderFaq, trustHtml, reduced } from 'pages/business.js';
import { mount as mountDaynight } from 'ix/daynight.js';

const FONT = 'notting', COLOUR = 'warm';
const PAIRS = ['mrmrs', 'mrmr', 'mrsmrs'];
const MAX = R.OPTIONS && R.OPTIONS.limits ? R.OPTIONS.limits.maxChars : 24;
const TARGETS = [70, 110, 175];   /* cm: inside the table / top-table / backdrop ranges */

/** surname → plural for "The …s": Patel → Patels, Jones → Joneses, Fox → Foxes, Marsh → Marshes, Kennedy → Kennedys */
export function pluralSurname(n) { const s = String(n || '').trim(); if (!s) return s; return /(s|x|z|ch|sh)$/i.test(s) ? s + 'es' : s + 's'; }
/** keep a phrase inside 24 characters a line: break before the surname, else at the last space that fits */
function fitLines(text) {
  if (text.length <= MAX) return text;
  const words = text.split(' '); const lines = []; let cur = '';
  words.forEach(w => { if (!cur) cur = w; else if ((cur + ' ' + w).length <= MAX) cur += ' ' + w; else { lines.push(cur); cur = w; } });
  if (cur) lines.push(cur);
  return lines.slice(0, 3).join('\n');
}

(async function init() {
  if (document.body.dataset.page !== 'weddings') return;
  const D = await bootHub('weddings', ['shop', 'ix']);
  copy.merge({ ix: { daynight: { tabs: { living: t('weddings.after.scenes.living'), bedroom: t('weddings.after.scenes.bedroom') } } } });
  $('#wd-trust').innerHTML = trustHtml(copy.get('weddings.hero.trust') || [], 'weddings.hero.trust');

  /* ---------- state: surname, couple pair, previewed phrase ---------- */
  let surname = '', pair = 'mrmrs', preview = null, eventDate = null;
  const nameOrExample = () => surname || t('weddings.phrases.placeholder', {}, 'Smith');
  const year = () => { const base = eventDate || clock.addDays(clock.now(), 270); return base.getFullYear(); };
  function phrases() {
    const n = nameOrExample();
    return [
      fitLines(t('weddings.phrases.chipThe', { plural: pluralSurname(n) })),
      fitLines(t('weddings.phrases.chipPair', { pair: t('weddings.phrases.pairs.' + pair), name: n })),
      fitLines(t('weddings.phrases.chipEst', { name: n, year: year() }))
    ];
  }
  /* every hand-off (chips, Design yours, size cards, the store) carries the wedding scene, so the designer opens on the
     same barn wall the hero shows instead of dropping back to the living room */
  const heroScene = sceneOr('s06-wedding', ['s02-bedroom']);
  const stateFor = (text, extra = {}) => R.normalise({ text, font: FONT, colour: COLOUR, size: 'm', backing: 'cut', board: 'clear', scene: heroScene, ...extra });
  /* the words the page is about: the first phrase chip (the example surname until one is typed), so the hero preview
     and the chips under it always say the same thing */
  const pageWords = () => phrases()[0];

  /* ---------- hero stage ---------- */
  const dayHero = /studio-light/.test(heroScene);
  const heroStage = stage.mount($('#wd-stage'), { frame: 'room', scene: heroScene, design: stateFor(pageWords()), interactive: false, qa: 'weddings.hero.stage', priority: 'high', view: { night: !dayHero, on: true, rulers: 'off' }, rulers: false });
  const showOnStage = text => heroStage.setDesign(stateFor(text, { scene: heroScene }));

  /* ---------- surname builder ---------- */
  const input = $('#wd-surname'), note = $('#wd-names-note'), chips = $('#wd-chips'), priceEl = $('#wd-price'), designCta = $('#wd-design');
  input.placeholder = t('weddings.phrases.placeholder', {}, 'Smith');
  $('#wd-pair').innerHTML = PAIRS.map(p => `<button type="button" aria-pressed="${p === pair}" data-qa="weddings.phrases.pair" data-id="${p}">${esc(t('weddings.phrases.pairs.' + p))}</button>`).join('');
  function paintChips() {
    const list = phrases();
    chips.innerHTML = list.map((ph, i) => `<a class="c-chip wd-chip${surname ? '' : ' is-example'}" href="${esc(router.builderLink({ ...stateFor(ph), view: 'room' }))}" data-qa="weddings.phrases.chip" data-i="${i}" data-text="${esc(ph)}"><span class="wd-chip__txt" style="font-family:'${esc(R.fontOf(FONT).family)}',cursive">${esc(ph.replace(/\n/g, ' '))}</span>${icon('arrow-right', 'ic--sm')}</a>`).join('');
    paintPrice(preview || list[0]);
  }
  function paintPrice(text) {
    const st = stateFor(text); const p = pricing.price(st);
    priceEl.textContent = p.kind === 'price' ? t('weddings.phrases.price', { price: gbp(p.payable), dims: fmtDims(p.res.dims.W, p.res.dims.H) }) : p.kind === 'quote' ? t('weddings.phrases.priceQuote') : '';
    designCta.href = router.builderLink({ ...st, view: 'room' });
  }
  function onSurname() {
    const raw = input.value; const c = cleanText(raw, FONT);
    surname = raw.trim() ? c.text.replace(/\n/g, ' ').trim() : '';
    note.hidden = !c.bad.length;
    if (c.bad.length) { note.innerHTML = `${icon('warning', 'ic--sm')}<span>${esc(t('weddings.phrases.bad', { glyphs: c.bad.join(' ') }))}</span>`; surname = stripGlyphs(surname, c.bad); }
    paintChips();
    const words = pageWords(); showOnStage(words); heroStage.strike?.();
    if (surname) router.design.setDebounced(stateFor(words), 'collection', 300);
    paintSizes(); dn?.setState({ text: words });
    dnState.text = words;
  }
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(onSurname, 80); });
  input.addEventListener('blur', () => { const v = input.value.replace(/\s+$/g, ''); if (v !== input.value) { input.value = v; onSurname(); } });
  $('#wd-names').addEventListener('submit', e => { e.preventDefault(); input.blur(); });
  $('#wd-pair').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pair = b.dataset.id; $$('#wd-pair button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paintChips(); if (preview) { preview = null; showOnStage(pageWords()); } });
  /* preview on the stage while a chip is hovered or focused; the chip itself opens the designer */
  chips.addEventListener('pointerover', e => { const a = e.target.closest('.wd-chip'); if (!a || a.dataset.text === preview) return; preview = a.dataset.text; showOnStage(preview); paintPrice(preview); });
  chips.addEventListener('focusin', e => { const a = e.target.closest('.wd-chip'); if (!a) return; preview = a.dataset.text; showOnStage(preview); paintPrice(preview); });
  const unpreview = () => { preview = null; showOnStage(pageWords()); paintPrice(phrases()[0]); };
  chips.addEventListener('pointerleave', unpreview);
  chips.addEventListener('focusout', e => { if (!chips.contains(e.relatedTarget)) unpreview(); });
  chips.addEventListener('click', e => { const a = e.target.closest('.wd-chip'); if (!a) return; router.design.flush(); router.design.set(stateFor(a.dataset.text), 'collection'); });
  designCta.addEventListener('click', () => { router.design.flush(); router.design.set(stateFor(preview || pageWords()), 'collection'); });

  /* ---------- sizes drawn to scale ---------- */
  const sizeCards = copy.get('weddings.sizes.cards') || [];
  function paintSizes() {
    const words = pageWords();
    $('#wd-sizes-lede').textContent = t('weddings.sizes.lede', { words: words.replace(/\n/g, ' ') });
    const base = stateFor(words);
    $('#wd-scards').innerHTML = sizeCards.map((c, i) => {
      const letterCm = pricing.letterCmForWidth(base, TARGETS[i]);
      const st = letterCm ? R.normalise({ ...base, size: 'custom', custom: { letterCm } }) : base;
      const res = R.resolve(st); const p = pricing.price(st); const d = res.dims;
      const priceTxt = p.kind === 'price' ? t('weddings.sizes.price', { price: gbp(p.payable) }) : t('weddings.sizes.quote');
      return `<article class="wd-scard" data-qa="weddings.sizes.card" data-i="${i}" data-width="${d ? d.W : ''}">
        <figure class="wd-scard__fig">${scaleSvg(i, res)}<figcaption class="wd-scard__cap">${esc(t('weddings.sizes.drawnTo'))}</figcaption></figure>
        <div class="wd-scard__body">
          <p class="wd-scard__range">${esc(c.range)}</p>
          <h3 class="wd-scard__title">${esc(c.title)}</h3>
          <p class="wd-scard__where">${esc(c.where)}</p>
          <dl class="wd-scard__spec"><div><dt class="sr-only">Size</dt><dd data-qa="weddings.sizes.card.dims" data-i="${i}">${d ? esc(t('weddings.sizes.card', { w: Math.round(d.W), h: Math.round(d.H) })) : ''}</dd></div><div><dt class="sr-only">Price</dt><dd class="wd-scard__price" data-qa="weddings.sizes.card.price" data-i="${i}">${esc(priceTxt)}</dd></div></dl>
          <a class="c-btn c-btn--ghost" href="${esc(router.builderLink({ ...st, view: 'room' }))}" data-qa="weddings.sizes.card.open" data-i="${i}">${esc(t('weddings.sizes.open'))}${icon('arrow-right')}</a>
        </div></article>`;
    }).join('');
  }

  /* ---------- timeline + need it by ---------- */
  const steps = copy.get('weddings.timeline.steps') || [];
  function paintTrack(dates = {}) {
    $('#wd-track').innerHTML = steps.map((s, i) => `<li class="wd-step${dates.ok ? ' has-date' : ''}" data-qa="weddings.timeline.step" data-i="${i}"><span class="wd-step__dot" aria-hidden="true">${i + 1}</span><div class="wd-step__txt"><b>${esc(s.t)}</b>${s.d ? `<span>${esc(s.d)}</span>` : ''}${dates[i] ? `<em class="wd-step__date">${esc(dates[i])}</em>` : ''}</div></li>`).join('');
  }
  paintTrack();
  const dateInput = $('#wd-date'), answer = $('#wd-answer');
  const today = clock.now(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  dateInput.min = iso(clock.addDays(today, 1));
  function check() {
    const v = dateInput.value; answer.hidden = false; answer.className = 'wd-needby__answer';
    if (!v) { answer.innerHTML = `<p>${esc(t('weddings.timeline.invalid'))}</p>`; answer.classList.add('is-bad'); dateInput.setAttribute('aria-invalid', 'true'); paintTrack(); return; }
    const [y, m, dd] = v.split('-').map(Number); const day = new Date(y, m - 1, dd);
    if (isNaN(day) || day <= new Date(today.getFullYear(), today.getMonth(), today.getDate())) { answer.innerHTML = `<p>${esc(t(isNaN(day) ? 'weddings.timeline.invalid' : 'weddings.timeline.past'))}</p>`; answer.classList.add('is-bad'); dateInput.setAttribute('aria-invalid', 'true'); paintTrack(); return; }
    dateInput.removeAttribute('aria-invalid'); eventDate = day;
    const spare = pricing.needBy(clock.addDays(day, -7));
    const plain = pricing.needBy(day);
    let kind, by = null;
    if (spare.kind === 'yes' || spare.kind === 'tight') { kind = 'yes'; by = spare.approveBy; }
    else if (plain.kind === 'yes' || plain.kind === 'tight') { kind = 'tight'; by = plain.approveBy; }
    else kind = 'rush';
    answer.dataset.kind = kind;
    if (kind === 'rush') {
      const link = router.shareLink ? router.shareLink(stateFor(pageWords())) : location.origin + router.builderLink(stateFor(pageWords()));
      const route = contactRoute(t('weddings.timeline.rushMessage', { date: fmtDay(day), link }), 'design');
      answer.classList.add('is-rush');
      answer.innerHTML = `<p>${icon('clock')}<span>${esc(t('weddings.timeline.answerRush'))}</span></p><a class="c-btn c-btn--primary" href="${esc(route.href)}"${route.external ? ' target="_blank" rel="noopener"' : ''} data-qa="weddings.needby.rush" data-kind="${route.kind}">${icon(route.kind === 'whatsapp' ? 'whatsapp' : route.kind === 'email' ? 'mail' : 'chat')}<span>${esc(t('weddings.timeline.rushCta'))}</span></a>`;
      paintTrack({ 4: fmtDay(day) });
    } else {
      const w = pricing.windowFrom(new Date(by.getFullYear(), by.getMonth(), by.getDate(), 9));
      answer.classList.add(kind === 'yes' ? 'is-ok' : 'is-tight');
      answer.innerHTML = `<p>${icon(kind === 'yes' ? 'check' : 'warning')}<span>${esc(t(kind === 'yes' ? 'weddings.timeline.answerYes' : 'weddings.timeline.answerTight', { date: fmtDay(by), day: fmtDay(day) }))}</span></p>`;
      paintTrack({ ok: true, 0: t('weddings.timeline.approveBy', { date: fmtDay(by) }), 2: t('weddings.timeline.arrivesBy', { range: fmtRange(w.from, w.to) }), 3: kind === 'yes' ? t('weddings.timeline.spare') : '', 4: fmtDay(day) });
    }
    paintChips();
  }
  $('#wd-needby').addEventListener('submit', e => { e.preventDefault(); check(); });
  dateInput.addEventListener('change', check);

  /* ---------- after the day: ix/daynight on home scenes with the couple's words ---------- */
  const dnState = { text: pageWords(), font: FONT, colour: COLOUR, size: 'm' };
  let dn = null;
  try { dn = mountDaynight($('#wd-daynight'), { state: dnState, scenes: [{ id: 'living', scene: 's01-living' }, { id: 'bedroom', scene: 's02-bedroom' }] }); } catch (e) { $('#wd-daynight').closest('section')?.remove(); }

  /* ---------- the wedding collection (shop kit: cards, facets, quick view) ---------- */
  const designs = D.designs.filter(d => (d.collections || []).includes('wedding'));
  const browse = createBrowse($('#wd-browse'), { designs, groups: ['style', 'room'], qa: 'weddings', layout: 'compact' });

  /* ---------- FAQ ---------- */
  renderFaq($('#wd-faq'), 'weddings', 'weddings.faq');

  paintChips(); paintSizes();
  const refresh = () => { paintChips(); paintSizes(); browse.refresh(); refreshSigns(); showOnStage(preview || pageWords()); };
  R.ensureFonts().then(refresh); R.onFonts(refresh);
  $('[data-qa="weddings.hero.date"]').addEventListener('click', e => { e.preventDefault(); $('#timeline').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); setTimeout(() => dateInput.focus({ preventScroll: true }), reduced() ? 0 : 500); });
  document.documentElement.dataset.ready = 'weddings';
  window.__weddings = { phrases, pluralSurname, stage: heroStage, browse, check };
})();

/* ---------- drafting illustration, in centimetres: a table, a top table or an 8 ft backdrop, a 170 cm figure and
   the sign at its true width (acrylic outline + lettering drawn as tube outlines). viewBox units are cm. ---------- */
function scaleSvg(kind, res) {
  const VW = 300, VH = 270, FLOOR = 258;
  const d = res.dims; if (!d) return '';
  const W = d.W, H = d.H; const cx = 150;
  let cy, furniture = '', hang = '';
  const person = x => `<g class="fig"><circle cx="${x}" cy="${FLOOR - 160}" r="10"/><path d="M${x} ${FLOOR - 150}v58M${x - 18} ${FLOOR - 128}l18-14 18 14M${x} ${FLOOR - 92}l-14 92M${x} ${FLOOR - 92}l14 92"/></g>`;
  if (kind === 0) {           /* cake/gift table 180 cm, sign on a stand */
    furniture = `<path class="furn" d="M60 ${FLOOR - 75}h180M66 ${FLOOR - 75}v75M234 ${FLOOR - 75}v75"/><path class="furn thin" d="M${cx - 16} ${FLOOR - 75}l6-8h20l6 8"/>` + person(26);
    cy = FLOOR - 75 - 8 - H / 2;
  } else if (kind === 1) {    /* top table 240 cm, sign on chains from a beam */
    furniture = `<path class="furn" d="M30 ${FLOOR - 75}h240M36 ${FLOOR - 75}v75M264 ${FLOOR - 75}v75"/><path class="furn thin" d="M70 ${FLOOR - 75}v-30h22v30M208 ${FLOOR - 75}v-30h22v30M0 10h300"/>`;
    cy = FLOOR - 190;
    hang = `<path class="chain" d="M${cx - W * .35} 10V${cy - H / 2}M${cx + W * .35} 10V${cy - H / 2}"/>`;
  } else {                    /* 8 ft (244 cm) backdrop frame with flowers */
    furniture = `<path class="furn" d="M28 ${FLOOR}V${FLOOR - 244}h244V${FLOOR}"/>` + [[38, FLOOR - 236], [56, FLOOR - 226], [262, FLOOR - 236], [246, FLOOR - 224], [40, FLOOR - 10], [258, FLOOR - 12]].map(([x, y]) => `<circle class="furn thin" cx="${x}" cy="${y}" r="9"/>`).join('') + person(-6);
    cy = FLOOR - 150;
  }
  cy = Math.max(H / 2 + 14, cy);
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const em = d.emCm || (H * .6); const lines = res.drawLines && res.drawLines.length ? res.drawLines : [res.clean ? res.clean.text : ''];
  const lh = 1.15 * em; const top = cy - (lines.length * lh) / 2 + em * .82;
  const fam = esc(res.font.family);
  const text = lines.map((ln, i) => `<text x="${cx}" y="${(top + i * lh).toFixed(1)}" font-size="${em.toFixed(2)}" style="font-family:'${fam}',cursive">${esc(typeof ln === 'string' ? ln : (ln.text || ''))}</text>`).join('');
  const dimY = Math.min(VH - 4, y0 + H + 10);
  return `<svg class="wd-scale" viewBox="${kind === 2 ? '-30' : '0'} 0 ${kind === 2 ? VW + 30 : VW} ${VH}" role="img" aria-label="${esc(`${Math.round(W)} by ${Math.round(H)} centimetres, drawn to scale`)}">
    <path class="floor" d="M-40 ${FLOOR}H${VW + 10}"/>${furniture}${hang}
    <rect class="acrylic" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" rx="${Math.min(6, H / 4).toFixed(1)}"/>
    <g class="tube">${text}</g>
    <path class="dim" d="M${x0.toFixed(1)} ${dimY.toFixed(1)}H${(x0 + W).toFixed(1)}M${x0.toFixed(1)} ${(dimY - 3).toFixed(1)}v6M${(x0 + W).toFixed(1)} ${(dimY - 3).toFixed(1)}v6"/>
    <text class="dimtxt" x="${cx}" y="${(dimY + 9).toFixed(1)}">${Math.round(W)} cm</text>
  </svg>`;
}
