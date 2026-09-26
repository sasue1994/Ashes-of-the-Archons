import { H, W } from './data';
import { fire, moveToward, nearestHostile } from './combat';
import { S, dist, done, type Ent, type Ore } from './state';

function oreValue(team: number, o: Ore) { return o.kind === 'xen' ? 3 : S.teams[team].bp.transmuter ? 2 : 1 }

function harvest(e: Ent, dt: number) {
  const tm = S.teams[e.team];
  if (e.mx != null) { if (moveToward(e, e.mx, e.my, dt)) e.mx = null; return }
  const refs = S.ents.filter(o => o.team === e.team && o.type === 'ref' && done(o)); if (!refs.length) return;
  const ref = refs.reduce((a, b) => dist(a, e) < dist(b, e) ? a : b), load = e.lo + e.lx;
  if (load >= 200 || e.state === 'ret') {
    e.state = 'ret';
    if (moveToward(e, ref.x, ref.y, dt, ref.t.r + e.t.r + 10)) {
      const v = Math.round(e.lo * (tm.bp.transmuter ? 2 : 1) + e.lx * 3); tm.credits += v;
      if (e.team === 0 && v > 0) S.fx.push({ k: 'txt', x: ref.x, y: ref.y - ref.t.r, text: '+$' + v, col: e.lx > 0 ? '#c98bff' : '#ffd35a', ttl: 1.4, max: 1.4 });
      e.lo = e.lx = 0; e.state = null;
    }
    return;
  }
  let o = e.ore;
  if (!o || o.amt <= 0 || (o.kind === 'xen' && !tm.bp.scanner)) {
    o = null; let bd = 0;
    for (const p of S.ores) if (p.amt > 0 && (p.kind === 'ore' || tm.bp.scanner)) {
      const rate = oreValue(e.team, p) / ((2 * dist(p, ref) + dist(p, e)) / e.t.speed + 5);
      if (rate > bd) { bd = rate; o = p }
    }
    e.ore = o;
  }
  if (!o) { if (load > 0) e.state = 'ret'; return }
  if (moveToward(e, o.x, o.y, dt, 14)) {
    const g = Math.min(40 * dt, o.amt, 200 - load); o.amt -= g;
    if (o.kind === 'xen') e.lx += g; else e.lo += g;
  }
}

export function unitUpdate(e: Ent, dt: number) {
  const t = e.t;
  if (e.type === 'harv') return harvest(e, dt);
  if (e.team === 2) {
    if (e.ret) { if (moveToward(e, e.home.x, e.home.y, dt)) e.ret = false; return }
    if (dist(e, e.home) > 260) { e.ret = true; e.target = null; return }
    if (!e.target) e.hp = Math.min(e.maxhp, e.hp + 6 * dt);
  }
  if (e.target && e.target.hp <= 0) { e.target = null; e.forced = false }
  const moving = e.mx != null;
  if (t.dmg && !e.target && (!moving || e.amove)) e.target = nearestHostile(e, e.team === 2 ? t.range + 30 : moving ? t.range : t.sight);
  if (e.target) {
    const d = dist(e, e.target) - e.target.t.r;
    if (d <= t.range) { if (e.cd <= 0) fire(e, e.target); else e.ang = Math.atan2(e.target.y - e.y, e.target.x - e.x); return }
    if (t.fixed) { e.target = null; return }
    if (e.forced || !moving || e.amove) { moveToward(e, e.target.x, e.target.y, dt); return }
    e.target = null;
  }
  if (e.mx != null) {
    if (moveToward(e, e.mx, e.my, dt)) { e.mx = null; e.amove = false; return }
    // กันยูนิตดันกันค้างรอบจุดหมาย
    const dd = Math.hypot(e.mx - e.x, e.my - e.y);
    if (e.lastD != null && e.lastD - dd < t.speed * dt * .3) {
      e.stuck += dt; if (e.stuck > 1 && dd < 90) { e.mx = null; e.amove = false; e.stuck = 0 }
    } else e.stuck = 0;
    e.lastD = dd;
  }
}

export function turretUpdate(e: Ent) {
  if (e.target && (e.target.hp <= 0 || dist(e, e.target) - e.target.t.r > e.t.range)) e.target = null;
  if (!e.target) e.target = nearestHostile(e, e.t.range);
  if (e.target && e.cd <= 0) fire(e, e.target);
}

const solid = (e: Ent) => e.t.bld || e.t.fixed;
export function separate() {
  const u = S.ents.filter(e => e.hp > 0);
  for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
    const a = u[i], b = u[j], sa = solid(a), sb = solid(b); if (sa && sb) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, m = a.t.r + b.t.r; if (d >= m) continue;
    const p = m - d, nx = dx / d, ny = dy / d;
    if (sa) { b.x += nx * p; b.y += ny * p }
    else if (sb) { a.x -= nx * p; a.y -= ny * p }
    else { a.x -= nx * p / 2; a.y -= ny * p / 2; b.x += nx * p / 2; b.y += ny * p / 2 }
  }
  for (const e of u) { e.x = Math.max(10, Math.min(W - 10, e.x)); e.y = Math.max(10, Math.min(H - 10, e.y)) }
}
