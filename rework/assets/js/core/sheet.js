/* Lit Neon v2 — proof sheet (brief §3.7 c-titleblock, §4.2 step 7, §6.2): the Workshop drawing the customer approves.
   Drafting-blue outline lettering on paper, backing outline, dimension lines, cap-height mark, construction notes,
   "For approval" stamp and the title block (Title · Acrylic W×H · LED flex · Power · Date · Drawn by Lit Neon).
   Ported from the fused prototype with: customer names only (no font families on the customer surface), per-line
   colours named, the stamp laid out in its own row (no overlap with the title at any width), facts via the registry
   (voltage, cable length and watts render only when confirmed — never a [CONFIRM] on a customer sheet), clock.now().
   sheet.render(el, state, { compact, lite }) → { flex, ppc, dims } ; sheet.svg(state, { width }) → standalone SVG string. */
import { resolve as resolveDesign, flexMetres, OPTIONS, escapeHtml as esc, injectCss } from './renderer.js';
import { fmtDate, fmtDims, cmToIn, fmtMetres } from './money.js';
import * as clock from './clock.js';

let factsPeer = null; try { const m = await import('./facts.js'); factsPeer = m.default && typeof m.default.get === 'function' ? m.default : m; } catch { factsPeer = null; }
const F = { has: k => { try { return !!(factsPeer && factsPeer.has && factsPeer.has(k)); } catch { return false; } }, get: k => { try { const v = factsPeer && factsPeer.get ? factsPeer.get(k) : undefined; return v && typeof v === 'object' && 'value' in v ? v.value : v; } catch { return undefined; } } };

const CSS = `
.ln-sheet{position:relative;color:var(--paper-ink,#180E1F);background:var(--paper,#F2E9DF);overflow:hidden;border-radius:2px;font-family:var(--f-ui,sans-serif);
  background-image:linear-gradient(var(--draft-faint,rgba(47,93,138,.14)) 1px,transparent 1px),linear-gradient(90deg,var(--draft-faint,rgba(47,93,138,.14)) 1px,transparent 1px);background-size:24px 24px;background-position:12px 12px}
.ln-sheet *{box-sizing:border-box}
.ln-sheet .frame{position:absolute;inset:14px;border:1px solid var(--paper-ink,#180E1F);pointer-events:none}
.ln-sheet .frame::before{content:"";position:absolute;inset:4px;border:1px solid var(--rule,#CFC3B9)}
.ln-sheet .head{position:absolute;left:30px;right:30px;top:26px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.ln-sheet .title{font:800 var(--t-display-3,28px)/1 var(--f-display,sans-serif);margin:0;letter-spacing:0;text-wrap:balance;max-width:24ch}
.ln-sheet .sub[hidden]{display:none}.ln-sheet .sub{margin:6px 0 0;font:400 var(--t-mono,13px)/1.4 var(--f-mono,monospace);color:var(--paper-soft,#5A4F5C)}
.ln-sheet .stamp{flex:none;padding:7px 12px 6px;border:2px solid var(--oxblood,#3B1222);color:var(--oxblood,#3B1222);background:var(--paper,#F2E9DF);font:800 19px/1 var(--f-display,sans-serif);letter-spacing:.01em;transform:rotate(-5deg);opacity:.85;border-radius:3px;text-align:center;margin-top:2px}
.ln-sheet .stamp small{display:block;font:500 10px/1.2 var(--f-ui,sans-serif);letter-spacing:0;margin-top:4px}
.ln-sheet .drawing{position:absolute}
.ln-sheet .drawing svg{position:absolute;overflow:visible}
.ln-sheet .drawing svg text{fill:none;stroke:var(--draft,#2F5D8A);stroke-width:1.4;stroke-linejoin:round;stroke-linecap:round}
.ln-sheet .drawing svg path{fill:none;stroke:var(--draft,#2F5D8A);stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round}
.ln-sheet .contourL{position:absolute;color:#fff}
.ln-sheet .contourL .c-text{position:absolute;margin:0;white-space:pre;line-height:1.15;color:#fff}
.ln-sheet .contourL svg{fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;position:absolute}
.ln-sheet .rectL{position:absolute;border:1px dashed var(--draft,#2F5D8A);border-radius:2px}
.ln-sheet .rectL i{position:absolute;width:7px;height:7px;border:1px solid var(--draft,#2F5D8A);border-radius:50%}
.ln-sheet .rectL i:nth-child(1){left:6px;top:6px}.ln-sheet .rectL i:nth-child(2){right:6px;top:6px}.ln-sheet .rectL i:nth-child(3){left:6px;bottom:6px}.ln-sheet .rectL i:nth-child(4){right:6px;bottom:6px}
.ln-sheet .capline{position:absolute;border-top:1px dashed var(--draft,#2F5D8A);opacity:.6}
.ln-sheet .dim{position:absolute;color:var(--draft,#2F5D8A);font:400 var(--t-mono,13px)/1 var(--f-mono,monospace);font-variant-numeric:tabular-nums}
.ln-sheet .dim.h{height:10px;border-left:1px solid currentColor;border-right:1px solid currentColor}
.ln-sheet .dim.h i{position:absolute;left:0;right:0;top:5px;border-top:1px solid currentColor}
.ln-sheet .dim.h span{position:absolute;left:50%;top:14px;transform:translateX(-50%);white-space:nowrap;background:var(--paper,#F2E9DF);padding:0 4px}
.ln-sheet .dim.v{width:10px;border-top:1px solid currentColor;border-bottom:1px solid currentColor}
.ln-sheet .dim.v i{position:absolute;top:0;bottom:0;left:5px;border-left:1px solid currentColor}
.ln-sheet .dim.v span{position:absolute;left:16px;top:50%;transform:translateY(-50%);white-space:nowrap;background:var(--paper,#F2E9DF);padding:2px 4px}
.ln-sheet .dim.v.flip span{left:auto;right:16px}
.ln-sheet .tb{position:absolute;right:30px;bottom:26px;left:30px;border:1px solid var(--paper-ink,#180E1F);background:var(--paper,#F2E9DF);display:grid;grid-auto-flow:column;grid-auto-columns:1fr}
.ln-sheet .tb div{padding:6px 10px;border-right:1px solid var(--rule,#CFC3B9);min-width:0}
.ln-sheet .tb div:last-child{border-right:0}
.ln-sheet .tb small{display:block;font:600 var(--t-eyebrow,12px)/1.2 var(--f-ui,sans-serif);letter-spacing:var(--track-eyebrow,.08em);text-transform:uppercase;color:var(--paper-soft,#5A4F5C);margin-bottom:3px}
.ln-sheet .tb b{display:block;font:600 var(--t-small,14px)/1.3 var(--f-ui,sans-serif);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ln-sheet .tb b.mono{font:400 var(--t-mono,13px)/1.3 var(--f-mono,monospace)}
.ln-sheet .spec{position:absolute;right:30px;width:min(340px,42%);border:1px solid var(--paper-ink,#180E1F);background:var(--paper,#F2E9DF);font-size:var(--t-caption,13px)}
.ln-sheet .spec table{width:100%;border-collapse:collapse}
.ln-sheet .spec td{padding:3px 9px;border-bottom:1px solid var(--rule,#CFC3B9);vertical-align:top}
.ln-sheet .spec tr:last-child td{border-bottom:0}
.ln-sheet .spec td:first-child{color:var(--paper-soft,#5A4F5C);width:38%;border-right:1px solid var(--rule,#CFC3B9)}
.ln-sheet .spec td:last-child{font:400 var(--t-mono,13px)/1.3 var(--f-mono,monospace)}
.ln-sheet .spec td.name{font:600 var(--t-small,14px)/1.3 var(--f-ui,sans-serif);color:var(--paper-ink,#180E1F)}
.ln-sheet .notes{position:absolute;left:30px;width:min(300px,34%);font-size:var(--t-caption,13px);color:var(--paper-soft,#5A4F5C);line-height:1.45}
.ln-sheet .notes h4{font:600 var(--t-caption,13px)/1.2 var(--f-ui,sans-serif);color:var(--paper-ink,#180E1F);margin:0 0 6px}
.ln-sheet .notes ol{margin:0;padding-left:18px;display:grid;gap:3px}
.ln-sheet.compact .frame{inset:8px}.ln-sheet.compact .head{left:18px;right:18px;top:16px}.ln-sheet.compact .title{font-size:var(--t-title,20px)}.ln-sheet.compact .sub{font-size:11px;margin-top:3px}
.ln-sheet.compact .stamp{font-size:12px;padding:4px 7px 3px}.ln-sheet.compact .stamp small{display:none}
.ln-sheet.compact .tb{left:18px;right:18px;bottom:16px}.ln-sheet.compact .tb div{padding:4px 8px}.ln-sheet.compact .tb small{font-size:10px}.ln-sheet.compact .tb b{font-size:12px}
.ln-sheet.compact .spec,.ln-sheet.compact .notes,.ln-sheet.lite .notes{display:none}
.ln-sheet.narrow .spec,.ln-sheet.narrow .notes{display:none}.ln-sheet.narrow .tb{grid-auto-flow:row;grid-template-columns:1fr 1fr}.ln-sheet.narrow .tb div{border-bottom:1px solid var(--rule,#CFC3B9)}.ln-sheet.narrow .tb div:nth-child(2n){border-right:0}.ln-sheet.narrow .tb div:nth-last-child(-n+2){border-bottom:0}
.ln-sheet.narrow .stamp{font-size:13px;padding:5px 8px 4px}.ln-sheet.narrow .head{left:18px;right:18px;top:18px}.ln-sheet.narrow .title{font-size:var(--t-title,20px)}.ln-sheet.narrow .tb{left:18px;right:18px;bottom:18px}.ln-sheet.narrow .tb div{padding:4px 8px}.ln-sheet.narrow .tb small{font-size:10px}.ln-sheet.narrow .tb b{font-size:12px}.ln-sheet.narrow .stamp small{display:none}
.ln-sheet .cf{color:#7a4a12;border:1px dashed currentColor;border-radius:3px;padding:0 4px;font:500 10px/1.4 var(--f-ui,sans-serif)}`;

let uid = 0;
const dimH = (left, top, width, label, cls = '') => `<div class="dim h ${cls}" style="left:${left}px;top:${top}px;width:${width}px"><i></i><span>${label}</span></div>`;
const dimV = (left, top, height, label, cls = '') => `<div class="dim v ${cls}" style="left:${left}px;top:${top}px;height:${height}px"><i></i><span>${label}</span></div>`;

function ensure(container) {
  injectCss('ln-sheet-css', CSS);
  if (container.dataset.sheet) return container.dataset.sheet;
  const id = 'lnsheet' + (++uid); container.dataset.sheet = id; container.classList.add('ln-sheet', 'c-paper'); container.removeAttribute('data-composite'); container.setAttribute('role', 'img');   /* a line drawing, never mistaken for a photo: not a rule-4 composite */
  container.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="${id}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="10" result="d"/><feGaussianBlur in="d" stdDeviation="4" result="b"/>
      <feComponentTransfer in="b" result="shape"><feFuncA type="linear" slope="24" intercept="-11"/></feComponentTransfer>
      <feMorphology in="shape" operator="erode" radius="1.2" result="inner"/><feComposite in="shape" in2="inner" operator="out" result="edge"/>
      <feFlood flood-color="#2F5D8A" flood-opacity=".9"/><feComposite in2="edge" operator="in"/></filter></svg>
    <div class="frame"></div><div class="head"><div><h3 class="title"></h3><p class="sub"></p></div><div class="stamp">For approval<small>nothing is made until you say yes</small></div></div>
    <div class="drawing"></div><div class="dims"></div><div class="spec"></div><div class="notes"></div><div class="tb"></div>`;
  return id;
}

/** power in watts from the flex metres, only when wattsPerMetre is confirmed */
export function wattsFor(flex) { const wpm = F.has('wattsPerMetre') ? +F.get('wattsPerMetre') : NaN; return Number.isFinite(wpm) ? Math.round(flex * wpm) : null; }

/** render(el, state, { compact, lite, title }) → { flex, ppc, dims, watts } | null */
export function render(container, state, opts = {}) {
  const id = ensure(container);
  const res = resolveDesign(state); const { m, dims: d } = res; if (!d || !m) return null;
  const compact = !!opts.compact; container.classList.toggle('compact', compact);
  const R = container.getBoundingClientRect(), SW = R.width, SH = R.height; if (!SW || !SH) return null;
  const narrow = SW < 620 && !compact; const lite = compact || !!opts.lite || SH < 620; container.classList.toggle('lite', lite && !compact); container.classList.toggle('narrow', narrow);
  const lines = res.drawLines.length ? res.drawLines : (res.hasText ? [] : ['Your words']);
  const flex = flexMetres(res); const watts = wattsFor(flex);
  const words = res.words || (res.hasText ? '' : 'Your words');
  const colourText = res.state.colours ? res.lineColours.map((c, i) => `${c.name} (line ${i + 1})`).join(', ') : res.colour.name;
  container.setAttribute('aria-label', `Proof drawing: ${words}, ${res.font.name} lettering in ${colourText}, ${fmtDims(d.W, d.H)}`);
  container.querySelector('.title').textContent = opts.title || (compact ? 'Proof drawing' : 'Custom neon sign · drawing 1');
  const sub = container.querySelector('.sub'); sub.textContent = `${lines.length} line${lines.length === 1 ? '' : 's'} · ${res.letterCm} cm letters · not to scale`; sub.hidden = (compact && SH < 320) || (narrow && SH < 420);
  const today = fmtDate(clock.now());
  /* spec table (customer names only) */
  const rows = compact || lite ? [] : [['Words', esc(words), 'name'], ['Lettering', esc(res.font.name)], ['Colour', esc(colourText) + (res.rgb ? '' : ` · ${res.colour.hex}`)], ['Tube', res.jacket.name.toLowerCase()],
    ['Letter height', `${res.letterCm} cm`], ['Overall', `${d.W} × ${d.H} cm (${cmToIn(d.W)} × ${cmToIn(d.H)} in)`], ['Backing', `${res.backing.name}, ${res.finish.name.toLowerCase()} acrylic`],
    ['Hangs', `${res.use.name.toLowerCase()}, ${res.backing.id === 'stand' ? 'on its stand' : res.hang.name.toLowerCase()}`], ['Power', [F.has('psuVoltage') ? `${F.get('psuVoltage')} supply` : null, 'UK plug', 'dimmer and remote'].filter(Boolean).join(', ')], ['Drawn', `${today}, sheet 1 of 1`]];
  const spec = container.querySelector('.spec'); spec.innerHTML = rows.length ? `<table>${rows.map(([k, v, cls]) => `<tr><td>${k}</td><td${cls ? ` class="${cls}"` : ''}>${v}</td></tr>`).join('')}</table>` : '';
  const notes = container.querySelector('.notes'); notes.innerHTML = lite ? '' : `<h4>Construction notes</h4><ol>
    <li>Tube path follows the centreline of each letter${res.icon ? ' and the symbol' : ''}.</li>
    <li>${(res.backing.id === 'cut' || res.backing.id === 'letter') ? `Acrylic cut ${res.backing.margin} cm outside the lettering.` : `Acrylic panel with ${res.backing.margin} cm clearance, four brass standoffs.`}</li>
    <li>Lines ${res.state.align === 'center' ? 'centred' : 'aligned ' + res.state.align}. Cable exits bottom right${F.has('cableLengthM') ? `, ${F.get('cableLengthM')} m clear` : ''}.</li>
    <li>Made in a UK workshop. You approve this drawing before anything is made.</li></ol>`;
  /* title block: Title · Acrylic W×H · LED flex · Power (if confirmed) · Date · Drawn by */
  const tb = container.querySelector('.tb');
  const cells = compact ? [['Acrylic', `${d.W} × ${d.H} cm`, 'mono'], ['Date', today, 'mono']] : narrow ? [['Title', esc(words.slice(0, 24)) || '—'], ['Acrylic', `${d.W} × ${d.H} cm`, 'mono'], ['Date', today, 'mono']] : [['Title', esc(words.slice(0, 40)) || '—'], ['Acrylic', `${d.W} × ${d.H} cm`, 'mono'], ['LED flex', fmtMetres(flex), 'mono']];
  if (!compact && !narrow) { if (watts != null) cells.push(['Power', `${watts} W`, 'mono']); cells.push(['Date', today, 'mono'], ['Drawn by', 'Lit Neon']); }
  tb.innerHTML = cells.map(([k, v, cls]) => `<div><small>${k}</small><b${cls ? ` class="${cls}"` : ''}>${v}</b></div>`).join('');
  /* layout */
  const headH = container.querySelector('.head').offsetHeight || 60, tbH = tb.offsetHeight || 0;
  const pad = compact ? 18 : 30;
  const specW = (!compact && !lite && !narrow) ? spec.offsetWidth + 16 : 0; const notesW = (!lite && !narrow) ? notes.offsetWidth + 16 : 0;
  const capPad = (!narrow && lines.length && !compact) ? 52 : 0;
  const areaT = (compact ? 16 : narrow ? 18 : 26) + headH + (compact ? 6 : 12), areaB = SH - pad - tbH - (compact ? 8 : 12);
  const areaL = pad + capPad + notesW, areaW = SW - areaL - pad - specW, areaH = areaB - areaT;
  if (!lite && !narrow) { spec.style.top = areaT + 'px'; notes.style.top = areaT + 'px'; }
  const ppc = Math.max(.25, Math.min((areaW - (compact ? 24 : narrow ? 40 : 170)) / d.W, (areaH - (compact ? 30 : narrow ? 44 : 76)) / d.H));
  const w = d.W * ppc, h = d.H * ppc, left = areaL + (areaW - w) / 2, top = areaT + (areaH - h) / 2 - 4;
  const mg = res.backing.margin * ppc, emPx = d.emCm * ppc;
  const dr = container.querySelector('.drawing'); Object.assign(dr.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
  const s = 100, iw = m.inkW * emPx, ih = m.inkH * emPx;
  const textShiftX = (m.inkW - m.textW) / 2 - m.minX + (m.textOffX ? m.textOffX / 2 : 0);
  const alignOff = li => res.state.align === 'left' ? 0 : res.state.align === 'right' ? (m.blockW - m.lineWidths[li]) : (m.blockW - m.lineWidths[li]) / 2;
  const f = res.font;
  let svg = `<svg viewBox="0 0 ${m.inkW * s} ${m.inkH * s}" style="left:${mg}px;top:${mg}px;width:${iw}px;height:${ih}px">`;
  if (res.icon) { const inline = res.iconPos === 'inline' && lines.length; const ix = inline ? 0 : (m.inkW - m.iconEm) / 2, iy = inline ? (m.inkH - m.iconEm) / 2 : 0; svg += `<g transform="translate(${ix * s} ${iy * s}) scale(${m.iconEm * s / 24})"><path d="${OPTIONS.icons[res.icon]}" style="stroke-width:${(1.7 * 24 / (m.iconEm * s)).toFixed(3)}"/></g>`; }
  lines.forEach((line, li) => { svg += `<text x="${((textShiftX + alignOff(li)) * s).toFixed(1)}" y="${((m.textOffY + m.baselines[li] - m.top) * s).toFixed(1)}" style="font-family:'${f.family}';font-weight:${f.weight || 400};font-size:100px;word-spacing:${f.wordSpacingEm || 0}em">${esc(line)}</text>`; });
  svg += '</svg>';
  let back = '';
  if (res.backing.id === 'cut' || res.backing.id === 'letter') {
    const fl = container.querySelector('filter'), ms = fl.querySelectorAll('feMorphology');
    ms[0].setAttribute('radius', (mg * .9).toFixed(2)); fl.querySelector('feGaussianBlur').setAttribute('stdDeviation', Math.max(1, mg * .32).toFixed(2));
    const padC = mg * 1.4;
    const inline = res.icon && res.iconPos === 'inline' && lines.length;
    const iconH = res.icon ? `<svg viewBox="0 0 24 24" style="left:${(inline ? 0 : (m.inkW - m.iconEm) / 2) * emPx}px;top:${(inline ? (m.inkH - m.iconEm) / 2 : 0) * emPx}px;width:${m.iconEm * emPx}px;height:${m.iconEm * emPx}px"><path d="${OPTIONS.icons[res.icon]}"/></svg>` : '';
    const textH = lines.length ? `<p class="c-text" style="left:${(textShiftX + (inline ? m.textOffX / 2 : 0)) * emPx}px;top:${(m.textOffY - m.top) * emPx}px;width:${m.blockW * emPx}px;font-family:'${f.family}',cursive;font-weight:${f.weight || 400};font-size:${emPx}px;line-height:1.15;text-align:${res.state.align};word-spacing:${f.wordSpacingEm || 0}em">${esc(lines.join('\n'))}</p>` : '';
    back = `<div class="contourL" style="left:${mg - padC}px;top:${mg - padC}px;width:${iw + 2 * padC}px;height:${ih + 2 * padC}px;filter:url(#${id})"><div style="position:absolute;left:${padC}px;top:${padC}px;width:${iw}px;height:${ih}px">${iconH}${textH}</div></div>`;
  } else {
    back = `<div class="rectL" style="left:0;top:0;width:${w}px;height:${h}px"><i></i><i></i><i></i><i></i></div>` + (res.backing.id === 'stand' ? `<div class="rectL" style="left:${w * .18}px;top:${h}px;width:${w * .64}px;height:${5 * ppc}px;border-style:solid"></div>` : '');
  }
  dr.innerHTML = back + svg;
  let dims = narrow || compact ? dimH(left, top + h + 18, w, `${d.W} × ${d.H} cm`, 'below') : dimH(left, top + h + 22, w, `${d.W} cm`, 'below') + dimV(left + w + 22, top, h, `${d.H} cm`);
  if (lines.length && !narrow && !compact) {
    const base = top + mg + (m.textOffY + m.baselines[0] - m.top) * emPx, capTop = base - m.cap * emPx;
    dims += dimV(left - 22, capTop, base - capTop, `${res.letterCm} cm`, 'flip') + `<div class="capline" style="left:${left - 30}px;width:${mg + 30}px;top:${capTop}px"></div><div class="capline" style="left:${left - 30}px;width:${mg + 30}px;top:${base}px"></div>`;
  }
  container.querySelector('.dims').innerHTML = dims;
  return { flex, ppc, dims: d, watts };
}

/** A standalone SVG of the drawing (for drawing-export / the share preview). Lettering as outlined <text> in the real face. */
export function svg(state, { width = 1123, height = 794 } = {}) {
  const res = resolveDesign(state); const { m, dims: d } = res; if (!d) return '';
  const lines = res.drawLines.length ? res.drawLines : (res.hasText ? [] : ['Your words']);
  const pad = 60, areaW = width - pad * 2, areaH = height - pad * 2 - 90;
  const ppc = Math.min((areaW - 80) / d.W, (areaH - 60) / d.H); const w = d.W * ppc, h = d.H * ppc, left = pad + (areaW - w) / 2, top = pad + (areaH - h) / 2;
  const emPx = d.emCm * ppc, mg = res.backing.margin * ppc;
  const textShiftX = (m.inkW - m.textW) / 2 - m.minX; const alignOff = li => res.state.align === 'left' ? 0 : res.state.align === 'right' ? (m.blockW - m.lineWidths[li]) : (m.blockW - m.lineWidths[li]) / 2;
  const text = lines.map((line, li) => `<text x="${(left + mg + (textShiftX + alignOff(li)) * emPx).toFixed(1)}" y="${(top + mg + (m.textOffY + m.baselines[li] - m.top) * emPx).toFixed(1)}" font-family="${esc(res.font.family)}" font-weight="${res.font.weight || 400}" font-size="${emPx.toFixed(1)}" fill="none" stroke="#2F5D8A" stroke-width="1.6">${esc(line)}</text>`).join('');
  const icon = res.icon ? `<g transform="translate(${left + mg + (m.inkW - m.iconEm) / 2 * emPx} ${top + mg}) scale(${m.iconEm * emPx / 24})"><path d="${OPTIONS.icons[res.icon]}" fill="none" stroke="#2F5D8A" stroke-width="${(1.7 * 24 / (m.iconEm * emPx)).toFixed(3)}"/></g>` : '';
  const backing = (res.backing.id === 'cut' || res.backing.id === 'letter') ? `<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${mg}" fill="none" stroke="#2F5D8A" stroke-dasharray="4 4"/>` : `<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="3" fill="none" stroke="#2F5D8A" stroke-dasharray="6 4"/>`;
  const flex = flexMetres(res);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#F2E9DF"/><rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#180E1F"/>
    <text x="30" y="46" font-family="Big Shoulders Display, Arial Narrow, sans-serif" font-weight="800" font-size="26" fill="#180E1F">Custom neon sign · drawing 1</text>
    <text x="30" y="66" font-family="B612 Mono, monospace" font-size="11" fill="#5A4F5C">${lines.length} line${lines.length === 1 ? '' : 's'} · ${res.letterCm} cm letters · not to scale</text>
    ${backing}${icon}${text}
    <line x1="${left}" y1="${top + h + 24}" x2="${left + w}" y2="${top + h + 24}" stroke="#2F5D8A"/><text x="${left + w / 2}" y="${top + h + 40}" text-anchor="middle" font-family="B612 Mono, monospace" font-size="12" fill="#2F5D8A">${d.W} cm</text>
    <line x1="${left + w + 24}" y1="${top}" x2="${left + w + 24}" y2="${top + h}" stroke="#2F5D8A"/><text x="${left + w + 32}" y="${top + h / 2 + 4}" font-family="B612 Mono, monospace" font-size="12" fill="#2F5D8A">${d.H} cm</text>
    <g font-family="Hanken Grotesk, Arial, sans-serif" font-size="12" fill="#180E1F"><rect x="30" y="${height - 76}" width="${width - 60}" height="46" fill="none" stroke="#180E1F"/>
      ${[['Title', res.words || '—'], ['Acrylic', `${d.W} × ${d.H} cm`], ['Date', fmtDate(clock.now())], ['Drawn by', 'Lit Neon']].map(([k, v], i, a) => `<text x="${40 + i * (width - 80) / a.length}" y="${height - 58}" font-size="9" fill="#5A4F5C">${k.toUpperCase()}</text><text x="${40 + i * (width - 80) / a.length}" y="${height - 40}" font-weight="600">${esc(String(v))}</text>`).join('')}</g></svg>`;
}

export default { render, svg, wattsFor };
