# Development Memory System

This directory helps the team retain useful discoveries from development instead of repeatedly rediscovering them. It captures project-specific patterns, decisions, and lessons, then makes them available to future contributors and AI-assisted work.

## Two Types of Memory

- **Persistent memory:** `.github/copilot-instructions.md` contains foundational project context, principles, and workflows. It is committed and applies across development sessions.
- **Working memory:** `.github/memory/` contains discoveries made while building the Workout Tracker App. Historical summaries and reusable patterns are committed; active scratch notes are local and ephemeral.

## Directory Structure

```text
.github/memory/
  README.md
  session-notes.md
  patterns-discovered.md
  scratch/
    .gitignore
    working-notes.md
```

- `session-notes.md` is a chronological record of completed sessions. Add concise summaries that may help someone working on related features later. This file is committed.
- `patterns-discovered.md` is a curated collection of reusable code patterns and decisions. Add learnings when they are likely to apply beyond one task. This file is committed.
- `scratch/working-notes.md` is a template for notes about the current, unfinished task. Update it as useful findings emerge; it is ignored by Git and is not committed.
- `scratch/.gitignore` keeps active scratch files out of commits. The ignore file itself is committed so the rule is shared.

## Using Memory in Development

At the start of relevant work, read this README and consult the existing session summaries and patterns that match the task. Use the scratch template for current work. Keep notes factual and compact: record what was tried, what the tests or runtime showed, decisions and their reasons, and anything a future contributor can reuse.

### TDD

During the Red-Green-Refactor cycle, use working notes to capture the behavior under test, the initial failing result, the smallest implementation that passed, and any design decision worth retaining. When the task is complete, summarize durable findings in `session-notes.md`; move a broadly reusable implementation convention to `patterns-discovered.md`.

### Linting and Type or Build Errors

Record recurring tool configuration, surprising diagnostics, and verified fixes in the active notes. Do not preserve routine one-off errors as long-term patterns. At the end of the session, add a pattern only when the resolution is generalizable and still applies to the current project.

### Debugging

Use working notes to track the minimal reproduction, the hypothesis being tested, observed evidence, root cause, and validated fix. A completed session summary should distinguish confirmed causes from guesses. Promote repeatable debugging or codebase discoveries to `patterns-discovered.md` when they will help future work.

## Completing a Session

Before ending a development session, review `scratch/working-notes.md` and:

1. Append a concise completed-session summary to `session-notes.md` with the task, findings and decisions, and outcome.
2. Add any reusable code pattern to `patterns-discovered.md` using its template.
3. Leave unrelated or temporary details in scratch only; scratch is not committed.
4. Commit the historical summary and reusable patterns with the task changes when appropriate.

`session-notes.md` is for completed session summaries and is committed as a historical record. `scratch/working-notes.md` is for active work and is deliberately not committed. Do not copy an entire scratch log into history; retain only useful conclusions.

## How AI Uses These Notes

The repository instructions direct AI assistants to consult relevant memory when making context-aware suggestions. At the start of a task, an assistant should use this README to understand the system, check relevant patterns and prior summaries, and use the scratch notes as context for active work. It should apply a remembered pattern only when it fits the current code and validate it against current implementation and tests; memory is guidance, not a substitute for verification. During the task, discoveries can be added to scratch, then distilled into committed history or reusable patterns when the work is complete.
