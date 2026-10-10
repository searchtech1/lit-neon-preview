/* Lit Neon v2 — money and measurement formatting (brief Appendix C: "£240" never "£240.00" unless pence matter;
   dates as "Wed 21 Oct"; UK English; tabular numbers are the CSS's job). Pure, Node-safe. */

const LOCALE = 'en-GB';

/** £ amount: whole pounds without pence, otherwise two decimals. gbp(240) → "£240", gbp(192.5) → "£192.50" */
export function gbp(n) {
  if (n == null || !Number.isFinite(+n)) return '—';
  const v = round2(+n);
  const neg = v < 0 ? '−' : '';
  const a = Math.abs(v);
  return neg + '£' + (Number.isInteger(a) ? a.toLocaleString(LOCALE) : a.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
/** £ amount always with pence (BNPL instalments, checkout rows) */
export function gbp2(n) {
  if (n == null || !Number.isFinite(+n)) return '—';
  const v = round2(+n), neg = v < 0 ? '−' : '';
  return neg + '£' + Math.abs(v).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** pence string for sub-£1 amounts: pence(24.5) → "24.5p", pence(100) → "£1" */
export function pence(p) {
  if (p == null || !Number.isFinite(+p)) return '—';
  if (+p >= 100) return gbp(+p / 100);
  const v = Math.round(+p * 10) / 10;
  return (Number.isInteger(v) ? v : v.toFixed(1)) + 'p';
}
export function round2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
/** the price after a percentage discount, rounded to the penny the way Shopify rounds */
export function percentOff(amount, pct) { return round2(+amount * (1 - (+pct || 0) / 100)); }
export function discountAmount(amount, pct) { return round2(+amount - percentOff(amount, pct)); }

/* ---------- dates ---------- */
const DAY = { weekday: 'short', day: 'numeric', month: 'short' };
/** "Wed 21 Oct" */
export function fmtDay(d) { return toDate(d).toLocaleDateString(LOCALE, DAY); }
/** "Wed 21 Oct 2026" */
export function fmtDayYear(d) { return toDate(d).toLocaleDateString(LOCALE, { ...DAY, year: 'numeric' }); }
/** "21 Oct 2026" (title blocks) */
export function fmtDate(d) { return toDate(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }); }
/** "Mon 2 to Thu 5 Nov" / "Fri 30 Oct to Wed 4 Nov" */
export function fmtRange(from, to) {
  const a = toDate(from), b = toDate(to);
  const short = { weekday: 'short', day: 'numeric' };
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.toLocaleDateString(LOCALE, short)} to ${b.toLocaleDateString(LOCALE, DAY)}`
    : `${a.toLocaleDateString(LOCALE, DAY)} to ${b.toLocaleDateString(LOCALE, DAY)}`;
}
/** "14:00" */
export function fmtHour(h) { return String(h).padStart(2, '0') + ':00'; }
export function isoDate(d) { const x = toDate(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
export function addDays(d, n) { const x = toDate(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n); }
function toDate(d) { return d instanceof Date ? d : new Date(d); }

/* ---------- measurements ---------- */
export const cmToIn = cm => Math.round(cm / 2.54);
export const inToCm = i => Math.round(i * 2.54);
/** "94 × 29 cm" or "37 × 11 in" */
export function fmtDims(W, H, unit = 'cm') {
  if (!(W > 0) || !(H > 0)) return '—';
  return unit === 'in' ? `${cmToIn(W)} × ${cmToIn(H)} in` : `${Math.round(W)} × ${Math.round(H)} cm`;
}
/** "94 cm" / "37 in" */
export function fmtLen(cm, unit = 'cm') { return unit === 'in' ? `${cmToIn(cm)} in` : `${Math.round(cm)} cm`; }
/** "94 by 29 centimetres" (aria-valuetext, accessible names) */
export function sayDims(W, H) { return `${Math.round(W)} by ${Math.round(H)} centimetres`; }
/** "3.2 m" */
export function fmtMetres(m) { return `${(Math.round(m * 10) / 10).toFixed(1)} m`; }
/** "+£40" / "Included" / "−£10" */
export function fmtDelta(n, includedWord = 'Included') {
  if (!n) return includedWord;
  return (n > 0 ? '+' : '−') + gbp(Math.abs(n));
}
/** small mustache: tpl("£{a} from {b}", {a: 1, b: 'x'}) */
export function tpl(str, vars) { return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : '')); }
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
