// Boot: restore the SQLite file from Postgres (if DATABASE_URL is set), then start the app.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dbFile = process.env.DB_FILE || path.join(__dirname, 'vexora.db');
const url = process.env.DATABASE_URL;

async function restore() {
  if (!url) return;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('CREATE TABLE IF NOT EXISTS vexora_snapshot(id INT PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const r = await c.query('SELECT data FROM vexora_snapshot WHERE id=1');
  await c.end();
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + ext); } catch (e) {} }
  if (r.rows.length) { fs.writeFileSync(dbFile, r.rows[0].data); console.log('restored db snapshot', r.rows[0].data.length, 'bytes'); }
  else console.log('no snapshot yet, starting empty');
}

restore().then(() => {
  const app = require('./server');
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`VEXORA running on http://localhost:${port}`));
  if (url) require('./persist').start(require('./db'), url);
}).catch(e => { console.error('boot failed', e); process.exit(1); });
