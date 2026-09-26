import { tr } from '../sim/i18n';
import { cam, panBy, toScreen, toWorld, zoomAt } from '../render/camera';
import { BUILD, T, type TypeKey } from '../sim/data';
import { seen } from '../sim/fog';
import { placeBuilding, queueUnit } from '../sim/production';
import { strike } from '../sim/ruins';
import { S, msg, type Ent, type Pt } from '../sim/state';

// สถานะการควบคุมของผู้เล่น (ไม่ใช่ส่วนของ sim)
export type Mode = null | 'amove' | 'strike' | 'place';
export const ctl = { mode: null as Mode, placeType: 'ref' as TypeKey };
export const mouse = { x: 0, y: 0, in: false, drag: false, sx: 0, sy: 0 };
const keys: Record<string, boolean> = {};

export const selected = () => S.ents.filter(e => e.sel && e.hp > 0);
export const world = (): Pt => toWorld(mouse.x, mouse.y);
// หายูนิตใต้จุดที่คลิก: วัดระยะบนจอ ทั้งจากฐานบนพื้นและจากกลางลำตัว (ยูนิตมีความสูง คลิกโดนหัวก็ต้องเลือกได้)
function entAt(p: Pt, f: (e: Ent) => boolean, pad = 6) {
  let best: Ent | null = null, bd = 1e9; const s = toScreen(p.x, p.y);
  for (const e of S.ents) {
    if (e.hp <= 0 || !f(e)) continue;
    const a = toScreen(e.x, e.y), b = toScreen(e.x, e.y, e.t.bld ? 18 : 10);
    const d = Math.min(Math.hypot(a.x - s.x, a.y - s.y), Math.hypot(b.x - s.x, b.y - s.y));
    if (d < (e.t.r + pad) * cam.zoom && d < bd) { bd = d; best = e }
  }
  return best;
}
function order(p: Pt, amove: boolean) {
  const s = selected(); if (!s.length) return; const cols = Math.ceil(Math.sqrt(s.length));
  s.forEach((e, i) => {
    e.mx = p.x + (i % cols - (cols - 1) / 2) * 30; e.my = p.y + (Math.floor(i / cols) - (cols - 1) / 2) * 30;
    e.amove = amove; e.target = null; e.forced = false; e.state = null;
  });
  S.fx.push({ k: 'ping', x: p.x, y: p.y, ttl: .5, max: .5, col: amove ? '#ff6b6b' : '#7dff9a' });
}

// ---------- คำสั่งที่ใช้ร่วมกันระหว่างเมาส์ คีย์บอร์ด และจอสัมผัส ----------
export function startPlace(type: TypeKey) { ctl.mode = 'place'; ctl.placeType = type; closeDrawer() }
export function startStrike() { ctl.mode = 'strike'; closeDrawer() }
export const selectArmy = () => { for (const e of S.ents) e.sel = e.team === 0 && !!e.t.dmg && !e.t.bld };
export const stopSelected = () => { for (const e of selected()) { e.mx = null; e.target = null; e.forced = false; e.amove = false } };
export const clearSelection = () => { for (const e of S.ents) e.sel = false; ctl.mode = null };
export const startAmove = () => { if (selected().length) ctl.mode = 'amove' };

// คลิกซ้าย/แตะ ขณะอยู่ในโหมดพิเศษ; คืน true ถ้าจัดการแล้ว
function modeAction(p: Pt) {
  if (ctl.mode === 'strike') { strike(0, p.x, p.y); ctl.mode = null; return true }
  if (ctl.mode === 'amove') { order(p, true); ctl.mode = null; return true }
  if (ctl.mode === 'place') {
    if (placeBuilding(0, ctl.placeType, p.x, p.y)) { ctl.mode = null; msg(tr('เริ่มก่อสร้าง ', 'Building ') + T[ctl.placeType].name, '#8fd0ff') }
    else msg(tr('วางตรงนี้ไม่ได้ ต้องอยู่ใกล้ฐาน และไม่ทับสิ่งอื่น', "Can't build here. Must be near your base and not overlapping"), '#ff8a7a');
    return true;
  }
  return false;
}
// คลิกขวา / แตะพื้นหรือศัตรูขณะเลือกยูนิตอยู่: โจมตีหรือเดิน
function command(p: Pt, pad = 6) {
  const tg = entAt(p, e => e.team !== 0 && seen(e), pad);
  if (tg) { for (const e of selected()) if (e.t.dmg) { e.target = tg; e.forced = true; e.mx = null; e.amove = false } }
  else order(p, false);
}
// เลือกด้วยกรอบ (พิกัดจอ)
function boxSelect(sx: number, sy: number, ex: number, ey: number) {
  const x0 = Math.min(sx, ex), x1 = Math.max(sx, ex), y0 = Math.min(sy, ey), y1 = Math.max(sy, ey);
  for (const e of S.ents) e.sel = false;
  if (x1 - x0 < 5 && y1 - y0 < 5) { const e = entAt(toWorld(x0, y0), e => e.team === 0 && !e.t.bld); if (e) e.sel = true }
  else for (const e of S.ents) {
    if (e.team !== 0 || e.t.bld) continue;
    const p = toScreen(e.x, e.y, 8); if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) e.sel = true;
  }
}
const onScreen = (e: Ent) => { const p = toScreen(e.x, e.y); return p.x > 0 && p.y > 0 && p.x < cam.sw && p.y < cam.sh };

export function initInput(cv: HTMLCanvasElement) {
  // มือถือ/แท็บเล็ต (หรือบังคับด้วย ?touch ในที่อยู่ ไว้ทดสอบบนคอม)
  if (matchMedia('(pointer: coarse)').matches || /[?&]touch/.test(location.search)) enableTouchUI();
  const mpos = (ev: MouseEvent) => { const b = cv.getBoundingClientRect(); mouse.x = ev.clientX - b.left; mouse.y = ev.clientY - b.top };
  addEventListener('keydown', ev => {
    if ((ev.target as HTMLElement)?.tagName === 'INPUT') return; // กำลังพิมพ์ชื่อ ไม่ใช่สั่งเกม
    const k = ev.key.toLowerCase(); keys[ev.key] = true;
    if (k === 'a') startAmove();
    if (k === 's') stopSelected();
    if (k === 'q') selectArmy();
    if (k === 'escape') ctl.mode = null;
    if (k >= '1' && k <= '9' && BUILD[+k - 1]) queueUnit(0, BUILD[+k - 1]);
    if (ev.key.startsWith('Arrow')) ev.preventDefault();
  });
  addEventListener('keyup', ev => { keys[ev.key] = false });
  cv.addEventListener('contextmenu', ev => ev.preventDefault());
  cv.addEventListener('mouseenter', () => mouse.in = true);
  cv.addEventListener('mouseleave', () => mouse.in = false);
  cv.addEventListener('mousemove', ev => { mpos(ev); mouse.in = true });
  // ล้อเมาส์ = ซูม · ปุ่มกลางลาก = เลื่อนแผนที่
  cv.addEventListener('wheel', ev => { ev.preventDefault(); mpos(ev); zoomAt(mouse.x, mouse.y, ev.deltaY < 0 ? 1.12 : 1 / 1.12) }, { passive: false });
  let pan: { x: number; y: number } | null = null;
  addEventListener('mousemove', ev => { if (pan) { panBy(ev.clientX - pan.x, ev.clientY - pan.y); pan = { x: ev.clientX, y: ev.clientY } } });
  addEventListener('mouseup', ev => { if (ev.button === 1) pan = null });
  cv.addEventListener('mousedown', ev => {
    mpos(ev); const p = world();
    if (ev.button === 1) { ev.preventDefault(); pan = { x: ev.clientX, y: ev.clientY }; return }
    if (ev.button === 0) { if (modeAction(p)) return; mouse.drag = true; mouse.sx = mouse.x; mouse.sy = mouse.y }
    if (ev.button === 2) { if (ctl.mode) { ctl.mode = null; return } command(p) }
  });
  addEventListener('mouseup', ev => {
    if (ev.button !== 0 || !mouse.drag) return; mouse.drag = false;
    boxSelect(mouse.sx, mouse.sy, mouse.x, mouse.y);
  });
  initTouch(cv);
}

// ---------- จอสัมผัส ----------
// แตะยูนิตเรา = เลือก (แตะซ้ำเร็วๆ = เลือกชนิดเดียวกันทั้งจอ) · แตะพื้น/ศัตรู = เดิน/โจมตี
// ลากนิ้วเดียว = เลื่อนแผนที่ · กดค้าง 0.35 วิ แล้วลาก = ตีกรอบเลือก · สองนิ้ว = เลื่อน + บีบซูม
// โหมดวางอาคาร/ยิงซูเปอร์เวพอน: ลากเพื่อเล็ง ปล่อยนิ้วเพื่อยืนยัน
const LONG_PRESS = 350, MOVE_TOL = 12, TOUCH_PAD = 14;
function initTouch(cv: HTMLCanvasElement) {
  const pts = new Map<number, { x: number; y: number }>();
  let one: { id: number; sx: number; sy: number; moved: boolean; box: boolean; timer: number } | null = null;
  let lastTap = { t: 0, id: -1 };
  const local = (ev: PointerEvent) => { const b = cv.getBoundingClientRect(); return { x: ev.clientX - b.left, y: ev.clientY - b.top } };
  cv.style.touchAction = 'none';
  // กันเบราว์เซอร์จำลองเมาส์หลังแตะ (จะทำให้คำสั่งซ้ำ)
  cv.addEventListener('touchstart', ev => ev.preventDefault(), { passive: false });

  cv.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'touch') return;
    enableTouchUI();
    if (drawerOpen()) { closeDrawer(); return }
    const p = local(ev); pts.set(ev.pointerId, p);
    if (pts.size > 1) { if (one) { clearTimeout(one.timer); mouse.drag = false } one = null; return } // เริ่มใช้สองนิ้ว
    mouse.x = p.x; mouse.y = p.y;
    one = { id: ev.pointerId, sx: p.x, sy: p.y, moved: false, box: false, timer: 0 };
    if (!ctl.mode) one.timer = window.setTimeout(() => {
      if (!one || one.moved) return;
      one.box = true; mouse.drag = true; mouse.sx = one.sx; mouse.sy = one.sy; navigator.vibrate?.(15);
    }, LONG_PRESS);
  });
  cv.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'touch' || !pts.has(ev.pointerId)) return;
    const p = local(ev), prev = pts.get(ev.pointerId)!;
    if (pts.size > 1) {
      const [a0, b0] = [...pts.values()]; pts.set(ev.pointerId, p); const [a1, b1] = [...pts.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      panBy((p.x - prev.x) / pts.size, (p.y - prev.y) / pts.size);
      if (d0 > 0) zoomAt((a1.x + b1.x) / 2, (a1.y + b1.y) / 2, d1 / d0);
      return;
    }
    pts.set(ev.pointerId, p);
    if (!one || one.id !== ev.pointerId) return;
    mouse.x = p.x; mouse.y = p.y;
    if (ctl.mode === 'place' || ctl.mode === 'strike') return; // ลากเพื่อเล็ง
    if (one.box) return;
    if (!one.moved && Math.hypot(p.x - one.sx, p.y - one.sy) > MOVE_TOL) { one.moved = true; clearTimeout(one.timer) }
    if (one.moved) panBy(p.x - prev.x, p.y - prev.y);
  });
  const end = (ev: PointerEvent) => {
    if (ev.pointerType !== 'touch' || !pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    if (!one || one.id !== ev.pointerId) return;
    const o = one; one = null; clearTimeout(o.timer);
    if (ev.type === 'pointercancel') { mouse.drag = false; return }
    const p = local(ev); mouse.x = p.x; mouse.y = p.y;
    if (o.box) { mouse.drag = false; boxSelect(o.sx, o.sy, p.x, p.y); return }
    if (ctl.mode === 'place' || ctl.mode === 'strike') { modeAction(world()); return }
    if (!o.moved) tap(world(), ev.timeStamp);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  function tap(p: Pt, now: number) {
    if (modeAction(p)) return;
    const mine = entAt(p, e => e.team === 0 && !e.t.bld, TOUCH_PAD);
    if (mine) {
      const dbl = now - lastTap.t < 320 && lastTap.id === mine.id;
      for (const e of S.ents) e.sel = false;
      if (dbl) {
        // แตะซ้ำ = เลือกยูนิตชนิดเดียวกันที่อยู่บนจอทั้งหมด
        for (const e of S.ents) if (e.team === 0 && e.type === mine.type && onScreen(e)) e.sel = true;
      } else mine.sel = true;
      lastTap = { t: now, id: mine.id };
      return;
    }
    if (selected().length) command(p, TOUCH_PAD);
  }

  // ปุ่มลอยบนจอ + ลิ้นชักแผงคำสั่ง
  const act: Record<string, () => void> = {
    menu: () => document.body.classList.toggle('side-open'),
    all: selectArmy, amove: startAmove, stop: stopSelected, clear: clearSelection,
    full: () => {
      const d = document as Document & { webkitFullscreenElement?: Element };
      if (document.fullscreenElement || d.webkitFullscreenElement) { document.exitFullscreen?.(); return }
      document.documentElement.requestFullscreen?.().then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => {});
    },
  };
  document.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.addEventListener('click', () => act[b.dataset.act!]?.()));
}
// เปิดหน้าตาแบบจอสัมผัส (แผงข้างถูกย้ายออกจาก layout จอเกมปรับขนาดเองผ่าน ResizeObserver)
function enableTouchUI() {
  if (document.body.classList.contains('touch')) return;
  document.body.classList.add('touch');
}
const drawerOpen = () => document.body.classList.contains('side-open');
function closeDrawer() { document.body.classList.remove('side-open') }

export function scrollCam(dt: number) {
  const s = 900 * dt;
  if (keys.ArrowLeft || (mouse.in && mouse.x < 12)) panBy(s, 0);
  if (keys.ArrowRight || (mouse.in && mouse.x > cam.sw - 12)) panBy(-s, 0);
  if (keys.ArrowUp || (mouse.in && mouse.y < 12)) panBy(0, s);
  if (keys.ArrowDown || (mouse.in && mouse.y > cam.sh - 12)) panBy(0, -s);
}
