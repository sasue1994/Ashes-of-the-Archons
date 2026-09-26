import { initAnalytics } from './analytics';
import { tr } from './sim/i18n';
import { centerOn } from './render/camera';
import { canvas, initScene, renderScene } from './render/scene3d';
import { computeFog, exp, vis } from './sim/fog';
import { S, msg } from './sim/state';
import { update } from './sim/update';
import { initWorld } from './sim/world';
import { drawMini, hudUpdate, initHud } from './ui/hud';
import { initExit, ui } from './ui/exit';
import { initInput, scrollCam } from './ui/input';
import './style.css';

initAnalytics();
initWorld();
initScene(document.getElementById('game')!);
initInput(canvas());
initHud();
initExit();

centerOn(500, 1900); computeFog();
// โหมดทดสอบ (เฉพาะ dev): เปิด /#reveal หรือ /#reveal@1600,1200 เพื่อดูทั้งแผนที่
const reveal = import.meta.env.DEV && location.hash.startsWith('#reveal');
if (reveal) { const m = location.hash.match(/@(\d+),(\d+)/); if (m) centerOn(+m[1], +m[2]) }
msg(tr('ส่งหน่วยสอดแนมหาซากโบราณ กำจัดผู้พิทักษ์ แล้วส่งรถถอดรหัสเข้าวงถอดรหัส', 'Scout for ancient ruins, clear the guardians, then send a Rig into the ring'), '#3ff0d8');

let uiT = 0, last = performance.now();
function frame(t: number) {
  // เวลาของ rAF เฟรมแรกอาจน้อยกว่า performance.now() ตอนโหลด → กันไม่ให้ dt ติดลบ
  const dt = Math.min(.05, Math.max(0, (t - last) / 1000)), now = t / 1000; last = t;
  requestAnimationFrame(frame);
  if (ui.ended) return; // ออกจากเกมแล้ว: หยุดทั้ง sim และการวาดภาพ
  if (!ui.paused) scrollCam(dt);
  if (!S.over && S.started && !ui.paused) update(dt); // รอผู้เล่นเลือกระดับ AI ก่อน / หยุดชั่วคราวตอนถามว่าจะออกไหม
  if (reveal) { vis.fill(1); exp.fill(1) }
  renderScene(now);
  drawMini(now);
  uiT -= dt; if (uiT <= 0) { uiT = .15; hudUpdate() }
}
requestAnimationFrame(frame);
// เฟรมแรกวาดเสร็จแล้ว (callback ต่อจาก frame) → เอาหน้าโหลดออก
requestAnimationFrame(() => document.documentElement.classList.add('ready'));
