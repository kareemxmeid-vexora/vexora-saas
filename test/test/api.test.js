process.env.DB_FILE = ':memory:'; process.env.JWT_SECRET = 'test';
const test = require('node:test'); const assert = require('node:assert');
const app = require('../server');
let base, srv;
test.before(() => new Promise(r => { srv = app.listen(0, () => { base = 'http://127.0.0.1:' + srv.address().port + '/api'; r(); }); }));
test.after(() => srv.close());
const call = async (p, m = 'GET', b, tok) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j; const tx = await r.text(); try { j = JSON.parse(tx); } catch { j = tx; } return { s: r.status, j }; };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let owner, staff, acct, cid, iid, other;
test('register validates input & rejects duplicates', async () => {
  assert.equal((await call('/auth/register', 'POST', { company: 'A', name: 'x', email: 'bad', password: '12345678' })).s, 400);
  assert.equal((await call('/auth/register', 'POST', { company: 'A', name: 'x', email: 'a@x.com', password: 'short' })).s, 400);
  const r = await call('/auth/register', 'POST', { company: 'Acme', name: 'Owner', email: 'a@x.com', password: 'password1' });
  assert.equal(r.s, 201); owner = r.j.token;
  assert.equal((await call('/auth/register', 'POST', { company: 'Acme', name: 'Owner', email: 'a@x.com', password: 'password1' })).s, 409);
  other = (await call('/auth/register', 'POST', { company: 'Other', name: 'O', email: 'o@x.com', password: 'password1' })).j.token;
});
test('login works / wrong password fails / no token fails', async () => {
  assert.equal((await call('/auth/login', 'POST', { email: 'a@x.com', password: 'password1' })).s, 200);
  assert.equal((await call('/auth/login', 'POST', { email: 'a@x.com', password: 'wrongpass' })).s, 401);
  assert.equal((await call('/customers')).s, 401);
});
test('customers CRUD + free plan limit', async () => {
  const r = await call('/customers', 'POST', { name: 'Ahmed', phone: '01012345678' }, owner); assert.equal(r.s, 201); cid = r.j.id;
  assert.equal((await call('/customers', 'POST', { name: '' }, owner)).s, 400);
  assert.equal((await call('/customers', 'POST', { name: 'Z', phone: 'abc' }, owner)).s, 400);
  for (let i = 0; i < 14; i++) assert.equal((await call('/customers', 'POST', { name: 'C' + i }, owner)).s, 201);
  assert.equal((await call('/customers', 'POST', { name: 'over' }, owner)).s, 402);
});
test('tenant isolation', async () => {
  assert.equal((await call('/customers/' + cid, 'GET', null, other)).s, 404);
  assert.equal((await call('/customers/' + cid, 'DELETE', null, other)).s, 404);
  assert.equal((await call('/customers', 'GET', null, other)).j.length, 0);
});
test('invoices, partial + full payments, overpay rejected, statuses', async () => {
  assert.equal((await call('/invoices', 'POST', { customer_id: cid, amount: -5, due_date: day(5) }, owner)).s, 400);
  assert.equal((await call('/invoices', 'POST', { customer_id: cid, amount: 100, issue_date: day(0), due_date: day(-5) }, owner)).s, 400);
  const r = await call('/invoices', 'POST', { customer_id: cid, amount: 1000, issue_date: day(-30), due_date: day(-10) }, owner);
  assert.equal(r.s, 201); iid = r.j.id; assert.equal(r.j.status, 'overdue');
  let p = await call(`/invoices/${iid}/payments`, 'POST', { amount: 400, method: 'cash' }, owner);
  assert.equal(p.j.balance, 600); assert.equal(p.j.status, 'overdue');
  assert.equal((await call(`/invoices/${iid}/payments`, 'POST', { amount: 700 }, owner)).s, 400);
  p = await call(`/invoices/${iid}/payments`, 'POST', { amount: 600 }, owner); assert.equal(p.j.status, 'paid');
  assert.equal((await call('/invoices', 'POST', { customer_id: 99999, amount: 5, due_date: day(3) }, owner)).s, 400);
  assert.equal((await call(`/invoices/${iid}`, 'GET', null, other)).s, 404);
});
test('dashboard numbers & notifications', async () => {
  await call('/invoices', 'POST', { customer_id: cid, amount: 500, issue_date: day(-20), due_date: day(-3) }, owner);
  await call('/invoices', 'POST', { customer_id: cid, amount: 250, due_date: day(2) }, owner);
  const d = (await call('/dashboard', 'GET', null, owner)).j;
  assert.equal(d.outstanding, 750); assert.equal(d.overdue, 500); assert.equal(d.expected_30d, 250); assert.equal(d.collected_this_month, 1000);
  const n = (await call('/notifications', 'GET', null, owner)).j; assert.ok(n.unread >= 3);
  await call('/notifications/read', 'POST', {}, owner); assert.equal((await call('/notifications', 'GET', null, owner)).j.unread, 0);
});
test('reminder builds WhatsApp link', async () => {
  const list = (await call('/invoices?status=overdue', 'GET', null, owner)).j;
  const r = (await call(`/invoices/${list[0].id}/remind`, 'POST', { channel: 'whatsapp', lang: 'ar' }, owner)).j;
  assert.ok(r.link.startsWith('https://wa.me/201012345678')); assert.ok(r.text.includes('INV-'));
});
test('roles & permissions', async () => {
  assert.equal((await call('/users', 'POST', { name: 'S', email: 's@x.com', password: 'password1', role: 'staff' }, owner)).s, 402); // free plan = 1 user
  assert.equal((await call('/reports/aging', 'GET', null, owner)).s, 402);
  assert.equal((await call('/billing/change-plan', 'POST', { plan: 'pro' }, owner)).s, 200);
  assert.equal((await call('/reports/aging', 'GET', null, owner)).s, 200);
  assert.equal((await call('/users', 'POST', { name: 'S', email: 's@x.com', password: 'password1', role: 'staff' }, owner)).s, 201);
  assert.equal((await call('/users', 'POST', { name: 'A', email: 'ac@x.com', password: 'password1', role: 'accountant' }, owner)).s, 201);
  staff = (await call('/auth/login', 'POST', { email: 's@x.com', password: 'password1' })).j.token;
  acct = (await call('/auth/login', 'POST', { email: 'ac@x.com', password: 'password1' })).j.token;
  assert.equal((await call('/users', 'GET', null, staff)).s, 403);
  assert.equal((await call('/customers/' + cid, 'DELETE', null, staff)).s, 403);
  assert.equal((await call('/billing/change-plan', 'POST', { plan: 'free' }, acct)).s, 403);
  const open = (await call('/invoices?status=open', 'GET', null, owner)).j[0];
  assert.equal((await call(`/invoices/${open.id}/payments`, 'POST', { amount: 10 }, staff)).s, 403);
  assert.equal((await call(`/invoices/${open.id}/payments`, 'POST', { amount: 10 }, acct)).s, 201);
});
test('deactivated user is locked out; owner cannot demote self', async () => {
  const us = (await call('/users', 'GET', null, owner)).j; const s = us.find(u => u.email === 's@x.com'), o = us.find(u => u.role === 'owner');
  assert.equal((await call('/users/' + o.id, 'PATCH', { role: 'staff' }, owner)).s, 400);
  await call('/users/' + s.id, 'PATCH', { active: false }, owner);
  assert.equal((await call('/customers', 'GET', null, staff)).s, 401);
});
test('downgrade blocked when over limit; CSV safe', async () => {
  assert.equal((await call('/billing/change-plan', 'POST', { plan: 'free' }, owner)).s, 400);
  const c = (await call('/customers', 'POST', { name: '=HYPERLINK("x")' }, owner)).j;
  await call('/invoices', 'POST', { customer_id: c.id, amount: 5, due_date: day(9) }, owner);
  const csv = (await call('/reports/export.csv', 'GET', null, owner)).j; assert.ok(csv.includes('"\'=HYPERLINK'));
});
test('malformed JSON and SQL-injection-ish input are handled', async () => {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); assert.equal(r.status, 400);
  assert.equal((await call('/auth/login', 'POST', { email: "a@x.com' OR '1'='1", password: 'x' })).s, 400);
  assert.equal((await call('/invoices?q=%27%3B%20DROP%20TABLE%20invoices%3B--', 'GET', null, owner)).s, 200);
});
