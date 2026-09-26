import { CanvasSource, Texture } from 'pixi.js';
import { RUIN, T, TIER_COL, type RuinKind, type TypeKey } from '../sim/data';

// ธีม: โลกหลังวิกฤต (สนิม ฝุ่น คอนกรีต เหล็กกล้า) ตัดกับเทคโนโลยีโบราณ (หินออบซิเดียนดำ + ลายเรืองแสง)
// วาดด้วย Canvas2D ครั้งเดียวตอนใช้ครั้งแรก แล้วแคชเป็น texture ของ Pixi (ไม่มีไฟล์ภาพ)
// สร้างที่ความละเอียด SS เท่าเพื่อให้คมบนจอ HiDPI
export const OL = '#0b0d10';
const SS = 2, cache = new Map<string, Texture>();
type G = CanvasRenderingContext2D;

// โทนสีหลัก
const M = { dark: '#1c2026', gun: '#2d333b', steel: '#434b55', light: '#69737f', conc: '#565b60', concD: '#3f4448', rust: '#7a4526', sand: '#8a7a5c' };

export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return '#' + ((f(n >> 16) << 16) | (f(n >> 8 & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}
function tex(key: string, w: number, h: number, draw: (g: G) => void, res = SS): Texture {
  let t = cache.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
  const g = c.getContext('2d')!; g.scale(res, res); g.translate(w / 2, h / 2);
  g.lineJoin = 'miter'; g.lineCap = 'butt'; g.strokeStyle = OL; g.lineWidth = 1.5; draw(g);
  t = new Texture({ source: new CanvasSource({ resource: c, resolution: res }) }); cache.set(key, t); return t;
}
const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r) };
const circ = (g: G, x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, 7) };
const fs = (g: G, fill: string) => { g.fillStyle = fill; g.fill(); g.stroke() };
const poly = (g: G, pts: number[]) => { g.beginPath(); for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath() };
const line = (g: G, x1: number, y1: number, x2: number, y2: number, col: string, w = 1) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = OL; g.lineWidth = 1.5 };
// ไฟเรืองแสงเล็กๆ (ไฟสัญญาณ, คริสตัล)
const lamp = (g: G, x: number, y: number, r: number, col: string) => { g.save(); g.shadowColor = col; g.shadowBlur = r * 4; g.fillStyle = col; circ(g, x, y, r); g.fill(); g.restore() };
// แถบลายเตือนอันตรายเหลืองดำ
function hazard(g: G, x: number, y: number, w: number, h: number) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = '#d8a520'; g.fillRect(x, y, w, h);
  g.fillStyle = '#15171a'; for (let i = -h; i < w; i += 6) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + 3, y + h); g.lineTo(x + i + 3 + h, y); g.lineTo(x + i + h, y); g.fill() }
  g.restore(); g.strokeRect(x, y, w, h);
}
// จุดสนิม/รอยเปื้อนแบบสุ่มคงที่
function grime(g: G, seed: number, w: number, h: number, n: number, col = 'rgba(0,0,0,.18)') {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = col; for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse((r() - .5) * w, (r() - .5) * h, 1 + r() * 3, .8 + r() * 2, r() * 3, 0, 7); g.fill() }
}

// ---------- ชิ้นส่วนเล็กที่ใช้ซ้ำ ----------
export const whiteDot = () => tex('dot', 16, 16, g => { g.fillStyle = '#fff'; circ(g, 0, 0, 8); g.fill() });
export const shadow = () => tex('shadow', 64, 28, g => { g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(0, 0, 30, 12, 0, 0, 7); g.fill() });
// วงเลือกแบบวงเล็งยุทธวิธี: วงรีเป็นท่อนๆ
export const selRing = () => tex('sel', 70, 38, g => {
  g.strokeStyle = '#8dff5a'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .25; g.beginPath(); g.ellipse(0, 0, 32, 16, 0, a, a + 1.05); g.stroke() }
});
export const gun = (len: number) => tex('gun' + len, len * 2 + 4, 10, g => { g.fillStyle = '#16191d'; g.fillRect(1, -1.5, len, 3); g.fillStyle = M.steel; g.fillRect(1, -1.5, len * .45, 3) });
export const barrel = (len: number) => tex('barrel' + len, len * 2 + 4, 12, g => {
  rr(g, 0, -3, len, 6, 1); fs(g, M.gun); g.fillStyle = M.dark; g.fillRect(len - 5, -3.5, 5, 7); g.strokeRect(len - 5, -3.5, 5, 7); line(g, 2, -1, len - 6, -1, 'rgba(255,255,255,.15)');
});
export const turretHead = (c: string, r: number) => tex('thead' + c + r, r * 2 + 6, r * 2 + 6, g => {
  poly(g, [-r, -r * .6, -r * .5, -r, r * .7, -r * .8, r, 0, r * .7, r * .8, -r * .5, r, -r, r * .6]); fs(g, M.steel);
  g.fillStyle = c; g.fillRect(-r * .7, -r * .15, r * .9, r * .3); lamp(g, r * .45, 0, 1.5, '#ffb347');
});
export const orb = () => tex('orb', 14, 14, g => { lamp(g, 0, 0, 3.5, '#ff4fd8'); g.fillStyle = '#ffd6f6'; circ(g, 0, 0, 1.6); g.fill() });
export function glow(col: string, r: number) {
  return tex('glow' + col + r, r * 2, r * 2, g => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r);
  }, 1);
}
// วงประ (หมุนได้ถูกๆ ด้วย sprite.rotation แทน lineDashOffset)
export function dashRing(r: number, col: string, dash: number[], lw: number, fill = '') {
  return tex('ring' + r + col + dash + lw + fill, r * 2 + lw * 2, r * 2 + lw * 2, g => {
    if (fill) { g.fillStyle = fill; circ(g, 0, 0, r); g.fill() }
    g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); circ(g, 0, 0, r); g.stroke();
  }, 1);
}

// ---------- พื้นดินรกร้างและซากปรักหักพัง ----------
export function groundTile() {
  return tex('ground', 512, 512, g => {
    g.translate(-256, -256); let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#3a352d'; g.fillRect(0, 0, 512, 512);
    // หย่อมดิน/ทราย/รอยไหม้ (วาดซ้ำ 9 ตำแหน่งให้ต่อขอบกันได้)
    const blob = (x: number, y: number, a: number, b: number, t: number, col: string) => {
      g.fillStyle = col; for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { g.beginPath(); g.ellipse(x + ox, y + oy, a, b, t, 0, 7); g.fill() }
    };
    for (let i = 0; i < 26; i++) blob(r() * 512, r() * 512, 30 + r() * 70, 20 + r() * 45, r() * 3, ['rgba(138,122,92,.05)', 'rgba(20,18,15,.07)', 'rgba(90,80,62,.06)'][i % 3]);
    for (let i = 0; i < 4; i++) blob(r() * 512, r() * 512, 18 + r() * 20, 14 + r() * 14, r() * 3, 'rgba(12,11,10,.16)');
    // รอยแตกระแหง
    g.strokeStyle = 'rgba(15,13,11,.45)'; g.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - .5) * 40; y += (r() - .5) * 40; g.lineTo(x, y); if (r() < .3) { g.moveTo(x, y); g.lineTo(x + (r() - .5) * 20, y + (r() - .5) * 20); g.moveTo(x, y) } }
      g.stroke();
    }
    // กรวด
    for (let i = 0; i < 220; i++) { g.fillStyle = r() < .5 ? 'rgba(160,145,115,.35)' : 'rgba(15,14,12,.35)'; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 1.5) }
    // หญ้าแห้งประปราย
    g.strokeStyle = 'rgba(120,108,70,.5)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x - 3, y - 4); g.moveTo(x, y); g.lineTo(x + 1, y - 5); g.moveTo(x + 2, y); g.lineTo(x + 4, y - 3); g.stroke() }
  }, 1);
}
const DECO: ((g: G) => void)[] = [
  // ก้อนคอนกรีตแตก มีเหล็กเส้นโผล่
  g => {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(2, 8, 15, 4, 0, 0, 7); g.fill();
    poly(g, [-13, 5, -11, -5, -3, -8, 6, -6, 12, 2, 8, 7]); fs(g, M.conc); poly(g, [-11, -5, -3, -8, 6, -6, 2, -2, -7, -1]); g.fillStyle = '#6b7075'; g.fill();
    line(g, 3, -6, 7, -14, M.rust, 1.5); line(g, -4, -7, -6, -13, M.rust, 1.5); grime(g, 3, 20, 10, 6);
  },
  // ถังน้ำมันขึ้นสนิม
  g => {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(3, 8, 11, 3.5, 0, 0, 7); g.fill();
    rr(g, -6, -9, 12, 16, 2); fs(g, M.rust); line(g, -6, -4, 6, -4, '#4a2a17', 1.5); line(g, -6, 2, 6, 2, '#4a2a17', 1.5);
    g.beginPath(); g.ellipse(0, -9, 6, 2.2, 0, 0, 7); fs(g, '#8c5530'); grime(g, 9, 10, 14, 5, 'rgba(30,15,5,.35)');
  },
  // พุ่มไม้แห้งตาย
  g => {
    g.strokeStyle = '#4b3b28'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .35; g.beginPath(); g.moveTo(0, 6); g.lineTo(Math.cos(a) * 12, 6 + Math.sin(a) * 12); g.lineTo(Math.cos(a + .3) * 15, 6 + Math.sin(a + .3) * 14); g.stroke() }
  },
  // หลุมระเบิด
  g => {
    g.fillStyle = 'rgba(10,9,8,.45)'; g.beginPath(); g.ellipse(0, 0, 16, 9, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(138,122,92,.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 17, 10, 0, Math.PI * .9, Math.PI * 2.1); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(1, 1, 9, 5, 0, 0, 7); g.fill();
  },
  // ซากรถยนต์ไหม้
  g => {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(2, 7, 17, 5, 0, 0, 7); g.fill();
    rr(g, -15, -6, 30, 12, 3); fs(g, '#5a3a24'); rr(g, -6, -5, 12, 10, 2); fs(g, '#2c2420');
    g.fillStyle = '#16120f'; for (const x of [-11, 9]) for (const y of [-7, 5]) g.fillRect(x - 2, y, 4, 2);
    grime(g, 21, 28, 10, 10, 'rgba(15,8,4,.45)');
  },
];
export const deco = (i: number) => tex('deco' + (i % DECO.length), 44, 34, DECO[i % DECO.length]);

export function ore(kind: 'ore' | 'xen') {
  return tex('ore' + kind, 26, 26, g => {
    g.lineWidth = 1.2;
    if (kind === 'xen') {
      // Xenite: ผลึกต่างดาวสีม่วงเรืองแสง
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 13); gr.addColorStop(0, 'rgba(190,110,255,.65)'); gr.addColorStop(1, 'rgba(190,110,255,0)'); g.fillStyle = gr; g.fillRect(-13, -13, 26, 26);
      poly(g, [0, -11, 4, -3, 2, 7, -2, 7, -4, -3]); fs(g, '#8d4dff'); poly(g, [5, -5, 8, 0, 6, 7, 3, 7]); fs(g, '#6a2fd6'); poly(g, [-5, -4, -3, 7, -7, 7, -8, 1]); fs(g, '#7a3ae8');
      g.fillStyle = '#e2c8ff'; poly(g, [0, -11, -4, -3, -1, -2]); g.fill();
    } else {
      // แร่ดิบ: ก้อนโลหะสีทองหม่น
      poly(g, [-7, 5, -8, -1, -3, -6, 4, -6, 8, 1, 4, 6]); fs(g, '#9a7428');
      g.fillStyle = '#c99a3a'; poly(g, [-3, -6, 4, -6, 2, -1, -4, -1]); g.fill();
      g.fillStyle = '#5e4516'; poly(g, [4, 6, 8, 1, 5, 1, 2, 4]); g.fill(); grime(g, 7, 12, 8, 3, 'rgba(0,0,0,.3)');
    }
  });
}

// ---------- ทหารราบ (มองจากบน หันขวา = มุม 0, หมุนทั้งตัวตามทิศที่เล็ง) ----------
// ประกอบจากชิ้นส่วน: ของที่สะพายหลัง + ลำตัว/เสื้อเกราะ + อาวุธ + แขน + ศีรษะ
// ทหารแบบใหม่: เพิ่มรายการใน INF_LOOK โดยใช้ key เดียวกับ T (ไม่มีรายการ = ใช้หน้าตาของ rifle)
export type InfWeapon = 'rifle' | 'smg' | 'launcher' | 'tool' | 'none';
export type InfPack = 'pack' | 'radio' | 'tank' | 'none';
export type InfHead = 'helmet' | 'visor' | 'hood';
export interface InfLook { weapon: InfWeapon; pack: InfPack; head: InfHead; uniform: string; vest: string }
export const INF_LOOK: Partial<Record<TypeKey, InfLook>> = {
  rifle: { weapon: 'rifle', pack: 'pack', head: 'helmet', uniform: '#66704f', vest: '#434a36' },
  // ตัวอย่างสำหรับอนาคต (ยังไม่มียูนิตใน data.ts):
  //   bazooka:  { weapon: 'launcher', pack: 'pack',  head: 'helmet', uniform: '#4b5240', vest: '#3a3f30' }
  //   engineer: { weapon: 'tool',     pack: 'radio', head: 'hood',   uniform: '#5a5540', vest: '#6a4a22' }
  //   aegis:    { weapon: 'smg',      pack: 'tank',  head: 'visor',  uniform: '#39414b', vest: '#252b32' }
};
export const infantry = (type: TypeKey, c: string) => drawInfantry(INF_LOOK[type] ?? INF_LOOK.rifle!, c, 'inf' + type + c);
// วาดจาก InfLook ตรงๆ (ใช้ทำภาพตัวอย่างทหารแบบใหม่ก่อนเพิ่มเข้า data.ts ได้)
export function drawInfantry(L: InfLook, c: string, key = 'infL' + JSON.stringify(L) + c) {
  return tex(key, 50, 34, g => {
    // ของที่สะพายหลัง (อยู่ด้านหลัง = ฝั่ง -x)
    if (L.pack === 'pack') {
      rr(g, -12.5, -5, 3, 10, 1.4); fs(g, '#5d5338');                                  // ม้วนเครื่องนอน
      rr(g, -11, -4.2, 6.5, 8.4, 1.6); fs(g, '#3a3f30'); line(g, -7.8, -4, -7.8, 4, 'rgba(0,0,0,.4)');
      g.fillStyle = '#2b2f24'; g.fillRect(-10.5, -1.2, 2.2, 2.4);                       // กระเป๋าข้าง
    } else if (L.pack === 'radio') {
      rr(g, -11.5, -4, 6.5, 8, 1); fs(g, '#2e3329'); line(g, -10.5, -3, -15, -9, '#1a1d21', 1.2); lamp(g, -15, -9, .9, '#ff5a3c');
    } else if (L.pack === 'tank') {
      for (const y of [-2.6, 2.6]) { rr(g, -12, y - 2.2, 7, 4.4, 2.2); fs(g, '#5a626c') }
    }
    // ลำตัว: ไหล่กว้างตั้งฉากกับทิศที่หัน + เสื้อเกราะ + ปลอกแขนสีฝ่าย
    g.beginPath(); g.ellipse(-1.5, 0, 4.4, 7, 0, 0, 7); fs(g, L.uniform);
    g.fillStyle = L.vest; g.beginPath(); g.ellipse(-1.7, 0, 3.2, 5.2, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-3.4, -2.6, 1.3, 1.6); g.fillRect(-3.4, 1, 1.3, 1.6); // ซองกระสุน
    g.fillStyle = c; g.fillRect(-3.2, 5.2, 3.4, 1.9); g.strokeRect(-3.2, 5.2, 3.4, 1.9);
    // อาวุธ (ถืออยู่หน้าอก ค่อนไปทางไหล่ขวา = +y)
    const W = L.weapon;
    if (W === 'rifle' || W === 'smg') {
      const len = W === 'rifle' ? 1 : .65;
      g.fillStyle = '#3b2a1c'; g.fillRect(-4.5, 1.3, 5, 2.6); g.strokeRect(-4.5, 1.3, 5, 2.6);              // พานท้าย
      g.fillStyle = '#1a1d21'; g.fillRect(.5, 1.4, 10 * len, 2.4); g.strokeRect(.5, 1.4, 10 * len, 2.4);    // ตัวปืน
      g.fillStyle = '#23272c'; g.fillRect(4, 3.8, 2, 3); g.strokeRect(4, 3.8, 2, 3);                        // แม็กกาซีน
      g.fillStyle = '#111316'; g.fillRect(.5 + 10 * len, 2, 8 * len, 1.3); g.strokeRect(.5 + 10 * len, 2, 8 * len, 1.3); // ลำกล้อง
      g.fillStyle = '#3d444c'; g.fillRect(3, .6, 3, 1);                                                      // ศูนย์เล็ง
    } else if (W === 'launcher') {
      // เครื่องยิงจรวดพาดบ่าซ้าย (-y)
      rr(g, -9, -5.6, 22, 3.6, 1.2); fs(g, '#4b5240'); g.fillStyle = '#2b2f24'; g.fillRect(-9, -5.6, 3, 3.6);
      poly(g, [13, -6.4, 17, -5.6, 17, -2.8, 13, -1.2]); fs(g, '#6a4a22');
    } else if (W === 'tool') {
      line(g, 1, 3, 11, 3, '#8a939c', 2); circ(g, 12, 3, 2.2); fs(g, '#8a939c');
    }
    // แขน: ขอบดำก่อน แล้วเติมสีเสื้อ ไหล่ซ้ายจับด้ามหน้า ไหล่ขวาจับด้ามปืน
    const arm = (x1: number, y1: number, x2: number, y2: number) => {
      g.lineCap = 'round';
      g.strokeStyle = OL; g.lineWidth = 4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = L.uniform; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.fillStyle = '#c9a27e'; circ(g, x2, y2, 1.2); g.fill();                             // มือ
      g.lineCap = 'butt'; g.strokeStyle = OL; g.lineWidth = 1.5;
    };
    if (W === 'launcher') { arm(-1.5, -5.5, 6, -3.8); arm(-1.5, 5.5, 2, -1.5) }
    else if (W !== 'none') { arm(-1.5, -5.8, 8.5, 2.2); arm(-1.5, 5.8, 2.5, 3) }
    // ศีรษะ
    if (L.head === 'hood') { circ(g, .2, 0, 3.7); fs(g, '#3a3528'); g.fillStyle = '#c9a27e'; g.beginPath(); g.arc(.9, 0, 2.2, -1.2, 1.2); g.fill() }
    else {
      circ(g, .2, 0, 3.9); fs(g, L.head === 'visor' ? '#4a535e' : '#737d5a');
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; circ(g, .2, 0, 2.7); g.stroke(); g.strokeStyle = OL; g.lineWidth = 1.5;
      g.fillStyle = c; g.fillRect(-2.8, -.6, 3, 1.2);                                          // แถบสีฝ่ายบนหมวก
      if (L.head === 'visor') { g.save(); g.shadowColor = '#6ff8ff'; g.shadowBlur = 5; g.strokeStyle = '#8ffbff'; g.lineWidth = 1.4; g.beginPath(); g.arc(.2, 0, 3.3, -.9, .9); g.stroke(); g.restore() }
      g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(-.6, -1.6, 1.6, .9, -.4, 0, 7); g.fill();
    }
  });
}

// ---------- ยานพาหนะ (มองจากบน หันขวา = มุม 0) ----------
export function vehicle(type: TypeKey, c: string) {
  return tex('veh' + type + c, type === 'rail' ? 64 : 52, 42, g => {
    const r = T[type].r;
    // สายพาน
    for (const s of [-1, 1]) {
      rr(g, -r - 1, s * r * .62 - r * .22, 2 * r + 2, r * .44, 1.5); fs(g, '#16181b');
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
      for (let x = -r + 1; x < r; x += 3) { g.beginPath(); g.moveTo(x, s * r * .62 - r * .18); g.lineTo(x, s * r * .62 + r * .18); g.stroke() }
      g.strokeStyle = OL; g.lineWidth = 1.5;
    }
    // ตัวถังเหลี่ยม ลบมุมหน้า
    const hw = r, hh = r * .56;
    poly(g, [-hw, -hh, hw * .7, -hh, hw, -hh * .5, hw, hh * .5, hw * .7, hh, -hw, hh]); fs(g, M.gun);
    g.fillStyle = M.steel; poly(g, [-hw + 2, -hh + 2, hw * .65, -hh + 2, hw - 2, -hh * .4, -hw + 2, -hh * .4]); g.fill();
    g.fillStyle = c; g.fillRect(-hw + 2, hh - 4, hw * 1.5, 2.2);           // แถบสีฝ่าย
    line(g, -hw * .3, -hh + 2, -hw * .3, hh - 2, 'rgba(0,0,0,.35)');      // รอยต่อแผ่นเกราะ
    lamp(g, hw - 1, -hh * .35, 1, '#ffd27a'); lamp(g, hw - 1, hh * .35, 1, '#ffd27a');
    grime(g, r * 13, hw * 1.8, hh * 1.6, 5);
    if (type === 'tank') {
      g.fillStyle = M.dark; g.fillRect(1, -2, r + 8, 4); g.strokeRect(1, -2, r + 8, 4); g.fillRect(r + 5, -2.8, 4, 5.6); g.strokeRect(r + 5, -2.8, 4, 5.6);
      poly(g, [-r * .55, -r * .42, r * .25, -r * .42, r * .5, -r * .15, r * .5, r * .15, r * .25, r * .42, -r * .55, r * .42]); fs(g, M.steel);
      g.fillStyle = c; g.fillRect(-r * .45, -1, r * .5, 2); circ(g, -r * .2, -r * .15, 1.6); fs(g, M.light);
    } else if (type === 'rocket') {
      // รถถังจรวด: แท่นยิงกล่องเหลี่ยม ท่อจรวด 2x2 หัวแดง
      rr(g, -r * .7, -r * .55, r * 1.25, r * 1.1, 1); fs(g, M.steel);
      g.fillStyle = c; g.fillRect(-r * .65, -r * .1, r * .35, r * .2);
      g.fillStyle = M.dark; g.fillRect(r * .15, -r * .5, r * .42, r); g.strokeRect(r * .15, -r * .5, r * .42, r);
      for (const y of [-r * .27, r * .27]) for (const x of [r * .3, r * .47]) { circ(g, x, y, r * .15); fs(g, '#16181b') }
      for (const y of [-r * .27, r * .27]) { poly(g, [r * .57, y - r * .12, r * .8, y, r * .57, y + r * .12]); fs(g, '#c7361e') }
      line(g, -r * .6, -r * .52, r * .1, -r * .52, 'rgba(255,255,255,.2)');
    } else if (type === 'rail') {
      // รางคู่ + ขดลวดเรืองแสงฟ้า
      for (const y of [-3, 1.5]) { g.fillStyle = M.dark; g.fillRect(-2, y, r + 18, 1.8); g.strokeRect(-2, y, r + 18, 1.8) }
      for (let x = 3; x < r + 14; x += 4.5) lamp(g, x, -.6, 1, '#6ff8ff');
      poly(g, [-r * .7, -r * .45, r * .1, -r * .45, r * .3, 0, r * .1, r * .45, -r * .7, r * .45]); fs(g, M.steel);
      g.save(); g.shadowColor = '#6ff8ff'; g.shadowBlur = 10; circ(g, -r * .3, 0, r * .28); fs(g, '#9ffcff'); g.restore();
    } else if (type === 'ion') {
      // ปืนใหญ่ไอออน: ลำกล้องหนา ครีบระบายความร้อนสีส้ม
      rr(g, -4, -4, r + 14, 8, 1); fs(g, M.dark);
      for (const x of [3, 8, 13]) { g.fillStyle = '#ff8a2a'; g.fillRect(x, -5.5, 2.2, 11); g.strokeRect(x, -5.5, 2.2, 11) }
      poly(g, [-r * .8, -r * .4, -r * .1, -r * .4, -r * .1, r * .4, -r * .8, r * .4]); fs(g, M.steel); lamp(g, -r * .45, 0, 2.2, '#ffb347');
    } else if (type === 'harv') {
      // รถขุดแร่: ห้องเก็บแร่ + ห้องคนขับ + ใบตัก
      rr(g, -r + 2, -r * .42, r * 1.2, r * .84, 1); fs(g, M.dark); hazard(g, r * .95, -r * .5, 3, r);
      poly(g, [r * .28, -r * .42, r * .82, -r * .3, r * .82, r * .3, r * .28, r * .42]); fs(g, M.steel);
      g.fillStyle = '#ffcf6a'; g.fillRect(r * .5, -r * .22, r * .22, r * .44); g.strokeRect(r * .5, -r * .22, r * .22, r * .44);
    } else if (type === 'rig') {
      // รถถอดรหัส: เสาเซนเซอร์ + จานรับสัญญาณเรืองแสง
      rr(g, -r + 1, -r * .35, r * .9, r * .7, 1); fs(g, M.dark);
      g.strokeStyle = '#27f2d0'; g.lineWidth = 2; g.save(); g.shadowColor = '#27f2d0'; g.shadowBlur = 6; g.beginPath(); g.arc(1, 0, r * .6, -1.2, 1.2); g.stroke(); g.restore();
      g.strokeStyle = OL; g.lineWidth = 1.5; line(g, 1, 0, 7, 0, M.light, 1.5); lamp(g, 7.5, 0, 1.8, '#27f2d0');
    }
  });
}

// ---------- สิ่งก่อสร้าง (มองเฉียง เห็นหลังคา+ผนัง) บังเกอร์คอนกรีต + ไฟสัญญาณสีฝ่าย ----------
export function building(type: TypeKey, c: string) {
  const s = T[type].r, S2 = 2 * s + 16;
  return tex('bld' + type + c, S2, S2 + 30, g => {
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(3, s * .8, s * 1.08, s * .36, 0, 0, 7); g.fill();
    // ผนังคอนกรีต (ด้านหน้า) + หลังคา (ด้านบน) ใช้ร่วมกันหลายอาคาร
    const block = (x: number, y: number, w: number, wallH: number, roofH: number, roof = M.gun) => {
      g.fillStyle = M.concD; g.fillRect(x, y + roofH, w, wallH); g.strokeRect(x, y + roofH, w, wallH);
      g.fillStyle = M.conc; g.fillRect(x, y, w, roofH); g.strokeRect(x, y, w, roofH);
      g.fillStyle = roof; g.fillRect(x + 3, y + 3, w - 6, roofH - 6); g.strokeRect(x + 3, y + 3, w - 6, roofH - 6);
    };
    if (type === 'hq') {
      block(-s, -s * .9, 2 * s, s * .55, s * 1.25);
      g.fillStyle = c; g.fillRect(-s + 2, -s * .9 + s * 1.25, 2 * s - 4, 3);                 // แถบไฟสีฝ่าย
      hazard(g, -s * .28, s * .45, s * .56, s * .4);                                       // ประตูโรงรถ
      // ลานจอดเฮลิคอปเตอร์บนหลังคา
      g.strokeStyle = '#c8cdd2'; g.lineWidth = 1.5; circ(g, -s * .25, -s * .3, s * .38); g.stroke();
      g.font = 'bold ' + (s * .45) + 'px sans-serif'; g.fillStyle = '#c8cdd2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', -s * .25, -s * .28);
      g.strokeStyle = OL; g.lineWidth = 1.5;
      // จานเรดาร์ + เสาอากาศ
      g.beginPath(); g.ellipse(s * .55, -s * .45, s * .28, s * .16, -.4, 0, 7); fs(g, M.light); line(g, s * .55, -s * .45, s * .55, -s * .8, M.light, 2);
      line(g, s * .75, -s * .7, s * .75, -s * 1.45, M.light, 1.5); lamp(g, s * .75, -s * 1.45, 1.8, c);
    } else if (type === 'ref') {
      block(-s, -s * .45, s * 1.1, s * .5, s * .8);
      g.fillStyle = c; g.fillRect(-s + 2, -s * .45 + s * .8, s * 1.1 - 4, 2.5);
      // ถังเก็บแร่ทรงกระบอก
      const x = s * .45; g.fillStyle = M.steel; g.fillRect(x - s * .45, -s * .55, s * .9, s * 1.25); g.strokeRect(x - s * .45, -s * .55, s * .9, s * 1.25);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + s * .15, -s * .55, s * .3, s * 1.25);
      g.beginPath(); g.ellipse(x, -s * .55, s * .45, s * .18, 0, 0, 7); fs(g, M.light); g.fillStyle = '#c99a3a'; g.beginPath(); g.ellipse(x, -s * .55, s * .3, s * .1, 0, 0, 7); g.fill();
      hazard(g, x - s * .45, s * .35, s * .9, 4); line(g, -s * .1, -s * .2, x - s * .45, -s * .2, M.rust, 3);
    } else if (type === 'turret') {
      // ฐานคอนกรีตหกเหลี่ยม (หัวปืนวาดแยกแล้วหมุนได้)
      poly(g, [-s, 0, -s * .5, -s * .8, s * .5, -s * .8, s, 0, s * .5, s * .8, -s * .5, s * .8]); fs(g, M.conc);
      poly(g, [-s * .7, 0, -s * .35, -s * .55, s * .35, -s * .55, s * .7, 0, s * .35, s * .55, -s * .35, s * .55]); fs(g, M.concD);
    } else if (type === 'pylon') {
      // เสาเลเซอร์: ฐานเหล็ก + คริสตัลโบราณสีฟ้า
      poly(g, [-s, s * .35, -s * .6, -s * .05, s * .6, -s * .05, s, s * .35, s * .6, s * .7, -s * .6, s * .7]); fs(g, M.gun);
      g.fillStyle = c; g.fillRect(-s * .6, s * .3, s * 1.2, 2.5);
      poly(g, [-s * .3, s * .1, -s * .18, -s * .9, s * .18, -s * .9, s * .3, s * .1]); fs(g, '#111418');
      g.save(); g.shadowColor = '#6ff8ff'; g.shadowBlur = 14; poly(g, [0, -s * 1.5, s * .28, -s * .95, 0, -s * .55, -s * .28, -s * .95]); g.fillStyle = '#8ffbff'; g.fill(); g.restore(); g.stroke();
    } else if (type === 'dome') {
      g.beginPath(); g.ellipse(0, s * .4, s, s * .42, 0, 0, 7); fs(g, M.gun); g.fillStyle = c; g.fillRect(-s * .8, s * .38, s * 1.6, 2.5);
      g.save(); g.shadowColor = '#6ff8ff'; g.shadowBlur = 12; g.beginPath(); g.arc(0, s * .32, s * .88, Math.PI, 0); g.closePath(); g.fillStyle = 'rgba(80,220,255,.35)'; g.fill(); g.restore();
      g.strokeStyle = 'rgba(140,240,255,.9)'; g.lineWidth = 1.2; g.stroke();
      for (const k of [.3, .6]) { g.beginPath(); g.ellipse(0, s * .32, s * .88, s * .88 * k, 0, Math.PI, 0); g.stroke() }
      g.strokeStyle = OL; g.lineWidth = 1.5;
    } else if (type === 'vault') {
      // คลังพิมพ์เขียว: บล็อกเกราะหนา ประตูนิรภัยกลม
      block(-s, -s * .75, 2 * s, s * .6, s * 1.05, '#23282e');
      g.fillStyle = c; g.fillRect(-s + 2, -s * .75 + s * 1.05, 2 * s - 4, 2.5);
      circ(g, 0, s * .6, s * .4); fs(g, M.steel); circ(g, 0, s * .6, s * .26); fs(g, M.gun);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; line(g, Math.cos(a) * s * .1, s * .6 + Math.sin(a) * s * .1, Math.cos(a) * s * .24, s * .6 + Math.sin(a) * s * .24, M.light, 1.5) }
      lamp(g, 0, s * .6, 2, '#ffb347'); for (const x of [-s * .7, s * .7]) lamp(g, x, -s * .5, 1.6, '#ffb347');
    } else if (type === 'barracks') {
      // ค่ายทหาร: โรงเรือนหลังคาโค้ง (quonset) สีเขียวทหาร
      g.fillStyle = M.concD; g.fillRect(-s, s * .05, 2 * s, s * .6); g.strokeRect(-s, s * .05, 2 * s, s * .6);
      g.beginPath(); g.moveTo(-s, s * .05); g.bezierCurveTo(-s, -s * 1.05, s, -s * 1.05, s, s * .05); g.closePath(); fs(g, '#4a5040');
      g.strokeStyle = 'rgba(0,0,0,.35)'; for (const x of [-s * .5, 0, s * .5]) { g.beginPath(); g.moveTo(x, s * .05); g.lineTo(x * .9, -s * .72); g.stroke() }
      g.strokeStyle = OL; g.fillStyle = c; g.fillRect(-s + 2, s * .05, 2 * s - 4, 2.5);
      rr(g, -s * .22, s * .2, s * .44, s * .45, 1); fs(g, '#1a1d20'); lamp(g, 0, s * .12, 1.4, '#ffd27a');
      line(g, s * .7, -s * .2, s * .7, -s * 1.1, M.light, 1.5); g.fillStyle = c; poly(g, [s * .7, -s * 1.1, s * .7 + 9, -s * 1.0, s * .7, -s * .9]); g.fill(); g.stroke();
    } else if (type === 'factory') {
      // โรงงานรถ: โรงเก็บหลังคาฟันเลื่อย ประตูม้วน ลายเตือน ปล่องควัน
      g.fillStyle = M.concD; g.fillRect(-s, -s * .1, 2 * s, s * .75); g.strokeRect(-s, -s * .1, 2 * s, s * .75);
      g.beginPath(); g.moveTo(-s, -s * .1);
      for (let i = 0; i < 4; i++) { const x0 = -s + i * s / 2; g.lineTo(x0 + s * .38, -s * .78); g.lineTo(x0 + s / 2, -s * .78); g.lineTo(x0 + s / 2, -s * .1) }
      g.closePath(); fs(g, M.gun);
      g.fillStyle = 'rgba(120,200,255,.25)'; for (let i = 0; i < 4; i++) { const x0 = -s + i * s / 2; g.fillRect(x0 + s * .4, -s * .72, s * .08, s * .55) }
      g.fillStyle = c; g.fillRect(-s + 2, -s * .1, 2 * s - 4, 2.5);
      g.fillStyle = M.steel; g.fillRect(-s * .55, s * .02, s * 1.1, s * .5); g.strokeRect(-s * .55, s * .02, s * 1.1, s * .5);
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; for (let y = s * .08; y < s * .5; y += 3.5) { g.beginPath(); g.moveTo(-s * .52, y); g.lineTo(s * .52, y); g.stroke() }
      g.strokeStyle = OL; g.lineWidth = 1.5; hazard(g, -s * .55, s * .52, s * 1.1, 4);
      g.fillStyle = M.rust; g.fillRect(s * .68, -s * 1.3, 7, s * .6); g.strokeRect(s * .68, -s * 1.3, 7, s * .6);
      g.fillStyle = 'rgba(90,90,90,.55)'; circ(g, s * .68 + 3.5, -s * 1.4, 4); g.fill(); circ(g, s * .68 + 8, -s * 1.6, 3); g.fill();
    } else if (type === 'lab') {
      // Lab วิศวกรรมย้อนกลับ: อาคารเหลี่ยมมืด + โดมกระจก มีคริสตัลโบราณลอยอยู่
      block(-s, -s * .25, 2 * s, s * .55, s * .7, '#1f2429');
      g.fillStyle = c; g.fillRect(-s + 2, -s * .25 + s * .7, 2 * s - 4, 2.5);
      g.beginPath(); g.arc(0, -s * .05, s * .7, Math.PI, 0); g.closePath(); g.fillStyle = 'rgba(60,200,220,.28)'; g.fill(); g.stroke();
      g.save(); g.shadowColor = '#27f2d0'; g.shadowBlur = 14; poly(g, [0, -s * .68, s * .16, -s * .38, 0, -s * .1, -s * .16, -s * .38]); g.fillStyle = '#27f2d0'; g.fill(); g.restore(); g.stroke();
      for (const x of [-s * .75, s * .5]) { g.fillStyle = '#9fe8ff'; g.fillRect(x, s * .52, s * .25, s * .14); g.strokeRect(x, s * .52, s * .25, s * .14) }
      line(g, -s * .85, -s * .3, -s * .85, -s * .95, M.light, 1.5); lamp(g, -s * .85, -s * .95, 1.6, '#27f2d0');
    }
    grime(g, s * 7 + type.length, 2 * s, s * 1.4, 10);
  });
}

// ---------- ผู้พิทักษ์โบราณ: หุ่นกลออบซิเดียน + ลายเรืองแสง ----------
export function neutral(type: TypeKey) {
  const r = T[type].r;
  return tex('neu' + type, r * 4 + 12, r * 4 + 12, g => {
    if (type === 'sentinel') {
      // โดรนเฝ้ายาม: ตัวเหลี่ยมสีดำ ช่องมองแนวนอนเรืองแสงฟ้า
      poly(g, [0, -r * 1.1, r, -r * .3, r * .75, r * .8, -r * .75, r * .8, -r, -r * .3]); fs(g, '#121418');
      g.strokeStyle = '#27f2d0'; g.lineWidth = 1; poly(g, [0, -r * .75, r * .65, -r * .2, r * .5, r * .5, -r * .5, r * .5, -r * .65, -r * .2]); g.stroke();
      g.save(); g.shadowColor = '#27f2d0'; g.shadowBlur = 8; g.fillStyle = '#7ffcff'; g.fillRect(-r * .55, -r * .2, r * 1.1, r * .22); g.restore();
      g.strokeStyle = OL; for (const sx of [-1, 1]) { poly(g, [sx * r, -r * .1, sx * (r + 4), r * .1, sx * (r + 4), r * .5, sx * r * .8, r * .6]); fs(g, '#1b1e23') }
    } else if (type === 'obelisk') {
      // เสาโอเบลิสก์ดำ ลายทองเรืองแสง
      poly(g, [-r * .6, r, -r * .4, -r * 1.3, 0, -r * 1.9, r * .4, -r * 1.3, r * .6, r]); fs(g, '#101216');
      g.fillStyle = '#1d2026'; poly(g, [0, -r * 1.9, r * .4, -r * 1.3, r * .6, r, r * .1, r]); g.fill();
      g.save(); g.shadowColor = '#ffcf5a'; g.shadowBlur = 10; g.strokeStyle = '#ffcf5a'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, -r * 1.6); g.lineTo(0, r * .7); for (let y = -r * 1.1; y < r * .6; y += r * .45) { g.moveTo(-r * .25, y); g.lineTo(r * .25, y + r * .12) } g.stroke(); g.restore();
      poly(g, [-r * .95, r * .75, r * .95, r * .75, r * .8, r * 1.2, -r * .8, r * 1.2]); fs(g, '#2a2e35');
    } else {
      // Archon Warden: แกนพลังงานดำ มีรอยแตกสีชมพูแดง และเขี้ยวพลังงานรอบตัว
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4; g.save(); g.shadowColor = '#ff4fd8'; g.shadowBlur = 8;
        poly(g, [Math.cos(a - .18) * r * .9, Math.sin(a - .18) * r * .9, Math.cos(a) * (r + 9), Math.sin(a) * (r + 9), Math.cos(a + .18) * r * .9, Math.sin(a + .18) * r * .9]);
        g.fillStyle = '#2a0f26'; g.fill(); g.restore(); g.stroke();
      }
      circ(g, 0, 0, r); fs(g, '#121015');
      g.save(); g.shadowColor = '#ff4fd8'; g.shadowBlur = 12; g.strokeStyle = '#ff6fe0'; g.lineWidth = 1.5; g.beginPath();
      g.moveTo(-r * .7, -r * .3); g.lineTo(-r * .2, -r * .1); g.lineTo(-r * .1, -r * .6); g.moveTo(-r * .2, -r * .1); g.lineTo(r * .3, r * .1); g.lineTo(r * .7, -r * .2);
      g.moveTo(r * .3, r * .1); g.lineTo(r * .1, r * .6); g.stroke(); g.restore();
      lamp(g, 0, 0, r * .22, '#ff4fd8'); g.fillStyle = '#ffe0fa'; circ(g, 0, 0, r * .1); g.fill();
    }
  });
}

// ---------- ซากโบราณ: แท่นออบซิเดียนดำ + เสาหินแหลม + ลายเรืองแสงตามระดับ ----------
export const ruinSize = (kind: RuinKind) => kind === 'citadel' ? 70 : kind === 'monolith' ? 52 : 40;
export function ruin(kind: RuinKind) {
  const s = ruinSize(kind), col = RUIN[kind].col;
  return tex('ruin' + kind, s * 2 + 34, s * 2 + 50, g => {
    const sides = kind === 'monolith' ? 4 : 6, off = sides === 4 ? Math.PI / 4 : 0;
    const shape = (k: number) => { g.beginPath(); for (let i = 0; i < sides; i++) { const a = i * 6.283 / sides + off; g.lineTo(Math.cos(a) * s * k, Math.sin(a) * s * k * .8) } g.closePath() };
    g.fillStyle = 'rgba(0,0,0,.45)'; g.save(); g.translate(0, 8); shape(1.04); g.fill(); g.restore();
    shape(1); fs(g, '#16181c'); shape(.78); fs(g, '#1f2227'); shape(.5); fs(g, '#121418');
    // ลายวงจรเรืองแสงบนแท่น
    g.save(); g.shadowColor = col; g.shadowBlur = 8; g.strokeStyle = col; g.lineWidth = 1.2; g.globalAlpha = .85;
    shape(.9); g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < sides; i++) { const a = i * 6.283 / sides + off; g.beginPath(); g.moveTo(Math.cos(a) * s * .5, Math.sin(a) * s * .5 * .8); g.lineTo(Math.cos(a) * s * .78, Math.sin(a) * s * .78 * .8); g.stroke() }
    g.restore();
    // เสาหินแหลมรอบแท่น ปลายเรืองแสง
    const n = kind === 'citadel' ? 6 : kind === 'monolith' ? 4 : 3, h = kind === 'citadel' ? 34 : kind === 'monolith' ? 28 : 20;
    for (let i = 0; i < n; i++) {
      const a = i * 6.283 / n - Math.PI / 2 + .5, x = Math.cos(a) * s * .86, y = Math.sin(a) * s * .86 * .8;
      poly(g, [x - 5, y + 3, x - 3.5, y - h, x, y - h - 7, x + 3.5, y - h, x + 5, y + 3]); fs(g, '#101216');
      g.fillStyle = '#23262c'; poly(g, [x, y - h - 7, x + 3.5, y - h, x + 5, y + 3, x + 1, y + 3]); g.fill();
      lamp(g, x, y - h - 2, 1.8, col); line(g, x - .5, y - h + 4, x - .5, y - 2, col, .8);
    }
    // คริสตัลแกนกลาง
    g.save(); g.shadowColor = col; g.shadowBlur = 18;
    poly(g, [0, -s * .42, s * .17, -s * .05, 0, s * .22, -s * .17, -s * .05]); g.fillStyle = col; g.fill(); g.restore(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.6)'; poly(g, [0, -s * .42, -s * .17, -s * .05, 0, -s * .1]); g.fill();
  });
}

// ---------- ของที่ขน/หล่นในสนาม ----------
// Data Core: ผลึกข้อมูลลอยเรืองแสงสีตาม tier
export function dataCore(tier: number) {
  const col = TIER_COL[tier] || '#fff';
  return tex('core' + tier, 36, 36, g => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 17); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = .5; g.fillStyle = gr; g.fillRect(-18, -18, 36, 36); g.globalAlpha = 1;
    poly(g, [0, -11, 7, 0, 0, 11, -7, 0]); fs(g, '#101216');
    g.save(); g.shadowColor = col; g.shadowBlur = 8; g.strokeStyle = col; g.lineWidth = 1.5; poly(g, [0, -8, 4.5, 0, 0, 8, -4.5, 0]); g.stroke(); g.restore();
    g.fillStyle = col; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(tier), 0, .5);
  });
}
// พิมพ์เขียวที่หล่นจาก Vault: แผ่นข้อมูลโฮโลแกรม ขอบสีตาม tier
export function blueprintItem(tier: number) {
  const col = TIER_COL[tier] || '#fff';
  return tex('bpi' + tier, 36, 32, g => {
    g.save(); g.shadowColor = col; g.shadowBlur = 10; rr(g, -12, -9, 24, 18, 1); g.fillStyle = 'rgba(20,60,110,.9)'; g.fill(); g.restore();
    g.strokeStyle = col; g.lineWidth = 1.5; rr(g, -12, -9, 24, 18, 1); g.stroke();
    g.strokeStyle = 'rgba(160,220,255,.8)'; g.lineWidth = .8;
    for (let x = -9; x <= 9; x += 3) { g.beginPath(); g.moveTo(x, -7); g.lineTo(x, 7); g.stroke() }
    g.lineWidth = 1.2; g.beginPath(); g.rect(-7, -4, 8, 8); g.moveTo(1, 0); g.lineTo(8, 0); g.stroke(); g.beginPath(); g.arc(4, -3, 2.5, 0, 7); g.stroke();
  });
}
