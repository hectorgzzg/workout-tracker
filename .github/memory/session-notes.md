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
