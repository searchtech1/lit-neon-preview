/* Built-round builder, version 2 — D2 A: the sign fills the screen, bottom tabs (Words · Style · Colour · Size · More)
   open one panel at a time with Done, price + Add to basket always visible in the bar above the tabs.
   All engine work is in builder-core.js (shared with version 1). */
import * as C from './builder-core.js';

const TITLE = { words: 'Your words', style: 'Lettering', colour: 'Colour', size: 'Size', more: 'More' };
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const visited = new Set(); let open = null;

C.S.design = C.initialDesign();
const shell = $('#shell'), wrap = $('#stagewrap'), panel = $('#tpanel');
wrap.insertAdjacentHTML('beforeend', C.stageToolsHtml());
C.mountStage(wrap); C.wireStageTools(wrap); C.wireHeader(shell); C.wireViewport(shell);

/* panes: Words is in the HTML already; the rest render now, hidden */
$('#pane-style').innerHTML = C.styleHtml(); $('#pane-colour').innerHTML = C.colourHtml(); $('#pane-size').innerHTML = C.sizeHtml({ rows: false });
$('#pane-more').innerHTML = `<span class="v-label">Finish</span>${C.optionRowsHtml()}${C.moreMenuHtml()}`;
C.wireWords($('#pane-words')); C.wireStyle($('#pane-style')); C.wireColour($('#pane-colour')); C.wireSize($('#pane-size'));
C.wireRows($('#pane-more')); /* the backing / hanging rows */
C.wireMoreMenu($('#pane-more'), { close: () => openTab(null) });

function openTab(id) {
  if (open === id) id = null;
  open = id; if (id) visited.add(id);
  panel.hidden = !id;
  $$('.v-tabs [role=tab]').forEach(b => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.classList.toggle('is-done', visited.has(b.dataset.tab)); });
  $$('.t-pane').forEach(p => { p.hidden = p.dataset.pane !== id; });
  if (id) { $('.t-panel__title').textContent = TITLE[id]; $('.t-panel__body').scrollTop = 0; if (id === 'style' && C.S.loadFaces) C.S.loadFaces(); if (id === 'more') { const m = $('#pane-more .v-menu'); if (m) m.outerHTML = C.moreMenuHtml(); } }
  if (!id && document.activeElement && document.activeElement.id === 'v-words') document.activeElement.blur();
}
$('.v-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });
$('.t-panel__done').addEventListener('click', () => openTab(null));

/* price bar */
const cta = $('[data-cta]');
function paintBar() { const p = C.paintPrice($('[data-price]')); cta.textContent = p.kind === 'quote' ? 'Request a free quote' : 'Add to basket'; cta.disabled = !(p.kind === 'price' || p.kind === 'quote'); }
cta.addEventListener('click', () => C.openConfirm(cta));
$('[data-price]').addEventListener('click', e => { if (!$('[data-price]').classList.contains('is-wait')) C.openBreakdown(e.currentTarget); });
C.onChange(paintBar); paintBar();
C.loadFacts();

/* the first job is to type: the Words panel starts open (compact), the sign still fills the rest of the screen */
openTab('words');
