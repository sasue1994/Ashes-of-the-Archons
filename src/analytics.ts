// ============================================================
// Google Analytics 4 (ใช้ร่วมกันทั้งหน้า landing และหน้าเกม)
// รหัส GA ใส่ตอน build ผ่าน VITE_GA_ID ถ้าไม่ใส่ = ปิด analytics ทั้งหมด (เช่นตอน npm run dev)
// เคารพ PDPA: เริ่มต้นแบบ consent denied จนกว่าผู้เล่นกด "ยอมรับ" (Google Consent Mode v2)
// event ที่ส่ง: page_view (อัตโนมัติ) · play_click (กดปุ่มเล่นบน landing) · game_start (เลือกระดับ AI แล้วเริ่มแมตช์)
// ============================================================
const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined)?.trim();
const KEY = 'archon.consent';

declare global { interface Window { dataLayer: unknown[]; gtag: (...args: unknown[]) => void } }

const store = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ไม่มี storage */ } } };

function setConsent(granted: boolean) {
  const v = granted ? 'granted' : 'denied';
  window.gtag('consent', 'update', { analytics_storage: v });
  store.set(KEY, v);
}

// แถบขอความยินยอมเล็กๆ มุมล่าง (แสดงครั้งเดียว จนกว่าจะเลือก)
function banner() {
  const en = document.documentElement.lang === 'en';
  const el = document.createElement('div');
  el.id = 'cc';
  el.innerHTML = `<style>
#cc{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:1000;max-width:520px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;background:rgba(13,16,20,.96);border:1px solid #2c3540;border-left:3px solid #f2a93b;color:#dfe5ea;font:13px/1.5 "Chakra Petch",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.5)}
#cc p{margin:0;flex:1 1 240px}
#cc button{all:unset;cursor:pointer;padding:7px 14px;font-weight:700;letter-spacing:.5px;border:1px solid #2c3540;color:#dfe5ea}
#cc button.ok{background:#f2a93b;border-color:#f2a93b;color:#0d1014}
#cc button:focus-visible{outline:2px solid #27f2d0;outline-offset:2px}
</style><p>${en
    ? 'We use Google Analytics cookies to count visits and players. No personal data is sold.'
    : 'เว็บนี้ใช้คุกกี้ Google Analytics เพื่อนับยอดผู้เข้าชมและผู้เล่น ไม่มีการขายข้อมูลส่วนตัว'}</p>
<button class="no">${en ? 'Decline' : 'ปฏิเสธ'}</button><button class="ok">${en ? 'Accept' : 'ยอมรับ'}</button>`;
  el.querySelector<HTMLButtonElement>('.ok')!.onclick = () => { setConsent(true); el.remove() };
  el.querySelector<HTMLButtonElement>('.no')!.onclick = () => { setConsent(false); el.remove() };
  document.body.appendChild(el);
}

export function initAnalytics() {
  if (!GA_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments) }; // gtag ต้องการ object arguments จริงๆ ไม่ใช่ array
  const saved = store.get(KEY);
  window.gtag('consent', 'default', { analytics_storage: saved === 'granted' ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(s);
  if (!saved) banner();
}

export function track(name: string, params: Record<string, string | number> = {}) {
  if (GA_ID && window.gtag) window.gtag('event', name, { transport_type: 'beacon', ...params });
}
