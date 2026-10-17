# Workout Tracker

Mobile-first workout tracking for a small invite-only group. This repository is being built incrementally; only the local frontend/backend baseline exists so far.

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

## Checks

```sh
npm run lint
npm run format:check
npm run build
```

## Automated tests

```sh
npm test
npm run test:backend
npm run test:frontend
npm run test:e2e
```

Jest runs backend tests in Node and Vue component tests in jsdom. WT-003 schema integration tests use a fresh embedded PostgreSQL engine per test. Each test gets its own data factory; register persisted-record cleanup with `registerTestCleanup` so cleanup runs after each test, including failed assertions. Tests that connect to a shared PostgreSQL test service must use a dedicated `TEST_DATABASE_URL` pointing only to `workout_tracker_test`. Copy `.env.test.example` to `.env.test` when that service is available. Destructive cleanup helpers reject any other test database name and reject the reserved name if it also appears in `DATABASE_URL`, regardless of host or URL alias; do not put production or personal database URLs in test environment files.

Playwright starts the backend at `127.0.0.1:3101` and frontend at `127.0.0.1:5174`, then stops both after the run. Override ports with `PLAYWRIGHT_BACKEND_PORT` and `PLAYWRIGHT_FRONTEND_PORT` if a port is occupied; the runner never reuses an existing server. Install its browser once with `npx playwright install chromium`. Traces, screenshots, videos, and the HTML report are written under `test-results/` and `playwright-report/`; these outputs are ignored by Git. Browser specs belong to the test-engineer and should use separate browser contexts and test-owned data.

The backend currently exposes only a process health endpoint; PostgreSQL schema/migration infrastructure is in place, while product APIs are implemented in later backlog tasks.
