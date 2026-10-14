/* Lit Neon v2 — home 2's "See it in your room" (§3 row 7, D5 A): one stage (the bedroom), three controls — size S–XXL,
   colour, off/on. Imported by home.js only when the section scrolls near. The words follow the hero. */
export function mount(root, { state, subs, engine, paintSign, wireToggle, relit, SIZES }) {
  const plate = root.querySelector('.plate'), sign = root.querySelector('.sign'), text = root.querySelector('.sign span');
  const local = { text: state.text, font: state.font, colour: 'warm', size: 'm', scene: 's02-bedroom', on: true };
  const dims = root.querySelector('.demo__dims');
  const paint = () => { local.text = state.text; local.font = state.font; paintSign(sign, text, local); say(); };
  async function say() {
    const E = await engine(); if (!E) return;
    const p = E.pricing.price({ text: local.text, font: local.font, colour: local.colour, size: local.size, scene: local.scene, jacket: 'white' });
    dims.textContent = p.kind === 'price' ? `${SIZES[local.size][0]} · about ${p.dims.W} × ${p.dims.H} cm · ${E.gbp(p.payable)}` : p.kind === 'quote' ? `${SIZES[local.size][0]} · ${E.pricing.quoteReason(p)}` : p.kind === 'wait' ? 'Measuring…' : '';
  }
  root.querySelector('.demo__sizes').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; root.querySelectorAll('.demo__sizes [data-s]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); local.size = b.dataset.s; paint(); });
  root.querySelector('.sws').addEventListener('click', e => { const b = e.target.closest('.sw'); if (!b) return; root.querySelectorAll('.sw').forEach(x => x.setAttribute('aria-pressed', String(x === b))); local.colour = b.dataset.c; paint(); relit(sign); });
  wireToggle(root.querySelector('.tog'), root, plate, 's02-bedroom', () => local, on => { local.on = on; });
  subs.add(() => { clearTimeout(local.t); local.t = setTimeout(paint, 150); });
  addEventListener('resize', () => paintSign(sign, text, local), { passive: true });
  paint();
}
