# Active Session Notes

Use this file for the current, unfinished task. It is ignored by Git and is not committed. At the end of the session, distill durable findings into `../session-notes.md` and reusable patterns into `../patterns-discovered.md`.

## Current Task

- WT-005: secure authentication and user authorization implemented and verified.

## Approach

- Wrote Supertest/PGlite acceptance tests first. The initial RED showed `/api/profile` returning 404 instead of requiring authentication; implemented the auth API and reran focused, migration, and full-suite checks.

## Key Findings

- Password hashes use Node `scrypt`; opaque session tokens are stored as SHA-256 digests with 12-hour expiration and server-side revocation.
- Production Pages/Render auth needs same-site custom HTTPS subdomains or a same-origin proxy to avoid Safari third-party-cookie blocking. Production cookies are host-only, Secure, HttpOnly, and SameSite=Lax.
- `express-rate-limit` uses a process-local store; configure one backend instance until shared storage is added. `TRUST_PROXY_HOPS` must match the trusted host proxy chain.
- The existing PGlite migration adapter required multi-statement handling for the new ordered migration. The external PostgreSQL service and browser auth journeys remain unverified.

## Decisions Made

- Invitation/account bootstrap remains WT-006 and auth UI remains WT-007. No password reset or email verification was added.
- Unsafe API methods require an exact allowlisted Origin; credentialed CORS never uses a wildcard.

## Blockers

- None for WT-005. WT-004 still awaits its first hosted CI run.

## Next Steps

- WT-006: implement secure admin bootstrap and expiring single-use invitation onboarding.
- Preserve the noted PostgreSQL, Playwright, and horizontal-scaling follow-ups where relevant.

## Notes

- Initial focused test observed the intended RED (404 rather than 401). WT-005 tests passed 13/13; full Jest passed 10 suites / 39 tests. Lint, formatting, frontend build, editor diagnostics, and `git diff --check` passed.
- Playwright auth UI testing was not run; authentication UI is WT-007 and browser-test execution remains owned by test-engineer.
