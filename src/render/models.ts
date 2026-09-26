// ============================================================
// โมเดล Low-poly สร้างด้วยโค้ด (ไม่มีไฟล์ 3D ภายนอก)
// ทุกโมเดลประกอบจากรูปทรงพื้นฐานเหลี่ยมๆ + สีต่อจุดยอด แล้วรวมเป็น geometry เดียว
//   body = ชิ้นที่รับแสง (flat shading)   glow = ชิ้นเรืองแสง (ไม่รับแสง ใช้กับ bloom)
// หน่วยเท่ากับพิกัดของ sim (1 = 1 พิกเซลของแผนที่เดิม) หันหน้าไปทาง +x, พื้นอยู่ที่ y = 0
// ============================================================
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RuinKind, TypeKey } from '../sim/data';

type V3 = [number, number, number];
interface Opt { p?: V3; r?: V3; s?: V3; glow?: boolean }
export interface Model { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }

// โทนสี: ฝั่งมนุษย์ = เหล็ก สนิม คอนกรีต / ฝั่งโบราณ = ออบซิเดียนดำ
const C = {
  dark: '#1d2126', gun: '#363d46', steel: '#4d5661', light: '#79838f', conc: '#6d7074', concD: '#4d5155',
  rust: '#7a4526', olive: '#5d6647', oliveD: '#454c35', sand: '#9a8255', tread: '#17191c', skin: '#c9a27e',
  obs: '#15171b', obs2: '#23262c', hazard: '#d8a520', glass: '#3c8fa6', hull: '#666e78',
};

// ชุดสีสว่างสำหรับสไตล์ Toon: cel-shading ต้องการสีพื้นสว่าง ตัดกับเส้นขอบดำ
export function useToonPalette() {
  Object.assign(C, {
    dark: '#3d424a', gun: '#6f7884', steel: '#929ca8', light: '#bcc4cc', conc: '#aba59b', concD: '#8c877d', rust: '#b5622e',
    olive: '#84924f', oliveD: '#66713f', sand: '#d8ae5f', tread: '#2e3034', skin: '#e0b48c', obs: '#2c2f38', obs2: '#434752', hazard: '#f5bd26', glass: '#62c9e3', hull: '#7d8792',
  });
}

class Builder {
  body: THREE.BufferGeometry[] = []; glow: THREE.BufferGeometry[] = [];
  add(src: THREE.BufferGeometry, col: string, o: Opt = {}) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const e = new THREE.Euler(...(o.r ?? [0, 0, 0]));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(...(o.s ?? [1, 1, 1]))));
    const c = new THREE.Color(col), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (o.glow ? this.glow : this.body).push(g); src.dispose(); return this;
  }
  build(): Model {
    const m = (gs: THREE.BufferGeometry[]) => {
      if (!gs.length) { const e = new THREE.BufferGeometry(); e.setAttribute('position', new THREE.Float32BufferAttribute([], 3)); e.setAttribute('color', new THREE.Float32BufferAttribute([], 3)); return e }
      const g = mergeGeometries(gs, false)!; g.computeVertexNormals(); return g;
    };
    return { body: m(this.body), glow: this.glow.length ? m(this.glow) : null };
  }
}
// รูปทรงพื้นฐาน (จำนวนด้านน้อย = ดูเหลี่ยมแบบ low-poly)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const oct = (r: number) => new THREE.OctahedronGeometry(r, 0);
const ico = (r: number) => new THREE.IcosahedronGeometry(r, 0);
const dode = (r: number) => new THREE.DodecahedronGeometry(r, 0);
const torus = (r: number, t: number, rs = 4, ts = 12) => new THREE.TorusGeometry(r, t, rs, ts);
const H = Math.PI / 2;

// ทรงลาด (loft): รูปตัดมุมบน (x,z) ที่ความสูง y0 ต่อกับอีกรูปตัดที่ y1 → ตัวถังเกราะลาด / ป้อมปืนหัวแหลม
// พิกัดเป็นค่าจริงในโมเดล (ไม่ต้องใส่ p) รูปตัดทั้งสองต้องนูน
type P2 = [number, number];
const loft = (bot: P2[], y0: number, top: P2[], y1: number) =>
  new ConvexGeometry([...bot.map(([x, z]) => new THREE.Vector3(x, y0, z)), ...top.map(([x, z]) => new THREE.Vector3(x, y1, z))]);
const rect = (x0: number, x1: number, hz: number): P2[] => [[x0, -hz], [x1, -hz], [x1, hz], [x0, hz]];
// ปริซึมด้านข้าง: รูปตัด (x,y) รีดหนา d ตามแกน z (กึ่งกลาง z = 0) — ใช้ทำสายพาน
const side = (pts: P2[], d: number) =>
  new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
// ทิศของแท่งที่ชี้ไปตามมุมเงย e (ใช้กับ cyl/cone ซึ่งเดิมชี้แกน +y)
const aim = (e: number): V3 => [0, 0, e - H];
const shade = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
// ผสมสีฝ่ายลงในสีเหล็ก: ใช้กับป้อม/ห้องคนขับ ให้แยกฝ่ายออกจากระยะไกล
const tint = (team: string, k = .4) => '#' + new THREE.Color(C.hull).lerp(new THREE.Color(team), k).getHexString();

// ---------- ชิ้นส่วนร่วมของรถ: ช่วงล่าง (สายพานหรือล้อ) + ตัวถังเกราะลาด + บังโคลน + ไฟ ----------
interface ChassisOpt { len?: number; wheels?: number[]; hull?: string }
function chassis(b: Builder, r: number, team: string, o: ChassisOpt = {}) {
  const L = 2 * r * (o.len ?? 1), h = L / 2, W = r * 1.3, tw = r * .4, tz = W / 2 - tw / 2, hull = o.hull ?? C.hull;
  let top: number;
  if (o.wheels) {
    const wr = 4.2;
    for (const s of [-1, 1]) for (const f of o.wheels) {
      const x = f * h;
      b.add(cyl(wr, wr, tw, 10), C.tread, { p: [x, wr, s * tz], r: [H, 0, 0] });
      b.add(cyl(wr * .5, wr * .5, tw + .4, 6), C.light, { p: [x, wr, s * tz], r: [H, 0, 0] });
      b.add(box(wr * 2.5, .9, tw + 1.4), hull, { p: [x, wr * 2 + .5, s * tz] });                // บังโคลน
    }
    b.add(box(L - 2, 3.5, W - tw * 2 + 1), C.dark, { p: [0, wr + .4, 0] });                        // โครงล่าง
    top = wr * 2 + 1;
    b.add(box(L, 1.6, W), hull, { p: [0, top - .8, 0] });
    for (const s of [-1, 1]) b.add(box(L * .55, 1, .5), team, { p: [-h * .2, top - .8, s * (W / 2 + .2)] });
  } else {
    for (const s of [-1, 1]) {
      // สายพาน: รูปตัดด้านข้างหัวท้ายลาด + ล้อกดสายพาน + เฟืองขับหน้า
      b.add(side([[-h + 1, 1], [h - 1.5, 1], [h + 1.8, 4.3], [h, 7.4], [-h, 7.4], [-h - 1.8, 4.3]], tw), C.tread, { p: [0, 0, s * tz] });
      const n = Math.max(4, Math.round(L / 6.5)), step = (L - 6) / (n - 1);
      for (let i = 0; i < n; i++) b.add(cyl(2.5, 2.5, .8, 8), C.dark, { p: [-h + 3 + i * step, 3.7, s * (tz + tw / 2 + .2)], r: [H, 0, 0] });
      for (let i = 0; i < n; i++) b.add(cyl(1, 1, 1.2, 6), C.light, { p: [-h + 3 + i * step, 3.7, s * (tz + tw / 2 + .3)], r: [H, 0, 0] });
      b.add(cyl(2.6, 2.6, tw + .6, 8), C.gun, { p: [h - .2, 4.4, s * tz], r: [H, 0, 0] });
      b.add(box(L + 1.5, .9, tw + 1.2), hull, { p: [0, 7.9, s * tz] });                          // บังโคลน
      b.add(box(L * .62, 2.4, .5), hull, { p: [-.5, 6.3, s * (tz + tw / 2 + .5)] });             // เกราะข้าง
      b.add(box(L * .5, .9, .6), team, { p: [-1, 6.6, s * (tz + tw / 2 + .6)] });                // แถบสีฝ่ายข้างตัวรถ
    }
    b.add(box(L - 3, 5, W - tw * 2 + .4), C.dark, { p: [0, 5, 0] });
    // ตัวถังบน: ด้านหน้าลาดเอียง (glacis) ท้ายตัดตรง
    b.add(loft(rect(-h - .5, h + .5, W / 2 + .3), 7.6, rect(-h + .5, h * .3, W * .4), 11.2), hull);
    top = 11.2;
    for (let i = 0; i < 4; i++) b.add(box(.9, .3, W * .5), C.dark, { p: [-h + 2 + i * 1.7, top + .1, 0] });   // ตะแกรงห้องเครื่อง
    for (const s of [-1, 1]) b.add(cyl(.8, .8, 3, 6), C.dark, { p: [-h - .8, 9.6, s * W * .28], r: [0, 0, H] }); // ท่อไอเสีย
  }
  for (const s of [-1, 1]) {
    b.add(box(.8, 1.2, 1.8), '#c9a870', { p: [h + .9, top - 2.6, s * W * .36], glow: true });        // ไฟหน้า
    b.add(box(.5, .8, 1.4), '#a8281c', { p: [-h - .6, top - 2.6, s * W * .4], glow: true });        // ไฟท้าย
  }
  return { L, h, W, top };
}

// ---------- ยูนิต ----------
function unit(type: TypeKey, team: string): Model {
  const b = new Builder(), tt = tint(team);
  switch (type) {
    case 'rifle': {
      // ทหารราบ: ออกแบบที่สเกล 1 แล้วขยาย k เท่าให้ดูออกจากมุมกล้อง / ยืนถือปืนเฉียงหน้าตัว
      const k = 1.4, a = (g: THREE.BufferGeometry, col: string, x: number, y: number, z: number, r?: V3) => b.add(g.scale(k, k, k), col, { p: [x * k, y * k, z * k], r });
      for (const s of [-1, 1]) {
        a(box(2.4, 1.2, 1.5), C.dark, .3, .6, s * 1.1);                                          // รองเท้าบูท
        a(box(1.6, 4, 1.4), C.oliveD, 0, 3.2, s * 1.1);                                          // ขา
        a(box(2, 1.1, 1.5), team, 0, 10.2, s * 2.3);                                             // บ่าสีฝ่าย
        a(box(1.2, 3, 1.2), C.olive, .1, 8.4, s * 2.4);                                          // ต้นแขน
      }
      a(box(2.2, 1.2, 3.8), C.dark, 0, 5.7, 0);                                                  // เข็มขัด
      a(box(2.4, 4.2, 3.8), C.olive, 0, 8.3, 0);                                                 // ลำตัว
      a(box(2.9, 3, 4.1), C.oliveD, .15, 8.4, 0);                                                // เสื้อเกราะ
      a(box(2.4, 1, 1), C.olive, 1.1, 7.5, 1.9, [0, .5, 0]);                                     // แขนขวาจับด้าม
      a(box(4.8, 1, 1), C.olive, 2.2, 8.1, -.8, [0, -.7, 0]);                                    // แขนซ้ายประคองปืน
      a(box(2.2, 1.6, .8), '#3b2a1c', -.1, 7.9, .8);                                             // ปืน: พานท้าย
      a(box(4, 1.3, .9), C.dark, 2.8, 8.1, .8);                                                  //       ตัวปืน
      a(box(.9, 1.8, .7), C.dark, 2.8, 6.9, .8, [0, 0, .25]);                                    //       แม็กกาซีน
      a(cyl(.3, .3, 4.5, 5), C.dark, 7, 8.2, .8, [0, 0, H]);                                     //       ลำกล้อง
      a(dode(1.5), C.skin, .2, 11.3, 0);                                                         // หัว
      a(new THREE.SphereGeometry(1.9, 7, 3, 0, Math.PI * 2, 0, H), C.olive, 0, 11.6, 0);         // หมวกเหล็ก
      a(cyl(2.2, 2.2, .3, 8), C.oliveD, 0, 11.6, 0);                                             // ปีกหมวก
      a(box(.4, .5, 2), '#2a2e33', 1.6, 11.2, 0);                                                // แว่นกันลม
      a(box(1.8, 3.4, 3.2), '#3a3f30', -2.1, 8.6, 0);                                            // เป้
      a(cyl(.8, .8, 3.4, 6), C.sand, -2.2, 10.7, 0, [H, 0, 0]);                                  // ถุงนอน
      a(cyl(.08, .14, 5, 3), C.dark, -2.6, 12.6, -1.1);                                          // เสาวิทยุ
      break;
    }
    case 'tank': {
      const c = chassis(b, 13, team), t = c.top;
      // ป้อมปืนหกเหลี่ยมหัวแหลม ขอบลาด
      const tb: P2[] = [[-7.5, -6], [3.5, -6.6], [8, -3.2], [8, 3.2], [3.5, 6.6], [-7.5, 6]];
      b.add(loft(tb, t, tb.map(([x, z]) => [x * .8 - .8, z * .75] as P2), t + 5.4), tt);
      for (const s of [-1, 1]) b.add(box(7, 2.2, .5), team, { p: [-1.5, t + 2.6, s * 6], r: [s * .3, 0, 0] });  // แผ่นสีฝ่ายข้างป้อม
      b.add(box(3.5, 3.4, 10), C.dark, { p: [-9, t + 2.6, 0] });                                 // ตะกร้าท้ายป้อม
      b.add(box(3, 1.8, 4), C.oliveD, { p: [-9, t + 5, 2.5] });
      b.add(box(3, 4.2, 5.4), C.dark, { p: [8.4, t + 2.6, 0] });                                 // เกราะรับลำกล้อง
      b.add(cyl(1, 1.2, 16, 8), C.gun, { p: [17.5, t + 2.7, 0], r: [0, 0, H] });                 // ลำกล้อง
      b.add(cyl(1.7, 1.7, 3.2, 8), C.gun, { p: [16, t + 2.7, 0], r: [0, 0, H] });                // ที่ดูดควัน
      b.add(box(2.4, 2.4, 2.8), C.dark, { p: [25.5, t + 2.7, 0] });                              // เบรกปากลำกล้อง
      b.add(cyl(2.2, 2.4, 1.8, 8), C.steel, { p: [-2.5, t + 6.2, -2.4] });                       // ป้อมผู้บังคับการ
      b.add(cyl(2, 2, .5, 8), C.gun, { p: [-3.8, t + 7.6, -2.4], r: [0, 0, .7] });               // ฝาเปิด
      b.add(box(4.5, .6, .6), C.dark, { p: [.2, t + 7, -2.4] });                                 // ปืนกลบนป้อม
      b.add(box(4, .3, 3.6), team, { p: [-3, t + 5.5, 2.4] });                                   // สีฝ่ายบนหลังคา
      b.add(cyl(.15, .25, 13, 4), C.dark, { p: [-6.5, t + 11, 4], r: [0, 0, .18] });             // เสาอากาศ
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.add(cyl(.55, .55, 2, 6), C.dark, { p: [5, t + 3.8 + i * .9, s * (4.4 + i * .3)], r: [0, 0, -1] }); // เครื่องยิงควัน
      break;
    }
    case 'rocket': {
      const c = chassis(b, 13, team), t = c.top, e = .3;
      b.add(loft(rect(3, 11, 5.5), t, rect(3.5, 8, 4.6), t + 4), tt);                         // ห้องคนขับ
      b.add(box(.4, 1.4, 7), '#8fd3e6', { p: [9.6, t + 2.2, 0], r: [0, 0, -.55] });              // กระจกหน้า
      b.add(box(6, 4, 7), C.dark, { p: [-4, t + 2, 0] });                                        // ฐานหมุนแท่นยิง
      // แท่นจรวด 3x2 ท่อ เงยขึ้น e เรเดียน — ตำแหน่งท่อหมุนตามมุมเงยด้วยมือ
      const px = -4, py = t + 8, cs = Math.cos(e), sn = Math.sin(e), at = (lx: number, ly: number): [number, number] => [px + lx * cs - ly * sn, py + lx * sn + ly * cs];
      b.add(box(15, 7.5, 12.5), C.light, { p: [px, py, 0], r: [0, 0, e] });
      b.add(box(4, 7.7, 12.7), team, { p: [...at(-3.5, 0), 0], r: [0, 0, e] });                 // แถบสีฝ่ายรอบแท่น
      b.add(box(1, 7.7, 12.7), C.hazard, { p: [...at(-7.4, 0), 0], r: [0, 0, e] });
      for (const ly of [-1.8, 1.8]) for (const z of [-4, 0, 4]) {
        const [x1, y1] = at(7.6, ly), [x2, y2] = at(8.6, ly);
        b.add(cyl(1.6, 1.6, 1, 8), C.tread, { p: [x1, y1, z], r: aim(e) });
        b.add(cone(1.3, 3.2, 6), '#c8442c', { p: [x2 + cs, y2 + sn, z], r: aim(e), glow: true });   // หัวรบเรืองแสง
      }
      break;
    }
    case 'harv': {
      const c = chassis(b, 14, team, { len: 1.05, wheels: [-.72, -.2, .68] }), t = c.top, h = c.h;
      // ห้องคนขับด้านหน้า
      b.add(loft(rect(h * .35, h + .5, 6.2), t, rect(h * .38, h - 1.8, 5.2), t + 8), tt);
      b.add(box(.5, 3, 9), '#ffcf6a', { p: [h - .3, t + 5, 0], r: [0, 0, -.28], glow: true });     // กระจกหน้าเรืองแสง
      b.add(box(6, .5, 10.8), team, { p: [h * .72, t + 8.1, 0] });                               // หลังคาสีฝ่าย
      b.add(oct(1), '#ffae2a', { p: [h * .6, t + 9.2, 0], s: [1, 1.4, 1], glow: true });           // ไฟหมุนเตือน
      // ถังแร่ทรงคางหมู + ก้อนแร่พูนล้น
      b.add(loft(rect(-h - .5, h * .25, 6.4), t, rect(-h - 1.5, h * .3, 7.4), t + 9), C.dark);
      for (let i = 0; i < 5; i++) b.add(box(2.2, 3.2, .4), i % 2 ? C.dark : C.hazard, { p: [-h + 2 + i * 2.2, t + 5.5, 7.2], r: [.12, 0, .6] });
      for (let i = 0; i < 5; i++) b.add(box(2.2, 3.2, .4), i % 2 ? C.dark : C.hazard, { p: [-h + 2 + i * 2.2, t + 5.5, -7.2], r: [-.12, 0, .6] });
      for (let i = 0; i < 6; i++) b.add(dode(2.6 + (i % 3) * .5), i % 2 ? C.sand : shade(C.sand, .8), { p: [-h + 3 + (i % 3) * 5, t + 8.6 + (i % 2), i < 3 ? -2.5 : 2.5], r: [i, i * 2, 0], s: [1, .7, 1] });
      // ใบตักหน้าพร้อมซี่
      b.add(loft(rect(h + .5, h + 4, 7.4), 1, rect(h + .5, h + 2, 7.4), 6), C.gun);
      for (let z = -6; z <= 6; z += 3) b.add(cone(.9, 2.5, 4), C.light, { p: [h + 5, 1.6, z], r: [0, 0, -H] });
      for (const s of [-1, 1]) b.add(cyl(.9, .9, 7, 6), C.dark, { p: [h * .4, t + 8, s * 5.6] });  // ท่อไอเสีย
      break;
    }
    case 'rig': {
      const c = chassis(b, 12, team, { wheels: [-.66, .66] }), t = c.top, h = c.h;
      b.add(loft(rect(h * .35, h + .4, 5.8), t, rect(h * .38, h - 1.5, 5), t + 6.5), tt);       // ห้องคนขับ
      b.add(box(.5, 2.4, 8), '#7ffcff', { p: [h - .2, t + 4, 0], r: [0, 0, -.3], glow: true });
      b.add(box(12, 6, 11), C.dark, { p: [-4, t + 3, 0] });                                      // ตู้อุปกรณ์ถอดรหัส
      b.add(box(12.2, 1.4, 11.2), team, { p: [-4, t + 5.4, 0] });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.add(box(2.4, .5, .3), '#27f2d0', { p: [-8 + i * 3.6, t + 2.6, s * 5.6], glow: true }); // ไฟสถานะ
      b.add(cyl(1, 1.3, 9, 6), C.light, { p: [-3, t + 10, 0] });                                 // เสา
      b.add(cyl(2, 2, 2, 8), C.gun, { p: [-3, t + 14.5, 0] });
      b.add(cyl(8.5, 2, 2.5, 12), C.steel, { p: [-2, t + 17, 0], r: [0, 0, -.8] });              // จานรับสัญญาณ
      b.add(cyl(.3, .3, 7, 4), C.dark, { p: [.5, t + 19.5, 0], r: [0, 0, -.8] });                // ก้านตัวรับ
      b.add(torus(7.4, .5, 4, 16).rotateX(H), '#27f2d0', { p: [-1.6, t + 17.6, 0], r: [0, 0, -.8], glow: true });
      b.add(oct(1.6), '#27f2d0', { p: [3, t + 21.8, 0], glow: true });
      break;
    }
    case 'rail': {
      const c = chassis(b, 14, team, { len: 1.05 }), t = c.top;
      const tb: P2[] = [[-9, -6.5], [5, -6.5], [8, -4], [8, 4], [5, 6.5], [-9, 6.5]];
      b.add(loft(tb, t, tb.map(([x, z]) => [x * .85, z * .8] as P2), t + 4), tt);             // ป้อมเตี้ยแบน
      for (const s of [-1, 1]) {
        b.add(box(10, 3.4, 2.2), C.dark, { p: [-2, t + 2, s * 7] });                              // ธนาคารตัวเก็บประจุ
        b.add(box(9, .5, 2.3), '#3aa9b8', { p: [-2, t + 2.8, s * 7], glow: true });
        b.add(box(6, .5, .4), team, { p: [-2, t + 1, s * 8.1] });
        b.add(box(28, 1.5, 1.4), C.gun, { p: [16, t + 3.2, s * 2.3] });                           // ราง
      }
      b.add(box(20, 1.2, 5.6), C.dark, { p: [12, t + 1.8, 0] });                                  // โครงใต้ราง
      for (let x = 6; x <= 28; x += 5.5) b.add(torus(3.1, .4, 4, 8), '#3aa9b8', { p: [x, t + 3.2, 0], r: [0, H, 0], glow: true });
      b.add(box(1.6, 3.4, 6.4), C.dark, { p: [30.5, t + 3.2, 0] });                               // ปลายราง
      b.add(box(6, .4, 6), team, { p: [-3, t + 4.2, 0] });
      b.add(ico(2.4), '#6fd8e6', { p: [-6, t + 6.8, 0], glow: true });                            // แกนพลังงาน
      b.add(torus(3.8, .4, 4, 10), C.light, { p: [-6, t + 6.8, 0], r: [0, H, 0] });
      b.add(torus(3.8, .4, 4, 10), C.light, { p: [-6, t + 6.8, 0] });
      break;
    }
    case 'ion': {
      const c = chassis(b, 13, team), t = c.top, e = .5;
      b.add(cyl(6, 7.2, 3, 8), tt, { p: [-2, t + 1.5, 0] });                                  // ฐานหมุน
      b.add(box(5, 5, 9), C.dark, { p: [-2, t + 5, 0] });                                          // แท่นรับลำกล้อง
      for (const s of [-1, 1]) b.add(box(4, 5.4, .5), team, { p: [-2, t + 5, s * 4.7] });
      // ลำกล้องไอออนเงยขึ้น พร้อมขดลวดเรืองแสงเรียงตามลำกล้อง
      const bx = -2, by = t + 6, cs = Math.cos(e), sn = Math.sin(e), along = (d: number): V3 => [bx + d * cs, by + d * sn, 0];
      b.add(cyl(2.4, 3.4, 22, 8), C.dark, { p: along(11), r: aim(e) });
      for (const d of [5, 9, 13, 17]) b.add(torus(3.4, .5, 4, 10).rotateY(H), '#c8601c', { p: along(d), r: [0, 0, e], glow: true });
      b.add(ico(2.2), '#e0903a', { p: along(22.5), glow: true });                                 // ปากลำกล้องเรืองแสง
      for (let i = 0; i < 4; i++) b.add(box(.6, 4, 8), C.gun, { p: [-10 + i * 1.6, t + 2, 0] });  // ครีบระบายความร้อน
      b.add(cyl(2, 2, 4, 8), '#c8601c', { p: [-7, t + 2.5, 5.5], glow: true });                  // เครื่องปฏิกรณ์
      b.add(cyl(2.3, 2.3, .8, 8), C.dark, { p: [-7, t + 4.8, 5.5] });
      break;
    }
    // ---------- ผู้พิทักษ์โบราณ: ออบซิเดียนดำ + รอยวงจรเรืองแสง ----------
    case 'sentinel':
      b.add(oct(10), C.obs, { p: [0, 16, 0], s: [1.1, .65, 1] });
      b.add(loft([[-7, -5], [6, -3], [6, 3], [-7, 5]], 19.5, [[-5, -3], [3, -1.5], [3, 1.5], [-5, 3]], 23), C.obs2);   // เกราะหลัง
      b.add(box(1.2, 2, 9), '#7ffcff', { p: [8, 16.4, 0], r: [0, 0, -.3], glow: true });            // ช่องมองเรืองแสง
      b.add(oct(1.6), '#7ffcff', { p: [9.2, 16.4, 0], glow: true });
      for (const s of [-1, 1]) {
        b.add(loft([[-6, 0], [4, 0], [-2, s * 12]], 15, [[-5, 0], [3, 0], [-2.5, s * 11]], 16.4), C.obs2);   // ปีกใบมีด
        b.add(box(8, .5, .5), '#27f2d0', { p: [-.5, 15.8, s * 7], r: [0, s * 1.1, 0], glow: true });
        b.add(oct(1.5), C.obs2, { p: [-3, 22, s * 11], s: [1, 2, 1], r: [s * .4, 0, 0] });           // เศษหินลอย
      }
      b.add(cone(2, 7, 4), '#27f2d0', { p: [0, 7.5, 0], r: [Math.PI, 0, 0], glow: true });          // เครื่องยนต์ลอยตัว
      b.add(torus(3.2, .4, 3, 8), '#27f2d0', { p: [0, 10.4, 0], r: [H, 0, 0], glow: true });
      break;
    case 'obelisk': {
      b.add(cyl(15, 17, 3, 4), C.obs2, { p: [0, 1.5, 0], r: [0, Math.PI / 4, 0] });               // ฐานสามชั้น
      b.add(cyl(11.5, 13, 3, 4), C.obs, { p: [0, 4.5, 0], r: [0, Math.PI / 4, 0] });
      b.add(torus(13.4, .5, 3, 4), '#ffcf5a', { p: [0, 3.1, 0], r: [H, 0, Math.PI / 4], glow: true });
      b.add(cyl(2, 8, 46, 4), C.obs, { p: [0, 29, 0], r: [0, Math.PI / 4, 0] });                  // เสาเรียวสี่เหลี่ยม
      // อักขระเรืองแสงบนทั้งสี่หน้าเสา (หน้าเสาหันตามแกน x/z)
      for (let f = 0; f < 4; f++) for (let y = 11; y < 48; y += 6.5) {
        const d = (8 - (y - 6) / 46 * 6) * .707 + .15, a = f * H, h = y % 13 < 6.5 ? 3.4 : 2;
        b.add(box(.5, h, 1), '#ffcf5a', { p: [Math.cos(a) * d, y, Math.sin(a) * d], r: [0, -a, .09], glow: true });
      }
      b.add(oct(3), '#ffcf5a', { p: [0, 58, 0], s: [1, 1.8, 1], glow: true });                     // หินยอดลอย
      for (let i = 0; i < 4; i++) { const a = i * H + .4; b.add(oct(1.4), C.obs2, { p: [Math.cos(a) * 7, 55, Math.sin(a) * 7], s: [1, 2.2, 1] }) }
      break;
    }
    case 'warden':
      b.add(ico(16), C.obs, { p: [0, 30, 0] });
      b.add(dode(12), C.obs2, { p: [0, 36, 0], s: [1, .6, 1] });                                   // โดมเกราะบน
      b.add(torus(23, 1.3, 4, 24), '#ff4fd8', { p: [0, 30, 0], r: [H, 0, 0], glow: true });         // วงแหวนพลังงาน
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        b.add(cone(3.6, 17, 4), '#2a0f26', { p: [Math.cos(a) * 21, 30, Math.sin(a) * 21], r: [0, -a, -H] });
        b.add(cone(1.2, 5, 4), '#ff4fd8', { p: [Math.cos(a) * 31, 30, Math.sin(a) * 31], r: [0, -a, -H], glow: true });
        b.add(box(6, 9, 1.2), C.obs2, { p: [Math.cos(a + .39) * 15, 24, Math.sin(a + .39) * 15], r: [0, -a - .39 + H, .3] });  // แผ่นเกราะล่าง
      }
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; b.add(cone(2.2, 14, 4), C.obs, { p: [Math.cos(a) * 5, 50, Math.sin(a) * 5], r: [Math.sin(a) * .4, 0, -Math.cos(a) * .4] }) }  // มงกุฎ
      b.add(ico(7), '#ff4fd8', { p: [15, 31, 0], s: [.3, 1, 1], glow: true });                      // ดวงตาด้านหน้า
      b.add(cone(5, 12, 6), '#ff4fd8', { p: [0, 12, 0], r: [Math.PI, 0, 0], glow: true });          // แกนพลังด้านล่าง
      break;
  }
  return b.build();
}

// ---------- สิ่งก่อสร้าง ----------
function building(type: TypeKey, team: string): Model {
  const b = new Builder();
  const slab = (w: number, d: number) => b.add(box(w, 3, d), C.concD, { p: [0, 1.5, 0] });
  switch (type) {
    case 'hq':
      slab(90, 84);
      b.add(box(72, 24, 62), C.concD, { p: [0, 15, 0] });
      b.add(box(76, 3, 66), C.gun, { p: [0, 28.5, 0] });
      b.add(box(76.4, 2, 66.4), team, { p: [0, 24, 0] });
      b.add(cyl(13, 13, .8, 10), C.light, { p: [-12, 30.4, 0] });                            // ลานจอด ฮ.
      b.add(cyl(10.5, 10.5, 1, 10), C.gun, { p: [-12, 30.6, 0] });
      b.add(box(22, 14, 3), C.hazard, { p: [37.5, 8, 0] });                                   // ประตูโรงรถ
      b.add(cyl(1, 1, 16, 6), C.light, { p: [22, 38, 18] });
      b.add(cyl(9, 2, 3, 10), C.light, { p: [22, 46, 18], r: [0, 0, .6] });                  // จานเรดาร์
      b.add(cyl(.8, .8, 26, 5), C.light, { p: [28, 43, -22] });
      b.add(oct(2), team, { p: [28, 57, -22], glow: true });
      break;
    case 'ref':
      slab(64, 60);
      b.add(box(30, 18, 40), C.concD, { p: [-12, 10.5, 0] });
      b.add(box(32, 2.5, 42), C.gun, { p: [-12, 20.7, 0] });
      b.add(box(30.4, 2, 40.4), team, { p: [-12, 17, 0] });
      for (const z of [-11, 11]) { b.add(cyl(10, 10, 30, 10), C.steel, { p: [14, 18, z] }); b.add(cyl(10.5, 10.5, 2, 10), C.hazard, { p: [14, 6, z] }) }
      b.add(cyl(2, 2, 26, 6), C.rust, { p: [3, 26, 0], r: [H, 0, 0] });
      break;
    case 'barracks': {
      slab(56, 46);
      const q = new THREE.CylinderGeometry(20, 20, 50, 10, 1, false, 0, Math.PI);             // หลังคาโค้งแบบ quonset
      b.add(q, C.olive, { p: [0, 3, 0], r: [0, 0, H] });
      b.add(box(1, 12, 10), C.dark, { p: [25.5, 9, 0] });
      b.add(box(50.5, 1.4, 41), team, { p: [0, 4, 0] });
      b.add(cyl(.7, .7, 22, 5), C.light, { p: [-18, 25, 16] });
      b.add(box(8, 5, .6), team, { p: [-14, 33, 16] });
      break;
    }
    case 'factory':
      slab(74, 68);
      b.add(box(66, 20, 56), C.concD, { p: [0, 13, 0] });
      for (let i = 0; i < 4; i++) b.add(cone(15, 12, 3), C.gun, { p: [-24 + i * 16, 29, 0], r: [H, 0, 0], s: [1, 1, 3.6] }); // หลังคาฟันเลื่อย
      b.add(box(66.4, 2, 56.4), team, { p: [0, 22.5, 0] });
      b.add(box(1.2, 16, 34), C.steel, { p: [33.4, 11, 0] });                                 // ประตูม้วน
      for (let z = -16; z <= 16; z += 4) b.add(box(1.4, 2.5, 2), (z / 4) % 2 === 0 ? C.hazard : C.dark, { p: [33.8, 3.6, z] });
      b.add(cyl(3.5, 4, 26, 8), C.rust, { p: [-24, 30, -20] });
      break;
    case 'lab':
      slab(60, 54);
      b.add(box(50, 14, 44), '#2a2f36', { p: [0, 10, 0] });
      b.add(box(50.4, 2, 44.4), team, { p: [0, 16, 0] });
      b.add(new THREE.SphereGeometry(18, 8, 4, 0, Math.PI * 2, 0, H), C.glass, { p: [0, 17, 0] });  // โดมกระจก
      b.add(oct(5), '#27f2d0', { p: [0, 27, 0], s: [1, 1.6, 1], glow: true });
      b.add(cyl(.7, .7, 18, 5), C.light, { p: [-20, 26, -16] });
      b.add(oct(1.6), '#27f2d0', { p: [-20, 35.5, -16], glow: true });
      break;
    case 'turret':
      b.add(cyl(17, 19, 6, 6), C.conc, { p: [0, 3, 0] });
      b.add(cyl(9, 10, 5, 6), C.steel, { p: [0, 8.5, 0] });
      b.add(box(8, 4, 8), C.gun, { p: [1, 12, 0] });
      b.add(box(22, 2.4, 2.4), C.dark, { p: [14, 12, 0] });
      b.add(box(4, 1, 8.2), team, { p: [-1, 14.4, 0] });
      break;
    case 'pylon':
      b.add(cyl(15, 17, 6, 6), C.gun, { p: [0, 3, 0] });
      b.add(box(20, 1.4, 20), team, { p: [0, 6.4, 0], r: [0, Math.PI / 4, 0] });
      b.add(cyl(3, 6, 28, 4), C.obs, { p: [0, 20, 0], r: [0, Math.PI / 4, 0] });
      b.add(oct(6), '#8ffbff', { p: [0, 40, 0], s: [1, 1.5, 1], glow: true });
      break;
    case 'dome':
      b.add(cyl(20, 21, 4, 10), C.gun, { p: [0, 2, 0] });
      b.add(box(40, 1.2, 4), team, { p: [0, 4.4, 0] });
      b.add(new THREE.SphereGeometry(17, 10, 5, 0, Math.PI * 2, 0, H), '#1e6f8a', { p: [0, 4, 0], glow: true });
      break;
    case 'vault':
      slab(58, 52);
      b.add(box(50, 20, 44), '#2b3037', { p: [0, 13, 0] });
      b.add(box(52, 3, 46), C.gun, { p: [0, 24.5, 0] });
      b.add(box(50.4, 2, 44.4), team, { p: [0, 21, 0] });
      b.add(cyl(9, 9, 2, 10), C.steel, { p: [25.5, 12, 0], r: [0, 0, H] });                  // ประตูนิรภัย
      b.add(cyl(5.5, 5.5, 2.4, 8), C.gun, { p: [26, 12, 0], r: [0, 0, H] });
      b.add(oct(1.8), '#ffb347', { p: [27.5, 12, 0], glow: true });
      for (const z of [-18, 18]) b.add(box(1, 2, 2), '#ffb347', { p: [25.4, 20, z], glow: true });
      break;
  }
  return b.build();
}

const cache = new Map<string, Model>();
export function modelFor(type: TypeKey, bld: boolean, team: string) {
  const key = type + team; let m = cache.get(key);
  if (!m) cache.set(key, m = bld ? building(type, team) : unit(type, team));
  return m;
}

// ---------- ซากโบราณ: แท่นออบซิเดียน + เสาหินแหลม + คริสตัลแกนกลาง ----------
export function ruinModel(kind: RuinKind, col: string): Model {
  const b = new Builder(), s = kind === 'citadel' ? 70 : kind === 'monolith' ? 52 : 40, sides = kind === 'monolith' ? 4 : 6;
  const rot: V3 = [0, sides === 4 ? Math.PI / 4 : 0, 0];
  b.add(cyl(s, s * 1.08, 6, sides), C.obs, { p: [0, 3, 0], r: rot });
  b.add(cyl(s * .72, s * .78, 4, sides), C.obs2, { p: [0, 8, 0], r: rot });
  b.add(cyl(s * .42, s * .46, 4, sides), C.obs, { p: [0, 12, 0], r: rot });
  b.add(torus(s * .88, .9, 3, sides * 4), col, { p: [0, 6.3, 0], r: [H, 0, 0], glow: true });   // วงจรเรืองแสงบนแท่น
  const n = kind === 'citadel' ? 6 : kind === 'monolith' ? 4 : 3, h = kind === 'citadel' ? 60 : kind === 'monolith' ? 46 : 32;
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n + .5, x = Math.cos(a) * s * .86, z = Math.sin(a) * s * .86;
    b.add(cyl(1.2, 5, h, 4), C.obs, { p: [x, 6 + h / 2, z], r: [0, a, 0] });
    b.add(oct(2.4), col, { p: [x, 8 + h, z], s: [1, 1.8, 1], glow: true });
  }
  b.add(oct(s * .2), col, { p: [0, 14 + s * .35, 0], s: [1, 1.7, 1], glow: true });
  return b.build();
}

// ---------- ของประกอบฉาก ----------
export const oreModel = (xen: boolean): Model => {
  const b = new Builder();
  if (xen) { b.add(dode(4), '#3a3440', { p: [1, 2, 1], s: [1.3, .5, 1.3] }); b.add(oct(5), '#8d4dff', { p: [0, 6, 0], s: [.8, 1.8, .8], glow: true }); b.add(oct(3.2), '#6a2fd6', { p: [4, 4, 2], s: [.8, 1.6, .8], r: [0, 0, .5], glow: true }) }
  else { b.add(dode(5), '#b0842e', { p: [0, 3.5, 0], s: [1, .7, 1] }); b.add(dode(3), '#c99a3a', { p: [4, 2.5, 2] }) }
  return b.build();
};
// เศษซาก: ก้อนหิน / ซากรถไหม้ / ถังน้ำมันสนิม / ต้นไม้ตาย (สุ่มตาม index)
export function debris(i: number, x: number, z: number, k: number, b: Builder = new Builder()) {
  const t = i % 4, a = i * 2.39;
  if (t === 0) b.add(dode(6 * k), i % 3 ? '#5a554c' : '#4a4640', { p: [x, 3 * k, z], r: [a, a * .7, 0], s: [1.2, .7, 1] });
  else if (t === 1) { b.add(box(22 * k, 6 * k, 11 * k), '#5a3a24', { p: [x, 3 * k, z], r: [0, a, 0] }); b.add(box(10 * k, 4 * k, 9 * k), '#2c2420', { p: [x, 8 * k, z], r: [0, a, 0] }) }
  else if (t === 2) b.add(cyl(3 * k, 3 * k, 8 * k, 7), C.rust, { p: [x, 4 * k, z] });
  else { b.add(cyl(.8, 1.4, 16 * k, 5), '#4b3b28', { p: [x, 8 * k, z], r: [.2, 0, .15] }); b.add(cyl(.4, .7, 8 * k, 4), '#4b3b28', { p: [x + 3, 13 * k, z], r: [0, 0, -.8] }) }
  return b;
}
export { Builder };
