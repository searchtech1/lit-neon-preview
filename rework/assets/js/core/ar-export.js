/* Lit Neon v2 — ar-export.js (WS0-C, brief §5.10 / §6.2): the sign as a true-size AR model, built in the browser,
   no server. Same signatures as the freeze stub (CONTRACT.md E11):
     glb(state, png?) → Promise<Blob model/gltf-binary>
     usdz(state, png?, { orient }) → Promise<Blob model/vnd.usdz+zip>
     zipStored(entries) → Blob   (stored zip, every entry's data 64-byte aligned — what Quick Look requires)
     texture(state, png?) → Promise<{ bytes, width, height, ppc, widthM, heightM, baked } | null>   (helper, exported for tests)
   The model is ONE double-sided plane whose size in metres is the baked PNG's size in cm ÷ 100: the PNG is
   `stage.toPNG({ transparent:true, bakeGlow:true })` (or, without a stage, `renderer.bakeGlow()` here), i.e. the sign at
   its real cm dimensions plus the transparent glow margin, so the lettering inside is exactly the size on the order.
   The glow is BAKED into the pixels because Quick Look ignores emissive strength; the same PNG is the base colour AND
   the emissive texture, alpha-blended, with KHR_materials_emissive_strength 3.0 for viewers that honour it (WebXR /
   model-viewer). USDZ = ASCII `model.usda` + `textures/sign.png` in a stored, 64-byte-aligned zip (as three.js's
   USDZExporter writes it), with the root prim anchored to a VERTICAL plane so Quick Look hangs it on a wall.
   Orientation: glTF keeps the plane in X/Y facing +Z (model-viewer `ar-placement="wall"` puts the model's back, −Z,
   against the wall). USDZ follows ARKit's plane-anchor convention — the anchor's +Y is the wall normal — so the plane
   lies in X/Z facing +Y with the sign's top toward −Z (`orient:'anchor'`, default); `orient:'z'` writes the glTF
   layout instead. Which one Quick Look honours is on the §7.7 real-device checklist (headless Chrome cannot prove it).
   Without a canvas (Node) and without a PNG, both exports fall back to an untextured plane at the sign's cm size. */
import { resolve, bakeGlow } from './renderer.js';

export const STUB = false;
export const EMISSIVE_STRENGTH = 3.0;
const enc = new TextEncoder();
const pad4 = n => (4 - (n % 4)) % 4;
const hasDOM = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/* ---------- texture: the baked-glow PNG and the plane size it implies ---------- */
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function pngSize(b) {
  if (!b || b.length < 24 || PNG_SIG.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); return { width: dv.getUint32(16), height: dv.getUint32(20) };
}
async function bytesOf(x) {
  if (!x) return null;
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (typeof Blob !== 'undefined' && x instanceof Blob) return new Uint8Array(await x.arrayBuffer());
  if (typeof x === 'string' && x.startsWith('data:')) { const b64 = x.slice(x.indexOf(',') + 1); const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return null;
}
/** the glow margin bakeGlow() adds on every side when no `pad` is given (cm) — kept in step with renderer.bakeGlow */
const defaultGlowPadCm = res => Math.max(2, res.letterCm * .9);

export async function texture(state, png) {
  const res = resolve(state); const d = res.dims || { W: 60, H: 20 };
  let bytes = null, width = 0, height = 0, ppc = 0, baked = false;
  if (png) {
    const src = png.blob || png.bytes || png.dataUrl || png;
    bytes = await bytesOf(src);
    const sz = pngSize(bytes); if (!sz) bytes = null; else { width = png.width || sz.width; height = png.height || sz.height; ppc = +png.ppc || 0; baked = true; }
    /* the stage's toPNG() works at its on-screen density (often 6–8 px/cm, ~1000 px for a 1.2 m sign — soft at true size
       in AR). When a canvas is at hand and the PNG is small, re-bake the same design at Quick Look's 2048 px ceiling. */
    if (bytes && hasDOM() && Math.max(width, height) < 1400) bytes = null;
  }
  if (!bytes && hasDOM()) {
    /* no stage PNG handed in: bake one here (on, night glow, transparent), capped at 2048 px — Quick Look's safe size */
    const longest = Math.max(d.W, d.H) + 2 * defaultGlowPadCm(res);
    const b = bakeGlow(state, { ppc: Math.max(4, Math.min(24, 2048 / longest)), on: (state && state.on) !== false, night: true, bakeGlow: true, transparent: true, maxPx: 2048 });
    if (b) {
      const blob = await new Promise(r => b.canvas.toBlob(r, 'image/png'));
      bytes = await bytesOf(blob); width = b.W; height = b.H; ppc = b.ppc; baked = true;
    }
  }
  if (!bytes) return { bytes: null, width: 0, height: 0, ppc: 0, widthM: d.W / 100, heightM: d.H / 100, baked: false, dims: d };
  let widthM, heightM;
  if (ppc > 0) { widthM = width / ppc / 100; heightM = height / ppc / 100; }
  else { const wCm = d.W + 2 * defaultGlowPadCm(res); widthM = wCm / 100; heightM = widthM * height / width; }
  return { bytes, width, height, ppc, widthM: round6(widthM), heightM: round6(heightM), baked, dims: d };
}
const round6 = n => Math.round(n * 1e6) / 1e6;

/* ---------- GLB ---------- */
export async function glb(state, png) {
  const tex = await texture(state, png);
  const w = tex.widthM / 2, h = tex.heightM / 2;
  const pos = new Float32Array([-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0]);
  const nor = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]); /* glTF UV origin is the image's top-left */
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const chunks = []; const views = []; let off = 0;
  const push = (arr, target) => { const b = arr instanceof Uint8Array ? arr : new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); const v = { buffer: 0, byteOffset: off, byteLength: b.byteLength }; if (target) v.target = target; views.push(v); chunks.push(b); off += b.byteLength; const p = pad4(off); if (p) { chunks.push(new Uint8Array(p)); off += p; } return views.length - 1; };
  const vPos = push(pos, 34962), vNor = push(nor, 34962), vUv = push(uv, 34962), vIdx = push(idx, 34963);
  const vImg = tex.bytes ? push(tex.bytes) : -1;
  const material = { name: 'Neon', doubleSided: true, alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } };
  const json = {
    asset: { version: '2.0', generator: 'Lit Neon v2 ar-export' },
    scene: 0, scenes: [{ name: 'Lit Neon', nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Sign', extras: { widthCm: tex.dims.W, heightCm: tex.dims.H, planeWidthM: tex.widthM, planeHeightM: tex.heightM, bakedGlow: tex.baked } }],
    meshes: [{ name: 'SignPlane', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
    materials: [material],
    buffers: [{ byteLength: off }],
    bufferViews: views,
    accessors: [
      { bufferView: vPos, componentType: 5126, count: 4, type: 'VEC3', min: [-w, -h, 0], max: [w, h, 0] },
      { bufferView: vNor, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: vUv, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: vIdx, componentType: 5123, count: 6, type: 'SCALAR' }
    ]
  };
  if (vImg >= 0) {
    json.images = [{ name: 'sign', bufferView: vImg, mimeType: 'image/png' }];
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
    json.textures = [{ sampler: 0, source: 0 }];
    material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
    material.emissiveTexture = { index: 0 };
    material.emissiveFactor = [1, 1, 1];
    material.extensions = { KHR_materials_emissive_strength: { emissiveStrength: EMISSIVE_STRENGTH } };
    json.extensionsUsed = ['KHR_materials_emissive_strength'];
  } else {
    material.emissiveFactor = [1, 0.85, 0.6];
  }
  let jsonBytes = enc.encode(JSON.stringify(json)); const jp = pad4(jsonBytes.length);
  if (jp) { const t = new Uint8Array(jsonBytes.length + jp); t.set(jsonBytes); t.fill(0x20, jsonBytes.length); jsonBytes = t; }
  const total = 12 + 8 + jsonBytes.length + 8 + off;
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length; dv.setUint32(o, off, true); dv.setUint32(o + 4, 0x004E4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return new Blob([out], { type: 'model/gltf-binary' });
}

/* ---------- stored zip, 64-byte aligned (USDZ) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zipStored(entries) {
  const parts = []; const central = []; let offset = 0;
  for (const { name, data: raw } of entries) {
    const data = raw instanceof Uint8Array ? raw : typeof raw === 'string' ? enc.encode(raw) : new Uint8Array(raw);
    const nameB = enc.encode(name); const crc = crc32(data);
    const headerLen = 30 + nameB.length; let extra = (64 - ((offset + headerLen) % 64)) % 64; if (extra > 0 && extra < 4) extra += 64;
    const extraB = new Uint8Array(extra); if (extra) { const e = new DataView(extraB.buffer); e.setUint16(0, 0x1986, true); e.setUint16(2, extra - 4, true); }
    const lh = new Uint8Array(30); const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, nameB.length, true); dv.setUint16(28, extra, true);
    central.push({ nameB, crc, size: data.length, offset });
    parts.push(lh, nameB, extraB, data); offset += 30 + nameB.length + extra + data.length;
  }
  const cdStart = offset; let cdLen = 0;
  for (const c of central) {
    const ch = new Uint8Array(46); const dv = new DataView(ch.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0x21, true);
    dv.setUint32(16, c.crc, true); dv.setUint32(20, c.size, true); dv.setUint32(24, c.size, true); dv.setUint16(28, c.nameB.length, true); dv.setUint32(42, c.offset, true);
    parts.push(ch, c.nameB); cdLen += 46 + c.nameB.length;
  }
  const eocd = new Uint8Array(22); const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true); dv.setUint16(8, central.length, true); dv.setUint16(10, central.length, true); dv.setUint32(12, cdLen, true); dv.setUint32(16, cdStart, true);
  parts.push(eocd);
  return new Blob(parts, { type: 'model/vnd.usdz+zip' });
}

/* ---------- USDZ ---------- */
const f6 = n => (Math.round(n * 1e6) / 1e6).toString();
export function usda(tex, { orient = 'anchor', name = 'Lit Neon sign' } = {}) {
  const w = tex.widthM / 2, h = tex.heightM / 2;
  /* corners bottom-left, bottom-right, top-right, top-left */
  const P = orient === 'z' ? [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]] : [[-w, 0, h], [w, 0, h], [w, 0, -h], [-w, 0, -h]];
  const N = orient === 'z' ? '(0, 0, 1)' : '(0, 1, 0)';
  const pts = P.map(p => `(${p.map(f6).join(', ')})`).join(', ');
  const textured = !!tex.bytes;
  const mat = textured ? `
            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = </Root/Materials/Neon/SignTexture.outputs:rgb>
                color3f inputs:emissiveColor.connect = </Root/Materials/Neon/SignTexture.outputs:rgb>
                float inputs:opacity.connect = </Root/Materials/Neon/SignTexture.outputs:a>
                float inputs:metallic = 0
                float inputs:roughness = 1
                int inputs:useSpecularWorkflow = 0
                token outputs:surface
            }

            def Shader "StReader"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                token inputs:varname.connect = </Root/Materials/Neon.inputs:frame:stPrimvarName>
                float2 inputs:fallback = (0, 0)
                float2 outputs:result
            }

            def Shader "SignTexture"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @textures/sign.png@
                float2 inputs:st.connect = </Root/Materials/Neon/StReader.outputs:result>
                token inputs:sourceColorSpace = "sRGB"
                token inputs:wrapS = "clamp"
                token inputs:wrapT = "clamp"
                float3 outputs:rgb
                float outputs:a
            }` : `
            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (1, 0.85, 0.6)
                color3f inputs:emissiveColor = (1, 0.85, 0.6)
                float inputs:metallic = 0
                float inputs:roughness = 1
                token outputs:surface
            }`;
  return `#usda 1.0
(
    customLayerData = {
        string creator = "Lit Neon v2 ar-export"
    }
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        string name = "${name.replace(/"/g, '')}"
    }
    kind = "component"
    prepend apiSchemas = ["Preliminary_AnchoringAPI"]
)
{
    token preliminary:anchoring:type = "plane"
    token preliminary:planeAnchoring:alignment = "vertical"

    def Scope "Materials"
    {
        def Material "Neon"
        {
            token inputs:frame:stPrimvarName = "st"
            token outputs:surface.connect = </Root/Materials/Neon/PreviewSurface.outputs:surface>
${mat}
        }
    }

    def Mesh "Sign" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        float3[] extent = [(${P.reduce((a, p) => a.map((v, i) => Math.min(v, p[i])), [Infinity, Infinity, Infinity]).map(f6).join(', ')}), (${P.reduce((a, p) => a.map((v, i) => Math.max(v, p[i])), [-Infinity, -Infinity, -Infinity]).map(f6).join(', ')})]
        int[] faceVertexCounts = [3, 3]
        int[] faceVertexIndices = [0, 1, 2, 0, 2, 3]
        rel material:binding = </Root/Materials/Neon>
        normal3f[] normals = [${N}, ${N}, ${N}, ${N}] (
            interpolation = "vertex"
        )
        point3f[] points = [${pts}]
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (
            interpolation = "vertex"
        )
        uniform bool doubleSided = 1
        uniform token subdivisionScheme = "none"
    }
}
`;
}
export async function usdz(state, png, opts = {}) {
  const tex = await texture(state, png);
  const entries = [{ name: 'model.usda', data: enc.encode(usda(tex, opts)) }];
  if (tex.bytes) entries.push({ name: 'textures/sign.png', data: tex.bytes });
  return zipStored(entries);
}

export default { glb, usdz, zipStored, texture, usda, crc32, STUB, EMISSIVE_STRENGTH };
