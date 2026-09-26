// ============================================================
// เซิร์ฟเวอร์สำหรับ production (ไม่มี dependency ใช้แค่ Node ในตัว)
// - เสิร์ฟไฟล์ใน dist/ (โหลดเข้าหน่วยความจำ + gzip ไว้ก่อนตอนเริ่ม ไฟล์ทั้งหมดเล็ก)
// - /api/stats ยอดเข้าชม / กดเล่น / ผู้เล่น ดึงจาก GA4 Data API แล้ว cache ไว้ (ค่าเริ่มต้น 10 นาที)
// - /healthz สำหรับตรวจว่าเซิร์ฟเวอร์ยังทำงาน
//
// ตัวแปรแวดล้อม:
//   PORT              พอร์ต (ค่าเริ่มต้น 8080)
//   GA_PROPERTY_ID    เลข Property ของ GA4 (ตัวเลขล้วน ไม่ใช่ G-XXXX)
//   GA_CREDENTIALS    JSON key ของ service account (ใส่ JSON ตรงๆ หรือเข้ารหัส base64 ก็ได้)
//   GA_START_DATE     วันเริ่มนับยอด YYYY-MM-DD (ค่าเริ่มต้น 2026-01-01)
//   STATS_TTL         วินาทีที่ cache ยอดไว้ (ค่าเริ่มต้น 600)
// ถ้าไม่ตั้ง GA_* ไว้ /api/stats ตอบ 503 และหน้า landing จะซ่อนแถบตัวเลขเอง
// ============================================================
import { createServer } from 'node:http';
import { createSign } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// ---------- ไฟล์ static ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml']);

/** @type {Map<string, {body: Buffer, gz: Buffer | null, type: string, cache: string}>} */
const files = new Map();
function load(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { load(full); continue }
    const url = '/' + relative(ROOT, full).split(sep).join('/');
    const ext = extname(name).toLowerCase(), body = readFileSync(full);
    const gz = COMPRESS.has(ext) && body.length > 1024 ? gzipSync(body, { level: 9 }) : null;
    // ไฟล์ใน /assets/ มี hash ในชื่อ → cache ได้ตลอด · ที่เหลือให้เช็กใหม่ทุกครั้ง (อัปเดตเกมแล้วเห็นทันที)
    const cache = url.startsWith('/assets/') ? 'public, max-age=31536000, immutable'
      : ext === '.html' ? 'no-cache' : 'public, max-age=86400';
    files.set(url, { body, gz, type: TYPES[ext] || 'application/octet-stream', cache });
  }
}
load(ROOT);

// ---------- GA4 Data API ----------
const GA_PROPERTY = process.env.GA_PROPERTY_ID?.trim();
const GA_START = process.env.GA_START_DATE || '2026-01-01';
const TTL = (Number(process.env.STATS_TTL) || 600) * 1000;
const creds = (() => {
  const raw = process.env.GA_CREDENTIALS?.trim();
  if (!raw) return null;
  try { return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) }
  catch { console.error('GA_CREDENTIALS อ่านไม่ได้ (ต้องเป็น JSON หรือ base64 ของ JSON)'); return null }
})();

const b64url = (v) => Buffer.from(v).toString('base64url');
let token = { value: '', exp: 0 };
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (token.value && token.exp - 60 > now) return token.value;
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: creds.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(head + '.' + claim).sign(creds.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  if (!r.ok) throw new Error('token ' + r.status + ' ' + await r.text());
  const j = await r.json();
  token = { value: j.access_token, exp: now + j.expires_in };
  return token.value;
}

async function fetchStats() {
  const dateRanges = [{ startDate: GA_START, endDate: 'today' }];
  const eventIs = (value) => ({ filter: { fieldName: 'eventName', stringFilter: { value } } });
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY}:batchRunReports`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + await accessToken(), 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [
      // ยอดครั้งของ page_view และ play_click
      { dateRanges, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['page_view', 'play_click'] } } } },
      // จำนวนคน (ไม่ซ้ำ) ที่เริ่มแมตช์จริง
      { dateRanges, metrics: [{ name: 'totalUsers' }], dimensionFilter: eventIs('game_start') },
    ] }),
  });
  if (!r.ok) throw new Error('GA ' + r.status + ' ' + await r.text());
  const [events, players] = (await r.json()).reports;
  const count = (name) => Number(events.rows?.find(x => x.dimensionValues[0].value === name)?.metricValues[0].value || 0);
  return {
    pageViews: count('page_view'),
    playClicks: count('play_click'),
    players: Number(players.rows?.[0]?.metricValues[0].value || 0),
    updatedAt: new Date().toISOString(),
  };
}

let stats = { data: null, at: 0, pending: null };
async function getStats() {
  if (stats.data && Date.now() - stats.at < TTL) return stats.data;
  // คำขอพร้อมกันหลายอันรอผลเดียวกัน ไม่ยิง GA ซ้ำ
  stats.pending ??= fetchStats()
    .then(d => { stats.data = d; stats.at = Date.now(); return d })
    .catch(e => { console.error('ดึงยอดจาก GA ไม่ได้:', e.message); if (stats.data) return stats.data; throw e })
    .finally(() => { stats.pending = null });
  return stats.pending;
}

// ---------- HTTP ----------
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
function json(res, code, body, cache = 'no-store') {
  res.writeHead(code, { ...SECURITY, 'content-type': 'application/json', 'cache-control': cache });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.writeHead(400).end(); return }

  if (path === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return }
  if (path === '/api/stats') {
    if (!GA_PROPERTY || !creds) return json(res, 503, { error: 'stats not configured' });
    try { return json(res, 200, await getStats(), 'public, max-age=300') }
    catch { return json(res, 502, { error: 'stats unavailable' }) }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }).end(); return }

  // /play → /play/ (ลิงก์แบบ relative ในหน้าต้องมี / ปิดท้าย)
  if (!path.endsWith('/') && files.has(path + '/index.html')) {
    res.writeHead(301, { location: path + '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }).end(); return;
  }
  const f = files.get(path.endsWith('/') ? path + 'index.html' : path);
  if (!f) {
    const nf = files.get('/404.html');
    res.writeHead(404, { ...SECURITY, 'content-type': nf ? nf.type : 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : nf ? nf.body : 'Not found');
    return;
  }
  const gzip = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzip ? f.gz : f.body;
  res.writeHead(200, {
    ...SECURITY, 'content-type': f.type, 'cache-control': f.cache, 'content-length': body.length,
    ...(f.gz ? { vary: 'Accept-Encoding' } : {}), ...(gzip ? { 'content-encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, () => console.log(`Ashes of the Archons: http://localhost:${PORT}/ (${files.size} ไฟล์, stats ${GA_PROPERTY && creds ? 'เปิด' : 'ปิด'})`));
