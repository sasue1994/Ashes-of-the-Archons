import { tr } from './i18n';
import { AI_LEVELS, T, UPG_KEYS, type AiLevel, type TypeKey } from './data';
import { canResearch, placeBuilding, queueUnit, startResearch, unlocked } from './production';
import { awake, dropoff, strike } from './ruins';
import { S, dist, msg, rand, type Ent, type Pt, type Ruin, type Team } from './state';

// ---------- enemy AI (team 1) ----------
const ai = { save: null as TypeKey | null, t: 0, wave: 5, escort: null as Ruin | null, respond: null as Ruin | null, hunt: null as Ent | null, time: 0 };
const HOME = { x: 2900, y: 300 };
const P = () => AI_LEVELS[S.level];

// เริ่มแมตช์ด้วยระดับที่เลือก
export function startMatch(level: AiLevel) {
  S.level = level; S.started = true; ai.wave = P().wave; S.teams[1].credits += P().startBonus;
  msg(tr('เริ่มเกม · AI ระดับ ', 'Game start · AI ') + P().name, P().col);
}

function go(units: Ent[], p: Pt, spread: number) {
  for (const a of units) { a.mx = p.x + (Math.random() - .5) * spread; a.my = p.y + (Math.random() - .5) * spread; a.amove = true; a.target = null }
}

function aiBuild(tm: Team) {
  const my = S.ents.filter(e => e.team === 1 && e.t.bld), cnt = (k: TypeKey) => my.filter(e => e.type === k).length;
  let pick: TypeKey | null = null;
  // สร้างฐานตามลำดับแบบ RA2: ค่ายทหาร → โรงงานรถ → (ได้พิมพ์เขียวแล้ว) Lab → อื่นๆ
  if (!cnt('barracks')) pick = 'barracks';
  else if (!cnt('factory')) pick = 'factory';
  else if (Object.keys(tm.bp).length && !cnt('lab')) pick = 'lab';
  else if (cnt('ref') < 2 && ai.time > 150) pick = 'ref';
  else if (tm.bp.dome && cnt('dome') < 1) pick = 'dome';
  else if (tm.bp.pylon && cnt('pylon') < 3) pick = 'pylon';
  else if (cnt('turret') < 2 + P().turrets && ai.time > 240) pick = 'turret';
  ai.save = pick; if (!pick || tm.credits < T[pick].cost) return;
  const hq = my.find(e => e.type === 'hq'); if (!hq) return;
  for (let i = 0; i < 25; i++) {
    const a = Math.PI * (.5 + Math.random()), d = 120 + Math.random() * 220;
    if (placeBuilding(1, pick, hq.x + Math.cos(a) * d, hq.y + Math.sin(a) * d)) { ai.save = null; return }
  }
}

export function aiUpdate(dt: number) {
  const tm = S.teams[1]; tm.credits += P().income * dt; ai.time += dt; ai.t -= dt; if (ai.t > 0) return; ai.t = P().think;
  const mine = S.ents.filter(e => e.team === 1 && !e.t.bld && e.hp > 0), army = mine.filter(e => e.t.dmg);
  const rigs = mine.filter(e => e.type === 'rig'), freeRigs = rigs.filter(e => !e.carry);
  const hq0 = S.ents.find(e => e.team === 0 && e.type === 'hq');
  aiBuild(tm);
  if (P().research) for (const k of UPG_KEYS) if (canResearch(1, k) && (!ai.save || tm.credits >= T[ai.save].cost + 800)) startResearch(1, k);
  if (tm.queue.length < P().queue) {
    let pick: TypeKey | null;
    if (mine.filter(e => e.type === 'harv').length < P().harvs && unlocked(1, 'harv')) pick = 'harv';
    else if (!freeRigs.length && !tm.queue.some(q => q.type === 'rig')) pick = 'rig';
    else if (army.length + tm.queue.length >= P().armyMax) pick = null; // ทัพเต็มเพดานของระดับนี้
    else { const o = P().units.filter(k => unlocked(1, k)); pick = o.length ? rand(o) : 'rifle' }
    if (pick && (!ai.save || army.length < 4 || tm.credits >= T[ai.save].cost + T[pick].cost)) queueUnit(1, pick);
  }

  // 1) ผู้เล่นกำลังถอดรหัส → ยกทัพไปขัด
  const hot = S.ruins.find(r => r.active && r.team === 0);
  if (P().respond && hot && hot !== ai.respond && army.length >= 3) { ai.respond = hot; msg(tr('⚠ ศัตรูกำลังยกทัพมาที่ ' + hot.R.name + '!', '⚠ Enemy army heading to ' + hot.R.name + '!'), '#ff8a7a'); go(army, hot, 120) }
  if (!hot) ai.respond = null;

  // 2) Rig ผู้เล่นขน Data Core → แบ่งทัพครึ่งหนึ่งไปดัก เฉพาะตอนที่ยังไกลฐานผู้เล่นและทัพเราไปทัน
  const home0 = dropoff(0), cx = army.reduce((s, a) => s + a.x, 0) / (army.length || 1), cy = army.reduce((s, a) => s + a.y, 0) / (army.length || 1);
  const carrier = S.ents.find(e => e.team === 0 && e.carry && e.hp > 0 && (!home0 || dist(e, home0) > 600) && Math.hypot(e.x - cx, e.y - cy) < P().hunt);
  if (carrier && army.length >= 3) {
    if (ai.hunt !== carrier) { ai.hunt = carrier; msg(tr('⚠ ศัตรูกำลังไล่ล่ารถถอดรหัสที่ขนแกนข้อมูล!', '⚠ Enemy is hunting your Data Core Rig!'), '#ff8a7a') }
    const hunters = [...army].sort((a, b) => dist(a, carrier) - dist(b, carrier)).slice(0, Math.ceil(army.length / 2));
    go(hunters, carrier, 40);
  } else ai.hunt = null;

  // 3) มีของหล่นในสนาม → ส่ง Rig ว่างไปเก็บ พร้อมทหารคุ้มกัน
  if (P().pickup && S.items.length && freeRigs.length) {
    const rig = freeRigs[0], it = S.items.reduce((a, b) => dist(a, rig) < dist(b, rig) ? a : b);
    if (rig.mx == null || Math.hypot(rig.mx - it.x, rig.my - it.y) > 20) { rig.mx = it.x; rig.my = it.y }
    go(army.filter(e => e.mx == null && !e.target).slice(0, 4), it, 100);
  }

  // 4) กองทัพว่างครบคลื่น → ถอดรหัสซากที่ตื่นแล้ว / แย่งจุดยึด / บุกฐาน
  const idle = army.filter(e => e.mx == null && !e.target);
  if (idle.length >= ai.wave) {
    const need = { outpost: 0, monolith: 8, citadel: 12 };
    const open = S.ruins.filter(r => awake(r) && !r.spent && army.length >= need[r.kind]);
    const theirs = S.ruins.filter(r => r.spent && r.owner !== 1);
    const near = (rs: Ruin[]) => rs.reduce((a, b) => dist(a, HOME) < dist(b, HOME) ? a : b);
    const roll = Math.random();
    if (open.length && roll < .6) { const o = near(open); ai.escort = o; go(idle, o, 140) }
    else if (theirs.length && roll < .8) go(idle, near(theirs), 100);
    else if (hq0 && ai.time >= P().grace) {
      const vault = S.ents.find(e => e.team === 0 && e.type === 'vault');
      const owned = Object.keys(S.teams[0].bp).length + (S.teams[0].sw ? 2 : 0);
      go(idle, vault && owned >= 2 && Math.random() < .6 ? vault : hq0, 160);
      ai.wave = Math.min(P().waveMax, ai.wave + P().waveStep); msg(tr('⚠ ตรวจพบกองทัพศัตรูมุ่งหน้าสู่ฐาน!', '⚠ Enemy army approaching your base!'), '#ff8a7a');
    }
  }

  // 5) คุ้มกันซากที่กำลังเล็ง: ผู้พิทักษ์ตายหมดแล้วส่ง Rig เข้าวง
  const r = ai.escort;
  if (r) {
    if (r.spent) ai.escort = null;
    else if (!r.guards.some(g => g.hp > 0))
      for (const g of freeRigs) if (g.mx == null && dist(g, r) > r.r * .7) { g.mx = r.x + (Math.random() - .5) * 60; g.my = r.y + (Math.random() - .5) * 60 }
  }
  if (tm.sw && tm.sw.charge >= tm.sw.need) {
    const tg = hq0 || S.ents.find(e => e.team === 0 && e.t.bld);
    if (tg) strike(1, tg.x, tg.y);
  }
}
