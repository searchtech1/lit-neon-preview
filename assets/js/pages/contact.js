/* Lit Neon v2 — contact page (brief §4.17, owner P3). The form is the channel that always exists: it submits through
   forms.submit('contact') and shows its confirmation (LN-C-…) only on a 2xx. WhatsApp / email / live-chat cards, support
   hours, the reply promise and the workshop address render only from CONFIRMED facts (§3.9.2): with every channel fact
   unconfirmed the page is the hero, the form and the quick answers, with no empty card. Review mode shows the chips.
   Prefill: ?topic=order|design|delivery|trade|other · ?order=LN-… · ?text=… (message). data-qa="contact.*". */
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import * as ui from 'core/ui.js';
import forms from 'core/forms.js';
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import { mount as mountChrome } from 'core/chrome.js';
import { esc } from 'core/money.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const t = (k, v, f) => copy.t(k, v, f);
const icon = ui.icon;
const TOPICS = ['order', 'design', 'delivery', 'trade', 'other'];
const LINKS = { design: '/lit-neon-preview/upload.html', delivery: '/lit-neon-preview/delivery.html', trade: '/lit-neon-preview/bulk-quote.html' };

(async function boot() {
  await Promise.all([copy.load(['chrome', 'contact']), facts.load(), ui.ensureSprite()]);
  mountChrome({ page: 'contact' }).catch(() => {});
  $$('[data-copy]').forEach(el => { const v = copy.get(el.dataset.copy); if (typeof v === 'string' && v) el.textContent = v; });
  const reply = facts.has('replyHours') ? facts.get('replyHours') : '';
  $('#ct-lede').textContent = reply ? t('ledeReply', { reply }) : t('lede', {}, $('#ct-lede').textContent);
  sign(); cards(); asideFacts(); form(reply);
  document.documentElement.dataset.ready = 'contact';
})();

function sign() {
  const el = $('#ct-sign'); const st = R.normalise({ ...R.DEFAULT_DESIGN, text: 'Say hello', font: 'soho', colour: 'pink' });
  try { stage.mount(el, { frame: 'wide', scene: 's07-cafe', design: st, view: { night: true, on: true, rulers: 'off' }, interactive: false, rulers: false, pill: true, qa: 'contact.hero.stage' }); } catch { /* decorative */ }
}

/* channel cards: only confirmed facts; review mode adds the owner's to-do chips */
function cards() {
  const out = []; const review = facts.reviewMode();
  const hours = facts.has('supportHours') ? `<p class="meta">${esc(t('cards.hours', { hours: facts.get('supportHours') }))}</p>` : '';
  if (facts.has('whatsappNumber')) {
    const n = String(facts.value('whatsappNumber')).replace(/\D/g, '');
    out.push(`<article class="ct-channel" data-qa="contact.card.whatsapp">${icon('whatsapp')}<h3>${esc(t('cards.whatsapp'))}</h3><p>${esc(t('cards.whatsappBody'))}</p>${hours}<a class="c-btn c-btn--ghost" href="https://wa.me/${n}?text=${encodeURIComponent('Hello Lit Neon, ')}" target="_blank" rel="noopener" data-qa="contact.card.whatsapp.cta">${icon('whatsapp')}<span>${esc(t('cards.whatsappCta'))}</span></a></article>`);
  }
  if (facts.has('supportEmail')) {
    const e = String(facts.value('supportEmail'));
    out.push(`<article class="ct-channel" data-qa="contact.card.email">${icon('mail')}<h3>${esc(t('cards.email'))}</h3><p>${esc(t('cards.emailBody'))}</p>${hours}<a class="c-btn c-btn--ghost" href="mailto:${esc(e)}" data-qa="contact.card.email.cta">${icon('mail')}<span>${esc(e)}</span></a></article>`);
  }
  if (facts.has('liveChat')) out.push(`<article class="ct-channel" data-qa="contact.card.chat">${icon('chat')}<h3>${esc(t('cards.chat'))}</h3><p>${esc(t('cards.chatBody'))}</p>${hours}</article>`);
  else if (review) out.push(`<article class="ct-channel" data-qa="contact.card.chat">${icon('chat')}<h3>${esc(t('cards.chat'))}</h3><p>${esc(t('cards.chatReview'))} ${facts.chip('liveChat')}</p></article>`);
  if (review) { ['whatsappNumber', 'supportEmail', 'supportHours'].filter(k => !facts.has(k)).forEach(k => out.push(`<article class="ct-channel ct-channel--review" data-qa="contact.card.review">${icon('info')}<h3>${esc(k)}</h3><p>${facts.chip(k)}</p></article>`)); }
  if (out.length) { $('#ct-cards').innerHTML = out.join(''); $('#ct-cards-sec').hidden = false; }
  else $('#ct-cards-sec').remove();     /* collapsed layout: no empty section */
}

function asideFacts() {
  const box = $('#ct-facts'); let any = false;
  if (facts.has('supportHours')) { $('#ct-hours p').textContent = t('cards.hours', { hours: facts.get('supportHours') }); $('#ct-hours').hidden = false; any = true; } else $('#ct-hours').remove();
  if (facts.has('registeredAddress')) { $('#ct-address address').textContent = [facts.has('companyName') ? facts.get('companyName') : '', facts.get('registeredAddress')].filter(Boolean).join('\n'); $('#ct-address').hidden = false; any = true; } else $('#ct-address').remove();
  if (any) box.hidden = false; else box.remove();
}

function form(reply) {
  const f = $('#ct-form'); const sel = $('#ct-topic'); const hint = $('#ct-topic-hint');
  const q = new URLSearchParams(location.search);
  const ph = copy.get('form.messagePlaceholder'); if (ph) $('#ct-message').placeholder = ph;
  if (TOPICS.includes(q.get('topic'))) sel.value = q.get('topic');
  if (q.get('order')) $('#ct-order').value = String(q.get('order')).slice(0, 40).toUpperCase();
  if (q.get('text')) $('#ct-message').value = String(q.get('text')).slice(0, 2000);
  else if (q.get('postcode')) $('#ct-message').value = t('form.postcodeAsk', { postcode: String(q.get('postcode')).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 10) });   /* from the basket/checkout excluded-postcode route (P7) */
  const paint = () => {
    const v = sel.value; sel.classList.toggle('is-empty', !v);
    const msg = v ? t(`form.topicHints.${v}`) : '';
    if (!msg) { hint.hidden = true; hint.innerHTML = ''; return; }
    hint.hidden = false;
    hint.innerHTML = `<span>${esc(msg)}</span>${LINKS[v] ? `<a class="c-btn c-btn--ghost c-btn--sm" href="${LINKS[v]}" data-qa="contact.topic.link">${esc(t(`form.topicLinks.${v}`))}${icon('arrow-right')}</a>` : ''}`;
  };
  sel.addEventListener('change', () => { sel.removeAttribute('aria-invalid'); $('#ct-topic-err')?.remove(); paint(); saveDraft(); }); paint();
  /* message: a live character count (the field stops at maxlength, so a long paste is clipped: say so, never silently),
     and a per-tab draft (sessionStorage) so a reload or a wander to the help pages does not lose a half-written message */
  const msg = $('#ct-message'), count = $('#ct-message-count'); const MAX = +msg.getAttribute('maxlength') || 4000;
  const fmt = n => n.toLocaleString('en-GB');
  let kept = false;
  const paintCount = () => { const n = msg.value.length; count.classList.toggle('is-warn', n >= MAX * .9); count.textContent = kept ? t('form.messageKept', { max: fmt(MAX) }) : t('form.messageCount', { n: fmt(n), max: fmt(MAX) }); };
  msg.addEventListener('beforeinput', e => { if (!/^insert/.test(e.inputType || '')) return; const add = e.data != null ? e.data : (e.dataTransfer && e.dataTransfer.getData('text/plain')) || ''; const room = MAX - (msg.value.length - (msg.selectionEnd - msg.selectionStart)); kept = add.length > room; });
  msg.addEventListener('input', () => { if (msg.value.length < MAX) kept = false; paintCount(); saveDraft(); });
  const DRAFT = 'ln-contact-draft';
  function saveDraft() { try { const d = { topic: sel.value, name: $('#ct-name')?.value || '', email: $('#ct-email')?.value || '', order: $('#ct-order').value, message: msg.value }; if (d.message.trim() || d.name || d.email) sessionStorage.setItem(DRAFT, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT); } catch {} }
  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT); } catch {} };
  if (!q.get('text') && !q.get('postcode')) {
    try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
      if (d && String(d.message || '').trim()) { msg.value = String(d.message).slice(0, MAX); if (!q.get('topic') && TOPICS.includes(d.topic)) { sel.value = d.topic; paint(); } if (d.name && $('#ct-name') && !$('#ct-name').value) $('#ct-name').value = d.name; if (d.email && $('#ct-email') && !$('#ct-email').value) $('#ct-email').value = d.email; if (d.order && !q.get('order')) $('#ct-order').value = d.order; ui.toast(t('form.draftRestored'), { kind: 'info' }); } } catch {}
  }
  ['#ct-name', '#ct-email', '#ct-order'].forEach(s => $(s)?.addEventListener('input', saveDraft));
  paintCount();
  $('#ct-order').addEventListener('blur', e => { e.target.value = e.target.value.trim().toUpperCase(); });
  const bound = forms.bind(f, {
    kind: 'contact', qa: 'contact',
    validate: fields => { const errs = []; if (!fields.topic) errs.push({ field: 'topic', message: t('form.topicErr') }); if (!String(fields.message || '').trim()) errs.push({ field: 'message', message: t('form.messageErr') }); return errs; },
    extra: () => ({ subject: `Contact form: ${sel.value ? t(`form.topics.${sel.value}`) : ''}`, topicLabel: sel.value ? t(`form.topics.${sel.value}`) : '', page: 'contact' }),
    onSuccess: (res, fields) => {
      clearDraft();
      const name = String(fields.name || '').trim().split(/\s+/)[0]; const email = String(fields.email || '').trim();
      const card = document.createElement('div'); card.className = 'ct-card ct-done'; const target = document.createElement('div'); card.appendChild(target);
      forms.renderSuccess(target, { ref: res.ref, local: !!res.local, title: name ? t('confirm.title', { name }) : t('confirm.titleNoName'), body: esc(reply ? t('confirm.bodyReply', { email, reply }) : t('confirm.body', { email })), qa: 'contact' });
      const acts = document.createElement('div'); acts.className = 'ct-done__acts';
      acts.innerHTML = `<a class="c-btn c-btn--ghost" href="/lit-neon-preview/help.html" data-qa="contact.confirm.help">${esc(t('quick.items.help'))}</a><button type="button" class="c-btn c-btn--text" data-qa="contact.confirm.again"><span class="label">${esc(t('confirm.again'))}</span></button>`;
      card.appendChild(acts); f.replaceWith(card);
      acts.querySelector('button').addEventListener('click', () => { card.replaceWith(f); bound.reset(); kept = false; paint(); paintCount(); $('#ct-name').focus(); });
      card.scrollIntoView({ block: 'center', behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  });
}
