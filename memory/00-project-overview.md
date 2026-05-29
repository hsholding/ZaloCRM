# Project Overview

ZaloCRM la fork hsholding cua upstream locphamnguyen/ZaloCRM, phuc vu quan ly nhieu tai khoan Zalo ca nhan tren mot CRM web. Fork nay them cac module noi bo HS Holding: lead scoring, friend/contact aggregate, onboarding, RBAC, privacy, system notification, automation phase 7, UI chat/contact/friends theo workflow sale.

## Stack

- Backend: Node.js ESM, Fastify 5, TypeScript, Prisma 7, PostgreSQL, Socket.IO, MinIO, zca-js.
- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router, Vuetify, Socket.IO client.
- Tests: backend Vitest. Frontend chua co test framework rieng.
- Local orchestration: Docker Compose, scripts trong `bin/` va `scripts/`.

## Branch/workflow tu README

- `main`: core stable/deploy branch cua fork.
- `upstream-mirror`: mirror sach upstream locphamnguyen.
- Feature branch: tach tu `main`, test local, merge ve `main` khi on.
- Stable tag da ghi trong README: `stable-2026-05-18`.

## Tinh than san pham

- CRM can phuc vu sale dung hang ngay: danh sach KH, chat, lien he, lich hen, note, automation, scoring.
- Thiet ke data phan biet goc nhin manager theo Contact va goc nhin sale/nick theo Friend.
- Cac thay doi UI nen uu tien thao tac nhanh, scan duoc, khong lam marketing page.
