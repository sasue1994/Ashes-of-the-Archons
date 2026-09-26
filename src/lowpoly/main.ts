// ============================================================
// ต้นแบบกราฟิก Low-poly 3D (หน้าแยก lowpoly.html) — ใช้ sim ของเกมจริงทั้งหมด เปลี่ยนแค่การวาด
// โหมดชมอย่างเดียว: AI ศัตรูเล่นจริง + ปุ่มปล่อยทัพสองฝ่ายมาปะทะกันไว้ทดสอบความลื่น
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { startMatch } from '../sim/ai';
import { H as MAP_H, TEAM_COL, TIER_COL, W as MAP_W, applyDataLang, type AiLevel, type TypeKey } from '../sim/data';
import { i18n, tr } from '../sim/i18n';
import { awake } from '../sim/ruins';
import { S, spawn } from '../sim/state';
import { update } from '../sim/update';
import { initWorld } from '../sim/world';
import { Builder, debris, modelFor, oreModel, ruinModel, useToonPalette, type Model } from '../render/models';
import { TOON, bigOutline, outlineGeo, toonGroundMat, toonMat, unitOutline } from '../render/toon';

// ---------- ตั้งค่าคุณภาพ: ?q=low (มือถือ) / ?q=high (ค่าเริ่มต้นบนคอม) ----------
const store = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } } };
const qParam = new URLSearchParams(location.search).get('q');
const LOW = qParam ? qParam === 'low' : matchMedia('(pointer: coarse)').matches;
const opt = { shadows: !LOW, bloom: !LOW };
i18n.lang = store.get('archon.lang') === 'en' ? 'en' : 'th'; applyDataLang();
if (TOON) useToonPalette(); // ต้องเรียกก่อนสร้างโมเดลชิ้นแรก

// ---------- renderer / scene ----------
const host = document.getElementById('view')!;
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.info.autoReset = false;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(TOON ? '#1d150d' : '#14120f');
scene.add(new THREE.HemisphereLight('#c8d3e0', '#3b3127', TOON ? .9 : 1.15));
const sun = new THREE.DirectionalLight('#ffe0b5', TOON ? 2 : 2.4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .6;
scene.add(sun, sun.target);

// วัสดุร่วม: body รับแสงแบบ flat shading / glow เรืองแสงไม่รับแสง (สว่างเกิน 1 ให้ bloom จับ)
// หน้า toon.html ใช้ cel-shading แทน (ดู toon.ts)
const bodyMat: THREE.Material = TOON ? toonMat() : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .85, metalness: .12 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); glowMat.color.setScalar(2.4);

// ---------- กล้องมุมเฉียงแบบ RA2 (orthographic) ----------
const VIEW = 820, PITCH = .66;
const view = { x: 1500, z: 1650, zoom: 1.5, yaw: Math.PI / 4, yawTo: Math.PI / 4 };
// #x,z,zoom ในที่อยู่ = ตั้งมุมกล้องเริ่มต้น (ไว้ถ่ายภาพ/ทดสอบ)
{ const h = location.hash.slice(1).split(',').map(Number); if (h.length >= 2 && h.every(n => !isNaN(n))) { view.x = h[0]; view.z = h[1]; if (h[2]) view.zoom = h[2] } }
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);
function placeCamera() {
  const w = host.clientWidth, h = host.clientHeight, a = w / h, s = VIEW / 2 / view.zoom;
  Object.assign(cam, { left: -s * a, right: s * a, top: s, bottom: -s }); cam.updateProjectionMatrix();
  view.yaw += (view.yawTo - view.yaw) * .18;
  const d = 3000, cp = Math.cos(PITCH);
  cam.position.set(view.x + Math.sin(view.yaw) * cp * d, Math.sin(PITCH) * d, view.z + Math.cos(view.yaw) * cp * d);
  cam.lookAt(view.x, 0, view.z);
  // ดวงอาทิตย์ตามกล้อง เงาจะคมเฉพาะบริเวณที่มองอยู่
  sun.position.set(view.x - 600, 1100, view.z - 350); sun.target.position.set(view.x, 0, view.z);
  const sc = sun.shadow.camera, r = s * Math.max(a, 1) * 1.5;
  Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: 10, far: 3000 }); sc.updateProjectionMatrix();
}
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmpV = new THREE.Vector3();
function groundAt(cx: number, cy: number) {
  const b = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((cx - b.left) / b.width * 2 - 1, -((cy - b.top) / b.height) * 2 + 1), cam);
  return ray.ray.intersectPlane(ground, tmpV) ? tmpV.clone() : null;
}
const clampView = () => { view.x = Math.max(0, Math.min(MAP_W, view.x)); view.z = Math.max(0, Math.min(MAP_H, view.z)); view.zoom = Math.max(.3, Math.min(3, view.zoom)) };

// ---------- พื้นดินรกร้าง low-poly (สามเหลี่ยมสีต่างกันเล็กน้อย) ----------
function makeTerrain() {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let g: THREE.BufferGeometry = new THREE.PlaneGeometry(MAP_W, MAP_H, 90, 68);
  g.rotateX(-Math.PI / 2); g.translate(MAP_W / 2, 0, MAP_H / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, (Math.sin(x * .011) + Math.cos(z * .013) + Math.sin((x + z) * .02)) * 1.2 + rnd() * (TOON ? .6 : 2.2) - 3) }
  g = g.toNonIndexed(); g.deleteAttribute('uv');
  const n = g.getAttribute('position').count, col = new Float32Array(n * 3), pal = ['#4b4337', '#4e4639', '#484034', '#51493b', '#463e33'].map(c => new THREE.Color(c));
  const WHITE = new THREE.Color(1, 1, 1);
  for (let t = 0; t < n; t += 3) {
    let c = pal[Math.floor(rnd() * pal.length)];
    if (TOON) c = WHITE; // toon: สีพื้นคำนวณใน shader (toonGroundMat)
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, TOON ? toonGroundMat() : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })); m.receiveShadow = true; scene.add(m);
  const out = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 4, MAP_H * 4), new THREE.MeshBasicMaterial({ color: TOON ? '#3a2b1b' : '#1c1813' }));
  out.rotation.x = -Math.PI / 2; out.position.set(MAP_W / 2, -14, MAP_H / 2); // ต่ำกว่าจุดต่ำสุดของพื้น (-6.6) ไม่ให้โผล่ทะลุ scene.add(out);
  // เศษซาก (รวมเป็น mesh เดียว)
  const b = new Builder(); S.rubble.forEach((r, i) => debris(i, r.x, r.y, .7 + r.w / 40, b));
  const d = b.build(), dm = new THREE.Mesh(d.body, bodyMat); dm.castShadow = dm.receiveShadow = true; scene.add(dm);
  if (TOON) scene.add(new THREE.Mesh(outlineGeo(d.body), unitOutline));
}

// ---------- กลุ่ม InstancedMesh ต่อ (ชนิด, ฝ่าย): วาดยูนิตชนิดเดียวกันทั้งหมดใน draw call เดียว ----------
interface Grp { m: Model; ims: THREE.InstancedMesh[]; cap: number; n: number } // ims[0] = body
const groups = new Map<string, Grp>(), dummy = new THREE.Object3D();
function makeGrp(m: Model, cap: number): Grp {
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, sh: boolean) => {
    const im = new THREE.InstancedMesh(geo, mat, cap); im.frustumCulled = false; im.count = 0;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = sh; im.receiveShadow = sh; scene.add(im); return im;
  };
  const ims = [mk(m.body, bodyMat, true)];
  if (m.glow) ims.push(mk(m.glow, glowMat, false));
  if (TOON) ims.push(mk(outlineGeo(m.body), unitOutline, false));   // เส้นขอบ toon
  return { m, ims, cap, n: 0 };
}
function grpFor(type: TypeKey, bld: boolean, team: number) {
  const key = type + '|' + team; let g = groups.get(key);
  if (!g) groups.set(key, g = makeGrp(modelFor(type, bld, TEAM_COL[team] ?? '#888'), 32));
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

// ---------- ซากโบราณ / แร่ ----------
interface RuinView { glow: THREE.MeshBasicMaterial; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; crystal: THREE.Mesh }
const ruinViews: RuinView[] = [];
function makeRuins() {
  for (const r of S.ruins) {
    const m = ruinModel(r.kind, r.R.col);
    const body = new THREE.Mesh(m.body, bodyMat); body.position.set(r.x, 0, r.y); body.castShadow = body.receiveShadow = true;
    const gm = glowMat.clone(), glow = new THREE.Mesh(m.glow!, gm); glow.position.copy(body.position);
    const ringMat = new THREE.MeshBasicMaterial({ color: r.R.col, transparent: true, opacity: .35, toneMapped: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r.r - 3, r.r, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(r.x, .6, r.y);
    scene.add(body, glow, ring); ruinViews.push({ glow: gm, ring, ringMat, crystal: glow });
    if (TOON) { const o = new THREE.Mesh(outlineGeo(m.body), bigOutline); o.position.copy(body.position); scene.add(o) }
  }
}
const oreGrp = { ore: makeGrp(oreModel(false), 128), xen: makeGrp(oreModel(true), 128) };

// ---------- เอฟเฟกต์: เส้นกระสุน/ลำแสง + pool ของทรงกลม/กรวย ----------
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
const MAXL = 4000, lineBuf = new Float32Array(MAXL * 6), lineCol = new Float32Array(MAXL * 6), lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(lineBuf, 3).setUsage(THREE.DynamicDrawUsage));
lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));
const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false })); lines.frustumCulled = false; scene.add(lines);
const fxMat = (c: string, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: op < 1, opacity: op, depthWrite: op >= 1 });
const pools = {
  boom: new Pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: .85, depthWrite: false }), 400, true),
  puff: new Pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#6f6a64', transparent: true, opacity: .55, depthWrite: false }), 1500),
  shell: new Pool(new THREE.IcosahedronGeometry(2.2, 0), fxMat('#ffb14d'), 400),
  rocket: new Pool(new THREE.ConeGeometry(1.6, 9, 5).rotateZ(-Math.PI / 2), fxMat('#e6e9ec'), 800),
  flame: new Pool(new THREE.ConeGeometry(2.2, 10, 5).rotateZ(Math.PI / 2), fxMat('#ff8a2a', .8), 800),
  core: new Pool(new THREE.OctahedronGeometry(5, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 64, true),
  beam: new Pool(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), fxMat('#ffb8ef', .75), 8),
};
const tmpC = new THREE.Color();
function drawFx(now: number) {
  let n = 0;
  const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: THREE.Color, k: number) => {
    if (n >= MAXL) return; lineBuf.set([x1, y1, z1, x2, y2, z2], n * 6);
    lineCol.set([c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k], n * 6); n++;
  };
  for (const p of Object.values(pools)) p.begin();
  for (const f of S.fx) {
    const a = Math.max(0, f.ttl / f.max), p = 1 - a;
    if (f.k === 'shot' || f.k === 'beam') {
      tmpC.set(f.col); const q0 = f.k === 'beam' ? 0 : Math.max(0, p - .3), q1 = f.k === 'beam' ? 1 : Math.min(1, p + .4);
      seg(f.x1 + (f.x2 - f.x1) * q0, 10, f.y1 + (f.y2 - f.y1) * q0, f.x1 + (f.x2 - f.x1) * q1, 10, f.y1 + (f.y2 - f.y1) * q1, tmpC, f.k === 'beam' ? 3 * a + .5 : 1.6 * a);
    } else if (f.k === 'shell') pools.shell.put(f.x1 + (f.x2 - f.x1) * p, 10 + Math.sin(p * Math.PI) * 70, f.y1 + (f.y2 - f.y1) * p, 1);
    else if (f.k === 'boom') { const s = f.r * (.35 + p * .75); pools.boom.put(f.x, s * .5, f.y, s, p * 3, 0, tmpC.setRGB(2.2 - p * 1.6, 1.1 - p * .9, .35 - p * .3)) }
    else if (f.k === 'puff') pools.puff.put(f.x, 12 + p * 10, f.y, f.r * (1 + p * 2.4));
    else if (f.k === 'orbital') { pools.beam.put(f.x, 600, f.y, [60 * a + 4, 1200, 60 * a + 4]); pools.boom.put(f.x, 20, f.y, 170 * (1.1 - a * .4), 0, 0, tmpC.setRGB(2, .6, 1.6)) }
  }
  for (const m of S.shots) {
    pools.rocket.put(m.x, 14, m.y, 1, -m.ang);
    pools.flame.put(m.x - Math.cos(m.ang) * 9, 14, m.y - Math.sin(m.ang) * 9, [1, .8 + Math.random() * .5, 1], -m.ang);
  }
  // แกนข้อมูล: หล่นบนพื้น + ลอยเหนือรถที่ขนอยู่
  for (const it of S.items) pools.core.put(it.x, 14 + Math.sin(now * 3 + it.x) * 3, it.y, 1, now, 0, tmpC.set(TIER_COL[it.tier]).multiplyScalar(2));
  for (const e of S.ents) if (e.carry) pools.core.put(e.x, 40 + Math.sin(now * 4) * 3, e.y, .8, now, 0, tmpC.set(TIER_COL[e.carry.tier]).multiplyScalar(2));
  for (const p of Object.values(pools)) p.end();
  lineGeo.setDrawRange(0, n * 2); lineGeo.attributes.position.needsUpdate = true; lineGeo.attributes.color.needsUpdate = true;
}

// ---------- วาดสถานะเกมทุกเฟรม ----------
function syncWorld(now: number) {
  for (const g of groups.values()) g.n = 0;
  for (const e of S.ents) {
    if (e.hp <= 0) continue;
    const g = grpFor(e.type, e.t.bld, e.team);
    const hover = e.t.kind === 'neu' && e.type !== 'obelisk' ? Math.sin(now * 2.5 + e.id) * 2.5 : 0;
    const grow = e.build > 0 ? .25 + .75 * (1 - e.build / e.buildMax) : 1;       // อาคารกำลังสร้าง: ค่อยๆ สูงขึ้น
    const turn = !e.t.bld || e.type === 'turret';
    dummy.position.set(e.x, hover, e.y); dummy.rotation.set(0, turn ? -e.ang : 0, 0); dummy.scale.set(1, grow, 1);
    if (e.type === 'warden') dummy.rotation.y = now * .3;
    put(g);
  }
  for (const g of groups.values()) flush(g);
  // แร่: ขนาดตามปริมาณที่เหลือ
  oreGrp.ore.n = oreGrp.xen.n = 0;
  for (const o of S.ores) if (o.amt > 0) { const g = o.kind === 'xen' ? oreGrp.xen : oreGrp.ore; dummy.position.set(o.x, 0, o.y); dummy.rotation.set(0, o.x, 0); dummy.scale.setScalar(.5 + o.amt / 500); put(g) }
  for (const g of Object.values(oreGrp)) flush(g);
  // ซาก: หรี่ตอนหลับ / สีวงตามผู้ครอบครอง / วงกระเพื่อมตอนกำลังถอดรหัส
  S.ruins.forEach((r, i) => {
    const v = ruinViews[i], sleeping = !awake(r);
    v.glow.color.setScalar(sleeping ? .5 : r.spent ? 1.2 : 2 + Math.sin(now * 3) * .6);
    v.ringMat.color.set(r.spent && r.owner >= 0 ? TEAM_COL[r.owner] : r.R.col);
    const pulse = r.active ? 1 + (now % 1.5) / 1.5 * .6 : 1; v.ring.scale.setScalar(pulse); v.ringMat.opacity = r.active ? .7 * (1 - (now % 1.5) / 1.5) : .3;
  });
  drawFx(now);
}

// ---------- post-processing: bloom ให้ของโบราณเรืองแสง ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .75, .5, TOON ? 1.15 : .9); composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio()); placeCamera();
}
addEventListener('resize', resize);

// ---------- ควบคุมกล้อง: ลากเลื่อน / ล้อเมาส์หรือสองนิ้วซูม / Q E หมุน ----------
const ptrs = new Map<number, { x: number; y: number }>();
const cv = renderer.domElement; cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }) });
cv.addEventListener('pointermove', ev => {
  const prev = ptrs.get(ev.pointerId); if (!prev) return;
  if (ptrs.size === 1) {
    const a = groundAt(prev.x, prev.y), b = groundAt(ev.clientX, ev.clientY);
    if (a && b) { view.x += a.x - b.x; view.z += a.z - b.z }
  } else if (ptrs.size === 2) {
    const [p1, p2] = [...ptrs.values()], d0 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const [q1, q2] = [...ptrs.values()], d1 = Math.hypot(q1.x - q2.x, q1.y - q2.y);
    if (d0 > 0) view.zoom *= d1 / d0;
  }
  ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); clampView();
});
const up = (ev: PointerEvent) => ptrs.delete(ev.pointerId);
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', ev => { ev.preventDefault(); view.zoom *= ev.deltaY < 0 ? 1.12 : 1 / 1.12; clampView() }, { passive: false });
const keys: Record<string, boolean> = {};
addEventListener('keydown', ev => { keys[ev.key.toLowerCase()] = true; if (ev.key === 'q' || ev.key === 'Q') rotate(1); if (ev.key === 'e' || ev.key === 'E') rotate(-1) });
addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false });
const rotate = (d: number) => { view.yawTo += d * Math.PI / 4 };
function keyPan(dt: number) {
  const s = 700 * dt / view.zoom, fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  let f = 0, r = 0;
  if (keys.w || keys.arrowup) f++; if (keys.s || keys.arrowdown) f--; if (keys.d || keys.arrowright) r++; if (keys.a || keys.arrowleft) r--;
  view.x += (fx * f - fz * r) * s; view.z += (fz * f + fx * r) * s; clampView();
}

// ---------- HUD ----------
const $ = (id: string) => document.getElementById(id)!;
function label() {
  (document.querySelector('#hud .t span') as HTMLElement).textContent = TOON ? 'TOON' : 'LOW-POLY';
  $('bArmy').textContent = tr('+100 รถถัง', '+100 tanks');
  $('bShadow').textContent = tr('เงา: ', 'Shadows: ') + (opt.shadows ? 'ON' : 'OFF');
  $('bBloom').textContent = 'Bloom: ' + (opt.bloom ? 'ON' : 'OFF');
  $('back').textContent = tr('← กลับเกมหลัก', '← Back to game');
  $('hint').textContent = tr('ลากเพื่อเลื่อน · ล้อเมาส์/สองนิ้วเพื่อซูม · Q/E หรือ ⟲ ⟳ หมุนกล้อง · โหมดชมอย่างเดียว', 'Drag to pan · wheel/pinch to zoom · Q/E or ⟲ ⟳ to rotate · spectator only');
}
// ปล่อยทัพสองฝ่ายเข้าปะทะกันกลางแผนที่ (ทดสอบจำนวนยูนิตเยอะ)
function army(n: number) {
  const kinds: TypeKey[] = ['tank', 'tank', 'rocket', 'rifle', 'rifle', 'rail'];
  for (let i = 0; i < n; i++) {
    const t = i % 2, k = kinds[i % kinds.length], x = t ? 1950 + Math.random() * 220 : 1030 + Math.random() * 220, y = 1500 + Math.random() * 320;
    const e = spawn(k, t, x, y); e.mx = t ? 1250 : 1750; e.my = y; e.amove = true;
  }
}
$('bArmy').onclick = () => army(100);
$('bShadow').onclick = () => { opt.shadows = !opt.shadows; label() };
$('bBloom').onclick = () => { opt.bloom = !opt.bloom; label() };
$('bRotL').onclick = () => rotate(1); $('bRotR').onclick = () => rotate(-1);

// ---------- เริ่ม ----------
initWorld();
startMatch((store.get('archon.level') as AiLevel) || 'normal');
makeTerrain(); makeRuins(); army(40); resize(); label();

let last = performance.now(), fpsT = 0, frames = 0, fps = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  keyPan(dt); if (!S.over) update(dt);
  placeCamera(); syncWorld(now / 1000);
  renderer.shadowMap.enabled = opt.shadows; sun.castShadow = opt.shadows;
  renderer.info.reset();
  if (opt.bloom) composer.render(); else renderer.render(scene, cam);
  frames++; fpsT += dt;
  if (fpsT >= .5) {
    fps = Math.round(frames / fpsT); frames = 0; fpsT = 0;
    const units = S.ents.filter(e => !e.t.bld && e.hp > 0).length;
    $('stats').innerHTML = 'FPS <b>' + fps + '</b> · ' + tr('ยูนิต ', 'units ') + '<b>' + units + '</b><br>' + tr('สามเหลี่ยม ', 'triangles ') + '<b>' + (renderer.info.render.triangles / 1000).toFixed(0) + 'k</b> · draw calls <b>' + renderer.info.render.calls + '</b>' + (LOW ? ' · LOW' : '');
    $('log').innerHTML = S.msgs.slice(0, 4).map(m => '<div style="color:' + m.col + '">' + m.text + '</div>').join('') + (S.over ? '<div style="color:#f2a93b">' + S.over + '</div>' : '');
  }
});
