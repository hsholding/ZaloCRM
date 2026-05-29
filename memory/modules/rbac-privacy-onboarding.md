# Module Memory: RBAC, Privacy, Onboarding

## RBAC

Backend:

- `backend/src/modules/rbac/*`
- Schema models: `Department`, `DepartmentMember`, `PermissionGroup`

Frontend:

- `frontend/src/views/rbac/DepartmentsView.vue`
- `frontend/src/views/rbac/PermissionGroupsView.vue`
- `frontend/src/views/rbac/UsersRbacView.vue`
- `frontend/src/stores/rbac.ts`

Test scripts in `scripts/test-rbac-*.mjs`.

## Privacy

Backend:

- `backend/src/modules/privacy/*`
- Schema: `UserPrivacySession`

Frontend:

- `frontend/src/views/privacy/PrivacySettingsView.vue`
- `frontend/src/components/privacy/*`
- `frontend/src/stores/privacy.ts`
- `frontend/src/composables/use-privacy-visibility.ts`

Test scripts: `scripts/test-privacy-*.mjs`.

## Onboarding

Docs:

- `docs/DESIGN-ONBOARDING-V1.md`
- `docs/designs/dashboard-onboarding-redesign-20260524.html`

Backend:

- `backend/src/modules/auth/onboarding-service.ts`
- auth/org/user routes

Frontend:

- `frontend/src/views/SetupView.vue`
- `frontend/src/views/DashboardView.vue`

Decision from schema comment: sale VN uses phone primarily; email optional.
