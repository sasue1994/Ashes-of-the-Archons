import { H, W } from '../sim/data';

// กล้องมุมเฉียงแบบ RA2 (orthographic หันหน้าไปทิศเหนือตลอด ไม่หมุน)
// x,y,w,h = กรอบพื้นดินที่มองเห็นในพิกัดโลก · sw,sh = ขนาดจอเกม (CSS px) · zoom = px ต่อ 1 หน่วยโลกตามแนวนอน
// พื้นดินแนวลึกถูกบีบด้วย sin(PITCH) ตอนฉายลงจอ
export const PITCH = .82, SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
export const cam = { x: 0, y: 0, w: 800, h: 600, sw: 800, sh: 600, zoom: 1.45 };
export const ZOOM_MIN = .6, ZOOM_MAX = 2.8;

function fit() { cam.w = cam.sw / cam.zoom; cam.h = cam.sh / (cam.zoom * SIN) }
export function clampCam() {
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom)); fit();
  cam.x = cam.w >= W ? (W - cam.w) / 2 : Math.max(0, Math.min(W - cam.w, cam.x));
  cam.y = cam.h >= H ? (H - cam.h) / 2 : Math.max(0, Math.min(H - cam.h, cam.y));
}
export function setScreen(sw: number, sh: number) { const cx = cam.x + cam.w / 2, cy = cam.y + cam.h / 2; cam.sw = sw; cam.sh = sh; fit(); centerOn(cx, cy) }
export function centerOn(x: number, y: number) { fit(); cam.x = x - cam.w / 2; cam.y = y - cam.h / 2; clampCam() }
// ซูมโดยให้จุดใต้เคอร์เซอร์อยู่ที่เดิม
export function zoomAt(sx: number, sy: number, k: number) {
  const p = toWorld(sx, sy); cam.zoom *= k; clampCam();
  cam.x = p.x - sx / cam.zoom; cam.y = p.y - sy / (cam.zoom * SIN); clampCam();
}
// เลื่อนกล้องตามการลากบนจอ (หน่วย px)
export function panBy(dx: number, dy: number) { cam.x -= dx / cam.zoom; cam.y -= dy / (cam.zoom * SIN); clampCam() }

// แปลงพิกัด: จอ ↔ พื้นดิน (y = 0) · h = ความสูงเหนือพื้นของจุดที่ฉาย
export const toWorld = (sx: number, sy: number) => ({ x: cam.x + sx / cam.zoom, y: cam.y + sy / (cam.zoom * SIN) });
export const toScreen = (x: number, y: number, h = 0) => ({ x: (x - cam.x) * cam.zoom, y: ((y - cam.y) * SIN - h * COS) * cam.zoom });
