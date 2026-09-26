import { tr } from './i18n';
import { BP, BP_KEYS, CAPTURE_TIME, RUIN, VAULT_DROP, WAKE_WARN, type BPKey, type RuinKind, type TypeKey } from './data';
import { S, dist, done, hooks, hpMul, msg, rand, spawn, type Cargo, type Ent, type Ruin } from './state';

// ---------- archeology ----------
// ซากแต่ละแห่งถอดรหัสได้ครั้งเดียว:
//   หลับ (wake > 0) → ตื่น มีผู้พิทักษ์ → ถอดรหัส → Rig ได้ Data Core ต้องขนกลับฐาน
//   → ซากกลายเป็นจุดยึด ให้รายได้ต่อเนื่องกับฝ่ายที่ครอบครอง (แย่งกันได้)
function ring(r: Ruin, type: TypeKey, n: number, rad: number) {
  for (let i = 0; i < n; i++) { const a = i * 6.28 / n + .4; r.guards.push(spawn(type, 2, r.x + Math.cos(a) * rad, r.y + Math.sin(a) * rad)) }
}
function guardRuin(r: Ruin) {
  r.guards = [];
  if (r.kind === 'outpost') ring(r, 'sentinel', 3, 60);
  else if (r.kind === 'monolith') { r.guards.push(spawn('obelisk', 2, r.x, r.y)); ring(r, 'sentinel', 4, 75) }
  else { r.guards.push(spawn('warden', 2, r.x, r.y)); ring(r, 'sentinel', 4, 110) }
}
export function addRuin(kind: RuinKind, x: number, y: number) {
  const R = RUIN[kind];
  const r: Ruin = {
    kind, R, x, y, r: R.r, need: R.need, prog: 0, team: -1, wake: R.wake, warned: false,
    spent: false, active: false, contested: false, announced: false, guards: [], owner: -1, cap: 0, capTeam: -1,
  };
  if (r.wake <= 0) guardRuin(r);
  S.ruins.push(r); return r;
}
export const awake = (r: Ruin) => r.wake <= 0;
const mmss = (s: number) => { const t = Math.ceil(s); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') };
export const wakeText = (r: Ruin) => mmss(Math.max(0, r.wake));

export function ruinsUpdate(dt: number) {
  for (const r of S.ruins) {
    r.active = false; r.contested = false;
    if (r.wake > 0) {
      r.wake -= dt;
      if (!r.warned && r.wake <= WAKE_WARN) { r.warned = true; msg(tr('⏳ ' + r.R.name + ' จะตื่นในอีก ' + WAKE_WARN + ' วินาที เตรียมทัพ!', '⏳ ' + r.R.name + ' awakens in ' + WAKE_WARN + 's. Get ready!'), r.R.col) }
      if (r.wake <= 0) { r.wake = 0; guardRuin(r); msg(tr('✦ ' + r.R.name + ' ตื่นแล้ว! ผู้พิทักษ์ปรากฏตัว', '✦ ' + r.R.name + ' has awakened! Guardians appear'), r.R.col) }
      continue;
    }
    if (r.spent) { holdUpdate(r, dt); continue }
    decryptUpdate(r, dt);
  }
}

function decryptUpdate(r: Ruin, dt: number) {
  const guards = r.guards.some(g => g.hp > 0 && dist(g, r) < r.r + 120);
  const rigT = new Set<number>(), armed = new Set<number>();
  for (const e of S.ents) {
    if (e.hp <= 0 || e.team === 2 || dist(e, r) > r.r) continue;
    if (e.type === 'rig' && !e.carry && (e.mx == null || Math.hypot(e.mx - r.x, e.my - r.y) < r.r)) rigT.add(e.team);
    if (e.t.dmg && !e.t.bld) armed.add(e.team);
  }
  if (rigT.size === 0) { r.prog = Math.max(0, r.prog - dt * .3); if (r.prog === 0) r.announced = false; return }
  r.active = true;
  const team = [...rigT][0];
  r.contested = rigT.size > 1 || guards || [...armed].some(x => x !== team);
  if (!r.announced) {
    r.announced = true;
    msg(team === 0 ? tr('เริ่มถอดรหัส ' + r.R.name, 'Decrypting ' + r.R.name) : tr('⚠ ตรวจพบสัญญาณโบราณ! ศัตรูกำลังถอดรหัส ' + r.R.name, '⚠ Ancient signal! Enemy is decrypting ' + r.R.name), team === 0 ? r.R.col : '#ff8a7a');
  }
  if (r.contested) return;
  if (r.team !== team && r.prog > 0) { r.prog = Math.max(0, r.prog - dt * 2); return }
  r.team = team; r.prog += dt;
  if (r.prog >= r.need) completeRuin(r, team);
}

function completeRuin(r: Ruin, team: number) {
  r.prog = 0; r.announced = false; r.spent = true; r.owner = team; r.cap = 0; r.capTeam = -1;
  const rigs = S.ents.filter(e => e.team === team && e.type === 'rig' && !e.carry && e.hp > 0 && dist(e, r) <= r.r);
  const rig = rigs.sort((a, b) => dist(a, r) - dist(b, r))[0];
  const cargo: Cargo = { tier: r.R.tier };
  if (rig) { rig.carry = cargo; sendHome(rig) } else S.items.push({ x: r.x, y: r.y, ...cargo });
  msg(team === 0 ? tr('✦ ถอดรหัส ' + r.R.name + ' สำเร็จ! คุ้มกันรถถอดรหัสขนแกนข้อมูล T' + cargo.tier + ' กลับฐาน', '✦ ' + r.R.name + ' decrypted! Escort the Rig carrying Data Core T' + cargo.tier + ' home')
    : tr('⚠ ศัตรูได้แกนข้อมูล T' + cargo.tier + ' กำลังขนกลับฐาน สกัดไว้!', '⚠ Enemy got Data Core T' + cargo.tier + ' and is carrying it home. Intercept!'), team === 0 ? r.R.col : '#ff8a7a');
}

// หลังถอดรหัสแล้ว: ยืนในวงฝ่ายเดียวครบ CAPTURE_TIME วินาที = ยึดได้, ผู้ครอบครองได้เงินต่อเนื่อง
function holdUpdate(r: Ruin, dt: number) {
  const here = new Set<number>();
  for (const e of S.ents) if (e.hp > 0 && e.team < 2 && !e.t.bld && dist(e, r) <= r.r) here.add(e.team);
  r.contested = here.size > 1;
  if (here.size === 1) {
    const t = [...here][0];
    if (t !== r.owner) {
      if (r.capTeam !== t) { r.capTeam = t; r.cap = 0 }
      r.cap += dt;
      if (r.cap >= CAPTURE_TIME) {
        const prev = r.owner; r.owner = t; r.cap = 0; r.capTeam = -1;
        msg(t === 0 ? tr('ยึด ' + r.R.name + ' ได้แล้ว!', r.R.name + ' captured!') : prev === 0 ? tr('⚠ ศัตรูแย่ง ' + r.R.name + ' ไปแล้ว!', '⚠ Enemy took ' + r.R.name + '!') : tr('⚠ ศัตรูยึด ' + r.R.name, '⚠ Enemy captured ' + r.R.name), t === 0 ? r.R.col : '#ff8a7a');
      }
    } else r.cap = Math.max(0, r.cap - dt);
  } else if (here.size === 0) r.cap = Math.max(0, r.cap - dt * .5);
  if (r.owner === 0 || r.owner === 1) S.teams[r.owner].credits += r.R.income * dt;
}
export const holdIncome = (team: number) => S.ruins.reduce((s, r) => s + (r.spent && r.owner === team ? r.R.income : 0), 0);
export const holdsCitadel = (team: number) => S.ruins.some(r => r.kind === 'citadel' && r.spent && r.owner === team);

// ---------- ขนข้อมูลกลับฐาน ----------
// จุดส่ง: Archive Vault ถ้ายังอยู่ ไม่อย่างนั้นใช้ Construction Yard
export function dropoff(team: number): Ent | undefined {
  const bs = S.ents.filter(e => e.team === team && e.hp > 0 && done(e) && (e.type === 'vault' || e.type === 'hq'));
  return bs.find(e => e.type === 'vault') || bs[0];
}
export function sendHome(e: Ent) { const d = dropoff(e.team); if (d) { e.mx = d.x + (d.x > e.x ? -1 : 1) * (d.t.r + 18); e.my = d.y } }

export function cargoUpdate() {
  for (const e of S.ents) {
    if (e.type !== 'rig' || e.hp <= 0) continue;
    if (e.carry) {
      const d = dropoff(e.team);
      if (d && dist(e, d) <= d.t.r + e.t.r + 24) { const c = e.carry; e.carry = null; deliver(e.team, c) }
      continue;
    }
    const it = S.items.find(i => dist(i, e) < e.t.r + 16); if (!it) continue;
    S.items.splice(S.items.indexOf(it), 1);
    e.carry = { tier: it.tier, key: it.key }; sendHome(e);
    const name = it.key ? tr('พิมพ์เขียว ', 'blueprint ') + BP[it.key].name : tr('แกนข้อมูล T', 'Data Core T') + it.tier;
    msg(e.team === 0 ? tr('เก็บ' + name + 'ได้! ขนกลับฐาน', 'Picked up ' + name + '! Bring it home') : tr('⚠ ศัตรูเก็บ' + name + 'ไป!', '⚠ Enemy picked up ' + name + '!'), e.team === 0 ? '#3ff0d8' : '#ff8a7a');
  }
}
// Rig ที่ขนของถูกทำลาย / Vault แตก: ของหล่นให้ใครก็ได้มาเก็บ
export function onDeath(e: Ent) {
  if (e.carry) {
    S.items.push({ x: e.x, y: e.y, ...e.carry });
    msg(e.team === 0 ? tr('⚠ รถถอดรหัสถูกทำลาย! แกนข้อมูลหล่นกลางสนาม', '⚠ Rig destroyed! Data Core dropped on the field') : tr('รถถอดรหัสศัตรูถูกทำลาย! ส่งรถถอดรหัสไปเก็บแกนข้อมูล', 'Enemy Rig destroyed! Send a Rig to grab the Data Core'), e.team === 0 ? '#ff8a7a' : '#3ff0d8');
  }
  if (e.type === 'vault' && e.team < 2) {
    const tm = S.teams[e.team], owned = BP_KEYS.filter(k => tm.bp[k]);
    for (let i = 0; i < VAULT_DROP && owned.length; i++) {
      const k = owned.splice(Math.floor(Math.random() * owned.length), 1)[0]; revokeBP(e.team, k);
      S.items.push({ x: e.x + (Math.random() - .5) * 90, y: e.y + (Math.random() - .5) * 90, tier: BP[k].tier, key: k });
    }
    if (tm.sw) { tm.sw = null; S.items.push({ x: e.x, y: e.y + 40, tier: 3 }) }
    msg(e.team === 0 ? tr('⚠ คลังพิมพ์เขียวถูกทำลาย! พิมพ์เขียวหล่นกระจาย รีบเก็บคืน!', '⚠ Archive Vault destroyed! Blueprints scattered, recover them!') : tr('ทำลายคลังพิมพ์เขียวศัตรูได้! พิมพ์เขียวหล่นให้เก็บ', 'Enemy Archive Vault destroyed! Grab the blueprints'), e.team === 0 ? '#ff5a4d' : '#3ff0d8');
  }
}

function deliver(team: number, c: Cargo) {
  const tm = S.teams[team];
  if (c.key) {
    if (!tm.bp[c.key]) { grantBP(team, c.key); msg(team === 0 ? tr('ได้พิมพ์เขียว ' + BP[c.key].name + ' คืนมา', 'Recovered blueprint ' + BP[c.key].name) : tr('⚠ ศัตรูได้พิมพ์เขียว ' + BP[c.key].name, '⚠ Enemy got blueprint ' + BP[c.key].name), team === 0 ? '#3ff0d8' : '#ff8a7a') }
    else tm.credits += 800;
    return;
  }
  if (c.tier === 3) {
    tm.sw = { charge: 0, need: 120, warned: false };
    msg(team === 0 ? tr('แกนโบราณถึงฐานแล้ว! ลำแสงวงโคจรกำลังชาร์จ', 'Relic Core secured! Orbital Strike charging') : tr('⚠ ศัตรูได้แกนโบราณ! ซูเปอร์เวพอนกำลังชาร์จ', '⚠ Enemy has the Relic Core! Superweapon charging'), team === 0 ? '#ff5ad2' : '#ff5a4d');
    return;
  }
  const offer = makeOffer(team, c.tier), cash = c.tier === 2 ? RUIN.monolith.cash : RUIN.outpost.cash;
  if (!offer.length) { tm.credits += cash; if (team === 0) msg(tr('ถอดรหัสข้อมูลได้เงิน +$', 'Data decoded for +$') + cash, '#ffd35a'); return }
  if (team === 0) { tm.offers.push({ tier: c.tier, keys: offer }); hooks.offer(); msg(tr('แกนข้อมูลถึงฐานแล้ว! เลือกพิมพ์เขียว', 'Data Core delivered! Choose a blueprint'), '#3ff0d8') }
  else { const k = rand(offer); grantBP(1, k); msg(tr('⚠ ศัตรูได้พิมพ์เขียว ', '⚠ Enemy got blueprint ') + BP[k].name, '#ff8a7a') }
}

function makeOffer(team: number, tier: number) {
  const tm = S.teams[team];
  let pool = BP_KEYS.filter(k => BP[k].tier === tier && !tm.bp[k]);
  if (!pool.length && tier === 2) pool = BP_KEYS.filter(k => BP[k].tier === 1 && !tm.bp[k]);
  const out: BPKey[] = [];
  for (const c of ['W', 'B', 'R'] as const) { const p = pool.filter(k => BP[k].cat === c); if (p.length) out.push(rand(p)) }
  for (const k of pool) if (out.length < 3 && !out.includes(k)) out.push(k);
  return out;
}
function refreshHp(team: number) {
  for (const e of S.ents) if (e.team === team && !e.t.bld) { const f = e.hp / e.maxhp; e.maxhp = e.t.hp * hpMul(team, e.t); e.hp = e.maxhp * f }
}
export function grantBP(team: number, k: BPKey) {
  const tm = S.teams[team]; if (tm.bp[k]) return; tm.bp[k] = true;
  if (k === 'nano') refreshHp(team);
  if (team === 0) hooks.bpChanged();
}
export function revokeBP(team: number, k: BPKey) {
  const tm = S.teams[team]; if (!tm.bp[k]) return; delete tm.bp[k];
  if (k === 'nano') refreshHp(team);
  if (team === 0) hooks.bpChanged();
}

// ---------- superweapon ----------
export function strike(team: number, x: number, y: number) {
  const tm = S.teams[team]; if (!tm.sw || tm.sw.charge < tm.sw.need) return;
  tm.sw.charge = 0; tm.sw.warned = false;
  S.strikes.push({ x, y, t: 1.4, team }); S.fx.push({ k: 'target', x, y, ttl: 1.4, max: 1.4 });
  msg(team === 0 ? tr('ยิงลำแสงวงโคจรแล้ว!', 'Orbital Strike fired!') : tr('⚠ ศัตรูยิงลำแสงวงโคจร!', '⚠ Enemy Orbital Strike incoming!'), team === 0 ? '#ff5ad2' : '#ff5a4d');
}
export function strikesUpdate(dt: number) {
  for (const s of S.strikes) {
    s.t -= dt; if (s.t > 0) continue;
    s.done = true; S.fx.push({ k: 'orbital', x: s.x, y: s.y, ttl: 1.2, max: 1.2 });
    for (const e of S.ents) if (e.hp > 0 && e.team !== s.team && dist(e, s) < 160 + e.t.r) e.hp -= 1800;
  }
  S.strikes = S.strikes.filter(s => !s.done);
}
