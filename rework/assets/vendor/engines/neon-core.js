/* vendored by tools/build.mjs — do not edit; the source of truth is in the repo root */
const self = globalThis;
/* Lit Neon core: pure sign rules shared by the builder, product pages and scripts.
   No DOM. Browser: window.LitNeonCore. Node: require('./neon-core.js'). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LitNeonCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QUOTES = { '‘': "'", '’': "'", '“': '"', '”': '"' };
  const ALLOWED = /^[A-Za-z0-9À-ÖØ-öø-ÿ .,'"!?&@#£€%+\-:;()\/*\n]$/u;
  const POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

  function normaliseText(raw, opts) {
    const maxLines = (opts && opts.maxLines) || 3;
    const maxChars = (opts && opts.maxChars) || 24;
    let truncated = false;
    /* One text rule for every surface: NFC (so a decomposed accent is one character), CRLF/CR -> \n,
       curly quotes -> straight, em/en dash -> '-', and any run of Unicode whitespace other than \n
       (tab, NBSP, em space...) -> one space. \n stays the only line separator. */
    const cleaned = String(raw == null ? '' : raw)
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .replace(/[‘’“”]/g, ch => QUOTES[ch])
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\S\n]+/g, ' ');
    let lines = cleaned.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); truncated = true; }
    lines = lines.map(l => {
      const chars = Array.from(l);
      if (chars.length <= maxChars) return l;
      truncated = true;
      return chars.slice(0, maxChars).join('').trim();
    });
    return { lines, text: lines.join('\n'), truncated };
  }

  function unsupportedChars(text) {
    const bad = [];
    for (const ch of Array.from(String(text || ''))) {
      if (!ALLOWED.test(ch) && !bad.includes(ch)) bad.push(ch);
    }
    return bad;
  }

  function dimsFor(metrics, letterCm, marginCm) {
    if (!metrics || !(metrics.cap > 0) || !(metrics.inkW > 0) || !(metrics.inkH > 0)) return null;
    if (!Number.isFinite(letterCm) || !Number.isFinite(marginCm)) return null;
    const emCm = letterCm / metrics.cap;
    return {
      W: Math.round(metrics.inkW * emCm + 2 * marginCm),
      H: Math.round(metrics.inkH * emCm + 2 * marginCm),
      emCm
    };
  }

  function ceilTo(n, step) { return Math.ceil(n / step - 1e-9) * step; }
  function isPositive(n) { return Number.isFinite(n) && n > 0; }
  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function priceFor(dims, opts, rules) {
    if (!dims || !isPositive(dims.W) || !isPositive(dims.H)) return { quote: true, reason: 'no-dimensions' };
    if (!hasOwn(rules.backing, opts.backing)) throw new Error('unknown backing: ' + opts.backing);
    if (!hasOwn(rules.finish, opts.finish)) throw new Error('unknown finish: ' + opts.finish);
    if (dims.W > rules.maxWidthCm) return { quote: true, reason: 'too-wide' };
    let base = rules.base + dims.W * rules.perCmWidth + dims.H * rules.perCmHeight;
    if (opts.rgb) base *= rules.rgbMultiplier;
    if (opts.tube != null && rules.tube && hasOwn(rules.tube, String(opts.tube))) base *= rules.tube[String(opts.tube)];
    const adds = rules.backing[opts.backing] + rules.finish[opts.finish];
    const total = Math.max(rules.minPrice, ceilTo(ceilTo(base, rules.step) + adds, rules.step));
    if (!Number.isFinite(total)) throw new Error('invalid pricing rules: total is ' + total);
    if (total > rules.maxPrice) return { quote: true, reason: 'over-max', total };
    return { quote: false, total };
  }

  function pricePointFor(total, rules) {
    if (!Number.isFinite(total) || total < rules.minPrice || total > rules.maxPrice || total % rules.step !== 0) return null;
    return { price: total, key: 'p-' + String(total).padStart(4, '0') };
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function isWorkingDay(d, holidays) {
    const day = d.getDay();
    return day !== 0 && day !== 6 && !holidays.includes(isoDate(d));
  }

  function addWorkingDays(from, n, holidays) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    let left = n;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (isWorkingDay(d, holidays)) left--;
    }
    return d;
  }

  function deliveryWindow(orderedAt, rules, holidays) {
    const late = orderedAt.getHours() >= rules.cutoffHour || !isWorkingDay(orderedAt, holidays);
    const extra = late ? 1 : 0;
    return {
      from: addWorkingDays(orderedAt, rules.minDays + extra, holidays),
      to: addWorkingDays(orderedAt, rules.maxDays + extra, holidays)
    };
  }

  function postcodeStatus(raw, rules) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
    if (!POSTCODE.test(s)) return 'invalid';
    const outward = s.slice(0, -3);
    const area = outward.match(/^[A-Z]+/)[0];
    const district = parseInt(outward.slice(area.length), 10);
    for (const entry of rules.excludedPostcodes) {
      const m = entry.match(/^([A-Z]{1,2})(?:(\d+)(?:-(\d+))?)?$/);
      if (!m || m[1] !== area) continue;
      if (m[2] === undefined) return 'excluded';
      const lo = Number(m[2]);
      const hi = m[3] !== undefined ? Number(m[3]) : lo;
      if (district >= lo && district <= hi) return 'excluded';
    }
    return 'ok';
  }

  return { normaliseText, unsupportedChars, dimsFor, priceFor, pricePointFor, isoDate, addWorkingDays, deliveryWindow, postcodeStatus };
});

export default globalThis.LitNeonCore;
