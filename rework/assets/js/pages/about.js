/* Lit Neon v2 — about / our workshop (brief §4.15, owner P5). A paper page: H1 (with the town only when
   facts.workshopTown is confirmed) beside the live proof drawing of the visitor's own words ("this is what you
   approve") · the founder's note, rendered only from confirmed facts (never invented; the block is removed otherwise)
   · the §5.12 process strip in full (ix/process.js, illustrated, no AI workshop footage) · real workshop photos only
   when facts.photos.workshop is confirmed (data-photo; hidden until then) · what we make and what we don't · four
   promises from confirmed facts · the company line from facts (each part omitted when unconfirmed) and the contact
   route · a closing CTA. Customer mode renders no unconfirmed value. data-qa="about.*". */
import * as R from 'core/renderer.js';
import router from 'core/router.js';
import * as facts from 'core/facts.js';
import * as copy from 'core/copy.js';
import * as sheet from 'core/sheet.js';
import { esc } from 'core/money.js';
import { $, t, icon, bootHub, contactRoute } from 'pages/business.js';
import { mount as mountProcess } from 'ix/process.js';

(async function init() {
  if (document.body.dataset.page !== 'about') return;
  await bootHub('about', ['ix']);

  /* ---------- H1 + confirmed fact chips ---------- */
  if (facts.has('workshopTown')) $('#ab-h1').textContent = t('about.h1Town', { town: facts.value('workshopTown') });
  else if (facts.reviewMode()) $('#ab-h1').insertAdjacentHTML('afterend', facts.chip('workshopTown'));
  const lead = facts.has('leadTimeDays') ? `${facts.get('leadTimeDays')} ${facts.has('leadTimeFrom') ? facts.get('leadTimeFrom') : ''}`.trim() : '';
  const chips = [
    facts.has('warrantyYears') && { ic: 'shield', text: facts.get('warrantyYears') },
    lead && { ic: 'clock', text: lead },
    facts.has('deliveryFree') && { ic: 'truck', text: facts.get('deliveryFree') },
    facts.has('dimmerRemoteIncluded') && { ic: 'remote', text: facts.get('dimmerRemoteIncluded') },
    facts.has('ukPlug') && { ic: 'plug-uk', text: facts.get('ukPlug') }
  ].filter(Boolean);
  $('#ab-facts').innerHTML = chips.map((c, i) => `<li data-qa="about.fact" data-i="${i}">${icon(c.ic)}<span>${esc(cap(c.text))}</span></li>`).join('');

  /* ---------- live proof drawing of the visitor's words ---------- */
  const st = R.normalise({ ...(router.getDesign() || {}), ...(router.getDesign() && router.getDesign().text ? {} : { text: 'After dark', font: 'soho', colour: 'pink' }), size: (router.getDesign() || {}).size || 'm' });
  const drawSheet = () => { try { sheet.render($('#ab-sheet'), st, { lite: true }); } catch {} };
  $('#ab-sheet-cta').href = router.builderLink(st);
  $('#ab-final-design').href = router.builderLink(st);
  R.ensureFonts().then(drawSheet); R.onFonts(drawSheet); drawSheet();
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawSheet, 150); });

  /* ---------- founder's note: confirmed facts only, else the block is removed (collapsed layout, §3.9.2) ---------- */
  if (facts.has('founderNote')) {
    $('#ab-founder-note').textContent = String(facts.value('founderNote'));
    $('#ab-founder-sign').textContent = facts.has('founderName') ? t('about.founderSign', { name: facts.value('founderName') }) : '';
    $('#ab-founder').hidden = false;
  } else if (facts.reviewMode()) { $('#ab-founder-note').innerHTML = `${facts.chip('founderNote')} ${facts.chip('founderName')}`; $('#ab-founder').hidden = false; }
  else $('#ab-founder').remove();

  /* ---------- process strip (illustrated with the visitor's design) ---------- */
  try { mountProcess($('#ab-process'), { state: st }); } catch { $('#ab-process').closest('section').remove(); }

  /* ---------- real workshop photos: only when the owner has supplied them ---------- */
  const photos = facts.has('photos.workshop') ? (facts.value('photos.workshop') || []) : [];
  if (photos.length) {
    $('#ab-photos-grid').innerHTML = photos.map((p, i) => { const src = typeof p === 'string' ? p : p.src; const alt = (p && p.alt) || ''; return `<figure class="ab-photo" data-photo data-qa="about.photo" data-i="${i}"><img src="${esc(src.startsWith('/') ? src : '/lit-neon-preview/rework/assets/img/' + src)}" alt="${esc(alt)}" loading="lazy" decoding="async">${p && p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`; }).join('');
    $('#ab-photos').hidden = false;
  } else if (facts.reviewMode()) { $('#ab-photos-grid').innerHTML = facts.chip('photos.workshop'); $('#ab-photos').hidden = false; }
  else $('#ab-photos').remove();

  /* ---------- make / don't ---------- */
  $('#ab-make').innerHTML = (copy.get('about.make') || []).map(s => `<li>${icon('check')}<span>${esc(s)}</span></li>`).join('');
  $('#ab-dont').innerHTML = (copy.get('about.dont') || []).map(s => `<li>${icon('close')}<span>${esc(s)}</span></li>`).join('');

  /* ---------- promises (titles from confirmed facts) ---------- */
  const PICONS = ['drawing', 'shield', 'calendar', 'truck'];
  const titleVars = { warranty: facts.has('warrantyYears') ? cap(facts.get('warrantyYears')) : '', lead: facts.has('leadTimeDays') ? cap(facts.get('leadTimeDays')) : '' };
  $('#ab-promises').innerHTML = (copy.get('about.promises') || []).map((p, i) => ({ p, i, title: copy.fill(p.title, titleVars) })).filter(x => x.title).map(({ p, i, title }) =>
    `<article class="ab-promise" data-qa="about.promise" data-i="${i}">${icon(PICONS[i % PICONS.length], 'ic--lg')}<h3>${esc(title)}</h3><p>${esc(p.body)}</p></article>`).join('');

  /* ---------- company line: each part omitted when unconfirmed (launch-required; never a placeholder) ---------- */
  const parts = [facts.has('companyName') ? facts.value('companyName') : '', facts.has('companyNumber') ? facts.get('companyNumber') : '', facts.has('registeredAddress') ? facts.value('registeredAddress') : ''].filter(Boolean);
  if (parts.length) $('#ab-company-line').textContent = parts.join(', ');
  else if (facts.reviewMode()) $('#ab-company-line').innerHTML = ['companyName', 'companyNumber', 'registeredAddress'].map(k => facts.chip(k)).join(' ');
  else $('#ab-company-line').remove();
  const route = contactRoute('Hello Lit Neon, ', 'other');
  const contact = $('#ab-contact'); contact.href = route.href; if (route.external) { contact.target = '_blank'; contact.rel = 'noopener'; }
  contact.dataset.kind = route.kind;

  document.documentElement.dataset.ready = 'about';
  window.__about = { state: st };
})();

function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
