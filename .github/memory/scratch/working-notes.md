# Active Session Notes

Use this file for the current, unfinished task. It is ignored by Git and is not committed. At the end of the session, distill durable findings into `../session-notes.md` and reusable patterns into `../patterns-discovered.md`.

## Current Task

- WT-001: establish the monorepo and reproducible local development baseline.

## Approach

- Use npm workspaces with Vue/Vite and Express; validate clean install, lint/format/build, backend health, and real browser rendering.

## Key Findings

- Repository began with specifications/agents/CSV only; Node 24.11.0 and npm 11.6.1 were installed.
- `npm ci`, lint, format check, and frontend production build passed; zero vulnerabilities reported.
- Backend health, environment port override, Vite-served frontend modules, and headless Chrome rendering passed.

## Decisions Made

- Use npm workspaces and Node 22.12+ / 24.x support; `.nvmrc` selects Node 24.
- Use ESLint 10 and restrict formatter globs to scaffold-owned source/config/readme files.
- Load safe root `.env` settings with Node's native optional env-file support.

## Blockers

- None for WT-001. No application features or test infrastructure are claimed.

## Next Steps

- Proceed to WT-002 only when requested; it depends on WT-001 and owns automated test infrastructure.

## Notes

- Combined dev servers remain running: frontend http://127.0.0.1:5173/ and backend http://127.0.0.1:3000/health.
- Existing `.vscode/settings.json` user modification was preserved.
