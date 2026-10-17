# Implementation Backlog

## Purpose and Status

Created 2026-10-16 from the [canonical specification](project-overview.md). This is the repository's implementation task backlog, not a claim that the application exists. Task implementation and verification status is recorded below; evidence applies only to the checks listed. GitHub issues have not been created; these stable task IDs can be used when issues are created later.

**Status: WT-001 through WT-003 complete; WT-004 through WT-032 not started.** The ordered cards form a completion-dependency graph; independent work may proceed once prerequisites are met. Collect content for WT-029 early, even though its final readiness check depends on implemented settings.

Scope includes all approved first-release features. Deferred functionality remains deferred: offline/PWA guarantees, password reset/verification, multiple current programs, guaranteed background alerts, and in-session exercise substitution/structural edits.

## Execution Contract

- Each implementation task uses Red-Green-Refactor: write/run the narrow behavior test first, explain the intended RED, implement minimally, rerun to GREEN, and consider a scoped refactor. Infrastructure tasks use configuration/smoke checks first where behavior tests cannot yet execute.
- `tdd-developer` owns application code and unit/integration tests. `test-engineer` owns every Playwright authoring/execution/isolation check, including incremental UI checks within earlier tasks. Assigning an owner here does not execute or delegate work automatically.
- Before implementing a card, record exact files, commands, numeric fixtures, and any technical choice required by that slice. Use actual installed scripts, not speculative endpoints or commands. Split a card further if it cannot be completed in a small testable change.
- Acceptance criteria below supplement, not replace, the linked requirements and [testing matrix](testing-guidelines.md). Preserve all original/retained performance, authorization, snapshot, unit, and emergency-finish invariants.
- A task is done only when its acceptance criteria pass, relevant regression/lint checks pass, and observed results are recorded. Track unrelated failures separately; never claim blocked/unrun tests passed. Keep lint cleanup separate from failing-test repair.
- Completed cards should gain actual test file/scenario links and commands/results. Every required journey needs traceable evidence, not only a checked task or a code-coverage number.
- Live cloud resources, paid plans, credentials, and invitation tokens require secure setup outside chat. Do not commit secrets, create production data, or provision paid services implicitly.

## Milestones

| Milestone                 | Tasks                 | Exit condition                                                                                     |
| ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| Foundations and identity  | WT-001 through WT-007 | Reproducible local setup, isolated tests, CI, secure invited accounts, mobile shell                |
| Setup and programs        | WT-008 through WT-015 | Catalog/settings, safe CSV preview/import, manual deload, program runs, Home/Detail/Info           |
| Tracking and calculations | WT-016 through WT-023 | Recoverable tracking, timers, recommendations, plates, immutable metrics, finalization             |
| History and delivery      | WT-024 through WT-030 | Future-only corrections, history/dashboard, hardening, staging, content and recovery readiness     |
| Release verification      | WT-031 through WT-032 | Critical automated journeys, isolation evidence, focused real-device validation, release checklist |

## Foundations and Identity

### WT-001: Establish the monorepo and local development baseline

**Requirements:** ACC-01, UI-05; planned architecture and delivery acceptance.
**Depends on:** None.
**Owner:** tdd-developer.
**Acceptance:** Create the Vue/Pinia/Router/PrimeVue frontend and Express backend workspaces, shared package management/lockfile, supported Node version, lint/format configuration, and ignore rules. Document actual setup/start commands and safe environment-variable examples. Decide necessary tooling conservatively and record it; no feature implementation or secrets in scaffolding.
**Verification:** Clean dependency installation, frontend build, backend health/start smoke check, and lint/configuration checks. Load a minimal frontend without errors; this is not feature acceptance.
**WT-001 evidence (2026-10-16):** `npm ci` completed from the shared lockfile with zero reported vulnerabilities. `npm run lint`, `npm run format:check`, and `npm run build` passed. `npm run dev` started both workspaces; `/health` returned `{"status":"ok"}`. Headless Chrome rendered the Vue baseline without console/resource errors. `PORT=3101 npm run start:backend` honored the environment override and returned healthy on that port. No feature tests apply to this infrastructure-only card.

### WT-002: Establish isolated automated test infrastructure

**Requirements:** ACC-01, SES-01, UI-03; testing guidelines.
**Depends on:** WT-001.
**Owner:** tdd-developer; test-engineer for Playwright infrastructure.
**Acceptance:** Configure Jest/Supertest, Vue Testing Library with required plugins, and Playwright with frontend/backend lifecycle management. Provide isolated test-data factories, dedicated database configuration, cleanup, test commands, and failure artifacts. Production/personal data cannot be selected accidentally by destructive test setup.
**Verification:** Run one deliberately failing then passing harness assertion per layer; verify worker/test isolation and failure artifact capture. Record actual scripts and browser-install prerequisites.
**WT-002 evidence (2026-10-16):** Added Jest Node/jsdom projects, Supertest/Vue Testing Library smoke tests, isolated user/workout factories, per-test cleanup hooks, and a destructive-cleanup guard requiring `TEST_DATABASE_URL` to target `workout_tracker_test`; cleanup rejects any `DATABASE_URL` with that reserved database name, including alternate host/scheme/port spellings. Backend, frontend, and browser harness assertions each produced a deliberate RED and passed after restoring the expected result. The browser smoke starts isolated backend/frontend processes, checks `/health` and the accessible Home heading, and passed three repeats with two workers and retries disabled. Its intentional failure retained screenshot, video, and trace artifacts under the ignored test-results directory. `npm test -- --maxWorkers=2` passed 5 suites / 9 tests; lint, format, frontend build, `git diff --check`, and `npm ci --dry-run` passed. Browser servers used alternate ports because a pre-existing process occupied 5174; the process was left untouched and test-owned ports were released. `npx playwright install chromium` installed the required browser. `npm audit --omit=dev` found 0 production vulnerabilities; the Jest 29 / Vue Jest 29 development tree reports 5 moderate and 30 high advisories, and Vue Jest has no published Jest 30-compatible release. PostgreSQL persistence/data cleanup execution and product journeys under ACC-01, SES-01, and UI-03 remain future feature coverage, not WT-002 harness scope.

### WT-003: Establish persistence, migrations, and domain boundaries

**Requirements:** ACC-01, CFG-01, CAT-01, PLN-01, PLN-02, SES-01, HIS-01.
**Depends on:** WT-002.
**Owner:** tdd-developer.
**Acceptance:** Define schema/API boundaries for users/roles, settings/catalog, program templates/run slots, drafts, original performance, and separate corrections. Add repeatable migrations and safe development/test seeds, foreign keys/ownership constraints, and a canonical-load representation. Add later feature tables/fields incrementally rather than treating the first schema as final.
**Verification:** Migrate a fresh isolated database; exercise constraints and relationships; prove user ownership, run identity, and original-vs-correction separation in integration tests. Re-run the migration/seed workflow without duplicate seed records.
**WT-003 evidence (2026-10-16):** Added PostgreSQL `pg` pool, transactional/advisory-locked SQL migrations, guarded `db:migrate`/`db:seed` commands, and a first incremental schema for profiles/gyms/equipment, catalog and per-exercise unit overrides, program templates and distinct run slots, sessions/snapshots, canonical kg loads, and separate corrections. PostgreSQL-engine tests use a fresh PGlite database per test and pass repeatable migration/seed, cross-user FK rejection, run identity and session/run-day consistency, retained-performance date uniqueness, finished-set immutability, and original/correction separation scenarios. `npm test -- --runInBand packages/backend/test/persistence` passed 4 suites / 16 tests. No local PostgreSQL server was installed, so connection to an external/local server was not exercised; add subsequent feature schema as new migrations.

### WT-004: Establish continuous integration and configuration checks

**Requirements:** ACC-01, UI-05; delivery acceptance.
**Depends on:** WT-002, WT-003.
**Owner:** tdd-developer; test-engineer for browser jobs.
**Acceptance:** CI installs locked dependencies, checks lint/build, and executes unit/component/API and designated browser smoke tests with isolated services. Document secrets/environment boundaries and retain diagnostic artifacts without personal data. No live deployment is implied by a passing pull-request build.
**Verification:** Confirm expected checks fail on a controlled broken assertion/configuration and pass after repair. Record the first actual CI run; local-only execution is not CI evidence.

### WT-005: Implement secure authentication and user authorization

**Requirements:** ACC-01, SES-01.
**Depends on:** WT-003.
**Owner:** tdd-developer.
**Acceptance:** Implement email/password authentication, secure password hashing, logout/session invalidation, and server-side role/ownership enforcement. Define a deployable session/cookie, CSRF/CORS, and origin strategy for Pages/Render before exposing authenticated APIs. Add validation, rate limiting for sensitive actions, safe errors, and no credential logging. No reset/verification feature is introduced.
**Verification:** Jest/Supertest covers valid/invalid credentials, unauthenticated calls, expired/invalid sessions, cross-user access, admin-only actions, logout, and the chosen CSRF/origin protections.

### WT-006: Implement admin bootstrap and invitation onboarding

**Requirements:** ACC-01.
**Depends on:** WT-005.
**Owner:** tdd-developer.
**Acceptance:** Securely provision the initial admin. Let admins create expiring single-use registration links for private sharing, with no email-delivery service. Registration requires a valid invitation and establishes the user's account/profile. Define token lifetime/configuration, avoid persisting raw secrets unnecessarily, and prevent invitation reuse including concurrent requests.
**Verification:** API/component tests for admin creation permissions, valid onboarding, expiry, invalid/reused tokens, duplicate emails, concurrent redemption, and no secret leakage. test-engineer validates invitation-to-sign-in navigation.

### WT-007: Implement the accessible mobile application shell

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, ACC-01.
**Depends on:** WT-001, WT-005.
**Owner:** tdd-developer; test-engineer for UI checks.
**Acceptance:** Build English navigation, temporary logo, authenticated/unauthenticated routes, loading/error/empty states, accessible controls, focus behavior, and responsive mobile-first layout. Route transitions and deep links must be compatible with static frontend hosting. Do not build a marketing landing page.
**Verification:** Component tests for navigation/auth guards and keyboard access; browser checks for mobile/desktop layout, deep links, and no overlapping or clipped navigation. Feature routes may initially show explicit empty states, not fake completed functionality.

## Setup and Programs

### WT-008: Implement the shared exercise catalog and admin maintenance

**Requirements:** CAT-01, ACC-01, UI-04.
**Depends on:** WT-003, WT-006, WT-007.
**Owner:** tdd-developer; admin/content owner supplies validated metadata.
**Acceptance:** Provide catalog API/admin views for stable exercise identity, image metadata, muscle roles, equipment/load type, rest category, side/dumbbell interpretation, bodyweight factors, and assistance ratios. Exact name mapping and explicit unmatched-name resolution must not silently merge variants. Allow neutral image placeholders during development; do not invent coefficients or image rights.
**Verification:** Authorization, validation, mapping, and component tests; catalog edits preserve existing historical identities/snapshots. Browser-check admin vs ordinary-user access and exercise information rendering.

### WT-009: Implement profile and gym settings

**Requirements:** CFG-01, TMR-01, REC-02, LOAD-01, UI-05.
**Depends on:** WT-008.
**Owner:** tdd-developer.
**Acceptance:** Provide one editable gym and profile with display name/email, timezone, bodyweight, default units, five rest categories, equipment min/max/increments/available loads, dumbbell weights, bar weights, and plate inventory quantities. Defaults are upper compound 120s, lower compound 180s, upper/lower isolation 90s, core 60s. Validate inputs and preserve settings per user.
**Verification:** API/component tests for save/reload, invalid quantities/increments, timezone/unit choices, rest defaults/overrides, and cross-user protection. Settings changes must not mutate session history.

### WT-010: Implement canonical loads, unit overrides, and snapshot helpers

**Requirements:** CFG-01, REC-02, HIS-01, HIS-02, LOAD-01.
**Depends on:** WT-009.
**Owner:** tdd-developer.
**Acceptance:** Store physical loads canonically; convert kg/lb without changing resistance. Persist per-exercise overrides independent of profile defaults. Define typed/validated load interpretations and immutable snapshots for prescriptions, units, bodyweight, factors, ratios, equipment, and side/dumbbell counts. Missing factors are explicit, not guessed zero values.
**Verification:** Independent numeric fixtures cover repeated conversion, rounding boundaries, profile-default changes, one/two dumbbells, unilateral accounting, missing configuration, and historical snapshot stability.

### WT-011: Implement the CSV parser and validation model

**Requirements:** IMP-01, IMP-02.
**Depends on:** WT-002, WT-008.
**Owner:** tdd-developer.
**Acceptance:** Use a CSV parser for metadata, blocks/cycle headers, named/inherited workout rows, distinct rest rows, variable set groups, notes, and Unicode/quoted fields. Import every cycle, ignore deload/rest metadata for plan semantics, preserve bounded/N+ ranges, and flag invalid set/RIR data. Distinguish row errors from unsafe structural errors and validate seven slots per week before activation.
**Verification:** Fixtures include the supplied five-cycle sample, quoted commas, empty trailing groups, malformed headers/grouping, unknown types/names, conflicting N+/failure RIR, source skip markers, and six/eight-slot weeks. No persistence occurs in a parser-only preview.

### WT-012: Implement import preview, mapping, and confirmed partial creation

**Requirements:** IMP-02, CAT-01, PLN-01, UI-05.
**Depends on:** WT-007, WT-010, WT-011.
**Owner:** tdd-developer.
**Acceptance:** Show week/day/set preview, source row errors, skipped-row decisions, and explicit catalog mappings. Confirm partial imports; block unsafe grouping and unresolved/empty workouts. Create a draft program transactionally rather than updating an existing template in place. Preserve old history; active-draft replacement requires explicit resolution/confirmation.
**Verification:** API/component tests for valid/partial import, user confirmation, structural rejection, missing mappings, rollback on persistence failure, repeated submit safety, and no accidental old-program/draft deletion. Browser-check mobile preview and error recovery.

### WT-013: Implement future-program editing and manual deload setup

**Requirements:** PLN-01, IMP-01, IMP-02, UI-05.
**Depends on:** WT-012.
**Owner:** tdd-developer.
**Acceptance:** Edit future days/exercises/sets; build one appended deload from scratch with exactly seven slots. Block activation without resolved workouts/mappings and configured deload. Preserve exact rep/RIR prescriptions and snapshots; no in-session substitution or structural editing.
**Verification:** Tests cover activation prerequisites, six/eight-slot deload rejection, valid seven-slot setup, future edits, and active/past snapshot immutability. Browser-check setup and meaningful validation messages.

### WT-014: Implement program runs and flexible week progression

**Requirements:** PLN-02, SES-01, SES-02.
**Depends on:** WT-013.
**Owner:** tdd-developer.
**Acceptance:** Maintain one current program/run; allow out-of-order slots within the active week. Check rest days manually, resolve workout slots through finalization, and advance atomically only after all seven slots resolve. Prevent repeats/silent rewind. Offer stop, restart with the saved deload as a new run, or confirmed replacement while preserving prior history.
**Verification:** Domain/API tests cover every final-slot ordering, duplicate/concurrent resolutions, rest undo, prior-week edits, final deload, repeated restart instances, and replacement. Stub finalization inputs here; verify real integration in WT-023.

### WT-015: Implement Home, workout detail, and exercise information

**Requirements:** UI-01, UI-02, UI-04, PLN-02, CAT-01.
**Depends on:** WT-007, WT-008, WT-014.
**Owner:** tdd-developer; test-engineer for UI checks.
**Acceptance:** Show week/month calendar, expandable current-program ribbon with seven slots and distinct states, workout muscles/prescriptions, horizontal muscle pills, and exercise Info with Primary/Secondary/Tertiary roles. Provide Start/Resume navigation; fill actual-date history links as finalization/history become available.
**Verification:** Component/browser tests for collapse/expand, slot navigation, empty/error states, long labels and horizontal scroll, muscle role rendering, and mobile/desktop layout. Start/Resume integration is completed with WT-016/017; history links with WT-025.

## Tracking and Calculations

### WT-016: Implement online drafts and conflict-safe session persistence

**Requirements:** SES-01, CFG-01, HIS-01.
**Depends on:** WT-005, WT-010, WT-014.
**Owner:** tdd-developer.
**Acceptance:** Start/resume one active draft per user with session/prescription snapshots and start-date timezone. Persist acknowledged changes, reject competing stale updates, and deduplicate retries. Recover after reload; preserve visible unsaved input on failure without claiming success. Enforce date/run eligibility server-side; finalization must recheck it transactionally.
**Verification:** API/component tests cover two-tab/device races, concurrent starts, idempotent saves, version conflicts, reload, connection failure/retry, midnight/timezone boundaries, and no draft entries in finished history. Do not add offline queues.

### WT-017: Implement manual tracking, row locks, units, and exercise navigation

**Requirements:** UI-03, CFG-01, SES-01, SES-02.
**Depends on:** WT-015, WT-016.
**Owner:** tdd-developer; test-engineer for UI checks.
**Acceptance:** Build image navigation, exercise/set position, Info/History actions, horizontally scrollable set grid, Standard/Warmup/Failure modal, actual weight/reps/RIR, and noninteractive Auto. Check saves/locks; uncheck unlocks and invalidates unfinished recommendations. Validate integer reps/RIR, failure RIR 0, and valid zero bodyweight added load. Persist exercise-unit overrides. Permit individual exercise skipping and continuing, but require partial finishing rather than normal completion.
**Verification:** Component/API tests for valid/invalid logs, no editing locked rows, uncheck/correct/recheck, failed-save state, keyboard/touch behavior, unit persistence, and skipped exercise state. Manual logging works when recommendation configuration is missing.

### WT-018: Implement recoverable session and rest timers

**Requirements:** TMR-01, UI-03, SES-01.
**Depends on:** WT-009, WT-017.
**Owner:** tdd-developer; test-engineer for browser behavior.
**Acceptance:** Track elapsed session/rest time by timestamps with pause/resume/reload recovery. Working/failure completion replaces rest countdown; warmups/unchecking do not start or rewind it. Provide start/pause/reset/skip/add/subtract controls, diminishing progress, and foreground tone. Pause/Resume applies to both timers; CSV rest values never override profiles.
**Verification:** Fake-clock numeric tests for elapsed/paused/reloaded timers, set types, category defaults, zero-boundary and time adjustments. Browser-check controls and foreground audio with user interaction; document background limitations.

### WT-019: Implement external-load recommendations and tracker integration

**Requirements:** REC-01, UI-03, CFG-01.
**Depends on:** WT-010, WT-017.
**Owner:** tdd-developer.
**Acceptance:** Implement approved RIR-adjusted estimates, first-set seeding/manual fallback, same-load in-range integer reps, midpoint feasible-load fallback, N+ failure handling, high-rep confidence labeling, and unfinished-only recalculation. The 10% upward cap compares effective resistance to the latest checked same-exercise working set, otherwise latest retained historical set using applicable corrections. Specify deterministic rounding/tie fixtures; never silently violate ranges/equipment constraints.
**Verification:** Independent numeric tests for below-range performance, in-range lower reps at unchanged load, zero/missing references, cap boundaries, equipment increments, crossed training bands, N+, high reps, unchecked/warmup exclusion, and locked-row preservation. Validate live finalized-history seeding again in WT-024/025.

### WT-020: Implement bodyweight, assisted, and dumbbell recommendations

**Requirements:** REC-02, REC-01, HIS-02.
**Depends on:** WT-019, WT-008, WT-009.
**Owner:** tdd-developer.
**Acceptance:** Convert snapshotted bodyweight/factor/added load/assistance ratio to effective resistance and back to available equipment settings. More assistance lowers resistance; the cap applies to resistance, not the assistance selector. Recommend one-dumbbell load and keep volume multipliers distinct. Missing factors/ratios or nonpositive resistance require explicit manual fallback.
**Verification:** Numeric/API/component cases cover zero added bodyweight load, one/two dumbbells, side counts, ratio changes, missing bodyweight, assisted direction/cap, nonpositive resistance, and profile changes leaving snapshots unchanged. No guessed anatomical coefficients.

### WT-021: Implement balanced finite-inventory barbell visualization

**Requirements:** LOAD-01, CFG-01, UI-03, REC-01.
**Depends on:** WT-010, WT-017, WT-019.
**Owner:** tdd-developer; test-engineer for rendering/selection.
**Acceptance:** Show selected bar, balanced labeled plates, per-side/total load, and the minimum feasible plate count using actual gym quantities. Include bar weight, honor configured collars, reject below-bar loads, and show available nearest lower/higher alternatives when exact loading fails. Require explicit user selection; never silently change logged weight.
**Verification:** Numeric fixtures include insufficient pairs, greedy-choice traps, exhausted inventory, multiple bar weights, kg/lb conversion, missing lower/higher alternatives, and below-bar rejection. Component/browser checks verify a readable nonblank mobile visual and alternative selection.

### WT-022: Implement immutable original performance metrics

**Requirements:** HIS-01, HIS-02, REC-01, REC-02.
**Depends on:** WT-010, WT-020.
**Owner:** tdd-developer.
**Acceptance:** Define original working-set contributions for estimated RM, heaviest load, volume, reps, and workout counts. Exclude warmups/unchecked/skipped performance, apply dumbbell/side counts and snapshotted effective resistance, and distinguish assistance selectors from strength. Store original values/contributions so later configuration/corrections never recompute past results.
**Verification:** Independent numeric and persistence tests for all load types, standard/failure sets, per-side conventions, zero/missing factors, and the specified 1RM vs inverse 3RM/10RM calculation. Preserve manual logs and expose unavailable estimates rather than fabricated metrics.

### WT-023: Implement normal, discarded, and emergency finalization

**Requirements:** SES-02, SES-01, PLN-02, HIS-01, HIS-02.
**Depends on:** WT-014, WT-017, WT-018, WT-022.
**Owner:** tdd-developer; test-engineer for journey checks.
**Acceptance:** Show/accept normal completion only for all required sets checked with no skipped exercise. Confirm Discard with no history/progression. Confirm partial/emergency finish, retaining exercises with at least one checked working set and checked sets only. Drop unchecked logs/exercises with no working set; wholly skipped outcomes produce status events only. Atomically save retained metrics, resolve slots, stop the draft/timers, enforce one retained-performance workout per start date/timezone, and prevent duplicate completion.
**Verification:** API/domain/component tests cover single checked set in an incomplete exercise, warmup-only exercises, individual skips followed by later work, wholly skipped days, duplicate/racing completion, failed transaction rollback, rest/weekly advancement, discarded restart on the same date, and midnight boundaries. History and calendar must show distinct full/partial/skipped states.

## History and Delivery

### WT-024: Implement labeled future-only weight/reps corrections

**Requirements:** HIS-01, REC-01, UI-04.
**Depends on:** WT-023, WT-019.
**Owner:** tdd-developer.
**Acceptance:** Permit finished-session weight/reps corrections only, stored separately and visibly alongside immutable originals. Do not change original metrics, RIR/type/completion, other sessions, or program progression. Future recommendations seed from the applicable correction while preserving original historical charts/records.
**Verification:** API/component tests reject forbidden edits/cross-user access, prove byte/value stability of original contributions, apply corrected future seeds, and distinguish active uncheck/recheck from finished editing. Define repeated-correction selection deterministically.

### WT-025: Implement exercise history and calendar result links

**Requirements:** UI-01, UI-04, HIS-01, HIS-02.
**Depends on:** WT-015, WT-023, WT-024.
**Owner:** tdd-developer.
**Acceptance:** Display expandable retained exercise sessions with estimated 1RM/3RM/10RM, heaviest load, volume, and reps filters. Link calendar dates to actual results, including partial/skipped statuses. History survives program replacement/restarts; exclude drafts/discards and exercises with no retained working set. Clearly label estimates/corrections and unavailable metric values.
**Verification:** API/component/browser tests use multiple runs/programs, all finalization outcomes, timezone/start-date links, missing history, original-vs-corrected values, and distinct assisted/effective load labels. No stale current-program dependency may hide history.

### WT-026: Implement dashboard charts and date filters

**Requirements:** UI-05, HIS-01, HIS-02.
**Depends on:** WT-025.
**Owner:** tdd-developer; test-engineer for visual/interaction checks.
**Acceptance:** Show per-exercise estimated RM/load/volume/reps plus workout count and total volume. Provide last four/twelve weeks, year, all time, and custom filters, with useful empty/loading/error states. Charts use original contributions, not corrections; no aggregate cross-exercise 1RM. Use a suitable existing chart library and accessible labels/data equivalents.
**Verification:** API/component tests for date boundaries/timezones, totals, partial-retention exclusions, correction immutability, unit displays, and invalid custom ranges. Browser-check readable mobile/desktop charts and filter interactions.

### WT-027: Harden cross-cutting failure, privacy, and recovery behavior

**Requirements:** ACC-01, SES-01, SES-02, HIS-01, UI-05.
**Depends on:** WT-006, WT-023, WT-024, WT-026.
**Owner:** tdd-developer; test-engineer for browser failure triage.
**Acceptance:** Audit authorization across all record types/admin routes, input/upload limits, validation/error handling, token/log/artifact exposure, request retries, draft conflicts, and transaction boundaries. Document a safe operational support path while password reset remains deferred. Keep environmental failures distinguishable from application/test defects.
**Verification:** Negative API tests for cross-account IDs and admin escalation, oversized/malformed imports, concurrent finalization, simulated network/database failures, and stale updates. Review logs/artifacts for secrets; confirm recoverable errors do not fabricate success or lose acknowledged data.

### WT-028: Establish staging deployment and smoke checks

**Requirements:** ACC-01, SES-01, UI-05; delivery acceptance.
**Depends on:** WT-004, WT-006, WT-026, WT-027.
**Owner:** tdd-developer; user approves providers/costs and configures secrets securely.
**Acceptance:** Document and exercise Pages/Render/Neon deployment, environment separation, HTTPS/API origins/authentication, static routing, migration sequencing, health/logging, and rollback procedure. Record service limits, startup/availability behavior, and expected cost before live provisioning; no assumption that free tiers are sufficient.
**Verification:** Build/deploy to approved nonproduction resources; run deep-link, authenticated API, save/reload, and health smoke checks against actual deployed origins. Missing approvals/resources are explicit blockers, not simulated success.

### WT-029: Complete catalog, asset, and gym readiness inputs

**Requirements:** CAT-01, CFG-01, REC-02, LOAD-01, UI-02, UI-04.
**Depends on:** WT-008, WT-009, WT-020, WT-021.
**Owner:** user/admin/content owner; developers validate ingestion.
**Acceptance:** Name the content owner and supply/approve initial exercise mappings, muscle roles, image assets/usage rights, actual gym loads/plates/bars, and validated applicable factors/ratios. Replace development placeholders where launch assets are available; explicitly document unresolved assets and disabled per-exercise recommendations. No fabricated coefficients or silently incomplete inventory.
**Verification:** Validate actual seed/import data, render real assets, verify sample program mapping, and calculate reference exercises against the approved gym. Resolve readiness gaps or explicitly accept documented limitations before launch.

### WT-030: Verify backups, restore, and operational handover

**Requirements:** ACC-01, SES-01, HIS-01; delivery acceptance.
**Depends on:** WT-028.
**Owner:** tdd-developer; user approves retention/access arrangements.
**Acceptance:** Document backup availability/retention, access restrictions, schema/version compatibility, migration recovery, and restore procedure for the selected database plan. Do not treat provider marketing as a tested recovery plan. Provide deployment/setup/support instructions without secrets.
**Verification:** Restore a nonproduction backup into an isolated target; verify users/ownership, program runs, snapshots, original metrics, corrections, and relevant draft state. Record commands, elapsed recovery, observed gaps, and migration/rollback smoke results without touching live user records.

## Release Verification

### WT-031: Execute the complete critical-journey and isolation suite

**Requirements:** ACC-01, CFG-01, CAT-01, IMP-01, IMP-02, PLN-01, PLN-02, UI-01, UI-02, UI-03, UI-04, UI-05, SES-01, SES-02, TMR-01, REC-01, REC-02, LOAD-01, HIS-01, HIS-02.
**Depends on:** WT-026, WT-027, WT-028, WT-029.
**Owner:** test-engineer.
**Acceptance:** Complete the requirement-to-test coverage report with actual files/scenarios and results. Reuse per-test page objects/helpers, accessibility-first selectors, state-based waits, and isolated owned data. Cover onboarding/import/deload through tracking/timers/load types/plates, completion and emergency retention, conflicts/errors, progression/restart, history/corrections, and dashboard. Distinguish mocked tests from real persistence integration.
**Verification:** Execute focused and regression suites, individual/grouped/repeated runs with retries disabled, and parallel runs where supported. Capture safe traces/screenshots, classify failures with evidence, and resolve or explicitly report gaps. A single eventual passing retry is not stability evidence.

### WT-032: Complete device validation and launch sign-off

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, SES-01, TMR-01; delivery acceptance.
**Depends on:** WT-029, WT-030, WT-031.
**Owner:** test-engineer for validation; user/admin for launch approval.
**Acceptance:** Follow automation with focused checks on current iPhone Safari/Android Chrome and desktop Chrome/Safari. Record actual device/browser versions. Inspect touch input/keyboards, overflow, charts/images/plates, focus/accessibility, timer controls/foreground sound, reload/error recovery, and invitation onboarding. Review remaining content, security, backup, cost, and coverage blockers before inviting real users.
**Verification:** Record the manual checklist and observed results, deployed smoke results, unresolved defects/limitations, and explicit user launch approval. Do not claim offline/background-alert guarantees, full UI confidence, or production readiness while required checks remain unverified.

## Requirement Traceability

This table maps planned implementation tasks, not completed test coverage. WT-031 audits all requirement IDs; the rows below identify primary delivery tasks rather than relying on that audit as implementation.

| Requirement | Primary task IDs               |
| ----------- | ------------------------------ |
| ACC-01      | WT-005, WT-006, WT-008, WT-027 |
| CFG-01      | WT-009, WT-010, WT-017         |
| CAT-01      | WT-008, WT-012, WT-029         |
| IMP-01      | WT-011, WT-013                 |
| IMP-02      | WT-011, WT-012                 |
| PLN-01      | WT-012, WT-013                 |
| PLN-02      | WT-014, WT-023                 |
| UI-01       | WT-015, WT-025                 |
| UI-02       | WT-015                         |
| UI-03       | WT-017, WT-018, WT-019, WT-021 |
| UI-04       | WT-008, WT-015, WT-025         |
| UI-05       | WT-007, WT-009, WT-013, WT-026 |
| SES-01      | WT-016, WT-023, WT-027         |
| SES-02      | WT-017, WT-023                 |
| TMR-01      | WT-009, WT-018                 |
| REC-01      | WT-019, WT-020                 |
| REC-02      | WT-010, WT-020                 |
| LOAD-01     | WT-009, WT-021                 |
| HIS-01      | WT-022, WT-024, WT-025         |
| HIS-02      | WT-022, WT-025, WT-026         |

## Ready to Start and External Dependencies

- WT-001 is ready to start; no application code is changed by creating this backlog. Do not mark infrastructure or feature tasks complete based on documentation alone.
- Begin content collection for WT-029 in parallel with foundations. Missing images may use neutral development placeholders; missing validated factors/ratios disable only the affected automatic recommendations, with manual logging intact.
- Staging/backup/release tasks require provider access, safe secret setup, actual gym/catalog data, and approval of costs/operational limitations. No delivery date or hosting budget was supplied.
- Technical selection of libraries, database access tooling, and deterministic tie-breaking remains implementation work within the agreed stack. Record decisions and fixtures before the affected slice; ask only if a choice would change approved product behavior or scope.
- Future GitHub issues should retain these task IDs, requirement links, dependencies, and acceptance/verification text. Creating issues, branches, commits, or cloud resources is a separate authorized action.
