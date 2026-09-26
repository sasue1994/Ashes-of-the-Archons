// ============================================================
// สไตล์ Toon (cel-shading + เส้นขอบดำแบบคอมิก) ใช้กับหน้า toon.html
// เปิดด้วย <body data-style="toon"> — โมเดลชุดเดียวกับ low-poly แต่เปลี่ยนวิธีลงเงาและเพิ่มเส้นขอบ
// ============================================================
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// เปิดด้วย <body data-style="toon"> หรือ ?style=toon ในที่อยู่
export const TOON = document.body.dataset.style === 'toon' || new URLSearchParams(location.search).get('style') === 'toon';

// ไล่เฉดแสงแค่ 3 ขั้น (เงาเข้ม / กลาง / สว่าง) = ลักษณะเด่นของ cel-shading
function gradientMap() {
  const t = new THREE.DataTexture(new Uint8Array([60, 150, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}
const grad = gradientMap();
export function toonMat(bright = 1.2) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
  m.color.setScalar(bright); return m;
}

// ---------- เส้นขอบแบบ inverted hull ----------
// วาดโมเดลซ้ำอีกชั้นด้านหลัง ขยายออกตาม normal เป็นสีดำ → เห็นเป็นเส้นขอบรอบรูปทรง
// ใช้ normal แบบเรียบ (รวมจุดยอดที่ซ้อนกันก่อน) ไม่อย่างนั้นมุมกล่องจะมีรอยแตก
const outlineCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
export function outlineGeo(src: THREE.BufferGeometry) {
  let o = outlineCache.get(src); if (o) return o;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', src.getAttribute('position').clone());
  o = mergeVertices(g, 1e-3); o.computeVertexNormals(); outlineCache.set(src, o); return o;
}
export function outlineMat(width: number) {
  const m = new THREE.MeshBasicMaterial({ color: '#0b0a0c', side: THREE.BackSide });
  m.onBeforeCompile = s => {
    s.uniforms.outlineW = { value: width };
    s.vertexShader = 'uniform float outlineW;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * outlineW;');
  };
  m.customProgramCacheKey = () => 'outline' + width;
  return m;
}
export const unitOutline = outlineMat(1.1);    // ยูนิต/อาคาร
export const bigOutline = outlineMat(1.8);     // ซากโบราณ (ใหญ่ ใช้เส้นหนากว่า)

// พื้นทรายโทนอุ่น แบ่งสีเป็นแถบตามระดับ noise (ดูเหมือนลงสีด้วยมือแบบคอมิก)
export const TOON_GROUND = ['#8a6a42', '#977648', '#a4834f', '#b08f59'].map(c => new THREE.Color(c));

// วัสดุพื้นแบบ toon: คำนวณแถบสีต่อพิกเซลจากตำแหน่งบนแผนที่ ขอบแถบจึงโค้งเรียบแทนที่จะหยักตามสามเหลี่ยม
export function toonGroundMat() {
  const m = new THREE.MeshToonMaterial({ gradientMap: grad });
  m.onBeforeCompile = s => {
    TOON_GROUND.forEach((c, i) => { s.uniforms['band' + i] = { value: c } });
    s.vertexShader = 'varying vec2 vGP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = (modelMatrix * vec4(position, 1.0)).xz;');
    s.fragmentShader = 'varying vec2 vGP;\nuniform vec3 band0, band1, band2, band3;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float v = sin(vGP.x * .004) + cos(vGP.y * .005) + sin((vGP.x - vGP.y) * .0035) * .8 + sin(vGP.x * .021 + vGP.y * .017) * .15;
      float t = clamp(floor((v + 2.8) / 5.6 * 4.0), 0.0, 3.0);
      diffuseColor.rgb *= t < .5 ? band0 : t < 1.5 ? band1 : t < 2.5 ? band2 : band3;`);
  };
  m.customProgramCacheKey = () => 'toonGround';
  return m;
}
