const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const PLANS = require('./plans');

const SECRET = process.env.JWT_SECRET || (() => {
  console.warn('WARNING: JWT_SECRET not set, using a random one (sessions reset on restart).');
  return crypto.randomBytes(32).toString('hex');
})();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:" });
  next();
});

// ---------- helpers ----------
class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const bad = m => new HttpError(400, m);
const str = (v, { min = 1, max = 200, name = 'field' } = {}) => {
  if (typeof v !== 'string') throw bad(`${name} is required`);
  v = v.trim();
  if (v.length < min || v.length > max) throw bad(`${name} must be ${min}-${max} characters`);
  return v;
};
const optStr = (v, max = 500) => (v == null || v === '' ? null : str(v, { min: 0, max }));
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw bad(`${name} must be a positive number`); return Math.round(n * 100) / 100; };
const date = (v, name) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad(`${name} must be YYYY-MM-DD`); return v; };
const email = v => { v = str(v, { max: 254, name: 'email' }).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('invalid email'); return v; };
const pass = v => { if (typeof v !== 'string' || v.length < 8 || v.length > 100) throw bad('password must be 8-100 characters'); return v; };
const phone = v => { v = optStr(v, 20); if (v && !/^\+?[0-9 ()-]{7,20}$/.test(v)) throw bad('invalid phone'); return v; };
const today = () => new Date().toISOString().slice(0, 10);
const wrap = fn => (req, res, next) => { try { Promise.resolve(fn(req, res, next)).catch(next); } catch (e) { next(e); } };
const ROLES = ['owner', 'accountant', 'staff'];

// permission matrix
const PERMS = {
  owner:      ['customers.write', 'customers.delete', 'invoices.write', 'invoices.delete', 'payments.write', 'reports.view', 'users.manage', 'billing.manage'],
  accountant: ['customers.write', 'invoices.write', 'payments.write', 'reports.view'],
  staff:      ['customers.write', 'invoices.write'],
};
const can = (user, p) => PERMS[user.role].includes(p);
const need = p => (req, res, next) => can(req.user, p) ? next() : next(new HttpError(403, 'You do not have permission for this action'));

// simple rate limiter for auth
const hits = new Map();
const limiter = (max, windowMs) => (req, res, next) => {
  const k = req.ip + req.path, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) return next(new HttpError(429, 'Too many attempts, try again later'));
  arr.push(now); hits.set(k, arr); next();
};

const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => {
  const h = req.headers.authorization || '';
  try {
    const { id } = jwt.verify(h.replace(/^Bearer /, ''), SECRET);
    const u = db.prepare('SELECT u.*, o.name org_name, o.plan, o.currency, o.sub_status FROM users u JOIN orgs o ON o.id=u.org_id WHERE u.id=? AND u.active=1').get(id);
    if (!u) throw 0;
    req.user = u; next();
  } catch { next(new HttpError(401, 'Please sign in')); }
};
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, lang: u.lang, org: { name: u.org_name, plan: u.plan, currency: u.currency, sub_status: u.sub_status }, perms: PERMS[u.role] });

// invoice status computed from payments
const INV_SQL = `
SELECT i.*, c.name customer_name, c.phone customer_phone,
  COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id=i.id),0) paid,
  i.amount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id=i.id),0) balance
FROM invoices i JOIN customers c ON c.id=i.customer_id`;
const withStatus = r => ({ ...r, status: r.balance <= 0.004 ? 'paid' : (r.due_date < today() ? 'overdue' : (r.paid > 0 ? 'partial' : 'open')) });
const orgInvoices = org => db.prepare(INV_SQL + ' WHERE i.org_id=? ORDER BY i.due_date DESC, i.id DESC').all(org).map(withStatus);

function checkLimit(user, kind) {
  const plan = PLANS[user.plan]; const lim = plan[kind];
  if (lim == null) return;
  const table = { customers: 'customers', users: 'users', invoices: 'invoices' }[kind];
  const c = db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE org_id=?`).get(user.org_id).n;
  if (c >= lim) throw new HttpError(402, `Your ${user.plan} plan allows ${lim} ${kind}. Upgrade to add more.`);
}

// notifications: generated for overdue / due soon invoices (idempotent via UNIQUE)
function refreshNotifications(org) {
  const ins = db.prepare('INSERT OR IGNORE INTO notifications(org_id,type,ref,message_ar,message_en) VALUES(?,?,?,?,?)');
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  for (const i of orgInvoices(org)) {
    if (i.status === 'paid') continue;
    if (i.due_date < today()) ins.run(org, 'overdue', String(i.id), `الفاتورة ${i.number} للعميل ${i.customer_name} متأخرة (المتبقي ${i.balance})`, `Invoice ${i.number} for ${i.customer_name} is overdue (balance ${i.balance})`);
    else if (i.due_date <= soon) ins.run(org, 'due_soon', String(i.id), `الفاتورة ${i.number} للعميل ${i.customer_name} تستحق قريبًا (${i.due_date})`, `Invoice ${i.number} for ${i.customer_name} is due soon (${i.due_date})`);
  }
}
const notify = (org, type, ref, ar, en) => db.prepare('INSERT OR IGNORE INTO notifications(org_id,type,ref,message_ar,message_en) VALUES(?,?,?,?,?)').run(org, type, ref, ar, en);

// ---------- auth ----------
const api = express.Router();
api.get('/health', (req, res) => res.json({ ok: true }));

api.post('/auth/register', limiter(10, 60000), wrap((req, res) => {
  const b = req.body || {};
  const org = str(b.company, { max: 100, name: 'company' }), name = str(b.name, { max: 100, name: 'name' });
  const em = email(b.email), pw = pass(b.password);
  const lang = b.lang === 'en' ? 'en' : 'ar';
  const currency = ['EGP', 'USD', 'SAR', 'AED', 'EUR'].includes(b.currency) ? b.currency : 'EGP';
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(em)) throw new HttpError(409, 'Email already registered');
  const hash = bcrypt.hashSync(pw, 10);
  const uid = db.transaction(() => {
    const o = db.prepare("INSERT INTO orgs(name,currency,renews_at) VALUES(?,?,date('now','+30 day'))").run(org, currency);
    return db.prepare("INSERT INTO users(org_id,name,email,password_hash,role,lang) VALUES(?,?,?,?, 'owner', ?)").run(o.lastInsertRowid, name, em, hash, lang).lastInsertRowid;
  })();
  const u = db.prepare('SELECT u.*, o.name org_name, o.plan, o.currency, o.sub_status FROM users u JOIN orgs o ON o.id=u.org_id WHERE u.id=?').get(uid);
  res.status(201).json({ token: sign(u), user: publicUser(u) });
}));

api.post('/auth/login', limiter(10, 60000), wrap((req, res) => {
  const b = req.body || {};
  const u = db.prepare('SELECT u.*, o.name org_name, o.plan, o.currency, o.sub_status FROM users u JOIN orgs o ON o.id=u.org_id WHERE u.email=? AND u.active=1').get(email(b.email));
  if (!u || !bcrypt.compareSync(String(b.password || ''), u.password_hash)) throw new HttpError(401, 'Wrong email or password');
  res.json({ token: sign(u), user: publicUser(u) });
}));

api.use(auth);
api.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));
api.patch('/me', wrap((req, res) => {
  const b = req.body || {};
  if (b.lang) db.prepare('UPDATE users SET lang=? WHERE id=?').run(b.lang === 'en' ? 'en' : 'ar', req.user.id);
  if (b.password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pass(b.password), 10), req.user.id);
  res.json({ ok: true });
}));

// ---------- customers ----------
const custRow = r => r;
api.get('/customers', wrap((req, res) => {
  const inv = orgInvoices(req.user.org_id);
  const rows = db.prepare('SELECT * FROM customers WHERE org_id=? ORDER BY name').all(req.user.org_id).map(c => {
    const mine = inv.filter(i => i.customer_id === c.id);
    return { ...c, invoices: mine.length, outstanding: round(mine.reduce((s, i) => s + i.balance, 0)), overdue: round(mine.filter(i => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)), risk: risk(mine) };
  });
  res.json(rows);
}));
const round = n => Math.round(n * 100) / 100;
function risk(invs) { // 0-100, higher = riskier. Based on overdue ratio and avg delay of paid invoices
  if (!invs.length) return 0;
  const overdue = invs.filter(i => i.status === 'overdue');
  const total = invs.reduce((s, i) => s + i.amount, 0);
  const ratio = overdue.reduce((s, i) => s + i.balance, 0) / total;
  const maxDays = overdue.reduce((m, i) => Math.max(m, (Date.now() - Date.parse(i.due_date)) / 864e5), 0);
  return Math.min(100, Math.round(ratio * 60 + Math.min(maxDays, 90) / 90 * 40));
}
api.post('/customers', need('customers.write'), wrap((req, res) => {
  checkLimit(req.user, 'customers');
  const b = req.body || {};
  const r = db.prepare('INSERT INTO customers(org_id,name,phone,email,notes) VALUES(?,?,?,?,?)').run(req.user.org_id, str(b.name, { max: 100, name: 'name' }), phone(b.phone), b.email ? email(b.email) : null, optStr(b.notes));
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid));
}));
const ownCustomer = (req) => { const c = db.prepare('SELECT * FROM customers WHERE id=? AND org_id=?').get(Number(req.params.id), req.user.org_id); if (!c) throw new HttpError(404, 'Customer not found'); return c; };
api.get('/customers/:id', wrap((req, res) => {
  const c = ownCustomer(req);
  const invoices = db.prepare(INV_SQL + ' WHERE i.customer_id=? AND i.org_id=? ORDER BY i.due_date DESC').all(c.id, req.user.org_id).map(withStatus);
  res.json({ ...c, invoices, risk: risk(invoices) });
}));
api.put('/customers/:id', need('customers.write'), wrap((req, res) => {
  const c = ownCustomer(req), b = req.body || {};
  db.prepare('UPDATE customers SET name=?,phone=?,email=?,notes=? WHERE id=?').run(str(b.name, { max: 100, name: 'name' }), phone(b.phone), b.email ? email(b.email) : null, optStr(b.notes), c.id);
  res.json({ ok: true });
}));
api.delete('/customers/:id', need('customers.delete'), wrap((req, res) => {
  const c = ownCustomer(req); db.prepare('DELETE FROM customers WHERE id=?').run(c.id); res.json({ ok: true });
}));

// ---------- invoices ----------
api.get('/invoices', wrap((req, res) => {
  let rows = orgInvoices(req.user.org_id);
  if (req.query.status) rows = rows.filter(i => i.status === req.query.status);
  if (req.query.q) { const q = String(req.query.q).toLowerCase(); rows = rows.filter(i => (i.number + ' ' + i.customer_name).toLowerCase().includes(q)); }
  res.json(rows);
}));
api.post('/invoices', need('invoices.write'), wrap((req, res) => {
  checkLimit(req.user, 'invoices');
  const b = req.body || {};
  const cust = db.prepare('SELECT id FROM customers WHERE id=? AND org_id=?').get(Number(b.customer_id), req.user.org_id);
  if (!cust) throw bad('customer not found');
  const issue = date(b.issue_date || today(), 'issue_date'), due = date(b.due_date, 'due_date');
  if (due < issue) throw bad('due date cannot be before issue date');
  let number = b.number ? str(b.number, { max: 30, name: 'number' }) : null;
  if (!number) { const n = db.prepare('SELECT COUNT(*) n FROM invoices WHERE org_id=?').get(req.user.org_id).n + 1; number = 'INV-' + String(n).padStart(4, '0'); }
  try {
    const r = db.prepare('INSERT INTO invoices(org_id,customer_id,number,amount,issue_date,due_date,notes,created_by) VALUES(?,?,?,?,?,?,?,?)').run(req.user.org_id, cust.id, number, num(b.amount, 'amount'), issue, due, optStr(b.notes), req.user.id);
    res.status(201).json(withStatus(db.prepare(INV_SQL + ' WHERE i.id=?').get(r.lastInsertRowid)));
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Invoice number already exists'); throw e; }
}));
const ownInvoice = req => { const i = db.prepare(INV_SQL + ' WHERE i.id=? AND i.org_id=?').get(Number(req.params.id), req.user.org_id); if (!i) throw new HttpError(404, 'Invoice not found'); return withStatus(i); };
api.get('/invoices/:id', wrap((req, res) => {
  const i = ownInvoice(req);
  res.json({ ...i, payments: db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_at DESC, id DESC').all(i.id) });
}));
api.delete('/invoices/:id', need('invoices.delete'), wrap((req, res) => { const i = ownInvoice(req); db.prepare('DELETE FROM invoices WHERE id=?').run(i.id); res.json({ ok: true }); }));
api.post('/invoices/:id/payments', need('payments.write'), wrap((req, res) => {
  const i = ownInvoice(req), b = req.body || {};
  const amount = num(b.amount, 'amount');
  if (amount > i.balance + 0.004) throw bad(`amount exceeds remaining balance (${round(i.balance)})`);
  const method = ['cash', 'bank', 'instapay', 'vodafone_cash', 'card', 'other'].includes(b.method) ? b.method : 'cash';
  db.prepare('INSERT INTO payments(org_id,invoice_id,amount,method,paid_at,created_by) VALUES(?,?,?,?,?,?)').run(req.user.org_id, i.id, amount, method, date(b.paid_at || today(), 'paid_at'), req.user.id);
  const after = ownInvoice(req);
  if (after.status === 'paid') notify(req.user.org_id, 'paid', String(i.id), `تم سداد الفاتورة ${i.number} بالكامل`, `Invoice ${i.number} was paid in full`);
  res.status(201).json(after);
}));
api.post('/invoices/:id/remind', need('invoices.write'), wrap((req, res) => {
  const i = ownInvoice(req);
  if (i.status === 'paid') throw bad('invoice already paid');
  const ch = ['whatsapp', 'email', 'sms'].includes(req.body?.channel) ? req.body.channel : 'whatsapp';
  const lang = req.body?.lang === 'en' ? 'en' : 'ar';
  const cur = req.user.currency;
  const text = lang === 'ar'
    ? `السلام عليكم ${i.customer_name}، تذكير ودي من ${req.user.org_name} بخصوص الفاتورة ${i.number} بمبلغ ${round(i.balance)} ${cur}، تاريخ الاستحقاق ${i.due_date}. شكرًا لتعاونكم.`
    : `Hello ${i.customer_name}, a friendly reminder from ${req.user.org_name} about invoice ${i.number}: ${round(i.balance)} ${cur} due on ${i.due_date}. Thank you.`;
  db.prepare('INSERT INTO reminders(org_id,invoice_id,channel,created_by) VALUES(?,?,?,?)').run(req.user.org_id, i.id, ch, req.user.id);
  let link = null;
  const digits = (i.customer_phone || '').replace(/[^\d]/g, '');
  if (ch === 'whatsapp' && digits) link = `https://wa.me/${digits.startsWith('0') ? '2' + digits : digits}?text=${encodeURIComponent(text)}`;
  res.json({ text, link, note: link ? null : 'No phone number on file for WhatsApp' });
}));

// ---------- notifications ----------
api.get('/notifications', wrap((req, res) => {
  refreshNotifications(req.user.org_id);
  const rows = db.prepare('SELECT * FROM notifications WHERE org_id=? ORDER BY id DESC LIMIT 50').all(req.user.org_id);
  res.json({ unread: rows.filter(r => !r.read).length, items: rows });
}));
api.post('/notifications/read', wrap((req, res) => { db.prepare('UPDATE notifications SET read=1 WHERE org_id=?').run(req.user.org_id); res.json({ ok: true }); }));

// ---------- dashboard & reports ----------
api.get('/dashboard', wrap((req, res) => {
  const inv = orgInvoices(req.user.org_id);
  const open = inv.filter(i => i.status !== 'paid');
  const sum = a => round(a.reduce((s, i) => s + i.balance, 0));
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const month = today().slice(0, 7);
  const collected = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE org_id=? AND substr(paid_at,1,7)=?").get(req.user.org_id, month).s;
  const months = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); months.push(d.toISOString().slice(0, 7)); }
  const pay = db.prepare("SELECT substr(paid_at,1,7) m, SUM(amount) s FROM payments WHERE org_id=? GROUP BY 1").all(req.user.org_id);
  const issued = db.prepare("SELECT substr(issue_date,1,7) m, SUM(amount) s FROM invoices WHERE org_id=? GROUP BY 1").all(req.user.org_id);
  res.json({
    outstanding: sum(open), overdue: sum(open.filter(i => i.status === 'overdue')), collected_this_month: round(collected),
    expected_30d: sum(open.filter(i => i.due_date >= today() && i.due_date <= in30)),
    counts: { customers: db.prepare('SELECT COUNT(*) n FROM customers WHERE org_id=?').get(req.user.org_id).n, invoices: inv.length, overdue: open.filter(i => i.status === 'overdue').length },
    monthly: months.map(m => ({ month: m, collected: round(pay.find(p => p.m === m)?.s || 0), invoiced: round(issued.find(p => p.m === m)?.s || 0) })),
    top_debtors: Object.values(open.reduce((a, i) => { (a[i.customer_id] ||= { id: i.customer_id, name: i.customer_name, balance: 0 }).balance += i.balance; return a; }, {})).map(d => ({ ...d, balance: round(d.balance) })).sort((a, b) => b.balance - a.balance).slice(0, 5),
    usage: { plan: req.user.plan, limits: PLANS[req.user.plan] },
  });
}));
api.get('/reports/aging', need('reports.view'), wrap((req, res) => {
  if (!PLANS[req.user.plan].reports) throw new HttpError(402, 'Reports require the Pro plan or higher');
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  const rows = [];
  for (const i of orgInvoices(req.user.org_id).filter(i => i.status !== 'paid')) {
    const days = Math.floor((Date.now() - Date.parse(i.due_date)) / 864e5);
    const k = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
    buckets[k] += i.balance; rows.push({ number: i.number, customer: i.customer_name, balance: round(i.balance), due_date: i.due_date, days_overdue: Math.max(0, days), bucket: k });
  }
  for (const k in buckets) buckets[k] = round(buckets[k]);
  res.json({ buckets, rows });
}));
api.get('/reports/export.csv', need('reports.view'), wrap((req, res) => {
  if (!PLANS[req.user.plan].reports) throw new HttpError(402, 'Reports require the Pro plan or higher');
  const esc = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const lines = ['number,customer,amount,paid,balance,issue_date,due_date,status'];
  for (const i of orgInvoices(req.user.org_id)) lines.push([i.number, i.customer_name, i.amount, i.paid, i.balance, i.issue_date, i.due_date, i.status].map(esc).join(','));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="invoices.csv"' }).send('\ufeff' + lines.join('\n'));
}));

// ---------- users & roles ----------
api.get('/users', need('users.manage'), wrap((req, res) => res.json(db.prepare('SELECT id,name,email,role,active,created_at FROM users WHERE org_id=? ORDER BY id').all(req.user.org_id))));
api.post('/users', need('users.manage'), wrap((req, res) => {
  checkLimit(req.user, 'users');
  const b = req.body || {};
  if (!ROLES.includes(b.role)) throw bad('invalid role');
  const em = email(b.email);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(em)) throw new HttpError(409, 'Email already registered');
  const r = db.prepare('INSERT INTO users(org_id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(req.user.org_id, str(b.name, { max: 100, name: 'name' }), em, bcrypt.hashSync(pass(b.password), 10), b.role);
  res.status(201).json({ id: r.lastInsertRowid });
}));
api.patch('/users/:id', need('users.manage'), wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND org_id=?').get(Number(req.params.id), req.user.org_id);
  if (!u) throw new HttpError(404, 'User not found');
  const b = req.body || {};
  if (u.id === req.user.id && (b.active === false || (b.role && b.role !== 'owner'))) throw bad('You cannot demote or deactivate yourself');
  if (b.role) { if (!ROLES.includes(b.role)) throw bad('invalid role'); db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, u.id); }
  if (typeof b.active === 'boolean') db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, u.id);
  res.json({ ok: true });
}));

// ---------- subscriptions ----------
api.get('/billing', wrap((req, res) => {
  const o = db.prepare('SELECT plan,sub_status,renews_at FROM orgs WHERE id=?').get(req.user.org_id);
  const usage = { customers: db.prepare('SELECT COUNT(*) n FROM customers WHERE org_id=?').get(req.user.org_id).n, users: db.prepare('SELECT COUNT(*) n FROM users WHERE org_id=?').get(req.user.org_id).n, invoices: db.prepare('SELECT COUNT(*) n FROM invoices WHERE org_id=?').get(req.user.org_id).n };
  res.json({ ...o, plans: PLANS, usage, history: db.prepare('SELECT * FROM sub_events WHERE org_id=? ORDER BY id DESC LIMIT 10').all(req.user.org_id), gateway: process.env.PAYMENT_GATEWAY || 'manual' });
}));
api.post('/billing/change-plan', need('billing.manage'), wrap((req, res) => {
  const to = req.body?.plan;
  if (!PLANS[to]) throw bad('unknown plan');
  const usage = { customers: db.prepare('SELECT COUNT(*) n FROM customers WHERE org_id=?').get(req.user.org_id).n, users: db.prepare('SELECT COUNT(*) n FROM users WHERE org_id=?').get(req.user.org_id).n, invoices: db.prepare('SELECT COUNT(*) n FROM invoices WHERE org_id=?').get(req.user.org_id).n };
  for (const k of ['customers', 'users', 'invoices']) if (PLANS[to][k] != null && usage[k] > PLANS[to][k]) throw bad(`Cannot downgrade: you have ${usage[k]} ${k}, ${to} allows ${PLANS[to][k]}`);
  // NOTE: payment collection is a gateway integration point (Paymob/Fawry/Stripe). Until configured, plan changes are recorded manually.
  db.transaction(() => {
    db.prepare("INSERT INTO sub_events(org_id,from_plan,to_plan,price,created_by) VALUES(?,?,?,?,?)").run(req.user.org_id, req.user.plan, to, PLANS[to].price, req.user.id);
    db.prepare("UPDATE orgs SET plan=?, sub_status='active', renews_at=date('now','+30 day') WHERE id=?").run(to, req.user.org_id);
  })();
  res.json({ ok: true, plan: to });
}));

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err); res.status(500).json({ error: 'Something went wrong' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`VEXORA running on http://localhost:${port}`));
}
module.exports = app;
