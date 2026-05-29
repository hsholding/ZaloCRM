# System Map

## Backend

Entry chinh: `backend/src/app.ts`.

Modules chinh trong `backend/src/modules`:

- `auth`: login, org, user/team, onboarding.
- `zalo`: account, access, pool/socket/listener, friend sync, labels, profile, groups, presence.
- `contacts`: contact CRUD, aggregate, notes, appointments, CRM tags, duplicate/merge, cockpit.
- `chat`: routes, message handler, attachments, folders, reactions, operations.
- `automation`: blocks, lists, triggers, sequences, broadcasts, engine/action handlers/webhooks.
- `scoring`: Phase 6 lead scoring, signals, stage promotion, stuck detection, auto-tag, cron.
- `engagement`: engagement services/backfill/priority.
- `analytics`, `dashboard`, `reports`: dashboards, exports, analytics reports.
- `rbac`: departments, permission groups, middleware, assignments.
- `privacy`: PIN/session/redaction.
- `system-notifications`: internal Zalo notification setup and delivery.
- `integrations`, `api`, `ai`, `notifications`, `branding`, `activity`, `search`, `campaign`.

## Frontend

Entry: `frontend/src/main.ts`; routes: `frontend/src/router/index.ts`.

Views chinh:

- Core: `DashboardView`, `ChatView`, `ContactsView`, `FriendsView`, `GroupsView`, `ZaloAccountsView`.
- CRM: `ContactProfileView`, `CustomerActivityLogView`, `AppointmentsView`, `ReportsView`, `AnalyticsView`.
- Automation: `AutomationView` plus `views/automation/*`.
- Settings: `SettingsView`, `settings/*`, `rbac/*`, `privacy/*`.
- Phase 6: `StuckLeadsView`, `ScoringSettingsView`.
- Mobile: `MobileChatView`, `MobileContactView`, `MobileLayout`.

Composables in `frontend/src/composables` mirror backend domains: `use-chat`, `use-contacts`, `use-friends`, `use-zalo-accounts`, `use-scoring`, `use-appointments`, `use-privacy-*`, etc.

## Database

Schema: `backend/prisma/schema.prisma`.

Models can doc truoc khi code:

- Org/user: `Organization`, `User`, `Team`, `Department`, `PermissionGroup`.
- Zalo: `ZaloAccount`, `ZaloAccountAccess`, `ZaloAccountStatusLog`.
- CRM core: `Contact`, `Friend`, `FriendshipAttempt`.
- Chat: `Conversation`, `Message`, `MessageReaction`.
- CRM support: `ActivityLog`, `Note`, `NoteReaction`, `Appointment`, `MessageTemplate`.
- Phase 6/7: `ScoringConfig`, scoring/stage/stuck/automation models, engagement daily models.
- Privacy/notify: `UserPrivacySession`, `SystemNotifyRecipient`.

## Realtime

Socket.IO duoc dung de dong bo chat, friend/contact patch, Zalo account presence/status, scoring/notification style events. Khi sua aggregate hoac Zalo sync can tim event emit lien quan de UI tu update, tranh chi cap nhat DB.
