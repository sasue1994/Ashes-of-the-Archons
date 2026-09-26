// ภาษาในเกม: ไทย / อังกฤษ (ไม่มี DOM ใช้ได้ทั้ง sim และ UI)
// ข้อความสั้นๆ เขียนคู่กันตรงจุดที่ใช้ด้วย tr('ไทย', 'English')
// ชื่อยูนิต/อาคาร/พิมพ์เขียวอยู่ใน data.ts แล้วสลับด้วย applyDataLang()
export type Lang = 'th' | 'en';
export const i18n = { lang: 'th' as Lang };
export const tr = (th: string, en: string) => i18n.lang === 'en' ? en : th;
