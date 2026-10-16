# Testing Guidelines

## Overview

This project emphasizes **Test-Driven Development (TDD)** as a core workflow pattern. Tests are not just validation tools - they are your roadmap for implementation and your safety net for refactoring.

The [project specification](project-overview.md) is the source of truth for product behavior. Reference its requirement IDs in test planning and coverage reports. This workspace has no application/test infrastructure yet; commands and endpoint examples below are conventions to verify after scaffolding, not executable capabilities today.

## Testing Scope

This project focuses on **unit tests**, **integration tests**, and **UI end-to-end tests**:

- ✅ **Backend Unit Tests**: Testing individual functions and API endpoints with Jest
- ✅ **Backend Integration Tests**: Testing API routes end-to-end with Supertest
- ✅ **Frontend Component Tests**: Testing Vue.js components with Vue Testing Library
- ✅ **UI End-to-End Tests**: Testing critical user journeys in the browser
- ✅ **Manual Browser Testing**: Exploratory checks and final workflow validation

**Why this scope?**

- Unit tests provide fast feedback on logic.
- Integration tests verify API behavior and data flow.
- UI end-to-end tests validate that critical user workflows actually work in the browser.
- Manual testing complements automation with exploratory validation.

## Testing Philosophy

### Tests Should Drive Development

1. **Write the test first** for each new behavior; read an existing failing test when repairing a regression
2. **Run the test** and explain why the intended assertion fails (Red); an unavailable environment is not a valid feature RED
3. **Implement** minimal code to pass (Green)
4. **Refactor** to improve quality
5. **Repeat** with the next test

### Tests Provide Specification

Each test describes:

- **What** the code should do
- **How** it should behave
- **When** it should succeed or fail
- **Why** certain decisions were made

## Backend Testing Strategy

### Test Structure

We use **Jest** and **Supertest** for API testing:

```javascript
describe("Feature Group", () => {
  describe("Specific Endpoint", () => {
    test("should behave in expected way", async () => {
      // Arrange: Set up test data
      // Act: Call the API
      // Assert: Verify results
    });
  });
});
```

### Test Categories

#### 1. Happy Path Tests

Test expected behavior with valid inputs:

```javascript
test("should create an exercise with a valid name", async () => {
  const response = await request(app)
    .post("/api/exercises")
    .send({ name: "Barbell squat" });

  expect(response.status).toBe(201);
  expect(response.body).toHaveProperty("id");
});
```

#### 2. Validation Tests

Test error handling with invalid inputs:

```javascript
test("should return 400 when exercise name is missing", async () => {
  const response = await request(app).post("/api/exercises").send({});

  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty("error");
});
```

#### 3. Edge Case Tests

Test boundary conditions:

```javascript
test("should handle an empty exercise name", async () => {
  const response = await request(app).post("/api/exercises").send({ name: "" });

  expect(response.status).toBe(400);
});
```

#### 4. Integration Tests

Test multiple operations together:

```javascript
test("should handle an exercise CRUD lifecycle", async () => {
  // Create
  const created = await request(app)
    .post("/api/exercises")
    .send({ name: "Barbell squat" });

  // Update
  const updated = await request(app)
    .put(`/api/exercises/${created.body.id}`)
    .send({ name: "Front squat" });

  // Verify update
  expect(updated.body.name).toBe("Front squat");

  // Delete
  await request(app).delete(`/api/exercises/${created.body.id}`);

  // Verify deletion
  const exercises = await request(app).get("/api/exercises");
  expect(exercises.body).not.toContainEqual(
    expect.objectContaining({ id: created.body.id }),
  );
});
```

## Frontend Testing Strategy

### Component and Integration Test Structure

We use **Vue Testing Library** to test Vue.js components, including components built with **PrimeVue**:

```javascript
import { render, screen } from "@testing-library/vue";
import PrimeVue from "primevue/config";
import Button from "primevue/button";
import ExerciseList from "./ExerciseList.vue";

test("should render workout exercises", () => {
  render(ExerciseList, {
    global: {
      plugins: [PrimeVue],
      components: { Button },
    },
  });

  const element = screen.getByRole("heading", { name: /exercises/i });
  expect(element).toBeInTheDocument();
});
```

### UI End-to-End Testing

The `test-engineer` owns Playwright authoring, execution, triage, and isolation checks. Use the requirement matrix below for critical journeys rather than a generic CRUD checklist. Deleting prescribed sets during a running workout is not a first-release capability.

Guidelines:

- Keep a small smoke suite and focused additional regression tests; do not impose a test-count cap that leaves required journeys uncovered
- Tests must be isolated from one another
- Prefer stable selectors based on role, label, or visible text
- Keep tests deterministic with controlled test data
- Avoid arbitrary waits; wait on visible UI state
- Keep one assertion intent per step for easier debugging

### Requirement Coverage Matrix

These are required test targets, not claims of tests already implemented. Track each target's real test file/scenario, assertion coverage, execution result, and remaining gap.

Use the [implementation backlog](implementation-backlog.md) for task IDs, completion dependencies, acceptance criteria, and verification ownership. The backlog's traceability table is planned delivery coverage, not evidence that tests exist or pass.

| Requirements   | Required behavior and regression cases                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-01         | Invite-only registration, admin catalog permissions, per-user data isolation, unauthorized access rejected by API                                                                                                                               |
| CFG-01, CAT-01 | Account unit defaults vs persistent exercise overrides; physical-load conversion; catalog mapping, muscle roles, missing factors, equipment inventory                                                                                           |
| IMP-01, IMP-02 | Parse supplied five-cycle CSV, metadata/header/continuation/rest rows, quoted and Unicode values, variable set counts, N+ failure ranges; preview partial import and row errors; block unsafe grouping, unmapped exercises, empty workouts      |
| PLN-01         | Manual appended deload required once before activation; future-program edits do not mutate session snapshots; no in-session substitution or structural edits                                                                                    |
| PLN-02         | Out-of-order days within active week; manual rest checks; automatic workout checks; all days resolved before advancement; restart creates new run with saved deload; replacement preserves history                                              |
| UI-01, UI-02   | Collapsing week/month calendar and current-program ribbon; actual-date links; target muscles, set prescriptions, horizontal muscle pills; Start/Resume                                                                                          |
| UI-03, UI-04   | Mobile exercise-image navigation, Info/History, grid scroll, type modal, disabled Auto, row lock/unlock, per-exercise units, metric filters and expandable histories                                                                            |
| SES-01         | Online draft recovery, failed-save retry without false success, duplicate-safe saves, tab/device conflicts, one retained-performance workout per start date/timezone, no backdating                                                             |
| SES-02         | Complete only when all required sets are checked; confirmed discard has no history/progression; emergency finish retains exercises with at least one checked working set and checked sets only; wholly skipped event has no performance metrics |
| TMR-01         | Pause/resume both timers, timestamp recovery, working/failure vs warmup triggers, countdown replacement, controls, progress/tone, profile rest categories                                                                                       |
| REC-01         | Numeric RIR-adjusted estimates, same-load lower-rep preference, below-range load reduction, midpoint fallback, 10% upward cap, no feasible load, low-confidence high reps, no rewriting checked sets                                            |
| REC-02         | One-dumbbell recommendation, one/two-dumbbell volume, unilateral convention, bodyweight snapshots, valid zero added load, assistance direction/ratio, missing factor fallback, nonpositive resistance handling                                  |
| LOAD-01        | Balanced plates with finite inventory, bar weight included, fewest plates, nearest feasible alternatives, unavailable plate pairs, below-bar rejection, kg/lb conversion                                                                        |
| HIS-01, HIS-02 | Frozen original metrics vs labeled weight/reps corrections used only for future suggestions; no finished-row unlocking; cross-program history; warmup/unchecked/skipped exclusions; retained emergency performance                              |
| UI-05          | Per-exercise RM/load/volume/reps charts, workout counts, volume totals, date filters, empty/error states, usable profile/gym/admin views                                                                                                        |

Use small deterministic numeric fixtures for formulas, units, side/dumbbell accounting, bodyweight/assistance, and plate inventories. Include boundary cases and an independently calculated expected result rather than using the production calculation to generate test expectations.

Planning decisions confirmed on 2026-10-16 add these explicit checks:

- ACC-01: admin bootstrap, privately shared expiring single-use invitation links, rejected expired/reused tokens, and concurrent redemption protection; no email-delivery service is required.
- IMP-01/PLN-01: exactly seven day slots per imported week and manual deload; reject activation with six/eight slots without imposing a six/seven-week program length.
- SES-02: skipping an individual exercise permits continuing with later exercises, but finalization must be partial/emergency, not normal completion; retain checked sets from exercises with at least one checked working set.
- REC-01/REC-02: the 10% upward cap uses effective resistance and the latest checked same-exercise working set, otherwise the latest retained historical reference with applicable corrections; never apply it directly to selected assistance.
- Delivery acceptance: record current iPhone Safari, Android Chrome, and desktop Chrome/Safari checks, staging smoke results, backup/restore evidence, and content/gym readiness gaps. Neutral development image placeholders are not proof that real assets or usage rights have been validated.

### Playwright Structure and Isolation

- Put reusable locators and interactions in domain page objects/helpers instantiated per test; keep scenario intent and outcome assertions in spec files.
- Prefer `getByRole`/`getByLabel`, then `data-testid`. Scope to exercise/set identity; avoid CSS chains, positional selectors, arbitrary sleeps, and network-idle as a completion signal.
- Use locator auto-waits, web-first assertions, and specific state/response waits. Set event waits before triggering their actions.
- Give each test separate browser context and owned workout data. Never share mutable pages, page objects, or records; await cleanup even on failure. Use a dedicated test database.
- Run changed tests individually, grouped, repeatedly with retries disabled, and with parallel workers where supported. Serial runs alone do not prove isolation.
- Capture traces/screenshots and useful request/server evidence without secrets. Clearly label mocked-network tests separately from real API/persistence integration.
- Validate primary mobile touch-sized viewports and responsive desktop layouts, including overflow and readable timers/inputs. Follow automation with focused manual browser checks; locked-screen/background sound is not guaranteed.

## Running Tests

The following commands are planned conventions. Confirm actual package scripts and prerequisites first; do not report a test suite as run before it exists.

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Specific Test File

```bash
npm test -- app.test.js
```

### Run Specific Test by Name

```bash
npm test -- --testNamePattern="should create an exercise"
```

### Run with Coverage

```bash
npm test -- --coverage
```

### UI E2E Command Convention

```bash
npm run test:ui
```

## Test-Driven Workflow with Copilot

### Step 1: Write and Run the Test First

For a new feature, first write a failing test from the agreed requirement. Run it, explain the missing behavior, and only then implement. When a failing test already exists, reproduce and explain that failure instead.

```text
You: "Explain what this test expects:
[paste test code]"

Copilot: "This test verifies that..."
```

### Step 2: Implement to Pass

```text
You: "Implement the POST /api/set endpoint to pass this test:
[paste test code]"

Copilot: [Provides implementation]
```

### Step 3: Verify

```bash
npm test -- --testNamePattern="should create a new set"
```

### Step 4: Handle Failures

```text
Test output:
  Expected: 201
  Received: 501

You: "The test expects 201 but returns 501. What's wrong with this code:
[paste current implementation]"

Copilot: "The endpoint returns 501 'Not implemented'. You need to..."
```

### Step 5: Iterate

Continue until the test passes, consider a scoped refactor, rerun tests, then move to the next failing behavior. Keep unrelated lint cleanup separate from failing-test repair.

## Common Testing Patterns

### Testing Async Operations

```javascript
test("should fetch exercise on mount", async () => {
  render(ExerciseList);

  const exercises = await screen.findByText(/exercise/i);

  expect(exercises).toBeInTheDocument();
});
```

### Mocking API Calls

```javascript
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve([{ id: 1, name: "Barbell squat" }]),
  }),
);

test("should display fetched exercises for the selected plan day", async () => {
  render(ExerciseList);
  await screen.findByText("Barbell squat");
  expect(fetch).toHaveBeenCalledWith("/api/exercises");
});
```

### Testing Error States

```javascript
test("should display error message on fetch failure", async () => {
  global.fetch = jest.fn(() => Promise.reject("API Error"));

  render(ExerciseList);

  const errorMessage = await screen.findByText(/error/i);
  expect(errorMessage).toBeInTheDocument();
});
```

## Debugging Failing Tests

Report expected vs observed behavior, the smallest reproduction, evidence, category (application code, test code, environment, or undetermined), confidence, and next action. A timeout alone is not an environment diagnosis. Preserve correct assertions; never skip tests, add retries, or raise timeouts just to hide a failure. Hand application defects to `tdd-developer`; keep Playwright repairs with `test-engineer`.

### 1. Read the Error Message Carefully

```text
Expected: 201
Received: 400

This tells you:
- The test expected a success status (201)
- The API returned a client error (400)
- Check validation logic
```

### 2. Use Console Logs Strategically

```javascript
test("debugging example", async () => {
  const response = await request(app)
    .post("/api/exercises")
    .send({ title: "Test" });

  console.log("Response:", response.status, response.body);
  // Now you can see what's actually being returned

  expect(response.status).toBe(201);
});
```

### 3. Ask Copilot for Help

```text
You: "This test is failing with this error: [paste error]
Here's the test: [paste test]
Here's my implementation: [paste code]
What's wrong?"
```

### 4. Isolate the Problem

Run just the failing test:

```bash
npm test -- --testNamePattern="specific failing test"
```

### 5. Check Test Assumptions

Verify:

- Is the test correct?
- Are imports working?
- Is the endpoint path correct?
- Is data persisting between tests?

## Test Organization Best Practices

### Group Related Tests

```javascript
describe('POST /api/exercises', () => {
  describe('validation', () => {
    test('requires title', ...);
    test('rejects empty title', ...);
  });

  describe('successful creation', () => {
    test('creates with valid data', ...);
    test('auto-generates ID', ...);
  });
});
```

### Use Descriptive Test Names

❌ **Vague:**

```javascript
test('works', ...);
test('handles error', ...);
```

✅ **Clear:**

```javascript
test('should create an exercise with a valid name', ...);
test('should return 400 when exercise name is missing', ...);
```

### Keep Tests Independent

Each test should:

- Set up its own data
- Clean up after itself
- Not rely on other tests

## Success Criteria

You understand testing when you can:

- ✅ Read a test and explain what it verifies
- ✅ Run tests and interpret failure messages
- ✅ Implement code to make failing tests pass
- ✅ Write new tests for new features
- ✅ Write UI tests for critical user journeys
- ✅ Use tests to catch regressions during refactoring
- ✅ Debug failing tests systematically

## Remember

> "Tests are not just about finding bugs - they are about confidence. When all
> tests pass, you know your code works as intended. When you refactor, tests
> ensure you have not broken anything. Tests are your safety net."

Happy testing!
