import { tr } from './sim/i18n';
import { centerOn } from './render/camera';
import { canvas, initScene, renderScene } from './render/scene3d';
import { computeFog, exp, vis } from './sim/fog';
import { S, msg } from './sim/state';
import { update } from './sim/update';
import { initWorld } from './sim/world';
import { drawMini, hudUpdate, initHud } from './ui/hud';
import { initInput, scrollCam } from './ui/input';
import './style.css';

initWorld();
initScene(document.getElementById('game')!);
initInput(canvas());
initHud();

centerOn(500, 1900); computeFog();
// โหมดทดสอบ (เฉพาะ dev): เปิด /#reveal หรือ /#reveal@1600,1200 เพื่อดูทั้งแผนที่
const reveal = import.meta.env.DEV && location.hash.startsWith('#reveal');
if (reveal) { const m = location.hash.match(/@(\d+),(\d+)/); if (m) centerOn(+m[1], +m[2]) }
msg(tr('ส่งหน่วยสอดแนมหาซากโบราณ กำจัดผู้พิทักษ์ แล้วส่งรถถอดรหัสเข้าวงถอดรหัส', 'Scout for ancient ruins, clear the guardians, then send a Rig into the ring'), '#3ff0d8');

let uiT = 0, last = performance.now();
function frame(t: number) {
  const dt = Math.min(.05, (t - last) / 1000), now = t / 1000; last = t;
  scrollCam(dt);
  if (!S.over && S.started) update(dt); // รอผู้เล่นเลือกระดับ AI ก่อน
  if (reveal) { vis.fill(1); exp.fill(1) }
  renderScene(now);
  drawMini(now);
  uiT -= dt; if (uiT <= 0) { uiT = .15; hudUpdate() }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
