import{resolve as O,bakeGlow as _}from"./renderer.js";export const STUB=!1,EMISSIVE_STRENGTH=3;const A=new TextEncoder,B=t=>(4-t%4)%4,V=()=>typeof document<"u"&&typeof document.createElement=="function",z=[137,80,78,71,13,10,26,10];function D(t){if(!t||t.length<24||z.some((n,e)=>t[e]!==n))return null;const r=new DataView(t.buffer,t.byteOffset,t.byteLength);return{width:r.getUint32(16),height:r.getUint32(20)}}async function L(t){if(!t)return null;if(t instanceof Uint8Array)return t;if(t instanceof ArrayBuffer)return new Uint8Array(t);if(ArrayBuffer.isView(t))return new Uint8Array(t.buffer,t.byteOffset,t.byteLength);if(typeof Blob<"u"&&t instanceof Blob)return new Uint8Array(await t.arrayBuffer());if(typeof t=="string"&&t.startsWith("data:")){const r=t.slice(t.indexOf(",")+1),n=typeof atob=="function"?atob(r):Buffer.from(r,"base64").toString("binary"),e=new Uint8Array(n.length);for(let i=0;i<n.length;i++)e[i]=n.charCodeAt(i);return e}return null}const I=t=>Math.max(2,t.letterCm*.9);export async function texture(t,r){const n=O(t),e=n.dims||{W:60,H:20};let i=null,p=0,c=0,f=0,l=!1;if(r){const s=r.blob||r.bytes||r.dataUrl||r;i=await L(s);const a=D(i);a?(p=r.width||a.width,c=r.height||a.height,f=+r.ppc||0,l=!0):i=null,i&&V()&&Math.max(p,c)<1400&&(i=null)}if(!i&&V()){const s=Math.max(e.W,e.H)+2*I(n),a=_(t,{ppc:Math.max(4,Math.min(24,2048/s)),on:(t&&t.on)!==!1,night:!0,bakeGlow:!0,transparent:!0,maxPx:2048});if(a){const g=await new Promise(h=>a.canvas.toBlob(h,"image/png"));i=await L(g),p=a.W,c=a.H,f=a.ppc,l=!0}}if(!i)return{bytes:null,width:0,height:0,ppc:0,widthM:e.W/100,heightM:e.H/100,baked:!1,dims:e};let u,o;return f>0?(u=p/f/100,o=c/f/100):(u=(e.W+2*I(n))/100,o=u*c/p),{bytes:i,width:p,height:c,ppc:f,widthM:E(u),heightM:E(o),baked:l,dims:e}}const E=t=>Math.round(t*1e6)/1e6;export async function glb(t,r){const n=await texture(t,r),e=n.widthM/2,i=n.heightM/2,p=new Float32Array([-e,-i,0,e,-i,0,e,i,0,-e,i,0]),c=new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),f=new Float32Array([0,1,1,1,1,0,0,0]),l=new Uint16Array([0,1,2,0,2,3]),u=[],o=[];let s=0;const a=(m,P)=>{const F=m instanceof Uint8Array?m:new Uint8Array(m.buffer,m.byteOffset,m.byteLength),T={buffer:0,byteOffset:s,byteLength:F.byteLength};P&&(T.target=P),o.push(T),u.push(F),s+=F.byteLength;const k=B(s);return k&&(u.push(new Uint8Array(k)),s+=k),o.length-1},g=a(p,34962),h=a(c,34962),v=a(f,34962),S=a(l,34963),d=n.bytes?a(n.bytes):-1,y={name:"Neon",doubleSided:!0,alphaMode:"BLEND",pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1}},U={asset:{version:"2.0",generator:"Lit Neon v2 ar-export"},scene:0,scenes:[{name:"Lit Neon",nodes:[0]}],nodes:[{mesh:0,name:"Sign",extras:{widthCm:n.dims.W,heightCm:n.dims.H,planeWidthM:n.widthM,planeHeightM:n.heightM,bakedGlow:n.baked}}],meshes:[{name:"SignPlane",primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0,mode:4}]}],materials:[y],buffers:[{byteLength:s}],bufferViews:o,accessors:[{bufferView:g,componentType:5126,count:4,type:"VEC3",min:[-e,-i,0],max:[e,i,0]},{bufferView:h,componentType:5126,count:4,type:"VEC3"},{bufferView:v,componentType:5126,count:4,type:"VEC2"},{bufferView:S,componentType:5123,count:6,type:"SCALAR"}]};d>=0?(U.images=[{name:"sign",bufferView:d,mimeType:"image/png"}],U.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],U.textures=[{sampler:0,source:0}],y.pbrMetallicRoughness.baseColorTexture={index:0},y.emissiveTexture={index:0},y.emissiveFactor=[1,1,1],y.extensions={KHR_materials_emissive_strength:{emissiveStrength:EMISSIVE_STRENGTH}},U.extensionsUsed=["KHR_materials_emissive_strength"]):y.emissiveFactor=[1,.85,.6];let w=A.encode(JSON.stringify(U));const N=B(w.length);if(N){const m=new Uint8Array(w.length+N);m.set(w),m.fill(32,w.length),w=m}const R=20+w.length+8+s,M=new Uint8Array(R),b=new DataView(M.buffer);b.setUint32(0,1179937895,!0),b.setUint32(4,2,!0),b.setUint32(8,R,!0),b.setUint32(12,w.length,!0),b.setUint32(16,1313821514,!0),M.set(w,20);let x=20+w.length;b.setUint32(x,s,!0),b.setUint32(x+4,5130562,!0),x+=8;for(const m of u)M.set(m,x),x+=m.byteLength;return new Blob([M],{type:"model/gltf-binary"})}const $=(()=>{const t=new Uint32Array(256);for(let r=0;r<256;r++){let n=r;for(let e=0;e<8;e++)n=n&1?3988292384^n>>>1:n>>>1;t[r]=n>>>0}return t})();export const crc32=t=>{let r=4294967295;for(let n=0;n<t.length;n++)r=$[(r^t[n])&255]^r>>>8;return(r^4294967295)>>>0};export function zipStored(t){const r=[],n=[];let e=0;for(const{name:l,data:u}of t){const o=u instanceof Uint8Array?u:typeof u=="string"?A.encode(u):new Uint8Array(u),s=A.encode(l),a=crc32(o),g=30+s.length;let h=(64-(e+g)%64)%64;h>0&&h<4&&(h+=64);const v=new Uint8Array(h);if(h){const y=new DataView(v.buffer);y.setUint16(0,6534,!0),y.setUint16(2,h-4,!0)}const S=new Uint8Array(30),d=new DataView(S.buffer);d.setUint32(0,67324752,!0),d.setUint16(4,20,!0),d.setUint16(6,0,!0),d.setUint16(8,0,!0),d.setUint16(10,0,!0),d.setUint16(12,33,!0),d.setUint32(14,a,!0),d.setUint32(18,o.length,!0),d.setUint32(22,o.length,!0),d.setUint16(26,s.length,!0),d.setUint16(28,h,!0),n.push({nameB:s,crc:a,size:o.length,offset:e}),r.push(S,s,v,o),e+=30+s.length+h+o.length}const i=e;let p=0;for(const l of n){const u=new Uint8Array(46),o=new DataView(u.buffer);o.setUint32(0,33639248,!0),o.setUint16(4,20,!0),o.setUint16(6,20,!0),o.setUint16(12,0,!0),o.setUint16(14,33,!0),o.setUint32(16,l.crc,!0),o.setUint32(20,l.size,!0),o.setUint32(24,l.size,!0),o.setUint16(28,l.nameB.length,!0),o.setUint32(42,l.offset,!0),r.push(u,l.nameB),p+=46+l.nameB.length}const c=new Uint8Array(22),f=new DataView(c.buffer);return f.setUint32(0,101010256,!0),f.setUint16(8,n.length,!0),f.setUint16(10,n.length,!0),f.setUint32(12,p,!0),f.setUint32(16,i,!0),r.push(c),new Blob(r,{type:"model/vnd.usdz+zip"})}const C=t=>(Math.round(t*1e6)/1e6).toString();export function usda(t,{orient:r="anchor",name:n="Lit Neon sign"}={}){const e=t.widthM/2,i=t.heightM/2,p=r==="z"?[[-e,-i,0],[e,-i,0],[e,i,0],[-e,i,0]]:[[-e,0,i],[e,0,i],[e,0,-i],[-e,0,-i]],c=r==="z"?"(0, 0, 1)":"(0, 1, 0)",f=p.map(o=>`(${o.map(C).join(", ")})`).join(", "),u=!!t.bytes?`
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
            }`:`
            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (1, 0.85, 0.6)
                color3f inputs:emissiveColor = (1, 0.85, 0.6)
                float inputs:metallic = 0
                float inputs:roughness = 1
                token outputs:surface
            }`;return`#usda 1.0
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
        string name = "${n.replace(/"/g,"")}"
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
${u}
        }
    }

    def Mesh "Sign" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        float3[] extent = [(${p.reduce((o,s)=>o.map((a,g)=>Math.min(a,s[g])),[1/0,1/0,1/0]).map(C).join(", ")}), (${p.reduce((o,s)=>o.map((a,g)=>Math.max(a,s[g])),[-1/0,-1/0,-1/0]).map(C).join(", ")})]
        int[] faceVertexCounts = [3, 3]
        int[] faceVertexIndices = [0, 1, 2, 0, 2, 3]
        rel material:binding = </Root/Materials/Neon>
        normal3f[] normals = [${c}, ${c}, ${c}, ${c}] (
            interpolation = "vertex"
        )
        point3f[] points = [${f}]
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (
            interpolation = "vertex"
        )
        uniform bool doubleSided = 1
        uniform token subdivisionScheme = "none"
    }
}
`}export async function usdz(t,r,n={}){const e=await texture(t,r),i=[{name:"model.usda",data:A.encode(usda(e,n))}];return e.bytes&&i.push({name:"textures/sign.png",data:e.bytes}),zipStored(i)}export default{glb,usdz,zipStored,texture,usda,crc32,STUB,EMISSIVE_STRENGTH};
