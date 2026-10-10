/* Lit Neon v2 — content kit + delivery/returns pages (brief §4.10–4.14, §4.20, §4.23; owner P6).
   This module carries the helpers every P6 page shares (guides hub, articles, help, delivery, returns, legal, 404):
   one boot sequence, the CONTRACT.md §D2 token resolver (until facts.fill lands), the honest from-price, the contact
   chain card, the table of contents with scroll-spy, FAQ items, the postcode checker and JSON-LD. Its own page init
   runs only on body[data-page="delivery"|"returns"], so other P6 pages can import it without side effects.
   Every claim comes from data/facts.json, config rules or pricing.js; nothing workshop-dependent is typed here. */
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import * as ui from 'core/ui.js';
import * as R from 'core/renderer.js';
import pricing from 'core/pricing.js';
import basket from 'core/basket.js';
import router from 'core/router.js';
import clock from 'core/clock.js';
import { mount as mountChrome } from 'core/chrome.js';
import { gbp, esc, fmtDay, fmtDayYear, fmtRange, fmtHour, isoDate } from 'core/money.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const t = (k, v, f) => copy.t(k, v, f);
export const icon = ui.icon;
export { esc, gbp, copy, facts, ui, R, pricing, router, clock, basket };

export const DATA = { faq: null, guides: null, designs: null, rules: null, chrome: null };
const json = url => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);

/** One boot for every P6 page: copy, facts, sprite, data files, rules, chrome. Resolves to the chrome API. */
export async function bootContent(page, names = [], { data = ['faq', 'guides', 'designs'] } = {}) {
  const loads = [copy.load(['chrome', ...names]), facts.load(), ui.ensureSprite()];
  if (data.includes('faq')) loads.push(json('/lit-neon-preview/data/faq.json').then(j => { DATA.faq = j || { categories: [], questions: [] }; }));
  if (data.includes('guides')) loads.push(json('/lit-neon-preview/data/guides.json').then(j => { DATA.guides = j || { categories: [], guides: [] }; }));
  if (data.includes('designs')) loads.push(json('/lit-neon-preview/data/designs.json').then(j => { DATA.designs = j || { designs: [] }; }));
  loads.push(facts.loadRules().then(r => { DATA.rules = r || null; }));
  await Promise.all(loads);
  try { DATA.chrome = await mountChrome({ page }); } catch { DATA.chrome = null; }
  absoluteMeta();
  return DATA.chrome;
}

/* ---------- from-price (the home page's rule: cheapest catalogue design at Small, else the reference bands) ---------- */
export function fromPrice() {
  const designs = (DATA.designs && DATA.designs.designs) || [];
  const all = designs.length ? pricing.fromPriceAll(designs) : null; if (all != null) return all;
  const b = pricing.bands(); const f = b.find(x => x.from != null); return f ? f.from : null;
}
/** Fill every [data-price-from] (rendered by fillD2 in html mode); re-run when the lettering faces land. */
export function paintPrices(root = document) {
  const v = fromPrice();
  $$('[data-price-from]', root).forEach(el => { if (v != null) { el.textContent = gbp(v); el.classList.remove('is-pending'); } else el.classList.add('is-pending'); });
  return v;
}

function rulePath(path) {
  const r = DATA.rules; if (!r) return undefined;
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), r);
}

/** CONTRACT.md §D2 resolver: {fact:K} {value:K} {rule:pricing|delivery.PATH[|money]} {price:from[:id]} {exclusions}.
    html: true escapes the text and renders prices as live spans (so a price that waits for fonts never leaves a hole). */
export function fillD2(str, { html = false } = {}) {
  if (!str) return '';
  const out = []; let s = String(str);
  const tok = v => { out.push(v); return `\u0000${out.length - 1}\u0000`; };
  s = s.replace(/\{fact:([a-zA-Z0-9_.]+)\}/g, (_, k) => tok(facts.get(k) || ''))
    .replace(/\{value:([a-zA-Z0-9_.]+)\}/g, (_, k) => { const v = facts.value(k); return tok(v == null ? '' : String(v)); })
    .replace(/\{rule:(pricing|delivery)\.([a-zA-Z0-9_.]+)(\|money)?\}/g, (_, g, p, m) => { const v = rulePath(`${g}.${p}`); return tok(v == null ? '' : (m ? gbp(v) : String(v))); })
    .replace(/\{price:from(?::([a-z0-9-]+))?\}/g, (_, id) => {
      if (id) { const d = ((DATA.designs && DATA.designs.designs) || []).find(x => x.id === id); const v = d ? pricing.fromPrice(d) : null; return tok(v == null ? '' : gbp(v)); }
      if (html) return `\u0001PRICE\u0001`;
      const v = fromPrice(); return tok(v == null ? '' : gbp(v));
    })
    .replace(/\{exclusions\}/g, () => { const x = pricing.describeExclusions(); return tok(x.short || x.text || ''); });
  let text = s.replace(/\u0000(\d+)\u0000/g, (_, i) => out[+i]);
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  if (!html) return text.replace(/\u0001PRICE\u0001/g, '');
  return esc(text).replace(/\u0001PRICE\u0001/g, '<span class="cn-price is-pending" data-price-from></span>');
}

/** Resolve every [data-t] template in root. An element whose result is empty and that sits in a [data-t-block]
    removes that block (the §3.9.2 collapsed layout: no hole, no half sentence). */
export function applyTokens(root = document) {
  $$('[data-t]', root).forEach(el => {
    /* a template that needs a raw {value:K} the registry hasn't confirmed uses its data-t-alt wording instead */
    const needs = [...el.dataset.t.matchAll(/\{value:([\w.]+)\}/g)].map(m => m[1]);
    const tpl = needs.some(k => !facts.has(k)) && el.dataset.tAlt != null ? el.dataset.tAlt : el.dataset.t;
    const v = fillD2(tpl, { html: true });
    const block = el.closest('[data-t-block]');
    if (!v.replace(/<[^>]+>/g, '').trim() && !/data-price-from/.test(v)) { if (block) block.remove(); else el.remove(); return; }
    el.innerHTML = v;
  });
  /* review mode: show the owner which facts a block is waiting on */
  if (facts.reviewMode()) $$('[data-chip]', root).forEach(el => { el.insertAdjacentHTML('beforeend', ' ' + el.dataset.chip.split(/\s+/).map(k => facts.chip(k)).join(' ')); });
  /* whole blocks gated on a confirmed fact */
  $$('[data-gate]', root).forEach(el => { const keys = el.dataset.gate.split(/\s+/); if (!keys.every(k => facts.has(k))) el.remove(); });
  $$('[data-gate-not]', root).forEach(el => { const keys = el.dataset.gateNot.split(/\s+/); if (keys.some(k => facts.has(k))) el.remove(); });
  paintPrices(root);
}

/* ---------- contact chain: WhatsApp → email → the contact form (which always exists) ---------- */
export function channels(text = '') {
  const list = [];
  if (facts.has('whatsappNumber')) { const n = String(facts.value('whatsappNumber')).replace(/\D/g, ''); list.push({ kind: 'whatsapp', href: `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`, label: t('common.whatsapp', {}, 'Message us on WhatsApp'), icon: 'whatsapp', external: true }); }
  if (facts.has('supportEmail')) { const e = String(facts.value('supportEmail')); list.push({ kind: 'email', href: `mailto:${e}${text ? `?subject=${encodeURIComponent(text)}` : ''}`, label: e, icon: 'mail' }); }
  list.push({ kind: 'contact', href: `/lit-neon-preview/contact.html${text ? `?text=${encodeURIComponent(text)}` : ''}`, label: t('common.form', {}, 'Send us a message'), icon: 'chat' });
  return list;
}
export const askHref = (text = '') => channels(text)[0].href;
/** "Still stuck?" card: channels that exist, hours/reply promise only when confirmed. */
export function contactCard({ qa, title, body, text = '' } = {}) {
  const ch = channels(text);
  const hours = facts.has('supportHours') ? `<p class="cn-contact__meta">${icon('clock', 'ic--sm')}<span>${esc(facts.get('supportHours'))}</span></p>` : '';
  const reply = facts.has('replyHours') ? `<p class="cn-contact__meta">${icon('chat', 'ic--sm')}<span>${esc(facts.get('replyHours'))}</span></p>` : '';
  const btns = ch.map((c, i) => `<a class="c-btn ${i === 0 ? 'c-btn--primary' : 'c-btn--ghost'} c-btn--block" href="${esc(c.href)}"${c.external ? ' target="_blank" rel="noopener"' : ''} data-qa="${qa}.${c.kind}">${icon(c.icon)}<span>${esc(c.label)}</span></a>`).join('');
  return `<div class="cn-contact" data-qa="${qa}"><h2 class="cn-contact__h">${esc(title || t('common.stuckTitle', {}, 'Still stuck?'))}</h2><p class="cn-contact__body">${esc(body || t('common.stuckBody', {}, 'Ask the people who make the signs. A person reads every message.'))}</p>${hours}${reply}<div class="cn-contact__btns">${btns}</div></div>`;
}

/* ---------- table of contents with scroll-spy (desktop sticky list + mobile details) ---------- */
export function buildToc(body, navs, { qa = 'toc', offset = 120 } = {}) {
  const hs = $$('h2[id]', body).filter(h => !h.closest('[hidden]'));
  const html = hs.map(h => `<li><a href="#${esc(h.id)}" data-qa="${qa}.link" data-id="${esc(h.id)}">${esc(h.dataset.toc || h.textContent)}</a></li>`).join('');
  navs.forEach(n => { const ol = n.querySelector('ol'); if (ol) ol.innerHTML = html; });
  if (!hs.length) { navs.forEach(n => n.closest('[data-toc-wrap]')?.remove()); return () => {}; }
  navs.forEach(n => n.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (!a) return; const d = a.closest('details'); if (d) d.open = false; }));
  let ticking = false;
  const spy = () => { ticking = false; let cur = hs[0];
    for (const h of hs) { if (h.getBoundingClientRect().top - offset <= 0) cur = h; else break; }
    navs.forEach(n => $$('a', n).forEach(a => { const on = a.dataset.id === cur.id; a.classList.toggle('is-current', on); if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); })); };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
  window.addEventListener('scroll', onScroll, { passive: true }); spy();
  return () => window.removeEventListener('scroll', onScroll);
}

/* ---------- FAQ items ---------- */
export function answerOf(q) {
  const v = (q.variants || []).find(x => x.when && x.when.startsWith('fact:') && facts.has(x.when.slice(5)));
  return v ? v.a : q.a;
}
export function faqItem(q, { qa, copyLink = true, open = false } = {}) {
  const links = (q.links || []).map(l => `<a href="/lit-neon-preview/${esc(String(l.href).replace(/^\//, ''))}" data-qa="${qa}.related" data-id="${esc(q.id)}">${esc(l.label)}</a>`).join('');
  return `<details class="cn-q" id="${esc(q.id)}" data-cat="${esc(q.category)}"${open ? ' open' : ''}><summary data-qa="${qa}.q" data-id="${esc(q.id)}"><span class="label">${esc(q.q)}</span>${icon('chevron-down')}</summary>` +
    `<div class="c-acc__body cn-q__body"><div class="prose"><p class="cn-q__a">${fillD2(answerOf(q), { html: true })}</p>${links ? `<p class="cn-q__links">${links}</p>` : ''}</div>` +
    (copyLink ? `<button type="button" class="c-btn c-btn--text cn-copy" data-copy-link="${esc(q.id)}" data-qa="${qa}.copy" data-id="${esc(q.id)}">${icon('link', 'ic--sm')}<span class="label">${esc(t('common.copyLink', {}, 'Copy link to this answer'))}</span></button>` : '') + `</div></details>`;
}
export function faqJsonLd(questions) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: questions.map(q => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: fillD2(answerOf(q)) } })) };
}

/** Copy an absolute link; the button shows its success state for 2 s (no toast: inline feedback). */
export async function copyLink(btn, path) {
  const url = new URL(path, location.origin).href; let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch {
    try { const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch { ok = false; }
  }
  const label = btn.querySelector('.label'); const prev = btn.dataset.prev || (label ? label.textContent : '');
  btn.dataset.prev = prev;
  if (label) label.textContent = ok ? t('common.copied', {}, 'Link copied') : url;
  btn.classList.toggle('is-done', ok); ui.announce(ok ? t('common.copied', {}, 'Link copied') : url);
  clearTimeout(btn._t); btn._t = setTimeout(() => { if (label) label.textContent = prev; btn.classList.remove('is-done'); }, 2200);
  return ok;
}

/* ---------- head helpers ---------- */
export function absoluteMeta() {
  try {
    const canon = $('link[rel="canonical"]'); const og = $('meta[property="og:image"]'); const ou = $('meta[property="og:url"]');
    if (canon) canon.href = new URL(canon.getAttribute('href'), location.origin).href;
    if (og) og.content = new URL(og.getAttribute('content'), location.origin).href;
    if (ou && canon) ou.content = canon.href;
  } catch {}
}
export function jsonLd(obj, id) {
  let el = id ? document.getElementById(id) : null;
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; if (id) el.id = id; document.head.appendChild(el); }
  el.textContent = JSON.stringify(obj);
  return el;
}
export const breadcrumbLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: new URL(it.href, location.origin).href })) });

/** A neon tile drawn with the renderer (DOM neon, no plate). Redrawn when the lettering faces land (the metrics change)
    and refitted when its box resizes, so long words never clip. */
const TILES = new Set(); let tileRO = null; let tileFontsHooked = false;
export function neonTile(el, st, opts = {}) {
  if (!el) return null;
  const state = R.normalise({ ...R.DEFAULT_DESIGN, ...st });
  const { rendered, ...mopts } = opts;
  let api; try { api = R.mountNeon(el, state, { fitW: .74, fitH: .44, lit: true, ...mopts, ...(rendered ? { composite: true } : {}) }); } catch { el.textContent = st.text || ''; return null; }
  /* rule 4 (§0): a lit sign glowing on a dark wall could pass for a photo of a real install, so a tile shown as a
     card or hero image is a composite and carries the Rendered preview pill (in the media box, beside the tile:
     the renderer owns the tile's innerHTML) */
  if (rendered) {
    el.dataset.composite = '';
    const box = el.parentElement;
    if (box && !box.querySelector(':scope > .c-pill--rendered')) box.insertAdjacentHTML('beforeend', `<span class="c-pill c-pill--rendered ar-tile__pill" data-caption="rendered">${esc(copy.t('pills.rendered', {}, 'Rendered preview'))}</span>`);
  }
  const rec = { api, state }; TILES.add(rec);
  if (typeof ResizeObserver === 'function') { tileRO = tileRO || new ResizeObserver(es => es.forEach(e => e.target._lnFit && e.target._lnFit())); tileRO.observe(el); }
  if (!tileFontsHooked) { tileFontsHooked = true; whenFonts(() => { R.clearMetrics && R.clearMetrics(); TILES.forEach(r => r.api.update(r.state)); }); }
  return api;
}

/** Re-run fn once the lettering faces land (prices and neon tiles depend on measured letters). */
export function whenFonts(fn) { R.ensureFonts().then(() => fn()).catch(() => {}); R.onFonts(() => fn()); }

/* ---------- postcode checker (the same rules and copy as the builder dock and checkout) ---------- */
export function postcodeChecker(form, { qa, onResult } = {}) {
  const input = $('input', form); const out = form.parentElement.querySelector('[data-pc-out]') || $('[data-pc-out]', form);
  const field = input.closest('.c-field');
  function show(raw, { save = true } = {}) {
    const r = pricing.deliveryLine(raw);
    field.classList.remove('is-error', 'is-success'); input.removeAttribute('aria-invalid');
    out.dataset.status = r.status;
    if (r.status === 'empty') { out.innerHTML = `<p class="cn-pc__msg">${icon('info', 'ic--sm')}<span>${esc(t('deliveryPage.checker.empty', {}, 'Type a postcode, for example SW1A 1AA.'))}</span></p>`; return r; }
    if (r.status === 'invalid') { field.classList.add('is-error'); input.setAttribute('aria-invalid', 'true'); out.innerHTML = `<p class="cn-pc__msg cn-pc__msg--bad">${icon('warning', 'ic--sm')}<span>${esc(r.text)}</span></p>`; onResult?.(r); return r; }
    input.value = r.formatted || input.value;
    if (r.status === 'excluded') {
      const ask = askHref(t('deliveryPage.checker.askText', { postcode: r.formatted }, `Hello, could you deliver to ${r.formatted}?`));
      out.innerHTML = `<div class="cn-pc__res cn-pc__res--amber" data-qa="${qa}.excluded">${icon('warning')}<div><p class="cn-pc__head">${esc(r.text)}</p><p>${esc(t('deliveryPage.checker.excludedBody', {}, 'We’re working on it. Tell us where it’s going and we’ll be straight with you about what’s possible.'))}</p><a class="c-btn c-btn--ghost" href="${esc(ask)}" data-qa="${qa}.ask">${esc(t('deliveryPage.ask', {}, 'Ask us — we’re working on it'))}${icon('arrow-right')}</a></div></div>`;
    } else {
      field.classList.add('is-success');
      out.innerHTML = `<div class="cn-pc__res cn-pc__res--ok" data-qa="${qa}.ok">${icon('check')}<div><p class="cn-pc__head">${esc(r.prefix || '')}</p><p>${esc(r.line || '')}</p></div></div>`;
      if (save) { try { basket.postcode.set(r.formatted); } catch {} }
    }
    onResult?.(r); return r;
  }
  form.addEventListener('submit', e => { e.preventDefault(); show(input.value); });
  input.addEventListener('blur', () => { const f = pricing.formatPostcode(input.value); if (f) input.value = f; });
  input.addEventListener('input', () => { if (field.classList.contains('is-error')) { field.classList.remove('is-error'); input.removeAttribute('aria-invalid'); } });
  let saved = ''; try { saved = basket.postcode.get() || router.postcode.get() || ''; } catch {}
  if (saved) { input.value = saved; show(saved, { save: false }); } else show('');
  return { check: show };
}

/* ============================================================ delivery.html ============================================================ */
async function initDelivery() {
  await bootContent('delivery', ['info'], { data: ['faq', 'designs'] });
  await pricing.loadAreas();
  const d = (DATA.rules && DATA.rules.delivery) || {};
  applyTokens();
  /* hero lede: lead time and its dependency from the facts registry */
  $('#dl-lede').textContent = t('deliveryPage.lede', { lead: facts.get('leadTimeDays'), from: facts.get('leadTimeFrom') });
  postcodeChecker($('#dl-pc'), { qa: 'delivery.checker' });

  /* cutoff sentence + the date calculator read the same rule the dock uses */
  $$('[data-cutoff]').forEach(el => { el.textContent = fmtHour(d.cutoffHour ?? 14); });
  const cal = $('#dl-cal'), calIn = $('#dl-cal-date'), calOut = $('#dl-cal-out');
  const today = clock.now(); calIn.value = isoDate(today); calIn.min = isoDate(today);
  const paintCal = () => {
    const v = calIn.value; if (!v) { calOut.innerHTML = ''; return; }
    const [y, m, dd] = v.split('-').map(Number); const at = new Date(y, m - 1, dd, 10, 0);
    const w = pricing.windowFrom(at); const slotDay = pricing.nextApprovalSlot(at);
    const counted = isoDate(slotDay) === v;
    calOut.innerHTML = `<p class="cn-cal__range" data-qa="delivery.calc.range">${esc(fmtRange(w.from, w.to))}</p><p class="cn-cal__note">${esc(counted ? t('deliveryPage.calc.counts', { day: fmtDay(at), cutoff: fmtHour(d.cutoffHour ?? 14) }) : t('deliveryPage.calc.next', { day: fmtDay(at), next: fmtDay(slotDay) }))}</p>`;
  };
  cal.addEventListener('submit', e => { e.preventDefault(); paintCal(); });
  calIn.addEventListener('change', paintCal); paintCal();

  /* bank holidays from the rules, formatted (never typed) */
  const hols = (d.bankHolidays || []).filter(x => new Date(x + 'T12:00') >= new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  $('#dl-hols').innerHTML = hols.length ? hols.map(h => `<li><time datetime="${esc(h)}">${esc(fmtDayYear(new Date(h + 'T12:00')))}</time></li>`).join('') : `<li>${esc(t('deliveryPage.holsNone'))}</li>`;

  /* where we deliver: generated from rules + postcode-areas.json (C15) */
  const x = pricing.describeExclusions();
  $('#dl-excl-short').textContent = x.short;
  $('#dl-groups').innerHTML = x.groups.map(g => `<article class="cn-group" data-qa="delivery.group" data-id="${esc(g.id)}"><h3>${esc(g.name)}</h3><ul>${g.entries.map(e => `<li><span>${esc(e.place)}</span><code>${esc(e.code)}</code></li>`).join('')}</ul></article>`).join('') +
    (x.unnamed.length ? `<article class="cn-group"><h3>${esc(t('deliveryPage.also'))}</h3><ul>${x.unnamed.map(c => `<li><code>${esc(c)}</code></li>`).join('')}</ul></article>` : '');
  $('#dl-excl-text').textContent = x.long.join(' · ');
  $$('.cn-group h3').forEach(h => { h.textContent = h.textContent.charAt(0).toUpperCase() + h.textContent.slice(1); });
  /* the damage fact already carries the CRA sentence in customer mode; keep the standalone line only when it doesn't */
  const dmg = $('[data-qa="delivery.damage"]'); if (dmg && /Consumer Rights Act 2015/.test(dmg.textContent)) $('[data-qa="delivery.cra"]')?.remove();
  const ask = $('#dl-ask'); ask.href = askHref(t('deliveryPage.askText', {}, 'Hello, could you deliver to my postcode?'));

  /* delivery FAQ (help ids, deep-linked) */
  const qs = (DATA.faq.questions || []).filter(q => q.help && q.category === 'delivery');
  $('#dl-faq').innerHTML = qs.map(q => faqItem(q, { qa: 'delivery.faq' })).join('');
  bindCopy($('#dl-faq')); ui.accordion($('#dl-faq'), { deepLink: true });
  whenFonts(() => paintPrices());
  jsonLd(breadcrumbLd([{ name: 'Home', href: '/lit-neon-preview/' }, { name: t('deliveryPage.h1short', {}, 'Delivery'), href: '/lit-neon-preview/delivery.html' }]), 'ld-crumbs');
  document.documentElement.dataset.ready = 'delivery';
}

export function bindCopy(root) {
  root.addEventListener('click', e => { const b = e.target.closest('[data-copy-link]'); if (!b) return; e.preventDefault(); const id = b.dataset.copyLink; copyLink(b, `/lit-neon-preview/help.html#${id}`); });
}

/* ============================================================ returns.html ============================================================ */
async function initReturns() {
  await bootContent('returns', ['info'], { data: ['faq'] });
  applyTokens();
  /* "What did you buy?" finder: three answers, each pointing at its full block */
  const finder = $('#rt-finder'); const card = $('#rt-answer');
  const pick = id => {
    $$('[data-pick]', finder).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === id)));
    const k = `returnsPage.finder.${id}`;
    card.hidden = false; card.dataset.state = id;
    card.innerHTML = `<p class="t-eyebrow">${esc(t(k + '.eyebrow'))}</p><p class="rt-answer__big">${esc(t(k + '.big', { days: facts.value('readyMadeReturnsDays') ?? '', years: facts.value('warrantyYears') ?? '' }))}</p><p>${esc(t(k + '.body'))}</p><a class="c-btn c-btn--ghost" href="#${esc(t(k + '.anchor'))}" data-qa="returns.finder.more">${esc(t('returnsPage.finder.more'))}${icon('arrow-down')}</a>`;
  };
  finder.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) pick(b.dataset.pick); });
  const qs = (DATA.faq.questions || []).filter(q => q.help && q.category === 'returns');
  $('#rt-faq').innerHTML = qs.map(q => faqItem(q, { qa: 'returns.faq' })).join('');
  bindCopy($('#rt-faq')); ui.accordion($('#rt-faq'), { deepLink: true });
  $('#rt-contact').innerHTML = contactCard({ qa: 'returns.contact', title: t('returnsPage.contactTitle'), body: t('returnsPage.contactBody'), text: t('returnsPage.contactText', {}, 'Hello, I need help with a return or a fault.') });
  jsonLd(breadcrumbLd([{ name: 'Home', href: '/lit-neon-preview/' }, { name: t('returnsPage.h1short', {}, 'Returns and warranty'), href: '/lit-neon-preview/returns.html' }]), 'ld-crumbs');
  document.documentElement.dataset.ready = 'returns';
}

const PAGE = document.body && document.body.dataset.page;
if (PAGE === 'delivery') initDelivery();
if (PAGE === 'returns') initReturns();
