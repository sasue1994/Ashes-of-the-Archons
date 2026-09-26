// หน้า landing (/ และ /en/): นับการกดปุ่มเล่น + แสดงยอดผู้เข้าชม/ผู้เล่นจาก /api/stats
import { initAnalytics, track } from '../analytics';
import './landing.css';

initAnalytics();

const lang = document.documentElement.lang === 'en' ? 'en' : 'th';
// ให้เกมเปิดมาเป็นภาษาเดียวกับหน้า landing (เกมอ่านค่านี้ตอนเริ่ม)
try { localStorage.setItem('archon.lang', lang) } catch { /* ไม่มี storage */ }

// ทุกปุ่มที่มี data-play = ปุ่มเข้าเกม (data-play บอกตำแหน่งปุ่ม เช่น hero/header/final)
document.querySelectorAll<HTMLAnchorElement>('a[data-play]').forEach(a =>
  a.addEventListener('click', () => track('play_click', { location: a.dataset.play || 'unknown', lang })));
document.querySelectorAll<HTMLAnchorElement>('a[data-donate]').forEach(a =>
  a.addEventListener('click', () => track('donate_click', { method: a.dataset.donate || 'unknown', lang })));

let fromGame = false;
// ออกจากเกมแล้วถูกส่งมาที่ ?from=game#support → แสดงคำขอบคุณ แล้วลบ query ออกจาก URL (รีเฟรช/แชร์ลิงก์จะไม่ขึ้นซ้ำ)
if (new URLSearchParams(location.search).get('from') === 'game') {
  document.querySelector<HTMLElement>('#support .thanks')?.removeAttribute('hidden');
  history.replaceState(null, '', location.pathname + location.hash);
  fromGame = true;
  document.getElementById('support')?.scrollIntoView();
}

type Stats = { pageViews: number; playClicks: number; players: number; updatedAt: string };

async function loadStats() {
  const box = document.getElementById('stats');
  if (!box) return;
  try {
    const r = await fetch('/api/stats', { headers: { accept: 'application/json' } });
    if (!r.ok) return;
    const s = await r.json() as Stats;
    if (!s.pageViews && !s.playClicks && !s.players) return; // ยังไม่มีข้อมูล: ไม่โชว์ 0 ให้ดูเงียบ
    const fmt = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'th-TH');
    for (const k of ['pageViews', 'playClicks', 'players'] as const) {
      const el = box.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (el) el.textContent = fmt.format(s[k]);
    }
    const upd = box.querySelector<HTMLElement>('.upd');
    if (upd) upd.textContent = (lang === 'en' ? 'Updated ' : 'อัปเดตล่าสุด ')
      + new Date(s.updatedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    box.hidden = false;
    // แถบนี้โผล่ทีหลังแล้วดันเนื้อหาลง → ถ้ามาจากเกม เลื่อนกลับไปที่ส่วนสนับสนุนอีกครั้ง
    if (fromGame) document.getElementById('support')?.scrollIntoView();
  } catch { /* ไม่มี API (เช่น npm run dev): ซ่อนไว้ */ }
}
loadStats();
