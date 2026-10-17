import{resolve as _,bakeGlow as $}from"./renderer.js";export const STUB=!1,EMISSIVE_STRENGTH=3;const v=new TextEncoder,L=e=>(4-e%4)%4,P=()=>typeof document<"u"&&typeof document.createElement=="function",z=[137,80,78,71,13,10,26,10];function D(e){if(!e||e.length<24||z.some((n,t)=>e[t]!==n))return null;const i=new DataView(e.buffer,e.byteOffset,e.byteLength);return{width:i.getUint32(16),height:i.getUint32(20)}}async function O(e){if(!e)return null;if(e instanceof Uint8Array)return e;if(e instanceof ArrayBuffer)return new Uint8Array(e);if(ArrayBuffer.isView(e))return new Uint8Array(e.buffer,e.byteOffset,e.byteLength);if(typeof Blob<"u"&&e instanceof Blob)return new Uint8Array(await e.arrayBuffer());if(typeof e=="string"&&e.startsWith("data:")){const i=e.slice(e.indexOf(",")+1),n=typeof atob=="function"?atob(i):Buffer.from(i,"base64").toString("binary"),t=new Uint8Array(n.length);for(let o=0;o<n.length;o++)t[o]=n.charCodeAt(o);return t}return null}const E=e=>Math.max(2,e.letterCm*.9);export async function texture(e,i){const n=_(e),t=n.dims||{W:60,H:20};let o=null,p=0,l=0,c=0,f=!1;if(i){const u=i.blob||i.bytes||i.dataUrl||i;o=await O(u);const a=D(o);a?(p=i.width||a.width,l=i.height||a.height,c=+i.ppc||0,f=!0):o=null,o&&P()&&Math.max(p,l)<1400&&(o=null)}if(!o&&P()){const u=Math.max(t.W,t.H)+2*E(n),a=$(e,{ppc:Math.max(4,Math.min(24,2048/u)),on:(e&&e.on)!==!1,night:!0,bakeGlow:!0,transparent:!0,maxPx:2048});if(a){const b=await new Promise(h=>a.canvas.toBlob(h,"image/png"));o=await O(b),p=a.W,l=a.H,c=a.ppc,f=!0}}if(!o)return{bytes:null,width:0,height:0,ppc:0,widthM:t.W/100,heightM:t.H/100,baked:!1,dims:t};let s,r;return c>0?(s=p/c/100,r=l/c/100):(s=(t.W+2*E(n))/100,r=s*l/p),{bytes:o,width:p,height:l,ppc:c,widthM:F(s),heightM:F(r),baked:f,dims:t}}const F=e=>Math.round(e*1e6)/1e6;export async function glb(e,i){const n=await texture(e,i),t=n.widthM/2,o=n.heightM/2,p=new Float32Array([-t,-o,0,t,-o,0,t,o,0,-t,o,0]),l=new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),c=new Float32Array([0,1,1,1,1,0,0,0]),f=new Uint16Array([0,1,2,0,2,3]),s=[],r=[];let u=0;const a=(d,C)=>{const k=d instanceof Uint8Array?d:new Uint8Array(d.buffer,d.byteOffset,d.byteLength),B={buffer:0,byteOffset:u,byteLength:k.byteLength};C&&(B.target=C),r.push(B),s.push(k),u+=k.byteLength;const R=L(u);return R&&(s.push(new Uint8Array(R)),u+=R),r.length-1},b=a(p,34962),h=a(l,34962),S=a(c,34962),M=a(f,34963),m=n.bytes?a(n.bytes):-1,g={name:"Neon",doubleSided:!0,alphaMode:"BLEND",pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1}},U={asset:{version:"2.0",generator:"Lit Neon v2 ar-export"},scene:0,scenes:[{name:"Lit Neon",nodes:[0]}],nodes:[{mesh:0,name:"Sign",extras:{widthCm:n.dims.W,heightCm:n.dims.H,planeWidthM:n.widthM,planeHeightM:n.heightM,bakedGlow:n.baked}}],meshes:[{name:"SignPlane",primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0,mode:4}]}],materials:[g],buffers:[{byteLength:u}],bufferViews:r,accessors:[{bufferView:b,componentType:5126,count:4,type:"VEC3",min:[-t,-o,0],max:[t,o,0]},{bufferView:h,componentType:5126,count:4,type:"VEC3"},{bufferView:S,componentType:5126,count:4,type:"VEC2"},{bufferView:M,componentType:5123,count:6,type:"SCALAR"}]};m>=0?(U.images=[{name:"sign",bufferView:m,mimeType:"image/png"}],U.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],U.textures=[{sampler:0,source:0}],g.pbrMetallicRoughness.baseColorTexture={index:0},g.emissiveTexture={index:0},g.emissiveFactor=[1,1,1],g.extensions={KHR_materials_emissive_strength:{emissiveStrength:EMISSIVE_STRENGTH}},U.extensionsUsed=["KHR_materials_emissive_strength"]):g.emissiveFactor=[1,.85,.6];let y=v.encode(JSON.stringify(U));const T=L(y.length);if(T){const d=new Uint8Array(y.length+T);d.set(y),d.fill(32,y.length),y=d}const V=20+y.length+8+u,A=new Uint8Array(V),w=new DataView(A.buffer);w.setUint32(0,1179937895,!0),w.setUint32(4,2,!0),w.setUint32(8,V,!0),w.setUint32(12,y.length,!0),w.setUint32(16,1313821514,!0),A.set(y,20);let x=20+y.length;w.setUint32(x,u,!0),w.setUint32(x+4,5130562,!0),x+=8;for(const d of s)A.set(d,x),x+=d.byteLength;return new Blob([A],{type:"model/gltf-binary"})}const H=(()=>{const e=new Uint32Array(256);for(let i=0;i<256;i++){let n=i;for(let t=0;t<8;t++)n=n&1?3988292384^n>>>1:n>>>1;e[i]=n>>>0}return e})();export const crc32=e=>{let i=4294967295;for(let n=0;n<e.length;n++)i=H[(i^e[n])&255]^i>>>8;return(i^4294967295)>>>0};export function zipStored(e){const i=[],n=[];let t=0;for(const{name:f,data:s}of e){const r=s instanceof Uint8Array?s:typeof s=="string"?v.encode(s):new Uint8Array(s),u=v.encode(f),a=crc32(r),b=30+u.length;let h=(64-(t+b)%64)%64;h>0&&h<4&&(h+=64);const S=new Uint8Array(h);if(h){const g=new DataView(S.buffer);g.setUint16(0,6534,!0),g.setUint16(2,h-4,!0)}const M=new Uint8Array(30),m=new DataView(M.buffer);m.setUint32(0,67324752,!0),m.setUint16(4,20,!0),m.setUint16(6,0,!0),m.setUint16(8,0,!0),m.setUint16(10,0,!0),m.setUint16(12,33,!0),m.setUint32(14,a,!0),m.setUint32(18,r.length,!0),m.setUint32(22,r.length,!0),m.setUint16(26,u.length,!0),m.setUint16(28,h,!0),n.push({nameB:u,crc:a,size:r.length,offset:t}),i.push(M,u,S,r),t+=30+u.length+h+r.length}const o=t;let p=0;for(const f of n){const s=new Uint8Array(46),r=new DataView(s.buffer);r.setUint32(0,33639248,!0),r.setUint16(4,20,!0),r.setUint16(6,20,!0),r.setUint16(12,0,!0),r.setUint16(14,33,!0),r.setUint32(16,f.crc,!0),r.setUint32(20,f.size,!0),r.setUint32(24,f.size,!0),r.setUint16(28,f.nameB.length,!0),r.setUint32(42,f.offset,!0),i.push(s,f.nameB),p+=46+f.nameB.length}const l=new Uint8Array(22),c=new DataView(l.buffer);return c.setUint32(0,101010256,!0),c.setUint16(8,n.length,!0),c.setUint16(10,n.length,!0),c.setUint32(12,p,!0),c.setUint32(16,o,!0),i.push(l),new Blob(i,{type:"model/vnd.usdz+zip"})}const N=e=>(Math.round(e*1e6)/1e6).toString();export function usda(e,{orient:i="anchor",name:n="Lit Neon sign"}={}){const t=e.widthM/2,o=e.heightM/2,p=i==="z"?[[-t,-o,0],[t,-o,0],[t,o,0],[-t,o,0]]:[[-t,0,o],[t,0,o],[t,0,-o],[-t,0,-o]],l=i==="z"?"(0, 0, 1)":"(0, 1, 0)",c=p.map(s=>`(${s.map(N).join(", ")})`).join(", "),f=e.bytes?`
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
${f}
        }
    }

    def Mesh "Sign" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        float3[] extent = [(${p.reduce((s,r)=>s.map((u,a)=>Math.min(u,r[a])),[1/0,1/0,1/0]).map(N).join(", ")}), (${p.reduce((s,r)=>s.map((u,a)=>Math.max(u,r[a])),[-1/0,-1/0,-1/0]).map(N).join(", ")})]
        int[] faceVertexCounts = [3, 3]
        int[] faceVertexIndices = [0, 1, 2, 0, 2, 3]
        rel material:binding = </Root/Materials/Neon>
        normal3f[] normals = [${l}, ${l}, ${l}, ${l}] (
            interpolation = "vertex"
        )
        point3f[] points = [${c}]
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (
            interpolation = "vertex"
        )
        uniform bool doubleSided = 1
        uniform token subdivisionScheme = "none"
    }
}
`}export async function usdz(e,i,n={}){const t=await texture(e,i),o=[{name:"model.usda",data:v.encode(usda(t,n))}];return t.bytes&&o.push({name:"textures/sign.png",data:t.bytes}),zipStored(o)}export default{glb,usdz,zipStored,texture,usda,crc32,STUB,EMISSIVE_STRENGTH};
