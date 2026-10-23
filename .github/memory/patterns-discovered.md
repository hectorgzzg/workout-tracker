# Patterns Discovered

Collect verified, reusable conventions from the Workout Tracker App here. Prefer patterns that solve a recurring problem or clarify a project-specific decision. Confirm a pattern still matches the current implementation before applying it.

## Pattern Template

### <Pattern name>

**Context:** <Where and when this applies>

**Problem:** <The ambiguity or failure this pattern addresses>

**Solution:** <The recommended convention and why>

**Example:**

```js
// Add a small, representative example.
```

**Related files:** <Relevant paths>

---

## Service initialization: empty array vs null

**Context:** Initializing or returning values from a service that works with workout data.

**Problem:** An absent collection and a missing individual record represent different states. Treating both as `null` makes callers add unnecessary checks and can blur the meaning of a lookup result.

**Solution:** Use an empty array for a collection with no results, and `null` for a singular optional result that was not found. Callers can iterate collections directly while explicitly handling an absent individual record.

**Example:**

```js
const sets = await setService.listForWorkout(workoutId); // [] when there are no sets
const set = await setService.findById(setId); // null when the set does not exist
```

**Related files:** Service modules and their callers that list or retrieve workouts, exercises, sessions, or sets.

---

## Test database cleanup guard

**Context:** Tests that may create or delete persisted workout data.

**Problem:** A test cleanup command must never fall back to an application or personal database URL when test configuration is missing or misdirected.

**Solution:** Require an explicit `TEST_DATABASE_URL` with the exact dedicated database name, reject that reserved database name if it also appears in `DATABASE_URL` regardless of host or URL alias, and call destructive cleanup only after validation. Register per-test cleanup callbacks and run them after each test in reverse registration order.

**Related files:** `packages/backend/test/support/database.js`, `packages/backend/test/support/cleanup.js`, and `packages/backend/test/setup.js`.

---

## PostgreSQL migration and ownership boundary

**Context:** Incremental persistence schema for user-owned workout data and historical performance.

**Problem:** Application checks alone cannot prevent cross-user references, migration races, or accidental rewriting of finished performance.

**Solution:** Keep ordered SQL migrations transactional with a PostgreSQL advisory lock and applied-migration ledger. Use composite `(user_id, id)` foreign keys for owned relationships, distinct template/run identities, canonical `_kg` load columns, and separate correction rows. Restrict seed commands to explicitly named local dev/test databases.

**Related files:** `packages/backend/src/persistence/`, `packages/backend/migrations/001_workout_tracker.sql`, and `packages/backend/test/persistence/schema.test.js`.

---

## Transactional idempotent creation

**Context:** Retriable API operations that create a parent record and multiple related rows.

**Problem:** A client may retry after a successful commit if the response is lost, while a partial write must never be mistaken for a completed operation.

**Solution:** Hash the normalized request, scope an idempotency key to the authenticated user, and store the key/hash/result reference in the same transaction as all created rows. Same-key/same-hash retries return the original result; same-key/different-hash requests conflict. Rollback removes both the created hierarchy and its ledger entry.

**Related files:** `packages/backend/src/programs.js`, `packages/backend/migrations/005_program_import_requests.sql`, and `packages/backend/test/programs.test.js`.
