# Dev Workflow

## Commands

Backend:

```bash
cd backend
npm run dev
npm run build
npm run test
npm run db:push
npm run db:migrate
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
```

Docker:

```bash
docker compose up -d --build
docker compose down
```

## Validation preference

- Backend route/service/schema changes: run focused Vitest when available, otherwise `npm run build`.
- Prisma schema changes: inspect migration naming, run `npm run db:push` only when intended for local DB.
- Frontend changes: run `npm run build` because no frontend unit test framework is established.
- Realtime/Socket/UI aggregate changes: manual verify affected view because many bugs are data freshness/display drift.

## Coding guardrails

- Khong sua `.env`/secret.
- Khong revert unrelated local changes.
- Khi sua Contact/Friend data flow, check ca backend serializer/aggregate va frontend composable/view.
- Khi sua Zalo operation, tim boundary in `backend/src/shared/zalo-operations.ts`; tests usually mock o boundary nay.
- Khi sua automation/scoring, check cron/scheduler side effects and test fixtures.
