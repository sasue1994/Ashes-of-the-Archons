import { CARRY_SPEED } from './data';
import { S, dist, hooks, upg, type Ent } from './state';

export const hostile = (a: Ent, b: Ent) => a.team !== b.team;

export function nearestHostile(e: Ent, range: number) {
  let best: Ent | null = null, bd = 1e9;
  for (const o of S.ents) {
    if (o.hp <= 0 || !hostile(e, o)) continue;
    const d = dist(e, o) - o.t.r; if (d < range && d < bd) { bd = d; best = o }
  }
  return best;
}
export function moveToward(e: Ent, x: number, y: number, dt: number, stop = 4) {
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy); if (d <= stop + .5) return true;
  const s = Math.min(e.t.speed * (e.carry ? CARRY_SPEED : 1) * dt, d - stop); e.x += dx / d * s; e.y += dy / d * s; e.ang = Math.atan2(dy, dx); return false;
}
export function damage(tg: Ent, amt: number, src: Ent | null) {
  if (tg.team < 2 && S.domes.some(d => d.team === tg.team && dist(d, tg) < d.t.aura)) amt *= .5;
  tg.hp -= amt;
  if (src && src.hp > 0 && tg.t.dmg && !tg.target && (tg.mx == null || tg.amove) && !tg.ret) tg.target = src;
}
const boosted = (e: Ent) => upg(e.team, 'rounds') && (e.type === 'rifle' || e.type === 'tank');
// ตัวคูณดาเมจตามชนิดเป้า (เช่น จรวดแรงกับเกราะ อ่อนกับทหารราบ)
const vsMul = (src: Ent, tg: Ent) => tg.t.kind === 'inf' ? src.t.vsInf : tg.t.kind === 'veh' || tg.t.bld ? src.t.vsArmor : 1;
export function fire(e: Ent, tg: Ent) {
  const t = e.t; e.cd = t.rof; e.ang = Math.atan2(tg.y - e.y, tg.x - e.x);
  const dmg = t.dmg * (boosted(e) ? 1.3 : 1);
  hooks.sfx(t.missile ? 'missile' : t.splash ? 'artillery' : t.beam ? 'beam' : t.kind === 'inf' ? 'rifle' : 'cannon', e.x, e.y);
  if (t.missile) {
    // ยิงจรวดจากแท่นซ้าย/ขวา ทำดาเมจตอนระเบิดถึงเป้า
    const nx = -Math.sin(e.ang), ny = Math.cos(e.ang);
    for (let i = 0; i < t.missile; i++) {
      const side = t.missile > 1 ? (i / (t.missile - 1) - .5) * 8 : 0;
      S.shots.push({ x: e.x + nx * side + Math.cos(e.ang) * 6, y: e.y + ny * side + Math.sin(e.ang) * 6, tx: tg.x, ty: tg.y, tg, src: e, team: e.team, dmg, splash: t.splash,
        ang: e.ang + (i - (t.missile - 1) / 2) * .5, puff: 0, life: 3 });
    }
    return;
  }
  if (t.splash) {
    for (const o of S.ents) if (o.hp > 0 && hostile(e, o) && dist(o, tg) < t.splash + o.t.r) damage(o, dmg, e);
    S.fx.push({ k: 'shell', x1: e.x, y1: e.y, x2: tg.x, y2: tg.y, ttl: .45, max: .45, col: e.team === 2 ? '#3ff0d8' : '#ffb14d' });
    S.fx.push({ k: 'boom', x: tg.x, y: tg.y, r: t.splash, ttl: .4, max: .4 });
  } else {
    damage(tg, dmg, e);
    const col = t.beam ? (e.team === 2 ? '#ffcf5a' : '#7ffcff') : boosted(e) ? '#9ffcff' : e.team === 2 ? '#3ff0d8' : '#ffe28a';
    S.fx.push({ k: t.beam ? 'beam' : 'shot', x1: e.x, y1: e.y, x2: tg.x, y2: tg.y, ttl: t.beam ? .35 : .1, max: t.beam ? .35 : .1, col });
  }
}

// ---------- จรวด: บินเลี้ยวเข้าหาเป้า ทิ้งควัน ระเบิดเป็นวง ----------
const ROCKET_SPEED = 430, TURN = 7;
export function shotsUpdate(dt: number) {
  for (const m of S.shots) {
    if (m.tg && m.tg.hp > 0) { m.tx = m.tg.x; m.ty = m.tg.y }
    const want = Math.atan2(m.ty - m.y, m.tx - m.x);
    let da = want - m.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    m.ang += Math.max(-TURN * dt, Math.min(TURN * dt, da));
    m.x += Math.cos(m.ang) * ROCKET_SPEED * dt; m.y += Math.sin(m.ang) * ROCKET_SPEED * dt; m.life -= dt;
    m.puff -= dt; if (m.puff <= 0) { m.puff = .03; S.fx.push({ k: 'puff', x: m.x - Math.cos(m.ang) * 6, y: m.y - Math.sin(m.ang) * 6, r: 3, ttl: .55, max: .55 }) }
    if (Math.hypot(m.tx - m.x, m.ty - m.y) > 10 && m.life > 0) continue;
    m.done = true;
    for (const o of S.ents) if (o.hp > 0 && o.team !== m.team && dist(o, { x: m.tx, y: m.ty }) < m.splash + o.t.r) damage(o, m.dmg * vsMul(m.src, o), m.src);
    S.fx.push({ k: 'boom', x: m.tx, y: m.ty, r: m.splash * .9, ttl: .45, max: .45 }); hooks.sfx('boom', m.tx, m.ty);
  }
  S.shots = S.shots.filter(m => !m.done);
}
