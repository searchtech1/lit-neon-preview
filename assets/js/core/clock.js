/* core/clock.js — the only clock on the site (brief §0.3). No module reads Date.now() or new Date() directly.
   In review mode `?now=<ISO>` pins the clock (persisted in sessionStorage.now); in customer mode it is ignored.
   Review mode = sessionStorage.review === '1' (set by boot.js / facts.js from ?review=1). */

const KEY = 'now';
let override = null;   // ms offset-free fixed instant when pinned
let frozen = false;

function reviewMode() {
  try { return sessionStorage.getItem('review') === '1'; } catch { return false; }
}

function readParam() {
  try {
    const q = new URLSearchParams(location.search).get('now');
    if (q) { const d = new Date(q); if (!Number.isNaN(d.getTime())) return d; }
  } catch {}
  return null;
}

function init() {
  if (!reviewMode()) { override = null; return; }
  const p = readParam();
  if (p) { override = p; try { sessionStorage.setItem(KEY, p.toISOString()); } catch {} return; }
  try { const s = sessionStorage.getItem(KEY); if (s) { const d = new Date(s); if (!Number.isNaN(d.getTime())) override = d; } } catch {}
}
init();

/** Current instant (Date). Pinned in review mode when ?now= / sessionStorage.now is set. */
export function now() {
  if (override) return new Date(override.getTime());
  return new Date();
}
/** Review-only: pin the clock programmatically (QA). Returns true when applied. */
export function set(iso) {
  if (!reviewMode()) return false;
  const d = iso == null ? null : new Date(iso);
  if (d && Number.isNaN(d.getTime())) return false;
  override = d; frozen = !!d;
  try { d ? sessionStorage.setItem(KEY, d.toISOString()) : sessionStorage.removeItem(KEY); } catch {}
  return true;
}
export function pinned() { return !!override; }
export function isReview() { return reviewMode(); }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 21 Oct" (Appendix C). style: 'short' (default) | 'long' ("Wednesday 21 October 2026") | 'iso' */
export function format(d, style = 'short') {
  d = d instanceof Date ? d : new Date(d);
  if (style === 'iso') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (style === 'long') {
    const long = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lm = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${long[d.getDay()]} ${d.getDate()} ${lm[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
/** true when `d` (Date or ISO) is between a and b inclusive, at day resolution. */
export function between(d, a, b) {
  const t = startOfDay(d instanceof Date ? d : new Date(d)).getTime();
  const lo = a ? startOfDay(new Date(a)).getTime() : -Infinity;
  const hi = b ? startOfDay(new Date(b)).getTime() : Infinity;
  return t >= lo && t <= hi;
}
/** Seasonal window check by month numbers (1–12), inclusive, e.g. inSeason(9, 12) for Sep–Dec. */
export function inSeason(fromMonth, toMonth, d = now()) {
  const m = d.getMonth() + 1;
  return fromMonth <= toMonth ? (m >= fromMonth && m <= toMonth) : (m >= fromMonth || m <= toMonth);
}

export const clock = { now, set, pinned, isReview, format, addDays, startOfDay, between, inSeason };
export default clock;
