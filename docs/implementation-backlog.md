# Implementation Backlog

## Purpose and Status

Created 2026-10-16 from the [canonical specification](project-overview.md). This is the repository's implementation task backlog, not a claim that the application exists. Task implementation and verification status is recorded below; evidence applies only to the checks listed. GitHub issues have not been created; these stable task IDs can be used when issues are created later.

**Status: WT-001 through WT-003 and WT-005 complete; WT-004 CI configuration is implemented and awaiting its first hosted run; WT-006 backend implementation complete with invitation browser validation pending; WT-007 implementation and reported shell browser walkthrough complete, with invitation/deep-link and viewport-specific checks not recorded; WT-008 implementation, automated checks, and reported catalog browser verification complete; WT-009 through WT-012 implementation and automated checks complete; WT-012 mobile browser preview/recovery check complete; WT-013 implementation and automated checks complete with browser walkthrough pending; WT-014 backend implementation and automated checks complete; WT-015 implementation and automated checks complete with mocked browser validation; WT-016 implementation and automated checks complete; WT-017 tracker implementation and automated checks complete, with browser/device validation pending; WT-018 automated and user-reported frontend validation complete, with external PostgreSQL and physical-device checks not exercised; WT-019 through WT-032 not started.** The ordered cards form a completion-dependency graph; independent work may proceed once prerequisites are met. Collect content for WT-029 early, even though its final readiness check depends on implemented settings.

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
**WT-004 implementation (2026-10-19):** Added `.github/workflows/ci.yml` with independent quality/Jest and Playwright Chromium jobs, locked `npm ci` installs, read-only repository permissions, no secrets, isolated Playwright-managed services, and seven-day failure diagnostics. README documents CI environment and artifact boundaries. Locally confirmed the Playwright config rejects an invalid port and accepts its defaults. The first hosted CI run remains pending; do not mark this card complete until it is recorded.

### WT-005: Implement secure authentication and user authorization

**Requirements:** ACC-01, SES-01.
**Depends on:** WT-003.
**Owner:** tdd-developer.
**Acceptance:** Implement email/password authentication, secure password hashing, logout/session invalidation, and server-side role/ownership enforcement. Define a deployable session/cookie, CSRF/CORS, and origin strategy for Pages/Render before exposing authenticated APIs. Add validation, rate limiting for sensitive actions, safe errors, and no credential logging. No reset/verification feature is introduced.
**Verification:** Jest/Supertest covers valid/invalid credentials, unauthenticated calls, expired/invalid sessions, cross-user access, admin-only actions, logout, and the chosen CSRF/origin protections.
**WT-005 evidence (2026-10-19):** Added migration `002_authentication.sql`, Node `scrypt` password hashing, opaque 12-hour server-side sessions storing only SHA-256 token hashes, logout revocation, and current-user profile access. Reusable middleware rejects unauthenticated, wrong-role, and cross-user requests. Exact-origin credentialed CORS and mandatory `Origin` checks protect unsafe API requests; login is validated and limited to 10 attempts per IP per 15 minutes. Passwords/session tokens are omitted from API responses and never logged. Production requires HTTPS origins and Secure, HttpOnly, host-only, SameSite=Lax cookies. README documents using same-site custom Pages/Render subdomains (or a same-origin proxy) for Safari compatibility, exact origin configuration, trusted proxy hops, and the process-local rate-limit constraint before horizontal scaling. `packages/backend/test/auth.test.js` covers login success/failure, input validation, profile isolation, invalid/expired/revoked sessions, logout, role/ownership middleware, CORS/CSRF, rate limiting, and production cookie configuration. Initial RED observed `/api/profile` returning 404 instead of 401; focused API suite passed 13 tests. Full `npm test -- --runInBand` passed 10 suites / 39 tests; lint, formatting, frontend build, editor diagnostics, and `git diff --check` passed. Persistence ran on isolated PGlite, not an external PostgreSQL service. Account provisioning/invitation registration and auth UI remain WT-006/WT-007; Playwright was not run.

### WT-006: Implement admin bootstrap and invitation onboarding

**Requirements:** ACC-01.
**Depends on:** WT-005.
**Owner:** tdd-developer.
**Acceptance:** Securely provision the initial admin. Let admins create expiring single-use registration links for private sharing, with no email-delivery service. Registration requires a valid invitation and establishes the user's account/profile. Define token lifetime/configuration, avoid persisting raw secrets unnecessarily, and prevent invitation reuse including concurrent requests.
**Verification:** API/component tests for admin creation permissions, valid onboarding, expiry, invalid/reused tokens, duplicate emails, concurrent redemption, and no secret leakage. test-engineer validates invitation-to-sign-in navigation.
**WT-006 implementation (2026-10-19):** Added migration `003_registration_invitations.sql`; `bootstrapInitialAdmin` provisions the first administrator/profile atomically under a PostgreSQL advisory transaction lock and refuses once an admin exists. `auth:bootstrap-admin` uses `DATABASE_URL` plus operator-provided `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` environment variables; there is no public bootstrap endpoint or password command-line argument. Admin-only `POST /api/admin/invitations` returns a private registration URL with a 32-byte random token while persisting only its SHA-256 hash. `POST /api/auth/register` validates account details and transactionally locks/redeems a valid invitation while creating a member/profile; duplicate email rolls back without consuming the invitation. Lifetime defaults to seven days and `INVITATION_TTL_HOURS` accepts 1-720; registration and invitation creation are IP rate-limited. `packages/backend/test/auth.test.js` covers role/unauthenticated access, hash-only storage, valid/invalid/expired/redeemed links, duplicate-email rollback, concurrent redemption, throttling, bootstrap-once, and concurrent bootstrap. RED observed missing routes and missing bootstrap helper; focused auth/onboarding passed 24 tests. `npm run test:backend -- --runInBand` passed 9 suites / 49 tests; `npm test -- --runInBand` passed 10 suites / 50 tests; lint, formatting, frontend build, editor diagnostics, and `git diff --check` passed. The bootstrap CLI smoke safely stopped when `DATABASE_URL` was absent. PGlite was used; an external PostgreSQL service was not exercised. Invitation-to-sign-in browser validation remains pending WT-007 UI routes and test-engineer execution.

### WT-007: Implement the accessible mobile application shell

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, ACC-01.
**Depends on:** WT-001, WT-005.
**Owner:** tdd-developer; test-engineer for UI checks.
**Acceptance:** Build English navigation, temporary logo, authenticated/unauthenticated routes, loading/error/empty states, accessible controls, focus behavior, and responsive mobile-first layout. Route transitions and deep links must be compatible with static frontend hosting. Do not build a marketing landing page.
**Verification:** Component tests for navigation/auth guards and keyboard access; browser checks for mobile/desktop layout, deep links, and no overlapping or clipped navigation. Feature routes may initially show explicit empty states, not fake completed functionality.
**WT-007 implementation evidence (2026-10-19):** Added hash-based routes for sign-in, invitation registration, Home, Programs, Workout, History, Dashboard, and Settings; protected-route profile bootstrap with loading/error/retry states; credentialed sign-in/out and token registration forms; responsive navigation, skip link, route focus, explicit feature empty states, and local API proxy configuration. Admin invitation URLs now use `/#/register?token=...` so static hosting can resolve registration deep links. `packages/frontend/src/App.test.js` covers guarded deep links, sign-in redirect, accessible navigation, Dashboard/History empty states, sign-out, token registration, loading feedback, route focus, and explicit retry; backend invitation-format regression is in `packages/backend/test/auth.test.js`. Full Jest passed 11 suites / 53 tests; lint, format check, frontend build, editor diagnostics, and `git diff --check` passed. PGlite remains the backend test database.
**WT-007 browser walkthrough (user-reported, 2026-10-20):** Admin sign-in succeeded and every shell screen was opened in the browser. The screens showed empty/placeholder states without workout content, as expected at this stage. This confirms the reported screen-navigation walkthrough. Invitation registration, direct hash-URL refresh, keyboard focus, and specific mobile/desktop viewport checks were not reported and remain unverified.

## Setup and Programs

### WT-008: Implement the shared exercise catalog and admin maintenance

**Requirements:** CAT-01, ACC-01, UI-04.
**Depends on:** WT-003, WT-006, WT-007.
**Owner:** tdd-developer; admin/content owner supplies validated metadata.
**Acceptance:** Provide catalog API/admin views for stable exercise identity, image metadata, muscle roles, equipment/load type, rest category, side/dumbbell interpretation, bodyweight factors, and assistance ratios. Exact name mapping and explicit unmatched-name resolution must not silently merge variants. Allow neutral image placeholders during development; do not invent coefficients or image rights.
**Verification:** Authorization, validation, mapping, and component tests; catalog edits preserve existing historical identities/snapshots. Browser-check admin vs ordinary-user access and exercise information rendering.
**WT-008 implementation evidence (2026-10-20):** Added migration `004_exercise_catalog_metadata.sql`, authenticated catalog reads/exact-name matching, and admin-only catalog creation/updates that preserve exercise UUIDs. `packages/backend/test/catalog.test.js` covers role authorization, metadata validation, unset coefficients, duplicate-name rejection, exact mapping, and stable identity. `packages/frontend/src/views/CatalogView.test.js` covers catalog rendering and create/edit; `packages/frontend/src/router.test.js` covers admin/member routing and component resolution. `npm test -- --runInBand` passed 14 suites / 63 tests; lint, formatting, frontend build, and `git diff --check` passed. User reported that `npm run db:migrate --workspace=@workout-tracker/backend` succeeded and an exercise added through the admin page was saved.
**WT-008 browser verification (user-reported, 2026-10-20):** Admin catalog access, member denial, and exercise information rendering were checked in the browser.
**WT-008 snapshot persistence verification (2026-10-22):** Extended the catalog edit integration test to create linked program and session exercise snapshots, edit the catalog entry, and verify the stored program prescription plus session name, exercise, and prescription snapshots remain unchanged. The catalog edit and stable exercise UUID assertions also pass. `npm run test:backend -- --runInBand` passed 11 suites / 56 tests, including the new regression. No production code change was needed because catalog updates already leave snapshot rows untouched. Exercise coefficients will be supplied later by the content owner; image assets and usage rights also remain content-owner inputs and must not be inferred.

### WT-009: Implement profile and gym settings

**Requirements:** CFG-01, TMR-01, REC-02, LOAD-01, UI-05.
**Depends on:** WT-008.
**Owner:** tdd-developer.
**Acceptance:** Provide one editable gym and profile with display name/email, timezone, bodyweight, default units, five rest categories, equipment min/max/increments/available loads, dumbbell weights, bar weights, and plate inventory quantities. Defaults are upper compound 120s, lower compound 180s, upper/lower isolation 90s, core 60s. Validate inputs and preserve settings per user.
**Verification:** API/component tests for save/reload, invalid quantities/increments, timezone/unit choices, rest defaults/overrides, and cross-user protection. Settings changes must not mutate session history.
**WT-009 implementation evidence (2026-10-20):** Added authenticated `GET/PUT /api/settings` with validated profile fields, five rest categories, and one user-owned gym. Equipment and dumbbell load ranges/increments/available loads, bars, and finite plate quantities are stored in existing kg-canonical tables. Inventory replacement is transactional, email uniqueness is enforced by the database, and session snapshots are not rewritten. Added the mobile-first Settings view and routed `/settings` to it. RED confirmed the missing API returned 404 and the Settings route used the placeholder; focused tests passed after implementation. `packages/backend/test/settings.test.js` covers defaults, save/reload, invalid timezone/units/rest/increments/plate quantities, account isolation, and historical snapshot stability. `packages/frontend/src/views/SettingsView.test.js` covers load/edit/save/error behavior and 120/180/90/90/60 defaults; `packages/frontend/src/router.test.js` verifies route ownership. `npm test -- --runInBand` passed 16 suites / 69 tests; lint, format check, production build, editor diagnostics, and `git diff --check` passed. Tests use isolated PGlite; an external PostgreSQL service and Playwright/browser viewport checks were not run.

### WT-010: Implement canonical loads, unit overrides, and snapshot helpers

**Requirements:** CFG-01, REC-02, HIS-01, HIS-02, LOAD-01.
**Depends on:** WT-009.
**Owner:** tdd-developer.
**Acceptance:** Store physical loads canonically; convert kg/lb without changing resistance. Persist per-exercise overrides independent of profile defaults. Define typed/validated load interpretations and immutable snapshots for prescriptions, units, bodyweight, factors, ratios, equipment, and side/dumbbell counts. Missing factors are explicit, not guessed zero values.
**Verification:** Independent numeric fixtures cover repeated conversion, rounding boundaries, profile-default changes, one/two dumbbells, unilateral accounting, missing configuration, and historical snapshot stability.
**WT-010 implementation evidence (2026-10-22):** Added canonical kg/lb conversion and display-rounding helpers, validated load interpretations, and copied/deep-frozen exercise snapshots containing prescription, unit, bodyweight, factors, ratios, gym equipment/inventory, and side/dumbbell counts. The existing schema already stores physical loads in kg and has per-user exercise preferences, so no migration was needed. Added authenticated per-exercise preference read/write routes; null clears the override and uses the current profile default. `packages/backend/test/loads.test.js` covers conversion round trips and rounding boundaries (including canonical `1.005 kg`), profile-default independence, account isolation, missing bodyweight/assistance metadata, both dumbbell counts, side count, snapshot immutability, and invalid inputs. Existing `packages/backend/test/settings.test.js` and `packages/backend/test/catalog.test.js` cover historical snapshot stability across settings/catalog changes. Initial RED confirmed the domain module was missing; a follow-up boundary test reproduced floating-point rejection of valid three-decimal loads before the validator fix. Focused tests passed 4 tests; adjacent settings/catalog/load tests passed 3 suites / 11 tests; `npm test -- --runInBand` passed 17 suites / 74 tests. `npm run lint`, `npm run format:check`, `npm run build`, editor diagnostics, and `git diff --check` passed. Tests used isolated PGlite; an external PostgreSQL service and browser validation were not run. Tracker UI integration remains WT-017.

### WT-011: Implement the CSV parser and validation model

**Requirements:** IMP-01, IMP-02.
**Depends on:** WT-002, WT-008.
**Owner:** tdd-developer.
**Acceptance:** Use a CSV parser for metadata, blocks/cycle headers, named/inherited workout rows, distinct rest rows, variable set groups, notes, and Unicode/quoted fields. Import every cycle, ignore deload/rest metadata for plan semantics, preserve bounded/N+ ranges, and flag invalid set/RIR data. Distinguish row errors from unsafe structural errors and validate seven slots per week before activation.
**Verification:** Validate the supplied five-cycle sample and cover quoted commas, empty trailing groups, malformed headers/grouping, unknown types/names, conflicting N+/failure RIR, source skip markers, a seven-cycle input, and weeks with six/eight day slots. Cycle count is unrestricted; the six/eight cases refer to day slots within one week. No persistence occurs in a parser-only preview.
**WT-011 implementation evidence (2026-10-22):** Added a pure synchronous `csv-parse` 7.0.3 model in `packages/backend/src/import.js`; it returns metadata, training weeks, workout/rest slots, ordered exercises and normalized set prescriptions, source row numbers, source skip markers, and separate row, structural, and week errors. It supports both standalone and cycle-row headers, including the supplied MacroFactor layout and its `Key: Value` metadata cells. CSV rest values and deload metadata do not change plan semantics. The parser emits exactly the CSV's cycle count as training weeks and never appends a deload; the separately configured manual deload is a WT-013 feature. Each CSV week still requires exactly seven day slots. The parser performs no persistence. `packages/backend/test/import.test.js` covers generated five- and seven-cycle fixtures, the supplied header/metadata format, repeated headers and block markers, quoted/escaped Unicode text with an embedded newline, inherited workout rows, distinct rest slots, bounded and N+ ranges, ignored empty trailing groups, invalid types/names/RIR/ranges, source skip markers, malformed headers/grouping, and six/eight-day-slot weeks. Ran the parser against `MacroFactor-20260927154219.csv`: parsed all 5 cycles as training weeks, each with 7 slots, 4 workouts, 3 rest days, and 19 exercises; no row, structural, or week errors or source skip markers; `canActivate: true`. `npm test -- --runInBand` passed 18 suites / 82 tests; `npm run lint` and `npm run format:check` passed; `npm audit --omit=dev` reported zero vulnerabilities. Manual deload creation remains WT-013.

### WT-012: Implement import preview, mapping, and confirmed partial creation

**Requirements:** IMP-02, CAT-01, PLN-01, UI-05.
**Depends on:** WT-007, WT-010, WT-011.
**Owner:** tdd-developer.
**Acceptance:** Show week/day/set preview, source row errors, skipped-row decisions, and explicit catalog mappings. Confirm partial imports; block unsafe grouping and unresolved/empty workouts. Create a draft program transactionally rather than updating an existing template in place. Preserve old history; active-draft replacement requires explicit resolution/confirmation.
**Verification:** API/component tests for valid/partial import, user confirmation, structural rejection, missing mappings, rollback on persistence failure, repeated submit safety, and no accidental old-program/draft deletion. Browser-check mobile preview and error recovery.
**WT-012 implementation evidence (2026-10-22):** Added authenticated `/api/programs/import/preview`, `/api/programs/import`, and user-scoped `/api/programs` endpoints plus migration `005_program_import_requests.sql`. Preview returns parsed week/day/set data, row/structure/week errors, source skip markers, and exact catalog candidates. Confirmation validates every included mapping and skip/acknowledgement decision, blocks unsafe grouping and workouts emptied by skipped rows, then creates a separate template and all weeks/days/exercises/sets in one transaction. Original imported rep/RIR values, notes, and source row numbers are retained; no current template or workout draft is changed. A user-scoped idempotency ledger is committed with the template so same-key retries return the original draft, conflicting reuse returns 409, and persistence failures roll back the full import. Added the mobile-first Programs view with file/paste input, preview, mapping/skip decisions, explicit confirmation, validation feedback, and saved-program list. `packages/backend/test/programs.test.js` covers preview, the supplied five-cycle CSV, partial creation, explicit source-marker acknowledgement, missing mappings, unsafe/six-slot/empty workouts, user isolation, preservation of existing templates and active drafts, idempotency/replay conflict, and injected persistence rollback. `packages/frontend/src/views/ProgramsView.test.js` covers preview decisions, confirmation/payload, structural blocking, and corrected-preview recovery; `packages/frontend/src/router.test.js` covers route ownership. Focused backend passed 7 tests; focused view passed 2 tests. Full `npm test -- --runInBand` passed 20 suites / 92 tests; `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed. Integrated Chromium browser walkthrough at 375x844 CSS pixels created a draft, rejected a six-slot week, recovered after correction to seven slots, and showed no horizontal overflow. Browser data used disposable in-memory PGlite; an external PostgreSQL service and actual iOS/Android devices were not exercised. Imports deliberately create separate drafts only; program activation/replacement remains with WT-014, and session-draft resolution is not destructive or implicit.

### WT-013: Implement future-program editing and manual deload setup

**Requirements:** PLN-01, IMP-01, IMP-02, UI-05.
**Depends on:** WT-012.
**Owner:** tdd-developer.
**Acceptance:** Edit future days/exercises/sets; build one appended deload from scratch with exactly seven slots. Block activation without resolved workouts/mappings and configured deload. Preserve exact rep/RIR prescriptions and snapshots; no in-session substitution or structural editing.
**Verification:** Tests cover activation prerequisites, six/eight-slot deload rejection, valid seven-slot setup, future edits, and active/past snapshot immutability. Browser-check setup and meaningful validation messages.
**WT-013 implementation evidence (2026-10-22):** Added user-scoped program detail, transactional future-day replacement, manual deload creation, and confirmed activation routes in `packages/backend/src/programs.js`; activation validates all seven-slot weeks, one appended deload, mapped exercises, nonempty workouts/sets, and creates a `program_runs` row plus corresponding run-day snapshots atomically. Editing rejects resolved or session-backed days and retains session prescription snapshots. The Programs view now edits day/exercise/set prescriptions, prepopulates the manual deload from the latest training week’s seven slots and exercises with sets intentionally blank, and gates deload save/activation until prescriptions are complete and confirmed. `packages/backend/test/programs.test.js` passed 10 tests covering 6/8-slot rejection, all-rest and unmapped deload rejection, exact rep/RIR persistence, activation prerequisites/run slots, future editing, and resolved/in-session edit protection. `packages/frontend/src/views/ProgramsView.test.js` passed 3 tests including blank-set prefill, the edit/deload/confirm/activate journey, and disabled/enabled confirmation states. Full `npm test -- --runInBand` passed 20 suites / 96 tests; `npm run lint`, `npm run format:check`, `npx prettier --check packages/frontend/src/style.css`, `npm run build`, and editor diagnostics passed. Browser walkthrough, external PostgreSQL, and physical-device checks were not run; browser acceptance remains pending.

### WT-014: Implement program runs and flexible week progression

**Requirements:** PLN-02, SES-01, SES-02.
**Depends on:** WT-013.
**Owner:** tdd-developer.
**Acceptance:** Maintain one current program/run; allow out-of-order slots within the active week. Check rest days manually, resolve workout slots through finalization, and advance atomically only after all seven slots resolve. Prevent repeats/silent rewind. Offer stop, restart with the saved deload as a new run, or confirmed replacement while preserving prior history.
**Verification:** Domain/API tests cover every final-slot ordering, duplicate/concurrent resolutions, rest undo, prior-week edits, final deload, repeated restart instances, and replacement. Stub finalization inputs here; verify real integration in WT-023.
**WT-014 implementation evidence (2026-10-23):** Added authenticated current-run retrieval with the active week’s seven slots and training/deload type; transactional rest check/undo; and a workout-slot resolver for WT-023 to invoke with finalized outcomes. The earliest pending week is the current week, so out-of-order current-week resolutions are supported while duplicate, future-week, and prior-week transitions are rejected. Final deload resolution completes the run. Stop, fresh-run restart, and confirmed replacement preserve prior run/day rows; restart copies all saved weeks including the deload. Resolved and session-backed template days remain protected; unresolved future template slots remain editable after restart, and only pending slots in a current active run synchronize to edited day types, preserving old stopped-run state. No migration was needed. `packages/backend/test/programs.test.js` passed 23 tests, including all seven possible final slots, concurrent duplicate resolution, rest undo, out-of-order workout outcomes, prior-week protection, final deload, repeated restart, stop, explicit replacement, active-draft blocking, future-day edits, and retained prior slots. `npm run test:backend -- --runInBand` passed 14 suites / 91 tests; `npm run lint`, `npm run format:check`, and `git diff --check` passed. PGlite was used; external PostgreSQL and browser/UI validation were not run. Real session-finalization integration remains WT-023, and current-program presentation remains WT-015.

### WT-015: Implement Home, workout detail, and exercise information

**Requirements:** UI-01, UI-02, UI-04, PLN-02, CAT-01.
**Depends on:** WT-007, WT-008, WT-014.
**Owner:** tdd-developer; test-engineer for UI checks.
**Acceptance:** Show week/month calendar, expandable current-program ribbon with seven slots and distinct states, workout muscles/prescriptions, horizontal muscle pills, and exercise Info with Primary/Secondary/Tertiary roles. Provide Start/Resume navigation; fill actual-date history links as finalization/history become available.
**Verification:** Component/browser tests for collapse/expand, slot navigation, empty/error states, long labels and horizontal scroll, muscle role rendering, and mobile/desktop layout. Start/Resume integration is completed with WT-016/017; history links with WT-025.
**WT-015 implementation evidence (2026-10-23):** Replaced the Home placeholder with a week/month calendar, retryable current-run loading, and an expandable current-program ribbon showing all seven run slots and distinct workout/rest states. Workout slots link to a dedicated detail view that combines current run, program prescriptions, and catalog metadata; it displays target muscles, every prescribed set/type/rep range/RIR, role-tagged horizontal muscle pills, and Start/Resume navigation. Added exercise Info routing with catalog image and Primary/Secondary/Tertiary muscles. Component coverage is in `packages/frontend/src/views/HomeView.test.js` and `packages/frontend/src/router.test.js`; three isolated mocked-API browser tests are in `e2e/wt-015.spec.js`. Frontend Jest passed 6 suites / 26 tests; WT-015 Playwright passed 3 tests, including 390px and 1440px no-overflow checks. `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed. Start/Resume remains navigation only until WT-016/017 implement drafts/tracking; actual-date history links remain WT-025. No physical-device walkthrough was performed.

## Tracking and Calculations

### WT-016: Implement online drafts and conflict-safe session persistence

**Requirements:** SES-01, CFG-01, HIS-01.
**Depends on:** WT-005, WT-010, WT-014.
**Owner:** tdd-developer.
**Acceptance:** Start/resume one active draft per user with session/prescription snapshots and start-date timezone. Persist acknowledged changes, reject competing stale updates, and deduplicate retries. Recover after reload; preserve visible unsaved input on failure without claiming success. Enforce date/run eligibility server-side; finalization must recheck it transactionally.
**Verification:** API/component tests cover two-tab/device races, concurrent starts, idempotent saves, version conflicts, reload, connection failure/retry, midnight/timezone boundaries, and no draft entries in finished history. Do not add offline queues.
**WT-016 implementation evidence (2026-10-23):** Added migration 006 for optimistic session versions and migration 007 for user-scoped idempotency request records. Authenticated start/resume and draft retrieval build server-side exercise, prescription, equipment, unit, bodyweight, and timezone snapshots; ordered program exercise instances remain distinct even when they reference the same catalog exercise. Versioned saves acknowledge only committed changes, replay matching idempotency keys, reject stale writes with 409, and retain visible inputs for retry. Start and the transaction-aware finalization eligibility helper enforce active-run/current-slot and snapshotted local-date performance eligibility. Start/Resume now creates or resumes the server draft, and the tracker restores it after navigation/reload with explicit online save/error/retry states; no offline queue was added. `packages/backend/test/programs.test.js`, `packages/backend/test/app.test.js`, `packages/frontend/src/views/WorkoutDetailView.test.js`, `packages/frontend/src/views/WorkoutTrackerView.test.js`, and `packages/frontend/src/router.test.js` cover the focused behavior. `npm test -- --runInBand` passed 22 suites / 129 tests; `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed. No Playwright/browser check or physical-device validation was run. Real finalization remains WT-023 and the finished-history listing remains WT-025; integration tests verify finished sessions are no longer returned by active/by-ID draft recovery.

### WT-017: Implement manual tracking, row locks, units, and exercise navigation

**Requirements:** UI-03, CFG-01, SES-01, SES-02.
**Depends on:** WT-015, WT-016.
**Owner:** tdd-developer; test-engineer for UI checks.
**Acceptance:** Build image navigation, exercise/set position, Info/History actions, horizontally scrollable set grid, Standard/Warmup/Failure modal, actual weight/reps/RIR, and noninteractive Auto. Check saves/locks; uncheck unlocks and invalidates unfinished recommendations. Validate integer reps/RIR, failure RIR 0, and valid zero bodyweight added load. Persist exercise-unit overrides. Permit individual exercise skipping and continuing, but require partial finishing rather than normal completion.
**Verification:** Component/API tests for valid/invalid logs, no editing locked rows, uncheck/correct/recheck, failed-save state, keyboard/touch behavior, unit persistence, and skipped exercise state. Manual logging works when recommendation configuration is missing.
**WT-017 implementation evidence (2026-10-26):** Extended the existing tracker without replacing its page structure: exercise-image navigation, selected exercise/set position, Info/History actions, horizontally scrollable set rows, read-only Auto load/reps/RIR fields, and a Standard/Warmup/Failure dialog. Per-exercise unit preferences are loaded from the authenticated preference API; switching units preserves canonical kg values without frontend rounding. Checking a set saves explicit completion state and locks its editable controls; unchecking saves the correction and unlocks it. The API accepts explicit set types/check states, validates failure RIR and completed values, and retains legacy idempotency request hashes. Migration `008_session_exercise_skips.sql` persists individual skipped exercises so users can continue through later exercises. Missing recommendation data remains manual (`Auto load: Manual`) for WT-019; normal/partial finalization rules remain WT-023 integration. `packages/frontend/src/views/WorkoutTrackerView.wt017.test.js` covers navigation, positions, Auto fields, lock/unlock, unit persistence and precision, skip state, and type/RIR validation. Backend coverage is in `packages/backend/test/programs.test.js`. Full `npm test -- --runInBand` passed 23 suites / 137 tests; post-format focused tracker tests passed 2 suites / 8 tests and the backend programs suite passed 31 tests. `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed. Tests used isolated PGlite. No browser/Playwright or physical-device validation was run, as requested; external PostgreSQL was not exercised.

### WT-018: Implement recoverable session and rest timers

**Requirements:** TMR-01, UI-03, SES-01.
**Depends on:** WT-009, WT-017.
**Owner:** tdd-developer; test-engineer for browser behavior.
**Acceptance:** Track elapsed session/rest time by timestamps with pause/resume/reload recovery. Working/failure completion replaces rest countdown; warmups/unchecking do not start or rewind it. Provide start/pause/reset/skip/add/subtract controls, diminishing progress, and foreground tone. Pause/Resume applies to both timers; CSV rest values never override profiles.
**Verification:** Fake-clock numeric tests for elapsed/paused/reloaded timers, set types, category defaults, zero-boundary and time adjustments. Browser-check controls and foreground audio with user interaction; document background limitations.
**WT-018 implementation and test evidence (2026-10-27):** Added migration `009_session_timers.sql` with JSONB timer state on active workout drafts. The existing optimistic/idempotent draft save validates, hashes, persists, and returns timestamped timer state transactionally; legacy saves without the field leave it unchanged. `packages/frontend/src/timers.js` is the single ESM timer implementation, provided by `main.js` and injected into the tracker; test setup supplies the same module. The tracker includes profile-category durations, session/rest pause controls, reset/skip/30-second adjustment, diminishing progress, and a foreground-only completion tone. Working/failure sets start or replace rest; warmups and unchecking do not. `packages/frontend/src/timers.test.js`, `packages/frontend/src/views/WorkoutTrackerView.wt018.test.js`, and `packages/backend/test/programs.test.js` cover timestamp arithmetic, UI transitions, timer persistence/recovery, malformed timestamps, and idempotency conflicts. Full Jest passed 25 suites / 150 tests; full Chromium passed 7/7 with two workers and retries disabled, including login smoke and WT-018; serial WT-018 passed 3/3 and the pause/reload scenario passed on repeat. Changed-file ESLint, `npm run format:check`, `npm run build`, and `git diff --check` passed. `e2e/wt-018.spec.js` uses mocked API state to verify controls, acknowledged-state reload recovery, set triggers, foreground audio invocation, and no-overflow at 390px/1440px. User-reported manual frontend validation additionally confirmed timer state remained after reloading the page and the tone was audible. Backend persistence tests use isolated PGlite; the actual service/database used during the manual check was not recorded, and external PostgreSQL/physical-device checks were not exercised. Background/locked-device audio is not guaranteed by the browser.

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
