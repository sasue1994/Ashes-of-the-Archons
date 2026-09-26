# ASHES OF THE ARCHONS — แผนพัฒนาเกม RTS บน Web Browser

> ชื่อเกม: **Ashes of the Archons**
> แนวเกม: Real-Time Strategy สไตล์ Red Alert 2 + กลไกขุดค้นเทคโนโลยีโบราณ (Field Archeology)
> แพลตฟอร์ม: Desktop web browser (Chrome / Edge / Firefox) ควบคุมด้วยเมาส์ + คีย์บอร์ด

---

## 1. เสาหลักของดีไซน์ (Design Pillars)

1. **ความเร็วและความมันแบบ RA2** — สร้างฐานไว ยูนิตมีบุคลิกชัด แมตช์จบใน 15–25 นาที
2. **โบราณสถานคือหัวใจของแผนที่** — ทุกจังหวะสำคัญของเกมถูกดึงไปรอบวิหาร ไม่ใช่แค่ตั้งรับในฐาน
3. **Hybrid Tech ที่มองเห็นได้** — อัปเกรดแล้วยูนิตต้องเปลี่ยนรูปร่าง/เอฟเฟกต์/การยิงอย่างชัดเจน
4. **สามฝ่ายเล่นต่างกันจริง** — Cartel = ปริมาณ, Syndicate = คุณภาพ, Cult = ฟื้นฟู/ยึดครอง

---

## 2. เทคโนโลยีที่เลือก (Tech Stack)

| ส่วน | เลือกใช้ | เหตุผล |
|---|---|---|
| ภาษา | TypeScript | โค้ดใหญ่ ต้องการ type safety |
| Build | Vite | เร็ว, HMR ดี |
| Rendering | Three.js (WebGL) โมเดล low-poly สร้างด้วยโค้ด + InstancedMesh | ยูนิตชนิดเดียวกันวาดใน draw call เดียว, bloom ให้ของโบราณเรืองแสง (เดิมใช้ PixiJS 2D เก็บไว้ที่ legacy/pixi-render) |
| มุมมอง | กล้อง orthographic มุมเฉียงแบบ RA2 ซูมได้ | ได้ฟีลคลาสสิก ใช้พิกัด sim เดิมทั้งหมด |
| Simulation | Fixed tick 15–20 Hz, deterministic, แยกจาก render | รองรับ replay และ multiplayer lockstep ภายหลัง |
| คณิตศาสตร์ใน sim | Fixed-point (integer) + seeded RNG | กันผลต่าง floating point ข้ามเครื่อง |
| Pathfinding | A* บนกริด + Flow Field สำหรับกลุ่มใหญ่ + separation steering | กองทัพเดินเป็นกลุ่มไม่ติดกัน |
| Audio | Howler.js | เสียงยูนิต/ประกาศเตือน |
| UI (เมนู/HUD) | HTML/CSS overlay | sidebar สร้างสิ่งก่อสร้างแบบ RA2 |
| Multiplayer (เฟสหลัง) | Node.js + WebSocket, lockstep ส่งเฉพาะคำสั่ง | แบนด์วิดท์ต่ำ |
| Map editor (เฟสหลัง) | Tiled (.tmj) หรือ editor ในเกม | ไม่ต้องสร้าง tool เองตั้งแต่แรก |
| Test | Vitest | ทดสอบ sim logic แบบ headless |

---

## 3. สถาปัตยกรรมโค้ด

```
src/
  core/        game loop, fixed tick, seeded RNG, fixed-point math
  sim/         ECS-lite: entities, components, systems (ห้ามอ้าง Pixi)
    systems/   movement, combat, economy, power, production,
               fog, excavation, tech, superweapon
  data/        ข้อมูลยูนิต สิ่งก่อสร้าง ฝ่าย อาวุธ โบราณสถาน แผนที่ (data-driven)
  render/      Pixi: isometric tiles, sprites, effects, fog overlay, minimap
  input/       selection box, commands, hotkeys, control groups
  ui/          sidebar, power bar, credits, relic panel, alerts
  ai/          skirmish AI (build order + attack waves + ruin priority)
  net/         (ภายหลัง) lockstep client
server/        (ภายหลัง) lockstep relay + lobby
```

**หลักการสำคัญ**
- `sim/` ต้องรันแบบ headless ได้ (ใช้ทดสอบ, AI, replay, server)
- ทุกการเปลี่ยนแปลงสถานะเกมมาจาก **Command** (move, attack, build, deploy, scan) ทำให้ได้ replay และ multiplayer มาโดยแทบไม่ต้องทำเพิ่ม
- ค่าสมดุลทั้งหมดอยู่ใน `data/` เพื่อจูนโดยไม่แตะโค้ดระบบ

---

## 4. ระบบหลักของเกม

### 4.1 ระบบพื้นฐาน RTS (แบบ RA2)
- **ทรัพยากร**: แร่ (Ore) เก็บด้วยรถขุด → โรงกลั่น → Credits
- **พลังงาน**: โรงไฟฟ้า; ไฟไม่พอ = ผลิตช้า, ป้อมและเรดาร์ดับ
- **สิ่งก่อสร้าง**: Construction Yard (MCV), โรงไฟฟ้า, โรงกลั่น, ค่ายทหาร, โรงงานรถ, เรดาร์, Reverse-Engineering Lab, ป้อมป้องกัน, กำแพง, Relic Vault
- **Tech Tree**: ปลดล็อกตามสิ่งก่อสร้างที่มี (สายมนุษย์) + ตามพิมพ์เขียวที่ได้ (สายโบราณ)
- **หมอกสงคราม**: Shroud (ยังไม่เคยเห็น) + Fog (เคยเห็นแต่ไม่อัปเดต)
- **คำสั่ง**: เลือกกล่อง, control group (Ctrl+1–9), attack-move, guard, deploy, stop, waypoint
- **Veterancy**: Rookie → Veteran → Elite แบบ RA2

### 4.2 แหล่งโบราณคดี (Excavation Sites)

| ประเภท | จำนวนต่อแผนที่ | ผู้พิทักษ์ | เวลาถอดรหัส | รางวัล |
|---|---|---|---|---|
| **Outpost Ruins** | 4–6 | Automaton Sentinel 2–4 ตัว | 30 วิ | พิมพ์เขียว Tier 1 |
| **Monolith** (ระดับกลาง) | 2 | Sentinel + ป้อมพลังงาน | 45 วิ | พิมพ์เขียว Tier 2 หรือ Relic Fragment |
| **Vault / Citadel** (ใจกลาง) | 1 | บอส Archon Warden + ระบบป้องกัน | 60–90 วิ | Relic Core (ชิ้นส่วนซูเปอร์เวพอน) + Tier 3 |

- ผู้พิทักษ์เป็นฝ่ายกลางที่เป็นศัตรูกับทุกคน มี AI เฝ้าพื้นที่ (leash radius ไม่ไล่ตามไกล)
- ซากที่ถอดรหัสแล้ว **เปิดใช้ซ้ำได้หลังคูลดาวน์** (เช่น 4 นาที) และรางวัลรอบถัดไปลดลง ทำให้ยังมีเหตุผลแย่งกันตลอดเกม

### 4.3 กลไกถอดรหัส (Field Archeology)
1. ส่งยูนิตพิเศษ **Archeologist / Decryption Rig** เข้าไปในวงถอดรหัส แล้วกด Deploy
2. **Holding Phase** เริ่ม:
   - แถบความคืบหน้าแสดงเหนือโบราณสถาน
   - **Beacon Pulse**: เปิดหมอกรอบวิหารให้ทุกฝ่ายเห็น + ประกาศเสียง "Ancient signal detected" + ping บน minimap
   - Rig ต้องอยู่ในวงและรอดชีวิต ถ้าถูกทำลาย ความคืบหน้าค้างไว้และค่อยๆ ลดลง ฝ่ายอื่นเข้ามาถอดรหัสต่อได้
   - ถ้ามียูนิตศัตรูอยู่ในวง = **Contested** ความคืบหน้าหยุด
3. สำเร็จ → ได้พิมพ์เขียว โดยให้ **เลือก 1 จาก 3 ตัวเลือก** จาก pool ของ tier นั้น เพื่อให้มีการตัดสินใจเชิงกลยุทธ์
4. Citadel มีเฟสพิเศษ: บอสตื่นเมื่อความคืบหน้าถึง 50% และปล่อยคลื่น Sentinel

### 4.4 Hybrid Reverse-Engineering
พิมพ์เขียวไม่ได้ให้ยูนิตสำเร็จรูปตรงๆ แต่เป็น **Module** ที่ประกอบเข้ากับ **Chassis** ของมนุษย์

- **Blueprint** → ปลดล็อก **Module** ที่ Reverse-Engineering Lab
- ตัวอย่างการผสาน:
  - รถถังหนักดีเซล + *Particle Reactor Core* → **Railgun Tank**
  - รถบรรทุก + *Swarm Drone Protocol* → **Drone Carrier** ปล่อยฝูงโดรนสังหาร
  - ทหารราบ + *Nano Weave* → เกราะนาโน (+30% HP)
  - ปืนใหญ่ + *Ion Chamber* → **Ion Cannon (Prototype)**
  - ยานเบา + *Anti-Grav Engine* → ลอยข้ามน้ำ/หน้าผาได้
- ในข้อมูลเกม: `unit = chassis + modules[]` แล้วคำนวณ stat และเลือก sprite/เอฟเฟกต์ตาม module
- แต่ละฝ่ายใช้ module เดียวกันได้ผลต่างกัน (ดูข้อ 5)

### 4.4.1 หมวดและระดับของพิมพ์เขียว (ทำแล้วใน prototype)

พิมพ์เขียวแบ่งเป็น 3 หมวด คือ **อาวุธ**, **สิ่งก่อสร้าง** และ **ทรัพยากร**
ระดับความยากในการได้มาขึ้นกับว่าพิมพ์เขียวนั้นช่วยให้ชนะได้มากแค่ไหน ยิ่งแรงยิ่งต้องไปเอาจากซากที่ยาก

| ระดับ | แหล่ง | ผู้พิทักษ์ | ถอดรหัส | อาวุธ | สิ่งก่อสร้าง | ทรัพยากร |
|---|---|---|---|---|---|---|
| T1 | ซากรอบนอก ×4 | Sentinel 3 ตัว | 30 วิ | Energy Rounds (ดาเมจ +30%), Nano Weave (HP +50%/+20%) | Sentinel Pylon (ป้อมเลเซอร์) | Deep-Core Scanner (ขุด Xenite ได้ มูลค่า 3 เท่า) |
| T2 | Monolith ×2 | Obelisk + Sentinel 4 ตัว | 45 วิ | Railgun Tank, Ion Artillery | Barrier Dome (ลดดาเมจในวง 50%) | Ore Transmuter (แร่พื้นฐานได้เงิน 2 เท่า) |
| T3 | วิหารกลาง ×1 | บอส Archon Warden | 60 วิ | Orbital Strike Beacon (ซูเปอร์เวพอน) | - | - |

- ถอดรหัสสำเร็จแล้วเลือกได้ 1 จาก 3 ตัวเลือก โดยพยายามให้มีหนึ่งตัวเลือกจากแต่ละหมวด
- ถ้าไม่มีพิมพ์เขียว **Deep-Core Scanner** รถขุดจะขุดได้เฉพาะแร่พื้นฐาน
- Monolith ที่พิมพ์เขียว T2 หมดแล้ว จะเสนอ T1 ที่ยังขาดแทน ถ้าหมดทุกระดับจะได้เงินแทน

### 4.4.2 ซากถอดรหัสได้ครั้งเดียว (ทำแล้วใน prototype)

ซากแต่ละแห่งถอดรหัสได้ครั้งเดียว แต่มีระบบเสริม 4 อย่างเพื่อให้มีเป้าหมายให้แย่งกันจนจบเกม

1. **ซากตื่นตามเวลา:** ซากรอบนอกเปิดตั้งแต่เริ่ม Monolith ตื่นนาทีที่ 4 วิหารกลางตื่นนาทีที่ 8 เกมประกาศเตือนก่อน 45 วินาทีและเปิดตำแหน่งบนแผนที่
2. **จุดยึดหลังถอดรหัส:** ซากที่ถอดรหัสแล้วเป็นของฝ่ายที่ถอดรหัส ฝ่ายไหนยืนในวงฝ่ายเดียวครบ 10 วินาทีจะยึดได้ ซากรอบนอกให้ $4/วิ Monolith ให้ $8/วิ ส่วนวิหารกลางทำให้ซูเปอร์เวพอนชาร์จเร็วขึ้น 2 เท่า
3. **Data Core ต้องขนกลับฐาน:** ถอดรหัสเสร็จ Rig จะได้ Data Core และวิ่งกลับ Archive Vault เองด้วยความเร็ว 75% ทุกฝ่ายมองเห็น Rig นี้ ถ้าถูกทำลาย Core จะหล่นและ Rig ของฝ่ายไหนก็เก็บได้ ตัวเลือกพิมพ์เขียวจะขึ้นเมื่อส่งถึงฐานแล้ว
4. **Archive Vault:** แต่ละฐานมีคลังเก็บพิมพ์เขียว ถ้าถูกทำลาย พิมพ์เขียว 2 แผ่นที่สุ่มได้จะหล่นให้เก็บ รวมถึง Relic Core ถ้ามี หลังจากนั้นของที่ส่งกลับฐานจะไปที่ Construction Yard แทน

ค่าตัวเลขทั้งหมดอยู่ใน `src/sim/data.ts` (RUIN, WAKE_WARN, CAPTURE_TIME, CARRY_SPEED, CITADEL_SW_BOOST, VAULT_DROP)

### 4.4.3 ต้องสร้างฐานเพื่อใช้ของจากพิมพ์เขียว (ทำแล้วใน prototype)

พิมพ์เขียวคือความรู้ ส่วนอาคารคือกำลังการผลิต ต้องมีทั้งสองอย่างจึงได้ของจริง

| อาคาร | ราคา | ต้องมีก่อน | ปลดล็อก |
|---|---|---|---|
| Barracks | $500 | - | Rifleman |
| War Factory | $1000 | Refinery | Diesel Tank, Harvester, Decryption Rig |
| Reverse-Eng. Lab | $1500 | War Factory | วิจัยอัปเกรด, Railgun Tank, Ion Artillery, Sentinel Pylon, Barrier Dome |

- **อัปเกรดอาวุธต้องวิจัยที่ Lab:** Energy Rounds ใช้ $800 และ 20 วินาที ส่วน Nano Weave ใช้ $1000 และ 25 วินาที ถ้า Lab ถูกทำลาย งานวิจัยจะค้างไว้
- **ยูนิตไฮบริดต้องมีทั้งพิมพ์เขียวและอาคาร:** Railgun Tank และ Ion Artillery ต้องมี War Factory และ Lab ถ้า Lab ถูกทำลาย ผลิตต่อไม่ได้จนกว่าจะสร้างใหม่
- **ยูนิตออกจากอาคารที่ผลิต:** ทหารราบออกจาก Barracks ส่วนรถออกจาก War Factory ถ้าอาคารถูกทำลายระหว่างผลิต คิวจะหยุดรอ
- **พิมพ์เขียวถูกขโมย ผลวิจัยหายไปด้วย:** ถ้า Archive Vault แตกแล้วเสียพิมพ์เขียวไป ผลของงานวิจัยนั้นจะหายจนกว่าจะเก็บพิมพ์เขียวคืนมา แต่ไม่ต้องวิจัยใหม่
- เริ่มเกมด้วยเงิน $2500 มี Construction Yard, Refinery, ป้อมปืน 2 ป้อม และ Archive Vault แต่ยังไม่มี Barracks หรือ War Factory

### 4.5 Superweapon Relic
- เก็บ **Relic Fragment ครบ 3 ชิ้น** (จาก Monolith / Citadel / หรือแย่งจาก Relic Vault ของศัตรู)
- สร้างซูเปอร์เวพอนประจำฝ่าย ชาร์จ 6–7 นาที ทุกฝ่ายได้รับแจ้งเตือนเมื่อสร้างเสร็จและเมื่อพร้อมยิง
- ทำลาย Relic Vault ของศัตรู → Fragment หล่นกลางสนามให้เก็บ เป็นจุดพลิกเกม

### 4.6 เงื่อนไขชนะ
- ทำลายสิ่งก่อสร้างทั้งหมดของศัตรู (มาตรฐาน RA2)
- (โหมดเสริม) **Archon Ascension**: ครอบครอง Citadel ต่อเนื่อง 3 นาทีหลังถอดรหัสสำเร็จ

---

## 5. ฝ่าย (Factions)

### 5.1 The Scavenger Cartel — ปริมาณ/ดัดแปลง
- **เอกลักษณ์**: ยูนิตถูก สร้างไว, ติด module ในสนามได้ (Field Weld) แต่ module มีโอกาส overload เสียหายตัวเอง
- **ยูนิตตัวอย่าง**: Raider Bike (สอดแนม), Scrap Rifleman, Junk Tank, Rocket Buggy, **Drone Carrier**, Salvage Crane (เก็บซากยูนิตเป็นเงิน)
- **หน่วยถอดรหัส**: *Dig Crew* — ช้ากว่าแต่ถูก ส่งได้หลายคัน
- **Superweapon**: **Antimatter Storm** — พายุทำลายวงกว้าง ค่อยๆ ลาม

### 5.2 The Purity Syndicate — คุณภาพ/พลังงาน
- **เอกลักษณ์**: ราคาแพง, มี Shield ที่ฟื้นเองเมื่อไม่โดนยิง, อาวุธเลเซอร์/พลาสมา กินไฟมาก
- **ยูนิตตัวอย่าง**: Recon Hover Drone, Aegis Trooper, Prism Tank, **Railgun Tank**, Barrier Projector (โดมสะท้อนกระสุน), Anti-Grav Gunship
- **หน่วยถอดรหัส**: *Decryption Rig* — เร็วที่สุด 1.5 เท่า มีโล่ในตัว
- **Superweapon**: **Orbital Strike Beacon** — ลำแสงจากวงโคจรเป้าเดียว แรงมาก

### 5.3 The Awakened Cult — ฟื้นฟู/ควบคุมโบราณ
- **เอกลักษณ์**: ทหารราบฟื้น HP เอง, ทรัพยากรรอง **Faith** ได้จากการยืนใกล้โบราณสถาน, **ควบคุม Sentinel/Golem** ของโบราณสถานได้แทนการทำลาย
- **ยูนิตตัวอย่าง**: Seer Hound (สอดแนม), Chip-Grafted Acolyte, Mutant Brute, Bio-Walker, **Awakened Golem** (ได้จาก Citadel)
- **หน่วยถอดรหัส**: *Oracle* — ระหว่างถอดรหัส เปลี่ยน Sentinel ในพื้นที่ให้เป็นพวก
- **Superweapon**: **Resonance Rite** — ปลุก Golem โบราณขึ้นกลางฐานศัตรู + ทำให้ยูนิตในวงมึนงง

### 5.4 ฝ่ายกลาง: ผู้พิทักษ์โบราณ
- **Automaton Sentinel**: หุ่นเฝ้าประตู ยิงเลเซอร์ระยะกลาง
- **Archon Warden** (บอส): HP สูง มีหลายเฟส (โล่ → ปล่อยลูกสมุน → ลำแสงกวาด)

---

## 6. Flow แมตช์ (เป้าหมายจังหวะ)

| เวลา | สิ่งที่เกิด | ระบบที่ต้องรองรับ |
|---|---|---|
| 0–3 นาที | วาง MCV, โรงไฟฟ้า, โรงกลั่น, ส่งมอเตอร์ไซค์/หมาสอดแนมหาวิหาร | Economy, power, fog, scout |
| 3–8 นาที | ยกทัพเบาชิง Outpost, สู้ Sentinel, ได้ Tier 1 เช่นปืนใหญ่ไอออนรุ่นทดลอง | Neutral AI, excavation, blueprint choice |
| 8–15 นาที | ทัพใหญ่ปะทะที่ Citadel แย่ง Relic Core (เช่น คอร์ควบคุมสภาพอากาศ) | Boss, contested zone, beacon reveal |
| 15+ นาที | สร้างซูเปอร์เวพอน ยิงทลายฐาน ปิดเกม | Superweapon, win condition |

---

## 7. แผนงานเป็นเฟส (Milestones)

> ประมาณการสำหรับนักพัฒนา 1 คนทำงานเต็มเวลา ปรับได้ตามขนาดทีม

### Phase 0 — Setup (1 สัปดาห์)
- Vite + TypeScript + PixiJS + Vitest, โครงสร้างโฟลเดอร์ตามข้อ 3
- Game loop แยก fixed tick กับ render interpolation
- **เกณฑ์ผ่าน**: เห็นแผนที่กริด เลื่อนกล้องได้ (edge scroll, ลูกศร, minimap placeholder)

### Phase 1 — Core RTS Prototype (4–6 สัปดาห์)
- เลือกยูนิต (กล่อง/คลิก/control groups), move, attack, attack-move
- Pathfinding A* + separation steering
- Combat: HP, ตาราง armor type × warhead, projectile
- Economy: แร่, รถขุด, โรงกลั่น, credits, พลังงาน
- สิ่งก่อสร้าง + sidebar + การวางอาคาร
- Fog of war
- **เกณฑ์ผ่าน**: เล่นกับ AI พื้นฐานจนทำลายฐานได้ ด้วยกราฟิก placeholder

### Phase 2 — Archeology Vertical Slice (3–4 สัปดาห์) ⭐ หัวใจของเกม
- Neutral Sentinel AI + Outpost Ruins
- Decryption Rig, Holding Phase, beacon reveal, contested logic, แจ้งเตือน
- Blueprint → Module → Hybrid unit 2 ตัว (Railgun Tank, Drone Carrier)
- **เกณฑ์ผ่าน**: playtest แล้วรู้สึกว่า "ต้องออกไปแย่งวิหาร" ถ้ายังไม่สนุกให้ปรับที่เฟสนี้ก่อนไปต่อ

### Phase 3 — สามฝ่าย + Superweapon (5–7 สัปดาห์)
- Roster ฝ่ายละ 8–10 ยูนิต, 10–12 สิ่งก่อสร้าง
- กลไกเฉพาะฝ่าย: Field Weld / Shield / Regen + Faith + ควบคุม Sentinel
- Citadel + บอส Archon Warden
- Relic Fragment, Relic Vault, ซูเปอร์เวพอน 3 แบบ
- **เกณฑ์ผ่าน**: แมตช์เดินครบ flow ข้อ 6 ภายใน 15–25 นาที

### Phase 4 — Skirmish AI + Content (4–5 สัปดาห์)
- AI: build order ตามฝ่าย, ประเมินภัย, ส่งทีมชิงวิหาร, ตอบโต้ beacon ของผู้เล่น, 3 ระดับความยาก
- แผนที่ 3–4 แผ่น (1v1, 2v2, FFA 4 คน)
- ศิลป์จริง: sprite isometric 16 ทิศ, เอฟเฟกต์, เสียง, voice line
- **เกณฑ์ผ่าน**: เล่น skirmish กับ AI ได้ครบทุกฝ่าย

### Phase 5 — Multiplayer (4–6 สัปดาห์)
- Lockstep server (Node + WebSocket), lobby, desync checker (hash state ทุก N tick)
- Replay จาก command log
- **เกณฑ์ผ่าน**: 1v1 ออนไลน์ 20 นาทีไม่ desync

### Phase 6 — Polish / Campaign (ตามต้องการ)
- แคมเปญสั้นต่อฝ่าย, tutorial, balance pass, save/load, ตั้งค่า hotkey

**รวมโดยประมาณ**: ถึง skirmish เล่นได้ครบ (Phase 0–4) ราว 4–6 เดือน, รวม multiplayer ราว 5–7 เดือน

---

## 8. Data Model ตัวอย่าง

```ts
// data/units/railgun_tank.ts
export const railgunTank = {
  id: 'railgun_tank',
  faction: 'syndicate',
  chassis: 'heavy_tank',
  modules: ['particle_reactor_core'],
  cost: 1600, buildTime: 22, power: -50,
  hp: 900, armor: 'heavy', speed: 4,
  weapon: { id: 'railgun', damage: 220, range: 8, rof: 3.0,
            warhead: 'kinetic_ap', pierce: true },
  requires: { buildings: ['war_factory', 'reverse_lab'],
              blueprints: ['bp_particle_core'] },
};

// data/sites/outpost_ruin.ts
export const outpostRuin = {
  id: 'outpost_ruin', tier: 1,
  guardians: [{ unit: 'sentinel', count: 3 }],
  decryptSeconds: 30, captureRadius: 4,
  revealRadius: 10, cooldownSeconds: 240,
  rewardPool: ['bp_nano_weave', 'bp_energy_rounds', 'bp_ion_chamber'],
};
```

---

## 9. งานศิลป์และเสียง

- **สไตล์**: มนุษย์ = สนิม ฝุ่น เหล็กเชื่อม ตัดกับ **โบราณสถาน = หินดำเรขาคณิตเรืองแสงฟ้า/ทอง** ให้ผู้เล่นแยกออกทันทีว่าอะไรคือของโบราณ
- สีประจำฝ่าย: Cartel = ส้มสนิม, Syndicate = ขาว-ฟ้า, Cult = ม่วง-เขียวชีวภาพ
- ขั้นตอน: placeholder รูปทรงเรขาคณิต → โมเดล 3D (Blender) render เป็น sprite sheet 16 ทิศ → texture atlas
- เสียง: voice line ยูนิตสั้นมีบุคลิกแบบ RA2, ประกาศเตือน beacon และซูเปอร์เวพอน

---

## 10. ความเสี่ยงและการรับมือ

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| Pathfinding ยูนิตเยอะแล้วช้า | FPS ตก | Flow field, กระจายการคำนวณ path หลาย tick, จำกัดยูนิตราว 300 |
| Desync ใน multiplayer | เล่นออนไลน์ไม่ได้ | Fixed-point + seeded RNG ตั้งแต่ Phase 0, ทดสอบ state hash |
| ขอบเขตงานใหญ่เกิน | ไม่เสร็จ | ทำ vertical slice Phase 2 ก่อน, ให้ฝ่ายเดียวเล่นได้ก่อนเพิ่มฝ่าย |
| งานศิลป์ isometric 3 ฝ่ายหนัก | ล่าช้า | ใช้ placeholder ให้นาน, ใช้ pipeline 3D → sprite |
| วิหารทำให้ฝ่ายนำ snowball | เกมจบเร็วเกิน | คูลดาวน์ซาก, beacon เปิดตำแหน่ง, Fragment แย่งคืนได้ |

---

## 11. ขั้นตอนถัดไป

1. ยืนยันชื่อเกม, มุมมองของ prototype (isometric หรือ top-down) และเป้าหมายแรก (single-player skirmish ก่อน หรือ multiplayer)
2. เริ่ม Phase 0: scaffold โปรเจกต์ Vite + TypeScript + PixiJS
3. ทำ Phase 1 ด้วยกราฟิก placeholder แล้วเข้า Phase 2 (ระบบถอดรหัส) ให้เร็วที่สุด เพราะเป็นจุดขายที่ต้องพิสูจน์ว่าสนุก
