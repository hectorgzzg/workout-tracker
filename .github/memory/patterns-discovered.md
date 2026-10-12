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