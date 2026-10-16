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
