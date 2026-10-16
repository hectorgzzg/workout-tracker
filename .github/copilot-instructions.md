# Copilot Instructions

## Project Context

- This is a full-stack workout tracker with a Vue frontend and an Express backend.
- The product is English and mobile-first; desktop is responsive support. The initial audience is approximately five invite-only users.
- This repository currently contains specifications, agent definitions, and a CSV sample, not runnable application packages or tests. Verify actual scripts and setup before executing documented conventions.
- The application helps users track training plans, exercises, workout sessions, sets, 1RM, RIR, rep ranges, and progressive overload.
- Work iteratively: make small changes, gather feedback, and validate behavior before moving on.
- Keep examples and implementation choices focused on this workout tracker and its Vue + Express stack.

## Documentation References

- [Project specification](../docs/project-overview.md): Canonical product requirements, stable requirement IDs, planned architecture, and deferred scope.
- [Testing guidelines](../docs/testing-guidelines.md): Test patterns and standards.
- [Workflow patterns](../docs/workflow-patterns.md): Development workflow guidance.
- When examples in referenced docs conflict with the workout tracker domain or the Vue + Express stack, follow the actual codebase and these project instructions.

## Product Invariants

- Follow the canonical specification and reference its requirement IDs in acceptance tests. Do not treat old session examples or generic CRUD suggestions as new product requirements.
- Import every CSV cycle as a training week; do not enforce a six/seven-week length or trust deload metadata. Preview row errors and partial imports; block unsafe grouping, unresolved catalog mappings, and empty workouts. Build one manual deload week before activation.
- One current program, one editable gym, and one active online session per user. Preserve history across replacement/restarts; restarts create new run instances using the configured deload.
- Program days are flexible slots, not fixed weekdays. Rest days are checked manually; workouts resolve on completion or confirmed emergency finishing. Advance only when all current-week days are resolved. No silent rewind or repeating a slot within a run.
- Calendar records actual workout dates. Enforce one retained-performance workout per start date in the snapshotted timezone; wholly skipped status events have no exercise-performance records.
- Persist online drafts for reload recovery, detect competing updates, and prevent duplicate saves. Drafts and ordinary discards do not appear in finished history or advance the program.
- Normal completion requires every required set checked. Emergency Finish Early / Skip Remaining retains an exercise with **at least one checked working set**, retains checked sets only, and discards unchecked logs. Resolve the day as partial/skipped, not fully completed.
- Actual inputs are weight, integer reps, and integer RIR 0-10. Standard/failure sets are working sets; warmups do not contribute performance metrics or start rest. Completed active rows lock until unchecked; only unfinished recommendations recalculate.
- Follow approved REC-01/REC-02 formulas and constraints rather than inventing training rules. Preserve exact CSV ranges, honor RIR, equipment availability and the 10% upward-load cap, and label high-rep estimates low-confidence.
- Support external, dumbbell, bodyweight, and assisted loads in the first release. Record one-dumbbell load; volume uses the correct dumbbell/side count. Missing bodyweight factors or machine ratios require manual fallback, not guessed coefficients.
- Profile units are defaults; tracker changes persist per exercise. Store physical loads canonically and snapshot prescriptions, bodyweight, factors, ratios, and units for historical consistency.
- Historical metrics use immutable original working-set values. Finished-session edits may correct weight/reps only; label and store corrections separately for future suggestions, never recompute past metrics from them.
- Gym settings include equipment increments, finite plate inventory, and bar weights. Barbell visualization must balance both sides, include the bar, minimize plate count, and require user choice for inexact targets.
- Profile rest defaults: upper compound 120s, lower compound 180s, upper/lower isolation 90s, core 60s. Ignore CSV rest fields; pause/resume both timers and recover via timestamps.
- Keep admin-managed catalog data and per-user records properly authorized. No password reset/email verification, offline/PWA guarantees, multiple concurrent programs, or in-session substitution in the first release.

## Development Principles

- **Test-Driven Development:** Follow the Red-Green-Refactor cycle: write a failing test, implement the smallest change that passes, then refactor.
- **Incremental Changes:** Prefer small, testable modifications over broad changes.
- **Systematic Debugging:** Treat test failures and runtime errors as evidence; identify the cause before changing code.
- **Validation Before Commit:** Run relevant tests and lint checks; commit only when all required tests pass and there are no lint errors.

## Testing Scope

Use unit tests, integration tests, and UI end-to-end tests together. Fast tests provide feedback during development; UI tests build confidence in critical user journeys.

- **Backend:** Use Jest and Supertest for API unit and integration tests.
- **Frontend:** Use Vue Testing Library for component behavior tests.
- **UI automation:** Use Playwright for critical user journeys.
- **Manual browser testing:** Use exploratory checks and visual validation to complement automated tests.

### Testing Approach by Context

- **Backend API changes:** Write Jest/Supertest tests first, run them to confirm they fail, implement the behavior, then refactor (Red-Green-Refactor).
- **Frontend component features:** Write Vue Testing Library tests first for component behavior, implement to pass, then refactor. Follow with manual browser testing for full UI flows.
- **Critical user journeys:** Have the test-engineer author and execute Playwright tests, including failure triage and isolation checks.
- Use the requirement coverage matrix in the testing guidelines, including CSV/deload, mobile navigation, online drafts, timers, assistance, plate loading, emergency retention, immutable metrics, unit overrides, and account isolation.
- Use accessibility-first selectors, reusable Playwright page objects, state-based waits, isolated data, and focused manual mobile validation after automation.

## Workflow Patterns

1. **TDD Workflow:** Write or fix tests → run and confirm failure → implement → confirm pass → refactor.
2. **Code Quality Workflow:** Run lint → categorize issues → fix systematically → re-run lint.
3. **Integration Workflow:** Identify the issue → debug → test → fix → verify end-to-end.
4. **UI Testing Workflow:** Define critical journeys → create UI tests → run → debug failures → validate coverage.

## Agent Usage

- **tdd-developer:** Use for implementation and unit/integration TDD cycles. Do not create or run Playwright UI tests in this mode.
- **code-reviewer:** Use to address lint errors and improve code quality.
- **test-engineer:** Owns all Playwright UI test authoring and execution, failure triage, and test isolation checks.

## Memory System

- **Persistent Memory:** This file (`.github/copilot-instructions.md`) contains foundational principles and workflows.
- **Working Memory:** `.github/memory/` contains development discoveries and reusable patterns. Read its [README](memory/README.md) for the structure and workflow.
- During active development, take notes in `.github/memory/scratch/working-notes.md` (not committed).
- At the end of a session, summarize key findings in `.github/memory/session-notes.md` (committed).
- Document recurring code patterns in `.github/memory/patterns-discovered.md` (committed).
- Consult relevant memory files when providing context-aware suggestions, and verify remembered patterns against current code and tests.

## Workflow Utilities

GitHub CLI commands are available in all modes:

```sh
gh issue list --state open
gh issue view <issue-number>
gh issue view <issue-number> --comments
```

- The main exercise issue has `Exercise:` in its title.
- Exercise steps are posted as comments on the main issue.
- Use these commands when `/execute-step` or `/validate-step` prompts are invoked.

## Git Workflow

- Use conventional commits, such as `feat:`, `fix:`, `chore:`, and `docs:`.
- Use feature branches named `feature/<descriptive-name>`.
- Stage all changes before committing with `git add .`.
- Push to the correct branch with `git push origin <branch-name>`.
