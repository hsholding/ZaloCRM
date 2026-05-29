# Module Memory: Chat

## Main files

- Backend: `backend/src/modules/chat/*`, `backend/src/modules/chat/message-handler.ts`
- Zalo shared ops: `backend/src/shared/zalo-operations.ts`, `voice-sender.ts`, `video-processor.ts`
- Frontend view: `frontend/src/views/ChatView.vue`
- Frontend components: `frontend/src/components/chat/*`
- Composables: `use-chat.ts`, `use-chat-operations.ts`, `use-chat-contact-panel.ts`, `use-inbox-filters.ts`

## Important behavior

- Chat is realtime and tied to Zalo account/session state.
- Message ordering should use Zalo server sort key/sentAt logic; README mentions previous fix for non-chronological socket delivery.
- Message types registry/proposal live in `docs/MESSAGE-TYPES-REGISTRY.md` and `docs/MESSAGE-TYPES-PROPOSAL.md`.
- Special message rendering is concentrated around `special-message-renderer.vue` and message bubble components.

## Risks

- Backfill/socket messages can arrive out of order.
- Attachments/video/file sending depends on local path/MinIO/Zalo SDK assumptions.
- UI flicker/reorder was a known issue; avoid changing scroll/list transitions casually.
