# Active Session Notes

Use this file for the current, unfinished task. It is ignored by Git and is not committed. At the end of the session, distill durable findings into `../session-notes.md` and reusable patterns into `../patterns-discovered.md`.

- WT-013: future-program editing, manual deload setup, and activation prerequisites.
- WT-015: Home calendar/current-program ribbon, workout detail, and exercise Info.

## Current Task

- Implementation, automated verification, and mocked browser checks complete. Physical-device validation remains pending.

## Approach

- Reused authenticated current-run, program-detail, and catalog APIs; no backend/schema change was required.
- Added accessible week/month calendar controls, distinct seven-slot run states, workout detail prescriptions and role-tagged muscle pills, and exercise Info metadata.
- Vite exposed a duplicate leftover Home template after component tests passed; removed it and confirmed the browser suite/build caught the issue.
- Verification: frontend Jest 6 suites / 26 tests, WT-015 Playwright 3 tests, lint, format check, production build, and `git diff --check` passed. Browser tests used mocked API data; physical-device checks remain pending.

## WT-012 Context

- WT-009: profile and gym settings.
- Added Supertest/PGlite regressions before the import routes; the first run returned 404 for preview/create. Added a mobile Programs view and component tests after the API was green.

## Previous Task: WT-006

## Key Findings

## Approach

- Existing schema supports user-owned templates, weeks, slots, exercises, and prescriptions. Added one migration for the idempotency ledger; no session/run lifecycle was pulled forward from later tasks.
- Import confirmation reparses and validates the source, checks explicit row skips and marker acknowledgements, verifies mappings against current catalog IDs, and rejects empty workouts after skips.
- Template descendants and idempotency record are written atomically. No previous template or active session is changed.
- The supplied MacroFactor file previews as five complete seven-slot training weeks with no row, structural, or week errors.
- Integrated browser used disposable PGlite data at 375x844 CSS pixels; valid import and corrected six-to-seven-slot recovery succeeded without horizontal overflow.
- Added Supertest/PGlite tests before implementation. Invitation routes initially returned 404; the focused onboarding suite now passes. Bootstrap tests initially failed because the CLI helper did not exist, then passed after adding the guarded operation.

## Decisions Made

- Invitation links use 32 random bytes; the database stores only SHA-256 token hashes. Redemption locks the invitation row and atomically creates the member/profile and consumes the link.
- Imports create a new draft only. Existing templates, history, and active workout drafts remain untouched; activation/replacement is deferred to WT-014.
- Persist `Idempotency-Key` with the template transaction; same-key/same-payload retries replay the created draft, while different payloads receive 409.
- PGlite tests exercise migration 003 and parallel redemption/bootstrap; an external PostgreSQL service and browser invitation journey remain unverified.

## Blockers

- Bootstrap credentials are provided by operator environment variables, not command-line arguments or a public endpoint. Registration links are generic bearer links, privately shared by admins without email delivery.
- None for WT-012 acceptance. External PostgreSQL and physical mobile-device checks remain unrun.
- Unsafe API methods require an exact allowlisted Origin; credentialed CORS never uses a wildcard. No password reset or email verification was added.

## Next Steps

- WT-016/017 online drafts, tracking, and Start/Resume integration; WT-025 later adds actual-date history links.
- WT-004 still awaits its first hosted CI run.

## Notes

- API RED was `/api/settings` returning 404; three backend integration cases then passed. Component and router RED confirmed the missing editor/placeholder route; focused component (2 tests) and router (4 tests) passed after implementation.
- `npm test -- --runInBand`: 16 suites / 69 tests passed. Lint, format check, production build, editor diagnostics, and `git diff --check` passed. PGlite was used; external PostgreSQL and Playwright were not run.
- Local frontend/backend already responded on ports 5173/3000 and were left untouched. `.vscode/settings.json` was already modified and was not changed for WT-009.
