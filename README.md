# VEXORA Collect
Receivables and invoicing for SMBs. Arabic/English, RTL, mobile-first PWA, SQLite database, JWT auth, roles, plans.

## Run locally
    npm install
    JWT_SECRET=$(openssl rand -hex 32) npm start     # http://localhost:3000
    npm test

## Deploy (cheap)
- Any VPS / Render / Railway: set env JWT_SECRET (long random), PORT, DB_FILE (path on a persistent disk). `npm start`.
- Docker: `docker build -t vexora . && docker run -p 3000:3000 -e JWT_SECRET=... -v vexora-data:/data vexora`
- Put it behind HTTPS (Caddy / Cloudflare / platform TLS).

## Selling by subscription
Plans (Free / Pro 299 / Business 799 EGP per month) are enforced server-side (limits + reports gating).
Collecting the money is a gateway hook: `POST /api/billing/change-plan` in server.js is where a Paymob / Fawry / Stripe webhook should confirm payment before the plan changes. Until then plan changes are recorded manually.
