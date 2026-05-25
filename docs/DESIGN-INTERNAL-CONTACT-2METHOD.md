# Design: Internal Contact 2-method Setup

> **Status:** APPROVED (anh chốt 2026-05-23)
> **Branch:** main
> **Mode:** Intrapreneurship
> **Supersedes:** Phase Privacy v2 internal contact MVP (single-field FK)
> **Module liên quan:**
> - `/settings/channels/zalo` tab "🏠 Liên lạc nội bộ" (page chính)
> - `/settings/org/system-notifications` (admin setup nick gửi)
> - `backend/src/modules/system-notifications/`

---

## 1. Vấn đề và bối cảnh

### Trạng thái hiện tại

- Module thông báo hệ thống (`/settings/org/system-notifications`) đã ship MVP — admin chọn nick gửi, bấm "Tìm UID" thủ công cho từng sale.
- Sale có 1 trường `User.internalContactZaloAccountId` — chỉ chọn được nick OWN trong CRM.
- Backend chỉ có 2 ràng buộc: nick cùng org + sale phải OWN.
- Lookup UID dùng `zaloOps.findUser(senderId, phone)` — cần SĐT của nick nội bộ, không có handshake xác nhận.

### Vấn đề thực tế

1. **Sale có nick personal không muốn cấp QR vào CRM** — hiện không cách nào setup nhận thông báo trên Zalo cá nhân đó.
2. **Không có verify** — UID lưu xong không biết sale có thực sự nhận được tin hay không. Có thể sai SĐT hoặc Zalo block.
3. **Không có handshake friendship** — chỉ findUser rồi sendMessage, sender chưa friend với target → có thể bị Zalo reject hoặc rate-limit gắt.
4. **UI lẫn với Privacy** — section "Liên lạc nội bộ" hiện đặt cùng tab Privacy ([PrivacyNicksTab.vue](../frontend/src/components/zalo-accounts/PrivacyNicksTab.vue)), button ẩn trong row → sale dễ bỏ qua.
5. **Không có onboarding push** — sale mới không biết phải setup → bỏ lỡ alert quan trọng.

### Goal sau khi ship

- 100% sale active có 1 trong 2 method setup xong + verified
- Notification gửi thành công ≥ 95% (Zalo channel)
- Time-to-setup ≤ 3 phút per sale (từ click vào tab → bấm "Có, đã nhận")

---

## 2. Premises (anh đã đồng ý)

1. **Có 2 cách thiết lập, sale chọn 1:**
   - **Cách 1 — CRM nick:** sale chọn 1 nick mình OWN trong CRM
   - **Cách 2 — Personal phone:** sale nhập SĐT nick Zalo cá nhân không có trong CRM

2. **Bản chất handshake:**
   - Cách 1: Nick OWN của sale (A) → friend request → Nick Hệ Thống (S). Sau khi S accept, A và S là friend. S có UID của A từ góc nhìn S → lưu vào `SystemNotifyRecipient.threadIdInSenderView`.
   - Cách 2: Nick Hệ Thống (S) → friend request → SĐT personal (P). Sau khi sale accept trên Zalo cá nhân, S có UID của P từ góc nhìn S → lưu vào `SystemNotifyRecipient.threadIdInSenderView`.

3. **Verify 4-digit code:** sau khi handshake xong, S gửi tin chứa mã 4 số ngẫu nhiên → sale gõ lại trên CRM để xác nhận thực sự nhận được tin. Chống case fake SĐT/UID.

4. **Onboarding push level: Banner persistent** ở header CRM nếu sale chưa setup. KHÔNG block CRM, KHÔNG bắt onboarding modal.

5. **UI location:** tách thành tab top-level trong tab-strip `/settings/channels/zalo` (tách khỏi Privacy). Thêm shortcut "🔔 Thông báo của tôi" trong Cá nhân group settings sidebar.

6. **Sale có thể đổi method bất kỳ lúc nào** — không lock sau khi setup.

---

## 3. Kỹ thuật khả thi — verify

✅ **Zalo SDK có sẵn API cần thiết:**
- `zaloOps.sendFriendRequest(accountId, message, userId)` — [zalo-operations.ts:532](../backend/src/shared/zalo-operations.ts#L532)
- `zaloOps.acceptFriendRequest(accountId, userId)` — [zalo-operations.ts:537](../backend/src/shared/zalo-operations.ts#L537)
- `zaloOps.getFriendRequestStatus(accountId, userId)` — [zalo-operations.ts:557](../backend/src/shared/zalo-operations.ts#L557)
- `zaloOps.findUser(accountId, phone)` — [zalo-operations.ts:511](../backend/src/shared/zalo-operations.ts#L511) (đã dùng trong system-notify-routes)

✅ **Friend event listener đã có** — `backend/src/modules/zalo/friend-event-handler.ts` (`applyFriendTransition`) bắn khi friend status đổi.

✅ **Schema `SystemNotifyRecipient` giữ nguyên** — chỉ thêm 2 status mới (`pending_friend_request`, `pending_user_confirm`) và 1 field verify code.

---

## 4. Schema changes

### User table

```prisma
model User {
  // ... existing fields ...

  // Phase Internal Contact 2-method 2026-05-23
  internalContactMethod        String?   @map("internal_contact_method")
  // 'crm_nick' | 'personal_phone' | null

  internalContactZaloAccountId String?   @map("internal_contact_zalo_account_id")
  // (đã có) — dùng khi method = 'crm_nick'

  internalContactPhone         String?   @map("internal_contact_phone")
  // (mới) — dùng khi method = 'personal_phone', normalize 84xxx

  internalContactSetupAt       DateTime? @map("internal_contact_setup_at")
  internalContactConfirmedAt   DateTime? @map("internal_contact_confirmed_at")
}
```

### SystemNotifyRecipient — thêm status mới + verify code

```prisma
model SystemNotifyRecipient {
  // ... existing fields ...

  // Phase Internal Contact 2-method 2026-05-23
  verifyCode             String?   @map("verify_code")
  // 4 chữ số ngẫu nhiên, S gửi cho sale qua tin xác nhận

  verifyCodeExpiresAt    DateTime? @map("verify_code_expires_at")
  // 30 phút sau khi gửi tin verify

  verifyAttempts         Int       @default(0) @map("verify_attempts")
  // chống brute-force, lock sau 5 lần sai
}
```

### RecipientStatus enum mở rộng

Hiện tại: `ready | missing_system_sender | missing_internal_contact | missing_internal_phone | sender_disconnected | uid_not_found | lookup_failed | invalid`

Thêm:
- `pending_friend_request` — đã gửi friend request, chờ accept
- `pending_user_confirm` — đã friend + gửi tin verify, chờ sale gõ code

---

## 5. Backend flow chi tiết

### Cách 1 — Sale chọn nick OWN

**Step 1: Sale chọn nick + initiate handshake**

```
PATCH /api/v1/me/internal-contact
Body: { method: 'crm_nick', zaloAccountId: '<nick A id>' }

Backend:
1. Validate nick A: cùng org, ownerUserId = currentUser.id, status = 'connected'
2. Load Nick Hệ Thống S từ Organization.systemNotifyZaloAccountId
   - Nếu chưa setup → 400 'org_not_configured'
3. Validate S.phone NOT NULL (cần phone để A.findUser tìm UID của S)
   - Nếu null → 400 'system_sender_missing_phone' (admin phải sync nick S trước)
4. Update User: internalContactMethod='crm_nick', internalContactZaloAccountId=A.id
5. Trigger handshake (background — gọi sync để response nhanh):
   - A.findUser(S.phone) → uid_of_S_from_A_view
   - Nếu A đã friend S rồi (query Friend table) → skip findUser, lấy UID có sẵn
   - A.sendFriendRequest(uid_of_S_from_A_view, message="CRM setup — accept để kết nối thông báo hệ thống")
6. Upsert SystemNotifyRecipient:
   - status='pending_friend_request'
   - error='Đang chờ Nick Hệ Thống chấp nhận lời mời'
7. Return { status: 'pending_friend_request', sender: {...}, internalContact: {...} }
```

**Step 2: Auto-accept (nick hệ thống tự accept vì là nick CRM control)**

Quan trọng: Nick S CRM đang điều khiển → admin/system tự gọi `acceptFriendRequest` thay vì chờ thủ công.

```
Cron / event listener:
- listen friend_request_received event trên nick S
- if from_uid là UID đang được setup cho sale nào đó (check pending request DB)
- → S.acceptFriendRequest(from_uid)
- → friend_event_handler bắn → SystemNotifyRecipient update
```

HOẶC đơn giản hơn: sau khi A gửi friend request thành công, gọi luôn `S.acceptFriendRequest(uid_of_A_from_S_view)`. Để có UID này thì:
- `S.findUser(A.phone)` → uid_of_A_from_S_view, hoặc
- Poll `S.getReceivedFriendRequests()` (mới — chưa có trong zalo-operations) tìm request mới nhất

→ **Em đề xuất route handshake làm tất cả trong 1 call:**

```
1. A.findUser(S.phone) → uid_S_from_A
2. S.findUser(A.phone) → uid_A_from_S
3. A.sendFriendRequest(uid_S_from_A, "...")
4. Delay 2s
5. S.acceptFriendRequest(uid_A_from_S)
6. friend_event handler tự upsert Friend rows + update SystemNotifyRecipient.threadIdInSenderView = uid_A_from_S
7. Generate verify code 4 số, save vào recipient
8. S.sendMessage("Mã xác nhận của bạn: 1234. Gõ lại trên CRM để hoàn tất.", uid_A_from_S)
9. Update recipient: status='pending_user_confirm', verifyCode=hash('1234'), verifyCodeExpiresAt=now+30min
```

**Step 3: Sale gõ verify code**

```
POST /api/v1/me/internal-contact/confirm
Body: { code: '1234' }

Backend:
1. Load recipient của currentUser, status='pending_user_confirm'
2. Compare hash(code) === recipient.verifyCode
3. Check expires
4. Increment verifyAttempts nếu sai. Lock sau 5 lần.
5. Nếu khớp:
   - recipient.status = 'ready'
   - recipient.verifyCode = null
   - User.internalContactConfirmedAt = now
6. Return { ok: true }
```

### Cách 2 — Sale nhập SĐT personal

**Step 1: Sale nhập SĐT + initiate handshake**

```
PATCH /api/v1/me/internal-contact
Body: { method: 'personal_phone', phone: '0987654321' }

Backend:
1. Normalize phone → '84987654321'
2. Validate phone format
3. Validate phone KHÔNG trùng với phone của bất kỳ ZaloAccount nào trong org
   - Nếu trùng → 400 'phone_already_in_crm' + suggest dùng cách 1
4. Load Nick Hệ Thống S
5. Update User: internalContactMethod='personal_phone', internalContactPhone='84987654321'
6. Trigger handshake:
   - S.findUser(phone) → uid_personal_from_S_view
   - Nếu uid null → recipient.status='uid_not_found', return 400
   - S.sendFriendRequest(uid_personal_from_S_view, message="CRM setup — chấp nhận để nhận thông báo công việc")
7. Upsert recipient:
   - threadIdInSenderView=uid_personal_from_S_view
   - status='pending_friend_request'
8. Return { status: 'pending_friend_request' }
```

**Step 2: Chờ sale accept trên Zalo cá nhân**

```
POST /api/v1/me/internal-contact/check-handshake

Backend:
1. Load recipient của currentUser
2. Call S.getFriendRequestStatus(recipient.threadIdInSenderView)
3. Nếu status = 'accepted':
   - friend_event handler đã upsert Friend
   - Generate verify code 4 số
   - S.sendMessage("Mã xác nhận: 1234. Gõ lại trên CRM.", uid)
   - recipient.status = 'pending_user_confirm'
4. Nếu vẫn pending → return { status: 'pending_friend_request' }
5. Nếu rejected → recipient.status='lookup_failed', error='Sale từ chối lời mời'
```

**Step 3: Sale gõ verify code** (giống cách 1)

### Resend / Retry endpoints

```
POST /api/v1/me/internal-contact/resend-friend-request
  → Gửi lại friend request (rate-limit: 1 lần / 5 phút)

POST /api/v1/me/internal-contact/resend-verify-code
  → Generate code mới, gửi lại tin verify (rate-limit: 1 lần / 1 phút)

DELETE /api/v1/me/internal-contact
  → Sale đổi method / reset → invalidate recipient row, set User.internalContactMethod=null
  → Optional: S.removeFriend(uid) hoặc giữ friendship (không phá vỡ relationship đã có)
```

### Friend event integration

`applyFriendTransition` cần handle case "nick OWN của sale vừa accepted friend với nick S":
- Check nếu sale này đang ở status `pending_friend_request`
- Move sang `pending_user_confirm` + trigger verify code send

---

## 6. UI specification

### Vị trí trong app

**Settings sidebar layout sau refactor:**

```
Settings
├─ Tổ chức
│  ├─ Hồ sơ tổ chức
│  ├─ Thông báo hệ thống         ← admin setup Nick Hệ Thống (đã có)
│  ├─ Sơ đồ tổ chức
│  ├─ Phân quyền
│  └─ ...
├─ Cá nhân
│  ├─ Hồ sơ
│  ├─ Đổi mật khẩu
│  └─ 🔔 Thông báo của tôi       ← MỚI, deeplink → channels/zalo tab Liên lạc nội bộ
├─ Kênh
│  └─ Zalo
│     ├─ Nick của tôi
│     ├─ 🔒 Riêng tư
│     └─ 🏠 Liên lạc nội bộ      ← TÁCH RIÊNG TAB (page chính)
```

### Persistent banner (sale chưa setup)

```
┌────────────────────────────────────────────────────────────────────┐
│  ⚠  Bạn đang BỎ LỠ thông báo quan trọng từ CRM!                    │
│      Khách đồng ý kết bạn, cảnh báo silent 30 ngày, lịch hẹn...    │
│      [ ⚙ Thiết lập ngay ]                                  [✕]     │
└────────────────────────────────────────────────────────────────────┘
```

- Hiện ở header CRM (dưới top nav)
- Dismissible nhưng quay lại sau 24h nếu chưa setup
- Click "Thiết lập ngay" → navigate `/settings/channels/zalo` tab Liên lạc nội bộ

### Page chính — State 0: Chưa setup

```
╔════════════════════════════════════════════════════════════════════╗
║  🏠 Liên lạc nội bộ                                                ║
║  Thiết lập kênh Zalo nhận thông báo CRM                            ║
╚════════════════════════════════════════════════════════════════════╝

┌─ 💎 TẠI SAO bạn CẦN thiết lập ─────────────────────────────────────┐
│                                                                    │
│  Mỗi ngày bạn bỏ lỡ thông tin = KHÁCH HÀNG MẤT TIỀN:              │
│                                                                    │
│  🟢  Khách đồng ý kết bạn          → chốt trong 5 phút đầu        │
│  🟡  Khách 30 ngày không tương tác → cứu được hay mất luôn        │
│  🔵  Lịch hẹn 15 phút nữa          → bạn quên = khách bực         │
│  🟣  Daily KPI 7h sáng             → biết hôm nay phải làm gì     │
│  🟠  Bot tự động báo lỗi           → sửa ngay hoặc bùng           │
│  🔴  Broadcast / chiến dịch        → không bị bỏ qua              │
│                                                                    │
│  ✨ TẤT CẢ gửi thẳng vào Zalo của bạn — không cần mở CRM          │
└────────────────────────────────────────────────────────────────────┘

Chọn cách thiết lập:

┌─ CÁCH 1 ─────────────────────────┐  ┌─ CÁCH 2 ────────────────────────┐
│ 📱 Dùng 1 nick CRM của tôi        │  │ ☎ Nhập SĐT Zalo cá nhân          │
│                                   │  │                                  │
│ Bạn đã đăng nhập 3 nick vào CRM.  │  │ Bạn không muốn đăng nhập nick    │
│ Chọn 1 nick để nhận thông báo.    │  │ cá nhân vào CRM? Nhập SĐT thôi.  │
│                                   │  │                                  │
│ ✅ Setup 1 phút                   │  │ ✅ Riêng tư hơn                  │
│ ✅ Không tốn nick mới             │  │ ✅ Nick cá nhân tách biệt CRM    │
│ ✅ Thông báo + chat khách dùng    │  │ ⚠  Cần SĐT có Zalo               │
│    chung 1 app Zalo               │  │                                  │
│                                   │  │                                  │
│ [ Chọn cách này → ]               │  │ [ Chọn cách này → ]              │
└───────────────────────────────────┘  └──────────────────────────────────┘
```

### Cách 1 — Wizard 3 step

**Step 1: Chọn nick CRM**

```
← Quay lại

╔═══════════════════════════════════════════════════════════════╗
║ CÁCH 1 — Bước 1/3: Chọn nick CRM nhận thông báo               ║
╚═══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ ○  Nick: 0936 123 456 — "Thành HS"                          │
│    👥 245 bạn  ·  🟢 Đang kết nối                            │
│                                                              │
│ ●  Nick: 0985 777 888 — "HS Holding"  ← đang chọn            │
│    👥 1.2K bạn  ·  🟢 Đang kết nối                           │
│                                                              │
│ ○  Nick: 0902 111 222 — "Auto Trade"                         │
│    👥 50 bạn  ·  🟢 Đang kết nối                             │
└─────────────────────────────────────────────────────────────┘

💡 Tip: chọn nick bạn check Zalo thường xuyên nhất

[ Tiếp theo → ]
```

**Step 2: Gửi friend request & auto-accept**

```
╔═══════════════════════════════════════════════════════════════╗
║ CÁCH 1 — Bước 2/3: Đang kết nối                               ║
╚═══════════════════════════════════════════════════════════════╝

  Nick "HS Holding" (của bạn)
              │
              ▼
  Gửi lời mời kết bạn → Nick Hệ Thống CRM
              │
              ▼  (Nick Hệ Thống tự động chấp nhận)
  ✅ Đã kết bạn thành công
              │
              ▼
  Nick Hệ Thống gửi mã xác nhận tới Zalo của bạn

⏳ Mở Zalo nick "HS Holding", xem tin từ "Nick Hệ Thống CRM"
```

**Step 3: Gõ verify code**

```
╔═══════════════════════════════════════════════════════════════╗
║ CÁCH 1 — Bước 3/3: Xác nhận mã 4 số                           ║
╚═══════════════════════════════════════════════════════════════╝

📩 Mở Zalo nick "HS Holding", bạn vừa nhận được tin từ
   "Nick Hệ Thống CRM" có nội dung:

   "Chào HS Holding! Mã xác nhận: XXXX. Gõ lại trên CRM
    để hoàn tất thiết lập nhận thông báo hệ thống."

Gõ mã 4 số:

   ┌───┐ ┌───┐ ┌───┐ ┌───┐
   │   │ │   │ │   │ │   │
   └───┘ └───┘ └───┘ └───┘

[ Xác nhận ]    [ Chưa nhận tin? Gửi lại ]
```

### Cách 2 — Wizard 3 step

**Step 1: Nhập SĐT + initiate**

```
╔═══════════════════════════════════════════════════════════════╗
║ CÁCH 2 — Bước 1/3: Nhập SĐT Zalo cá nhân                      ║
╚═══════════════════════════════════════════════════════════════╝

Số điện thoại Zalo nhận thông báo:
┌─────────────────────────────────────────────────────────────┐
│ 📱  0987 654 321                                              │
└─────────────────────────────────────────────────────────────┘

⚠  Quan trọng: đây là SĐT nick Zalo bạn KHÔNG đăng nhập vào CRM.
   Hệ thống sẽ gửi lời mời kết bạn từ "Nick Hệ Thống CRM" tới
   SĐT này. Bạn cần accept trên Zalo cá nhân để hoàn tất.

🔒 SĐT này CHỈ dùng cho thông báo hệ thống. CRM KHÔNG đọc
   tin nhắn cá nhân của bạn.

[ Gửi lời mời kết bạn → ]
```

**Step 2: Chờ sale accept trên Zalo cá nhân + polling**

```
╔═══════════════════════════════════════════════════════════════╗
║ CÁCH 2 — Bước 2/3: Chấp nhận trên Zalo cá nhân                ║
╚═══════════════════════════════════════════════════════════════╝

⏳ Đã gửi lời mời từ "Nick Hệ Thống CRM" → 098xxx4321

Mở Zalo trên điện thoại cá nhân của bạn:
1️⃣  Vào tab "Yêu cầu kết bạn"
2️⃣  Tìm "Nick Hệ Thống CRM" → bấm Chấp nhận
3️⃣  Bấm "Tôi đã chấp nhận" bên dưới

   ⠋ Đang kiểm tra... (auto refresh mỗi 5s)

[ Tôi đã chấp nhận — Kiểm tra ngay ]   [ Gửi lại lời mời ]
```

**Step 3: Verify code** — giống cách 1

### State "Đã setup" (sau khi confirmed)

```
╔═══════════════════════════════════════════════════════════════╗
║ ✅ Đã thiết lập xong                                          ║
╚═══════════════════════════════════════════════════════════════╝

Đang nhận thông báo qua:
┌─────────────────────────────────────────────────────────────┐
│ 📱 [CÁCH 1] Nick "HS Holding" (0985 777 888)                 │
│ 🆔 UID đã lưu: 1234567890                                    │
│ 🟢 Đang hoạt động  ·  Verified 12:34 23/05/2026              │
└─────────────────────────────────────────────────────────────┘

Hệ thống sẽ gửi 6 loại thông báo cho bạn:
✓ Khách đồng ý kết bạn
✓ Cảnh báo KH 30 ngày silent
✓ Nhắc lịch hẹn 15 phút trước
✓ Daily KPI 7h sáng
✓ Bot tự động báo lỗi/hoàn thành
✓ Broadcast / chiến dịch

[ 🔄 Đổi cách thiết lập ]    [ 🧪 Gửi tin test ngay ]
```

---

## 7. Edge cases — đã chốt cách xử lý

| # | Edge case | Hành xử |
|---|---|---|
| E1 | Nick OWN của sale đã friend với Nick Hệ Thống từ trước | Skip findUser + sendFriendRequest. Query Friend table lấy UID. Đi thẳng sang gửi verify code. |
| E2 | Sale đổi SĐT (cách 2) — SĐT cũ vẫn có UID lưu | UI bắt sale `DELETE /me/internal-contact` trước khi setup lại. Backend cleanup recipient row cũ. |
| E3 | Admin đổi Nick Hệ Thống (Org.systemNotifyZaloAccountId) | `SystemNotifyRecipient` key theo `(targetUserId, senderZaloAccountId)`. Đổi sender = mapping mới phải setup lại. Sale thấy banner "Hệ thống đã đổi nick gửi, hãy thiết lập lại". |
| E4 | Cách 2 — SĐT trùng với nick OWN trong CRM | Warning "SĐT này thuộc nick X bạn đã đăng nhập. Dùng cách 1 hiệu quả hơn" → đề xuất switch. |
| E5 | Friend request gửi xong sale không accept trong 24h | Status `pending_friend_request` + cron cleanup pending > 7 ngày → reset về `null`. UI hiện retry button. |
| E6 | Verify code sai 5 lần | Lock `verifyAttempts` ≥ 5 → button "Gửi lại mã" disabled trong 30 phút. Sau đó reset attempts. |
| E7 | Verify code hết hạn 30 phút | Auto invalidate. UI hiện "Mã đã hết hạn" + button "Gửi lại". |
| E8 | Nick S offline tại thời điểm handshake | Block setup, hiện error "Nick Hệ Thống đang offline, vui lòng thử lại sau". Sale không thể init handshake. |
| E9 | Nick S.phone chưa sync (null) | Cách 1 fail vì A cần phone của S để findUser. Hiện error "Admin chưa hoàn thiện setup nick gửi — liên hệ admin". |
| E10 | Sale bị remove khỏi org sau khi setup | Cascade delete `SystemNotifyRecipient` qua FK existing. Không cần thêm logic. |
| E11 | Nick OWN của sale bị disconnected sau khi setup | Status `sender_disconnected` (theo perspective cách 1 dùng nick OWN làm receiver). Notification fail → fallback channel `crm_panel`. |
| E12 | Sale rời org trong lúc đang `pending_friend_request` | Cron cleanup pending > 7 ngày phụ trách. Hoặc trigger ngay khi `User.isActive=false`. |
| E13 | Sale có 2 device Zalo cùng nick → tin verify gửi cả 2 nơi | Không vấn đề. Zalo auto sync, sale gõ code ở đâu cũng được. |

---

## 8. Endpoints summary

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/me/internal-contact` | Load current setup state + 2 method options |
| PATCH | `/api/v1/me/internal-contact` | Initiate setup (body: `{ method, zaloAccountId? \| phone? }`) |
| POST | `/api/v1/me/internal-contact/check-handshake` | Polling check accepted/not (cách 2) |
| POST | `/api/v1/me/internal-contact/confirm` | Gõ verify code |
| POST | `/api/v1/me/internal-contact/resend-friend-request` | Retry friend request (rate-limit 1/5min) |
| POST | `/api/v1/me/internal-contact/resend-verify-code` | Retry verify code (rate-limit 1/1min) |
| DELETE | `/api/v1/me/internal-contact` | Reset setup, sale chọn lại |

---

## 9. Status state machine

```
                  ┌──────────────────────────┐
                  │ Sale chưa setup          │
                  │ User.internalContactMethod = null │
                  └────────────┬─────────────┘
                               │ PATCH /me/internal-contact
                               ▼
                  ┌──────────────────────────┐
                  │ pending_friend_request   │
                  │ (đã gửi friend request)  │
                  └────────────┬─────────────┘
                               │
                ┌──────────────┴───────────────┐
                │                              │
       ┌────────▼─────────┐          ┌─────────▼────────┐
       │ Accepted         │          │ Not accepted 7d  │
       │                  │          │ → cleanup cron   │
       └────────┬─────────┘          └──────────────────┘
                │ Generate verify code
                │ S.sendMessage(code, uid)
                ▼
       ┌──────────────────┐
       │ pending_user_    │
       │ confirm          │
       └────────┬─────────┘
                │
        ┌───────┴──────────┐
        │                  │
   ┌────▼────┐      ┌──────▼──────┐
   │ Code OK │      │ Code wrong  │
   │         │      │ 5 times     │
   └────┬────┘      └──────┬──────┘
        │                  │
        ▼                  ▼
   ┌─────────┐      ┌──────────────┐
   │ ready   │      │ verifyAttempts│
   │         │      │ lock 30 min  │
   └─────────┘      └──────────────┘
```

---

## 10. Rollout plan

### Phase A — Backend (3-4h)
1. Migration: `User.internalContactMethod`, `internalContactPhone`, `internalContactSetupAt`, `internalContactConfirmedAt`
2. Migration: `SystemNotifyRecipient.verifyCode`, `verifyCodeExpiresAt`, `verifyAttempts`
3. Refactor `PATCH /me/internal-contact` → multi-method
4. Add handshake endpoints (initiate, check-handshake, confirm, resend, delete)
5. Friend event handler integration
6. Cron cleanup pending > 7 ngày

### Phase B — Frontend (3-4h)
1. Tách "🏠 Liên lạc nội bộ" thành tab top-level trong tab-strip channels/zalo
2. Build `InternalContactSetupPage.vue` với:
   - State 0 (2-card chọn cách)
   - Cách 1 wizard 3 step
   - Cách 2 wizard 3 step
   - State done
3. Add sidebar entry "🔔 Thông báo của tôi" trong Cá nhân group
4. Persistent banner ở DefaultLayout header
5. Remove section internal contact cũ trong PrivacyNicksTab

### Phase C — Verify & polish (1-2h)
1. Test e2e cả 2 cách bằng nick test (HS Holding → Thành Phạm)
2. Verify autonomous test loop theo memory rule
3. Codex review
4. Document update

**Total estimate: 7-10h. Em ship trong 1-2 ngày làm việc.**

---

## 11. Open questions còn chưa chốt (anh xem có cần điều chỉnh không)

1. **Verify code expiry — 30 phút có đủ không?** Đề xuất 30 phút. Anh thấy ngắn/dài?

2. **Rate-limit resend friend request — 1/5 phút có ổn không?** Tránh Zalo flag nick S spam.

3. **Cách 1 auto-accept timing — sau khi A sendFriendRequest, delay bao lâu trước khi S.acceptFriendRequest?** Đề xuất 2-3s để Zalo xử lý request thực sự xong. Quá nhanh có thể fail.

4. **Cron cleanup pending — chạy mỗi ngày 3h sáng?** Hoặc anh muốn aggressive hơn (mỗi 6h)?

5. **Khi sale `DELETE /me/internal-contact` (đổi method) — có gọi `removeFriend` không?** Em đề xuất KHÔNG, giữ friendship để dễ re-setup. Anh có concern privacy gì không?

---

## Reviewer Concerns

(none — design này em đã self-review, ready to implement)

---

## The Assignment

Sau khi anh ack design doc này, em sẽ bắt đầu Phase A (backend). Đã track trong TodoWrite. Em sẽ STOP trước khi code và confirm 5 câu trên ở mục Open Questions.
