import { track } from '../analytics';
import { cam, centerOn } from '../render/camera';
import { fogCanvas, modelIcon } from '../render/scene3d';
import { AI_LEVELS, BP, BP_KEYS, BUILD, CAT, H, PLACE, T, TEAM_COL, TIER_COL, UPG, UPG_KEYS, W, applyDataLang, type AiLevel, type BPKey, type TypeKey, type UpgKey } from '../sim/data';
import { startMatch } from '../sim/ai';
import { cellAt, exp, seen } from '../sim/fog';
import { i18n, tr, type Lang } from '../sim/i18n';
import { RESEARCHED, canBuild, canPlace, canResearch, lockReason, queueUnit, researchReason, startResearch } from '../sim/production';
import { awake, grantBP, holdIncome, wakeText } from '../sim/ruins';
import { S, hooks, msg } from '../sim/state';
import { sfx } from '../audio/sound';
import { ctl, startPlace, startStrike } from './input';

const $ = (id: string) => document.getElementById(id)!;
const btnEls = {} as Record<TypeKey, HTMLButtonElement>, bbtnEls = {} as Record<TypeKey, HTMLButtonElement>, rbtnEls = {} as Record<UpgKey, HTMLButtonElement>;
const tag = (k: BPKey) => '<span class="tag" style="background:' + CAT[BP[k].cat].c + '">' + CAT[BP[k].cat].n + '</span>';
const sec = () => tr(' วิ', 's');

function showBP() {
  const tm = S.teams[0], box = $('bp'), o = $('bpopts'); o.innerHTML = '';
  const of = tm.offers[0]; if (!of) { box.style.display = 'none'; return }
  box.style.display = 'block';
  const more = tm.offers.length > 1 ? tr(' (รออีก ' + (tm.offers.length - 1) + ')', ' (+' + (tm.offers.length - 1) + ' waiting)') : '';
  $('bptitle').textContent = tr('เลือกพิมพ์เขียว T', 'Choose a blueprint T') + of.tier + more;
  for (const k of of.keys) {
    const b = document.createElement('button');
    b.innerHTML = tag(k) + '<b>' + BP[k].name + '</b><small style="color:#cfd8e3">' + BP[k].desc + '</small>';
    b.onclick = () => { grantBP(0, k); tm.offers.shift(); showBP(); sfx('chime'); msg(tr('ติดตั้ง' + BP[k].name + 'แล้ว', BP[k].name + ' installed'), '#3ff0d8') };
    o.appendChild(b);
  }
}
function uiOwned() {
  const ks = BP_KEYS.filter(k => S.teams[0].bp[k]);
  $('owned').innerHTML = ks.length ? ks.map(k => tag(k) + 'T' + BP[k].tier + ' ' + BP[k].name).join('<br>') : '-';
}
// ---------- ปุ่มผลิต/สร้าง: รูป + ชื่อ + บทบาท + ราคา ----------
// รูปบนปุ่มเรนเดอร์จากโมเดล 3D ตัวเดียวกับในเกม (ครั้งเดียวแล้วแคชเป็น data URL)
const iconCache = new Map<TypeKey, string>();
function icon(k: TypeKey) {
  let u = iconCache.get(k); if (u) return u;
  u = trim(modelIcon(k, TEAM_COL[0])).toDataURL(); iconCache.set(k, u); return u;
}
// ตัดขอบโปร่งใสรอบภาพออก รูปบนปุ่มจะได้เต็มกรอบ
function trim(src: HTMLCanvasElement) {
  const w = src.width, h = src.height, d = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < x0) return src;
  const c = document.createElement('canvas'); c.width = x1 - x0 + 3; c.height = y1 - y0 + 3;
  c.getContext('2d')!.drawImage(src, x0 - 1, y0 - 1, c.width, c.height, 0, 0, c.width, c.height); return c;
}
// อาคารนี้ทำให้ผลิตยูนิตอะไรได้ (โชว์รูปเล็กบนปุ่มอาคาร)
const makes = (k: TypeKey) => BUILD.filter(u => T[u].from === k || (k === 'lab' && T[u].needs.includes('lab')));
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e };
function makeBtn(k: TypeKey, i?: number) {
  const t = T[k], b = el('button', 'ubtn'); b.title = i18n.lang === 'en' ? '' : t.en;
  const img = el('img', 'ico'); img.src = icon(k); img.alt = '';
  // เลขปุ่มลัดแยกเป็น span ไว้ซ่อนบนจอสัมผัส
  const name = el('b'); if (i != null) name.append(el('span', 'hk', (i + 1) + '. ')); name.append(t.name);
  const box = el('span', 'bt'); box.append(name, el('em', '', t.role));
  const cost = el('small', 'cost', '$' + t.cost);
  const mk = makes(k);
  if (mk.length) {
    const row = el('span', 'makes'); row.append(el('span', 'ml', tr('ผลิต:', 'Makes:')));
    for (const u of mk) { const m = el('img'); m.src = icon(u); m.alt = T[u].name; m.title = T[u].name; row.appendChild(m) }
    box.appendChild(row);
  }
  // .pg = แถบความคืบหน้าของยูนิตที่กำลังผลิตอยู่ (ที่ขอบล่างของปุ่ม)
  b.append(img, box, cost, el('i', 'qn'), el('i', 'pg')); return b;
}
function btnLabel(b: HTMLButtonElement, k: TypeKey, ok: boolean) {
  // บรรทัดที่สอง: บทบาท หรือ เหตุผลที่ยังสร้างไม่ได้ (สีแดง)
  const t = T[k], why = lockReason(0, k), s = b.querySelector('em')!, txt = why ? '🔒 ' + why : t.role;
  b.classList.toggle('lock', !!why); b.classList.toggle('off', !ok);
  if (s.textContent !== txt) s.textContent = txt;
  const n = S.teams[0].queue.filter(q => q.type === k).length, qn = b.querySelector('.qn')!, qt = n ? '×' + n : '';
  if (qn.textContent !== qt) qn.textContent = qt;
}
// เหตุผลที่กดไม่ได้ บอกผู้เล่นแทนการกดแล้วเงียบ
function whyNot(k: TypeKey, unit: boolean) {
  const why = lockReason(0, k); if (why) return why;
  const tm = S.teams[0], c = T[k].cost;
  if (tm.credits < c) return tr('เงินไม่พอ ขาดอีก $', 'Not enough money, need $') + Math.ceil(c - tm.credits) + tr('', ' more');
  if (unit && tm.queue.length >= 5) return tr('คิวผลิตเต็ม (สูงสุด 5)', 'Queue full (max 5)');
  return '';
}
const flash = (b: HTMLElement) => { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 250) };

// สร้างปุ่มผลิต/สร้าง/วิจัยใหม่ทั้งหมด (เรียกตอนเริ่มและตอนเปลี่ยนภาษา)
function buildButtons() {
  $('btns').innerHTML = ''; $('bbtns').innerHTML = ''; $('rbtns').innerHTML = '';
  BUILD.forEach((k, i) => {
    const b = makeBtn(k, i); $('btns').appendChild(b); btnEls[k] = b;
    b.onclick = () => { if (queueUnit(0, k)) { flash(b); sfx('click') } else sfx('error'), msg(tr('ผลิต' + T[k].name + 'ไม่ได้: ', "Can't train " + T[k].name + ': ') + whyNot(k, true), '#ff8a7a') };
  });
  PLACE.forEach(k => {
    const b = makeBtn(k); $('bbtns').appendChild(b); bbtnEls[k] = b;
    b.onclick = () => {
      if (canPlace(0, k)) { startPlace(k); msg(tr('แตะหรือคลิกบนแผนที่ใกล้ฐานเพื่อวาง', 'Tap or click near your base to place ') + T[k].name, '#8fd0ff') }
      else sfx('error'), msg(tr('สร้าง' + T[k].name + 'ไม่ได้: ', "Can't build " + T[k].name + ': ') + whyNot(k, false), '#ff8a7a');
    };
  });
  UPG_KEYS.forEach(k => {
    const b = document.createElement('button'); $('rbtns').appendChild(b); rbtnEls[k] = b;
    b.onclick = () => { if (!startResearch(0, k)) sfx('error'), msg(tr('วิจัย' + BP[k].name + 'ไม่ได้: ', "Can't research " + BP[k].name + ': ') + (researchReason(0, k) || tr('เงินไม่พอ ต้องใช้ $', 'Not enough money, costs $') + UPG[k].cost), '#ff8a7a') };
  });
}

// ---------- หน้า login แบบ Guest + เลือกระดับ AI ----------
// ชื่อผู้เล่นแบบ Guest: ไม่มีบัญชีหรือ server เก็บชื่อไว้ใน localStorage ของเบราว์เซอร์นี้เท่านั้น
export const player = { name: '' };
const store = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ไม่มี storage */ } } };
const cleanName = (s: string) => s.replace(/[<>"'&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
let chosen: AiLevel | null = null;
function lvlLabel() { if (!chosen) return; const L = AI_LEVELS[chosen], lv = $('lvl'); lv.textContent = player.name + ' · AI ' + L.name; lv.style.color = L.col }
function buildLevels() {
  const last = store.get('archon.level'), box = $('lvls'); box.innerHTML = '';
  for (const k of Object.keys(AI_LEVELS) as AiLevel[]) {
    const L = AI_LEVELS[k], b = document.createElement('button');
    b.style.setProperty('--c', L.col); if (k === (last || 'normal')) b.className = 'last';
    b.innerHTML = '<span style="color:' + L.col + '">AI ' + L.name + '</span><small>' + L.desc + '</small>';
    b.onclick = () => { store.set('archon.level', k); chosen = k; startMatch(k); track('game_start', { level: k }); $('start').classList.add('hide'); lvlLabel() };
    box.appendChild(b);
  }
}
function initStart() {
  const inp = $('gname') as HTMLInputElement;
  inp.value = store.get('archon.name') || '';
  const login = () => {
    player.name = cleanName(inp.value) || 'Guest-' + String(Math.floor(1000 + Math.random() * 9000));
    store.set('archon.name', player.name); inp.blur();
    $('hello').textContent = player.name; $('login').classList.add('hide'); $('lvlstep').classList.remove('hide');
  };
  $('guestBtn').onclick = login;
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') login() });
  $('rename').onclick = () => { $('lvlstep').classList.add('hide'); $('login').classList.remove('hide'); inp.focus() };
  buildLevels();
}

// ---------- เปลี่ยนภาษา ----------
// ข้อความใน index.html: เนื้อหาเดิมเป็นไทย ส่วน data-en เป็นอังกฤษ (เก็บภาษาไทยไว้ใน data-th ครั้งแรกที่สลับ)
function applyHtmlLang() {
  const en = i18n.lang === 'en';
  document.querySelectorAll<HTMLElement>('[data-en]').forEach(e => { if (e.dataset.th == null) e.dataset.th = e.innerHTML; e.innerHTML = en ? e.dataset.en! : e.dataset.th });
  document.querySelectorAll<HTMLInputElement>('[data-en-ph]').forEach(e => { if (e.dataset.thPh == null) e.dataset.thPh = e.placeholder; e.placeholder = en ? e.dataset.enPh! : e.dataset.thPh });
  document.querySelectorAll<HTMLElement>('[data-en-title]').forEach(e => { if (e.dataset.thTitle == null) e.dataset.thTitle = e.title; e.title = en ? e.dataset.enTitle! : e.dataset.thTitle });
  document.querySelectorAll<HTMLElement>('.langBtn').forEach(b => b.textContent = en ? 'ไทย' : 'EN');
  document.documentElement.lang = i18n.lang;
}
export function setLang(l: Lang) {
  i18n.lang = l; store.set('archon.lang', l);
  applyDataLang(); applyHtmlLang(); buildButtons(); buildLevels(); showBP(); uiOwned(); lvlLabel(); hudUpdate();
}

export function initHud() {
  const saved = store.get('archon.lang');
  i18n.lang = saved === 'en' ? 'en' : 'th';
  applyDataLang(); applyHtmlLang();
  document.querySelectorAll<HTMLElement>('.langBtn').forEach(b => b.onclick = () => setLang(i18n.lang === 'en' ? 'th' : 'en'));
  initStart(); buildButtons();
  $('swbtn').onclick = startStrike;
  $('again').onclick = () => location.reload();
  hooks.offer = showBP; hooks.bpChanged = uiOwned;
  hooks.gameOver = r => {
    sfx(r === 'VICTORY' ? 'win' : 'lose');
    const o = $('over'), d = $('overtxt'); o.style.display = 'flex';
    d.textContent = r === 'VICTORY' ? tr('ชนะ!', 'VICTORY') : tr('พ่ายแพ้', 'DEFEAT'); d.style.color = r === 'VICTORY' ? '#3fd9c1' : '#ff6b7a';
  };
  const mm = $('mini') as HTMLCanvasElement;
  const nav = (ev: MouseEvent) => { const b = mm.getBoundingClientRect(); centerOn((ev.clientX - b.left) / b.width * W, (ev.clientY - b.top) / b.height * H) };
  // pointer events: ใช้ได้ทั้งเมาส์และนิ้ว (ลากต่อได้แม้ลากออกนอกกรอบ)
  let dragging = false;
  mm.addEventListener('pointerdown', ev => { if (ev.button > 0) return; mm.setPointerCapture(ev.pointerId); dragging = true; nav(ev) });
  mm.addEventListener('pointermove', ev => { if (dragging) nav(ev) });
  const stop = () => { dragging = false };
  mm.addEventListener('pointerup', stop); mm.addEventListener('pointercancel', stop);
  mm.addEventListener('contextmenu', ev => ev.preventDefault());
  uiOwned();
}

// ส่วน HTML อัปเดตทุก 0.15 วิ พอ ไม่ต้องทุกเฟรม
export function hudUpdate() {
  const tm = S.teams[0], cr = String(Math.floor(tm.credits)); $('cred').textContent = cr;
  document.querySelector('[data-act=box]')?.classList.toggle('on', ctl.mode === 'box');
  const q = tm.queue[0], qp = q ? (100 * (1 - q.left / T[q.type].time)) + '%' : '0';
  $('qname').textContent = q ? T[q.type].name + (tm.queue.length > 1 ? ' (+' + (tm.queue.length - 1) + ')' : '') : '-';
  $('qbar').style.width = qp;
  // จอสัมผัส: เงิน + การผลิตแสดงบนจอเกมตลอด ไม่ต้องเปิดแผงคำสั่ง
  $('tcred').textContent = '$' + cr; $('tqbar').style.width = qp;
  $('tqn').textContent = tm.queue.length ? '⚙' + tm.queue.length : '';
  BUILD.forEach(k => {
    btnLabel(btnEls[k], k, canBuild(0, k));
    (btnEls[k].querySelector('.pg') as HTMLElement).style.width = q && q.type === k ? qp : '0';
  });
  PLACE.forEach(k => btnLabel(bbtnEls[k], k, canPlace(0, k)));
  // งานวิจัยที่ห้องแล็บ
  const r = tm.res;
  $('rname').textContent = r ? BP[r.key].name + ' ' + Math.ceil(r.left) + sec() : '-';
  $('rbar').style.width = r ? (100 * (1 - r.left / UPG[r.key].time)) + '%' : '0';
  UPG_KEYS.forEach(k => {
    const b = rbtnEls[k], why = researchReason(0, k), fin = why === RESEARCHED();
    b.className = why && !fin ? 'lock' : ''; b.classList.toggle('off', !canResearch(0, k));
    const html = BP[k].name + '<small>' + (fin ? '✓ ' + RESEARCHED() : why ? '🔒 ' + why : '$' + UPG[k].cost + ' · ' + UPG[k].time + sec()) + '</small>';
    if (b.innerHTML !== html) b.innerHTML = html;
  });
  const sw = $('sw');
  if (tm.sw) {
    sw.style.display = 'block'; $('swbar').style.width = Math.min(100, 100 * tm.sw.charge / tm.sw.need) + '%';
    ($('swbtn') as HTMLButtonElement).disabled = tm.sw.charge < tm.sw.need;
  }
  $('msgs').innerHTML = S.msgs.map(m => '<div style="color:' + m.col + ';opacity:' + Math.min(1, m.t) + '">' + m.text + '</div>').join('');
  // แผงมุมขวาบน: ซูเปอร์เวพอนศัตรู, ซากที่กำลังจะตื่น, รายได้จากซากที่ยึด
  const esw = S.teams[1].sw, e = $('esw'), lines: string[] = [];
  if (esw) lines.push(tr('⚠ ลำแสงวงโคจรศัตรู: ', '⚠ Enemy Orbital Strike: ') + Math.max(0, Math.ceil(esw.need - esw.charge)) + sec());
  const seenWake = new Set<string>();
  for (const r of S.ruins) if (!awake(r) && !seenWake.has(r.kind)) { seenWake.add(r.kind); lines.push('<span style="color:' + r.R.col + '">◆ ' + r.R.name + tr(' ตื่นใน ', ' wakes in ') + wakeText(r) + '</span>') }
  const inc = holdIncome(0); if (inc) lines.push('<span style="color:#ffd166">⛏ ' + tr('ซากที่ยึด +$' + inc + '/วิ', 'Ruin income +$' + inc + '/s') + '</span>');
  e.style.display = lines.length ? 'block' : 'none'; e.style.textAlign = 'right';
  const html = lines.join('<br>'); if (e.innerHTML !== html) e.innerHTML = html;
}

export function drawMini(now: number) {
  const mm = $('mini') as HTMLCanvasElement, g = mm.getContext('2d')!, sx = mm.width / W, sy = mm.height / H;
  g.fillStyle = '#3a352d'; g.fillRect(0, 0, mm.width, mm.height);
  for (const o of S.ores) if (o.amt > 0) { g.fillStyle = o.kind === 'xen' ? '#b67bff' : '#ffd166'; g.fillRect(o.x * sx, o.y * sy, 1.5, 1.5) }
  for (const r of S.ruins) if (exp[cellAt(r.x, r.y)] || r.active) {
    const rad = 2 + r.R.tier * 2;
    if (r.spent && r.owner >= 0) { g.fillStyle = TEAM_COL[r.owner]; g.globalAlpha = .6; g.beginPath(); g.arc(r.x * sx, r.y * sy, rad, 0, 7); g.fill(); g.globalAlpha = 1 }
    g.strokeStyle = r.active && now % 1 < .5 ? '#fff' : r.R.col; g.lineWidth = r.active ? 2 : 1.5;
    g.setLineDash(awake(r) ? [] : [2, 2]); g.beginPath(); g.arc(r.x * sx, r.y * sy, rad, 0, 7); g.stroke(); g.setLineDash([]);
  }
  // ของหล่นและรถถอดรหัสที่ขนของ: กะพริบ ทุกฝ่ายเห็น
  const blink = now % .8 < .4;
  for (const it of S.items) { g.fillStyle = blink ? '#fff' : TIER_COL[it.tier]; g.fillRect(it.x * sx - 2.5, it.y * sy - 2.5, 5, 5) }
  for (const c of S.ents) if (c.carry) { g.strokeStyle = blink ? '#fff' : TIER_COL[c.carry.tier]; g.lineWidth = 2; g.beginPath(); g.arc(c.x * sx, c.y * sy, 5, 0, 7); g.stroke() }
  for (const e of S.ents) if (seen(e)) { g.fillStyle = TEAM_COL[e.team]; const s = e.t.bld ? 4 : 2.5; g.beginPath(); g.arc(e.x * sx, e.y * sy, s / 2 + .5, 0, 7); g.fill() }
  g.imageSmoothingEnabled = true; g.drawImage(fogCanvas, 0, 0, mm.width, mm.height);
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(cam.x * sx, cam.y * sy, cam.w * sx, cam.h * sy, 3); g.stroke();
}
