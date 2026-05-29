# Deployment VPS Memory

Updated: 2026-05-25

Source of truth private handoff: `C:\Users\EVO-THANH\.vps-thanh\HANDOFF-ZALOCRM-DEPLOY.md`.

Do not copy VPS passwords, tunnel tokens, n8n encryption keys, or production env secrets into repo memory. Read the private handoff locally when an operation needs exact credentials.

## VPS state

- SSH alias: `VPSTHANH`.
- OS: Ubuntu 22.04 LTS.
- Capacity: 6 CPU cores, about 10 GB RAM, about 84 GB disk, Singapore region.
- Public firewall should expose SSH only on the custom SSH port.
- Existing critical service: n8n is already running and must not be broken.
- Native services: Docker/containerd, cloudflared systemd, ssh, ufw, fail2ban.
- Cloudflared uses HTTP/2, not QUIC, because UDP appears blocked by provider.

## Existing services and ports

- n8n: bound to localhost on its app port, published through Cloudflare Tunnel.
- cloudflared metrics: localhost only.
- ZaloCRM planned:
  - App: host localhost/public tunnel target `http://localhost:3080`, container app port `3000`.
  - Postgres: `127.0.0.1:5433:5432`.
  - Redis: `127.0.0.1:6379:6379`, production should enable profile.
  - MinIO: must be changed from public `9000:9000` to `127.0.0.1:9000:9000` before deploy.

## Cloudflare Tunnel

- Existing tunnel already serves `vps.hsholding.vn` to n8n.
- Add route for ZaloCRM app:
  - `zalo.hsholding.vn` -> `http://localhost:3080`
- Recommended add route for attachments:
  - `files.hsholding.vn` -> `http://localhost:9000`
- When adding route in Cloudflare dashboard, service type must be HTTP and URL must include `http://`.
- If a stale DNS A record exists for a new subdomain, delete it and let tunnel CNAME/proxied record own it.

## Local source state from handoff

- Local path: `C:\Users\EVO-THANH\Projects\ZaloCRM`.
- Deploy branch intended in handoff: `private-hs`.
- Fork remote is deploy target; upstream/origin locphamnguyen is read-only/not for pushing.
- Handoff said there were many uncommitted changes before deploy. Always run `git status --short` before commit/push/deploy.

## Production env requirements

Generate strong secrets on VPS for:

- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `DB_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

Important production values:

- `NODE_ENV=production`
- `APP_URL=https://zalo.hsholding.vn`
- `UPLOAD_DIR=/var/lib/zalo-crm/files`
- `S3_ENDPOINT=http://minio:9000` (internal Docker network, do not change to public URL)
- `S3_PUBLIC_URL=https://files.hsholding.vn` if files route is approved
- `S3_BUCKET=zalocrm-attachments`
- `AUTOMATION_STUB_MODE=false` for real Zalo SDK behavior

## Deploy phases

Phase A, local:

- Commit current branch.
- Push to fork remote branch intended for deployment.

Phase B, VPS setup:

- Create `/opt/zalocrm`.
- Clone fork repo and checkout deploy branch.
- Create production `.env` with generated secrets.
- Patch compose so MinIO binds only to localhost.
- Enable Redis profile for production.
- Add 2-4 GB swap if approved.

Phase C, build/up:

- `docker compose --profile redis build`
- `docker compose --profile redis up -d`
- Tail `zalo-crm-app` logs.
- Verify `curl -I http://127.0.0.1:3080/` returns OK.

Phase D, Cloudflare:

- Add tunnel routes for app and files.
- Verify DNS and HTTPS app URL.

Phase E, production smoke test:

- Login through browser.
- Connect a real Zalo account.
- Test upload/attachment reload through public files URL.
- Verify backup container schedule.

## Open decisions from handoff

Recommendations in handoff:

- Add `files.hsholding.vn` for MinIO public attachment loading: yes.
- Enable Redis profile in production: yes.
- Add 2-4 GB swap: yes.
- Remove stale `n8n.hsholding.vn` DNS A record if unused: yes.

## Rollback and safety

- ZaloCRM uses different ports from n8n, so normal deploy should not conflict.
- If ZaloCRM causes resource pressure, run `docker compose down` inside `/opt/zalocrm`; n8n should remain untouched.
- Do not edit `/opt/n8n` or cloudflared service unless the task explicitly requires it.
- Before any destructive VPS action, verify path and service target.

## Verified VPS status 2026-05-25 11:30 VN

- `/opt/zalocrm` exists and is on branch `private-hs`.
- Running commit: `02b6639 feat: deploy snapshot 2026-05-23 - privacy v2 + internal-notify + onboarding + cockpit`.
- `docker-compose.yml` has local VPS patch not committed in repo:
  - app port changed to `127.0.0.1:3080:3000`
  - MinIO port changed to `127.0.0.1:9000:9000`
- Containers up:
  - `zalo-crm-app`
  - `zalo-crm-db`
  - `zalo-crm-redis`
  - `zalo-crm-minio`
  - `zalo-crm-backup`
  - existing `n8n`
- Health:
  - `http://127.0.0.1:3080/` returns 200.
  - `http://127.0.0.1:3080/health` returns 200.
  - `https://zalo.hsholding.vn/` returns 200 via Cloudflare.
  - `https://files.hsholding.vn/minio/health/live` returns 200 via Cloudflare.
- Production env visible safe values:
  - `NODE_ENV=production`
  - `APP_URL=https://zalo.hsholding.vn`
  - `S3_ENDPOINT=http://minio:9000`
  - `S3_PUBLIC_URL=https://files.hsholding.vn`
  - `REDIS_URL=redis://redis:6379`
  - `AUTOMATION_STUB_MODE=false`
- App logs show Prisma DB sync completed and app booted.
- Schedulers/workers started: appointment reminders, overdue flip, Zalo health check, contact intelligence, friend-sync cron, status checkpoint, scoring decay/stuck/auto-tag, automation engine, birthday cron, broadcast scheduler, list enrichment.
- Redis event buffer connected.
- DB quick counts at verification: 1 org, 1 user, 1 scoring config, 1 Zalo account.
- Zalo account status at verification: `qr_pending`; no successful Zalo connection yet.
- Phase assessment:
  - Deploy plan Phase A-D done.
  - Phase E partially done: app/browser endpoint, files endpoint, setup/onboarding and scoring seed verified. Still need real Zalo login/connect and real attachment upload smoke test.

## Hotfix 2026-05-25 11:55 VN - Zalo QR stuck at Unsupported Media Type

- Symptom: QR modal stayed at "Dang tao QR code..." and showed `Unsupported Media Type`.
- Root cause: some browser/API calls hit `POST /api/v1/zalo-accounts/:id/login` with `Content-Type: application/x-www-form-urlencoded` and empty body. Backend had not registered `@fastify/formbody`, so Fastify returned 415 before reaching the Zalo QR handler.
- Verified before fix:
  - Direct SDK `zca-js.loginQR()` in container generated QR successfully, so VPS network/Zalo SDK were OK.
  - Same endpoint returned 415 only for form-url-encoded empty POST.
- Fix deployed on VPS:
  - `backend/src/app.ts`: register `@fastify/formbody`.
  - `frontend/src/composables/use-zalo-accounts.ts`: send `{}` JSON body for login/reconnect POSTs.
  - Rebuilt image with `docker compose --profile redis build app` and restarted only `app`.
- Verified after fix:
  - form-url-encoded login POST returns 200 instead of 415.
  - app health OK.
  - Zalo account `Thành Phạm` status `connected`; listener connected; labels/alias sync and live typing/seen events observed.
