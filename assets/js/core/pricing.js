/* Lit Neon v2 — pricing (brief §3.7a, §4.2, §6.2). A thin wrapper over neon-core + the generated rules:
   everyday(state) · payable(state) · promoLive() · promoLine(everyday) · fromPrice(design) · bands() · photo(ledMetres, heightCm, opts)
   · breakdown(state) · sizeCards(state) · verdict(state, scene) · deliveryLine(postcode) · needBy(date, postcode)
   · describeExclusions() · formatPostcode(raw) · price(state) (the full price state) · quoteReason(state)
   Owner answers applied: D1 one honest price (payable everywhere, everyday named as a commitment, discount row only on
   checkout); D5 two-colour signs priced flat +rules.multicolourDelta per extra distinct colour; D6 no express.
   Every number comes from the rules, the facts registry or clock.now(); nothing here is a typed price or date.
   createPricing(deps) builds an isolated instance (tests inject resolve/facts/clock); the default instance is wired to
   the vendored engines, renderer.resolve, core/clock.js and core/facts.js (optional: missing = every fact unconfirmed). */
import 'neon-core';
import 'rules';
import { resolve as resolveDesign, OPTIONS, sizeOf, colourOf, fontOf, enabledFonts } from './renderer.js';
import * as clockMod from './clock.js';
import { gbp, round2, percentOff, fmtDay, fmtRange, fmtHour, tpl, cmToIn, addDays } from './money.js';

const core = globalThis.LitNeonCore, RULES = globalThis.LIT_RULES;

/** every real UK (plus Crown dependency) postcode area — a well-formed outward code outside this list ("ZZ99 9ZZ") is
    not a place we can promise anything to (round-2 review). Mirrors the keys of data/postcode-areas.json `areas`
    (tests/pricing.test.js asserts they stay equal). */
export const POSTCODE_AREAS = new Set(('AB AL B BA BB BD BF BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA DD DE DG DH DL DN DT DY ' +
  'E EC EH EN EX FK FY G GL GU GY HA HD HG HP HR HS HU HX IG IM IP IV JE KA KT KW KY L LA LD LE LL LN LS LU M ME MK ML N NE ' +
  'NG NN NP NR NW OL OX PA PE PH PL PO PR RG RH RM S SA SE SG SK SL SM SN SO SP SR SS ST SW SY TA TD TF TN TQ TR TS TW UB W ' +
  'WA WC WD WF WN WR WS WV YO ZE').split(' '));

/* optional foundation peers (WS0-A). Absent at import → every fact unconfirmed, default copy templates. */
let factsPeer = null, copyPeer = null;
try { const m = await import('./facts.js'); factsPeer = m.default && typeof m.default.get === 'function' ? m.default : m; } catch { factsPeer = null; }
try { const m = await import('./copy.js'); copyPeer = m.default && typeof m.default.get === 'function' ? m.default : (typeof m.get === 'function' ? m : null); } catch { copyPeer = null; }

/** adapter over whatever shape facts.js exports: get(key) → the RAW confirmed value (facts.value(); never the display
    copy — facts.get('promoPct') is the customerCopy "20%", which is not a number), has(key) → confirmed.
    Falls back to peer.get() only for a peer that has no value() (older test doubles). */
export function factsAdapter(peer) {
  const unwrap = v => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) ? v.value : v;
  return {
    has: k => { try { return !!(peer && typeof peer.has === 'function' && peer.has(k)); } catch { return false; } },
    get: k => {
      try {
        if (!peer) return undefined;
        if (typeof peer.value === 'function') return unwrap(peer.value(k));
        return typeof peer.get === 'function' ? unwrap(peer.get(k)) : undefined;
      } catch { return undefined; }
    }
  };
}
const COPY_DEFAULTS = {
  'promo.line': 'Launch price · everyday {everyday} from {date}',
  'promo.everydayNote': 'Everyday price {everyday} from {date}',
  'promo.discountRow': 'Launch price (−{pct}%)',
  'delivery.fallback': 'Usually arrives {min}–{max} working days after you approve your drawing.',
  'delivery.firm': 'Arrives {from} if you approve your proof by {approveBy} {cutoff}',
  'delivery.excluded': "We can't deliver to {place} yet",
  'delivery.invalid': 'Try the format SW1A 1AA',
  'delivery.unknown': "We don't recognise {postcode} — check the postcode and try again",
  'delivery.free': 'Free delivery to {postcode}',
  'needby.yes': 'Yes, if you approve your drawing by {date}',
  'needby.tight': "That's tight — approve by {date} and we'll try",
  'needby.no': 'Not by standard making',
  'quote.outdoor': 'Indoor price {price} · outdoor quoted',
  'quote.outdoorOnly': 'Outdoor signs are quoted',
  'quote.wide': 'Over 2 m · quoted by a designer',
  'quote.max': 'Over {max} · quoted by a designer',
  'exclusions.text': 'We deliver free across mainland GB. We can’t reach {list} yet — message us and we’ll see what’s possible.'
};
const copyGet = (key, vars) => {
  let s;
  try { s = copyPeer ? copyPeer.get(key) : undefined; } catch { s = undefined; }
  if (typeof s !== 'string' || !s) s = COPY_DEFAULTS[key] || '';
  return tpl(s, vars);
};

export function createPricing({ core: C = core, rules = RULES, resolve = resolveDesign, facts = factsAdapter(factsPeer), clock = clockMod, scenes = null, areas = null, copy = copyGet } = {}) {
  const P = () => rules.pricing, D = () => rules.delivery;
  const F = facts;
  let sceneList = scenes, areaNames = areas;

  /* ---------- promo (§3.7a) ---------- */
  function promoPct() { const raw = F.has('promoPct') ? F.get('promoPct') : NaN; const v = typeof raw === 'string' ? parseFloat(raw) : +raw; return Number.isFinite(v) && v > 0 && v < 100 ? v : 0; }
  function promoDates() {
    if (!F.has('promoStart') || !F.has('promoEnd')) return null;
    const a = new Date(F.get('promoStart')), b = new Date(F.get('promoEnd'));
    if (isNaN(a) || isNaN(b)) return null;
    return { start: a, end: new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59, 59, 999) };
  }
  /** true only while both dates are confirmed and clock.now() is inside them */
  function promoLive() { const w = promoDates(); if (!w || !promoPct()) return false; const t = clock.now().getTime(); return t >= w.start.getTime() && t <= w.end.getTime(); }
  /** the day everyday prices return (promoEnd + 1), or null */
  function promoEndsAfter() { const w = promoDates(); return w ? addDays(w.end, 1) : null; }
  function payableFrom(everyday) { return everyday == null ? null : (promoLive() ? percentOff(everyday, promoPct()) : everyday); }
  /** the one templated promo line (copy.promo.line), or null when the promo is not live */
  function promoLine(everyday) { if (!promoLive() || everyday == null) return null; return copy('promo.line', { everyday: gbp(everyday), date: fmtDay(promoEndsAfter()) }); }
  function discountRowLabel() { return copy('promo.discountRow', { pct: promoPct() }); }

  /* ---------- the core price ---------- */
  const distinctCount = res => res.distinctColours.length;
  function multicolourExtra(res) { const n = distinctCount(res); const delta = Number.isFinite(+P().multicolourDelta) ? +P().multicolourDelta : 0; return n > 1 && !res.rgb ? (n - 1) * delta : 0; }
  /** the full price state for a design. kind: price | quote | empty | bad | wait */
  function price(state, opts = {}) {
    const res = opts.res || resolve(state, opts);
    if (!res.hasText) return { kind: 'empty', res };
    if (res.bad.length) return { kind: 'bad', bad: res.bad, res };
    if (!res.dimsReady) return { kind: 'wait', res };
    const d = res.dimsReady;
    if (d.W > P().maxWidthCm) return { kind: 'quote', reason: 'too-wide', res, dims: d };
    const r = C.priceFor(d, { backing: res.state.backing, finish: res.state.board, rgb: res.rgb }, P());
    if (r.quote) return { kind: 'quote', reason: r.reason, res, dims: d, total: r.total };
    let everyday = r.total + multicolourExtra(res);
    if (everyday > P().maxPrice) return { kind: 'quote', reason: 'over-max', res, dims: d, total: everyday };
    const minOk = sizeAvailable(res);
    if (!minOk.ok) return { kind: 'quote', reason: 'too-small', note: minOk.reason, res, dims: d, total: everyday };
    if (res.state.use === 'out') return { kind: 'quote', reason: 'outdoor', res, dims: d, indoor: everyday, total: everyday };
    const pay = payableFrom(everyday);
    return { kind: 'price', everyday, payable: pay, promo: promoLive(), promoLine: promoLine(everyday), res, dims: d, discount: round2(everyday - pay) };
  }
  /** the £5-step rules price, or null when the design is a quote / not ready */
  function everyday(state) { const p = price(state); return p.kind === 'price' ? p.everyday : null; }
  /** everyday × (1 − promoPct/100) while promoLive(), else everyday; null when not priceable */
  function payable(state) { const p = price(state); return p.kind === 'price' ? p.payable : null; }
  /** the letter height of the chosen size is below the face's minimum? */
  function sizeAvailable(res) {
    const min = res.font.minLetterCm || 0;
    return res.letterCm >= min ? { ok: true } : { ok: false, reason: `Thin at this size — ${res.font.name} needs letters of at least ${min} cm`, minLetterCm: min };
  }
  /** one-line reason for a quote state, for the dock */
  function quoteReason(p) {
    if (!p || p.kind !== 'quote') return '';
    if (p.reason === 'outdoor') return p.indoor != null ? copy('quote.outdoor', { price: gbp(payableFrom(p.indoor)) }) : copy('quote.outdoorOnly');
    if (p.reason === 'too-wide') return copy('quote.wide');
    if (p.reason === 'over-max') return copy('quote.max', { max: gbp(P().maxPrice) });
    if (p.reason === 'too-small') return p.note || '';
    return 'Quoted by a designer';
  }

  /* ---------- breakdown (dock sheet, review step) ---------- */
  function breakdown(state) {
    const p = price(state); const res = p.res;
    if (p.kind !== 'price' && p.kind !== 'quote') return { kind: p.kind, rows: [], total: null, everyday: null, payable: null, promo: false };
    const d = p.dims, rules = P();
    const base = C.priceFor(d, { backing: 'cut', finish: 'clear', rgb: false }, rules);
    const withRgb = C.priceFor(d, { backing: 'cut', finish: 'clear', rgb: res.rgb }, rules);
    const rows = [];
    const baseTotal = base.quote ? null : base.total;
    rows.push({ id: 'base', label: `Words × ${res.font.name} × ${res.sizeId === 'custom' ? `${res.letterCm} cm letters` : sizeOf(res.sizeId).name}`, step: 'words', amount: baseTotal, sub: `${d.W} × ${d.H} cm` });
    if (res.icon) rows.push({ id: 'symbol', label: `Symbol · ${res.icon}`, step: 'words', amount: symbolDelta(state), sub: `adds ${symbolHeightDelta(state)} cm` });
    if (res.rgb && baseTotal != null && !withRgb.quote) rows.push({ id: 'rgb', label: 'Colour changing (RGB)', step: 'colour', amount: round2(withRgb.total - baseTotal) });
    if (multicolourExtra(res)) rows.push({ id: 'colours', label: `${distinctCount(res)} colours`, step: 'colour', amount: multicolourExtra(res) });
    rows.push({ id: 'backing', label: res.backing.name, step: 'backing', amount: rules.backing[res.state.backing] || 0 });
    rows.push({ id: 'finish', label: `${res.finish.name} acrylic`, step: 'backing', amount: rules.finish[res.state.board] || 0 });
    const total = p.kind === 'price' ? p.payable : null;
    return { kind: p.kind, rows, everyday: p.kind === 'price' ? p.everyday : (p.total ?? null), payable: total, total, promo: promoLive(), promoNote: promoLive() && p.kind === 'price' ? copy('promo.everydayNote', { everyday: gbp(p.everyday), date: fmtDay(promoEndsAfter()) }) : null, reason: quoteReason(p) };
  }
  /** £ a symbol adds to this design (difference between with and without) — "+£40" */
  function symbolDelta(state, icon = state.icon) {
    const withIcon = price({ ...state, icon }), without = price({ ...state, icon: '' });
    if (withIcon.kind !== 'price' || without.kind !== 'price') return null;
    return round2(withIcon.everyday - without.everyday);
  }
  function symbolHeightDelta(state, icon = state.icon) {
    const a = resolve({ ...state, icon }), b = resolve({ ...state, icon: '' });
    return a.dims && b.dims ? Math.max(0, a.dims.H - b.dims.H) : 0;
  }
  /** per-option deltas for a step, relative to the current state: deltas('backing') → {cut: 0, rect: 0, stand: +20} (payable) */
  function deltas(state, key, ids) {
    const cur = price(state); const out = {};
    for (const id of ids) { const p = price({ ...state, [key]: id }); out[id] = (p.kind === 'price' && cur.kind === 'price') ? round2(p.payable - cur.payable) : (p.kind === 'quote' ? 'quote' : null); }
    return out;
  }

  /* ---------- sizes (§4.2 step 4) ---------- */
  function sizeCards(state, scene) {
    const cards = OPTIONS.sizes.map(s => {
      const res = resolve(state, { sizeId: s.id }); const p = price({ ...state, size: s.id }, { res });
      const d = res.dims || { W: 0, H: 0 };
      return { id: s.id, name: s.name, letterCm: s.letterCm, W: d.W, H: d.H, inches: [cmToIn(d.W), cmToIn(d.H)], kind: p.kind, everyday: p.kind === 'price' ? p.everyday : null,
        payable: p.kind === 'price' ? p.payable : null, promoLine: p.kind === 'price' ? p.promoLine : null, quote: p.kind === 'quote', reason: p.kind === 'quote' ? quoteReason(p) : '',
        available: !(p.kind === 'quote' && p.reason === 'too-small'), tooWide: p.kind === 'quote' && p.reason === 'too-wide', verdict: verdict({ ...state, size: s.id }, scene), selected: state.size === s.id };
    });
    const st = resolve(state).state;
    if (st.custom) { const res = resolve({ ...state, size: 'custom' }); const p = price({ ...state, size: 'custom' }, { res }); const d = res.dims || { W: 0, H: 0 };
      cards.push({ id: 'custom', name: 'Custom', letterCm: st.custom.letterCm, W: d.W, H: d.H, inches: [cmToIn(d.W), cmToIn(d.H)], kind: p.kind, everyday: p.kind === 'price' ? p.everyday : null, payable: p.kind === 'price' ? p.payable : null, promoLine: p.kind === 'price' ? p.promoLine : null, quote: p.kind === 'quote', reason: quoteReason(p), available: true, tooWide: p.kind === 'quote' && p.reason === 'too-wide', verdict: verdict({ ...state, size: 'custom' }, scene), selected: state.size === 'custom' }); }
    return cards;
  }
  /** the letter height that gives a target overall width (custom slider: width 20–200 cm → letterCm) */
  function letterCmForWidth(state, widthCm) {
    const res = resolve(state, { sizeId: 'm' }); if (!res.dims) return null;
    const margin = res.backing.margin, inkW = res.m.inkW, cap = res.m.cap;
    const emCm = Math.max(0, (widthCm - 2 * margin)) / inkW; return Math.max(2, Math.round(emCm * cap * 2) / 2);
  }

  /* ---------- verdicts from the scene calibration (§4.2 step 4) ---------- */
  function setScenes(list) { sceneList = list; }
  function sceneOf(s) { if (!s) return null; if (typeof s === 'object') return s; return (sceneList || []).find(x => x.id === s) || null; }
  function verdict(state, scene) {
    const sc = sceneOf(scene); const res = resolve(state); if (!res.dims) return '';
    if (!sc || !sc.calib || !sc.calib.cm) return res.dims.W >= 150 ? 'Fills a feature wall' : res.dims.W >= 90 ? 'Reads across a room' : 'A neat accent';
    const r = res.dims.W / sc.calib.cm, obj = sc.calib.object || 'wall';
    if (r < .35) return `A neat accent above the ${obj}`;
    if (r < .7) return `Fits nicely above the ${obj}`;
    if (r < 1.05) return `Spans the ${obj}`;
    return 'Fills a feature wall';
  }

  /* ---------- from-prices and bands (§3.7a: never typed) ---------- */
  /** the payable from-price of a catalogue design at Small, cut-to-shape clear — null until its face is loaded */
  function fromPrice(design, { size = 's' } = {}) {
    const st = designState(design, size); const p = price(st);
    return p.kind === 'price' ? p.payable : null;
  }
  function fromPriceDetail(design, opts) { const p = price(designState(design, (opts && opts.size) || 's')); return p.kind === 'price' ? { everyday: p.everyday, payable: p.payable, promoLine: p.promoLine } : { quote: p.kind === 'quote', kind: p.kind }; }
  function designState(design, size) {
    if (design && typeof design.text === 'string') return { ...design, size: design.size || size };
    const d = design || {};
    return { text: (d.lines || []).join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', size, backing: 'cut', board: 'clear', align: 'center', jacket: 'white', use: 'in', hang: 'screws' };
  }
  /** a reference design ("Open late", Soho) at every size: [{ size, name, letterCm, from (payable), everyday, W, H }] */
  function bands(reference = { text: 'Open late', font: 'shoreditch', colour: 'warm' }) {
    return OPTIONS.sizes.map(s => { const st = designState(reference, s.id); const p = price({ ...st, size: s.id }); const res = p.res;
      return { size: s.id, name: s.name, letterCm: s.letterCm, from: p.kind === 'price' ? p.payable : null, everyday: p.kind === 'price' ? p.everyday : null, W: res.dims ? res.dims.W : null, H: res.dims ? res.dims.H : null, quote: p.kind === 'quote' }; });
  }
  /** the cheapest payable price in the catalogue at Small — "Signs from £X" */
  function fromPriceAll(designs) { const vals = (designs || []).map(d => fromPrice(d)).filter(v => v != null); return vals.length ? Math.min(...vals) : null; }

  /* ---------- photo path (§4.3 D9): indicative price from the engine's LED metres ---------- */
  const PHOTO_WIDTH_CM_PER_METRE = 32; /* a logo's tube path is ~3.2 m per metre of width; confirmed in the mockup */
  function photo(ledMetres, heightCm, options = {}) {
    const W = Math.max(20, Math.round(ledMetres * PHOTO_WIDTH_CM_PER_METRE)), H = Math.max(10, Math.round(heightCm || W * .45));
    const r = C.priceFor({ W, H }, { backing: options.backing || 'cut', finish: options.finish || options.board || 'clear', rgb: !!options.rgb }, P());
    if (r.quote) return { kind: 'quote', reason: r.reason, W, H };
    return { kind: 'price', everyday: r.total, payable: payableFrom(r.total), promoLine: promoLine(r.total), W, H, indicative: true };
  }

  /* ---------- delivery (§3.9.2 fallbacks; never a date unless leadTimeFrom is confirmed) ---------- */
  /** the outward code's letters are a real postcode area? (format already checked) */
  const knownArea = raw => POSTCODE_AREAS.has(areaOf(raw));
  function formatPostcode(raw) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
    if (C.postcodeStatus(s, D()) === 'invalid' || !knownArea(s)) return null;
    return s.slice(0, -3) + ' ' + s.slice(-3);
  }
  /** empty | invalid (bad format OR an area that does not exist) | excluded | ok */
  function postcodeStatus(raw) {
    if (!raw || !String(raw).trim()) return 'empty';
    const st = C.postcodeStatus(raw, D());
    return st !== 'invalid' && !knownArea(raw) ? 'invalid' : st;
  }
  function areaOf(raw) { const m = String(raw || '').toUpperCase().replace(/\s+/g, '').match(/^[A-Z]{1,2}/); return m ? m[0] : ''; }
  /** the outward code ("PA20") of a well-formed postcode */
  function districtOf(raw) { const s = String(raw || '').toUpperCase().replace(/\s+/g, ''); return s.length > 3 ? s.slice(0, -3) : s; }
  /** the excluded place a postcode falls in, by DISTRICT: { district, place, label } — label "Bute (PA20)", "Northern
      Ireland (BT1)"; without the names file it is just the district ("PA20 postcodes"), never the whole area */
  function excludedPlace(raw) {
    const district = districtOf(raw); const area = areaOf(raw); const num = parseInt(district.slice(area.length), 10);
    const A = areaNames || {};
    const groups = (A.exclusionGroups || []).concat(A.otherExclusionGroups || []);
    for (const g of groups) for (const e of (g.entries || [])) {
      const m = String(e.code).match(/^([A-Z]{1,2})(?:(\d+)(?:-(\d+))?)?$/); if (!m || m[1] !== area) continue;
      if (m[2] == null || (num >= +m[2] && num <= (m[3] != null ? +m[3] : +m[2]))) { const short = String(e.place).replace(/\s*\([^)]*\)\s*/g, ' ').trim(); return { district, place: e.place, group: g.name, label: `${short} (${district})` }; }
    }
    return { district, place: null, group: null, label: `${district} postcodes` };
  }
  /** working-day window from an approval instant, per the rules' cutoff and bank holidays */
  function windowFrom(approvedAt = clock.now()) { const d = D(); return C.deliveryWindow(approvedAt, d, d.bankHolidays || []); }
  function nextApprovalSlot(from = clock.now()) {
    /* the latest instant that still counts as "today" for the window: before the cutoff on a working day */
    const d = D(); const t = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const isWd = x => x.getDay() !== 0 && x.getDay() !== 6 && !(d.bankHolidays || []).includes(isoKey(x));
    let day = t; if (from.getHours() >= d.cutoffHour || !isWd(day)) { do { day = addDays(day, 1); } while (!isWd(day)); }
    return day;
  }
  const isoKey = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  /** { status, formatted, area, text, firm, from, to, approveBy, cutoff, free } for a postcode (or '' for none) */
  function deliveryLine(postcode) {
    const d = D(); const status = postcodeStatus(postcode); const formatted = status === 'ok' || status === 'excluded' ? formatPostcode(postcode) : null;
    const firm = F.has('leadTimeFrom');
    const w = windowFrom(); const slot = nextApprovalSlot();
    const dates = firm ? { from: w.from, to: w.to, approveBy: slot, cutoff: fmtHour(d.cutoffHour), range: fmtRange(w.from, w.to) } : null;
    const base = firm ? copy('delivery.firm', { from: fmtRange(w.from, w.to), approveBy: fmtDay(slot), cutoff: fmtHour(d.cutoffHour) }) : copy('delivery.fallback', { min: d.minDays, max: d.maxDays });
    if (status === 'empty') return { status, formatted: null, area: '', text: base, firm, ...(dates || {}), free: true };
    if (status === 'invalid') {
      /* well-formed but not a real area (ZZ99 9ZZ): say so — never a delivery promise, never "try the format" */
      const unknown = C.postcodeStatus(postcode, d) !== 'invalid';
      const shown = String(postcode).toUpperCase().replace(/\s+/g, ''); const pretty = shown.slice(0, -3) + ' ' + shown.slice(-3);
      return { status, reason: unknown ? 'unknown-area' : 'format', formatted: null, area: areaOf(postcode), text: unknown ? copy('delivery.unknown', { postcode: pretty }) : copy('delivery.invalid'), firm, free: false };
    }
    if (status === 'excluded') { const ex = excludedPlace(postcode); return { status, formatted, area: areaOf(postcode), district: ex.district, place: ex.label, text: copy('delivery.excluded', { place: ex.label, area: ex.district, district: ex.district }), firm, free: false, exclusions: describeExclusions() }; }
    return { status, formatted, area: areaOf(postcode), text: `${copy('delivery.free', { postcode: formatted })} · ${base}`, prefix: copy('delivery.free', { postcode: formatted }), line: base, firm, ...(dates || {}), free: true };
  }
  /** "Need it by?" — { kind: yes | tight | no, approveBy, text, window } */
  function needBy(date, postcode) {
    const d = D(); const need = new Date(date); if (isNaN(need)) return { kind: 'invalid', text: 'Pick a date' };
    const needDay = new Date(need.getFullYear(), need.getMonth(), need.getDate());
    const status = postcodeStatus(postcode); if (status === 'excluded') { const ex = excludedPlace(postcode); return { kind: 'excluded', text: copy('delivery.excluded', { place: ex.label, area: ex.district, district: ex.district }) }; }
    const today = nextApprovalSlot(clock.now());
    const hols = d.bankHolidays || [];
    const latest = (days) => { /* latest approval working day whose window end ≤ need */
      let day = needDay, guard = 0; while (guard++ < 120) { const probe = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9); const to = C.addWorkingDays(probe, days, hols); if (to.getTime() <= needDay.getTime() && isWorking(probe, hols)) return day; day = addDays(day, -1); } return null; };
    const byMax = latest(d.maxDays), byMin = latest(d.minDays);
    if (byMax && byMax.getTime() >= today.getTime()) return { kind: 'yes', approveBy: byMax, text: copy('needby.yes', { date: fmtDay(byMax) }) };
    if (byMin && byMin.getTime() >= today.getTime()) return { kind: 'tight', approveBy: byMin, text: copy('needby.tight', { date: fmtDay(byMin) }) };
    return { kind: 'no', approveBy: null, text: copy('needby.no'), rush: true };
  }
  const isWorking = (x, hols) => x.getDay() !== 0 && x.getDay() !== 6 && !hols.includes(isoKey(x));

  /* ---------- exclusions in plain English — always equal to the rules (data/postcode-areas.json names them) ---------- */
  let areasPromise = null;
  function setAreas(json) { areaNames = json; }
  /** load /lit-neon-preview/data/postcode-areas.json once (browser); tests pass `areas` into createPricing instead */
  function loadAreas() { if (areaNames) return Promise.resolve(areaNames); if (!areasPromise && typeof fetch === 'function') areasPromise = fetch('/lit-neon-preview/data/postcode-areas.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j) areaNames = j; return areaNames; }).catch(() => null); return areasPromise || Promise.resolve(null); }
  const joinList = arr => arr.length > 1 ? arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1] : (arr[0] || '');
  const codeCovers = (ruleCode, code) => { if (ruleCode === code) return true; const a = ruleCode.match(/^([A-Z]{1,2})(\d+)?(?:-(\d+))?$/), b = code.match(/^([A-Z]{1,2})(\d+)?(?:-(\d+))?$/); if (!a || !b || a[1] !== b[1]) return false; if (a[2] == null) return true; if (b[2] == null) return false; const alo = +a[2], ahi = a[3] != null ? +a[3] : alo, blo = +b[2], bhi = b[3] != null ? +b[3] : blo; return blo >= alo && bhi <= ahi; };
  /** { codes, groups, short, text, long, unnamed } — short = group names the rules exclude ("Northern Ireland, the Scottish islands … and the Isle of Man") */
  function describeExclusions() {
    const codes = (D().excludedPostcodes || []).slice(); const A = areaNames || {};
    const allGroups = (A.exclusionGroups || []).concat(A.otherExclusionGroups || []);
    const excluded = code => codes.some(rc => codeCovers(rc, code));
    const groups = allGroups.map(g => ({ id: g.id, name: g.name, ownerListed: g.ownerListed !== false, entries: (g.entries || []).filter(e => excluded(e.code)) })).filter(g => g.entries.length);
    const named = new Set(groups.flatMap(g => g.entries.map(e => e.code)));
    const unnamed = codes.filter(c => !groups.some(g => g.entries.some(e => codeCovers(c, e.code) || codeCovers(e.code, c))));
    const ownerGroups = groups.filter(g => g.ownerListed); /* the short form names only the owner-listed groups (D11); BFPO etc. appear in the long form */
    const names = ownerGroups.length ? ownerGroups.map(g => g.name) : (groups.length ? groups.map(g => g.name) : codes);
    const short = joinList(names);
    const long = groups.map(g => `${g.name}: ${g.entries.map(e => `${e.place} (${e.code})`).join(', ')}`).concat(unnamed.length ? [`Also: ${unnamed.join(', ')}`] : []);
    const entries = codes.map(code => { const g = groups.find(x => x.entries.some(e => codeCovers(code, e.code) || codeCovers(e.code, code))); const e = g && g.entries.find(e => codeCovers(code, e.code) || codeCovers(e.code, code)); return { code, area: (code.match(/^[A-Z]{1,2}/) || [code])[0], name: e ? e.place : (g ? g.name : code), group: g ? g.name : null }; });
    return { codes, groups, names, short, long, unnamed, entries, text: copy('exclusions.text', { list: short }), loaded: !!areaNames };
  }
  if (typeof window !== 'undefined' && !areas) loadAreas();

  return { price, everyday, payable, promoLive, promoPct, promoLine, promoEndsAfter, discountRowLabel, payableFrom, breakdown, deltas, symbolDelta, symbolHeightDelta,
    sizeCards, sizeAvailable, letterCmForWidth, verdict, setScenes, fromPrice, fromPriceDetail, fromPriceAll, bands, photo, deliveryLine, needBy, windowFrom, nextApprovalSlot,
    describeExclusions, setAreas, loadAreas, formatPostcode, postcodeStatus, quoteReason, rules: () => rules, facts: F, limits: () => ({ min: P().minPrice, max: P().maxPrice, step: P().step, maxWidthCm: P().maxWidthCm }) };
}

const pricing = createPricing();
export default pricing;
export const { price, everyday, payable, promoLive, promoPct, promoLine, promoEndsAfter, discountRowLabel, payableFrom, breakdown, deltas, symbolDelta, symbolHeightDelta,
  sizeCards, sizeAvailable, letterCmForWidth, verdict, setScenes, fromPrice, fromPriceDetail, fromPriceAll, bands, photo, deliveryLine, needBy, windowFrom, nextApprovalSlot,
  describeExclusions, setAreas, loadAreas, formatPostcode, postcodeStatus, quoteReason, limits } = pricing;
export { gbp };
