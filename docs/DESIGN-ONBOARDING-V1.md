# Design: Onboarding flow cho sale mới — Phase 1

> **Status:** APPROVED (anh chốt 2026-05-24)
> **Mode:** Intrapreneurship
> **Goal:** Sale mới nhận password → 4 step setup ban đầu không miss → CRM hoạt động trơn tru ngay ngày đầu

---

## 1. Vấn đề

### Hiện trạng (trước phase này)

- Admin tạo user qua `POST /users` → giao password cho sale → sale login vào dashboard
- KHÔNG có flag `mustChangePassword` → sale dùng nguyên password admin biết (security risk)
- KHÔNG có wizard / checklist sau lần đầu login → sale loay hoay
- Banner internal contact (đã ship) chỉ nhắc 1 việc → sale chưa scan QR nick → click banner → kẹt → bỏ qua

### Goal sau khi ship

- 100% sale active đổi password lần đầu (forced)
- ≥ 90% sale hoàn tất 3/4 bước trong vòng 7 ngày
- Admin biết ai đã setup xong, ai chưa qua RBAC users page
- Time-to-productive ≤ 10 phút từ login đầu tiên

---

## 2. Premises (đã chốt)

1. **Đổi password lần đầu là FORCE block** — không cho dùng CRM cho tới khi đổi
2. **Kết nối nick Zalo bắt buộc ≥ 1 nick OWN** cho mọi role (member, admin, owner) — anh chốt
3. **Setup internal contact + PIN là CHECKLIST**, không force
4. **PIN sub-step là tuỳ chọn** — sale có thể bấm "Bỏ qua" → ghi `pin: 'skipped'`
5. **Auto-detect step completion** — không cần sale tự bấm "đã xong"

---

## 3. Decisions đã chốt

| # | Quyết định | Chi tiết |
|---|---|---|
| 1 | Password strength | Regex `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$` — 8 ký tự, chữ hoa + chữ thường + số |
| 2 | Sau đổi password | Invalidate JWT cũ → force login lại với password mới |
| 3 | Step 2 bắt buộc nick OWN | Mọi role phải có ≥ 1 nick connected để qua step 3 |
| 4 | Vị trí checklist | **Top của Dashboard tab** (`/` route), sticky cho tới khi xong ≥ 3/4 |
| 5 | Toast Congrats | 1 toast nhỏ "🎉 Setup hoàn tất!" + checklist auto-collapse |
| 6 | Magic email link | KHÔNG làm phase này |
| 7 | Step 2 multi-nick | Option A — connect 1 nick xong button "Tôi đã xong" enable, sale tự bấm tiếp (không auto next) |

---

## 4. Schema changes

```prisma
model User {
  // ... existing ...

  // Phase Onboarding v1 2026-05-24
  passwordChangedAt        DateTime? @map("password_changed_at")
  // null = chưa đổi password lần đầu (FORCE block). Set khi sale tự đổi.

  onboardingStepsCompleted Json?     @map("onboarding_steps_completed")
  // {
  //   "change_password": "2026-05-24T...",       // ISO timestamp
  //   "connect_nick":    "2026-05-24T...",
  //   "internal_contact": "2026-05-24T...",
  //   "pin":             "2026-05-24T..." | "skipped"
  // }

  onboardingDismissedAt    DateTime? @map("onboarding_dismissed_at")
  // sale bấm "Ẩn" checklist → collapse thành mini indicator. Sau 24h auto re-expand 1 lần
  // nếu chưa đủ 3/4, sau đó tôn trọng dismiss vĩnh viễn.
}
```

**Backfill migration:**
```sql
-- User cũ (trước phase này) coi như đã đổi password xong, không bị force.
UPDATE "users"
SET "password_changed_at" = "created_at"
WHERE "password_changed_at" IS NULL
  AND "created_at" < '2026-05-24';
```

---

## 5. Backend endpoints

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/me/change-password` | Validate strength + bcrypt + revoke JWT |
| GET | `/api/v1/me/onboarding` | Trả 4 step status + completion % |
| POST | `/api/v1/me/onboarding/skip-step` | Body `{ step: 'pin' }` — chỉ PIN được skip |
| POST | `/api/v1/me/onboarding/dismiss` | Set `onboardingDismissedAt = now` |

**Auto-detect logic:**

| Step | Detection rule |
|---|---|
| `change_password` | `passwordChangedAt != null` |
| `connect_nick` | `COUNT(zalo_accounts WHERE owner_user_id=me AND status='connected') ≥ 1` |
| `internal_contact` | `system_notify_recipients.status = 'ready'` cho user này |
| `pin` | `privacyPinHash != null` OR `onboardingStepsCompleted.pin = 'skipped'` |

Completion % = (xong_steps / 4) × 100. Nếu sale skip PIN → coi như xong cho tính %.

**Password change flow:**
```
POST /me/change-password { currentPassword, newPassword }
  1. Validate newPassword strength regex
  2. Bcrypt compare currentPassword với passwordHash hiện tại
  3. Reject nếu newPassword === currentPassword
  4. Hash newPassword, update User.passwordHash + passwordChangedAt = now
  5. Bump jwtTokenVersion (mới — add vào User schema) → invalidate JWT cũ
  6. Return { ok: true, requireRelogin: true }
```

**JWT version field bổ sung:**
```prisma
model User {
  // ...
  jwtTokenVersion Int @default(0) @map("jwt_token_version")
}
```
JWT payload thêm `tv: user.jwtTokenVersion`. Middleware reject nếu `token.tv !== user.jwtTokenVersion`.

---

## 6. Frontend flow

### Router guard

```ts
router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  if (auth.isAuthed && auth.user?.passwordChangedAt === null) {
    if (to.path !== '/setup-password') return next('/setup-password');
  }
  next();
});
```

### Component tree

```
DefaultLayout
├─ Header
├─ Banner internal contact (existing, hide khi onboarding active)
├─ Main
│  ├─ DashboardView
│  │  ├─ OnboardingChecklist (sticky top, v-if !dismissed)
│  │  ├─ ... dashboard widgets ...
│  ├─ ... other routes ...
└─ MiniOnboardingIndicator (footer, v-if dismissed && completion < 100%)

/setup-password route (auth layout)
└─ ForcePasswordChangeView
```

### UI mockup tổng quan

**State 1 — Modal force đổi password (sau login lần đầu):**
- Full screen, không close được, không X
- 3 input: current / new / confirm
- Strength meter realtime
- Submit → toast "Đổi thành công, đang đăng nhập lại..." → logout → relogin

**State 2 — Dashboard + checklist 1/4:**
```
👋 Chào mừng [Tên sale] đến với HS ZALO CRM!

🎯 Thiết lập của bạn — 1/4                              [×] Ẩn
─────────────────────────────────────────────────────────────
✅ Đổi mật khẩu                              Hoàn tất 12:30
⬜ Kết nối nick Zalo                  [ Kết nối ngay → ]
⬜ Thiết lập nhận thông báo            [ Thiết lập → ]
⬜ (Tuỳ chọn) Đặt PIN nick riêng tư  [Bỏ qua] [ Setup → ]
```

**State 3 — Step 2 click "Kết nối ngay":**
```
Bước 2/4: Kết nối nick Zalo của bạn

Nick đã kết nối:
✅ Thành HS Holding · 1.2K bạn · 🟢
✅ Thành Phạm · 50 bạn · 🟢

[➕ Kết nối thêm nick]

[← Quay lại]   2 nick có sẵn   [Tôi đã xong →]
```

**State 4 — Step 3 click "Thiết lập":**
Deeplink `/settings/channels/zalo?tab=internal-contact&from=onboarding`. Reuse `InternalContactSetupPage` đã ship.

**State 5 — Step 4 click "Setup":**
```
Bước 4/4 (Tuỳ chọn): Bảo mật nick cá nhân
🔒 Bạn có thể đặt nick "Riêng tư": admin/sale khác không xem
được nội dung chat, chỉ bạn unlock bằng PIN 4 số.

        [Bỏ qua]    [Thiết lập PIN →]
```
Click setup → PIN dialog → unlock → toggle nick list (cap maxPrivacyNicks).

**State done — 4/4 ✓:**
```
🎉 Setup hoàn tất! Toast 3s
Checklist auto-collapse → mini indicator góc phải:
[🎯 4/4 ✓]
```

---

## 7. Edge cases — đã chốt

| # | Case | Hành xử |
|---|---|---|
| EC1 | User cũ login (legacy account) | Backfill `passwordChangedAt = createdAt` → không force |
| EC2 | Admin reset password sale | API set `passwordChangedAt = null` + bump `jwtTokenVersion` → next login force lại |
| EC3 | Sale skip PIN | `onboardingStepsCompleted.pin = 'skipped'` → coi như xong cho tính 4/4 |
| EC4 | Sale chuyển sang nick mới — nick cũ disconnect | Step `connect_nick` check `≥ 1 nick connected` — vẫn xanh |
| EC5 | Sale internal_contact pending verify | Step 3 vàng warning "chưa verify code", click vào tab vẫn navigate được |
| EC6 | Admin xoá nick OWN của sale → 0 nick còn lại | Step 2 revert đỏ, banner internal contact + checklist quay lại |
| EC7 | Sale "Ẩn" checklist nhưng chưa đủ 3/4 | Sau 24h auto re-expand 1 lần. Sau dismiss lần 2 → tôn trọng vĩnh viễn, chỉ còn mini indicator |
| EC8 | Sale bấm "Bỏ qua" PIN rồi đổi ý | Vào tab "🔒 Riêng tư" setup PIN sau — `pin` step quay xanh tự động |
| EC9 | Sale có 0 nick (chưa scan QR nào) | Button "Tôi đã xong" step 2 disabled + tooltip "Cần ít nhất 1 nick" |
| EC10 | Sale đạt cap 2/2 PIN privacy nick muốn ẩn nick thứ 3 | OFF nick đang ẩn trước → ON nick mới. UI hint cap rõ ràng |
| EC11 | Newpassword giống currentPassword | Reject 400 "Password mới phải khác password cũ" |
| EC12 | JWT cũ vẫn dùng được sau đổi password | Bump `jwtTokenVersion` → middleware reject token cũ → force logout |

---

## 8. State machine onboarding

```
LOGIN LẦN ĐẦU (passwordChangedAt = null)
   ↓
[FORCE] /setup-password ──→ Đổi password ──→ Logout + Relogin
   ↓
DASHBOARD + CHECKLIST 1/4
   ↓
   ├─→ Step 2: Connect ≥ 1 nick ──auto detect──┐
   │       ↓                                    │
   ├─→ Step 3: Internal contact ready ──auto detect──┤
   │       ↓                                    │
   └─→ Step 4: PIN set hoặc skipped ──auto detect──┤
                                                  │
                                                  ▼
                       Checklist 4/4 ✓ → Toast → Collapse → Mini indicator
```

---

## 9. Rollout plan

**Backend Phase (~3-4h):**
1. Migration: 4 field User (`passwordChangedAt`, `onboardingStepsCompleted`, `onboardingDismissedAt`, `jwtTokenVersion`)
2. Auth middleware: check `tv` claim vs user.jwtTokenVersion
3. `POST /me/change-password` endpoint
4. `GET /me/onboarding` (derive 4 step status)
5. `POST /me/onboarding/skip-step` + `POST /me/onboarding/dismiss`
6. Extend RBAC users API: thêm cột `onboardingPercent`

**Frontend Phase (~5-6h):**
7. Router guard cho `passwordChangedAt === null`
8. `ForcePasswordChangeView.vue` + strength meter
9. `OnboardingChecklist.vue` sticky top Dashboard
10. `OnboardingNickConnect.vue` wizard step 2 — reuse QR flow của ZaloAccountsView
11. Step 3 deeplink → InternalContactSetupPage (đã có)
12. `OnboardingPrivacySetup.vue` wizard step 4 — PIN + toggle list nick
13. `MiniOnboardingIndicator.vue` footer
14. RBAC users page: cột "Onboarding" + drawer chi tiết

**Verify Phase (~1-2h):**
15. Tạo user test mới qua admin
16. Login → force change → 4 step e2e
17. Verify auto-detect, dismiss/re-expand, admin %
18. Codex review

**Total estimate: ~9-12h, ship 2 ngày.**

---

## 10. Reviewer Concerns

(none — design này anh đã review iteratively qua 2 round Q&A, ready to implement)
