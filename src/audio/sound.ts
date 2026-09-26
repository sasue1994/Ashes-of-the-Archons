// ============================================================
// เสียงทั้งหมดสังเคราะห์สดด้วย Web Audio (ไม่มีไฟล์เสียง โหลดเร็ว)
// · เสียงเอฟเฟกต์: sim แจ้งผ่าน hooks.sfx พร้อมตำแหน่ง → ดังเบาตามระยะจากจอ + แพนซ้ายขวา
// · เสียงเครื่องยนต์: ดังตามจำนวนยานที่กำลังเคลื่อนที่บนจอ
// · ดนตรีพื้นหลัง: ไฟล์เพลง 2 เพลงเล่นสลับกัน (ถ้าโหลดไฟล์ไม่ได้ ใช้ดนตรีสังเคราะห์สำรอง)
// เบราว์เซอร์อนุญาตให้เล่นเสียงหลังผู้ใช้แตะ/กดครั้งแรกเท่านั้น จึงสร้าง AudioContext ตอนนั้น
// ============================================================
import { cam, toScreen } from '../render/camera';
import { cellAt, vis } from '../sim/fog';
import { S, hooks, type SfxKey } from '../sim/state';
import { i18n } from '../sim/i18n';
import tacticalEdge from '../assets/music/tactical-edge.m4a';
import turboBoost from '../assets/music/turbo-boost.m4a';

export type UiSfx = 'click' | 'select' | 'move' | 'attack' | 'place' | 'error' | 'alert' | 'chime' | 'win' | 'lose';
type Key = SfxKey | UiSfx;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ไม่มี storage */ } },
};
export const soundPref = { sfx: store.get('archon.sfx') !== '0', music: store.get('archon.music') !== '0' };

let ac: AudioContext | null = null;
let sfxBus: GainNode, musBus: GainNode, musWet: GainNode, noiseBuf: AudioBuffer;
let engine: { g: GainNode; f: BiquadFilterNode } | null = null;
const VOL = { sfx: .9, music: .32 };

function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return }
  blessTrack(); blessVoice();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  // บีบไดนามิกรวม กันเสียงแตกตอนระเบิดพร้อมกันหลายลูก
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = soundPref.sfx ? VOL.sfx : 0; sfxBus.connect(comp);
  musBus = ac.createGain(); musBus.gain.value = soundPref.music ? VOL.music : 0; musBus.connect(comp);
  // เสียงก้องของดนตรี: delay ป้อนกลับผ่าน lowpass
  const dl = ac.createDelay(1); dl.delayTime.value = .42; const fb = ac.createGain(); fb.gain.value = .38;
  const lp = ac.createBiquadFilter(); lp.frequency.value = 1800;
  musWet = ac.createGain(); musWet.gain.value = .5;
  musWet.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musBus);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // เครื่องยนต์: noise วนลูปผ่าน lowpass ต่ำๆ ปรับความดังทุกเฟรม
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140; f.Q.value = 4;
  const g = ac.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(sfxBus); src.start();
  engine = { g, f };
  if (track) { const src = ac.createMediaElementSource(track.el); src.connect(musBus) }
}

// ---------- เครื่องมือสังเคราะห์ ----------
interface Out { vol: number; pan: number }
function chain(o: Out, dest: AudioNode) {
  const g = ac!.createGain(), p = ac!.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(dest); return g;
}
// โทนเสียง: ความถี่เลื่อนจาก f0 → f1 ภายใน dur วินาที
function tone(o: Out, f0: number, f1: number, dur: number, type: OscillatorType, vol: number, at = 0, dest: AudioNode = sfxBus, attack = .005) {
  const t = ac!.currentTime + at, osc = ac!.createOscillator(), g = chain(o, dest);
  osc.type = type; osc.frequency.setValueAtTime(f0, t); if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * o.vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  osc.connect(g); osc.start(t); osc.stop(t + dur + .05);
}
// เสียงซ่า (ปืน ระเบิด ลม) ผ่านฟิลเตอร์ที่กวาดความถี่ f0 → f1
function noise(o: Out, dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, at = 0) {
  const t = ac!.currentTime + at, src = ac!.createBufferSource(), flt = ac!.createBiquadFilter(), g = chain(o, sfxBus);
  src.buffer = noiseBuf; flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t); if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol * o.vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(flt); flt.connect(g); src.start(t, Math.random() * 1.5); src.stop(t + dur + .05);
}

// ---------- ตำแหน่ง: ความดังตามระยะจากจอ + ซ้าย/ขวา ----------
// ไม่มีพิกัด = เสียงแจ้งเตือนของผู้เล่น (ดังเต็ม กลาง) · อยู่ในหมอก = ไม่ได้ยิน (ไม่เผยตำแหน่งศัตรู)
const GLOBAL: Partial<Record<Key, true>> = { orbital: true };
function where(k: Key, x?: number, y?: number): Out | null {
  if (x == null || y == null) return { vol: 1, pan: 0 };
  if (!GLOBAL[k] && !vis[cellAt(x, y)]) return null;
  const s = toScreen(x, y);
  const dx = Math.max(0, -s.x, s.x - cam.sw) / cam.sw, dy = Math.max(0, -s.y, s.y - cam.sh) / cam.sh, d = Math.hypot(dx, dy);
  if (d > 1.2 && !GLOBAL[k]) return null;
  const zoom = Math.min(1.25, Math.max(.6, cam.zoom / 1.45));
  return { vol: zoom / (1 + 4 * d), pan: Math.max(-1, Math.min(1, s.x / cam.sw * 2 - 1)) * .7 };
}

// จำกัดความถี่ต่อชนิดเสียง ยิงพร้อมกัน 20 นัดจะได้ไม่ดังเป็นกำแพง
const GAP: Partial<Record<Key, number>> = { rifle: .05, cannon: .07, beam: .09, missile: .08, artillery: .12, boom: .06, die: .08, explode: .08, select: .05, move: .08, attack: .08, click: .03 };
const last: Partial<Record<Key, number>> = {};
let battle = 0; // ความดุเดือดของการรบ (ใช้กับดนตรี) ลดลงเรื่อยๆ

export function sfx(k: Key, x?: number, y?: number) {
  if (!ac || !soundPref.sfx || ac.state !== 'running') return;
  const now = ac.currentTime; if (now - (last[k] ?? -1) < (GAP[k] ?? 0)) return;
  const o = where(k, x, y); if (!o || o.vol < .04) return;
  last[k] = now;
  if (x != null && k !== 'orbital') battle = Math.min(10, battle + .25);
  const r = 1 + (Math.random() - .5) * .12; // สุ่มระดับเสียงเล็กน้อย ไม่ให้ซ้ำจนน่าเบื่อ
  switch (k) {
    case 'rifle': noise(o, .07, .3, 'bandpass', 2600 * r, 1500, 1.2); tone(o, 900 * r, 250, .04, 'square', .05); break;
    case 'cannon': noise(o, .3, .45, 'lowpass', 1400 * r, 180, 1); tone(o, 120 * r, 42, .28, 'sine', .55); break;
    case 'beam': tone(o, 1500 * r, 380, .3, 'sawtooth', .09); tone(o, 2400 * r, 1900, .25, 'sine', .08); noise(o, .15, .1, 'highpass', 4000); break;
    case 'artillery': tone(o, 90 * r, 30, .6, 'sine', .6); noise(o, .5, .4, 'lowpass', 900, 120); tone(o, 1800, 300, .2, 'sawtooth', .05); break;
    case 'missile': noise(o, .4, .22, 'bandpass', 700 * r, 2600, 2.5); break;
    case 'boom': noise(o, .45, .4, 'lowpass', 1600 * r, 140, 1); tone(o, 80 * r, 34, .35, 'sine', .45); break;
    case 'explode': noise(o, .9, .7, 'lowpass', 2200 * r, 90, 1); tone(o, 70 * r, 24, .8, 'sine', .8); noise(o, .25, .25, 'highpass', 3000, 1500, 1, .05); break;
    case 'collapse': noise(o, 1.8, .85, 'lowpass', 900 * r, 55, 1.5); tone(o, 50, 20, 1.5, 'sine', .9); noise(o, .6, .3, 'bandpass', 500, 200, 2, .3); break;
    case 'die': noise(o, .12, .18, 'bandpass', 1100 * r, 500, 2); tone(o, 260 * r, 120, .1, 'triangle', .1); break;
    case 'orbital':
      tone(o, 55, 18, 2.2, 'sine', 1); noise(o, 2.6, .9, 'lowpass', 3500, 60, 1); tone(o, 2200, 120, 1.2, 'sawtooth', .12); break;
    case 'target': tone(o, 180, 1400, 1.4, 'sawtooth', .12, 0, sfxBus, .3); tone(o, 186, 1420, 1.4, 'square', .05, 0, sfxBus, .3); break;
    case 'ready': tone(o, 660, 660, .14, 'triangle', .3); tone(o, 990, 990, .22, 'triangle', .3, .1); say('ready', .35); break;
    case 'built': [523, 659, 784].forEach((f, i) => tone(o, f, f, .25, 'triangle', .28, i * .09)); noise(o, .12, .2, 'lowpass', 500, 200); break;
    case 'research': [523, 659, 784, 1046].forEach((f, i) => tone(o, f, f, .35, 'sine', .25, i * .08)); break;
    case 'click': tone(o, 1500, 1500, .03, 'square', .05); break;
    case 'select': tone(o, 1200, 1400, .05, 'sine', .14); break;
    case 'move': tone(o, 880, 1100, .06, 'square', .07); tone(o, 1320, 1320, .05, 'square', .05, .06); say('go'); break;
    case 'attack': tone(o, 520, 390, .08, 'sawtooth', .1); tone(o, 520, 390, .08, 'sawtooth', .1, .09); say('go'); break;
    case 'place': noise(o, .18, .35, 'lowpass', 500, 120); tone(o, 160, 80, .18, 'sine', .4); break;
    case 'error': tone(o, 220, 200, .09, 'square', .1); tone(o, 180, 160, .12, 'square', .1, .1); break;
    case 'alert': for (let i = 0; i < 2; i++) { tone(o, 880, 880, .16, 'sawtooth', .07, i * .36); tone(o, 660, 660, .16, 'sawtooth', .07, i * .36 + .18) } break;
    case 'chime': tone(o, 1318, 1318, 1.2, 'sine', .18); tone(o, 1975, 1975, .9, 'sine', .1, .05); break;
    case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(o, f, f, i > 3 ? .6 : .22, 'triangle', .3, i * .16)); break;
    case 'lose': [392, 370, 330, 262].forEach((f, i) => tone(o, f, f, i === 3 ? 1.2 : .35, 'sawtooth', .12, i * .3)); break;
  }
}

// ---------- เสียงพูด (Web Speech API: เสียงสังเคราะห์ของเครื่อง ไม่ต้องมีไฟล์) ----------
// พูดภาษาตามที่เลือกในเกม ถ้าเครื่องไม่มีเสียงภาษาไทยจะพูดประโยคภาษาอังกฤษแทน · ปิดพร้อมปุ่ม 🔊
const LINES = { ready: ['สร้างเสร็จแล้วนะ', 'Unit ready'], go: ['แคทเทอรีนยิงมัน', 'Catherine, shoot it!'] } as const;
const SAY_GAP = { ready: 2.5, go: 3 }; // วินาที กันพูดซ้อน/รัวเมื่อผลิตเสร็จหลายคันหรือสั่งถี่ๆ
const lastSay: Partial<Record<keyof typeof LINES, number>> = {};
const tts = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
const voiceFor = (lang: string) => tts?.getVoices().find(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
// iOS: ต้องพูดครั้งแรกระหว่างที่ผู้ใช้แตะ จึงพูดประโยคว่างไว้ก่อน
function blessVoice() { if (tts) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; tts.speak(u) } }
function say(k: keyof typeof LINES, delay = 0) {
  if (!tts || !soundPref.sfx) return;
  const now = performance.now() / 1000; if (now - (lastSay[k] ?? -99) < SAY_GAP[k] || tts.speaking || tts.pending) return;
  lastSay[k] = now;
  let v = i18n.lang === 'th' ? voiceFor('th') : undefined, text: string = LINES[k][0];
  if (!v) { v = voiceFor('en'); text = LINES[k][1] }
  const u = new SpeechSynthesisUtterance(text); if (v) { u.voice = v; u.lang = v.lang }
  u.rate = k === 'go' ? 1.15 : 1.05; u.pitch = k === 'go' ? 1.1 : 1; u.volume = 1;
  setTimeout(() => tts.speak(u), delay * 1000); // ให้เสียงติ๊งของ 'ready' ดังก่อน
}

// ---------- ดนตรีพื้นหลัง: ไฟล์เพลงเล่นสลับกัน ----------
// ใช้ <audio> ตัวเดียว (สตรีม ไม่ต้องถอดรหัสทั้งเพลงไว้ในหน่วยความจำ) เปลี่ยน src เมื่อจบเพลง
// ต่อเข้า musBus ปุ่ม ♪ จึงคุมได้เหมือนเสียงอื่น · ไม่ตั้ง src จนกว่าเกมเริ่ม หน้าโหลดจึงไม่ช้าลง
const PLAYLIST = [tacticalEdge, turboBoost];
let track: { el: HTMLAudioElement; i: number; failed: boolean } | null = null;
// iOS: ต้องเรียก play() ครั้งแรกระหว่างที่ผู้ใช้แตะ จึงเล่นแบบปิดเสียงแล้วหยุดทันที หลังจากนั้นเล่นต่อ/เปลี่ยนเพลงเองได้
// (ไฟล์เพลงเริ่มโหลดตอนแตะครั้งแรกนี้ ไม่ใช่ตอนเปิดหน้า)
function blessTrack() {
  const el = new Audio(PLAYLIST[0]);
  track = { el, i: 0, failed: false };
  el.addEventListener('ended', () => { track!.i = (track!.i + 1) % PLAYLIST.length; el.src = PLAYLIST[track!.i]; el.play().catch(() => {}) });
  el.addEventListener('error', () => { track!.failed = true }); // โหลดไม่ได้ → ใช้ดนตรีสังเคราะห์
  el.muted = true;
  el.play().then(() => { if (!S.started) el.pause(); el.muted = false }, () => { el.muted = false });
}
function fileMusic(on: boolean) {
  const el = track!.el;
  if (!on) { if (!el.paused) el.pause(); return }
  if (el.paused && !el.muted) el.play().catch(() => {});
}

// ---------- ดนตรีสังเคราะห์สำรอง ----------
// Am → F → Dm → E วนไป (โทนมืด ทหาร) คอร์ดละ 8 วินาที · โน้ต = MIDI
const CHORDS = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
const BAR = 8, hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
let nextBar = 0, bar = 0, nextBeat = 0;
function pad(notes: number[], t: number) {
  const g = ac!.createGain(), f = ac!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650; f.Q.value = 1;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + 2.5); g.gain.setValueAtTime(.16, t + BAR - 1); g.gain.linearRampToValueAtTime(0, t + BAR + 2);
  f.connect(g); g.connect(musBus); g.connect(musWet);
  for (const m of notes) for (const det of [-6, 6]) {
    const o = ac!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + BAR + 2.2);
  }
  const b = ac!.createOscillator(), bg = ac!.createGain(); b.type = 'sine'; b.frequency.value = hz(notes[0] - 24);
  bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(.3, t + 1); bg.gain.linearRampToValueAtTime(0, t + BAR + 1);
  b.connect(bg); bg.connect(musBus); b.start(t); b.stop(t + BAR + 1.2);
  // โน้ตกระจายเบาๆ ลอยในเสียงก้อง
  for (let i = 0; i < 4; i++) {
    const m = notes[Math.floor(Math.random() * 3)] + 12 * (1 + Math.floor(Math.random() * 2)), at = t + i * 2 + Math.random() * 1.2;
    const o = ac!.createOscillator(), g2 = ac!.createGain(); o.type = 'triangle'; o.frequency.value = hz(m);
    g2.gain.setValueAtTime(0, at); g2.gain.linearRampToValueAtTime(.06, at + .01); g2.gain.exponentialRampToValueAtTime(.0001, at + 1.4);
    o.connect(g2); g2.connect(musWet); g2.connect(musBus); o.start(at); o.stop(at + 1.5);
  }
}
// กลองตอนรบหนัก: kick + snare เบาๆ ตามจังหวะ
function drum(t: number, beat: number) {
  const k = ac!.createOscillator(), kg = ac!.createGain(); k.frequency.setValueAtTime(110, t); k.frequency.exponentialRampToValueAtTime(40, t + .18);
  kg.gain.setValueAtTime(.55, t); kg.gain.exponentialRampToValueAtTime(.001, t + .25); k.connect(kg); kg.connect(musBus); k.start(t); k.stop(t + .3);
  if (beat % 2) {
    const n = ac!.createBufferSource(), f = ac!.createBiquadFilter(), g = ac!.createGain(); n.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .15); n.connect(f); f.connect(g); g.connect(musBus); n.start(t, Math.random()); n.stop(t + .2);
  }
}
function music() {
  const t = ac!.currentTime;
  if (nextBar < t) nextBar = t + .1;
  while (nextBar < t + 1) { pad(CHORDS[bar++ % CHORDS.length], nextBar); nextBar += BAR }
  if (nextBeat < t) nextBeat = t + .05;
  while (nextBeat < t + .3) { if (battle > 4) drum(nextBeat, Math.round(nextBeat / .5)); nextBeat += .5 }
}

// ---------- เรียกทุกเฟรมจาก main ----------
const prevPos = new Map<number, { x: number; y: number }>();
let lastMsg: unknown = null;
export function soundFrame(dt: number, paused: boolean) {
  if (!ac || ac.state !== 'running') return;
  battle = Math.max(0, battle - dt * .8);
  const live = S.started && !S.over && !paused;
  if (track && !track.failed) fileMusic(soundPref.music && S.started);
  else if (soundPref.music && live) music();
  // เครื่องยนต์: นับยาน (ไม่รวมทหารราบ) ที่ขยับอยู่บนจอและมองเห็นได้
  let n = 0;
  for (const e of S.ents) {
    if (e.t.bld || e.hp <= 0) continue;
    const p = prevPos.get(e.id);
    if (p && e.t.kind !== 'inf' && Math.hypot(e.x - p.x, e.y - p.y) > 4 * dt && (e.team === 0 || vis[cellAt(e.x, e.y)])) {
      const s = toScreen(e.x, e.y); if (s.x > -40 && s.y > -40 && s.x < cam.sw + 40 && s.y < cam.sh + 40) n++;
    }
    if (p) { p.x = e.x; p.y = e.y } else prevPos.set(e.id, { x: e.x, y: e.y });
  }
  if (prevPos.size > S.ents.length * 2) { const ids = new Set(S.ents.map(e => e.id)); for (const id of prevPos.keys()) if (!ids.has(id)) prevPos.delete(id) }
  const eg = live && n ? Math.min(.5, .12 * Math.sqrt(n)) : 0;
  engine!.g.gain.setTargetAtTime(eg, ac.currentTime, .25); engine!.f.frequency.setTargetAtTime(110 + 12 * Math.min(n, 10), ac.currentTime, .3);
  // ข้อความใหม่: ⚠ = เตือนภัย · ✦ = เหตุการณ์ซากโบราณ
  const m = S.msgs[0];
  if (m && m !== lastMsg) { lastMsg = m; if (m.text.startsWith('⚠')) sfx('alert'); else if (m.text.startsWith('✦')) sfx('chime') }
}

// ---------- ปุ่มเปิด/ปิดเสียง ----------
function applyPref() {
  if (ac) {
    sfxBus.gain.setTargetAtTime(soundPref.sfx ? VOL.sfx : 0, ac.currentTime, .05);
    musBus.gain.setTargetAtTime(soundPref.music ? VOL.music : 0, ac.currentTime, .3);
  }
  store.set('archon.sfx', soundPref.sfx ? '1' : '0'); store.set('archon.music', soundPref.music ? '1' : '0');
  document.querySelectorAll<HTMLElement>('.sndBtn').forEach(b => b.classList.toggle('off', !soundPref.sfx));
  document.querySelectorAll<HTMLElement>('.musBtn').forEach(b => b.classList.toggle('off', !soundPref.music));
}
export function initSound() {
  hooks.sfx = sfx;
  tts?.getVoices(); // Chrome โหลดรายชื่อเสียงแบบ async เรียกไว้ก่อนให้พร้อมตอนต้องพูด
  // สร้าง/ปลุกระบบเสียงเมื่อผู้ใช้โต้ตอบ (นโยบาย autoplay ของเบราว์เซอร์)
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) { ac.suspend(); track?.el.pause() } else ac.resume(); // เพลงกลับมาเล่นเองใน soundFrame
  });
  document.querySelectorAll<HTMLElement>('.sndBtn').forEach(b => b.onclick = () => { soundPref.sfx = !soundPref.sfx; applyPref(); sfx('click') });
  document.querySelectorAll<HTMLElement>('.musBtn').forEach(b => b.onclick = () => { soundPref.music = !soundPref.music; applyPref() });
  applyPref();
}
