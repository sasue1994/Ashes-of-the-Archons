import { i18n } from './i18n';
// ข้อมูลเกมล้วน ไม่มีตรรกะ ปรับสมดุลได้ที่นี่ที่เดียว
export const W = 3200, H = 2400, CELL = 50, GW = W / CELL, GH = H / CELL;
export const TEAM_COL = ['#3d8bff', '#ff4a2e', '#27f2d0'];

export type Kind = 'inf' | 'veh' | 'neu' | 'bld';
export type BPKey = 'rounds' | 'nano' | 'pylon' | 'scanner' | 'rail' | 'ion' | 'dome' | 'transmuter';
// อาคารที่เป็นเงื่อนไขของการผลิต/วิจัย (ต้องสร้างเสร็จและยังไม่ถูกทำลาย)
export type NeedKey = 'ref' | 'barracks' | 'factory' | 'lab';

export interface UnitType {
  name: string; en: string; role: string; // ชื่อไทย (แสดงในเกม) / ชื่ออังกฤษ / บทบาทสั้นๆ บนปุ่ม
  kind: Kind; hp: number; r: number; sight: number;
  speed: number; range: number; dmg: number; rof: number; splash: number;
  cost: number; time: number; aura: number;
  beam: boolean; fixed: boolean; bld: boolean; req?: BPKey;
  missile: number;        // > 0 = ยิงจรวดจริงที่บินไปหาเป้า จำนวนลูกต่อชุด (dmg คือดาเมจต่อลูก)
  vsInf: number; vsArmor: number; // ตัวคูณดาเมจกับทหารราบ / กับรถและอาคาร
  needs: NeedKey[];      // อาคารที่ต้องมีก่อนจึงผลิต/สร้างได้
  from?: 'barracks' | 'factory'; // ยูนิตออกจากอาคารไหน
}
type Def = Partial<UnitType> & Pick<UnitType, 'name' | 'hp' | 'r' | 'sight'>;
// ชื่อไทย + บทบาท (ผู้เล่นส่วนใหญ่อ่านชื่ออังกฤษไม่ออก) ชื่ออังกฤษเดิมย้ายไปอยู่ใน en
const TH: Record<string, [string, string]> = {
  rifle: ['ทหารไรเฟิล', 'ทหารราบ สู้ทหารราบ'], tank: ['รถถังดีเซล', 'รถถังหลัก สู้ได้ทุกอย่าง'], rocket: ['รถถังจรวด', 'ต่อต้านรถถังและอาคาร'],
  harv: ['รถขุดแร่', 'เก็บแร่หาเงิน'], rig: ['รถถอดรหัส', 'ถอดรหัสซากโบราณ'], rail: ['รถถังเรลกัน', 'ยิงไกล แรงมาก'], ion: ['ปืนใหญ่ไอออน', 'ยิงไกลสุด ระเบิดเป็นวง'],
  sentinel: ['หุ่นเฝ้ายาม', 'ผู้พิทักษ์ซาก'], obelisk: ['เสาโอเบลิสก์', 'ผู้พิทักษ์ซาก'], warden: ['ผู้คุมวิหาร', 'บอสวิหารกลาง'],
  hq: ['ศูนย์บัญชาการ', 'หัวใจของฐาน'], ref: ['โรงกลั่นแร่', 'รับแร่จากรถขุด'], barracks: ['ค่ายทหาร', 'ฝึกทหารราบ'], factory: ['โรงงานยานเกราะ', 'ผลิตรถทุกชนิด'],
  lab: ['ห้องแล็บ', 'วิจัย + ยูนิตไฮบริด'], turret: ['ป้อมปืน', 'ป้องกันฐาน'], pylon: ['เสาเลเซอร์', 'ป้องกันระยะไกล'], dome: ['โดมพลังงาน', 'ลดดาเมจในวง 50%'],
  vault: ['คลังพิมพ์เขียว', 'เก็บพิมพ์เขียว'],
};
const mk = (d: Def): UnitType => ({
  kind: 'bld', speed: 0, range: 0, dmg: 0, rof: 0, splash: 0, cost: 0, time: 0, aura: 0,
  beam: false, fixed: false, bld: d.kind == null, needs: [], missile: 0, vsInf: 1, vsArmor: 1, en: d.name, role: '', ...d,
});

const defs = {
  rifle: mk({ name: 'Rifleman', hp: 60, r: 9, speed: 60, range: 120, dmg: 9, rof: .8, cost: 100, time: 3, sight: 250, kind: 'inf', needs: ['barracks'], from: 'barracks' }),
  tank: mk({ name: 'Diesel Tank', hp: 320, r: 13, speed: 48, range: 160, dmg: 32, rof: 1.6, cost: 450, time: 7, sight: 250, kind: 'veh', needs: ['factory'], from: 'factory' }),
  // รถถังจรวด: ยิงจรวดคู่ แรงกับรถ/อาคาร อ่อนกับทหารราบ (เทคโนโลยีมนุษย์ ไม่ต้องใช้พิมพ์เขียว)
  rocket: mk({ name: 'Rocket Tank', hp: 260, r: 13, speed: 52, range: 240, dmg: 26, splash: 8, rof: 2.2, cost: 650, time: 8, sight: 270, kind: 'veh', missile: 2, vsInf: .35, vsArmor: 1.4, needs: ['factory'], from: 'factory' }),
  harv: mk({ name: 'Harvester', hp: 300, r: 14, speed: 52, cost: 600, time: 8, sight: 200, kind: 'veh', needs: ['factory'], from: 'factory' }),
  rig: mk({ name: 'Decryption Rig', hp: 180, r: 12, speed: 58, cost: 500, time: 7, sight: 250, kind: 'veh', needs: ['factory'], from: 'factory' }),
  rail: mk({ name: 'Railgun Tank', hp: 480, r: 14, speed: 42, range: 270, dmg: 120, rof: 2.6, cost: 900, time: 11, sight: 290, kind: 'veh', req: 'rail', beam: true, needs: ['factory', 'lab'], from: 'factory' }),
  ion: mk({ name: 'Ion Artillery', hp: 220, r: 13, speed: 38, range: 340, dmg: 70, splash: 70, rof: 3.2, cost: 800, time: 10, sight: 260, kind: 'veh', req: 'ion', needs: ['factory', 'lab'], from: 'factory' }),
  sentinel: mk({ name: 'Automaton Sentinel', hp: 220, r: 11, speed: 45, range: 150, dmg: 14, rof: 1, sight: 200, kind: 'neu' }),
  obelisk: mk({ name: 'Archon Obelisk', hp: 1100, r: 17, range: 250, dmg: 32, rof: 1.5, sight: 260, kind: 'neu', fixed: true, beam: true }),
  warden: mk({ name: 'Archon Warden', hp: 3000, r: 28, speed: 30, range: 220, dmg: 45, splash: 50, rof: 1.4, sight: 260, kind: 'neu' }),
  hq: mk({ name: 'Construction Yard', hp: 2500, r: 42, sight: 380 }),
  ref: mk({ name: 'Refinery', hp: 1000, r: 30, sight: 300, cost: 1200, time: 10 }),
  barracks: mk({ name: 'Barracks', hp: 800, r: 26, sight: 280, cost: 500, time: 6 }),
  factory: mk({ name: 'War Factory', hp: 1400, r: 34, sight: 300, cost: 1000, time: 10, needs: ['ref'] }),
  lab: mk({ name: 'Reverse-Eng. Lab', hp: 1000, r: 28, sight: 300, cost: 1500, time: 14, needs: ['factory'] }),
  turret: mk({ name: 'Gun Turret', hp: 700, r: 18, range: 220, dmg: 22, rof: 1, sight: 300, cost: 600, time: 6 }),
  pylon: mk({ name: 'Sentinel Pylon', hp: 900, r: 16, range: 290, dmg: 30, rof: .9, sight: 330, beam: true, cost: 800, time: 8, req: 'pylon', needs: ['lab'] }),
  dome: mk({ name: 'Barrier Dome', hp: 800, r: 20, sight: 260, cost: 1200, time: 12, req: 'dome', aura: 230, needs: ['lab'] }),
  vault: mk({ name: 'Archive Vault', hp: 1500, r: 26, sight: 300 }),
};
export type TypeKey = keyof typeof defs;
for (const [k, [th, role]] of Object.entries(TH)) { const t = (defs as Record<string, UnitType>)[k]; if (t) { t.name = th; t.role = role } }
export const T: Record<TypeKey, UnitType> = defs;

export const BUILD: TypeKey[] = ['rifle', 'tank', 'rocket', 'harv', 'rig', 'rail', 'ion'];
export const PLACE: TypeKey[] = ['barracks', 'factory', 'ref', 'lab', 'turret', 'pylon', 'dome'];

// อัปเกรดอาวุธจากพิมพ์เขียว: ได้พิมพ์เขียวแล้วต้องวิจัยที่ Lab ก่อนจึงมีผล
// (ถ้าพิมพ์เขียวถูกขโมยไป ผลของงานวิจัยจะหายจนกว่าจะเอาพิมพ์เขียวคืนมา)
export type UpgKey = 'rounds' | 'nano';
export const UPG: Record<UpgKey, { cost: number; time: number }> = {
  rounds: { cost: 800, time: 20 },
  nano: { cost: 1000, time: 25 },
};
export const UPG_KEYS = Object.keys(UPG) as UpgKey[];

// หมวดพิมพ์เขียว: W=อาวุธ B=สิ่งก่อสร้าง R=ทรัพยากร
export type Cat = 'W' | 'B' | 'R';
export const CAT: Record<Cat, { n: string; c: string }> = {
  W: { n: 'อาวุธ', c: '#ff8a7a' }, B: { n: 'สิ่งก่อสร้าง', c: '#8fd0ff' }, R: { n: 'ทรัพยากร', c: '#ffd35a' },
};
// tier = ความยากของซากที่ให้พิมพ์เขียวนี้ ยิ่งช่วยให้ชนะมาก tier ยิ่งสูง
export const BP: Record<BPKey, { tier: number; cat: Cat; name: string; en: string; desc: string }> = {
  rounds: { tier: 1, cat: 'W', name: 'กระสุนพลังงาน', en: 'Energy Rounds', desc: 'วิจัยที่ห้องแล็บ: ทหารไรเฟิลและรถถังดีเซล ดาเมจ +30%' },
  nano: { tier: 1, cat: 'W', name: 'เกราะนาโน', en: 'Nano Weave', desc: 'วิจัยที่ห้องแล็บ: เลือดทหารราบ +50% รถ +20%' },
  pylon: { tier: 1, cat: 'B', name: 'แบบเสาเลเซอร์', en: 'Sentinel Pylon', desc: 'สร้างเสาเลเซอร์โบราณได้ (ต้องมีห้องแล็บ)' },
  scanner: { tier: 1, cat: 'R', name: 'เครื่องสแกนแร่ลึก', en: 'Deep-Core Scanner', desc: 'รถขุดแร่ขุดแร่ม่วง (Xenite) ได้ มูลค่า 3 เท่า' },
  rail: { tier: 2, cat: 'W', name: 'แกนปฏิกรณ์อนุภาค', en: 'Particle Reactor Core', desc: 'ปลดล็อกรถถังเรลกัน (ต้องมีโรงงานยานเกราะ + ห้องแล็บ)' },
  ion: { tier: 2, cat: 'W', name: 'ห้องเร่งไอออน', en: 'Ion Chamber', desc: 'ปลดล็อกปืนใหญ่ไอออน (ต้องมีโรงงานยานเกราะ + ห้องแล็บ)' },
  dome: { tier: 2, cat: 'B', name: 'แบบโดมพลังงาน', en: 'Barrier Dome', desc: 'สร้างโดมพลังงาน ลดดาเมจในวง 50% (ต้องมีห้องแล็บ)' },
  transmuter: { tier: 2, cat: 'R', name: 'เครื่องแปรรูปแร่', en: 'Ore Transmuter', desc: 'แปรรูปแร่พื้นฐาน ได้เงินเพิ่ม 2 เท่า' },
};
export const BP_KEYS = Object.keys(BP) as BPKey[];

export type RuinKind = 'outpost' | 'monolith' | 'citadel';
// wake = วินาทีที่ซากตื่น (ถอดรหัสได้ครั้งเดียว), income = เงินต่อวินาทีระหว่างครอบครองหลังถอดรหัสแล้ว
export interface RuinDef { name: string; tier: number; r: number; need: number; wake: number; income: number; cash: number; col: string }
export const RUIN: Record<RuinKind, RuinDef> = {
  outpost: { name: 'ซากรอบนอก', tier: 1, r: 90, need: 30, wake: 0, income: 4, cash: 800, col: '#3ff0d8' },
  monolith: { name: 'โมโนลิธ', tier: 2, r: 100, need: 45, wake: 240, income: 8, cash: 1500, col: '#ffcf5a' },
  citadel: { name: 'วิหารกลาง', tier: 3, r: 130, need: 60, wake: 480, income: 0, cash: 0, col: '#ff5ad2' },
};
export const TIER_COL = ['', RUIN.outpost.col, RUIN.monolith.col, RUIN.citadel.col];

// ---------- ซากครั้งเดียว + จุดยึด + ขนข้อมูลกลับฐาน ----------
export const WAKE_WARN = 45;      // เตือนล่วงหน้ากี่วินาทีก่อนซากตื่น
export const CAPTURE_TIME = 10;   // ยืนในวงคนเดียวกี่วินาทีจึงยึดซากที่ถอดรหัสแล้ว
export const CARRY_SPEED = .75;   // ความเร็วของ Rig ที่ขน Data Core
export const CITADEL_SW_BOOST = 2; // ครอบครองวิหารกลาง = ซูเปอร์เวพอนชาร์จเร็วขึ้นกี่เท่า
export const VAULT_DROP = 2;      // Archive Vault แตก พิมพ์เขียวหล่นกี่แผ่น

// ---------- ระดับความยากของ AI ----------
// ไม่มีการโกงเรื่องพลังยูนิต ต่างกันที่ความเร็วคิด ขนาดคลื่นบุก รายได้โบนัส และพฤติกรรมที่เปิดใช้
export type AiLevel = 'easy' | 'normal' | 'hard';
export interface AiParams {
  name: string; desc: string; col: string;
  income: number;      // เงินโบนัสต่อวินาที
  startBonus: number;  // เงินเริ่มต้นเพิ่ม
  think: number;       // ตัดสินใจทุกกี่วินาที
  grace: number;       // ช่วงแรกของเกม (วินาที) ที่ยังไม่บุกฐานผู้เล่น (แต่ยังแย่งซากได้)
  wave: number; waveStep: number; waveMax: number; // ขนาดทัพที่รอก่อนบุก และเพิ่มทีละเท่าไรหลังบุกฐาน
  respond: boolean;    // ยกทัพไปขัดตอนผู้เล่นถอดรหัส
  hunt: number;        // ระยะที่ยอมไล่ดัก Rig ขน Data Core (0 = ไม่ดัก)
  pickup: boolean;     // ส่ง Rig ไปเก็บของที่หล่น
  research: boolean;   // วิจัยอัปเกรดที่ Lab
  turrets: number;     // จำนวนป้อมปืนที่สร้างเพิ่ม
  harvs: number;       // จำนวนรถขุดแร่ที่รักษาไว้ (เศรษฐกิจ)
  queue: number;       // จำนวนยูนิตในคิวผลิตพร้อมกัน
  armyMax: number;     // ทัพสูงสุด (ยูนิตรบ) ครบแล้วหยุดผลิต · ต่ำกว่า 12 = ไม่มีวันไปตีวิหารกลาง (ไม่ได้ซูเปอร์เวพอน)
  units: TypeKey[];    // ยูนิตที่สุ่มผลิต (ซ้ำ = โอกาสมากขึ้น)
}
export const AI_LEVELS: Record<AiLevel, AiParams> = {
  easy: {
    name: 'ง่าย', desc: 'ไม่บุกฐาน 8 นาทีแรก ทัพเล็ก (ไม่เกิน 8) รถขุดแร่คันเดียว ผลิตทีละคัน ไม่มีซูเปอร์เวพอน ไม่ดักรถถอดรหัส ไม่วิจัย', col: '#7dff9a',
    income: 0, startBonus: 0, think: 4, grace: 480, wave: 6, waveStep: 1, waveMax: 8, respond: false, hunt: 0, pickup: false, research: false, turrets: 0,
    harvs: 1, queue: 1, armyMax: 8,
    units: ['rifle', 'rifle', 'rifle', 'rifle', 'tank', 'tank'],
  },
  normal: {
    name: 'ปกติ', desc: 'ไม่บุกฐาน 5 นาทีแรก ทัพไม่เกิน 14 แย่งซาก ขัดการถอดรหัส ดักรถถอดรหัสใกล้ๆ วิจัยอัปเกรด', col: '#f2a93b',
    income: 2, startBonus: 0, think: 2, grace: 300, wave: 6, waveStep: 2, waveMax: 12, respond: true, hunt: 900, pickup: true, research: true, turrets: 2,
    harvs: 2, queue: 1, armyMax: 14,
    units: ['rifle', 'rifle', 'rifle', 'tank', 'tank', 'rocket', 'rail', 'ion'],
  },
  hard: {
    name: 'ยาก', desc: 'บุกฐานตั้งแต่นาทีที่ 2 คิดเร็ว เงินโบนัสสูง ดักรถถอดรหัสทั่วแผนที่ เน้นยูนิตไฮบริด', col: '#ff4a2e',
    income: 14, startBonus: 1000, think: .8, grace: 120, wave: 5, waveStep: 3, waveMax: 22, respond: true, hunt: 2400, pickup: true, research: true, turrets: 4,
    harvs: 2, queue: 2, armyMax: 99,
    units: ['rifle', 'tank', 'tank', 'rocket', 'rocket', 'rail', 'rail', 'rail', 'ion', 'ion'],
  },
};

// ---------- ภาษา: ข้อความอังกฤษของตารางด้านบน + สลับชื่อในตารางตามภาษาที่เลือก ----------
// ค่าภาษาไทยเดิมถูกเก็บไว้ตอนสลับครั้งแรก ทุกที่ที่อ่าน .name/.role/.desc จึงได้ภาษาปัจจุบันเอง
const ROLE_EN: Record<string, string> = {
  rifle: 'Infantry, anti-infantry', tank: 'Main battle tank', rocket: 'Anti-armor and buildings', harv: 'Mines ore for money',
  rig: 'Decrypts ancient ruins', rail: 'Long range, heavy hit', ion: 'Longest range, splash', sentinel: 'Ruin guardian',
  obelisk: 'Ruin guardian', warden: 'Citadel boss', hq: 'Heart of your base', ref: 'Receives ore', barracks: 'Trains infantry',
  factory: 'Builds all vehicles', lab: 'Research + hybrid units', turret: 'Base defense', pylon: 'Long-range defense',
  dome: '-50% damage inside', vault: 'Stores blueprints',
};
const BP_DESC_EN: Record<BPKey, string> = {
  rounds: 'Lab research: Rifleman and Diesel Tank +30% damage', nano: 'Lab research: infantry HP +50%, vehicles +20%',
  pylon: 'Build ancient laser pylons (needs Lab)', scanner: 'Harvesters can mine purple Xenite, 3x value',
  rail: 'Unlocks Railgun Tank (needs War Factory + Lab)', ion: 'Unlocks Ion Artillery (needs War Factory + Lab)',
  dome: 'Build Barrier Dome, -50% damage inside (needs Lab)', transmuter: 'Refine basic ore for 2x money',
};
const RUIN_EN: Record<RuinKind, string> = { outpost: 'Outpost Ruins', monolith: 'Monolith', citadel: 'Citadel' };
const CAT_EN: Record<Cat, string> = { W: 'Weapon', B: 'Building', R: 'Resource' };
const AI_EN: Record<AiLevel, [string, string]> = {
  easy: ['Easy', 'No base attacks for 8 min, small army (max 8), one Harvester, trains one unit at a time, no superweapon, no Rig hunting, no research'],
  normal: ['Normal', 'No base attacks for 5 min, army up to 14, contests ruins, disrupts decryption, hunts nearby Rigs, researches upgrades'],
  hard: ['Hard', 'Attacks from minute 2, fast, big bonus money, hunts Rigs map-wide, favors hybrid units'],
};
const thSaved = new Map<object, Record<string, string>>();
function swap(obj: object, en: Record<string, string>) {
  const o = obj as Record<string, string>;
  if (!thSaved.has(o)) { const th: Record<string, string> = {}; for (const f in en) th[f] = o[f]; thSaved.set(o, th) }
  const th = thSaved.get(o)!; for (const f in en) o[f] = i18n.lang === 'en' ? en[f] : th[f];
}
export function applyDataLang() {
  for (const [k, t] of Object.entries(T)) swap(t, { name: t.en, role: ROLE_EN[k] ?? '' });
  for (const k of BP_KEYS) swap(BP[k], { name: BP[k].en, desc: BP_DESC_EN[k] });
  for (const k of Object.keys(RUIN) as RuinKind[]) swap(RUIN[k], { name: RUIN_EN[k] });
  for (const c of Object.keys(CAT) as Cat[]) swap(CAT[c], { n: CAT_EN[c] });
  for (const l of Object.keys(AI_LEVELS) as AiLevel[]) swap(AI_LEVELS[l], { name: AI_EN[l][0], desc: AI_EN[l][1] });
}
