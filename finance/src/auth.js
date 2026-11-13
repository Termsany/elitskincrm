// مصادقة بسيطة بكوكي موقّع (HMAC) — بدون اعتماديات.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // أسبوع
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// سر توقيع الجلسات: من .env، وإلا يُولَّد عشوائيًا مرة واحدة ويُحفظ في data/
// (بدل سر ثابت مكتوب في الكود يسمح بتزوير الدخول).
let secret = null;
function SECRET() {
  if (secret) return secret;
  const fromEnv = process.env.SESSION_SECRET || '';
  if (fromEnv.length >= 16 && !fromEnv.startsWith('change-me')) return (secret = fromEnv);
  const file = path.join(DATA_DIR, '.session-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return (secret = saved);
  } catch (_) { /* لا يوجد بعد */ }
  secret = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (!mac || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() - p.t > MAX_AGE) return null;
    return p;
  } catch (e) { return null; }
}

function passwordConfigured() {
  const real = process.env.APP_PASSWORD || '';
  return !!real && !real.startsWith('change-me');
}

// مقارنة كلمة المرور بزمن ثابت (عبر hash عشان الطول ما يتسربش)
function checkPassword(pw) {
  if (!passwordConfigured()) return false;
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(pw), h(process.env.APP_PASSWORD));
}

// حد لمحاولات الدخول الخاطئة: 8 محاولات لكل IP كل 15 دقيقة
const WINDOW = 15 * 60 * 1000, LIMIT = 8;
const fails = new Map();
function tooManyAttempts(ip) {
  const r = fails.get(ip);
  if (!r) return false;
  if (Date.now() - r.first > WINDOW) { fails.delete(ip); return false; }
  return r.count >= LIMIT;
}
function recordFail(ip) {
  const r = fails.get(ip);
  if (!r || Date.now() - r.first > WINDOW) fails.set(ip, { first: Date.now(), count: 1 });
  else r.count++;
}
function clearFails(ip) { fails.delete(ip); }

function parseCookie(header) {
  const o = {};
  (header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (_) {} }
  });
  return o;
}
function isAuthed(req) {
  const c = parseCookie(req.headers.cookie);
  return !!verify(c.ef_session);
}
function cookieFlags(req) {
  return 'HttpOnly; SameSite=Lax; Path=/' + (req.secure ? '; Secure' : '');
}
function setSession(req, res) {
  const token = sign({ t: Date.now() });
  res.setHeader('Set-Cookie', `ef_session=${token}; ${cookieFlags(req)}; Max-Age=${MAX_AGE / 1000}`);
}
function clearSession(req, res) {
  res.setHeader('Set-Cookie', `ef_session=; ${cookieFlags(req)}; Max-Age=0`);
}

module.exports = { checkPassword, isAuthed, setSession, clearSession, tooManyAttempts, recordFail, clearFails, passwordConfigured };
