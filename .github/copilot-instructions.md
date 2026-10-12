# Copilot Instructions

## Project Context

- This is a full-stack workout tracker with a Vue frontend and an Express backend.
- The application helps users track training plans, exercises, workout sessions, sets, 1RM, RIR, rep ranges, and progressive overload.
- Work iteratively: make small changes, gather feedback, and validate behavior before moving on.
- Keep examples and implementation choices focused on this workout tracker and its Vue + Express stack.

## Documentation References

- [Project overview](../docs/project-overview.md): Architecture, technology stack, and repository structure.
- [Testing guidelines](../docs/testing-guidelines.md): Test patterns and standards.
- [Workflow patterns](../docs/workflow-patterns.md): Development workflow guidance.
- When examples in referenced docs conflict with the workout tracker domain or the Vue + Express stack, follow the actual codebase and these project instructions.

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
- Test workout plans, exercises, sessions, sets, and training progress behavior as appropriate to the change.

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
