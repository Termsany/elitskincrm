// اختبار سريع: يشغّل دفترة وهمية + السيرفر، يسجّل دخول، يزامن، ويتأكد من الأرقام.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-test-'));
const mock = require('./mockdaftra');

const env = Object.assign({}, process.env, {
  PORT: String(PORT), DATA_DIR: dataDir, APP_PASSWORD: 'test-password-123',
  SESSION_SECRET: '', DAFTRA_BASE_URL: 'http://127.0.0.1:4499/api2',
  DAFTRA_SUBDOMAIN: 'test', DAFTRA_APIKEY: 'TEST-KEY', DAFTRA_API_KEY: '', ANTHROPIC_API_KEY: ''
});
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
srv.stdout.on('data', () => {});

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function req(p, opts = {}, cookie) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, cookie ? { cookie } : {});
  const r = await fetch(BASE + p, Object.assign({ headers }, opts));
  return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') };
}

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/health'); break; } catch (_) { await sleep(100); } }

  assert.strictEqual((await req('/api/health')).json.ok, true, 'health');
  assert.strictEqual((await req('/api/data')).status, 401, 'data needs login');
  assert.strictEqual((await req('/api/login', { method: 'POST', body: '{"password":"wrong"}' })).status, 401, 'bad password');

  const forged = 'ef_session=' + Buffer.from(JSON.stringify({ t: Date.now() })).toString('base64url') + '.x';
  assert.strictEqual((await req('/api/data', {}, forged)).status, 401, 'forged cookie rejected');

  const login = await req('/api/login', { method: 'POST', body: '{"password":"test-password-123"}' });
  assert.strictEqual(login.status, 200, 'login');
  const cookie = login.cookie.split(';')[0];

  const sync = await req('/api/sync', { method: 'POST' }, cookie);
  assert.ok(sync.json.ok, 'sync: ' + JSON.stringify(sync.json));
  assert.deepStrictEqual(sync.json.counts, { clients: 3, suppliers: 2, invoices: 5, purchases: 3 });

  const d = (await req('/api/data', {}, cookie)).json;
  assert.strictEqual(d.receivables.length, 3, 'open receivables');
  assert.strictEqual(d.receivables.reduce((s, r) => s + r.amount, 0), 38500 + 20000 + 27500);
  assert.strictEqual(d.payables.length, 2, 'open payables');

  const e = await req('/api/expenses', { method: 'POST', body: JSON.stringify({ name: 'إيجار', amount: 5000, cat: 'إيجار', type: 'fixed', start: '2026-01' }) }, cookie);
  assert.ok(e.json.ok, 'add expense');
  assert.strictEqual((await req('/api/ai', { method: 'POST', body: '{}' }, cookie)).json.source, 'rules', 'ai fallback');

  for (let i = 0; i < 8; i++) await req('/api/login', { method: 'POST', body: '{"password":"nope"}' });
  assert.strictEqual((await req('/api/login', { method: 'POST', body: '{"password":"test-password-123"}' })).status, 429, 'rate limit');

  console.log('✓ كل الاختبارات نجحت');
})().catch(err => { console.error('✗', err.message); process.exitCode = 1; })
  .finally(() => { srv.kill(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
