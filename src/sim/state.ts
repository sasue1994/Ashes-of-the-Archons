import { T, type AiLevel, type BPKey, type NeedKey, type RuinDef, type RuinKind, type TypeKey, type UnitType, type UpgKey } from './data';

export interface Pt { x: number; y: number }
export interface Ore extends Pt { amt: number; kind: 'ore' | 'xen' }
// ของที่ Rig ขน: Data Core (ไม่มี key = ส่งถึงฐานแล้วสุ่มตัวเลือกตาม tier) หรือพิมพ์เขียวที่หล่นจาก Vault (มี key)
export interface Cargo { tier: number; key?: BPKey }
export interface Item extends Pt, Cargo {}
export interface Ent extends Pt {
  id: number; type: TypeKey; t: UnitType; team: number;
  hp: number; maxhp: number; cd: number; ang: number; sel: boolean;
  target: Ent | null; forced: boolean; amove: boolean;
  mx: number | null; my: number; // my ใช้เมื่อ mx != null เท่านั้น
  lo: number; lx: number; home: Pt;
  build: number; buildMax: number;
  state: 'ret' | null; ore: Ore | null; ret: boolean; dead: boolean;
  lastD: number | null; stuck: number; carry: Cargo | null;
}
export interface Ruin extends Pt {
  kind: RuinKind; R: RuinDef; r: number; need: number; prog: number; team: number;
  wake: number; warned: boolean;       // wake > 0 = ยังหลับ นับถอยหลังวินาที
  spent: boolean; active: boolean; contested: boolean; announced: boolean; guards: Ent[];
  owner: number; cap: number; capTeam: number; // หลังถอดรหัส: ใครครอบครอง และความคืบหน้าการยึด
}
export interface SuperWeapon { charge: number; need: number; warned: boolean }
export interface Team {
  credits: number; bp: Partial<Record<BPKey, boolean>>;
  queue: { type: TypeKey; left: number }[]; sw: SuperWeapon | null; offers: { tier: number; keys: BPKey[] }[];
  res: { key: UpgKey; left: number } | null; done: Partial<Record<UpgKey, boolean>>; // งานวิจัยที่ Lab
}
interface Line { x1: number; y1: number; x2: number; y2: number; col: string }
export type Fx = { ttl: number; max: number } & (
  | ({ k: 'shot' | 'beam' | 'shell' } & Line)
  | { k: 'puff'; x: number; y: number; r: number }
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'ping'; x: number; y: number; col: string }
  | { k: 'txt'; x: number; y: number; text: string; col: string }
  | { k: 'target' | 'orbital'; x: number; y: number });
export interface Msg { text: string; col: string; t: number }
export interface Strike extends Pt { t: number; team: number; done?: boolean }
// จรวดที่กำลังบิน: ตามเป้าที่ล็อกไว้ ถ้าเป้าตายก่อนก็บินไปจุดสุดท้ายที่เห็น
export interface Shot extends Pt { tx: number; ty: number; tg: Ent | null; src: Ent; team: number; dmg: number; splash: number; ang: number; puff: number; life: number; done?: boolean }

export const S = {
  ents: [] as Ent[], nid: 1, fx: [] as Fx[], ores: [] as Ore[], ruins: [] as Ruin[],
  items: [] as Item[], msgs: [] as Msg[], strikes: [] as Strike[], shots: [] as Shot[], domes: [] as Ent[], over: null as null | 'VICTORY' | 'DEFEAT',
  teams: [0, 1].map((): Team => ({ credits: 2500, bp: {}, queue: [], sw: null, offers: [], res: null, done: {} })),
  rubble: [] as (Pt & { w: number })[],
  level: 'normal' as AiLevel, started: false, // ระดับ AI และเริ่มแมตช์แล้วหรือยัง (หน้าเลือกระดับ)
};

// จุดเชื่อมให้ UI รับรู้เหตุการณ์จาก sim โดยที่ sim ไม่ต้องรู้จัก UI
export const hooks = { offer: () => {}, bpChanged: () => {}, researched: (_k: UpgKey) => {}, gameOver: (_r: 'VICTORY' | 'DEFEAT') => {} };

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const rand = <X>(a: X[]): X => a[Math.floor(Math.random() * a.length)];
export const done = (e: Ent) => !(e.build > 0);
export function msg(text: string, col = '#dfe6ee') { if (S.msgs[0]?.text === text) return; S.msgs.unshift({ text, col, t: 7 }); if (S.msgs.length > 6) S.msgs.pop() }

// อัปเกรดมีผลเมื่อ: มีพิมพ์เขียว + วิจัยที่ Lab เสร็จแล้ว
export const upg = (team: number, k: UpgKey) => team < 2 && !!S.teams[team].bp[k] && !!S.teams[team].done[k];
export const hasBld = (team: number, k: NeedKey | 'hq') => S.ents.some(e => e.team === team && e.type === k && e.hp > 0 && done(e));
export function hpMul(team: number, t: UnitType) {
  if (!upg(team, 'nano')) return 1;
  return t.kind === 'inf' ? 1.5 : t.kind === 'veh' ? 1.2 : 1;
}
export function spawn(type: TypeKey, team: number, x: number, y: number): Ent {
  const t = T[type], m = hpMul(team, t);
  const e: Ent = {
    id: S.nid++, type, t, team, x, y, hp: t.hp * m, maxhp: t.hp * m, cd: Math.random(), target: null, forced: false,
    mx: null, my: 0, amove: false, lo: 0, lx: 0, home: { x, y }, ang: team === 1 ? Math.PI * .75 : -Math.PI / 4, sel: false,
    build: 0, buildMax: 0, state: null, ore: null, ret: false, dead: false, lastD: null, stuck: 0, carry: null,
  };
  S.ents.push(e); return e;
}
