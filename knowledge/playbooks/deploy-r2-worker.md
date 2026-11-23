---
type: Playbook
title: Deploy the R2 Worker
description: One-time Cloudflare setup (bucket, Worker, secret) and how to redeploy the Worker that serves the books.
tags: [r2, worker, deploy]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-23T09:00:00Z }
---

# One-time setup (owner)

1. Create a free Cloudflare account; enable R2 in the dashboard (a card is required, the free tier is not charged).
2. `npx wrangler login`
3. `npx wrangler r2 bucket create tu-truyen`
4. Generate a long random token (`openssl rand -hex 32`) and store it: `npx wrangler secret put ADMIN_TOKEN -c worker/wrangler.toml`
5. `npm run worker:deploy` → note the URL `https://tu-truyen.<account>.workers.dev`.
6. Put that URL in `.env.local` as `VITE_R2_BASE_URL=…`, rebuild and deploy the app ([Deploy](/playbooks/deploy.md)).
7. Optional: in `worker/wrangler.toml` set `ADMIN_ORIGINS` to the origins allowed to write (default `http://localhost:5174`, the deployer).

# Redeploy after Worker changes

`npm run worker:typecheck && npx vitest run tests/worker && npm run worker:deploy`

# Check

- `curl -I $VITE_R2_BASE_URL/catalog.json` → 200 (or 404 before the first upload), `access-control-allow-origin: *`.
- `curl -X PUT $VITE_R2_BASE_URL/admin/catalog.json` → 401.

Never commit the token. Rotating it = step 4 again.
