/* Lit Neon v2 — legal pages (brief §4.20; owner P6): privacy, terms, cookies, recycling, reviews policy. Paper template
   with a table of contents and scroll-spy, trader identity from launch-required facts (omitted while unconfirmed), the
   review-only "not yet reviewed" chip driven by data/legal-status.json, and on cookies.html real switches bound to
   localStorage.consent through core/analytics.js (the same record the consent banner writes): Save applies them at once,
   so window.dataLayer only receives events while analytics is on. data-qa="legal.*". */
import { bootContent, applyTokens, buildToc, $, $$, t } from 'pages/info.js';
import analytics from 'core/analytics.js';

const SLUG = document.body.dataset.legal;

(async function boot() {
  await bootContent('legal', ['info', 'legal'], { data: [] });
  applyTokens($('.lg-body'));
  await reviewChip();
  buildToc($('.lg-body'), $$('[data-toc-wrap] nav'), { qa: 'legal.toc' });
  if (SLUG === 'cookies') cookies();
  document.documentElement.dataset.ready = 'legal';
})();

/* the chip only exists for pages still marked legalReviewed:false (review mode shows it; customer mode hides it) */
async function reviewChip() {
  const chip = $('[data-qa="legal.review"]'); if (!chip) return;
  try {
    const r = await fetch('/lit-neon-preview/data/legal-status.json', { cache: 'no-store' }); const j = r.ok ? await r.json() : { pages: [] };
    const entry = (j.pages || []).find(p => p.path === `legal/${SLUG}.html`);
    if (entry && entry.legalReviewed) chip.remove();
  } catch { /* keep the chip: unknown status is unreviewed */ }
}

function cookies() {
  const panel = $('[data-consent-panel]'); const status = $('[data-qa="legal.cookies.status"]');
  const toggles = $$('[data-toggle]', panel);
  const word = on => (on ? t('legal.cookies.stateOn') : t('legal.cookies.stateOff'));
  let saved = analytics.consent();
  let draft = { analytics: saved.analytics, marketing: saved.marketing };
  const paint = () => {
    toggles.forEach(b => { const on = !!draft[b.dataset.toggle]; b.setAttribute('aria-checked', String(on)); b.querySelector('.lg-toggle__state').textContent = on ? t('legal.cookies.on') : t('legal.cookies.off'); });
    const dirty = draft.analytics !== saved.analytics || draft.marketing !== saved.marketing;
    panel.classList.toggle('is-dirty', dirty);
    status.dataset.state = dirty ? 'dirty' : (saved.set ? 'saved' : 'none');
    status.textContent = dirty ? t('legal.cookies.unsaved') : (saved.set ? t('legal.cookies.savedAt', { analytics: word(saved.analytics), marketing: word(saved.marketing) }) : t('legal.cookies.none'));
  };
  const commit = (rec, flash) => {
    saved = analytics.setConsent(rec);           /* writes localStorage.consent + fires ln:consent; analytics flushes or drops its queue */
    draft = { analytics: saved.analytics, marketing: saved.marketing };
    document.querySelector('[data-qa="chrome.consent"]')?.remove();   /* the banner's question is answered */
    paint();
    if (flash) { status.dataset.state = 'just-saved'; status.textContent = t('legal.cookies.saved', { analytics: word(saved.analytics), marketing: word(saved.marketing) }); }
  };
  toggles.forEach(b => b.addEventListener('click', () => { draft[b.dataset.toggle] = !draft[b.dataset.toggle]; paint(); }));
  panel.addEventListener('click', e => {
    const a = e.target.closest('[data-consent]'); if (!a) return;
    if (a.dataset.consent === 'save') commit(draft, true);
    if (a.dataset.consent === 'accept') commit({ analytics: true, marketing: true }, true);
    if (a.dataset.consent === 'reject') commit({ analytics: false, marketing: false }, true);
  });
  /* another tab (or the banner) changed it */
  document.addEventListener('ln:consent', () => { const c = analytics.consent(); if (c.analytics !== saved.analytics || c.marketing !== saved.marketing) { saved = c; draft = { analytics: c.analytics, marketing: c.marketing }; paint(); } });
  window.addEventListener('storage', e => { if (e.key === 'consent') { saved = analytics.consent(); draft = { analytics: saved.analytics, marketing: saved.marketing }; paint(); } });
  paint();
}
