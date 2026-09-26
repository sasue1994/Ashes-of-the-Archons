// ============================================================
// ออกจากเกม: ถามยืนยัน (หยุดเกมชั่วคราวระหว่างถาม) → หน้าขอบคุณ + QR PromptPay สำหรับสนับสนุน
// เบราว์เซอร์ไม่ยอมให้สคริปต์ปิดแท็บเอง หน้าขอบคุณจึงเป็นจุดจบของเกม (กด "เล่นอีกครั้ง" = โหลดหน้าใหม่)
// ============================================================
import qrUrl from '../assets/promptpay-qr.png';

// paused = หยุดอัปเดตเกม · ended = ออกแล้ว หยุดวาดภาพด้วย (ประหยัดแบตเตอรี่)
export const ui = { paused: false, ended: false };

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on: boolean) => $(id).classList.toggle('hide', !on);

function askQuit() { ui.paused = true; show('quit', true); ($('quitNo') as HTMLButtonElement).focus() }
function cancelQuit() { ui.paused = false; show('quit', false) }
export function leaveGame() {
  ui.paused = ui.ended = true;
  show('quit', false); $('over').style.display = 'none'; show('bye', true);
  document.body.classList.remove('side-open');
}

export function initExit() {
  ($('ppqr') as HTMLImageElement).src = qrUrl;
  $('quitBtn').onclick = askQuit;
  $('quitYes').onclick = leaveGame;
  $('quitNo').onclick = cancelQuit;
  $('overQuit').onclick = leaveGame;
  $('byeAgain').onclick = () => location.reload();
  addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('quit').classList.contains('hide')) cancelQuit() });
}
