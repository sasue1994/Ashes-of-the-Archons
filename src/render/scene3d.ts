// ============================================================
// ตัววาดเกมหลักแบบ 3D (Three.js) — อ่านสถานะจาก sim อย่างเดียว ไม่แก้ไขอะไรใน sim
//   ชั้น 3D : พื้น ยูนิต อาคาร ซากโบราณ แร่ เอฟเฟกต์ (InstancedMesh ต่อชนิด+ฝ่าย = draw call เดียว)
//   ชั้น 2D : canvas ซ้อนด้านบน สำหรับแถบเลือด ป้ายข้อความ กรอบเลือก เคอร์เซอร์ (ตำแหน่งจาก toScreen)
//   หมอกสงคราม: texture GW×GH คูณสีในทุกวัสดุตามตำแหน่งบนแผนที่ (withFog)
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CAPTURE_TIME, GH, GW, H as MAP_H, T, TEAM_COL, TIER_COL, W as MAP_W, type TypeKey } from '../sim/data';
import { cellAt, exp, seen, vis } from '../sim/fog';
import { tr } from '../sim/i18n';
import { validPlace } from '../sim/production';
import { awake, wakeText } from '../sim/ruins';
import { S, done, type Ent, type Ruin } from '../sim/state';
import { ctl, mouse, world } from '../ui/input';
import { COS, SIN, cam, setScreen, toScreen } from './camera';
import { Builder, debris, modelFor, oreModel, ruinModel, useToonPalette, type Model } from './models';
import { TOON, outlineGeo, outlineMat as makeOutline, toonGroundMat, toonMat, unitOutline } from './toon';

// ---------- คุณภาพ: ?q=low (ค่าเริ่มต้นบนมือถือ) / ?q=high ----------
const qParam = new URLSearchParams(location.search).get('q');
const LOW = qParam ? qParam === 'low' : matchMedia('(pointer: coarse)').matches;
if (TOON) useToonPalette(); // ต้องเรียกก่อนสร้างโมเดลชิ้นแรก

// ---------- หมอกสงคราม ----------
// fogCanvas = ภาพเล็กสำหรับมินิแมพ (1 พิกเซล = 1 ช่อง) · fogTex = ค่าความสว่างต่อช่องให้ shader
export const fogCanvas = document.createElement('canvas'); fogCanvas.width = GW; fogCanvas.height = GH;
const fctx = fogCanvas.getContext('2d')!, fimg = fctx.createImageData(GW, GH);
for (let i = 0; i < GW * GH; i++) { fimg.data[i * 4] = 8; fimg.data[i * 4 + 1] = 9; fimg.data[i * 4 + 2] = 11 }
const fogData = new Uint8Array(GW * GH), fogTex = new THREE.DataTexture(fogData, GW, GH, THREE.RedFormat);
fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true;
const fogU = { value: fogTex };
// ฉีดโค้ดเข้า shader ของวัสดุ: หาตำแหน่งบนแผนที่ของแต่ละพิกเซล (รองรับ InstancedMesh) แล้วคูณสีด้วยค่าหมอก
function withFog<M extends THREE.Material>(m: M): M {
  // จำ cache key เดิมไว้ก่อน (ค่าเริ่มต้นของ three คำนวณจากตัวฟังก์ชัน onBeforeCompile ซึ่งกำลังจะถูกแทน)
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    prev(s, r); s.uniforms.fogMap = fogU;
    s.vertexShader = 'varying vec2 vFogUv;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fogW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fogW = instanceMatrix * fogW;
      #endif
      vFogUv = (modelMatrix * fogW).xz / vec2(${MAP_W}.0, ${MAP_H}.0);`);
    s.fragmentShader = 'uniform sampler2D fogMap;\nvarying vec2 vFogUv;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor.rgb *= texture2D(fogMap, vFogUv).r;');
  };
  m.customProgramCacheKey = () => key + '|fog';
  return m;
}
function updateFog() {
  for (let i = 0; i < GW * GH; i++) {
    fogData[i] = vis[i] ? 255 : exp[i] ? 105 : 0;
    fimg.data[i * 4 + 3] = vis[i] ? 0 : exp[i] ? 150 : 255;
  }
  fogTex.needsUpdate = true; fctx.putImageData(fimg, 0, 0);
}

// ---------- scene / วัสดุร่วม ----------
const scene = new THREE.Scene(); scene.background = new THREE.Color('#050506');
scene.add(new THREE.HemisphereLight('#c8d3e0', '#3b3127', TOON ? .9 : 1.15));
const sun = new THREE.DirectionalLight('#ffe0b5', TOON ? 2 : 2.4); sun.castShadow = !LOW;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .6;
scene.add(sun, sun.target);
// body = รับแสง (flat shading / cel-shading) · glow = เรืองแสงไม่รับแสง สว่างเกิน 1 ให้ bloom จับ
const bodyMat = withFog(TOON ? toonMat() : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .85, metalness: .12 }));
const glowMat = withFog(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); glowMat.color.setScalar(2.4);
const outlineMat = withFog(makeOutline(1.1)), bigOutlineMat = withFog(makeOutline(1.8)); // เส้นขอบ toon
const cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);

// ---------- พื้นดินรกร้าง low-poly + เศษซาก ----------
function makeTerrain() {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let g: THREE.BufferGeometry = new THREE.PlaneGeometry(MAP_W, MAP_H, 90, 68);
  g.rotateX(-Math.PI / 2); g.translate(MAP_W / 2, 0, MAP_H / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, (Math.sin(x * .011) + Math.cos(z * .013) + Math.sin((x + z) * .02)) * 1 + rnd() * (TOON ? .6 : 2) - 3) }
  g = g.toNonIndexed(); g.deleteAttribute('uv');
  const n = g.getAttribute('position').count, col = new Float32Array(n * 3), pal = ['#4b4337', '#4e4639', '#484034', '#51493b', '#463e33'].map(c => new THREE.Color(c));
  for (let t = 0; t < n; t += 3) {
    const c = TOON ? new THREE.Color(1, 1, 1) : pal[Math.floor(rnd() * pal.length)]; // toon: สีพื้นคำนวณใน shader
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, withFog(TOON ? toonGroundMat() : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })));
  m.receiveShadow = true; scene.add(m);
  const b = new Builder(); S.rubble.forEach((r, i) => debris(i, r.x, r.y, .7 + r.w / 40, b));
  const d = b.build(), dm = new THREE.Mesh(d.body, bodyMat); dm.castShadow = dm.receiveShadow = true; scene.add(dm);
  if (TOON) scene.add(new THREE.Mesh(outlineGeo(d.body), outlineMat));
}

// ---------- กลุ่ม InstancedMesh ต่อ (ชนิด, ฝ่าย) ----------
interface Grp { m: Model; ims: THREE.InstancedMesh[]; cap: number; n: number } // ims[0] = body
const groups = new Map<string, Grp>(), dummy = new THREE.Object3D();
function makeGrp(m: Model, cap: number, outline = outlineMat): Grp {
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, sh: boolean) => {
    const im = new THREE.InstancedMesh(geo, mat, cap); im.frustumCulled = false; im.count = 0;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = sh; im.receiveShadow = sh; scene.add(im); return im;
  };
  const ims = [mk(m.body, bodyMat, true)];
  if (m.glow) ims.push(mk(m.glow, glowMat, false));
  if (TOON) ims.push(mk(outlineGeo(m.body), outline, false));
  return { m, ims, cap, n: 0 };
}
function grpFor(type: TypeKey, bld: boolean, team: number) {
  const key = type + '|' + team; let g = groups.get(key);
  if (!g) groups.set(key, g = makeGrp(modelFor(type, bld, TEAM_COL[team] ?? '#888'), 16));
  if (g.n >= g.cap) { // ขยายความจุเป็นสองเท่า
    for (const im of g.ims) { scene.remove(im); im.dispose() }
    const ng = makeGrp(g.m, g.cap * 2); ng.n = g.n; groups.set(key, ng);
    for (let i = 0; i < g.n; i++) { g.ims[0].getMatrixAt(i, dummy.matrix); for (const im of ng.ims) im.setMatrixAt(i, dummy.matrix) }
    g = ng;
  }
  return g;
}
function put(g: Grp) { dummy.updateMatrix(); for (const im of g.ims) im.setMatrixAt(g.n, dummy.matrix); g.n++ }
function flush(g: Grp) { for (const im of g.ims) { im.count = g.n; im.instanceMatrix.needsUpdate = true } }

// ---------- ซากโบราณ ----------
interface RuinView { glow: THREE.MeshBasicMaterial; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial }
const ruinViews: RuinView[] = [];
function makeRuins() {
  for (const r of S.ruins) {
    const m = ruinModel(r.kind, r.R.col);
    const body = new THREE.Mesh(m.body, bodyMat); body.position.set(r.x, 0, r.y); body.castShadow = body.receiveShadow = true;
    const gm = withFog(glowMat.clone()), glow = new THREE.Mesh(m.glow!, gm); glow.position.copy(body.position);
    const ringMat = withFog(new THREE.MeshBasicMaterial({ color: r.R.col, transparent: true, opacity: .35, toneMapped: false, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(r.r - 3, r.r, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(r.x, .6, r.y);
    scene.add(body, glow, ring); ruinViews.push({ glow: gm, ring, ringMat });
    if (TOON) { const o = new THREE.Mesh(outlineGeo(m.body), bigOutlineMat); o.position.copy(body.position); scene.add(o) }
  }
}

// ---------- pool ของชิ้นเอฟเฟกต์ (InstancedMesh ที่เขียนใหม่ทุกเฟรม) ----------
class Pool {
  im: THREE.InstancedMesh; n = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, public cap: number, colored = false) {
    this.im = new THREE.InstancedMesh(geo, mat, cap); this.im.frustumCulled = false; this.im.count = 0;
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (colored) this.im.setColorAt(0, new THREE.Color()); scene.add(this.im);
  }
  begin() { this.n = 0 }
  put(x: number, y: number, z: number, s: number | [number, number, number], ry = 0, rz = 0, col?: THREE.Color) {
    if (this.n >= this.cap) return;
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, rz);
    if (typeof s === 'number') dummy.scale.setScalar(s); else dummy.scale.set(...s);
    dummy.updateMatrix(); this.im.setMatrixAt(this.n, dummy.matrix); if (col) this.im.setColorAt(this.n, col); this.n++;
  }
  end() { this.im.count = this.n; this.im.instanceMatrix.needsUpdate = true; if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true }
}
const fxMat = (c: string, op = 1) => withFog(new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: op < 1, opacity: op, depthWrite: op >= 1 }));
const addMat = () => withFog(new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
const pools = {
  sel: new Pool(new THREE.RingGeometry(.86, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dff9a', toneMapped: false, transparent: true, opacity: .9, depthWrite: false }), 256),
  boom: new Pool(new THREE.IcosahedronGeometry(1, 0), withFog(new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: .85, depthWrite: false })), 400, true),
  puff: new Pool(new THREE.IcosahedronGeometry(1, 0), withFog(new THREE.MeshLambertMaterial({ color: '#6f6a64', transparent: true, opacity: .55, depthWrite: false })), 1500),
  shell: new Pool(new THREE.IcosahedronGeometry(2.2, 0), fxMat('#ffb14d'), 400),
  rocket: new Pool(new THREE.ConeGeometry(1.6, 9, 5).rotateZ(-Math.PI / 2), fxMat('#e6e9ec'), 800),
  flame: new Pool(new THREE.ConeGeometry(2.2, 10, 5).rotateZ(Math.PI / 2), fxMat('#ff8a2a', .8), 800),
  laser: new Pool(new THREE.BoxGeometry(1, 1, 1), addMat(), 1200, true),        // กระสุนเส้น / ลำแสง
  core: new Pool(new THREE.OctahedronGeometry(5, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 64, true),    // แกนข้อมูล (ทุกฝ่ายเห็น)
  bp: new Pool(new THREE.BoxGeometry(12, 1.4, 9), new THREE.MeshBasicMaterial({ toneMapped: false }), 32, true),       // พิมพ์เขียว
  beam: new Pool(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), fxMat('#ffb8ef', .75), 8),
};
const tmpC = new THREE.Color();
function laser(x1: number, z1: number, x2: number, z2: number, y: number, w: number, c: THREE.Color) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz); if (len < .5) return;
  pools.laser.put((x1 + x2) / 2, y, (z1 + z2) / 2, [len, w, w], -Math.atan2(dz, dx), 0, c);
}
function drawFx(now: number) {
  for (const p of Object.values(pools)) p.begin();
  for (const f of S.fx) {
    const a = Math.max(0, f.ttl / f.max), p = 1 - a;
    if (f.k === 'shot') {
      const q0 = Math.max(0, p - .3), q1 = Math.min(1, p + .4), dx = f.x2 - f.x1, dy = f.y2 - f.y1;
      laser(f.x1 + dx * q0, f.y1 + dy * q0, f.x1 + dx * q1, f.y1 + dy * q1, 12, 1.8, tmpC.set(f.col).multiplyScalar(1.8 * a));
    } else if (f.k === 'beam') {
      laser(f.x1, f.y1, f.x2, f.y2, 12, 7 * a + 2, tmpC.set(f.col).multiplyScalar(1.4 * a));
      laser(f.x1, f.y1, f.x2, f.y2, 12, 2 * a + .6, tmpC.setScalar(2.2 * a));
    } else if (f.k === 'shell') pools.shell.put(f.x1 + (f.x2 - f.x1) * p, 10 + Math.sin(p * Math.PI) * 70, f.y1 + (f.y2 - f.y1) * p, 1);
    else if (f.k === 'boom') { const s = f.r * (.35 + p * .75); pools.boom.put(f.x, s * .5, f.y, s, p * 3, 0, tmpC.setRGB(2.2 - p * 1.6, 1.1 - p * .9, .35 - p * .3)) }
    else if (f.k === 'puff') pools.puff.put(f.x, 12 + p * 10, f.y, f.r * (1 + p * 2.4));
    else if (f.k === 'orbital') { pools.beam.put(f.x, 600, f.y, [60 * a + 4, 1200, 60 * a + 4]); pools.boom.put(f.x, 20, f.y, 170 * (1.1 - a * .4), 0, 0, tmpC.setRGB(2, .6, 1.6)) }
  }
  for (const m of S.shots) {
    pools.rocket.put(m.x, 14, m.y, 1, -m.ang);
    pools.flame.put(m.x - Math.cos(m.ang) * 9, 14, m.y - Math.sin(m.ang) * 9, [1, .8 + Math.random() * .5, 1], -m.ang);
  }
  // ของหล่นในสนาม + ของที่ Rig ขนอยู่ ลอยหมุนเหนือพื้น
  const cargo = (key: unknown, x: number, y: number, z: number, tier: number, s: number) =>
    (key ? pools.bp : pools.core).put(x, y, z, s, now * (key ? 1 : 1.6), 0, tmpC.set(TIER_COL[tier]).multiplyScalar(2));
  for (const it of S.items) cargo(it.key, it.x, 14 + Math.sin(now * 3 + it.x) * 3, it.y, it.tier, 1);
  for (const e of S.ents) if (e.carry && e.hp > 0 && seen(e)) cargo(e.carry.key, e.x, 42 + Math.sin(now * 4) * 3, e.y, e.carry.tier, .8);
  for (const p of Object.values(pools)) p.end();
}

// ---------- ยูนิต/อาคาร/แร่/ซาก ทุกเฟรม ----------
const onScreen = (x: number, y: number, pad: number) => x > cam.x - pad && x < cam.x + cam.w + pad && y > cam.y - pad && y < cam.y + cam.h + pad * 2;
let oreGrp: { ore: Grp; xen: Grp };
function syncWorld(now: number) {
  for (const g of groups.values()) g.n = 0;
  for (const e of S.ents) {
    if (e.hp <= 0 || !seen(e) || !onScreen(e.x, e.y, 120)) continue;
    const t = e.t, g = grpFor(e.type, t.bld, e.team);
    const hover = t.kind === 'neu' && e.type !== 'obelisk' ? Math.sin(now * 2.5 + e.id) * 2.5
      : t.kind === 'inf' && e.mx != null ? Math.abs(Math.sin(now * 12 + e.id)) * 1.2 : 0;   // ทหารเดินกระเด้งตามก้าว
    const grow = e.build > 0 ? .25 + .75 * (1 - e.build / e.buildMax) : 1;              // อาคารกำลังสร้าง: ค่อยๆ สูงขึ้น
    const turn = !t.bld || e.type === 'turret';
    dummy.position.set(e.x, hover, e.y); dummy.rotation.set(0, turn ? -e.ang : 0, 0); dummy.scale.set(1, grow, 1);
    if (e.type === 'warden') dummy.rotation.y = now * .3;
    put(g);
    if (e.sel) pools.sel.put(e.x, 1.2, e.y, t.r + 6);
  }
  for (const g of groups.values()) flush(g);
  // แร่: ขนาดตามปริมาณที่เหลือ
  oreGrp.ore.n = oreGrp.xen.n = 0;
  for (const o of S.ores) if (o.amt > 0 && onScreen(o.x, o.y, 40)) {
    const g = o.kind === 'xen' ? oreGrp.xen : oreGrp.ore; dummy.position.set(o.x, 0, o.y); dummy.rotation.set(0, o.x, 0); dummy.scale.setScalar(.5 + o.amt / 500); put(g);
  }
  flush(oreGrp.ore); flush(oreGrp.xen);
  // ซาก: หรี่ตอนหลับ / สีวงตามผู้ครอบครอง / วงกระเพื่อมตอนกำลังถอดรหัส
  S.ruins.forEach((r, i) => {
    const v = ruinViews[i], sleeping = !awake(r);
    v.glow.color.setScalar(sleeping ? .5 : r.spent ? 1.2 : 2 + Math.sin(now * 3) * .6);
    v.ringMat.color.set(r.spent && r.owner >= 0 ? TEAM_COL[r.owner] : r.R.col);
    const k = (now % 1.5) / 1.5; v.ring.scale.setScalar(r.active ? 1 + k * .6 : 1); v.ringMat.opacity = r.active ? .7 * (1 - k) : .3;
  });
}

// ---------- เงาตัวอย่างตอนวางอาคาร ----------
const ghostMat = new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: .45, depthWrite: false });
const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat); ghost.visible = false; scene.add(ghost);
let ghostType = '';
function syncGhost() {
  const placing = ctl.mode === 'place'; ghost.visible = placing; if (!placing) return;
  if (ghostType !== ctl.placeType) { ghostType = ctl.placeType; ghost.geometry = modelFor(ctl.placeType, true, TEAM_COL[0]).body }
  const p = world(); ghost.position.set(p.x, 0, p.y);
  ghostMat.color.set(validPlace(0, ctl.placeType, p.x, p.y) ? '#7dff9a' : '#ff6b6b');
}

// ============================================================
// ชั้น 2D ซ้อนบนภาพ 3D
// ============================================================
const FONT = '"Chakra Petch", system-ui, "Segoe UI", Tahoma, sans-serif', DARK = '#0b0d10';
const ov = document.createElement('canvas'), g = ov.getContext('2d')!;
Object.assign(ov.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
function text(s: string, x: number, y: number, col: string, size = 12, alpha = 1) {
  if (!s) return;
  g.globalAlpha = alpha; g.font = '700 ' + size + 'px ' + FONT; g.textAlign = 'center';
  g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = DARK; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y); g.globalAlpha = 1;
}
// วงกลมบนพื้น = วงรีบนจอ
function ring(x: number, y: number, R: number, a0 = 0, a1 = Math.PI * 2) {
  const s = toScreen(x, y); g.beginPath(); g.ellipse(s.x, s.y, R * cam.zoom, R * cam.zoom * SIN, 0, a0, a1);
}
function stroke(col: string, w: number, alpha = 1, dash: number[] = []) { g.globalAlpha = alpha; g.setLineDash(dash); g.lineWidth = w; g.strokeStyle = col; g.stroke(); g.setLineDash([]); g.globalAlpha = 1 }
function bar(x: number, y: number, bw: number, f: number, col: string) {
  g.fillStyle = 'rgba(11,13,16,.8)'; g.beginPath(); g.roundRect(x - bw / 2 - 1, y - 1, bw + 2, 6, 3); g.fill();
  if (f > 0) { g.fillStyle = col; g.beginPath(); g.roundRect(x - bw / 2, y, Math.max(4, bw * f), 4, 2); g.fill() }
}
// ความสูงโดยประมาณของหัวยูนิต (ไว้วางแถบเลือด)
const topOf = (e: Ent) => e.t.bld ? 26 + e.t.r * .5 : e.type === 'warden' ? 64 : e.type === 'obelisk' ? 62 : e.t.kind === 'neu' ? 28 : e.t.kind === 'inf' ? 22 : 26;

function ruinStatus(r: Ruin): [string, string] {
  if (!awake(r)) return [tr('ปิดผนึก · ตื่นใน ', 'Sealed · wakes in ') + wakeText(r), '#c9c3d6'];
  if (r.spent) {
    const who = r.owner === 0 ? tr('ฝ่ายเรา', 'You') : r.owner === 1 ? tr('ศัตรู', 'Enemy') : tr('ว่าง', 'None');
    const bonus = r.R.income ? ' +$' + r.R.income + tr('/วิ', '/s') : tr(' ซูเปอร์เวพอนชาร์จ x2', ' superweapon x2');
    if (r.contested) return [tr('แย่งชิง!', 'Contested!'), '#ffcc4d'];
    if (r.cap > 0 && r.capTeam >= 0) return [(r.capTeam === 0 ? tr('กำลังยึด ', 'Capturing ') : tr('ศัตรูกำลังยึด ', 'Enemy capturing ')) + Math.floor(100 * r.cap / CAPTURE_TIME) + '%', TEAM_COL[r.capTeam]];
    return [tr('ครอบครอง: ', 'Held by: ') + who + (r.owner >= 0 ? bonus : ''), r.owner >= 0 ? TEAM_COL[r.owner] : '#c9c3d6'];
  }
  if (r.prog > 0) return [(r.contested ? tr('ถูกขัดขวาง ', 'Blocked ') : tr('ถอดรหัส ', 'Decrypting ')) + Math.floor(100 * r.prog / r.need) + '%', r.contested ? '#ffcc4d' : TEAM_COL[r.team] || '#fff'];
  return ['', '#fff'];
}

function drawOverlay(now: number) {
  const dpr = ov.width / Math.max(1, cam.sw);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cam.sw, cam.sh);
  // รัศมีโดมป้องกัน
  for (const e of S.ents) if (e.type === 'dome' && e.hp > 0 && seen(e)) { ring(e.x, e.y, e.t.aura); g.fillStyle = 'rgba(160,245,255,.06)'; g.fill(); stroke('rgba(120,230,255,.6)', 2, 1, [10, 8]) }
  // ซากโบราณ: ชื่อ สถานะ ความคืบหน้า
  for (const r of S.ruins) {
    if (!exp[cellAt(r.x, r.y)]) continue;
    const s = r.r * .45 + 14, top = toScreen(r.x, r.y - r.r, 20), bot = toScreen(r.x, r.y + r.r, 0);
    if (r.prog > 0) {
      ring(r.x, r.y, s); stroke(DARK, 8, .5);
      ring(r.x, r.y, s, -Math.PI / 2, -Math.PI / 2 + 6.283 * r.prog / r.need); g.lineCap = 'round'; stroke(r.contested ? '#ffcc4d' : TEAM_COL[r.team], 6); g.lineCap = 'butt';
    }
    if (r.spent && r.cap > 0 && r.capTeam >= 0) { ring(r.x, r.y, r.r, -Math.PI / 2, -Math.PI / 2 + 6.283 * r.cap / CAPTURE_TIME); stroke(TEAM_COL[r.capTeam], 6) }
    text('T' + r.R.tier + ' ' + r.R.name, bot.x, bot.y + 20, r.R.col);
    const [st, col] = ruinStatus(r); text(st, top.x, top.y, col);
  }
  // ของหล่นส่งสัญญาณ
  for (const it of S.items) { const p = (now % 2) / 2; ring(it.x, it.y, 14 + p * 26); stroke('#fff', 2, .6 * (1 - p)) }
  // แถบเลือด / แถบก่อสร้าง
  for (const e of S.ents) {
    if (e.hp <= 0 || !seen(e) || !onScreen(e.x, e.y, 60)) continue;
    const t = e.t, head = toScreen(e.x, e.y, topOf(e)), bw = Math.max(22, t.r * 2 * Math.min(1.2, cam.zoom));
    if (!done(e)) { const foot = toScreen(e.x, e.y + t.r); bar(foot.x, foot.y + 4, bw, 1 - e.build / e.buildMax, '#ffd166') }
    if (e.sel || e.hp < e.maxhp) { const f = Math.max(0, e.hp / e.maxhp); bar(head.x, head.y - 10, bw, f, f > .5 ? '#7dff9a' : f > .25 ? '#ffd166' : '#ff6b6b') }
  }
  // เอฟเฟกต์บนพื้น + ตัวเลขลอย
  for (const f of S.fx) {
    const a = Math.max(0, f.ttl / f.max), p = 1 - a;
    if (f.k === 'ping') { ring(f.x, f.y, 18 * a + 3); stroke(f.col, 2.5, a) }
    else if (f.k === 'target') { ring(f.x, f.y, 160 * a + 1); stroke('#ff5ad2', 3) }
    else if (f.k === 'txt') { const s = toScreen(f.x, f.y, 24 + p * 30); text(f.text, s.x, s.y, f.col, 15, Math.min(1, a * 2)) }
  }
  // เคอร์เซอร์ตามโหมด
  const p = world();
  if (ctl.mode === 'place') {
    const t = T[ctl.placeType], ok = validPlace(0, ctl.placeType, p.x, p.y), col = ok ? '#7dff9a' : '#ff6b6b';
    const a = toScreen(p.x - t.r, p.y - t.r), b = toScreen(p.x + t.r, p.y + t.r);
    g.fillStyle = col; g.globalAlpha = .25; g.beginPath(); g.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 8); g.fill(); g.globalAlpha = 1;
    if (t.aura || t.range) { ring(p.x, p.y, t.aura || t.range); stroke(col, 2) }
  }
  if (ctl.mode === 'amove' || ctl.mode === 'strike') {
    const strike = ctl.mode === 'strike', col = strike ? '#ff5ad2' : '#ff6b6b', R = strike ? 160 : 14;
    ring(p.x, p.y, R); stroke(col, 2.5);
    text(strike ? tr('เลือกเป้าหมาย', 'Pick target') : tr('เดินพร้อมยิง', 'Attack-move'), mouse.x, mouse.y + R * cam.zoom * SIN + 18, col);
  }
  if (mouse.drag) {
    g.beginPath(); g.roundRect(Math.min(mouse.sx, mouse.x), Math.min(mouse.sy, mouse.y), Math.abs(mouse.x - mouse.sx), Math.abs(mouse.y - mouse.sy), 6);
    g.fillStyle = 'rgba(125,255,154,.1)'; g.fill(); stroke('#7dff9a', 1.5);
  }
}

// ============================================================
// API
// ============================================================
let renderer: THREE.WebGLRenderer, composer: EffectComposer | null = null;
export const canvas = () => renderer.domElement;

export function initScene(host: HTMLElement) {
  renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 2));
  renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  host.prepend(renderer.domElement, ov);
  if (!LOW) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam3));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .75, .5, TOON ? 1.15 : .9));
    composer.addPass(new OutputPass());
  }
  makeTerrain(); makeRuins();
  const cap = Math.max(64, S.ores.length);
  oreGrp = { ore: makeGrp(oreModel(false), cap), xen: makeGrp(oreModel(true), cap) };
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h); composer?.setSize(w, h); composer?.setPixelRatio(renderer.getPixelRatio());
    const d = Math.min(devicePixelRatio, 2); ov.width = w * d; ov.height = h * d; ov.style.width = w + 'px'; ov.style.height = h + 'px';
    setScreen(w, h);
  };
  new ResizeObserver(resize).observe(host); resize();
}

function placeCamera() {
  const hw = cam.sw / 2 / cam.zoom, hh = cam.sh / 2 / cam.zoom;
  Object.assign(cam3, { left: -hw, right: hw, top: hh, bottom: -hh }); cam3.updateProjectionMatrix();
  const cx = cam.x + cam.w / 2, cz = cam.y + cam.h / 2, d = 3000;
  cam3.position.set(cx, d * SIN, cz + d * COS); cam3.lookAt(cx, 0, cz);
  // ดวงอาทิตย์ตามกล้อง เงาคมเฉพาะบริเวณที่มองอยู่
  sun.position.set(cx - 600, 1100, cz - 350); sun.target.position.set(cx, 0, cz);
  const sc = sun.shadow.camera, r = Math.max(cam.w, cam.h) * .8 + 100;
  Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: 10, far: 3000 }); sc.updateProjectionMatrix();
}

export function renderScene(now: number) {
  updateFog(); placeCamera(); syncWorld(now); drawFx(now); syncGhost();
  if (composer) composer.render(); else renderer.render(scene, cam3);
  drawOverlay(now);
}

// ---------- รูปไอคอนบนปุ่ม HUD: เรนเดอร์โมเดล 3D ตัวเดียวกับในเกม ----------
let iconR: THREE.WebGLRenderer | null = null;
const iconScene = new THREE.Scene(), iconCam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000);
iconScene.add(new THREE.HemisphereLight('#dfe6ee', '#3b3127', 1.4));
{ const l = new THREE.DirectionalLight('#ffe0b5', 2.2); l.position.set(-300, 600, 400); iconScene.add(l) }
const iconBody = TOON ? toonMat() : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8, metalness: .12 });
const iconGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); iconGlow.color.setScalar(1.6);
export function modelIcon(type: TypeKey, team: string, w = 128, h = 96): HTMLCanvasElement {
  if (!iconR) { iconR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); iconR.setClearColor(0, 0); iconR.toneMapping = THREE.ACESFilmicToneMapping }
  iconR.setSize(w, h, false);
  const m = modelFor(type, T[type].bld, team), grp = new THREE.Group();
  grp.add(new THREE.Mesh(m.body, iconBody)); if (m.glow) grp.add(new THREE.Mesh(m.glow, iconGlow));
  if (TOON) grp.add(new THREE.Mesh(outlineGeo(m.body), unitOutline));
  grp.rotation.y = T[type].bld ? 0 : -.6; iconScene.add(grp);
  // มองมุมเดียวกับในเกม แล้วขยายให้โมเดลเต็มกรอบ
  const sph = new THREE.Box3().setFromObject(grp).getBoundingSphere(new THREE.Sphere()), R = sph.radius * .92, a = w / h;
  Object.assign(iconCam, { left: -R * a, right: R * a, top: R, bottom: -R }); iconCam.updateProjectionMatrix();
  iconCam.position.set(sph.center.x, sph.center.y + 1000 * SIN, sph.center.z + 1000 * COS); iconCam.lookAt(sph.center);
  iconR.render(iconScene, iconCam); iconScene.remove(grp);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(iconR.domElement, 0, 0); return c;
}
