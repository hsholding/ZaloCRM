# Design: Nhận Lead — Smart Lead Pool

> **Status:** APPROVED (anh chốt 2026-05-24)
> **Mode:** Intrapreneurship
> **Goal:** Sale rảnh → 1 click → nhận 1 lead chất lượng → force note → vòng lặp tiếp

## 1. Decisions chốt (anh "em quyết hết theo recommend")

| # | Decision | Value |
|---|---|---|
| 1 | Forgotten threshold default | **30 ngày** |
| 2 | KH status "Quan tâm" vào pool | **CÓ** (giúp re-engage trước khi cold hoàn toàn) |
| 3 | Note min length | **20 ký tự** |
| 4 | Sale "Trả lại pool" | **CÓ**, lần 2+/tuần penalty 2x cooldown |
| 5 | CustomerList vào pool | Admin tick `shareable_to_pool` per list |
| 6 | UI position | **Option A — Floating button góc phải dưới Chat view** (anh chọn khác recommend B của em) |

## 2. Schema

```prisma
model LeadRequest {
  id                  String    @id @default(uuid())
  orgId               String    @map("org_id")
  requestedByUserId   String    @map("requested_by_user_id")
  contactId           String    @map("contact_id")
  source              String    // 'forgotten' | 'customer_list' | 'external_sync'
  priorityScore       Int       @map("priority_score")
  noteContent         String?   @map("note_content")
  noteSubmittedAt     DateTime? @map("note_submitted_at")
  expiresAt           DateTime  @map("expires_at")
  autoReturnedAt      DateTime? @map("auto_returned_at")
  releaseReason       String?   @map("release_reason")
  // 'completed' | 'auto_return' | 'manual_return'
  previousAssigneeId  String?   @map("previous_assignee_id")
  // lưu owner cũ để rollback khi trả pool
  requestedAt         DateTime  @default(now()) @map("requested_at")

  org             Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user            User         @relation(fields: [requestedByUserId], references: [id])
  contact         Contact      @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([orgId, requestedByUserId, requestedAt(sort: Desc)])
  @@index([contactId, requestedAt(sort: Desc)])
  @@index([requestedByUserId, noteSubmittedAt])
  @@index([expiresAt, autoReturnedAt])
  @@map("lead_requests")
}

model LeadPoolConfig {
  id                      String  @id @default(uuid())
  orgId                   String  @unique @map("org_id")
  enabled                 Boolean @default(true)
  maxRequestsPerDay       Int     @default(10) @map("max_requests_per_day")
  cooldownMinutes         Int     @default(15) @map("cooldown_minutes")
  forgottenThresholdDays  Int     @default(30) @map("forgotten_threshold_days")
  excludedStatuses        Json    @default("[\"hot\",\"potential\",\"won\"]") @map("excluded_statuses")
  autoReturnAfterDays     Int     @default(7) @map("auto_return_after_days")
  forceNoteBeforeNext     Boolean @default(true) @map("force_note_before_next")
  enabledSources          Json    @default("[\"forgotten\",\"customer_list\"]") @map("enabled_sources")
  noteMinLength           Int     @default(20) @map("note_min_length")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@map("lead_pool_configs")
}
```

`CustomerList` bổ sung field:
```prisma
shareableToPool Boolean @default(false) @map("shareable_to_pool")
```

## 3. Priority Score Algorithm

```ts
function calculatePriorityScore(contact, lastSaleNoShow, wasHotThenLost): number {
  const daysIdle = (now - contact.lastActivity) / 86400000;
  let score = daysIdle * 2;
  if (contact.phoneNormalized) score += 5;
  if (contact.hasZalo === true) score += 10;
  if (lastSaleNoShow) score += 15;
  if (wasHotThenLost) score += 30;
  score -= contact.zaloLookupAttempts * 3;
  if (contact.consentStatus === 'revoked') return -999;
  return Math.round(score);
}
```

## 4. Backend endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/lead-pool/eligibility` | { canRequest, reason, remainingToday, pendingNoteLead?, nextAvailableAt? } |
| POST | `/api/v1/lead-pool/request` | Lock contact + tạo LeadRequest + trả full data |
| POST | `/api/v1/lead-pool/:id/note` | Submit note (≥ minLength) → unlock next request |
| POST | `/api/v1/lead-pool/:id/return` | Sale trả lại pool, rollback assignedUserId |
| GET | `/api/v1/lead-pool/config` | Load config |
| PATCH | `/api/v1/lead-pool/config` | Admin update config |
| GET | `/api/v1/lead-pool/my-history` | Lịch sử lead đã nhận của user |

Cron 2am daily: scan `lead_requests WHERE noteSubmittedAt IS NULL AND expiresAt < NOW()` → auto-return.

## 5. Backend service flow

```
POST /lead-pool/request:
1. Validate eligibility (cooldown / daily cap / unsubmitted note)
2. BEGIN TRANSACTION
3. Query candidates:
   - Pool A (forgotten):
     WHERE Contact.orgId = me
       AND Contact.lastActivity < NOW() - threshold
       AND Contact.status NOT IN excludedStatuses
       AND Contact.consentStatus != 'revoked'
       AND (Contact.assignedUserId IS NULL OR Contact.lastActivity < NOW() - threshold)
       AND NO active LeadRequest for this contact
   - Pool B (customer_list):
     WHERE CustomerListEntry.list.shareableToPool = true
       AND Entry status 'validated'
       AND NO Contact with this phone OR Contact.assignedUserId IS NULL
4. Compute priorityScore cho mỗi candidate
5. SORT DESC, take top 10
6. RANDOM 1 trong top 10
7. SELECT FOR UPDATE Contact → set assignedUserId = me
8. Create LeadRequest record (expiresAt = now + autoReturnAfterDays)
9. COMMIT
10. Return full lead payload:
    - Contact info (phone, name, demo, status)
    - Friend rows (mọi nick đã có)
    - Last 10 notes
    - Last 5 appointments
    - Last 20 messages preview
    - Previous assignee info
    - Insight: "đã 5 tin nhắn", "lỡ 1 lịch hẹn", "hỏi giá 2 lần"
    - Suggested opening messages
```

## 6. UI components

### Frontend file structure

```
frontend/src/
├─ components/lead-pool/
│  ├─ LeadFloatingButton.vue    (góc phải dưới ChatView, FAB style)
│  ├─ LeadRequestModal.vue       (modal hoành tráng full lead info)
│  ├─ ForceNoteDialog.vue        (block khi sale chưa note)
│  └─ LeadInsightPanel.vue       (sub-component: insight + gợi ý chăm)
├─ views/settings/
│  └─ LeadPoolConfigPage.vue     (admin settings)
└─ composables/
   └─ use-lead-pool.ts            (eligibility polling + state)
```

### LeadFloatingButton — Floating Action Button (FAB)

```
                                    [Chat content]
                                                    
                                                    
                                            ┌─────────────────┐
                                            │ 🎁 Nhận Lead  3 │
                                            │   ━━━━━━━ ✓     │
                                            └─────────────────┘
                                                                 ┌──┐
                                                                 │🎁│
                                                                 └──┘
                                          [FAB góc phải dưới]
```

Style: pill button gradient, badge số quota còn lại, click → mở modal.

### LeadRequestModal — Hoành tráng

(theo mockup state 2 trong design)

### Settings page

(theo mockup section 7)

## 7. Edge cases — đã handle

Xem [tab "Edge cases" trong section 8 original](#)

## 8. Files cần tạo / sửa

**Backend:**
- `prisma/schema.prisma` — thêm 2 model + field `CustomerList.shareableToPool`
- `prisma/migrations/20260524120000_lead_pool/migration.sql`
- `src/modules/lead-pool/lead-pool-service.ts` (mới)
- `src/modules/lead-pool/lead-pool-routes.ts` (mới)
- `src/modules/lead-pool/lead-pool-cron.ts` (mới, register vào app.ts)
- `src/app.ts` — register routes + cron

**Frontend:**
- `components/lead-pool/LeadFloatingButton.vue` (mới)
- `components/lead-pool/LeadRequestModal.vue` (mới)
- `components/lead-pool/ForceNoteDialog.vue` (mới)
- `views/settings/LeadPoolConfigPage.vue` (mới)
- `composables/use-lead-pool.ts` (mới)
- `views/ChatView.vue` — mount LeadFloatingButton
- `composables/use-settings-nav.ts` — thêm entry "Nhận Lead" trong CRM group
- `router/index.ts` — route `/settings/crm/lead-pool`

**Memory:**
- `~/.claude/projects/.../project_zalocrm_lead_pool.md`

## 9. Estimate

15-20h tổng. Ship 3 ngày làm việc.

## 10. Reviewer Concerns

(none — design đã được anh approve qua condensed analysis)
