import { tr } from './i18n';
import { aiUpdate } from './ai';
import { computeFog } from './fog';
import { production, research } from './production';
import { CITADEL_SW_BOOST } from './data';
import { cargoUpdate, holdsCitadel, onDeath, ruinsUpdate, strikesUpdate } from './ruins';
import { S, done, hooks, msg } from './state';
import { shotsUpdate } from './combat';
import { separate, turretUpdate, unitUpdate } from './units';

// หนึ่งก้าวของ simulation (ไม่มีการวาดใดๆ)
export function update(dt: number) {
  production(0, dt); production(1, dt); research(0, dt); research(1, dt);
  S.teams.forEach((tm, i) => { if (tm.sw && tm.sw.charge < tm.sw.need) {
    tm.sw.charge += dt * (holdsCitadel(i) ? CITADEL_SW_BOOST : 1);
    if (tm.sw.charge >= tm.sw.need && !tm.sw.warned) {
      tm.sw.warned = true; const me = tm === S.teams[0];
      msg(me ? tr('ลำแสงวงโคจรพร้อมยิง!', 'Orbital Strike ready!') : tr('⚠ ซูเปอร์เวพอนศัตรูพร้อมยิง!', '⚠ Enemy superweapon ready!'), me ? '#ff5ad2' : '#ff5a4d');
    }
  } });
  S.domes = S.ents.filter(e => e.type === 'dome' && done(e) && e.hp > 0);
  aiUpdate(dt);
  for (const e of S.ents) {
    if (e.hp <= 0) continue; e.cd -= dt;
    if (e.build > 0) {
      e.build -= dt; e.hp = Math.min(e.maxhp, e.hp + e.maxhp * .7 * dt / e.buildMax);
      if (e.build <= 0 && e.team === 0) msg(e.t.name + tr(' สร้างเสร็จแล้ว', ' complete'), '#8fd0ff');
      continue;
    }
    if (e.t.bld) { if (e.t.dmg) turretUpdate(e) } else unitUpdate(e, dt);
  }
  separate(); shotsUpdate(dt); ruinsUpdate(dt); cargoUpdate(); strikesUpdate(dt);
  for (const e of S.ents) if (e.hp <= 0 && !e.dead) { e.dead = true; onDeath(e); S.fx.push({ k: 'boom', x: e.x, y: e.y, r: e.t.r * 2, ttl: .6, max: .6 }) }
  S.ents = S.ents.filter(e => !e.dead);
  for (const f of S.fx) f.ttl -= dt; S.fx = S.fx.filter(f => f.ttl > 0);
  for (const m of S.msgs) m.t -= dt; S.msgs = S.msgs.filter(m => m.t > 0);
  const hq = [0, 1].map(t => S.ents.some(e => e.team === t && e.type === 'hq'));
  if (!S.over) {
    if (!hq[1]) S.over = 'VICTORY'; else if (!hq[0]) S.over = 'DEFEAT';
    if (S.over) hooks.gameOver(S.over);
  }
  computeFog();
}
