import { CELL, GH, GW } from './data';
import { S, type Ent } from './state';

// vis = มองเห็นตอนนี้, exp = เคยสำรวจแล้ว (ของฝ่ายผู้เล่น team 0)
export const vis = new Uint8Array(GW * GH), exp = new Uint8Array(GW * GH);

function reveal(x: number, y: number, rad: number) {
  const c0 = Math.max(0, Math.floor((x - rad) / CELL)), c1 = Math.min(GW - 1, Math.floor((x + rad) / CELL));
  const r0 = Math.max(0, Math.floor((y - rad) / CELL)), r1 = Math.min(GH - 1, Math.floor((y + rad) / CELL));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
    if (Math.hypot((c + .5) * CELL - x, (r + .5) * CELL - y) <= rad) { vis[r * GW + c] = 1; exp[r * GW + c] = 1 }
}
function explore(x: number, y: number, rad: number) {
  for (let dy = -rad; dy <= rad; dy += CELL) for (let dx = -rad; dx <= rad; dx += CELL) if (Math.hypot(dx, dy) <= rad) exp[cellAt(x + dx, y + dy)] = 1;
}
export function computeFog() {
  vis.fill(0);
  for (const e of S.ents) if (e.team === 0) reveal(e.x, e.y, e.t.sight);
  for (const r of S.ruins) if (r.active) reveal(r.x, r.y, r.r + 140); else if (r.spent && r.owner === 0) reveal(r.x, r.y, r.r + 80);
    else if (r.warned) explore(r.x, r.y, r.r); // ประกาศเตือนก่อนซากตื่น = รู้ตำแหน่ง
}
export const cellAt = (x: number, y: number) =>
  Math.min(GH - 1, Math.max(0, Math.floor(y / CELL))) * GW + Math.min(GW - 1, Math.max(0, Math.floor(x / CELL)));
// Rig ที่ขน Data Core ส่งสัญญาณ ทุกฝ่ายมองเห็น
export const seen = (e: Ent) => e.team === 0 || !!e.carry || !!vis[cellAt(e.x, e.y)] || (e.t.bld && !!exp[cellAt(e.x, e.y)]);
