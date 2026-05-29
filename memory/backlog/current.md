# Current Backlog Memory

Source: `TODO.local.md`, docs, plans as of 2026-05-25.

## P0/P1 around Phase 6

P0 polish from TODO:

- Score badge in chat contact panel, opens ScoreBreakdown modal.
- Score column in Friends/Contacts sortable.
- Auto-tag chips in existing TagBar/TagCrmBar.
- Rename "Hoat dong" tab to "Lich hen" where still pending.
- Fix CrmTag P2002 unique violation around Zalo labels sync.
- Seed scoring defaults automatically on first org login.

P1:

- Wire "Gui mau" directly to chat send API.
- Org promo settings for NBA template vars.
- Backfill scores from 3 months ActivityLog.
- Backend snooze for Stuck dashboard.
- Score trend sparkline.
- Realtime `friend:score-updated`.
- Per-sale Stuck dashboard filter.
- Manager vs Sale view distinction.

## Friend sync plan

Planned/important:

- Canonical friend serializer.
- 15-minute sequential sync.
- Immediate refresh with cooldown.
- Socket patch update in Contacts/Friends.
- All-nicks mode in Friends.
- Defer per-field syncedAt/adaptive cron until monitoring exists.

## Phase 7 automation

Already has guide/report. Remaining risk:

- Real test for file/image/video sending through Zalo, especially HTTP URL vs local file path.
- Keep action engine idempotent and test gates/throttle/window rules.

## Design docs waiting/large context

- `docs/DESIGN-INTERNAL-CONTACT-2METHOD.md`: internal contact/system notification two-method design, with open questions in source doc.
- `docs/MESSAGE-TYPES-PROPOSAL.md`: message rendering proposal with sign-off section.
- `docs/designs/CHAT-COL4-CRM-TAB.md`: chat col 4 CRM tab design and future integrations.
