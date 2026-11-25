const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(process.env.DB_FILE || path.join(__dirname, 'vexora.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS orgs(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EGP',
  plan TEXT NOT NULL DEFAULT 'free', sub_status TEXT NOT NULL DEFAULT 'active',
  renews_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','accountant','staff')),
  lang TEXT NOT NULL DEFAULT 'ar', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT, email TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS invoices(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  number TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>0),
  issue_date TEXT NOT NULL, due_date TEXT NOT NULL, notes TEXT,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, number));
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount>0), method TEXT NOT NULL DEFAULT 'cash',
  paid_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL, ref TEXT, message_ar TEXT NOT NULL, message_en TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, type, ref));
CREATE TABLE IF NOT EXISTS reminders(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sub_events(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, from_plan TEXT, to_plan TEXT NOT NULL,
  price REAL NOT NULL, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_inv_org ON invoices(org_id, due_date);
CREATE INDEX IF NOT EXISTS idx_pay_inv ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cust_org ON customers(org_id);
`);
module.exports = db;
