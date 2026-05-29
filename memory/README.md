# ZaloCRM Memory

Updated: 2026-05-25

Thu muc nay la bo nho lam viec cho Codex khi tiep tuc code ZaloCRM. Muc tieu la doc nhanh vai file ngan de nam context, khong phai doc lai toan bo README/TODO/plans/mockup moi lan.

## Doc theo thu tu

1. `00-project-overview.md` - ZaloCRM la gi, stack, workflow branch.
2. `01-system-map.md` - map backend/frontend/database va module chinh.
3. `02-data-model-decisions.md` - cac quyet dinh quan trong ve Contact/Friend/Message/Activity.
4. `03-dev-workflow.md` - cach chay, test, validate.
5. `modules/*.md` - memory theo module khi dang code dung module do.
6. `backlog/current.md` - viec dang cho, P0/P1/P2, risk.
7. `designs/mockups-index.md` - danh muc docs/mockup Claude da de lai.
8. `deployment-vps.md` - bo nho deploy VPS sanitized; credential that nam trong private handoff ngoai repo.

## Nguyen tac cap nhat memory

- Memory chi luu ket luan, invariant, luong chinh, file quan trong, risk. Khong copy nguyen docs dai.
- Khi co quyet dinh moi cua anh, them vao `02-data-model-decisions.md` hoac file module lien quan.
- Khi lam xong viec lon, cap nhat `backlog/current.md`: done/defer/risk/test.
- Khi them mockup/design moi, them link vao `designs/mockups-index.md`.
- Neu memory mau thuan voi source code, uu tien source code hien tai va sua memory.

## Nguon da quet ban dau

- Root docs: `README.md`, `TODO.local.md`, `Giai_thich.md`, `HUONG-DAN-CAI-DAT.md`, `HUONG-DAN-SU-DUNG.md`.
- Plans: `plans/*.md`, `plans/reports/*.md`, `plans/260329-0040-s6-integration-hub/*.md`.
- Docs: `docs/*.md`, `docs/designs/*.md`.
- Mockups HTML: root hidden mockups, `frontend/public/*.html`, `docs/designs/*.html`, `assets/posts/facebook/*.html`.
- Source map: `backend/src/modules`, `backend/prisma/schema.prisma`, `frontend/src/views`, package files.
- VPS handoff private: `C:\Users\EVO-THANH\.vps-thanh\HANDOFF-ZALOCRM-DEPLOY.md` (khong copy secret vao repo).
