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
  const inv = mock.invoices.map(x => x.Invoice).filter(i => !i.draft);
  const open = inv.filter(i => i.summary_paid < i.summary_total);
  assert.deepStrictEqual(sync.json.counts, { clients: 12, invoices: inv.length, open: open.length }, 'counts (draft excluded, all pages)');

  let d = (await req('/api/data', {}, cookie)).json;
  assert.strictEqual(d.rec.all, Math.round(open.reduce((s, i) => s + i.summary_total - i.summary_paid, 0)), 'receivables total');
  const m = d.month.month;
  assert.strictEqual(d.month.sales, Math.round(inv.filter(i => i.date.startsWith(m)).reduce((s, i) => s + i.summary_total, 0)), 'month sales');
  assert.strictEqual(d.month.target, 0, 'no target yet');
  assert.ok(d.clients.dormant.length >= 3, 'dormant clients found');
  assert.ok(d.clients.notThisMonth.length >= 1, 'active clients missing this month');

  // الأهداف: سنوي يتوزع، وشهر يدوي يغلب
  const y = m.slice(0, 4);
  let g = (await req('/api/goals/' + y, { method: 'POST', body: JSON.stringify({ annual: 3600000 }) }, cookie)).json;
  assert.ok(Math.abs(g.months.reduce((s, x) => s + x.target, 0) - 3600000) <= 12, 'annual distributed over months');
  g = (await req('/api/goals/' + y, { method: 'POST', body: JSON.stringify({ monthly: { [m]: 400000 } }) }, cookie)).json;
  assert.strictEqual(g.months.find(x => x.month === m).target, 400000, 'manual month target');
  assert.ok(Math.abs(g.months.reduce((s, x) => s + x.target, 0) - 3600000) <= 12, 'other months rebalance');
  d = (await req('/api/data', {}, cookie)).json;
  assert.strictEqual(d.month.target, 400000);
  assert.ok(d.month.need > 0 && d.month.perDay > 0, 'gap and daily pace');

  // الخطة الذكية
  const sug = (await req('/api/plan/suggest', { method: 'POST', body: '{}' }, cookie)).json;
  assert.ok(sug.items.some(i => i.type === 'collect') && sug.items.some(i => i.type === 'sell'), 'suggest has collect + sell');
  assert.ok(sug.strategy.length > 20, 'strategy text');
  const ap = (await req('/api/plan/apply', { method: 'POST', body: JSON.stringify({ strategy: sug.strategy, source: sug.source, items: sug.items }) }, cookie)).json;
  assert.strictEqual(ap.added, sug.items.length, 'apply adds all');
  const again = (await req('/api/plan/apply', { method: 'POST', body: JSON.stringify({ items: sug.items }) }, cookie)).json;
  assert.strictEqual(again.added, 0, 'no duplicate plan items');
  d = (await req('/api/data', {}, cookie)).json;
  assert.strictEqual(d.plan.totals.count, sug.items.length);
  const col = d.plan.items.find(i => i.type === 'collect');
  assert.strictEqual(col.now, col.base, 'collect progress starts at zero');
  const bad = await req('/api/plan/items', { method: 'POST', body: JSON.stringify({ type: 'sell', clientId: 9999 }) }, cookie);
  assert.strictEqual(bad.status, 400, 'unknown client rejected');
  const task = (await req('/api/plan/items', { method: 'POST', body: JSON.stringify({ type: 'task', text: 'زيارة عيادات الشمال' }) }, cookie)).json.item;
  await req('/api/plan/items/' + task.id, { method: 'PATCH', body: '{"done":true}' }, cookie);
  d = (await req('/api/data', {}, cookie)).json;
  assert.strictEqual(d.plan.totals.done, 1, 'task marked done');
  await req('/api/plan/items/' + task.id, { method: 'DELETE' }, cookie);
  assert.strictEqual((await req('/api/data', {}, cookie)).json.plan.totals.count, sug.items.length, 'task deleted');

  const a = (await req('/api/ai', { method: 'POST', body: '{}' }, cookie)).json;
  assert.strictEqual(a.source, 'rules', 'ai fallback');
  assert.ok(a.insights.length >= 2, 'rule insights');

  for (let i = 0; i < 8; i++) await req('/api/login', { method: 'POST', body: '{"password":"nope"}' });
  assert.strictEqual((await req('/api/login', { method: 'POST', body: '{"password":"test-password-123"}' })).status, 429, 'rate limit');

  console.log('✓ كل الاختبارات نجحت');
})().catch(err => { console.error('✗', err.message); process.exitCode = 1; })
  .finally(() => { srv.kill(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
