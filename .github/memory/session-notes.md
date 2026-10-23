# Session Notes

Document completed development sessions here so future work can benefit from their findings. Append concise summaries; keep active, unfinished notes in `scratch/working-notes.md` instead.

## Session Summary Template

### Session: <short name>

**Date:** YYYY-MM-DD

#### What was accomplished

- <Completed work>

#### Key findings and decisions

- <Verified discovery or decision, including its reason>

#### Outcomes

- <Tests, validation, and follow-up status>

---

## Example Session

### Session: Workout set completion toggle

**Date:** 2026-10-12

#### What was accomplished

- Added the ability to mark a workout set complete or incomplete.
- Added focused coverage for both toggle directions.

#### Key findings and decisions

- The action must invert the current completion value rather than always set it to `true`.
- The component test checks the visible state after each action instead of relying on implementation details.

#### Outcomes

- The focused test passed for both transitions.
- The session left no known blocker for the completion toggle.

---

### Session: Workout Tracker TDD agent

**Date:** 2026-10-15

#### What was accomplished

- Created `.github/agents/tdd-developer.agent.md` with test-first feature development and narrowly scoped failing-test repair workflows.

#### Key findings and decisions

- Used Vue Testing Library to match the project's Vue frontend rather than the request's React example.
- Kept Playwright ownership with `test-engineer` through a manual handoff; that agent is not currently defined in the workspace.
- Kept unrelated lint fixes, console removal, and unused-variable cleanup outside failing-test repair.

#### Outcomes

- Ruby YAML parsing and configuration/workflow assertions passed; the agent file had no editor diagnostics.
- Model availability and the UI handoff were not exercised in a live agent session.

---

### Session: Workout Tracker integration and UI test agent

**Date:** 2026-10-15

#### What was accomplished

- Created `.github/agents/test-engineer.agent.md` for integration/component testing, Playwright journeys, failure classification, and concrete coverage reporting.

#### Key findings and decisions

- Used Vue Testing Library to match the project, with Jest/Supertest for backend integration and Playwright for UI journeys.
- Required reusable page objects, isolated per-test data, state-based waits, and individual/grouped/repeated/parallel isolation checks.
- The new agent name matches the existing TDD handoff target, resolving the previously missing workspace agent definition.

#### Outcomes

- Ruby YAML parsing and assertions passed for the exact tools array, preferred model, workflow requirements, and TDD handoff target; the new agent had no editor diagnostics.
- Live model availability, handoff execution, and application test execution were not exercised by this customization-only change.

---

### Session: Mobile-first product requirements clarification

**Date:** 2026-10-15

#### What was accomplished

- Completed interactive clarification of import, accounts, mobile screens, program progression, logging, timers, recommendations, assisted/bodyweight loads, barbell visualization, history, and dashboard behavior.
- Made `docs/project-overview.md` the canonical specification with 20 stable requirement IDs; aligned testing/workflow guidance, repository instructions, and both agents.
- Inspected the supplied MacroFactor CSV with a CSV parser: five cycles, repeated headers, inherited workout rows, rest rows, and per-set prescriptions. The file was not modified.

#### Key findings and decisions

- Import every cycle unchanged as training; ignore deload metadata and configure one appended manual deload before activation. Preview invalid rows and allow confirmed partial import, but block unsafe structural grouping or unresolved workouts.
- English, mobile-first, online-only, invite-only email/password accounts; admin-managed catalog; one current program/gym/active draft; per-exercise persistent unit overrides.
- Program days are not calendar weekdays. Advance after all days resolve; emergency states differ from full completion. Restart creates a fresh run with the saved deload and preserved history.
- The final emergency rule supersedes earlier all-or-nothing proposals: retain exercises with at least one checked working set and checked sets only. A wholly skipped workout has a status event, not performance metrics.
- Original completed-set metrics are frozen. Finished-session weight/reps corrections are visibly separate and affect future suggestions only; active rows may still be unchecked, edited, and rechecked.
- Approved RIR-adjusted estimation, exact range preference, feasible gym loads, a 10% upward cap, low-confidence high-rep labeling, bodyweight-factor/assistance modeling, and finite-inventory balanced plate visualization.
- Catalog content/images, validated bodyweight factors/machine ratios, and actual gym inventories remain required delivery inputs; do not invent them.

#### Outcomes

- Requirement-ID/coverage checks, local-link checks, agent YAML/tool/model checks, CSV cycle verification, and `git diff --check` passed. Updated product, test, workflow, and agent files had no editor diagnostics.
- No application tests or browser flows were executed: the repository still has no application packages or test infrastructure. This session updated requirements and guidance only.

---

### Session: Implementation backlog and final planning decisions

**Date:** 2026-10-16

#### What was accomplished

- Recorded the latest approved planning decisions in the canonical specification and testing guidance.
- Created `docs/implementation-backlog.md` with 32 not-started task cards, completion dependencies, owners, acceptance criteria, verification steps, milestones, and mappings for all 20 requirement IDs.
- Linked the backlog from the specification, testing guide, and workflow guide. No GitHub issues, application scaffolding, or cloud resources were created.

#### Key findings and decisions

- Each imported/manual-deload week has exactly seven slots; the number of training weeks remains whatever the CSV supplies.
- Individual exercise skipping is allowed while continuing the session, but saving uses partial/emergency finalization with the established checked-working-set retention rule.
- The 10% upward recommendation cap compares effective resistance against the latest checked same-exercise working set, or latest retained historical reference with applicable corrections; selected assistance is not the capped quantity.
- Provision the first admin during secure setup; admins privately share expiring single-use invitation links without requiring automated email delivery.
- Delivery targets current mobile Safari/Chrome and desktop Chrome/Safari; include CI, migrations, deployment smoke checks, backup/restore verification, content ownership/rights, and gym readiness. Neutral development images are permitted; unknown factors/ratios never enable guessed recommendations.
- WT-001 is ready to start. Collect content/gym inputs early; live staging and launch remain gated by access, cost approval, actual data, and verification evidence.

#### Outcomes

- Structured checks passed for recorded decisions, 32 unique complete task cards, ordered acyclic dependencies, all 20 requirement mappings, and specification/backlog links.
- All tasks remain not started. Documentation validation is not application test execution or production-readiness evidence.

---

### Session: WT-001 monorepo and local baseline

**Date:** 2026-10-16

#### What was accomplished

- Created npm workspaces for the Vue frontend and Express backend, a shared lockfile, Node version constraints, lint/format configuration, ignore rules, safe local environment example, and setup documentation.
- Initialized Vue with Pinia, Vue Router, and PrimeVue; added a minimal responsive baseline route and an Express `/health` endpoint.
- Marked WT-001 complete with observed verification evidence; WT-002 through WT-032 remain not started.

#### Key findings and decisions

- Node 24.11.0/npm 11.6.1 were available locally. Node 24 is selected in `.nvmrc`; the declared supported range is Node 22.12+ below 25.
- npm workspaces provide one install/lockfile and independent frontend/backend scripts without adding product or persistence scope.
- ESLint 10.13.0 is supported by the selected Vue ESLint plugin; formatting checks only scaffold-owned source/config/readme files to avoid reformatting existing project memory.
- The backend uses Node's native optional env-file loader for the safe root `.env` settings; credentials and production values are not included.

#### Outcomes

- `npm ci`, `npm run lint`, `npm run format:check`, and `npm run build` passed; npm reported zero vulnerabilities.
- Live smoke checks passed for backend health, frontend document and transformed Vue modules, a port override, and headless Chrome rendering with no console/resource errors.
- No product features or automated test infrastructure were added. The local combined dev server was left running at `http://127.0.0.1:5173/` with backend health at `http://127.0.0.1:3000/health`.

### Session: WT-002 isolated automated test infrastructure

**Date:** 2026-10-16

#### What was accomplished

- Configured Jest Node/jsdom projects with Supertest and Vue Testing Library, isolated user/workout factories, per-test cleanup hooks, and a guarded dedicated test-database cleanup entry point.
- Configured Playwright to start fresh backend/frontend processes, use Chromium, and retain failure traces, screenshots, videos, and an HTML report. Documented test commands, database safety, and browser setup; updated the WT-002 backlog evidence.

#### Key findings and decisions

- Vue's official `@vue/vue3-jest` release supports Jest 29 only, so the harness stays on the compatible Jest 29 / Vue Jest 29 combination. This leaves dev-only audit advisories; production dependencies audited clean.
- PostgreSQL persistence does not exist until WT-003. Current tests verify that destructive cleanup is gated to `workout_tracker_test`; they do not connect to or create a database.
- Playwright specs, execution, browser isolation, and failure-artifact capture remain owned by `test-engineer`; a baseline smoke was added and executed for the WT-001/WT-002 compliance audit.

#### Outcomes

- Backend, frontend, and browser harnesses each caught a deliberate assertion failure and passed after the expected assertion was restored. The browser smoke passed three repeats with two workers and retries disabled, and retained screenshot/video/trace artifacts.
- The cleanup guard initially allowed equivalent PostgreSQL URLs and then same database names on alternate hosts; regression tests reproduced both gaps. The guard now rejects any `DATABASE_URL` using the reserved test database name.
- `npm test -- --maxWorkers=2` passed 5 suites / 9 tests; lint, formatting, frontend build, `npm ci --dry-run`, and `git diff --check` passed. `npm audit --omit=dev` reported no production dependency vulnerabilities. A full `npm ci` was not rerun because a pre-existing frontend process was using the current `node_modules`.

### Session: WT-003 persistence and schema boundaries

**Date:** 2026-10-16

#### What was accomplished

- Added the PostgreSQL runtime pool, transaction/advisory-locked migration runner and ledger, safe repeatable seed command, and first incremental SQL schema.
- Added fresh PGlite-backed schema tests for migration/seed reruns, cross-user equipment ownership, program run slot identity, session/run-day consistency, immutable finished sets, and corrections stored separately from original values.
- Documented local database commands and WT-003 verification evidence in the README/backlog.

#### Key findings and decisions

- No local PostgreSQL server, client, or Docker runtime was present. PGlite runs the PostgreSQL engine in-process for isolated schema behavior checks; connecting to a separate PostgreSQL service remains unverified.
- All physical loads use explicitly named `_kg` columns. Corrections do not update original set columns; database triggers prevent finished set mutation.
- The seed CLI accepts only `workout_tracker_dev` or `workout_tracker_test`, and rejects a test database name also used by `DATABASE_URL`.

#### Outcomes

- The persistence suite passed 4 suites / 16 tests after integrity tests first demonstrated invalid writes accepted by the initial schema, then passed after the FK/trigger repair. The existing `.vscode/settings.json` edit was preserved.

### Session: WT-004 CI and configuration checks

**Date:** 2026-10-19

#### What was accomplished

- Added GitHub Actions jobs for lint, formatting, Jest backend/frontend tests, frontend build, and isolated Chromium browser smoke.
- Documented that CI uses no repository secrets or local env files, does not connect to the WT-003 PostgreSQL database, and retains failure-only Playwright diagnostics for seven days.
- Recorded CI setup and pending hosted-run status in the implementation backlog.

#### Key findings and decisions

- The browser smoke starts dedicated backend/frontend processes and exercises only `/health` and the static Home view; it needs no database connection or personal workout data.
- Jest schema tests use isolated PGlite databases, so local validation does not depend on the already-configured WT-003 database.

#### Outcomes

- Workflow YAML/config assertions, invalid/default Playwright port checks, lint, formatting, all 9 Jest suites / 25 tests, frontend build, editor diagnostics, and `git diff --check` passed.
- Playwright execution and the first hosted GitHub Actions run remain pending; local checks are not recorded as CI evidence.

### Session: WT-005 authentication and authorization

**Date:** 2026-10-19

#### What was accomplished

- Added an incremental authentication migration, secure password hashing, database-backed login sessions, logout/revocation, authenticated current-profile API, and reusable role/ownership middleware.
- Added exact-origin credentialed CORS, mandatory Origin validation for unsafe API requests, input validation, safe errors, and login rate limiting.
- Documented local auth configuration and the production same-site custom-domain or same-origin-proxy requirement; updated WT-005 verification evidence.

#### Key findings and decisions

- Passwords use Node `scrypt`; session cookies contain random opaque tokens while PostgreSQL stores only SHA-256 hashes. Sessions expire after 12 hours and logout revokes them server-side.
- Production uses host-only `Secure; HttpOnly; SameSite=Lax` cookies. The planned default GitHub Pages and Render hostnames are cross-site and may fail under Safari third-party-cookie restrictions, so production requires same-site custom subdomains or a same-origin proxy.
- The login limiter uses `express-rate-limit`'s process-local store. Keep one backend instance until a shared limiter store is adopted for horizontal scaling.
- Invite-only registration/admin bootstrap remain WT-006; authentication UI remains WT-007. No reset or verification flow was introduced.

#### Outcomes

- The new API suite passed 13 tests; the full Jest suite passed 10 suites / 39 tests. Lint, formatting, frontend build, editor diagnostics, and `git diff --check` passed.
- PGlite exercised the new migration and API persistence behavior; a separate PostgreSQL service and Playwright auth journey were not run.

### Session: WT-006 admin bootstrap and invitation onboarding

**Date:** 2026-10-19

#### What was accomplished

- Added an incremental invitation migration, a guarded CLI workflow for the first admin, admin-only invitation creation, and invitation-required member registration with profile creation.
- Stored only SHA-256 invitation token hashes; redemption locks the invitation row and commits account/profile creation and token consumption atomically.
- Added signup/invitation rate limits, configurable invitation expiry, account validation, duplicate-email rollback, README setup guidance, and API/database tests.

#### Key findings and decisions

- First-admin creation is operator-only through `auth:bootstrap-admin`; a PostgreSQL advisory transaction lock ensures concurrent bootstrap attempts cannot create multiple admins.
- Invitation links use 32 random bytes, expire after seven days by default (configurable from 1 to 720 hours), and are single-use. Registration passwords require 12-256 characters.
- PGlite API tests verified concurrent redemption/bootstrap and migration 003; the external PostgreSQL connection and invitation browser journey remain unverified.

#### Outcomes

- The focused auth/onboarding suite passed 24 tests; backend passed 9 suites / 49 tests; full Jest passed 10 suites / 50 tests.
- Lint, formatting, frontend build, editor diagnostics, `git diff --check`, and a no-database bootstrap CLI guard smoke passed. The test-engineer browser journey remains pending WT-007 UI routes.

### Session: WT-009 profile and gym settings

**Date:** 2026-10-20

#### What was accomplished

- Added authenticated settings read/write endpoints for account profile fields, five configurable rest categories, and one editable user-owned gym.
- Added validation and transactional replacement for gym equipment/dumbbell availability, bar weights, and plate inventory; routed the mobile-first Settings form to `/settings`.
- Added API, component, and router regression coverage, and recorded WT-009 implementation evidence in the backlog.

#### Key findings and decisions

- The existing schema already covered WT-009, including canonical kg columns and a database uniqueness constraint for one gym per user, so no migration was needed.
- Settings writes use the authenticated user ID only and do not rewrite existing session snapshots. Profile email changes are conflict-checked by the unique email index.
- Physical gym loads are entered in kg to match canonical persistence; account units remain a separate kg/lb default.

#### Outcomes

- API tests first observed `/api/settings` returning 404; implementation made all three API scenarios pass. Component and route tests also passed after their expected missing-view/placeholder RED.
- `npm test -- --runInBand` passed 16 suites / 69 tests. Lint, formatting, frontend production build, editor diagnostics, and `git diff --check` passed.
- Tests used isolated PGlite. A separate PostgreSQL service and Playwright/mobile/desktop browser checks were not run; the local app servers were already running and left untouched.

### Session: WT-008 catalog snapshot persistence regression

**Date:** 2026-10-22

#### What was accomplished

- Extended the catalog API integration test with linked program-day and session exercise snapshots.
- Verified that editing catalog metadata changes the shared catalog record without changing existing program prescription, session exercise, session name, or session prescription snapshots.
- Updated WT-008 backlog evidence; user-reported browser checks remain recorded separately, and coefficients/assets remain later content inputs.

#### Key findings and decisions

- The current catalog update path already changes the shared exercise row and muscle associations without writing to program/session snapshot rows. No implementation change was required; the test guards this behavior against regressions.
- JSONB snapshots are compared as parsed values in the isolated PGlite integration test.

#### Outcomes

- `npm run test:backend -- --runInBand packages/backend/test/catalog.test.js` passed 4 tests.
- `npm run test:backend -- --runInBand` passed 11 suites / 56 tests. Editor diagnostics were clean; external PostgreSQL was not used.

### Session: WT-010 canonical loads and snapshots

**Date:** 2026-10-22

#### What was accomplished

- Added kg/lb conversion and display rounding, validated load-interpretation and immutable exercise-snapshot helpers, and authenticated per-exercise unit preference endpoints.
- Recorded WT-010 implementation and automated verification in the backlog.

#### Key findings and decisions

- Existing database columns already use canonical kg and `exercise_preferences` already supports per-user unit overrides, so this task required no schema migration.
- Overrides are stored separately from profile defaults; clearing an override returns the current default. Snapshot helpers copy and deeply freeze inputs while preserving missing factors/ratios as `null`.
- Canonical three-decimal checks need a scale-aware floating-point tolerance: valid `1.005 kg` otherwise fails due to binary representation.

#### Outcomes

- The initial missing-module RED and the later `1.005 kg` boundary RED both reproduced the missing behavior; focused WT-010 tests passed 4 tests after implementation.
- Full Jest passed 17 suites / 74 tests. Lint, format check, frontend build, editor diagnostics, and `git diff --check` passed.
- Persistence tests used isolated PGlite. External PostgreSQL and browser validation were not run; tracker UI integration remains WT-017.

### Session: WT-012 CSV import preview and draft creation

**Date:** 2026-10-22

#### What was accomplished

- Added authenticated CSV preview and transactional partial-import endpoints, an idempotency ledger migration, and user-scoped saved-program listing.
- Added the mobile-first Programs import view with source file/paste input, week/day/set preview, exact and unresolved mappings, invalid-row skips, source-marker acknowledgement, and explicit create confirmation.
- Updated the WT-012 backlog with test and browser evidence.

#### Key findings and decisions

- Imports always create new draft templates. They do not update prior templates, delete history, or discard active workout drafts; activation and replacement remain later program-run behavior.
- The preview is revalidated by the server at confirmation. Empty workouts after skipped rows are blocked, and all template descendants plus the idempotency ledger commit in one transaction.
- Same-key retries return the same draft; reusing a key for different data conflicts. The temporary browser walkthrough used a disposable in-memory PGlite account and catalog fixture.

#### Outcomes

- `packages/backend/test/programs.test.js` passed 7 tests; `packages/frontend/src/views/ProgramsView.test.js` passed 2 tests. Full Jest passed 20 suites / 92 tests.
- Lint, format check, production build, editor diagnostics, and `git diff --check` passed. Integrated Chromium browser validation at 375x844 CSS pixels exercised draft creation and six-to-seven-slot error recovery with no horizontal overflow.
- External PostgreSQL and physical mobile devices were not tested. The development browser services use ephemeral data.

### Session: WT-013 future-program editing and manual deload

**Date:** 2026-10-22

#### What was accomplished

- Added program detail, future-day prescription editing, manual seven-slot deload setup, and explicit activation into existing program-run tables.
- Added readiness validation for appended deload ordering, seven slots per week, mapped exercises, nonempty workout days/sets, and at least one workout per week.
- Added Programs view controls for day/exercise/set editing, catalog-backed deload prescriptions, and confirmation-gated activation.
- Prefilled the manual deload from the latest training week’s slots and exercises while intentionally omitting sets, so users only need to enter deload prescriptions.
- Recorded WT-013 API/component evidence in the implementation backlog.

#### Key findings and decisions

- Existing template, run, and run-day schema supported this lifecycle slice without a migration. Activation writes run-day identities separately while retaining reusable template days.
- Future template edits replace only the selected template day’s exercise/set rows in a transaction. Resolved run days and days with nondiscarded sessions are locked; finished/in-progress session prescription snapshots remain separate.
- One appended deload is required before activation; training week count remains variable. Both six- and eight-slot deload payloads are rejected.

#### Outcomes

- Backend WT-013 tests passed 10 scenarios; Programs component tests passed 3, including the full edit/deload/confirmation/activation path. Full Jest passed 20 suites / 96 tests.
- `npm run lint`, `npm run format:check`, direct stylesheet formatting check, production build, and editor diagnostics passed.
- Browser walkthrough, external PostgreSQL, and physical-device checks were not run; browser acceptance remains pending.

### Session: WT-014 program runs and flexible progression

**Date:** 2026-10-23

#### What was accomplished

- Added authenticated current-run retrieval, current-week rest check/undo, a workout-outcome resolution primitive for WT-023, and transactional stop, restart, and explicit replacement operations.
- Kept current week derived from the earliest pending run-day; final deload resolution completes the run, while restart creates fresh run-day instances for every saved week.
- Synchronized pending active-run day types when future template slots are edited; unresolved slots remain editable after restart while prior run-day types stay unchanged.
- Recorded WT-014 API evidence and remaining integration boundaries in the implementation backlog.

#### Key findings and decisions

- The existing run/run-day schema and partial unique active-run index supported WT-014 without a migration.
- Locking the run row serializes day transitions; only pending slots in the earliest unresolved week can resolve. Rest undo is limited to rest slots in that current week.
- Stopped/completed runs retain their run-day rows. Resolved/session-backed template days remain protected, while unresolved future days can still be edited after restart; only pending slots on the current active run synchronize their day type.
- Restart reuses the saved template, including its configured appended deload, but creates a new run identity.
- Workout resolution remains an internal transaction-aware helper until WT-023 owns real session finalization. Run replacement and stop reject active workout drafts instead of silently discarding them.

#### Outcomes

- The first current-run API regression returned 404 as expected; later tests reproduced stale active-run slot types after template edits and a restart edit lock that blocked future program changes. Both edge cases were corrected and covered.
- `packages/backend/test/programs.test.js` passed 23 tests, including each of the seven possible final slots. Full backend passed 14 suites / 91 tests; lint, format check, and `git diff --check` passed.
- Tests used isolated PGlite. External PostgreSQL and browser/UI verification were not run; those remain outside the WT-014 backend acceptance completed here.

### Session: WT-015 Home, workout detail, and exercise Info

**Date:** 2026-10-23

#### What was accomplished

- Replaced the Home placeholder with week/month calendar controls, retryable current-program loading, and a collapsible seven-slot ribbon with distinct run/rest states and workout-slot navigation.
- Added workout detail showing aggregate target muscles, catalog-linked role pills, all prescribed set types/ranges/RIR, and Start/Resume navigation; added exercise Info with its image and Primary/Secondary/Tertiary muscle roles.
- Added focused component/router coverage and mocked-API Playwright tests for Home, workout detail, exercise Info, long labels, error/empty states, and mobile/desktop overflow.
- Updated WT-015 implementation and verification evidence in the backlog.

#### Key findings and decisions

- Existing user-scoped current-run, program-detail, and catalog endpoints provided the required data; no backend or schema change was needed.
- Start/Resume routes to the tracker but does not create or resume a session draft; that integration belongs to WT-016/017. Actual-date calendar history links remain WT-025.
- Vite exposed a duplicate stale `<template>` in Home that Jest did not catch. Removing it unblocked the browser build; Vue template markup was then shaped to satisfy both Prettier and the configured ESLint rules without suppressions.

#### Outcomes

- Frontend Jest passed 6 suites / 26 tests; WT-015 Playwright passed 3 mocked-API tests, including 390px and 1440px viewport overflow checks.
- `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed. Physical-device checks and history/draft integration remain pending their later tasks.
