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

## Checks

```sh
npm run lint
npm run format:check
npm run build
```

The backend currently exposes only a process health endpoint. Product APIs, persistence, authentication, and automated test infrastructure are subsequent backlog tasks.
