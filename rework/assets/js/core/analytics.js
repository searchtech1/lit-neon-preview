/* Lit Neon v2 — analytics (brief §6.2): consent-gated window.dataLayer events. Nothing is pushed until
   localStorage.consent grants analytics (the consent banner / cookies page write it through setConsent). Events fired
   before consent are queued (≤ 50) and flushed on grant; rejected consent drops the queue. Node-safe via createAnalytics. */

export const EVENTS = ['builder_start', 'builder_add_to_basket', 'basket_checkout', 'mockup_request', 'bulk_request', 'quiz_complete', 'email_capture', 'ar_open', 'wall_photo', 'share', 'page_view'];
export const CONSENT_KEY = 'consent';

export function createAnalytics({ storage, dataLayer, now = () => Date.now() } = {}) {
  const store = storage === undefined ? (() => { try { return globalThis.localStorage || null; } catch { return null; } })() : storage;
  const layer = () => { if (dataLayer) return dataLayer; if (typeof window === 'undefined') return null; window.dataLayer = window.dataLayer || []; return window.dataLayer; };
  const queue = []; const subs = new Set();
  /** { set: bool, essential: true, analytics: bool, marketing: bool, at } — accepts the JSON shape, or legacy 'all'|'none' */
  function consent() {
    let raw = null; try { raw = store ? store.getItem(CONSENT_KEY) : null; } catch {}
    if (raw === 'all') return { set: true, essential: true, analytics: true, marketing: true };
    if (raw === 'none' || raw === 'essential') return { set: true, essential: true, analytics: false, marketing: false };
    try { const o = JSON.parse(raw); if (o && typeof o === 'object') return { set: true, essential: true, analytics: !!o.analytics, marketing: !!o.marketing, at: o.at || null }; } catch {}
    return { set: false, essential: true, analytics: false, marketing: false };
  }
  function setConsent({ analytics = false, marketing = false } = {}) {
    const rec = { essential: true, analytics: !!analytics, marketing: !!marketing, at: now() };
    try { store && store.setItem(CONSENT_KEY, JSON.stringify(rec)); } catch {}
    if (rec.analytics) flush(); else queue.length = 0;
    subs.forEach(fn => { try { fn(consent()); } catch {} });
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('ln:consent', { detail: consent() }));
    return consent();
  }
  function acceptAll() { return setConsent({ analytics: true, marketing: true }); }
  function rejectAll() { return setConsent({ analytics: false, marketing: false }); }
  function push(ev) { const L = layer(); if (L) L.push(ev); }
  function flush() { while (queue.length) push(queue.shift()); }
  /** track(event, params): pushed when analytics consent is granted, else queued */
  function track(event, params = {}) {
    const ev = { event, ...params, ts: now() };
    if (consent().analytics) push(ev); else { if (queue.length >= 50) queue.shift(); queue.push(ev); }
    return ev;
  }
  function onConsent(fn) { subs.add(fn); return () => subs.delete(fn); }
  return { EVENTS, consent, setConsent, acceptAll, rejectAll, track, onConsent, flush, get queued() { return queue.length; } };
}

const analytics = createAnalytics();
/* the consent banner / cookies page (WS0-A chrome) writes localStorage.consent and fires ln:consent; flush or drop the queue accordingly */
if (typeof document !== 'undefined') document.addEventListener('ln:consent', e => { const c = (e.detail && 'analytics' in e.detail) ? e.detail : analytics.consent(); if (c.analytics) analytics.flush(); });
export default analytics;
export const { consent, setConsent, acceptAll, rejectAll, track, onConsent } = analytics;
