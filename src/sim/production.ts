import { tr } from './i18n';
import { BP, H, T, UPG, W, type TypeKey, type UpgKey } from './data';
import { S, dist, hasBld, hooks, hpMul, msg, spawn, upg } from './state';

// ---------- เงื่อนไขการผลิต: พิมพ์เขียว + อาคารที่ต้องมี ----------
export function unlocked(team: number, type: TypeKey) {
  const t = T[type];
  return (!t.req || !!S.teams[team].bp[t.req]) && t.needs.every(k => hasBld(team, k));
}
// เหตุผลที่ยังผลิตไม่ได้ (ไว้แสดงบนปุ่ม) หรือ '' ถ้าพร้อม
export function lockReason(team: number, type: TypeKey) {
  const t = T[type];
  if (t.req && !S.teams[team].bp[t.req]) return tr('พิมพ์เขียว ', 'Blueprint: ') + BP[t.req].name;
  const miss = t.needs.find(k => !hasBld(team, k));
  return miss ? tr('ต้องมี', 'Needs ') + T[miss].name : '';
}
export function canBuild(team: number, type: TypeKey) {
  const tm = S.teams[team]; return unlocked(team, type) && tm.credits >= T[type].cost && tm.queue.length < 5;
}
export function queueUnit(team: number, type: TypeKey) {
  if (!canBuild(team, type)) return false;
  const tm = S.teams[team]; tm.credits -= T[type].cost; tm.queue.push({ type, left: T[type].time }); return true;
}
export function production(team: number, dt: number) {
  const tm = S.teams[team], q = tm.queue[0]; if (!q) return;
  // อาคารผลิตถูกทำลายระหว่างคิว: หยุดรอจนกว่าจะสร้างใหม่
  const from = T[q.type].from, src = S.ents.find(e => e.team === team && e.type === from && e.hp > 0 && !(e.build > 0));
  if (!src) return;
  q.left -= dt; if (q.left > 0) return; tm.queue.shift();
  const s = team === 0 ? 1 : -1;
  const u = spawn(q.type, team, src.x + (src.t.r + 16) * s, src.y - (src.t.r + 16) * s);
  u.mx = src.x + (src.t.r + 90 + Math.random() * 60) * s; u.my = src.y - (src.t.r + 80 + Math.random() * 60) * s;
  if (team === 0) msg(T[q.type].name + tr(' พร้อมรบ', ' ready'), '#8fd0ff');
}

// ---------- งานวิจัยอัปเกรดอาวุธที่ Lab ----------
// ข้อความ "วิจัยแล้ว" ใช้เทียบใน UI ด้วย
export const RESEARCHED = () => tr('วิจัยแล้ว', 'Researched');
export function researchReason(team: number, k: UpgKey) {
  const tm = S.teams[team];
  if (tm.done[k]) return upg(team, k) ? RESEARCHED() : tr('พิมพ์เขียวถูกขโมย', 'Blueprint stolen');
  if (!tm.bp[k]) return tr('ต้องมีพิมพ์เขียว', 'Needs blueprint');
  if (!hasBld(team, 'lab')) return tr('ต้องมีห้องแล็บ', 'Needs Lab');
  if (tm.res) return tm.res.key === k ? tr('กำลังวิจัย', 'Researching') : tr('แล็บไม่ว่าง', 'Lab busy');
  return '';
}
export function canResearch(team: number, k: UpgKey) {
  return researchReason(team, k) === '' && S.teams[team].credits >= UPG[k].cost;
}
export function startResearch(team: number, k: UpgKey) {
  if (!canResearch(team, k)) return false;
  const tm = S.teams[team]; tm.credits -= UPG[k].cost; tm.res = { key: k, left: UPG[k].time };
  if (team === 0) msg(tr('เริ่มวิจัย ', 'Researching ') + BP[k].name, '#8fd0ff');
  return true;
}
export function research(team: number, dt: number) {
  const tm = S.teams[team], r = tm.res; if (!r) return;
  if (!hasBld(team, 'lab')) return; // Lab ถูกทำลาย งานวิจัยค้างไว้
  r.left -= dt; if (r.left > 0) return;
  tm.res = null; tm.done[r.key] = true;
  if (r.key === 'nano') for (const e of S.ents) if (e.team === team && !e.t.bld) {
    const f = e.hp / e.maxhp; e.maxhp = e.t.hp * hpMul(team, e.t); e.hp = e.maxhp * f;
  }
  msg(team === 0 ? tr('วิจัย' + BP[r.key].name + 'เสร็จ! อาวุธอัปเกรดแล้ว', BP[r.key].name + ' researched! Weapons upgraded') : tr('⚠ ศัตรูวิจัย' + BP[r.key].name + 'เสร็จ', '⚠ Enemy researched ' + BP[r.key].name), team === 0 ? '#3ff0d8' : '#ff8a7a');
  if (team === 0) hooks.researched(r.key);
}

// ---------- สิ่งก่อสร้าง ----------
export function canPlace(team: number, type: TypeKey) { return unlocked(team, type) && S.teams[team].credits >= T[type].cost }
export function validPlace(team: number, type: TypeKey, x: number, y: number) {
  const r = T[type].r, p = { x, y };
  if (x < r + 10 || y < r + 10 || x > W - r - 10 || y > H - r - 10) return false;
  if (!S.ents.some(e => e.team === team && e.t.bld && dist(e, p) < 380)) return false;
  for (const e of S.ents) if (e.hp > 0 && dist(e, p) < r + e.t.r + 6) return false;
  for (const q of S.ruins) if (dist(q, p) < q.r + r + 40) return false;
  for (const o of S.ores) if (o.amt > 0 && dist(o, p) < r + 10) return false;
  return true;
}
export function placeBuilding(team: number, type: TypeKey, x: number, y: number) {
  if (!canPlace(team, type) || !validPlace(team, type, x, y)) return false;
  const t = T[type]; S.teams[team].credits -= t.cost;
  const b = spawn(type, team, x, y); b.build = b.buildMax = t.time; b.hp = b.maxhp * .3; return true;
}
