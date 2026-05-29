# Module Memory: Scoring And Automation

## Phase 6 Lead Scoring

Main backend files: `backend/src/modules/scoring/*`.

Main frontend files:

- `frontend/src/views/StuckLeadsView.vue`
- `frontend/src/views/ScoringSettingsView.vue`
- `frontend/src/composables/use-scoring.ts`
- scoring components under `frontend/src/components/scoring/`

Decisions:

- Friend-level score primary, Contact aggregate for manager/list.
- Dimensions: Engagement, Intent, Fit, Velocity.
- Default weights: 35/30/15/20.
- Stuck Detection is high-value P0/P1 surface.

## Phase 7 Automation

Main backend files:

- `backend/src/modules/automation/blocks`
- `backend/src/modules/automation/lists`
- `backend/src/modules/automation/triggers`
- `backend/src/modules/automation/sequences`
- `backend/src/modules/automation/broadcasts`
- `backend/src/modules/automation/engine`

Main frontend files:

- `frontend/src/views/automation/*`
- `frontend/src/components/automation/phase7/*`
- `frontend/src/api/automation/*`

Docs/tests:

- `docs/PHASE-7-TEST-GUIDE.md`
- `docs/PHASE-7-TEST-REPORT-20260521.md`
- `backend/tests/trigger-types.test.ts`
- `backend/tests/sequence-types.test.ts`
- `backend/tests/engine-gates.test.ts`

Known caveat from report: file URL sending needs real Zalo test because `zaloOps.sendFile` expects local filesystem path.
