# Active Session Notes

Use this file for the current, unfinished task. It is ignored by Git and is not committed. At the end of the session, distill durable findings into `../session-notes.md` and reusable patterns into `../patterns-discovered.md`.

## Current Task

- WT-006: secure initial-admin bootstrap and invitation onboarding.

## Approach

- Added Supertest/PGlite tests before implementation. Invitation routes initially returned 404; the focused onboarding suite now passes. Bootstrap tests initially failed because the CLI helper did not exist, then passed after adding the guarded operation.

## Key Findings

- The first admin is provisioned by a database CLI operation that serializes with a PostgreSQL advisory transaction lock and refuses after any admin exists.
- Invitation links use 32 random bytes; the database stores only SHA-256 token hashes. Redemption locks the invitation row and atomically creates the member/profile and consumes the link.
- Invitation lifetime defaults to seven days and accepts 1-720 hours. Bootstrap, signup, and invite creation never log passwords or raw invitation tokens.
- PGlite tests exercise migration 003 and parallel redemption/bootstrap; an external PostgreSQL service and browser invitation journey remain unverified.

## Decisions Made

- Bootstrap credentials are provided by operator environment variables, not command-line arguments or a public endpoint. Registration links are generic bearer links, privately shared by admins without email delivery.
- Registration passwords require 12-256 characters. Signup and invitation creation are rate-limited by client IP using the existing process-local limiter convention.
- Unsafe API methods require an exact allowlisted Origin; credentialed CORS never uses a wildcard. No password reset or email verification was added.

## Blockers

- test-engineer browser validation of invitation-to-registration/sign-in navigation remains pending; frontend onboarding UI belongs to WT-007.
- WT-004 still awaits its first hosted CI run.

## Next Steps

- Hand off invitation-to-registration/sign-in browser validation to test-engineer once UI routes exist in WT-007.
- External PostgreSQL validation remains a separate environment check.

## Notes

- Invitation API RED returned 404. Bootstrap RED failed because the helper was absent. Focused API suite passed 24/24; backend passed 9 suites / 49 tests; full Jest passed 10 suites / 50 tests.
- Lint, formatting, build, editor diagnostics, and `git diff --check` passed. CLI guard smoke stopped safely without `DATABASE_URL`.
- No Playwright tests were authored or run; browser testing remains owned by test-engineer and depends on WT-007 UI routes.
