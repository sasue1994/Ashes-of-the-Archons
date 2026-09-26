import { tr } from '../sim/i18n';
import { Application, CanvasSource, Container, Graphics, Sprite, Text, Texture, TilingSprite, type TextStyleOptions } from 'pixi.js';
import { CAPTURE_TIME, CELL, GH, GW, H, T, TEAM_COL, W } from '../sim/data';
import { cellAt, exp, seen, vis } from '../sim/fog';
import { validPlace } from '../sim/production';
import { awake, wakeText } from '../sim/ruins';
import { S, done, type Ent, type Fx, type Item, type Ruin } from '../sim/state';
import { ctl, mouse, world } from '../ui/input';
import { cam } from './camera';
import * as spr from './sprites';

const FONT = '"Chakra Petch", system-ui, "Segoe UI", Tahoma, sans-serif', DARK = '#0b0d10';
const labelStyle = (size = 12): TextStyleOptions => ({ fontFamily: FONT, fontSize: size, fontWeight: 'bold', fill: '#fff', stroke: { color: DARK, width: 4, join: 'round' } });
const sprite = (t: Texture, ax = .5, ay = .5) => { const s = new Sprite(t); s.anchor.set(ax, ay); return s };
const layer = (parent: Container) => parent.addChild(new Container());

// ---------- เลเยอร์ ----------
const root = new Container(), world_ = layer(root), screen = layer(root);
const ground = layer(world_), decoL = layer(world_), oreL = layer(world_), itemL = layer(world_), auraL = layer(world_), ruinL = layer(world_);
const entL = layer(world_); entL.sortableChildren = true;
const fxG = world_.addChild(new Graphics()), barG = world_.addChild(new Graphics()), txtL = layer(world_);
const fogL = layer(world_), labelL = layer(world_), ghostL = layer(world_);
const uiG = screen.addChild(new Graphics());
const cursorTxt = screen.addChild(new Text({ text: '', style: labelStyle() })); cursorTxt.anchor.set(.5, 0);

// หมอก: ภาพเล็ก GW×GH (1 พิกเซล = 1 ช่อง) ยืดให้เต็มแผนที่ ได้ขอบนุ่มจาก linear filter ฟรีๆ
export const fogCanvas = document.createElement('canvas'); fogCanvas.width = GW; fogCanvas.height = GH;
const fctx = fogCanvas.getContext('2d')!, fimg = fctx.createImageData(GW, GH);
for (let i = 0; i < GW * GH; i++) { fimg.data[i * 4] = 8; fimg.data[i * 4 + 1] = 9; fimg.data[i * 4 + 2] = 11 }
const fogTex = new Texture({ source: new CanvasSource({ resource: fogCanvas }) });

// ---------- ตัวแสดงผลของยูนิตแต่ละตัว ----------
interface View {
  root: Container; body: Container; sel: Sprite;
  rot?: Container; gun?: Container; cargo?: Graphics; cargoV?: number; orbs?: Sprite[]; glow?: Sprite; aura?: Sprite;
  core?: Sprite; coreKey?: string; // Data Core ที่ Rig ขนอยู่ ลอยเหนือหัว
}
const views = new Map<Ent, View>();

function makeView(e: Ent): View {
  const t = e.t, c = TEAM_COL[e.team], r = t.r, root = new Container(), body = new Container();
  const sel = sprite(spr.selRing()); sel.scale.set((r + 6) / 32); sel.y = r * .55;
  const v: View = { root, body, sel };
  if (t.bld) {
    root.addChild(sel, body); body.y = -5; body.addChild(sprite(spr.building(e.type, c)));
    if (e.type === 'turret') { v.gun = body.addChild(new Container()); v.gun.addChild(sprite(spr.barrel(r + 9)), sprite(spr.turretHead(c, r * .55))) }
    if (e.type === 'pylon') { v.glow = body.addChild(sprite(spr.glow('#7ffcff', 18))); v.glow.y = -r * .5 }
    if (e.type === 'dome') { v.aura = auraL.addChild(sprite(spr.dashRing(t.aura, 'rgba(120,230,255,.6)', [10, 8], 2, 'rgba(160,245,255,.12)'))) }
    return v;
  }
  const sh = sprite(spr.shadow()); sh.scale.set(r * .95 / 30, r * .4 / 12); sh.y = r * .6;
  root.addChild(sh, sel, body);
  if (t.kind === 'inf') { v.rot = body.addChild(new Container()); v.rot.addChild(sprite(spr.infantry(e.type, c))).scale.set(1.3) }
  else if (t.kind === 'veh') {
    v.rot = body.addChild(new Container()); v.rot.addChild(sprite(spr.vehicle(e.type, c)));
    if (e.type === 'harv') { v.cargo = v.rot.addChild(new Graphics()); v.cargoV = -1 }
    if (e.type === 'rig') { v.core = root.addChild(sprite(spr.dataCore(1))); v.core.visible = false }
  } else {
    body.addChild(sprite(spr.neutral(e.type)));
    if (e.type === 'sentinel') body.y = -3;
    else if (e.type === 'warden') v.orbs = [0, 1, 2, 3].map(() => body.addChild(sprite(spr.orb())));
  }
  return v;
}
function syncEnt(e: Ent, v: View, now: number) {
  const t = e.t, r = t.r;
  const on = seen(e) && e.x > cam.x - 90 && e.y > cam.y - 90 && e.x < cam.x + cam.w + 90 && e.y < cam.y + cam.h + 90;
  v.root.visible = on; if (v.aura) v.aura.visible = seen(e);
  if (v.aura) { v.aura.position.set(e.x, e.y); v.aura.rotation = now * .05 }
  if (!on) return;
  v.root.position.set(e.x, e.y); v.root.zIndex = (t.bld ? 0 : 10000) + e.y; v.root.alpha = done(e) ? 1 : .55; v.sel.visible = e.sel;
  if (t.bld) {
    if (v.gun) v.gun.rotation = e.ang;
    if (v.glow) v.glow.alpha = .4 + .3 * Math.sin(now * 4);
  } else if (t.kind === 'neu') {
    v.body.y = Math.sin(now * 2.5 + e.id) * 2.5 - (e.type === 'sentinel' ? 3 : 0);
    v.orbs?.forEach((o, i) => { const a = i * Math.PI / 2 + now * .8; o.position.set(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10) * .55) });
  } else {
    const bob = e.mx != null ? Math.abs(Math.sin(now * 12 + e.id)) * 2 : Math.sin(now * 2 + e.id) * .6;
    v.body.y = -bob * (t.kind === 'veh' ? .25 : .45);
    if (v.gun) v.gun.rotation = e.ang;
    // ทหารเดิน: ส่ายตัวเล็กน้อยตามจังหวะก้าว
    if (v.rot) v.rot.rotation = e.ang + (t.kind === 'inf' && e.mx != null ? Math.sin(now * 14 + e.id) * .08 : 0);
    if (v.core) {
      v.core.visible = !!e.carry;
      if (e.carry) {
        const key = (e.carry.key ? 'b' : 'c') + e.carry.tier;
        if (key !== v.coreKey) { v.coreKey = key; v.core.texture = e.carry.key ? spr.blueprintItem(e.carry.tier) : spr.dataCore(e.carry.tier) }
        v.core.y = -r - 18 + Math.sin(now * 4) * 3;
      }
    }
    if (v.cargo) {
      const f = Math.min(1, (e.lo + e.lx) / 200), key = Math.round(f * 20) + (e.lx > e.lo ? 100 : 0);
      if (key !== v.cargoV) {
        v.cargoV = key; v.cargo.clear();
        if (f > 0) v.cargo.roundRect(-r + 4, -r * .35, r * 1.2 - 4, r * .7 * f + 1, 3).fill(e.lx > e.lo ? '#c28bff' : '#ffd166');
      }
    }
  }
}
function bar(x: number, y: number, bw: number, f: number, col: string) {
  barG.roundRect(x - bw / 2 - 1, y - 1, bw + 2, 6, 3).fill({ color: DARK, alpha: .8 });
  if (f > 0) barG.roundRect(x - bw / 2, y, Math.max(4, bw * f), 4, 2).fill(col);
}

// ---------- ซากโบราณ ----------
interface RuinView { ring: Sprite; glow: Sprite; base: Sprite; name: Text; status: Text }
const ruinViews = new Map<Ruin, RuinView>();
const itemViews = new Map<Item, Sprite>();
function makeRuinView(r: Ruin): RuinView {
  const s = spr.ruinSize(r.kind), c = new Container(); c.position.set(r.x, r.y); ruinL.addChild(c);
  const ring = c.addChild(sprite(spr.dashRing(r.r, r.R.col, [2, 10], 2.5)));
  const glow = c.addChild(sprite(spr.glow(r.R.col, s))), base = c.addChild(sprite(spr.ruin(r.kind)));
  const name = labelL.addChild(new Text({ text: 'T' + r.R.tier + ' ' + r.R.name, style: { ...labelStyle(), fill: r.R.col } }));
  name.anchor.set(.5, 1); name.position.set(r.x, r.y + r.r + 22);
  const status = labelL.addChild(new Text({ text: '', style: labelStyle() })); status.anchor.set(.5, 1); status.position.set(r.x, r.y - r.r - 6);
  return { ring, glow, base, name, status };
}
function setText(t: Text, s: string, col: string) { if (t.text !== s) t.text = s; if (t.style.fill !== col) t.style.fill = col }
function syncRuin(r: Ruin, v: RuinView, now: number) {
  const known = !!exp[cellAt(r.x, r.y)], sleeping = !awake(r), dim = sleeping || r.spent;
  for (const o of [v.ring.parent!, v.name, v.status]) o.visible = known;
  if (!known) return;
  setText(v.name, 'T' + r.R.tier + ' ' + r.R.name, r.R.col); // ชื่อซากเปลี่ยนตามภาษา
  v.ring.rotation = now * .06; v.ring.alpha = dim ? .25 : .55;
  v.glow.visible = !dim; v.glow.alpha = .35 + .25 * Math.sin(now * 3);
  v.base.alpha = dim ? .6 : 1; v.base.y = 5 + (dim ? 0 : Math.sin(now * 2) * 1.5);
  if (sleeping) setText(v.status, tr('ปิดผนึก · ตื่นใน ', 'Sealed · wakes in ') + wakeText(r), '#c9c3d6');
  else if (r.spent) {
    const who = r.owner === 0 ? tr('ฝ่ายเรา', 'You') : r.owner === 1 ? tr('ศัตรู', 'Enemy') : tr('ว่าง', 'None'), bonus = r.R.income ? ' +$' + r.R.income + tr('/วิ', '/s') : tr(' ซูเปอร์เวพอนชาร์จ x2', ' superweapon x2');
    if (r.contested) setText(v.status, tr('แย่งชิง!', 'Contested!'), '#ffcc4d');
    else if (r.cap > 0 && r.capTeam >= 0) setText(v.status, (r.capTeam === 0 ? tr('กำลังยึด ', 'Capturing ') : tr('ศัตรูกำลังยึด ', 'Enemy capturing ')) + Math.floor(100 * r.cap / CAPTURE_TIME) + '%', TEAM_COL[r.capTeam]);
    else setText(v.status, tr('ครอบครอง: ', 'Held by: ') + who + (r.owner >= 0 ? bonus : ''), r.owner >= 0 ? TEAM_COL[r.owner] : '#c9c3d6');
  }
  else if (r.prog > 0) setText(v.status, (r.contested ? tr('ถูกขัดขวาง ', 'Blocked ') : tr('ถอดรหัส ', 'Decrypting ')) + Math.floor(100 * r.prog / r.need) + '%', r.contested ? '#ffcc4d' : TEAM_COL[r.team] || '#fff');
  else setText(v.status, '', '#fff');
  const s = spr.ruinSize(r.kind);
  if (r.prog > 0) {
    const a0 = -Math.PI / 2, a1 = a0 + 6.283 * r.prog / r.need;
    fxG.circle(r.x, r.y, s + 14).stroke({ width: 8, color: DARK, alpha: .5 });
    fxG.moveTo(r.x + Math.cos(a0) * (s + 14), r.y + Math.sin(a0) * (s + 14)).arc(r.x, r.y, s + 14, a0, a1)
      .stroke({ width: 6, color: r.contested ? '#ffcc4d' : TEAM_COL[r.team], cap: 'round' });
  }
  if (r.spent && r.owner >= 0) fxG.circle(r.x, r.y, r.r).stroke({ width: 4, color: TEAM_COL[r.owner], alpha: .45 });
  if (r.spent && r.cap > 0 && r.capTeam >= 0) {
    const a0 = -Math.PI / 2, a1 = a0 + 6.283 * r.cap / CAPTURE_TIME;
    fxG.moveTo(r.x + Math.cos(a0) * r.r, r.y + Math.sin(a0) * r.r).arc(r.x, r.y, r.r, a0, a1).stroke({ width: 6, color: TEAM_COL[r.capTeam], cap: 'round' });
  }
  if (r.active) { const p = (now % 1.5) / 1.5; fxG.circle(r.x, r.y, r.r + p * 120).stroke({ width: 3, color: r.R.col, alpha: 1 - p }) }
}

// ---------- เอฟเฟกต์ ----------
const fxText = new Map<Fx, Text>();
function drawFx(f: Fx) {
  const a = Math.max(0, f.ttl / f.max), p = 1 - a;
  switch (f.k) {
    case 'shot': {
      const q0 = Math.max(0, p - .3), q1 = Math.min(1, p + .4);
      fxG.moveTo(f.x1 + (f.x2 - f.x1) * q0, f.y1 + (f.y2 - f.y1) * q0).lineTo(f.x1 + (f.x2 - f.x1) * q1, f.y1 + (f.y2 - f.y1) * q1)
        .stroke({ width: 2.5, color: f.col, alpha: a, cap: 'round' }); break;
    }
    case 'beam':
      fxG.moveTo(f.x1, f.y1).lineTo(f.x2, f.y2).stroke({ width: 10 * a + 3, color: f.col, alpha: a * .45, cap: 'round' });
      fxG.moveTo(f.x1, f.y1).lineTo(f.x2, f.y2).stroke({ width: 3 * a + 1, color: '#fff', alpha: a, cap: 'round' }); break;
    case 'shell':
      fxG.circle(f.x1 + (f.x2 - f.x1) * p, f.y1 + (f.y2 - f.y1) * p - Math.sin(p * Math.PI) * 60, 4.5).fill(f.col).stroke({ width: 1.5, color: spr.OL }); break;
    case 'boom': {
      const R = f.r * (.4 + p * .8);
      for (const [dx, dy, k, col] of [[0, -.4, .6, '#2a2724'], [-.45, .15, .5, '#c2410c'], [.45, .1, .52, '#ff7a1a'], [0, 0, .5, '#ffc46b']] as const)
        fxG.circle(f.x + dx * R, f.y + dy * R - p * 6, R * k).fill({ color: col, alpha: a });
      for (let i = 0; i < 6; i++) { const q = i * 1.047 + f.r; fxG.circle(f.x + Math.cos(q) * R * 1.2, f.y + Math.sin(q) * R * 1.2, 1.8 * a + .1).fill({ color: '#ffb347', alpha: a }) }
      break;
    }
    case 'puff': fxG.circle(f.x, f.y, f.r * (1 + p * 2.4)).fill({ color: p < .15 ? '#ffb347' : '#6f6a64', alpha: .5 * a }); break;
    case 'ping': fxG.ellipse(f.x, f.y, 18 * a + 3, (18 * a + 3) * .55).stroke({ width: 2.5, color: f.col, alpha: a }); break;
    case 'target': fxG.circle(f.x, f.y, 160 * a + 1).stroke({ width: 3, color: '#ff5ad2' }); break;
    case 'orbital': {
      const k = 1.1 - a * .4;
      fxG.circle(f.x, f.y, 170 * k).fill({ color: '#ff5ad2', alpha: .35 * a }).circle(f.x, f.y, 110 * k).fill({ color: '#ffd0f6', alpha: .5 * a });
      fxG.rect(f.x - 40 * a, cam.y, 80 * a, f.y - cam.y).fill({ color: '#ff8ce1', alpha: .5 * a }).rect(f.x - 14 * a, cam.y, 28 * a, f.y - cam.y).fill({ color: '#fff', alpha: a });
      break;
    }
    case 'txt': {
      let t = fxText.get(f);
      if (!t) { t = txtL.addChild(new Text({ text: f.text, style: { ...labelStyle(15), fill: f.col } })); t.anchor.set(.5); fxText.set(f, t) }
      t.position.set(f.x, f.y - p * 30); t.alpha = Math.min(1, a * 2); break;
    }
  }
}

// ---------- API ----------
let ghost: Sprite | null = null, ghostType = '';
export function initScene(app: Application) {
  app.stage.addChild(root);
  ground.addChild(new TilingSprite({ texture: spr.groundTile(), width: W, height: H }));
  S.rubble.forEach((r, i) => { const s = decoL.addChild(sprite(spr.deco(i))); s.position.set(r.x, r.y); s.scale.set(.7 + r.w / 40) });
  const fog = fogL.addChild(new Sprite(fogTex)); fog.scale.set(CELL);
}

export function renderScene(now: number) {
  world_.position.set(-Math.round(cam.x), -Math.round(cam.y));
  fxG.clear(); barG.clear(); uiG.clear();

  // แร่: สร้าง sprite ครั้งแรกที่เจอ แล้วแค่ปรับขนาดตามปริมาณที่เหลือ
  S.ores.forEach((o, i) => {
    let s = oreL.children[i] as Sprite | undefined;
    if (!s) { s = oreL.addChild(sprite(spr.ore(o.kind))); s.position.set(o.x, o.y) }
    s.visible = o.amt > 0; s.scale.set(.45 + o.amt / 560);
  });
  // ของที่หล่นในสนาม (Data Core / พิมพ์เขียว) ส่งสัญญาณ ทุกฝ่ายมองเห็นเสมอ
  const liveItems = new Set(S.items);
  for (const [it, sp] of itemViews) if (!liveItems.has(it)) { sp.destroy(); itemViews.delete(it) }
  for (const it of S.items) {
    let sp = itemViews.get(it);
    if (!sp) { sp = itemL.addChild(sprite(it.key ? spr.blueprintItem(it.tier) : spr.dataCore(it.tier))); itemViews.set(it, sp) }
    sp.position.set(it.x, it.y - 6 + Math.sin(now * 3 + it.x) * 3);
    fxG.ellipse(it.x, it.y + 8, 10, 4).fill({ color: '#2b2745', alpha: .2 });
    const p = (now % 2) / 2; fxG.circle(it.x, it.y, 14 + p * 26).stroke({ width: 2, color: '#fff', alpha: .6 * (1 - p) });
  }
  for (const r of S.ruins) { let v = ruinViews.get(r); if (!v) ruinViews.set(r, v = makeRuinView(r)); syncRuin(r, v, now) }

  const alive = new Set(S.ents);
  for (const [e, v] of views) if (!alive.has(e)) { v.root.destroy({ children: true }); v.aura?.destroy(); views.delete(e) }
  for (const e of S.ents) {
    let v = views.get(e); if (!v) { views.set(e, v = makeView(e)); entL.addChild(v.root) }
    syncEnt(e, v, now);
    if (!v.root.visible) continue;
    const t = e.t;
    if (!done(e)) bar(e.x, e.y + t.r + 6, t.r * 2, 1 - e.build / e.buildMax, '#ffd166');
    if (e.sel || e.hp < e.maxhp) { const f = Math.max(0, e.hp / e.maxhp); bar(e.x, e.y - t.r - (t.bld ? 16 : 12), Math.max(22, t.r * 2), f, f > .5 ? '#7dff9a' : f > .25 ? '#ffd166' : '#ff6b6b') }
  }

  const live = new Set(S.fx);
  for (const [f, t] of fxText) if (!live.has(f)) { t.destroy(); fxText.delete(f) }
  for (const f of S.fx) drawFx(f);
  // จรวดที่กำลังบิน: เปลวไฟท้าย + ลำตัว + หัวรบ
  for (const m of S.shots) {
    const cx = Math.cos(m.ang), cy = Math.sin(m.ang);
    fxG.moveTo(m.x - cx * 22, m.y - cy * 22).lineTo(m.x - cx * 7, m.y - cy * 7).stroke({ width: 6, color: '#ff7a1a', alpha: .55, cap: 'round' });
    fxG.moveTo(m.x - cx * 14, m.y - cy * 14).lineTo(m.x - cx * 7, m.y - cy * 7).stroke({ width: 3, color: '#ffe0a0', cap: 'round' });
    fxG.moveTo(m.x - cx * 7, m.y - cy * 7).lineTo(m.x + cx * 5, m.y + cy * 5).stroke({ width: 4, color: '#cfd4d9', cap: 'round' });
    fxG.circle(m.x + cx * 5.5, m.y + cy * 5.5, 2.2).fill('#c7361e');
  }

  for (let i = 0; i < GW * GH; i++) fimg.data[i * 4 + 3] = vis[i] ? 0 : exp[i] ? 150 : 255;
  fctx.putImageData(fimg, 0, 0); fogTex.source.update();

  // เงาตัวอย่างตอนวางสิ่งก่อสร้าง
  const placing = ctl.mode === 'place';
  if (placing && ghostType !== ctl.placeType) { ghost?.destroy(); ghost = ghostL.addChild(sprite(spr.building(ctl.placeType, TEAM_COL[0]))); ghostType = ctl.placeType }
  if (ghost) ghost.visible = placing;
  if (placing && ghost) {
    const t = T[ctl.placeType], p = world(), ok = validPlace(0, ctl.placeType, p.x, p.y), col = ok ? '#7dff9a' : '#ff6b6b';
    ghost.position.set(p.x, p.y - 5); ghost.alpha = .75;
    uiG.roundRect(mouse.x - t.r, mouse.y - t.r, 2 * t.r, 2 * t.r, 10).fill({ color: col, alpha: .3 });
    if (t.aura || t.range) uiG.circle(mouse.x, mouse.y, t.aura || t.range).stroke({ width: 2, color: col });
  }
  let hint = '';
  if (ctl.mode === 'amove' || ctl.mode === 'strike') {
    const col = ctl.mode === 'strike' ? '#ff5ad2' : '#ff6b6b', R = ctl.mode === 'strike' ? 160 : 14;
    uiG.circle(mouse.x, mouse.y, R).stroke({ width: 2.5, color: col });
    hint = ctl.mode === 'strike' ? tr('เลือกเป้าหมาย', 'Pick target') : tr('เดินพร้อมยิง', 'Attack-move');
    cursorTxt.position.set(mouse.x, mouse.y + R + 6); if (cursorTxt.style.fill !== col) cursorTxt.style.fill = col;
  }
  if (cursorTxt.text !== hint) cursorTxt.text = hint;
  if (mouse.drag) uiG.roundRect(Math.min(mouse.sx, mouse.x), Math.min(mouse.sy, mouse.y), Math.abs(mouse.x - mouse.sx), Math.abs(mouse.y - mouse.sy), 6)
    .fill({ color: '#7dff9a', alpha: .1 }).stroke({ width: 1.5, color: '#7dff9a' });
}
