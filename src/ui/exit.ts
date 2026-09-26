// ============================================================
// ออกจากเกม: ถามยืนยัน (หยุดเกมชั่วคราวระหว่างถาม) → กลับหน้า landing ตรงส่วนสนับสนุน (QR PromptPay)
// ?from=game ให้ landing แสดงข้อความขอบคุณ · ไปหน้าภาษาเดียวกับที่เล่นอยู่
// ============================================================
import { i18n } from '../sim/i18n';

// paused = หยุดอัปเดตเกม · ended = ออกแล้ว หยุดวาดภาพด้วย (ระหว่างรอโหลดหน้า landing)
export const ui = { paused: false, ended: false };

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on: boolean) => $(id).classList.toggle('hide', !on);

function askQuit() { ui.paused = true; show('quit', true); ($('quitNo') as HTMLButtonElement).focus() }
function cancelQuit() { ui.paused = false; show('quit', false) }
export function leaveGame() {
  ui.paused = ui.ended = true;
  location.href = (i18n.lang === 'en' ? '../en/' : '../') + '?from=game#support';
}

export function initExit() {
  $('quitBtn').onclick = askQuit;
  $('quitYes').onclick = leaveGame;
  $('quitNo').onclick = cancelQuit;
  $('overQuit').onclick = leaveGame;
  addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('quit').classList.contains('hide')) cancelQuit() });
}
