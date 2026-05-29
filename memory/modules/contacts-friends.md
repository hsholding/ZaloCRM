# Module Memory: Contacts/Friends

## Main files

- Backend contacts: `backend/src/modules/contacts/*`
- Backend Zalo friend: `backend/src/modules/zalo/friend-routes.ts`, `friend-sync-service.ts`, `friend-sync-cron.ts`, `friend-event-handler.ts`
- Serializer/test: `backend/src/modules/zalo/friend-serializer.ts`, `backend/tests/friend-*.test.ts`
- Frontend views: `frontend/src/views/ContactsView.vue`, `FriendsView.vue`, `ContactProfileView.vue`
- Composables: `use-contacts.ts`, `use-friends.ts`, `use-friend-socket.ts`, `use-contact-profile.ts`

## Invariants

- Contacts page is manager/KH-cha view.
- Friends page is nick/Friend-row view.
- Contact aggregate must not erase per-nick truth on Friend.
- Any field shown in both Contacts and Friends should come from canonical serializer or a shared aggregate contract.
- Friend sync should be idempotent and emit only meaningful patches.

## Known risk

- Drift between Contacts/Friends when adding fields.
- UID/global identity confusion.
- Socket patch partial shape not matching frontend local state.
- P2002/unique conflict around CRM/Zalo tags mentioned in TODO.local.md.
