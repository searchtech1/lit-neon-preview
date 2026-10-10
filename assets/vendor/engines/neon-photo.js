/* vendored by tools/build.mjs — do not edit; the source of truth is in the repo root */
const window = globalThis; const self = globalThis;
/* Lit Neon — photo-to-neon engine (shared component)
   Contract: window.LitNeonPhoto.mount(el, { colour, palette, onQuote }) -> { setColour(hex), destroy() }
   Theming: --lnp-font --lnp-text --lnp-muted --lnp-surface --lnp-line --lnp-accent --lnp-radius --lnp-wall
   Everything runs on the device. No dependencies. All CSS scoped under .lnp.
   Subject-guided path: when a photo arrives, MediaPipe Tasks Vision (ImageSegmenter, DeepLab v3) is loaded
   lazily from the CDN and run ON THE DEVICE to find a person or pet; the mask becomes a clean silhouette tube
   plus a few strong interior lines. No model (offline, blocked) -> the heuristic edge path runs unchanged.
   Extras (not required by the contract, safe to ignore): ctl.load(fileOrBlob); opts.segmenter = false | { bundle,
   wasm, model, timeout }; the container dispatches 'lnp:rendered' CustomEvents with { ms, ledMetres, paths, source,
   subject, seg } after every render. */
(function () {
  'use strict';
  if (window.LitNeonPhoto) return;

  /* ------------------------------------------------------------------ */
  /* Engine: runs inside a Blob worker (or inline if workers are blocked) */
  /* Self-contained on purpose: nothing from the outer scope is referenced */
  /* ------------------------------------------------------------------ */
  function engineMain(self) {
    'use strict';
    var image = { id: null, gray: null, w: 0, h: 0, mask: null };
    var cache = { key: '', effC: null, effF: null, sub: null };
    function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

    function normalise(gray, n, mask) {
      var hist = new Uint32Array(256), i, acc = 0, cnt = 0, lo = 0, hi = 255;
      for (i = 0; i < n; i++) if (!mask || mask[i]) { hist[gray[i]]++; cnt++; }
      var cut = cnt * 0.01;
      for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > cut) { lo = i; break; } }
      acc = 0; for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > cut) { hi = i; break; } }
      if (hi - lo < 48) { lo = Math.max(0, lo - 24); hi = Math.min(255, hi + 24); }
      var out = new Float32Array(n), k = 255 / Math.max(1, hi - lo);
      for (i = 0; i < n; i++) { var v = (gray[i] - lo) * k; out[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
      return out;
    }

    function gaussian(src, w, h, sigma) {
      var r = Math.max(1, Math.ceil(sigma * 2.5)), k = new Float32Array(2 * r + 1), s = 0, i, x, y;
      for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
      for (i = 0; i < k.length; i++) k[i] /= s;
      var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
      for (y = 0; y < h; y++) { var row = y * w;
        for (x = 0; x < w; x++) { var acc = 0;
          for (i = -r; i <= r; i++) { var xx = x + i; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1; acc += src[row + xx] * k[i + r]; }
          tmp[row + x] = acc; } }
      for (y = 0; y < h; y++) { var rd = y * w;
        for (i = -r; i <= r; i++) { var yy = y + i; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1; var rs = yy * w, wg = k[i + r];
          for (x = 0; x < w; x++) out[rd + x] += tmp[rs + x] * wg; } }
      return out;
    }

    function bilateral(src, w, h, sigmaR) {
      var r = 2, sw = new Float32Array(25), k = 0, dx, dy, x, y;
      for (dy = -r; dy <= r; dy++) for (dx = -r; dx <= r; dx++) sw[k++] = Math.exp(-(dx * dx + dy * dy) / (2 * 1.5 * 1.5));
      var lut = new Float32Array(256); for (k = 0; k < 256; k++) lut[k] = Math.exp(-(k * k) / (2 * sigmaR * sigmaR));
      var out = new Float32Array(w * h);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var i = y * w + x, c = src[i], sum = 0, ws = 0; k = 0;
        for (dy = -r; dy <= r; dy++) { var yy = y + dy; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1; var row = yy * w;
          for (dx = -r; dx <= r; dx++, k++) { var xx = x + dx; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
            var v = src[row + xx], d = v - c; if (d < 0) d = -d; var wg = sw[k] * lut[d | 0]; sum += v * wg; ws += wg; } }
        out[i] = sum / ws;
      }
      return out;
    }

    function boxMean(src, w, h, r) {
      var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y;
      for (y = 0; y < h; y++) { var row = y * w, s = 0, c = 0;
        for (x = 0; x < r && x < w; x++) { s += src[row + x]; c++; }
        for (x = 0; x < w; x++) { var a = x + r, b = x - r - 1; if (a < w) { s += src[row + a]; c++; } if (b >= 0) { s -= src[row + b]; c--; } tmp[row + x] = s / c; } }
      for (x = 0; x < w; x++) { var s2 = 0, c2 = 0;
        for (y = 0; y < r && y < h; y++) { s2 += tmp[y * w + x]; c2++; }
        for (y = 0; y < h; y++) { var a2 = y + r, b2 = y - r - 1; if (a2 < h) { s2 += tmp[a2 * w + x]; c2++; } if (b2 >= 0) { s2 -= tmp[b2 * w + x]; c2--; } out[y * w + x] = s2 / c2; } }
      return out;
    }

    // Sobel -> magnitude -> non-maximum suppression; plus a texture penalty so dense texture
    // (grass, wood grain, snow) loses to clean isolated contours.
    function edges(img, w, h, alpha) {
      var n = w * h, mag = new Float32Array(n), gx = new Float32Array(n), gy = new Float32Array(n), x, y, i;
      for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x;
        var a = img[i - w - 1], b = img[i - w], c = img[i - w + 1], d = img[i - 1], f = img[i + 1], g = img[i + w - 1], hh = img[i + w], k = img[i + w + 1];
        var sx = (c + 2 * f + k) - (a + 2 * d + g), sy = (g + 2 * hh + k) - (a + 2 * b + c);
        gx[i] = sx; gy[i] = sy; mag[i] = Math.sqrt(sx * sx + sy * sy); }
      var nms = new Float32Array(n);
      for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; var m = mag[i]; if (m === 0) continue;
        var ax = gx[i] < 0 ? -gx[i] : gx[i], ay = gy[i] < 0 ? -gy[i] : gy[i], n1, n2;
        if (ay <= 0.4142 * ax) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
        else if (ay >= 2.4142 * ax) { n1 = mag[i - w]; n2 = mag[i + w]; }
        else if ((gx[i] > 0) === (gy[i] > 0)) { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
        else { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
        if (m >= n1 && m >= n2) nms[i] = m; }
      var mean = boxMean(mag, w, h, 7), eff = new Float32Array(n);
      for (i = 0; i < n; i++) { var v = nms[i]; if (v > 0) eff[i] = v * v / (v + alpha * mean[i] + 0.001); }
      return { nms: nms, eff: eff };
    }

    function quantile(eff, n, topFrac) {
      var max = 0, i; for (i = 0; i < n; i++) if (eff[i] > max) max = eff[i]; if (max === 0) return 0;
      var bins = 4096, hist = new Uint32Array(bins), cnt = 0, sc = (bins - 1) / max;
      for (i = 0; i < n; i++) if (eff[i] > 0) { hist[(eff[i] * sc) | 0]++; cnt++; }
      var target = cnt * topFrac, acc = 0;
      for (i = bins - 1; i >= 0; i--) { acc += hist[i]; if (acc >= target) return i / sc; }
      return 0;
    }

    function hysteresis(eff, w, h, lo, hi) {
      var n = w * h, edge = new Uint8Array(n), stack = new Int32Array(n), sp = 0, i;
      for (i = 0; i < n; i++) {
        if (eff[i] < hi || edge[i]) continue;
        edge[i] = 1; stack[sp++] = i;
        while (sp) { var j = stack[--sp], x = j % w, y = (j / w) | 0;
          for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy <= 0 || yy >= h - 1) continue;
            for (var dx = -1; dx <= 1; dx++) { var xx = x + dx; if (xx <= 0 || xx >= w - 1) continue; var m = yy * w + xx;
              if (!edge[m] && eff[m] >= lo) { edge[m] = 1; stack[sp++] = m; } } } }
      }
      return edge;
    }

    // Link edge pixels into chains. Diagonal neighbours only count when no orthogonal
    // neighbour already bridges them, so staircases read as single lines.
    function link(edge, eff, w, h) {
      var n = w * h, deg = new Uint8Array(n), nb = new Int32Array(8), i, k;
      function neigh(p) { var x = p % w, y = (p / w) | 0, c = 0;
        var L = x > 0 && edge[p - 1], R = x < w - 1 && edge[p + 1], U = y > 0 && edge[p - w], D = y < h - 1 && edge[p + w];
        if (L) nb[c++] = p - 1; if (R) nb[c++] = p + 1; if (U) nb[c++] = p - w; if (D) nb[c++] = p + w;
        if (x > 0 && y > 0 && edge[p - w - 1] && !L && !U) nb[c++] = p - w - 1;
        if (x < w - 1 && y > 0 && edge[p - w + 1] && !R && !U) nb[c++] = p - w + 1;
        if (x > 0 && y < h - 1 && edge[p + w - 1] && !L && !D) nb[c++] = p + w - 1;
        if (x < w - 1 && y < h - 1 && edge[p + w + 1] && !R && !D) nb[c++] = p + w + 1;
        return c; }
      for (i = 0; i < n; i++) if (edge[i]) deg[i] = neigh(i);
      var visited = new Uint8Array(n), chains = [];
      function trace(start, next) { var pts = [start, next], prev = start, cur = next;
        while (deg[cur] === 2 && !visited[cur]) { visited[cur] = 1; neigh(cur);
          var nx = nb[0] === prev ? nb[1] : nb[0]; if (nb[0] !== prev && nb[1] !== prev) break;
          prev = cur; cur = nx; pts.push(cur); if (cur === start) break; }
        return pts; }
      function make(idx, closed) { var m = idx.length, p = new Array(m * 2), s = 0;
        for (var q = 0; q < m; q++) { p[2 * q] = idx[q] % w; p[2 * q + 1] = (idx[q] / w) | 0; s += eff[idx[q]]; }
        var a = idx[0], b = idx[m - 1];
        var c = { p: p, closed: closed, alive: true, s: s / m, n: m, rec: null };
        c.rec = [{ c: c, e: 0, j: (!closed && deg[a] >= 3) ? a : -1 }, { c: c, e: 1, j: (!closed && deg[b] >= 3) ? b : -1 }];
        return c; }
      for (i = 0; i < n; i++) { if (!edge[i] || deg[i] === 2 || deg[i] === 0) continue;
        var c = neigh(i), list = []; for (k = 0; k < c; k++) list.push(nb[k]);
        for (k = 0; k < c; k++) { var m = list[k];
          if (deg[m] === 2) { if (!visited[m]) chains.push(make(trace(i, m), false)); }
          else if (i < m) chains.push(make([i, m], false)); } }
      for (i = 0; i < n; i++) { if (!edge[i] || deg[i] !== 2 || visited[i]) continue;
        neigh(i); var pts = trace(i, nb[0]); visited[i] = 1;
        if (pts[pts.length - 1] === i) { pts.pop(); chains.push(make(pts, true)); } else chains.push(make(pts, false)); }
      return chains;
    }

    function plen(p, closed) { var L = 0, n = p.length / 2; for (var i = 1; i < n; i++) L += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
      if (closed && n > 1) L += Math.hypot(p[0] - p[2 * n - 2], p[1] - p[2 * n - 1]); return L; }
    function reverse(c) { var p = c.p, n = p.length / 2, q = new Array(p.length);
      for (var i = 0; i < n; i++) { q[2 * i] = p[2 * (n - 1 - i)]; q[2 * i + 1] = p[2 * (n - 1 - i) + 1]; }
      c.p = q; var t = c.rec[0]; c.rec[0] = c.rec[1]; c.rec[1] = t; c.rec[0].e = 0; c.rec[1].e = 1; }
    // unit direction of travel at an end (pointing out of the chain)
    function outDir(c, e) { var p = c.p, n = p.length / 2, k = Math.min(n - 1, 6), ax, ay, bx, by;
      if (e === 1) { ax = p[2 * (n - 1 - k)]; ay = p[2 * (n - 1 - k) + 1]; bx = p[2 * (n - 1)]; by = p[2 * (n - 1) + 1]; }
      else { ax = p[2 * k]; ay = p[2 * k + 1]; bx = p[0]; by = p[1]; }
      var dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    // join A (ending at its end e) to B (starting at its end e); skipShared drops B's first point
    function join(A, B, skipShared) {
      if (A.e === 0) reverse(A.c); if (B.e === 1) reverse(B.c);
      var a = A.c, b = B.c;
      a.p = a.p.concat(skipShared ? b.p.slice(2) : b.p);
      a.s = (a.s * a.n + b.s * b.n) / (a.n + b.n); a.n += b.n;
      a.rec[1] = b.rec[1]; a.rec[1].c = a; a.rec[1].e = 1; b.alive = false;
      return a; }

    function mergeAtJunctions(chains, minDot) {
      var jmap = new Map();
      chains.forEach(function (c) { if (c.closed) return; for (var e = 0; e < 2; e++) { var r = c.rec[e]; if (r.j >= 0) { if (!jmap.has(r.j)) jmap.set(r.j, []); jmap.get(r.j).push(r); } } });
      jmap.forEach(function (list) {
        list = list.filter(function (r) { return r.c.alive; });
        while (list.length >= 2) {
          var best = 1, bi = -1, bj = -1;
          for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
            if (list[i].c === list[j].c) continue;
            var ti = outDir(list[i].c, list[i].e), tj = outDir(list[j].c, list[j].e), dot = ti[0] * tj[0] + ti[1] * tj[1];
            if (dot < best) { best = dot; bi = i; bj = j; } }
          if (bi < 0 || best > minDot) break;
          var A = list[bi], B = list[bj];
          join(A, B, true);
          list = list.filter(function (r) { return r !== A && r !== B && r.c.alive; });
        }
      });
    }

    function bridgeGaps(chains, gap) {
      var ends = [], cell = Math.max(2, gap), grid = new Map();
      chains.forEach(function (c) { if (!c.alive || c.closed) return; for (var e = 0; e < 2; e++) { var r = c.rec[e]; if (r.j >= 0) continue;
        var p = c.p, n = p.length / 2; r.x = e ? p[2 * n - 2] : p[0]; r.y = e ? p[2 * n - 1] : p[1]; r.used = false; ends.push(r);
        var key = ((r.x / cell) | 0) + ',' + ((r.y / cell) | 0); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(r); } });
      ends.forEach(function (r) {
        if (r.used || !r.c.alive) return;
        var cx = (r.x / cell) | 0, cy = (r.y / cell) | 0, bestD = gap * gap, best = null, dr = outDir(r.c, r.e);
        for (var gy = cy - 1; gy <= cy + 1; gy++) for (var gx = cx - 1; gx <= cx + 1; gx++) {
          var bucket = grid.get(gx + ',' + gy); if (!bucket) continue;
          for (var k = 0; k < bucket.length; k++) { var q = bucket[k]; if (q === r || q.used || !q.c.alive) continue;
            if (q.c === r.c && r.c.n < 24) continue;
            var dx = q.x - r.x, dy = q.y - r.y, d2 = dx * dx + dy * dy; if (d2 > bestD) continue;
            var L = Math.sqrt(d2) || 1, vx = dx / L, vy = dy / L, dq = outDir(q.c, q.e);
            if (dr[0] * vx + dr[1] * vy < 0.1) continue; if (-(dq[0] * vx + dq[1] * vy) < 0.1) continue;
            bestD = d2; best = q; } }
        if (!best) return;
        r.used = true; best.used = true;
        if (best.c === r.c) { r.c.closed = true; return; }
        join(r, best, false);
      });
    }

    function rdp(p, eps) { var keep = rdpKeep(p, eps), n = p.length / 2, out = []; for (var q = 0; q < n; q++) if (keep[q]) out.push(p[2 * q], p[2 * q + 1]); return out; }
    function rdpKeep(p, eps) { var n = p.length / 2, keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; if (n < 3) return keep; var stack = [[0, n - 1]], e2 = eps * eps;
      while (stack.length) { var seg = stack.pop(), a = seg[0], b = seg[1]; if (b - a < 2) continue;
        var ax = p[2 * a], ay = p[2 * a + 1], dx = p[2 * b] - ax, dy = p[2 * b + 1] - ay, L2 = dx * dx + dy * dy, maxD = -1, idx = -1;
        for (var i = a + 1; i < b; i++) { var px = p[2 * i] - ax, py = p[2 * i + 1] - ay, d;
          if (L2 === 0) d = px * px + py * py; else { var t = (px * dx + py * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; var ex = px - t * dx, ey = py - t * dy; d = ex * ex + ey * ey; }
          if (d > maxD) { maxD = d; idx = i; } }
        if (maxD > e2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); } }
      return keep; }

    // A long straight axis-aligned run inside a chain is a ruler line (floorboard, horizon, table edge)
    // that got fused onto a subject contour at a junction. Cut it out so it is scored on its own.
    function splitStraight(ch, L) {
      if (ch.closed || ch.p.length < 24) return [ch];
      var p = ch.p, n = p.length / 2, keep = rdpKeep(p, 2.0), verts = [], i;
      for (i = 0; i < n; i++) if (keep[i]) verts.push(i);
      var cuts = [];
      for (i = 1; i < verts.length; i++) { var a = verts[i - 1], b = verts[i], dx = p[2 * b] - p[2 * a], dy = p[2 * b + 1] - p[2 * a + 1], len = Math.hypot(dx, dy);
        if (len < 0.14 * L) continue;
        var ang = Math.abs(Math.atan2(dy, dx)) * 180 / Math.PI; ang = Math.min(ang, 180 - ang); ang = Math.min(ang, Math.abs(90 - ang));
        if (ang < 7) cuts.push([a, b]); }
      if (!cuts.length) return [ch];
      var pieces = [], start = 0;
      function piece(from, to) { if (to - from < 2) return; var q = p.slice(2 * from, 2 * to + 2);
        pieces.push({ p: q, closed: false, alive: true, s: ch.s, n: q.length / 2, scale: ch.scale, hi: ch.hi, rec: [{ c: null, e: 0, j: -1 }, { c: null, e: 1, j: -1 }] }); }
      for (i = 0; i < cuts.length; i++) { piece(start, cuts[i][0]); piece(cuts[i][0], cuts[i][1]); start = cuts[i][1]; }
      piece(start, n - 1);
      return pieces;
    }

    function chaikin(p, closed, iters) {
      for (var it = 0; it < iters; it++) { var n = p.length / 2; if (n < 3) return p; var q = [];
        if (!closed) q.push(p[0], p[1]);
        var last = closed ? n : n - 1;
        for (var i = 0; i < last; i++) { var j = (i + 1) % n, x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * j], y1 = p[2 * j + 1];
          q.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1); }
        if (!closed) q.push(p[2 * n - 2], p[2 * n - 1]);
        p = q; }
      return p; }

    // Detail d and smoothness s are 0..1. Two edge scales: coarse carries the structure a sign needs
    // (outline, hair, roofline), fine adds eyes, lettering and small shapes as the budget allows.
    // Budget is total tube length in working px: at 80 cm wide 900 px is about a metre, so defaults
    // land near 5-6 m of LED, low detail near 2 m, high near 11 m.
    function params(d, s, w, h) { var L = Math.max(w, h); return {
      sigmaC: 1.8 + 0.8 * s, sigmaF: 0.9 + 0.6 * s, sigmaR: 8 + 24 * s, alpha: 1.6,
      topFracC: 0.10 + 0.30 * d, topFracF: 0.04 + 0.30 * d, loRatio: 0.35, hiFloor: 18, hiCap: 60,
      spur: 7, gap: 4 + 3 * s, minDot: -0.45,
      minLen: L * (0.04 - 0.025 * d), budget: L * (2.2 + 6 * d + 5 * d * d), maxPaths: Math.round(40 + 220 * d),
      eps: 0.8 + 1.6 * s, iters: s > 0.66 ? 3 : 2, centre: 0.55 }; }

    // How much a chain deserves to be in the sign. Long smooth contours win (len^1.35), coarse-scale
    // structure gets a bonus, closed loops (eyes, letters, glasses) read as deliberate neon, and long
    // straight axis-aligned lines are almost always background (horizon, floorboards, table edges).
    function measure(ch, w, h) {
      var p = ch.p, m = p.length / 2, sx = 0, sy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, q;
      for (q = 0; q < m; q++) { var x = p[2 * q], y = p[2 * q + 1]; sx += x; sy += y; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      ch.cx = sx / m; ch.cy = sy / m; ch.bw = maxx - minx; ch.bh = maxy - miny;
      var dx = p[2 * m - 2] - p[0], dy = p[2 * m - 1] - p[1];
      if (!ch.closed && m > 8 && dx * dx + dy * dy <= 9) ch.closed = true; // ends meet: it is a loop
      ch.chord = ch.closed ? 0 : Math.hypot(dx, dy); ch.straight = ch.closed ? 0 : ch.chord / Math.max(1, ch.len);
      var ang = Math.abs(Math.atan2(dy, dx)) * 180 / Math.PI; ang = Math.min(ang, 180 - ang); ch.axisAng = Math.min(ang, Math.abs(90 - ang));
      // ends that run out of the frame belong to the background, not the subject. Both ends out
      // (any edges) = a line crossing the picture: horizon, pole, door frame. One end out at a
      // side is suspicious, at the top mildly so, at the bottom fine (bodies and buildings leave there).
      var mgX = 0.06 * w, mgY = 0.06 * h, edges = [];
      if (!ch.closed) { for (var e = 0; e < 2; e++) { var x = e ? p[2 * m - 2] : p[0], y = e ? p[2 * m - 1] : p[1];
        edges.push(x < mgX ? 'L' : x > w - mgX ? 'R' : y < mgY ? 'T' : y > h - mgY ? 'B' : ''); } }
      var exits = 0, side = 0, top = 0; for (var q2 = 0; q2 < edges.length; q2++) { if (!edges[q2]) continue; exits++; if (edges[q2] === 'L' || edges[q2] === 'R') side++; else if (edges[q2] === 'T') top++; }
      ch.exits = exits; ch.sideEnds = side; ch.topEnds = top;
      ch.crossing = exits === 2 && edges[0] !== edges[1]; // enters at one edge, leaves at another
      ch.elongated = ch.bw > 4 * ch.bh || ch.bh > 4 * ch.bw;
      // long, flat or upright, axis-aligned and running out of the frame: horizon, skyline, pole, table edge
      ch.horizonLike = exits > 0 && (ch.bw > 3 * ch.bh || ch.bh > 3 * ch.bw) && ch.axisAng < 15;
    }
    function scoreChain(ch, w, h, hi, P, parallelPattern) {
      var L = Math.max(w, h), cx0 = w / 2, cy0 = h / 2, rx = (ch.cx - cx0) / cx0, ry = (ch.cy - cy0) / cy0, r = Math.sqrt(rx * rx + ry * ry);
      var centre = (1 - P.centre) + P.centre * Math.exp(-(r * r) / (0.7 * 0.7));
      var strength = 0.6 + 0.2 * Math.min(2, ch.s / hi);
      var shape = ch.scale === 0 ? 1.5 : 1;
      if (ch.closed) { var diag = Math.hypot(ch.bw, ch.bh); shape *= diag < 0.035 * L ? 0.7 : diag < 0.14 * L ? 1.8 : 1.25; }
      else {
        var isStraight = ch.straight > 0.93 && ch.chord > 0.12 * L;
        if (isStraight && ch.chord > 0.3 * L) { shape *= 0.4; if (ch.axisAng < 7) shape *= 0.6; }
        else if (isStraight && ch.axisAng < 7) shape *= 0.35; // a shorter ruler: table edge, skirting, horizon stub
        if (parallelPattern && (isStraight || ch.elongated) && ch.axisAng < 10) shape *= 0.4;
        if (Math.max(ch.bw / w, ch.bh / h) > 0.7) shape *= 0.5;
        if (ch.crossing) shape *= 0.08; else if (ch.sideEnds) shape *= 0.3; else if (ch.topEnds) shape *= 0.7;
        if (ch.horizonLike) shape *= 0.05;
        if (isStraight && ch.sideEnds) shape *= 0.05;
        if (ch.straight < 0.35 && ch.len < 0.2 * L) shape *= 0.35; // short wiggly squiggle (lace, fur, foliage)
      }
      return Math.pow(ch.len, 1.35) * strength * centre * shape;
    }
    function dilate3(edge, w, h) { // 7x7 box dilation, separable
      var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), x, y, k;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var i = y * w + x; if (!edge[i]) continue; for (k = Math.max(0, x - 3); k <= Math.min(w - 1, x + 3); k++) tmp[y * w + k] = 1; }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var j = y * w + x; if (!tmp[j]) continue; for (k = Math.max(0, y - 3); k <= Math.min(h - 1, y + 3); k++) out[k * w + x] = 1; }
      return out;
    }
    function prepare(P) {
      var w = image.w, h = image.h, n = w * h;
      var key = image.id + '|' + P.sigmaR.toFixed(1) + '|' + P.sigmaC.toFixed(2) + '|' + P.sigmaF.toFixed(2);
      if (cache.key === key) return;
      var base = bilateral(normalise(image.gray, n), w, h, P.sigmaR);
      var ec = edges(gaussian(base, w, h, P.sigmaC), w, h, P.alpha);
      var ef = edges(gaussian(base, w, h, P.sigmaF), w, h, P.alpha);
      cache = { key: key, effC: ec.eff, effF: ef.eff };
    }
    // hysteresis -> link -> clean up, for one scale
    function extract(eff, w, h, P, topFrac, scale) {
      // quantile thresholds suit photos; on a clean graphic nearly every edge pixel is real, so cap hi
      // at an absolute value or thin letter strokes fall under the low threshold
      var n = w * h, hi = Math.max(P.hiFloor, Math.min(P.hiCap, quantile(eff, n, topFrac))), lo = hi * P.loRatio;
      var edge = hysteresis(eff, w, h, lo, hi), chains = link(edge, eff, w, h), i;
      for (i = 0; i < chains.length; i++) { var c = chains[i]; if (!c.closed && c.n <= P.spur && (c.rec[0].j < 0 || c.rec[1].j < 0)) c.alive = false; }
      mergeAtJunctions(chains, P.minDot);
      bridgeGaps(chains, P.gap);
      var live = [], minLen = P.minLen * (scale === 0 ? 1 : 1.3), L = Math.max(w, h);
      for (i = 0; i < chains.length; i++) { var ch = chains[i]; if (!ch.alive) continue; ch.len = plen(ch.p, ch.closed); if (ch.len < minLen) continue; ch.scale = scale; ch.hi = hi;
        var parts = splitStraight(ch, L);
        for (var k = 0; k < parts.length; k++) { var part = parts[k]; part.len = plen(part.p, part.closed); if (part.len < minLen) continue; measure(part, w, h); live.push(part); } }
      return { live: live, edge: edge, raw: chains.length, hi: hi };
    }

    /* ---- subject path: a mask from on-device segmentation drives the sign ---- */
    function dilateBin(m, w, h, r) { // separable box max on a 0/1 mask
      var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), x, y;
      for (y = 0; y < h; y++) { var row = y * w, cnt = 0;
        for (x = 0; x < r && x < w; x++) cnt += m[row + x];
        for (x = 0; x < w; x++) { if (x + r < w) cnt += m[row + x + r]; if (x - r - 1 >= 0) cnt -= m[row + x - r - 1]; tmp[row + x] = cnt > 0 ? 1 : 0; } }
      for (x = 0; x < w; x++) { var c2 = 0;
        for (y = 0; y < r && y < h; y++) c2 += tmp[y * w + x];
        for (y = 0; y < h; y++) { if (y + r < h) c2 += tmp[(y + r) * w + x]; if (y - r - 1 >= 0) c2 -= tmp[(y - r - 1) * w + x]; out[y * w + x] = c2 > 0 ? 1 : 0; } }
      return out;
    }
    function erodeBin(m, w, h, r) { var inv = new Uint8Array(m.length), i; for (i = 0; i < m.length; i++) inv[i] = 1 - m[i]; var d = dilateBin(inv, w, h, r); for (i = 0; i < d.length; i++) d[i] = 1 - d[i]; return d; }
    function keepMainBlobs(m, w, h) { // 4-connected blobs; keep the big ones, drop specks
      var n = w * h, lab = new Int32Array(n), stack = new Int32Array(n), areas = [], i, next = 1;
      for (i = 0; i < n; i++) { if (!m[i] || lab[i]) continue; var sp = 0, area = 0; stack[sp++] = i; lab[i] = next;
        while (sp) { var j = stack[--sp]; area++; var x = j % w;
          if (x > 0 && m[j - 1] && !lab[j - 1]) { lab[j - 1] = next; stack[sp++] = j - 1; }
          if (x < w - 1 && m[j + 1] && !lab[j + 1]) { lab[j + 1] = next; stack[sp++] = j + 1; }
          if (j >= w && m[j - w] && !lab[j - w]) { lab[j - w] = next; stack[sp++] = j - w; }
          if (j + w < n && m[j + w] && !lab[j + w]) { lab[j + w] = next; stack[sp++] = j + w; } }
        areas.push(area); next++; }
      if (!areas.length) return { mask: m, area: 0 };
      var largest = 0; for (i = 0; i < areas.length; i++) if (areas[i] > largest) largest = areas[i];
      var keep = new Uint8Array(next), total = 0;
      for (i = 0; i < areas.length; i++) if (areas[i] >= Math.max(0.12 * largest, 0.003 * n)) { keep[i + 1] = 1; total += areas[i]; }
      var out = new Uint8Array(n); for (i = 0; i < n; i++) if (lab[i] && keep[lab[i]]) out[i] = 1;
      return { mask: out, area: total };
    }
    function maskBBox(m, w, h) { var bb = [1e9, 1e9, -1e9, -1e9]; for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (m[y * w + x]) { if (x < bb[0]) bb[0] = x; if (x > bb[2]) bb[2] = x; if (y < bb[1]) bb[1] = y; if (y > bb[3]) bb[3] = y; } return bb[0] > bb[2] ? [0, 0, w, h] : bb; }
    // Marching squares on a zero-padded float field: every iso-line closes, so each comes back as a loop.
    function isoContours(F, W, H, T) {
      var segs = new Map(), x, y;
      function add(a, b) { var la = segs.get(a); if (!la) segs.set(a, la = []); la.push(b); var lb = segs.get(b); if (!lb) segs.set(b, lb = []); lb.push(a); }
      for (y = 0; y < H - 1; y++) for (x = 0; x < W - 1; x++) {
        var i = y * W + x, a = F[i], b = F[i + 1], c = F[i + W + 1], d = F[i + W];
        var idx = (a >= T ? 8 : 0) | (b >= T ? 4 : 0) | (c >= T ? 2 : 0) | (d >= T ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        var top = i * 2, right = (i + 1) * 2 + 1, bottom = (i + W) * 2, left = i * 2 + 1;
        switch (idx) {
          case 1: case 14: add(left, bottom); break;
          case 2: case 13: add(bottom, right); break;
          case 3: case 12: add(left, right); break;
          case 4: case 11: add(top, right); break;
          case 6: case 9: add(top, bottom); break;
          case 7: case 8: add(top, left); break;
          case 5: if ((a + b + c + d) / 4 >= T) { add(left, top); add(right, bottom); } else { add(top, right); add(left, bottom); } break;
          case 10: if ((a + b + c + d) / 4 >= T) { add(top, right); add(left, bottom); } else { add(top, left); add(right, bottom); } break;
        }
      }
      function pt(id) { var e = id & 1, cell = id >> 1, x0 = cell % W, y0 = (cell / W) | 0, f0 = F[cell], f1 = e ? F[cell + W] : F[cell + 1];
        var t = f1 === f0 ? 0.5 : (T - f0) / (f1 - f0); t = t < 0 ? 0 : t > 1 ? 1 : t; return e ? [x0, y0 + t] : [x0 + t, y0]; }
      var loops = [], visited = new Set();
      segs.forEach(function (nbrs, id) {
        if (visited.has(id) || nbrs.length !== 2) return;
        var loop = [], cur = id, prev = -1, guard = 0;
        while (!visited.has(cur) && guard++ < 4000000) { visited.add(cur); var q = pt(cur); loop.push(q[0], q[1]);
          var nb = segs.get(cur); if (!nb || nb.length !== 2) break; var nxt = nb[0] === prev ? nb[1] : nb[0]; prev = cur; cur = nxt; }
        if (loop.length >= 6) loops.push(loop); });
      return loops;
    }
    // Where the silhouette runs along the picture edge there is no tube: cut the loop into open runs.
    function splitAtBorder(loop, w, h) {
      var m = loop.length / 2, isB = new Uint8Array(m), any = 0, i, mg = Math.max(2, 0.02 * Math.max(w, h));
      for (i = 0; i < m; i++) { var x = loop[2 * i], y = loop[2 * i + 1]; if (x < mg || x > w - 1 - mg || y < mg || y > h - 1 - mg) { isB[i] = 1; any++; } }
      if (!any) return [{ p: loop, closed: true }];
      if (any === m) return [];
      var start = 0; for (i = 0; i < m; i++) if (isB[i] && !isB[(i + 1) % m]) { start = (i + 1) % m; break; }
      var runs = [], cur = [];
      for (i = 0; i < m; i++) { var k = (start + i) % m; if (isB[k]) { if (cur.length >= 6) runs.push({ p: cur, closed: false }); cur = []; } else cur.push(loop[2 * k], loop[2 * k + 1]); }
      if (cur.length >= 6) runs.push({ p: cur, closed: false });
      return runs;
    }
    function inflections(p, closed) {
      var q = closed ? rdp(p.concat([p[0], p[1]]), 1.5) : rdp(p, 1.5), n = q.length / 2, flips = 0, last = 0;
      for (var i = 1; i < n - 1; i++) { var ax = q[2 * i] - q[2 * i - 2], ay = q[2 * i + 1] - q[2 * i - 1], bx = q[2 * i + 2] - q[2 * i], by = q[2 * i + 3] - q[2 * i + 1];
        var cross = ax * by - ay * bx, dot = ax * bx + ay * by, ang = Math.atan2(Math.abs(cross), dot);
        if (ang < 0.26) continue; // under 15 degrees: not a real turn
        var sgn = cross > 0 ? 1 : -1; if (last && sgn !== last) flips++; last = sgn; }
      return flips;
    }
    // Where does the head end? Row widths of the mask: the head is the narrow run at the top, the shoulders
    // are where the width jumps. Returns the y below which lines count as clothing, or -1 when unsure.
    function faceZone(bin, w, bb) {
      var top = bb[1], H = Math.max(1, bb[3] - bb[1]), widths = new Float32Array(H + 1), y, x;
      for (y = 0; y <= H; y++) { var c = 0, row = (top + y) * w; for (x = bb[0]; x <= bb[2]; x++) c += bin[row + x]; widths[y] = c; }
      var a = Math.round(0.06 * H), b = Math.round(0.22 * H), sample = []; for (y = a; y <= b; y++) sample.push(widths[y]);
      sample.sort(function (p, q) { return p - q; }); var headW = sample.length ? sample[sample.length >> 1] : 0;
      if (headW < 8) return -1;
      for (y = b; y <= H; y++) if (widths[y] > 1.45 * headW) return top + Math.min(y + 0.04 * H, 0.62 * H);
      return top + 0.4 * H; // no shoulder step: a tight head crop
    }
    function closedRdp(p, closed, eps) { if (!closed) return rdp(p, eps); var q = rdp(p.concat([p[0], p[1]]), eps); return q.slice(0, q.length - 2); }
    // Returns false when the mask is unusable (then the heuristic path runs instead).
    function subjectTrace(job) {
      var t0 = now(), w = image.w, h = image.h, n = w * h, L = Math.max(w, h), d = job.detail, s = job.smooth, timing = {}, i;
      var key = image.id + '|S|' + s.toFixed(2);
      if (!cache.sub || cache.sub.key !== key) {
        self.postMessage({ type: 'progress', job: job.id, stage: 'Tracing the outline' });
        // 1. clean the mask: open, close, keep the main blobs, then blur + threshold for a calm silhouette
        var m = dilateBin(erodeBin(image.mask, w, h, 2), w, h, 2); m = erodeBin(dilateBin(m, w, h, 4), w, h, 4);
        var blobs = keepMainBlobs(m, w, h); m = blobs.mask;
        if (blobs.area < 0.02 * n || blobs.area > 0.96 * n) cache.sub = { key: key, none: true };
        else {
          var F = new Float32Array(n); for (i = 0; i < n; i++) F[i] = m[i] ? 255 : 0;
          F = gaussian(F, w, h, 2.2 + 3.8 * s);
          var bin = new Uint8Array(n); for (i = 0; i < n; i++) bin[i] = F[i] >= 127.5 ? 1 : 0;
          var W = w + 2, H = h + 2, PF = new Float32Array(W * H), y, x;
          for (y = 0; y < h; y++) for (x = 0; x < w; x++) PF[(y + 1) * W + x + 1] = F[y * w + x];
          var loops = isoContours(PF, W, H, 127.5), sil = [];
          for (i = 0; i < loops.length; i++) { var lp = loops[i]; for (var z = 0; z < lp.length; z++) lp[z] -= 1;
            var pieces = splitAtBorder(lp, w, h);
            for (var k = 0; k < pieces.length; k++) { var pc = pieces[k]; pc.len = plen(pc.p, pc.closed); if (pc.len >= 0.08 * L) sil.push(pc); } }
          if (!sil.length) cache.sub = { key: key, none: true };
          else {
            // 2. interior: edges only well inside the silhouette, at two scales. Coarse carries folds, jaw and
            // hairline; fine carries eyes, nose and mouth. Texture (skin, hair, fur) is handled by the bilateral
            // smoothing plus the texture penalty in edges(), and by the wiggliness test when scoring.
            var inner = erodeBin(bin, w, h, Math.round(5 + 4 * s));
            var base = bilateral(normalise(image.gray, n, bin), w, h, 10 + 18 * s);
            var eff = edges(gaussian(base, w, h, 1.6 + 1.2 * s), w, h, 1.6).eff, effF = edges(gaussian(base, w, h, 0.9 + 0.6 * s), w, h, 1.6).eff;
            for (i = 0; i < n; i++) if (!inner[i]) { eff[i] = 0; effF[i] = 0; }
            var silRas = new Uint8Array(n);
            for (i = 0; i < sil.length; i++) { var pp = sil[i].p; for (var q = 0; q < pp.length; q += 2) { var xi = Math.round(pp[q]), yi = Math.round(pp[q + 1]); if (xi >= 0 && yi >= 0 && xi < w && yi < h) silRas[yi * w + xi] = 1; } }
            var mb = maskBBox(bin, w, h);
            cache.sub = { key: key, none: false, sil: sil, eff: eff, effF: effF, near: dilateBin(silRas, w, h, 6), bbox: mb, coverage: blobs.area / n, faceBottom: image.label === 'person' ? faceZone(bin, w, mb) : -1 };
          }
        }
      }
      timing.prep = now() - t0;
      if (cache.sub.none) return false;
      var t1 = now(); self.postMessage({ type: 'progress', job: job.id, stage: 'Tracing tubes' });
      var S = cache.sub, Pm = params(d, s, w, h), bb = S.bbox, bbL = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
      var minLen = bbL * (0.05 - 0.025 * d), live = [], edge = null, chainsN = 0, hi = 0;
      function harvest(effX, topFrac, scale, nearCoarse) {
        var h2 = Math.max(14, Math.min(70, quantile(effX, n, topFrac))), lo = h2 * 0.4;
        var ed = hysteresis(effX, w, h, lo, h2), chains = link(ed, effX, w, h), k;
        for (k = 0; k < chains.length; k++) { var c = chains[k]; if (!c.closed && c.n <= Pm.spur && (c.rec[0].j < 0 || c.rec[1].j < 0)) c.alive = false; }
        mergeAtJunctions(chains, Pm.minDot); bridgeGaps(chains, Pm.gap + 2);
        for (k = 0; k < chains.length; k++) { var ch = chains[k]; if (!ch.alive) continue; ch.len = plen(ch.p, ch.closed); if (ch.len < minLen * (scale ? 0.8 : 1)) continue;
          var p = ch.p, mm = p.length / 2, on = 0, onC = 0, q2;
          for (q2 = 0; q2 < mm; q2++) { var pi = (p[2 * q2 + 1] | 0) * w + (p[2 * q2] | 0); if (S.near[pi]) on++; if (nearCoarse && nearCoarse[pi]) onC++; }
          if (on / mm > 0.5) continue; // retraces the silhouette
          if (nearCoarse && onC / mm > 0.6) continue; // fine copy of a coarse line
          measure(ch, w, h);
          // wiggliness: how often the simplified line changes turning direction, per 20 px. An eye, a brow or
          // a jaw is one smooth arc (0 flips, whatever its size); fur and hair strands zigzag (many flips).
          ch.wiggle = inflections(p, ch.closed) / Math.max(1, ch.len / 20);
          ch.scale = scale; ch.hi = h2; live.push(ch); }
        return { edge: ed, n: chains.length, hi: h2 };
      }
      var C = harvest(S.eff, 0.10 + 0.30 * d, 0, null); edge = C.edge; chainsN += C.n; hi = C.hi;
      var F = harvest(S.effF, 0.05 + 0.25 * d, 1, dilate3(C.edge, w, h)); chainsN += F.n;
      var chains = { length: chainsN };
      for (i = 0; i < live.length; i++) { var ch = live[i];
        var shape = ch.scale === 0 ? 1.3 : 1, bbH = Math.max(1, bb[3] - bb[1]), rel = (ch.cy - bb[1]) / bbH; // rel: 0 = top of the subject, 1 = bottom
        var fb = S.faceBottom, inFace = fb > 0 ? ch.cy < fb : rel < 0.5, clothing = fb > 0 ? ch.cy > fb + 0.08 * bbH : rel > 0.6;
        if (ch.closed) { var small = Math.hypot(ch.bw, ch.bh) < 0.25 * bbL; shape *= small ? 2.4 : 1.3; // eyes, nostrils, glasses, a collar
          if (small && !inFace) shape *= 0.3; } // ...but a small loop low on the body is a button or a print
        else {
          if (ch.wiggle > 0.5) shape *= 0.12; // fur, hair strands, lace: zigzags whatever its length
          else if (ch.wiggle > 0.25 && ch.len < 0.25 * bbL) shape *= 0.45;
          if (ch.len < 0.05 * bbL) shape *= 0.6; // a stub
          if (ch.straight > 0.95 && ch.len > 0.3 * bbL) shape *= 0.6; // a long ruler inside a body is usually clothing or background bleed
        }
        // the face is what people buy: lift everything in the head zone, dim clothing below the shoulders
        if (inFace) shape *= fb > 0 ? 2.2 : 1.3;
        else if (clothing) shape *= ch.len > 0.35 * bbL ? 0.7 : 0.4;
        var strength = 0.6 + 0.25 * Math.min(2, ch.s / ch.hi);
        ch.score = Math.pow(ch.len, 1.2) * strength * shape; }
      live.sort(function (a, b) { return b.score - a.score; });
      var budget = bbL * (0.9 + 3.2 * d + 1.6 * d * d), maxPaths = Math.round(4 + 30 * d), kept = [], total = 0;
      // the floor is low on purpose: one long hairline or jaw chain must not drown the eyes
      var floor = live.length ? live[0].score * (0.04 - 0.03 * d) : 0;
      for (i = 0; i < live.length && kept.length < maxPaths; i++) { if (live[i].score < floor) break; if (kept.length && total + live[i].len > budget) continue; kept.push(live[i]); total += live[i].len; }
      var items = [], sEps = 1.0 + 1.2 * s;
      for (i = 0; i < S.sil.length; i++) { var sp = S.sil[i]; items.push({ p: chaikin(closedRdp(sp.p, sp.closed, sEps), sp.closed, 3), closed: sp.closed, kind: 0 }); }
      for (i = 0; i < kept.length; i++) { var kp = kept[i]; items.push({ p: chaikin(closedRdp(kp.p, kp.closed, Pm.eps), kp.closed, Pm.iters), closed: kp.closed, kind: 1 }); }
      var debug = job.debug ? live.slice(0, 80).map(function (c) { return { len: Math.round(c.len), score: Math.round(c.score), scale: c.scale, closed: c.closed ? 1 : 0, straight: +c.straight.toFixed(2), wiggle: +(c.wiggle || 0).toFixed(2), s: Math.round(c.s), cx: Math.round(c.cx), cy: Math.round(c.cy), face: S.faceBottom > 0 ? (c.cy < S.faceBottom ? 1 : 0) : -1, kept: kept.indexOf(c) >= 0 ? 1 : 0 }; }) : undefined;
      timing.trace = now() - t1; timing.total = now() - t0;
      pack(job, items, timing, { subject: true, label: image.label, edgePixels: countEdges(edge), chains: chains.length, kept: kept.length, candidates: live.length, silhouette: S.sil.length, coverage: S.coverage, faceBottom: S.faceBottom, hi: hi, debug: debug });
      return true;
    }
    // Shared result packing: flat coords + per-path offsets, closed flags, kind (0 silhouette, 1 detail) and lengths.
    function pack(job, items, timing, stats) {
      var coords = [], offsets = [0], closed = [], kind = [], plens = [], total = 0, bb = [1e9, 1e9, -1e9, -1e9], i;
      for (i = 0; i < items.length; i++) { var p = items[i].p;
        for (var z = 0; z < p.length; z += 2) { coords.push(p[z], p[z + 1]); if (p[z] < bb[0]) bb[0] = p[z]; if (p[z] > bb[2]) bb[2] = p[z]; if (p[z + 1] < bb[1]) bb[1] = p[z + 1]; if (p[z + 1] > bb[3]) bb[3] = p[z + 1]; }
        offsets.push(coords.length); closed.push(items[i].closed ? 1 : 0); kind.push(items[i].kind); var Lp = plen(p, items[i].closed); plens.push(Lp); total += Lp; }
      if (!items.length) bb = [0, 0, image.w, image.h];
      stats.lengthPx = total; stats.timing = timing;
      var out = { type: 'result', job: job.id, w: image.w, h: image.h, coords: new Float32Array(coords), offsets: new Uint32Array(offsets), closed: new Uint8Array(closed), kind: new Uint8Array(kind), plens: new Float32Array(plens), bbox: bb, stats: stats };
      self.postMessage(out, [out.coords.buffer, out.offsets.buffer, out.closed.buffer, out.kind.buffer, out.plens.buffer]);
    }

    function trace(job) {
      if (image.mask && subjectTrace(job)) return;
      var t0 = now(), w = image.w, h = image.h, P = params(job.detail, job.smooth, w, h), timing = {}, i;
      self.postMessage({ type: 'progress', job: job.id, stage: 'Finding edges' });
      prepare(P); timing.edges = now() - t0;
      var t1 = now();
      self.postMessage({ type: 'progress', job: job.id, stage: 'Tracing tubes' });
      var C = extract(cache.effC, w, h, P, P.topFracC, 0), F = extract(cache.effF, w, h, P, P.topFracF, 1);
      // fine chains that just retrace a coarse contour are duplicates
      var near = dilate3(C.edge, w, h), live = C.live.slice();
      for (i = 0; i < F.live.length; i++) { var f = F.live[i], p = f.p, m = p.length / 2, on = 0;
        for (var q = 0; q < m; q++) if (near[(p[2 * q + 1] | 0) * w + (p[2 * q] | 0)]) on++;
        if (on / m < 0.6) live.push(f); }
      // many straight axis-aligned lines = floorboards, blinds, brickwork
      var straightAxis = 0; for (i = 0; i < live.length; i++) if (!live[i].closed && live[i].straight > 0.93 && live[i].chord > 0.12 * Math.max(w, h) && live[i].axisAng < 7) straightAxis++;
      var parallelPattern = straightAxis >= 5;
      for (i = 0; i < live.length; i++) live[i].score = scoreChain(live[i], w, h, live[i].hi, P, parallelPattern);
      live.sort(function (a, b) { return b.score - a.score; });
      var kept = [], total = 0, hi = C.hi, chains = { length: C.raw + F.raw }, edge = C.edge;
      // a clean graphic (logo, line art) has few raw chains: everything in it is deliberate, so keep more
      var budget = P.budget * (C.raw < 80 ? 2.5 : C.raw < 200 ? 1.5 : 1);
      // clutter floor: anything scoring far below the best line is noise at this detail level
      var floor = live.length ? live[0].score * (0.045 - 0.04 * job.detail) : 0;
      for (i = 0; i < live.length && kept.length < P.maxPaths; i++) { if (live[i].score < floor) break; if (kept.length && total + live[i].len > budget) continue; kept.push(live[i]); total += live[i].len; }
      var debug = job.debug ? live.slice(0, 160).map(function (c) { return { len: Math.round(c.len), score: Math.round(c.score), scale: c.scale, closed: c.closed ? 1 : 0, straight: +c.straight.toFixed(2), ang: Math.round(c.axisAng), s: Math.round(c.s), cx: Math.round(c.cx), cy: Math.round(c.cy), fe: c.exits * 100 + c.sideEnds * 10 + c.topEnds, x0: Math.round(c.p[0]), y0: Math.round(c.p[1]), x1: Math.round(c.p[c.p.length - 2]), y1: Math.round(c.p[c.p.length - 1]), kept: kept.indexOf(c) >= 0 ? 1 : 0 }; }) : undefined;
      // simplify + smooth
      var items = [];
      for (i = 0; i < kept.length; i++) { var k = kept[i]; items.push({ p: chaikin(closedRdp(k.p, k.closed, P.eps), k.closed, P.iters), closed: k.closed, kind: 1 }); }
      timing.trace = now() - t1; timing.total = now() - t0;
      pack(job, items, timing, { subject: false, edgePixels: countEdges(edge), chains: chains.length, kept: kept.length, candidates: live.length, coarse: C.live.length, fine: F.live.length, parallelPattern: parallelPattern, hi: hi, debug: debug });
    }
    function countEdges(edge) { var c = 0; for (var i = 0; i < edge.length; i++) c += edge[i]; return c; }

    self.onmessage = function (ev) {
      var m = ev.data;
      try {
        if (m.type === 'image') { image = { id: m.id, gray: m.gray, w: m.w, h: m.h, mask: null }; cache = { key: '', effC: null, effF: null, sub: null }; }
        else if (m.type === 'mask') { if (m.id === image.id) { image.mask = m.mask; image.label = m.label || 'subject'; cache.sub = null; } }
        else if (m.type === 'trace') { if (!image.gray) throw new Error('no image'); trace(m); }
      } catch (err) { self.postMessage({ type: 'error', job: m.job || m.id, message: String(err && err.message || err) }); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Styles (scoped under .lnp)                                           */
  /* ------------------------------------------------------------------ */
  var CSS = [
    '.lnp{container-type:inline-size;display:block;color:var(--lnp-text,#1f2026);font-family:var(--lnp-font,inherit);font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased;--lnp-on-accent:#fff;--lnp-on-wall:#f3f1ec;--lnp-on-wall-muted:rgba(243,241,236,.68)}',
    '.lnp *,.lnp *::before,.lnp *::after{box-sizing:border-box}',
    '.lnp [hidden]{display:none!important}',
    '.lnp p{margin:0}',
    '.lnp :focus-visible{outline:2px solid var(--lnp-accent,#1f2026);outline-offset:2px}',
    '.lnp-stage :focus-visible{outline-color:var(--lnp-on-wall)}',
    '.lnp-grid{display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}',
    '@container (min-width:760px){.lnp-grid[data-cols="2"]{grid-template-columns:minmax(0,1.65fr) minmax(280px,1fr);align-items:start}}',
    '.lnp-stage{position:relative;background:var(--lnp-wall,#17181e);border-radius:var(--lnp-radius,14px);overflow:hidden;color:var(--lnp-on-wall);transition:box-shadow .15s}',
    '.lnp-stage.lnp-over{box-shadow:inset 0 0 0 3px var(--lnp-on-wall)}',
    '.lnp-drop{min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px 28px;gap:10px;position:relative}',
    '.lnp-hint{width:92px;height:92px;opacity:.5;margin-bottom:6px}',
    '.lnp-hint path{fill:none;stroke:var(--lnp-on-wall);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;opacity:.55}',
    '.lnp-hint .lnp-hint-core{stroke-width:.8;opacity:.9}',
    '.lnp-drop-title{font-size:19px;font-weight:600;letter-spacing:-.01em}',
    '.lnp-drop-sub{color:var(--lnp-on-wall-muted);max-width:34ch}',
    '.lnp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center}',
    '.lnp-drop .lnp-row{margin-top:10px}',
    '.lnp-btn{appearance:none;border:1px solid var(--lnp-line,rgba(31,32,38,.14));background:var(--lnp-surface,#fff);color:var(--lnp-text,#1f2026);border-radius:calc(var(--lnp-radius,14px) - 4px);padding:10px 18px;font:inherit;font-weight:600;line-height:1.2;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:8px}',
    '.lnp-btn:hover{filter:brightness(.97)}',
    '.lnp-btn:disabled{opacity:.55;cursor:default}',
    '.lnp-primary{background:var(--lnp-accent,#1f2026);color:var(--lnp-on-accent);border-color:transparent}',
    '.lnp-primary:hover{filter:brightness(1.08)}',
    '.lnp-ghost{background:rgba(255,255,255,.12);color:var(--lnp-on-wall);border-color:rgba(255,255,255,.22)}',
    '.lnp-ghost:hover{background:rgba(255,255,255,.18);filter:none}',
    '.lnp-stage[data-wall="light"] .lnp-ghost{background:rgba(0,0,0,.08);border-color:rgba(0,0,0,.18)}',
    '.lnp-note{font-size:13px;color:var(--lnp-muted,#6d6f7a)}',
    '.lnp-drop .lnp-note{color:var(--lnp-on-wall-muted);margin-top:14px}',
    '.lnp-out,.lnp-live{display:block;width:100%;height:auto}',
    '.lnp-result{position:relative}',
    '.lnp-result.lnp-busy .lnp-out{opacity:.6;transition:opacity .2s}',
    '.lnp-progress{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.28);text-align:center;padding:24px}',
    '.lnp-bar{width:min(220px,60%);height:3px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden;position:relative}',
    '.lnp-bar::after{content:"";position:absolute;inset:0;width:40%;border-radius:2px;background:var(--lnp-neon,#ff3db4);box-shadow:0 0 12px var(--lnp-neon,#ff3db4);animation:lnp-slide 1.1s ease-in-out infinite alternate}',
    '@keyframes lnp-slide{from{transform:translateX(-10%)}to{transform:translateX(160%)}}',
    '.lnp-progress-text{font-weight:600}',
    '.lnp-cam{position:relative;background:#000}',
    '.lnp-cam video{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
    '.lnp-cam-bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;justify-content:center;padding:14px;background:linear-gradient(to top,rgba(0,0,0,.6),rgba(0,0,0,0))}',
    '.lnp-cam-msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;text-align:center;background:var(--lnp-wall,#17181e);color:var(--lnp-on-wall)}',
    '.lnp-cam-msg p{max-width:36ch;color:var(--lnp-on-wall)}',
    '.lnp-cam-tip{position:absolute;top:14px;left:0;right:0;text-align:center;font-size:13px;color:var(--lnp-on-wall-muted);text-shadow:0 1px 2px rgba(0,0,0,.6)}',
    '.lnp-panel{background:var(--lnp-surface,#fff);border:1px solid var(--lnp-line,rgba(31,32,38,.14));border-radius:var(--lnp-radius,14px);padding:20px;display:grid;gap:18px}',
    '.lnp-group{display:grid;gap:14px;padding-bottom:18px;border-bottom:1px solid var(--lnp-line,rgba(31,32,38,.14))}',
    '.lnp-group:last-child{border-bottom:0;padding-bottom:0}',
    '.lnp-field{display:grid;gap:4px}',
    '.lnp-label{font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:baseline}',
    '.lnp-label small{font-weight:400;color:var(--lnp-muted,#6d6f7a);font-size:13px}',
    '.lnp-ends{display:flex;justify-content:space-between;font-size:12.5px;color:var(--lnp-muted,#6d6f7a)}',
    '.lnp input[type=range]{width:100%;accent-color:var(--lnp-accent,#1f2026);margin:0;height:28px;cursor:pointer}',
    '.lnp-swatches{display:flex;flex-wrap:wrap;gap:12px;border:0;padding:4px 2px 2px;margin:0;min-width:0}',
    '.lnp-swatches legend{padding:0;font-weight:600;font-size:14px;margin-bottom:2px}',
    '.lnp-sw{width:30px;height:30px;border-radius:50%;border:0;padding:0;background:var(--c);box-shadow:0 0 0 2px var(--lnp-surface,#fff),0 0 10px -1px var(--c);cursor:pointer;flex:none}',
    '.lnp-sw[aria-pressed="true"]{box-shadow:0 0 0 2px var(--lnp-surface,#fff),0 0 0 4px var(--lnp-text,#1f2026),0 0 16px var(--c)}',
    '.lnp-sw.lnp-unlit{background:linear-gradient(135deg,#f3efe6,#cfc9bd)}',
    '.lnp-check{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px;cursor:pointer;min-height:28px}',
    '.lnp-check input{width:18px;height:18px;margin:0;accent-color:var(--lnp-accent,#1f2026)}',
    '.lnp-seg{display:inline-flex;border:1px solid var(--lnp-line,rgba(31,32,38,.14));border-radius:999px;padding:3px;gap:2px;align-self:start}',
    '.lnp-seg button{border:0;background:transparent;padding:7px 14px;border-radius:999px;font:inherit;font-weight:600;color:var(--lnp-muted,#6d6f7a);cursor:pointer;min-height:36px}',
    '.lnp-seg button[aria-pressed="true"]{background:var(--lnp-text,#1f2026);color:var(--lnp-surface,#fff)}',
    '.lnp-subject{color:var(--lnp-muted,#6d6f7a);font-size:13.5px;margin:-4px 0 -6px}',
    '.lnp-subject strong{color:var(--lnp-text,#1f2026);font-weight:600}',
    '.lnp-meta{color:var(--lnp-muted,#6d6f7a);font-size:14px}',
    '.lnp-meta strong{color:var(--lnp-text,#1f2026);font-weight:600}',
    '.lnp-cta{width:100%;min-height:52px;font-size:16px}',
    '.lnp-link{appearance:none;background:none;border:0;padding:6px 0;color:var(--lnp-text,#1f2026);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--lnp-line,rgba(31,32,38,.3));font:inherit;cursor:pointer}',
    '.lnp-link:hover{text-decoration-color:currentColor}',
    '.lnp-actions{display:flex;flex-wrap:wrap;gap:4px 18px;align-items:center}',
    '.lnp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '@media (prefers-reduced-motion:reduce){.lnp *,.lnp *::after{animation:none!important;transition:none!important}.lnp-bar::after{width:100%}}'
  ].join('\n');

  function injectCSS() {
    if (document.querySelector('style[data-lnp]')) return;
    var s = document.createElement('style'); s.setAttribute('data-lnp', ''); s.textContent = CSS; document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  var parseCanvas = null;
  function parseColour(str, fallback) {
    if (!str) return fallback;
    try { if (!parseCanvas) parseCanvas = document.createElement('canvas').getContext('2d');
      parseCanvas.fillStyle = '#000'; parseCanvas.fillStyle = String(str).trim(); var v = parseCanvas.fillStyle;
      var m;
      if ((m = /^#([0-9a-f]{6})$/i.exec(v))) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      if ((m = /^rgba?\(([^)]+)\)/i.exec(v))) { var p = m[1].split(',').map(parseFloat); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
    } catch (e) { /* ignore */ }
    return fallback;
  }
  function hexOf(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function luma(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function hue(c) { var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
    var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360; }
  function el(tag, attrs, children) { var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else if (attrs[k] === false || attrs[k] == null) return; else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); }); return e; }
  var WORK = 720;
  var HEART = 'M12 20.5s-7.2-4.4-9.2-8.8C1.4 8.4 3.4 4.8 6.8 4.8c2.1 0 3.5 1.2 5.2 3.3 1.7-2.1 3.1-3.3 5.2-3.3 3.4 0 5.4 3.6 4 6.9-2 4.4-9.2 8.8-9.2 8.8z';

  /* ------------------------------------------------------------------ */
  /* Subject segmentation: MediaPipe Tasks Vision, lazy, on the device   */
  /* ------------------------------------------------------------------ */
  var SEG_DEFAULTS = {
    bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs',
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    model: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
    timeout: 25000,
    delegate: 'CPU'
  };
  var VOC_PERSON = 15, VOC_ANIMALS = [3, 8, 10, 12, 13, 17]; // PASCAL VOC: bird cat cow dog horse sheep
  var segShared = { promise: null, failed: null, loadMs: 0, delegate: null, quiet: false };
  // The MediaPipe/TFLite runtime prints its own start-up chatter through console.error/warn ("INFO: Created
  // TensorFlow Lite XNNPACK delegate", "W1007 ... gl_context.cc] OpenGL error checking is disabled", ...). It is
  // not an error and would alarm anyone watching the console, so once the segmenter is in use those runtime
  // log lines are dropped; every other message passes through untouched.
  var MP_LOG = /^(INFO: Created TensorFlow Lite|[IWEF]\d{4} \d\d:\d\d:\d\d\.\d+ \d+ [\w./-]+\.(?:cc|h):\d+\])/;
  function quietRuntimeLogs() {
    if (segShared.quiet) return; segShared.quiet = true;
    ['error', 'warn'].forEach(function (level) { var orig = console[level]; if (typeof orig !== 'function') return;
      console[level] = function () { if (arguments.length && typeof arguments[0] === 'string' && MP_LOG.test(arguments[0])) return; return orig.apply(console, arguments); }; });
  }
  function loadSegmenter(cfg) {
    if (segShared.promise) return segShared.promise;
    quietRuntimeLogs();
    var t0 = performance.now();
    segShared.promise = import(cfg.bundle).then(function (mod) {
      return mod.FilesetResolver.forVisionTasks(cfg.wasm).then(function (vision) {
        var make = function (delegate) { return mod.ImageSegmenter.createFromOptions(vision, { baseOptions: { modelAssetPath: cfg.model, delegate: delegate }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false }).then(function (seg) { segShared.delegate = delegate; return seg; }); };
        // CPU (XNNPACK) by default: DeepLab at 257 px runs in well under a second and keeps the console clean;
        // the GPU delegate logs gl_context warnings on every frame. Opt in with opts.segmenter.delegate = 'GPU'.
        var want = cfg.delegate === 'GPU' ? 'GPU' : 'CPU';
        return make(want).catch(function () { return want === 'GPU' ? make('CPU') : Promise.reject(new Error('segmenter unavailable')); });
      });
    }).then(function (seg) { segShared.loadMs = Math.round(performance.now() - t0); return seg; })
      .catch(function (err) { segShared.failed = String(err && err.message || err); return null; });
    return segShared.promise;
  }
  function segmentCanvas(seg, canvas) {
    var t0 = performance.now(), res = seg.segment(canvas), mask = res.categoryMask;
    var out = { data: new Uint8Array(mask.getAsUint8Array()), w: mask.width, h: mask.height, ms: 0 };
    res.close(); out.ms = Math.round(performance.now() - t0); return out;
  }
  // category mask -> 0/1 subject mask at the working size, or null when no person/pet is big enough
  function subjectMask(cat, w, h) {
    var n = cat.w * cat.h, counts = new Uint32Array(32), i; for (i = 0; i < n; i++) counts[cat.data[i] & 31]++;
    var person = counts[VOC_PERSON], animal = 0; for (i = 0; i < VOC_ANIMALS.length; i++) animal += counts[VOC_ANIMALS[i]];
    var minArea = 0.02 * n, usePerson = person >= minArea, useAnimal = animal >= minArea;
    if (!usePerson && !useAnimal) return null;
    var want = new Uint8Array(32); if (usePerson) want[VOC_PERSON] = 1; if (useAnimal) for (i = 0; i < VOC_ANIMALS.length; i++) want[VOC_ANIMALS[i]] = 1;
    var mask = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) { var sy = Math.min(cat.h - 1, (y * cat.h / h) | 0); for (var x = 0; x < w; x++) { var sx = Math.min(cat.w - 1, (x * cat.w / w) | 0); mask[y * w + x] = want[cat.data[sy * cat.w + sx] & 31]; } }
    return { mask: mask, label: person >= animal ? 'person' : 'pet', coverage: (person + animal) / n };
  }

  function makeWorker(onMessage) {
    try {
      var src = '(' + engineMain.toString() + ')(self);';
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      var w = new Worker(url); URL.revokeObjectURL(url);
      w.onmessage = function (ev) { onMessage(ev.data); };
      return { post: function (m, t) { w.postMessage(m, t || []); }, terminate: function () { w.terminate(); }, inline: false };
    } catch (e) {
      var fake = { postMessage: function (m) { onMessage(m); } };
      engineMain(fake);
      return { post: function (m) { setTimeout(function () { fake.onmessage({ data: m }); }, 0); }, terminate: function () {}, inline: true };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mount                                                                */
  /* ------------------------------------------------------------------ */
  function mount(container, opts) {
    if (!container) throw new Error('LitNeonPhoto.mount: container required');
    opts = opts || {};
    injectCSS();
    var palette = (opts.palette || []).filter(function (c) { return c && c.hex && !c.rgb; });
    if (!palette.length) palette = [{ id: 'pink', name: 'Hot pink', hex: '#ff3db4' }, { id: 'ice', name: 'Ice blue', hex: '#4fd2ff' }, { id: 'warm', name: 'Warm white', hex: '#ffc77a', core: '#fff6e6' }];
    var state = {
      colour: opts.colour || palette[0].hex, colour2: null, twoTone: false, lights: true,
      detail: 50, thickness: 50, smooth: 50, source: null,
      w: 0, h: 0, coords: null, offsets: null, closed: null, kind: null, plens: null, vis: null, bbox: null, stats: null, imageId: 0, job: 0, pending: 0, destroyed: false,
      subject: null, hasSubject: false, outlineOnly: false, segMs: { load: 0, infer: 0 }
    };
    var segCfg = opts.segmenter === false ? null : Object.assign({}, SEG_DEFAULTS, opts.segmenter || {});
    if (!state.colour2) { var h1 = hue(parseColour(state.colour, [255, 61, 180])), best = null, bd = -1;
      palette.forEach(function (c) { var d = Math.abs(hue(parseColour(c.hex, [0, 0, 0])) - h1); d = Math.min(d, 360 - d); if (d > bd) { bd = d; best = c; } });
      state.colour2 = best ? best.hex : state.colour; }

    /* ---- DOM ---- */
    var root = el('div', { class: 'lnp' });
    var hintSvg = '<svg class="lnp-hint" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + HEART + '"/><path class="lnp-hint-core" d="' + HEART + '"/></svg>';
    var fileInput = el('input', { type: 'file', accept: 'image/*', class: 'lnp-sr', 'aria-label': 'Choose a photo' });
    var btnChoose = el('button', { type: 'button', class: 'lnp-btn lnp-primary', text: 'Choose a photo' });
    var btnCamera = el('button', { type: 'button', class: 'lnp-btn lnp-ghost', text: 'Use camera' });
    var drop = el('div', { class: 'lnp-drop' }, [
      el('div', { html: hintSvg }),
      el('p', { class: 'lnp-drop-title', text: 'Drop a photo here' }),
      el('p', { class: 'lnp-drop-sub', text: 'A face, a pet, a logo or a building works best. We trace it into glowing neon tubes you can order.' }),
      el('div', { class: 'lnp-row' }, [btnChoose, btnCamera]),
      el('p', { class: 'lnp-note', text: 'Your photo stays on this device. Nothing is uploaded.' }),
      fileInput
    ]);
    var video = el('video', { playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true' }); video.muted = true;
    var live = el('canvas', { class: 'lnp-live', 'aria-label': 'Live neon preview from your camera' });
    var btnCapture = el('button', { type: 'button', class: 'lnp-btn lnp-primary', text: 'Capture' });
    var btnFlip = el('button', { type: 'button', class: 'lnp-btn lnp-ghost', text: 'Switch camera', hidden: true });
    var btnCancel = el('button', { type: 'button', class: 'lnp-btn lnp-ghost', text: 'Cancel' });
    var camMsgText = el('p');
    var btnCamRetry = el('button', { type: 'button', class: 'lnp-btn lnp-ghost', text: 'Resume camera', hidden: true });
    var btnCamUpload = el('button', { type: 'button', class: 'lnp-btn lnp-primary', text: 'Choose a photo instead' });
    var camMsg = el('div', { class: 'lnp-cam-msg', role: 'status', hidden: true }, [camMsgText, el('div', { class: 'lnp-row' }, [btnCamRetry, btnCamUpload])]);
    var cam = el('div', { class: 'lnp-cam', hidden: true }, [video, live, el('p', { class: 'lnp-cam-tip', text: 'Point the camera at your subject, then capture.' }), el('div', { class: 'lnp-cam-bar' }, [btnCancel, btnCapture, btnFlip]), camMsg]);
    var out = el('canvas', { class: 'lnp-out', role: 'img', 'aria-label': 'Your photo as a neon sign' });
    var progressText = el('span', { class: 'lnp-progress-text', text: 'Tracing your photo' });
    var progress = el('div', { class: 'lnp-progress', role: 'status', 'aria-live': 'polite', hidden: true }, [el('span', { class: 'lnp-bar' }), progressText]);
    var result = el('div', { class: 'lnp-result', hidden: true }, [out, progress]);
    var stage = el('div', { class: 'lnp-stage' }, [drop, cam, result]);

    // controls
    var uid = 'lnp' + Math.random().toString(36).slice(2, 8);
    function slider(name, label, lo, hi, value) {
      var input = el('input', { type: 'range', min: 0, max: 100, step: 1, value: value, id: uid + name, 'data-ctl': name });
      var field = el('div', { class: 'lnp-field' }, [el('label', { class: 'lnp-label', for: uid + name, text: label }), input, el('div', { class: 'lnp-ends', 'aria-hidden': 'true' }, [el('span', { text: lo }), el('span', { text: hi })])]);
      return { field: field, input: input };
    }
    var sDetail = slider('detail', 'Detail', 'Simpler', 'More lines', state.detail);
    var sThick = slider('thickness', 'Tube thickness', 'Fine', 'Bold', state.thickness);
    var sSmooth = slider('smooth', 'Smoothness', 'Crisp', 'Flowing', state.smooth);
    function swatchRow(legendText, which) {
      var fs = el('fieldset', { class: 'lnp-swatches' }, [el('legend', { text: legendText })]);
      palette.forEach(function (c) {
        var b = el('button', { type: 'button', class: 'lnp-sw', 'data-hex': c.hex, 'data-which': which, 'aria-label': c.name || c.hex, title: c.name || c.hex, 'aria-pressed': 'false' });
        b.style.setProperty('--c', c.hex); fs.appendChild(b);
      });
      return fs;
    }
    var swatches1 = swatchRow('Colour', '1');
    var swatches2 = swatchRow('Second colour (outer lines)', '2'); swatches2.hidden = true;
    var twoToneInput = el('input', { type: 'checkbox', id: uid + 'two' });
    var twoTone = el('label', { class: 'lnp-check', for: uid + 'two' }, [twoToneInput, el('span', { text: 'Two-tone' })]);
    var outlineInput = el('input', { type: 'checkbox', id: uid + 'outline' });
    var outline = el('label', { class: 'lnp-check', for: uid + 'outline', hidden: true }, [outlineInput, el('span', { text: 'Outline only' })]);
    var subjectLine = el('p', { class: 'lnp-subject', 'aria-live': 'polite', text: 'Subject: graphic' });
    var btnOn = el('button', { type: 'button', 'aria-pressed': 'true', text: 'Lights on' });
    var btnOff = el('button', { type: 'button', 'aria-pressed': 'false', text: 'Lights off' });
    var seg = el('div', { class: 'lnp-seg', role: 'group', 'aria-label': 'Lights' }, [btnOn, btnOff]);
    var meta = el('p', { class: 'lnp-meta', 'aria-live': 'polite' });
    var btnQuote = el('button', { type: 'button', class: 'lnp-btn lnp-primary lnp-cta', text: 'Get a quote for this design' });
    var btnDownload = el('button', { type: 'button', class: 'lnp-link', text: 'Download PNG' });
    var btnReset = el('button', { type: 'button', class: 'lnp-link', text: 'Try another photo' });
    var panel = el('div', { class: 'lnp-panel', hidden: true }, [
      el('div', { class: 'lnp-group' }, [subjectLine, swatches1, twoTone, swatches2, outline, seg]),
      el('div', { class: 'lnp-group' }, [sDetail.field, sThick.field, sSmooth.field]),
      el('div', { class: 'lnp-group' }, [meta, btnQuote, el('div', { class: 'lnp-actions' }, [btnDownload, btnReset]), el('p', { class: 'lnp-note', text: 'Your photo stays on this device. Only the neon design is sent with your quote.' })])
    ]);
    var grid = el('div', { class: 'lnp-grid', 'data-cols': '1' }, [stage, panel]);
    root.appendChild(grid);
    container.innerHTML = ''; container.appendChild(root);

    /* ---- theme reads ---- */
    function theme() {
      var cs = getComputedStyle(root);
      var wall = parseColour(cs.getPropertyValue('--lnp-wall'), [23, 24, 30]);
      var accent = parseColour(cs.getPropertyValue('--lnp-accent'), [31, 32, 38]);
      root.style.setProperty('--lnp-on-accent', luma(accent) > 0.6 ? '#1f2026' : '#fff');
      var lightWall = luma(wall) > 0.55;
      root.style.setProperty('--lnp-on-wall', lightWall ? '#1f2026' : '#f3f1ec');
      root.style.setProperty('--lnp-on-wall-muted', lightWall ? 'rgba(31,32,38,.66)' : 'rgba(243,241,236,.68)');
      stage.setAttribute('data-wall', lightWall ? 'light' : 'dark');
      root.style.setProperty('--lnp-neon', state.colour);
      return { wall: wall, lightWall: lightWall };
    }
    theme();

    /* ---- worker ---- */
    var worker = makeWorker(onWorkerMessage);
    var progressTimer = null;
    function onWorkerMessage(m) {
      if (state.destroyed) return;
      if (m.type === 'progress') { if (m.job === state.job) progressText.textContent = m.stage; return; }
      if (m.type === 'error') { console.error('LitNeonPhoto: ' + m.message); endBusy(); showEmpty(); return; }
      if (m.type !== 'result' || m.job !== state.job) return;
      state.w = m.w; state.h = m.h; state.coords = m.coords; state.offsets = m.offsets; state.closed = m.closed; state.kind = m.kind; state.plens = m.plens; state.stats = m.stats;
      state.hasSubject = !!(m.stats && m.stats.subject); if (!state.hasSubject) state.subject = null;
      applyVisibility(); syncSubjectUI();
      endBusy();
      render('trace');
    }
    function beginBusy(label) {
      state.pending++;
      result.classList.add('lnp-busy');
      clearTimeout(progressTimer);
      progressTimer = setTimeout(function () { if (state.pending) { progressText.textContent = label || 'Tracing your photo'; progress.hidden = false; } }, state.coords ? 220 : 0);
    }
    function endBusy() { state.pending = 0; clearTimeout(progressTimer); progress.hidden = true; result.classList.remove('lnp-busy'); }

    var traceTimer = null, traceStart = 0, intakeStart = 0;
    function requestTrace(immediate) {
      clearTimeout(traceTimer);
      var go = function () { if (state.destroyed || !state.imageId) return; state.job++; traceStart = performance.now(); beginBusy();
        worker.post({ type: 'trace', id: state.job, detail: state.detail / 100, smooth: state.smooth / 100 }); };
      if (immediate) go(); else traceTimer = setTimeout(go, 90);
    }

    /* ---- image intake ---- */
    var work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true }), segCanvas = document.createElement('canvas');
    function toGray(drawable, dw, dh, mirror) {
      var k = WORK / Math.max(dw, dh), w = Math.max(16, Math.round(dw * k)), h = Math.max(16, Math.round(dh * k));
      // big photos: halve step by step so the downscale is area-averaged, not aliased (aliasing = speckle edges)
      var src = drawable, sw = dw, sh = dh;
      while (sw > 2 * w) { var nw = Math.round(sw / 2), nh = Math.round(sh / 2), tmp = document.createElement('canvas'); tmp.width = nw; tmp.height = nh;
        var tctx = tmp.getContext('2d'); tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high'; tctx.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh); src = tmp; sw = nw; sh = nh; }
      work.width = w; work.height = h;
      wctx.save(); wctx.fillStyle = '#fff'; wctx.fillRect(0, 0, w, h); wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = 'high';
      if (mirror) { wctx.translate(w, 0); wctx.scale(-1, 1); }
      wctx.drawImage(src, 0, 0, sw, sh, 0, 0, w, h); wctx.restore();
      var d = wctx.getImageData(0, 0, w, h).data, gray = new Uint8ClampedArray(w * h);
      for (var i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114 + 0.5) | 0;
      var rgb = null;
      if (segCfg) { rgb = segCanvas; rgb.width = w; rgb.height = h; rgb.getContext('2d').drawImage(work, 0, 0); }
      return { gray: gray, w: w, h: h, rgb: rgb };
    }
    function decode(file) {
      if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return decodeViaImg(file); });
      return decodeViaImg(file);
    }
    function decodeViaImg(file) { return new Promise(function (res, rej) { var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); }; img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); }; img.src = url; }); }
    function loadFile(file) {
      if (!file) return Promise.resolve();
      if (file.type && file.type.indexOf('image/') !== 0) { toast('That file is not an image. Try a JPG, PNG or HEIC photo.'); return Promise.resolve(); }
      stopCamera(); showResult(); beginBusy('Reading your photo');
      return decode(file).then(function (bmp) {
        if (state.destroyed) return;
        var g = toGray(bmp, bmp.width || bmp.naturalWidth, bmp.height || bmp.naturalHeight, false);
        if (bmp.close) bmp.close();
        state.source = 'upload'; pushImage(g);
      }).catch(function () { endBusy(); showEmpty(); toast("We couldn't read that photo. Try a JPG or PNG."); });
    }
    function pushImage(g) {
      state.imageId++; var id = state.imageId;
      state.coords = null; state.stats = null; state.w = g.w; state.h = g.h; state.subject = null; state.hasSubject = false; state.segMs = { load: 0, infer: 0 }; intakeStart = performance.now();
      worker.post({ type: 'image', id: id, gray: g.gray, w: g.w, h: g.h }, [g.gray.buffer]);
      if (!segCfg || !g.rgb) { requestTrace(true); return; }
      // Find the subject on the device first; the trace waits for the mask (or gives up after the timeout).
      beginBusy('Finding the subject'); setSubjectLine('Finding the subject');
      var done = false, timer = null;
      var finish = function (res) { if (done) return; done = true; clearTimeout(timer); if (state.destroyed || id !== state.imageId) return;
        if (res && res.mask) { state.subject = res.label; if (opts.debug) state.debugMask = new Uint8Array(res.mask); worker.post({ type: 'mask', id: id, mask: res.mask, label: res.label }, [res.mask.buffer]); }
        requestTrace(true); };
      timer = setTimeout(function () { finish(null); }, segCfg.timeout);
      loadSegmenter(segCfg).then(function (seg) {
        if (!seg || done) return null;
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () { // let the progress state paint first
          if (done || state.destroyed) return null;
          state.segMs.load = segShared.loadMs;
          var cat = segmentCanvas(seg, g.rgb); state.segMs.infer = cat.ms;
          return subjectMask(cat, g.w, g.h); });
      }).then(finish, function () { finish(null); });
    }
    function setSubjectLine(text) { subjectLine.innerHTML = ''; if (text.indexOf('Subject: ') === 0) { subjectLine.appendChild(document.createTextNode('Subject: ')); subjectLine.appendChild(el('strong', { text: text.slice(9) })); } else subjectLine.textContent = text; }
    function syncSubjectUI() {
      setSubjectLine('Subject: ' + (state.hasSubject ? state.subject : 'graphic'));
      outline.hidden = !state.hasSubject; outlineInput.checked = state.outlineOnly;
      swatches2.querySelector('legend').textContent = state.hasSubject ? 'Second colour (details)' : 'Second colour (outer lines)';
    }
    // which paths are drawn (outline-only hides the detail lines of a subject) + their bounding box
    function applyVisibility() {
      var n = state.offsets ? state.offsets.length - 1 : 0, vis = new Uint8Array(n), bb = [1e9, 1e9, -1e9, -1e9], any = false;
      for (var i = 0; i < n; i++) { if (state.outlineOnly && state.hasSubject && state.kind[i] === 1) continue; vis[i] = 1; any = true;
        for (var k = state.offsets[i]; k < state.offsets[i + 1]; k += 2) { var x = state.coords[k], y = state.coords[k + 1]; if (x < bb[0]) bb[0] = x; if (x > bb[2]) bb[2] = x; if (y < bb[1]) bb[1] = y; if (y > bb[3]) bb[3] = y; } }
      state.vis = vis; state.bbox = any ? bb : [0, 0, state.w, state.h];
    }
    function visibleCount() { var c = 0; if (state.vis) for (var i = 0; i < state.vis.length; i++) c += state.vis[i]; return c; }
    var toastEl = null;
    function toast(msg) { // plain inline message in the drop zone, not a floating widget
      if (!toastEl) { toastEl = el('p', { class: 'lnp-drop-sub', role: 'alert' }); drop.insertBefore(toastEl, drop.querySelector('.lnp-row')); }
      toastEl.textContent = msg; toastEl.hidden = false;
    }

    /* ---- views ---- */
    function showEmpty() { drop.hidden = false; cam.hidden = true; result.hidden = true; panel.hidden = true; grid.setAttribute('data-cols', '1'); }
    function showResult() { drop.hidden = true; cam.hidden = true; result.hidden = false; panel.hidden = false; grid.setAttribute('data-cols', '2'); if (toastEl) toastEl.hidden = true; }
    function showCamera() { drop.hidden = true; result.hidden = true; panel.hidden = true; cam.hidden = false; grid.setAttribute('data-cols', '1'); }

    /* ---- render ---- */
    var layers = {};
    function layer(name, w, h) { var c = layers[name]; if (!c) { c = layers[name] = document.createElement('canvas'); } if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; }
    function paletteEntry(hex) { for (var i = 0; i < palette.length; i++) if (palette[i].hex.toLowerCase() === String(hex).toLowerCase()) return palette[i]; return null; }
    function buildPaths(scale, ox, oy) {
      var coords = state.coords, offsets = state.offsets, closed = state.closed, n = offsets.length - 1, bb = state.bbox, i, k;
      var p1 = new Path2D(), p2 = state.twoTone ? new Path2D() : null;
      var cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, hw = (bb[2] - bb[0]) * 0.29, hh = (bb[3] - bb[1]) * 0.29;
      for (i = 0; i < n; i++) {
        var a = offsets[i], b = offsets[i + 1]; if (b - a < 4 || !state.vis[i]) continue;
        var target = p1;
        if (p2 && state.hasSubject) { if (state.kind[i] === 1) target = p2; } // subject: outline in colour 1, details in colour 2
        else if (p2) { var sx = 0, sy = 0, m = (b - a) / 2; for (k = a; k < b; k += 2) { sx += coords[k]; sy += coords[k + 1]; }
          sx /= m; sy /= m; if (Math.abs(sx - cx) > hw || Math.abs(sy - cy) > hh) target = p2; }
        target.moveTo(ox + coords[a] * scale, oy + coords[a + 1] * scale);
        for (k = a + 2; k < b; k += 2) target.lineTo(ox + coords[k] * scale, oy + coords[k + 1] * scale);
        if (closed[i]) target.closePath();
      }
      return [p1, p2];
    }
    // The sign is the kept lines, composed on a wall: fit their bounding box into a wall whose aspect
    // stays sensible (0.8..1.6), size the tube from the real 80 cm sign dimension.
    function signGeometry() {
      var bb = state.bbox || [0, 0, state.w, state.h], bw = Math.max(1, bb[2] - bb[0]), bh = Math.max(1, bb[3] - bb[1]);
      var aspect = Math.min(1.6, Math.max(0.8, state.w / state.h)), W = 1440, H = Math.round(W / aspect), pad = 0.09;
      var scale = Math.min((W * (1 - 2 * pad)) / bw, (H * (1 - 2 * pad)) / bh, 1.5 * W / state.w);
      var ox = (W - bw * scale) / 2 - bb[0] * scale, oy = (H - bh * scale) / 2 - bb[1] * scale;
      var longSide = Math.max(bw, bh), pxPerCm = longSide * scale / 80;
      return { W: W, H: H, scale: scale, ox: ox, oy: oy, longSide: longSide, wide: bw >= bh, pxPerCm: pxPerCm, tube: (0.5 + 0.9 * state.thickness / 100) * pxPerCm };
    }
    function render(reason) {
      if (!state.coords || state.destroyed) return;
      var t0 = performance.now(), th = theme(), G0 = signGeometry();
      var W = G0.W, H = G0.H, S = W / state.w;
      if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
      var ctx = out.getContext('2d');
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = hexOf(th.wall); ctx.fillRect(0, 0, W, H);
      var vg = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, th.lightWall ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.045)'); vg.addColorStop(1, th.lightWall ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      var paths = buildPaths(G0.scale, G0.ox, G0.oy), t = G0.tube;
      var c1 = parseColour(state.colour, [255, 61, 180]), c2 = parseColour(state.colour2, [79, 210, 255]);
      var e1 = paletteEntry(state.colour), e2 = paletteEntry(state.colour2);
      var core1 = e1 && e1.core ? parseColour(e1.core, c1) : mix(c1, [255, 255, 255], 0.72), core2 = e2 && e2.core ? parseColour(e2.core, c2) : mix(c2, [255, 255, 255], 0.72);
      var groups = [[paths[0], c1, core1]]; if (paths[1]) groups.push([paths[1], c2, core2]);
      if (state.lights) {
        var G = layer('glow', W, H), gc = G.getContext('2d'); gc.clearRect(0, 0, W, H); gc.lineCap = 'round'; gc.lineJoin = 'round';
        var T = layer('tube', W, H), tc = T.getContext('2d'); tc.clearRect(0, 0, W, H); tc.lineCap = 'round'; tc.lineJoin = 'round';
        groups.forEach(function (g) { gc.strokeStyle = rgba(g[1].map(Math.round), 1); gc.lineWidth = t * 1.15; gc.stroke(g[0]);
          tc.strokeStyle = rgba(g[1].map(Math.round), 1); tc.lineWidth = t; tc.stroke(g[0]); });
        groups.forEach(function (g) { tc.strokeStyle = rgba(g[2].map(Math.round), 1); tc.lineWidth = t * 0.46; tc.stroke(g[0]); });
        // bloom: progressive downsampling, drawn back up with bilinear filtering = cheap wide blur
        var levels = [], src = G, lw = W, lh = H;
        for (var L = 0; L < 5; L++) { lw = Math.max(1, Math.round(lw / 2)); lh = Math.max(1, Math.round(lh / 2)); var small = layer('bloom' + L, lw, lh), sc = small.getContext('2d');
          sc.clearRect(0, 0, lw, lh); sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = 'high'; sc.drawImage(src, 0, 0, lw, lh); levels.push(small); src = small; }
        ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        var alphas = [0.5, 0.42, 0.36, 0.34, 0.42];
        for (L = levels.length - 1; L >= 0; L--) { ctx.globalAlpha = alphas[L]; ctx.drawImage(levels[L], 0, 0, W, H); }
        ctx.globalAlpha = 1; ctx.drawImage(T, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 7 * S; ctx.shadowOffsetX = 1.5 * S; ctx.shadowOffsetY = 3 * S;
        ctx.strokeStyle = '#d9d4c9'; ctx.lineWidth = t; groups.forEach(function (g) { ctx.stroke(g[0]); }); ctx.restore();
        ctx.save(); ctx.translate(-t * 0.14, -t * 0.16); ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = t * 0.5; groups.forEach(function (g) { ctx.stroke(g[0]); }); ctx.restore();
      }
      var ms = performance.now() - t0;
      updateMeta();
      var detail = { ms: { render: Math.round(ms), trace: state.stats ? Math.round(state.stats.timing.total) : 0, total: reason === 'trace' ? Math.round(performance.now() - traceStart) : Math.round(ms), sinceIntake: reason === 'trace' ? Math.round(performance.now() - intakeStart) : 0 }, ledMetres: ledMetres(), paths: visibleCount(), source: state.source, reason: reason, stats: state.stats,
        subject: state.hasSubject ? state.subject : null, outlineOnly: state.outlineOnly, seg: { enabled: !!segCfg, load: state.segMs.load, infer: state.segMs.infer, delegate: segShared.delegate, error: segShared.failed },
        mask: opts.debug && state.hasSubject ? { data: state.debugMask, w: state.w, h: state.h } : undefined };
      container.dispatchEvent(new CustomEvent('lnp:rendered', { detail: detail, bubbles: true }));
    }
    function ledMetres() { if (!state.stats || !state.coords) return 0; var px = 0; for (var i = 0; i < state.vis.length; i++) if (state.vis[i]) px += state.plens[i]; return Math.round(px * (0.8 / signGeometry().longSide) * 10) / 10; }
    function sizeCm() { var g = signGeometry(), bb = state.bbox, bw = Math.max(1, bb[2] - bb[0]), bh = Math.max(1, bb[3] - bb[1]);
      return g.wide ? { widthCm: 80, heightCm: Math.round(80 * bh / bw) } : { widthCm: Math.round(80 * bw / bh), heightCm: 80 }; }
    function updateMeta() { var m = ledMetres(), g = signGeometry(); meta.innerHTML = ''; meta.appendChild(document.createTextNode('About ')); meta.appendChild(el('strong', { text: m.toFixed(1) + ' m' }));
      meta.appendChild(document.createTextNode(' of LED tube at 80 cm ' + (g.wide ? 'wide' : 'tall') + ', ' + visibleCount() + ' lines.')); }
    function syncSwatches() {
      root.querySelectorAll('.lnp-sw').forEach(function (b) { var which = b.getAttribute('data-which'), hex = b.getAttribute('data-hex').toLowerCase();
        var on = which === '1' ? hex === String(state.colour).toLowerCase() : hex === String(state.colour2).toLowerCase(); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      swatches2.hidden = !state.twoTone; twoToneInput.checked = state.twoTone;
      btnOn.setAttribute('aria-pressed', state.lights ? 'true' : 'false'); btnOff.setAttribute('aria-pressed', state.lights ? 'false' : 'true');
      root.style.setProperty('--lnp-neon', state.colour);
    }
    var raf = 0;
    function rerender() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; render('settings'); }); }

    /* ---- camera ---- */
    var camState = { stream: null, facing: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'environment' : 'user', raf: 0, paused: false, small: document.createElement('canvas'), mask: document.createElement('canvas') };
    var smallCtx = camState.small.getContext('2d', { willReadFrequently: true }), maskCtx = camState.mask.getContext('2d');
    function camError(err) {
      var name = err && err.name || '';
      var msg = name === 'NotAllowedError' || name === 'SecurityError' ? "Camera access was blocked. Allow it in your browser's site settings, or choose a photo instead." :
        name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera was found on this device. Choose a photo instead.' :
        name === 'insecure' ? 'The camera only works on a secure (https) page. Choose a photo instead.' : "The camera couldn't start. Choose a photo instead.";
      camMsgText.textContent = msg; btnCamRetry.hidden = true; camMsg.hidden = false;
    }
    function startCamera() {
      showCamera(); camMsg.hidden = true; camState.paused = false;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camError({ name: 'insecure' }); return; }
      stopStream();
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: camState.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (stream) {
        if (state.destroyed || cam.hidden) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        camState.stream = stream; video.srcObject = stream;
        var p = video.play(); if (p && p.catch) p.catch(function () {});
        if (navigator.mediaDevices.enumerateDevices) navigator.mediaDevices.enumerateDevices().then(function (list) { btnFlip.hidden = list.filter(function (d) { return d.kind === 'videoinput'; }).length < 2; }).catch(function () {});
        cancelAnimationFrame(camState.raf); camState.raf = requestAnimationFrame(liveFrame);
      }).catch(camError);
    }
    function stopStream() { if (camState.stream) { camState.stream.getTracks().forEach(function (t) { t.stop(); }); camState.stream = null; } video.srcObject = null; cancelAnimationFrame(camState.raf); camState.raf = 0; }
    function stopCamera() { stopStream(); }
    function liveFrame() {
      if (state.destroyed || cam.hidden || !camState.stream) return;
      camState.raf = requestAnimationFrame(liveFrame);
      if (video.readyState < 2 || !video.videoWidth) return;
      var vw = video.videoWidth, vh = video.videoHeight, k = 300 / Math.max(vw, vh), sw = Math.max(8, Math.round(vw * k)), sh = Math.max(8, Math.round(vh * k));
      var mirror = camState.facing === 'user';
      if (camState.small.width !== sw || camState.small.height !== sh) { camState.small.width = sw; camState.small.height = sh; camState.mask.width = sw; camState.mask.height = sh; }
      smallCtx.save(); if (mirror) { smallCtx.translate(sw, 0); smallCtx.scale(-1, 1); } smallCtx.drawImage(video, 0, 0, sw, sh); smallCtx.restore();
      var d = smallCtx.getImageData(0, 0, sw, sh).data, n = sw * sh, g = new Float32Array(n), i, j, x, y;
      for (i = 0, j = 0; i < n; i++, j += 4) g[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
      // 3x3 blur then Sobel
      var b = new Float32Array(n);
      for (y = 1; y < sh - 1; y++) for (x = 1; x < sw - 1; x++) { i = y * sw + x; b[i] = (g[i - sw - 1] + 2 * g[i - sw] + g[i - sw + 1] + 2 * g[i - 1] + 4 * g[i] + 2 * g[i + 1] + g[i + sw - 1] + 2 * g[i + sw] + g[i + sw + 1]) / 16; }
      var c = parseColour(state.colour, [255, 61, 180]), img = maskCtx.createImageData(sw, sh), px = img.data, th0 = 60 + (1 - state.detail / 100) * 90, th1 = th0 * 2.2;
      for (y = 1; y < sh - 1; y++) for (x = 1; x < sw - 1; x++) { i = y * sw + x;
        var gx = (b[i - sw + 1] + 2 * b[i + 1] + b[i + sw + 1]) - (b[i - sw - 1] + 2 * b[i - 1] + b[i + sw - 1]), gy = (b[i + sw - 1] + 2 * b[i + sw] + b[i + sw + 1]) - (b[i - sw - 1] + 2 * b[i - sw] + b[i - sw + 1]);
        var m = Math.sqrt(gx * gx + gy * gy), a = m <= th0 ? 0 : m >= th1 ? 1 : (m - th0) / (th1 - th0); if (!a) continue;
        a = a * a * (3 - 2 * a); j = i * 4; px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = (a * 255) | 0; }
      maskCtx.putImageData(img, 0, 0);
      var LW = sw * 2.4, LH = sh * 2.4; if (live.width !== Math.round(LW) || live.height !== Math.round(LH)) { live.width = Math.round(LW); live.height = Math.round(LH); }
      var lc = live.getContext('2d'), th = theme();
      lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1; lc.fillStyle = hexOf(th.wall); lc.fillRect(0, 0, live.width, live.height);
      var vg = lc.createRadialGradient(live.width / 2, live.height / 2, live.width * 0.1, live.width / 2, live.height / 2, live.width * 0.75); vg.addColorStop(0, 'rgba(255,255,255,0.04)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)'); lc.fillStyle = vg; lc.fillRect(0, 0, live.width, live.height);
      var q = layer('liveq', Math.max(1, sw >> 2), Math.max(1, sh >> 2)), qc = q.getContext('2d'); qc.clearRect(0, 0, q.width, q.height); qc.drawImage(camState.mask, 0, 0, q.width, q.height);
      lc.globalCompositeOperation = 'lighter'; lc.imageSmoothingEnabled = true;
      lc.globalAlpha = 0.7; lc.drawImage(q, 0, 0, live.width, live.height);
      lc.globalAlpha = 0.9; lc.drawImage(camState.mask, 0, 0, live.width, live.height);
      lc.globalAlpha = 0.55; lc.drawImage(camState.mask, 1.2, 1.2, live.width, live.height); lc.drawImage(camState.mask, -1.2, -1.2, live.width, live.height);
      lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
    }
    function capture() {
      if (!camState.stream || video.readyState < 2 || !video.videoWidth) return;
      var g = toGray(video, video.videoWidth, video.videoHeight, camState.facing === 'user');
      stopCamera(); showResult(); beginBusy('Tracing your photo'); state.source = 'camera'; pushImage(g);
    }
    function onVisibility() {
      if (document.hidden) { if (camState.stream) { stopStream(); camState.paused = true; camMsgText.textContent = 'Camera paused while this page was in the background.'; btnCamRetry.hidden = false; camMsg.hidden = false; } }
    }
    document.addEventListener('visibilitychange', onVisibility);

    /* ---- events ---- */
    btnChoose.addEventListener('click', function () { fileInput.click(); });
    btnCamUpload.addEventListener('click', function () { stopCamera(); showEmpty(); fileInput.click(); });
    fileInput.addEventListener('change', function () { loadFile(fileInput.files && fileInput.files[0]); fileInput.value = ''; });
    btnCamera.addEventListener('click', function () { startCamera(); });
    btnCamRetry.addEventListener('click', function () { startCamera(); });
    btnFlip.addEventListener('click', function () { camState.facing = camState.facing === 'user' ? 'environment' : 'user'; startCamera(); });
    btnCancel.addEventListener('click', function () { stopCamera(); showEmpty(); });
    btnCapture.addEventListener('click', capture);
    btnReset.addEventListener('click', function () { stopCamera(); state.coords = null; state.imageId = 0; state.hasSubject = false; state.subject = null; showEmpty(); btnChoose.focus(); });
    ['dragenter', 'dragover'].forEach(function (ev) { root.addEventListener(ev, function (e) { if (!e.dataTransfer) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; stage.classList.add('lnp-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { root.addEventListener(ev, function (e) { if (ev === 'dragleave' && root.contains(e.relatedTarget)) return; stage.classList.remove('lnp-over'); }); });
    root.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
    sDetail.input.addEventListener('input', function () { state.detail = +sDetail.input.value; requestTrace(false); });
    sSmooth.input.addEventListener('input', function () { state.smooth = +sSmooth.input.value; requestTrace(false); });
    sThick.input.addEventListener('input', function () { state.thickness = +sThick.input.value; rerender(); });
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.lnp-sw'); if (!b || !root.contains(b)) return;
      if (b.getAttribute('data-which') === '1') state.colour = b.getAttribute('data-hex'); else state.colour2 = b.getAttribute('data-hex');
      syncSwatches(); rerender();
    });
    twoToneInput.addEventListener('change', function () { state.twoTone = twoToneInput.checked; syncSwatches(); rerender(); });
    outlineInput.addEventListener('change', function () { state.outlineOnly = outlineInput.checked; applyVisibility(); rerender(); });
    btnOn.addEventListener('click', function () { state.lights = true; syncSwatches(); rerender(); });
    btnOff.addEventListener('click', function () { state.lights = false; syncSwatches(); rerender(); });
    btnDownload.addEventListener('click', function () { if (!state.coords) return; var a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = 'lit-neon-design.png'; document.body.appendChild(a); a.click(); a.remove(); });
    btnQuote.addEventListener('click', function () {
      if (!state.coords) return;
      var payload = { png: out.toDataURL('image/png'), settings: { colour: state.colour, detail: state.detail, thickness: state.thickness, ledMetres: ledMetres(), source: state.source,
        smoothness: state.smooth, lights: state.lights ? 'on' : 'off', twoTone: state.twoTone ? state.colour2 : null, widthCm: sizeCm().widthCm, heightCm: sizeCm().heightCm, lines: visibleCount(),
        subject: state.hasSubject ? state.subject : 'graphic', outlineOnly: state.hasSubject && state.outlineOnly } };
      if (typeof opts.onQuote === 'function') opts.onQuote(payload);
      container.dispatchEvent(new CustomEvent('lnp:quote', { detail: payload, bubbles: true }));
    });
    syncSwatches(); showEmpty();

    /* ---- controller ---- */
    return {
      setColour: function (hex) { if (!hex) return; state.colour = hex; syncSwatches(); rerender(); },
      load: function (file) { return loadFile(file); },
      destroy: function () {
        state.destroyed = true; stopCamera(); worker.terminate(); clearTimeout(traceTimer); clearTimeout(progressTimer); cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVisibility);
        if (root.parentNode === container) container.removeChild(root);
      }
    };
  }

  window.LitNeonPhoto = { mount: mount, version: '1.0.0', _engine: engineMain /* for the QA harness */ };
})();

export default globalThis.LitNeonPhoto;
