// Durable storage: periodically copy the SQLite database into Postgres (Neon). Flushes on shutdown.
const { Pool } = require('pg');
exports.start = function (db, url) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });
  let last = -1, busy = false;
  async function flush(force) {
    if (busy) return; busy = true;
    try {
      const n = db.prepare('SELECT total_changes() n').get().n;
      if (!force && n === last) return;
      const buf = db.serialize();
      await pool.query('INSERT INTO vexora_snapshot(id,data,updated_at) VALUES(1,$1,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()', [buf]);
      last = n;
    } catch (e) { console.error('snapshot failed', e.message); } finally { busy = false; }
  }
  setInterval(() => flush(false), 3000).unref();
  flush(true);
  let closing = false;
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
    if (closing) return; closing = true;
    busy = false; await flush(true); process.exit(0);
  });
  console.log('persistence to Postgres enabled');
};
