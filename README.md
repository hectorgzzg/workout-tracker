# Workout Tracker

Mobile-first workout tracking for a small invite-only group. The PostgreSQL foundation, secure invite-only accounts, and responsive application shell are in place; workout features remain in progress.

## Requirements

- Node.js 22.12 or newer in the 22.x line, or Node.js 24.x
- npm 11.6.1 (the version recorded in `package.json`)

Node 24 is selected for local development (`.nvmrc`). Node 22.12+ is also supported for compatible environments.

## Local setup

```sh
nvm install
nvm use
npm install
cp .env.example .env
```

The example environment file contains local-only backend bind settings. Do not put credentials or production values in committed files.

## Run

Start the backend first; the frontend starts after the backend health endpoint responds:

```sh
npm run dev
```

The frontend is served at <http://localhost:5173>; the backend health endpoint is <http://127.0.0.1:3000/health>.

Run either workspace independently with `npm run start:frontend` or `npm run start:backend`.

## Local database

Install/start PostgreSQL locally and create `workout_tracker_dev`. The committed `.env.example` points `DATABASE_URL` at that local database. Apply schema migrations and add the development-only catalog fixture with:

```sh
npm run db:migrate --workspace=@workout-tracker/backend
npm run db:seed --workspace=@workout-tracker/backend
```

The seed command only accepts `workout_tracker_dev` or `workout_tracker_test`, and rejects a test URL that aliases `DATABASE_URL`. Migrations are transactional and safe to rerun. Add later schema changes as new ordered SQL migration files; do not edit an already-applied migration.

## Authentication deployment

WT-005 uses opaque, random session cookies; only SHA-256 token hashes are stored
in PostgreSQL. Passwords use Node.js `scrypt`. The cookie is host-only,
`HttpOnly`, and `SameSite=Lax`; production requires `Secure`. Configure
`FRONTEND_ORIGINS` as a comma-separated list of exact origins (no paths or
wildcards), and configure `TRUST_PROXY_HOPS` to match the trusted hosting proxy
chain so login throttling sees client IPs.

For the planned GitHub Pages + Render deployment and Safari support, use custom
HTTPS subdomains under the same registrable domain, such as
`app.example.com` and `api.example.com`. The cross-origin fetch must send
credentials; the API returns credentialed CORS headers only for the configured
frontend origin. Unsafe API methods require that exact `Origin`, providing the
CSRF defense. The default `github.io` and `onrender.com` domains are cross-site;
do not use them for cookie authentication in production. If same-site custom
domains are unavailable, put the API behind a same-origin proxy instead.

The frontend uses hash-based routes so invitation links and refreshes work on
static hosting without a rewrite rule. For a production static build, set
`VITE_API_ORIGIN` to the API origin (for example, `https://api.example.com`)
before building. During local Vite development, `/api` is proxied to
`http://127.0.0.1:$PORT` (default port `3000`); set `VITE_API_PROXY_TARGET` to
override that target when running the backend elsewhere.

The default login limiter allows 10 attempts per IP per 15 minutes using the
process-local store from `express-rate-limit`; keep one backend instance until a
shared limiter store is configured before scaling horizontally. Never log
passwords, cookies, invitation tokens, or database credentials.

Provision the first administrator from a trusted operator environment after
migrations are applied. Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`
in the environment or ignored local `.env` file, and optionally set
`INITIAL_ADMIN_DISPLAY_NAME`. Do not pass the password as a command-line
argument or commit these values. Run:

```sh
npm run auth:bootstrap-admin --workspace=@workout-tracker/backend
```

The command uses `DATABASE_URL`, creates the admin and profile atomically, and
refuses to run once an admin exists. Passwords must contain 12-256 characters.

Admins create private registration links through the authenticated API. Each
link contains a random single-use token; only its SHA-256 hash is stored. Links
expire after seven days by default. Set `INVITATION_TTL_HOURS` to an integer
from 1 to 720 to change the lifetime. Registration requires a valid link and
creates a member account/profile. Registration and invitation creation are
rate-limited per client IP (10 per 15 minutes and 20 per hour by default).
These use the process-local `express-rate-limit` store, so configure a shared
store before running multiple backend instances.

## Checks

```sh
npm run lint
npm run format:check
npm run build
```

GitHub Actions runs these checks and the Jest suites on pushes to `main`, pull
requests, and manual dispatch. A separate Chromium job starts its own backend
and frontend through Playwright; it does not connect to PostgreSQL or deploy the
application. CI requires no repository secrets and does not read `.env` or
`.env.test`. Jest schema tests use isolated in-process PGlite databases. Keep
real credentials out of test configuration and diagnostics. On browser-smoke
failure, CI retains the Playwright report, screenshots, traces, and videos for
seven days; the current smoke uses no personal workout data. Review test data
before adding scenarios that could place personal data in these artifacts.

## Automated tests

```sh
npm test
npm run test:backend
npm run test:frontend
npm run test:e2e
```

Jest runs backend tests in Node and Vue component tests in jsdom. WT-003 schema integration tests use a fresh embedded PostgreSQL engine per test. Each test gets its own data factory; register persisted-record cleanup with `registerTestCleanup` so cleanup runs after each test, including failed assertions. Tests that connect to a shared PostgreSQL test service must use a dedicated `TEST_DATABASE_URL` pointing only to `workout_tracker_test`. Copy `.env.test.example` to `.env.test` when that service is available. Destructive cleanup helpers reject any other test database name and reject the reserved name if it also appears in `DATABASE_URL`, regardless of host or URL alias; do not put production or personal database URLs in test environment files.

Playwright starts the backend at `127.0.0.1:3101` and frontend at `127.0.0.1:5174`, then stops both after the run. Override ports with `PLAYWRIGHT_BACKEND_PORT` and `PLAYWRIGHT_FRONTEND_PORT` if a port is occupied; the runner never reuses an existing server. Install its browser once with `npx playwright install chromium`. Traces, screenshots, videos, and the HTML report are written under `test-results/` and `playwright-report/`; these outputs are ignored by Git. Browser specs belong to the test-engineer and should use separate browser contexts and test-owned data.

The backend exposes health, login/logout, and the authenticated current-profile
API. Other product APIs are implemented in later backlog tasks.
