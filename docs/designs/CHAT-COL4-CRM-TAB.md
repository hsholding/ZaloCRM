# Design: Tab "CRM" — Sale Cockpit (chat cột 4)

**Status:** DRAFT — Chờ anh duyệt
**Generated:** 2026-05-22 (via /office-hours skill)
**Replaces:** Tab "Quan hệ" hiện tại trong `ChatContactPanel.vue`
**Branch:** local

---

## 1. Problem

Tab "Quan hệ" cột 4 chat (309×viewport px) hiện đang lãng phí:
- Show data admin (per-nick relationship list) thay vì sale-actionable info
- Sale ngồi chat KH nhưng KHÔNG có context để ra quyết định nhắn gì, gửi gì
- Không support sale phối hợp với nhau (đụng cùng KH → dẫm chân hoặc lỡ cơ hội)

## 2. Goal

Tab "CRM" = **Sale Cockpit** — lướt xem → ra hành động ngay. Cụ thể:
1. Sale biết NÊN NHẮN GÌ tiếp theo (AI suggestion)
2. Sale biết KH NÓNG hay LẠNH (priority + trend)
3. Sale biết LỊCH HẸN + lần chat cuối (timeline)
4. Sale biết AI đang cùng chăm KH này + cách phối hợp (đồng đội section)
5. Future-ready: link sang Getfly CRM (company-wide source of truth)

## 3. Constraints chốt với anh

- ✅ Width fixed 309px, height scroll dài thoải mái (anh OK)
- ✅ Giữ 3 tab kia (Hồ sơ / Lịch hẹn / Điểm) y nguyên
- ✅ Section "Đồng đội chăm KH" giữ lại nhưng ĐỔI MỤC ĐÍCH: từ admin view → sale collaboration view
- ✅ KHÔNG add field DB mới (anh từ chối) — em dùng data có sẵn + placeholder UI
- ✅ AI dùng `/ai/format-rich` infrastructure có sẵn (Gemini 2.5 Flash, anh đã setup)

## 4. Layout — 7 widget

### Widget 1: Liên kết Getfly (MỚI — placeholder)
**Height:** 56px

```
┌─────────────────────────────────────────┐
│ 🔗 Liên kết Getfly CRM                  │
│ ⚪ Chưa liên kết     [Liên kết →]       │
└─────────────────────────────────────────┘
```

- **Data source:** `Contact.metadata.getflyId` (JSON field có sẵn, dùng key mới — không cần migration)
- **Logic v1 (placeholder):** Button disabled, tooltip "Chức năng phát triển sau"
- **Future v2:** Click → modal nhập Getfly contact ID hoặc auto-match qua phone → lưu vào `metadata.getflyId`
- **States:** "⚪ Chưa liên kết" (default) | "✅ Đã liên kết · GF-12345" (sau khi link)

### Widget 2: Next Action (AI gợi ý)
**Height:** ~140px

```
┌─────────────────────────────────────────┐
│ ⚡ Hành động đề xuất                    │
│ ┌─────────────────────────────────────┐ │
│ │ 💬 KH đã 7 ngày không nhắn lại.    │ │
│ │ Gợi ý: "Anh ơi, căn B2-12A em đã   │ │
│ │ giữ chỗ giúp anh tới hôm nay. Bên   │ │
│ │ em còn 2 căn cuối, anh tiện ghé     │ │
│ │ xem cuối tuần này không ạ?"          │ │
│ └─────────────────────────────────────┘ │
│ [💬 Gửi ngay]  [↻ Đổi gợi ý]            │
└─────────────────────────────────────────┘
```

- **Data source:** Endpoint `POST /api/v1/ai/suggest` (đã có) + context = last 40 messages
- **AI prompt:** Reuse `buildReplyDraftPrompt(language)` có sẵn — không sửa
- **Trigger:** Auto-fetch khi mở tab, có cache 5min để tiết kiệm quota
- **Button "Gửi ngay":** Insert text vào editor cột 3 + focus (không tự gửi để sale review)
- **Button "Đổi gợi ý":** Re-fetch với `regenerate=true` flag

### Widget 3: Nhiệt KH
**Height:** ~110px

```
┌─────────────────────────────────────────┐
│ 📊 Nhiệt KH                              │
│ Priority [██████░░░░] 65/100             │
│ 🔥 Nóng · ↑+22% so tuần trước            │
│ ⚠ Stuck 3 ngày qua mọi nick              │
└─────────────────────────────────────────┘
```

- **Data source:**
  - `Contact.priorityScore` (0-100, Phase 8 có sẵn)
  - `Contact.engagementPattern` ('hot'|'champion'|'stable'|'cooling'|'cold'|'noise')
  - `Contact.engagementTrend` (% change)
  - `Contact.stuckSinceAggregate` (DateTime?) — nếu null → ẩn dòng warning
- **Pattern icon map:** hot=🔥 / champion=👑 / stable=🟢 / cooling=🟡 / cold=🔵 / noise=⚪
- **Color tone bar:** 0-30 xanh dương → 30-60 xanh lá → 60-80 cam → 80+ đỏ

### Widget 4: Timeline
**Height:** ~120px

```
┌─────────────────────────────────────────┐
│ ⏰ Timeline                              │
│ 📅 Quen 47 ngày · 📞 FB Ads 15/04        │
│ 🟢 KH chat cuối: 3 giờ trước             │
│ 🔵 Bạn chat cuối: 2 ngày trước           │
│ 📍 Lịch hẹn: 25/05 14:00 (3 ngày nữa)   │
└─────────────────────────────────────────┘
```

- **Data source:**
  - `Contact.firstContactDate` → "Quen N ngày"
  - `Contact.source` + `sourceDate` → "FB Ads · 15/04"
  - `Contact.lastInboundAt` → "KH chat cuối"
  - `Contact.lastOutboundAt` → "Bạn chat cuối"
  - `Contact.nextAppointment` → "Lịch hẹn"
- **Format:** dùng `formatInOrgTz` + relative time helper có sẵn
- **Empty handling:** Ẩn dòng nếu data null (vd KH chưa có lịch hẹn → không hiện)

### Widget 5: Sản phẩm quan tâm (placeholder)
**Height:** ~80px

```
┌─────────────────────────────────────────┐
│ 🎯 Sản phẩm quan tâm                     │
│ ┌─────────────────────────────────────┐ │
│ │ ⓘ Chức năng đang phát triển         │ │
│ │ Sẽ tự agg nhu cầu từ KH parent     │ │
│ │ (cha) — gom data từ nhiều nick     │ │
│ │ chăm cùng 1 KH này                  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- **Data source v1:** KHÔNG có — placeholder thuần
- **Future v2:** Aggregate từ `Contact.parent.children[].notes` + `autoTags` containing product keywords. Hoặc model mới `ContactInterest` — quyết định sau khi anh duyệt design.
- **UI v1:** Box gray italic, không có button

### Widget 6: Đồng đội chăm KH (anh chốt 2026-05-22 — AI-assisted handoff)
**Height:** ~80px header + 110px per friend row (variable)

```
┌─────────────────────────────────────────┐
│ 🤝 Đồng đội chăm KH (3)                  │
│ 💡 3 sale khác đang chăm KH này          │
│ ┌─────────────────────────────────────┐ │
│ │ [av] Thành Phạm                     │ │
│ │     HS Holding · 🟢 Active 6h        │ │
│ │ 📥 245  📤 178                       │ │
│ │ [✨ AI nhắn Thành phối hợp]         │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ [av] Em Vỹ                          │ │
│ │     🔵 14 ngày không chat           │ │
│ │ 📥 12  📤 8                          │ │
│ │ [✨ AI nhắn Vỹ phối hợp]            │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- **Data source per row:**
  - `Friend` records cùng `contactId` parent (gom multi-nick)
  - `ZaloAccount.owner` → tên sale + `ZaloAccount.zaloUid` → mở Zalo link
  - `Friend.totalInbound` + `totalOutbound` → 📥/📤 count
  - `Friend.lastInboundAt` → status pill
- **Status pill logic:**
  - lastInbound < 24h → 🟢 "Active Xh"
  - 1-7 ngày → 🟡 "Đang chăm"
  - >7 ngày → 🔵 "Lạnh — X ngày không chat"
  - Nick đang dùng hiện tại → **ẨN** (anh nhìn vào chính mình vô nghĩa)

- **Click "✨ AI nhắn [Sale X] phối hợp":**
  1. Mở modal mới `SalesHandoffModal.vue`
  2. Loading 2-3s, hiện "AI đang soạn tin nhắn..."
  3. Gọi endpoint mới `POST /api/v1/ai/sales-handoff-message` với context KH:
     ```json
     {
       "contactId": "...",
       "targetSaleUserId": "...",
       "contactSnapshot": { ...current KH info... }
     }
     ```
  4. AI return tin nhắn mẫu Việt ngắn (≤200 chars), tone thân thiện đồng nghiệp:
     > "Anh Thành ơi, em đang chăm KH **Anh Tran** (FB Ads, quen 47 ngày).
     > Em thấy bên anh đã chat tích cực với KH này 6h trước.
     > KH đang quan tâm 2PN view sông ~3 tỷ. Anh có info gì thêm để mình
     > cùng chốt KH này không ạ?"
  5. Modal hiện textarea editable + nút **[Gửi]** / **[Hủy]**
  6. Click [Gửi]: copy text vào clipboard + mở `https://zalo.me/{ownerZaloUid}` ở tab mới
     → User mở Zalo App / Zalo Web, paste tin vào chat với sale X
  7. Tự dismiss modal sau "Gửi"

- **AI prompt** (thêm vào `ai-service.ts`):
  ```
  Soạn 1 tin nhắn nội bộ NGẮN (≤200 chars) giữa 2 sale cùng chăm 1 KH.
  Tone: thân thiện đồng nghiệp, tiếng Việt, không formal, không sale pitch.
  Mục tiêu: chia sẻ info KH + đề xuất phối hợp.

  Input:
    - Sale gửi: {currentUser.fullName}
    - Sale nhận: {targetSale.fullName}
    - KH: {contact.fullName / crmName / phone}
    - Source: {contact.source} + quen N ngày
    - Status hiện tại: {contact.status / engagementPattern}
    - Sản phẩm quan tâm: {auto từ tags hoặc lastInboundPreview}
    - Last activity sale X với KH: {targetFriend.lastInboundAt → "X giờ trước"}

  Output: text thuần, không markdown wrap, không greeting dài dòng.
  ```

- **Banner xanh top:** "💡 N sale khác đang chăm KH này — phối hợp để win-win" (chỉ hiện nếu N>0)
- **Empty:** "Chỉ mình bạn đang chăm KH này"
- **Fallback:** Nếu sale X không có ZaloAccount nào trong CRM (không gửi link được) → button đổi thành "📋 Copy tin AI sinh" (chỉ copy clipboard, không mở link)

### Widget 7: Push to Getfly CRM (MỚI — placeholder)
**Height:** ~56px

```
┌─────────────────────────────────────────┐
│ [📤 Đẩy thông tin KH lên Getfly CRM]    │
│ (Chức năng phát triển sau)               │
└─────────────────────────────────────────┘
```

- **Logic v1:** Button disabled, tooltip "Sẽ phát triển sau"
- **Future v2:** Gửi snapshot Contact + Notes recent + lastInteraction lên Getfly API. Push toàn bộ context như 1 lead/contact full info.

## 5. Total Layout

| Widget | Height | Vị trí cumulative |
|---|---|---|
| 1. Liên kết Getfly | 56px | 0–56 |
| 2. Next Action | 140px | 56–196 |
| 3. Nhiệt KH | 110px | 196–306 |
| 4. Timeline | 120px | 306–426 |
| 5. Sản phẩm quan tâm | 80px | 426–506 |
| 6. Đồng đội chăm KH | ~250px (3 rows trung bình) | 506–756 |
| 7. Push Getfly | 56px | 756–812 |
| **Tổng** | **~812px** | scroll vertical |

## 6. Data flow

- Mở tab → trigger 3 API:
  1. `GET /api/v1/contacts/{id}/cockpit` — endpoint mới gộp data cho 1 lần fetch (priority + timeline + engagement + Getfly link status)
  2. `GET /api/v1/contacts/{id}/teammates` — endpoint mới list Friend records cùng contact, kèm sale owner + counts
  3. `POST /api/v1/ai/suggest` — gọi existing endpoint, cache 5min

- KHÔNG cần socket realtime cho cockpit (data refresh mỗi lần đổi conv là đủ)

## 7. File changes (estimate)

### Backend
- `backend/src/modules/contacts/cockpit-routes.ts` — MỚI, ~120 dòng
  - GET `/api/v1/contacts/:id/cockpit` — aggregate response
  - GET `/api/v1/contacts/:id/teammates` — list Friend records cùng contact parent + sale owner info (User.fullName + ZaloAccount.zaloUid để mở link)
- `backend/src/modules/ai/ai-service.ts` — THÊM function `aiGenerateSalesHandoffMessage`
  - System prompt VN ngắn (≤200 chars output) cho tin sale-to-sale
  - Reuse Gemini infrastructure có sẵn
- `backend/src/modules/ai/ai-routes.ts` — THÊM POST `/api/v1/ai/sales-handoff-message`

### Frontend
- `frontend/src/components/chat/ChatContactPanel.vue` — refactor tab Quan hệ → 🎯 CRM, ~250 dòng đổi
  - Rename `'relations'` → `'crm'` + đổi icon tab thành 🎯
  - Bỏ section "Label Zalo" + "Tag riêng nick × KH" khỏi tab này (đã có ở Hồ sơ)
  - Thêm 7 widget mới
- `frontend/src/composables/use-contact-cockpit.ts` — MỚI, fetch + cache cockpit data + teammates
- `frontend/src/components/chat/SalesHandoffModal.vue` — MỚI, ~150 dòng
  - Loading state khi AI generate
  - Textarea editable + char count
  - Button [Gửi] (copy + mở zalo.me link) + [Hủy]
  - Toast confirm sau khi mở link

## 8. Out of scope (defer)

- ❌ Getfly real integration (chỉ placeholder UI)
- ❌ Sản phẩm quan tâm aggregation logic (chỉ placeholder)
- ❌ Internal chat CRM-to-CRM (sale-to-sale messaging)
- ❌ Push to Getfly real API call

## 9. Success criteria

1. Sale mở chat → tab CRM → trong 3 giây liếc thấy: KH nóng/lạnh, AI suggestion, đồng đội đang ai chăm
2. Sale click "Gửi ngay" trên AI suggestion → text insert vào editor cột 3 ngay
3. Sale click "Nhắn sale Thành" → mở phone/Zalo nhắn liền (v1 mở zalo.me link)
4. Layout vừa 309px wide, không vỡ, scroll mượt
5. Tin nhắn đến/đi count chính xác per nick (cross-check với DB Friend table)

## 10. Anh đã chốt (2026-05-22)

| Q | Chốt |
|---|---|
| **Q1** Click "Gửi ngay" AI suggestion → action | **Insert vào editor cột 3 để sale REVIEW**, không tự gửi |
| **Q2** Click "Nhắn sale X" → workflow | **AI sinh tin nhắn kết nối với context KH** → modal review → copy clipboard + mở `zalo.me/{saleX-zaloUid}`. KHÔNG cần module internal chat. |
| **Q3** Wording "Sản phẩm quan tâm" placeholder | OK với wording em đề xuất ("agg từ KH parent — nhiều friend chăm cùng 1 KH") |
| **Q4** Tab name | **🎯 CRM** (có icon đồng nhất với 👤 Hồ sơ, 📅 Lịch hẹn, ⭐ Điểm) |

## 11. Implementation phases

- **Phase 1 (1 ngày):** Backend endpoints `/cockpit` + `/teammates` + FE composable `use-contact-cockpit.ts`
- **Phase 2 (1 ngày):** UI 7 widget (refactor ChatContactPanel.vue tab)
- **Phase 3 (0.5 ngày):** Polish + testing + deploy

**Total estimate:** 3 ngày (tăng 0.5 cho AI sales-handoff message + modal mới).

---

## Status: ✅ APPROVED — sẵn sàng implement

Anh đã chốt 4 questions ở mục 10 + bổ sung AI sales-handoff. Em bắt đầu Phase 1 backend.

**Next:** Em ship Phase 1 (endpoints `/cockpit` + `/teammates` + `/ai/sales-handoff-message`) trước, test xong mới sang FE Phase 2.
