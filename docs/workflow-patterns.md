# Agentic Development Workflow Patterns

## Overview

Work in small, evidence-driven cycles against the [Workout Tracker specification](project-overview.md). The mobile experience is primary; desktop is responsive support. Reference requirement IDs in acceptance tests and coverage reports.

The repository currently contains requirements, agent definitions, and a CSV sample, not a runnable app. Commands below are intended conventions to verify after scaffolding, not proof that scripts or suites exist.

## Core Principles

1. **Iterative Problem Solving**: Break large problems into small, verifiable steps
2. **Continuous Validation**: Test after every change to maintain confidence
3. **Feedback-Driven**: Let tests, compilers, and runtime errors guide your next action
4. **Incremental Progress**: Small, working steps beat large, broken changes
5. **Human-in-the-Loop**: You remain the decision-maker; AI is your tool
6. **Critical-Path Coverage**: Protect key user journeys with automated UI tests

---

## Pattern 1: Test-Driven Development (TDD) Cycle

### The Red-Green-Refactor Loop

```
1. RED    → Write a test FIRST for new behavior; reproduce an existing failure for a repair
2. GREEN  → Write minimal code to pass
3. REFACTOR → Improve code quality
4. REPEAT → Move to next test
```

### Workflow with AI

1. **Write and Understand the Test**
   - For a new feature, write the test before implementation; for a repair, read the existing failing test
   - Run it and confirm failure for the expected behavior, not an environment blocker
   - Ask Copilot: "Explain what this test expects"
   - Identify the specific requirement

2. **Implement Minimally**
   - Ask Copilot: "Implement just enough to make this test pass"
   - Avoid over-engineering
   - Focus on the immediate requirement

3. **Verify**

   ```bash
   npm test -- --testNamePattern="specific test name"
   ```

4. **Refactor if Needed**
   - Ask Copilot: "How can I improve this code?"
   - Ensure tests still pass after refactoring

5. **Move to Next Test**
   - Commit working code
   - Tackle next failing test

## Pattern 2: Compilation/Lint Error Resolution Loop

### The Error-Fix-Verify Cycle

```
1. RUN LINT → Identify errors
2. ANALYZE  → Understand each error
3. FIX      → Correct one error at a time
4. VERIFY   → Re-run to confirm fix
5. REPEAT   → Until clean
```

### Workflow with AI

1. **Run Linter**

   ```bash
   npm run lint
   ```

2. **Triage Errors**
   - Copy error messages to Copilot
   - Ask: "Explain these ESLint errors and suggest fixes"

3. **Fix Systematically**
   - Fix one category at a time (e.g., all unused vars first)
   - Ask Copilot: "Fix all unused variable errors in this file"

4. **Verify Each Fix**

   ```bash
   npm run lint
   ```

5. **Commit When Clean**
   - Don't move forward with lint errors
   - Clean code is a prerequisite for the next step

### Example ESLint Workflow

```
Terminal Output:
  3:7  error  'unusedVar' is assigned but never used  no-unused-vars
  12:9 warning  Unexpected console statement          no-console

You: "I have these ESLint errors. Help me fix them appropriately."

Copilot: [Suggests removing unused variable or using it appropriately]
         [Suggests replacing console.log with proper logging]

You: "Apply these fixes."
[Copilot edits code]

You: "Run lint again to verify."
```

---

## Pattern 3: Requirement-Driven Implementation

### The Plan-Test-Implement-Verify Cycle

```
1. PLAN    → Break feature into steps
2. RED     → Write and run the smallest behavior test FIRST
3. GREEN   → Implement the minimum and rerun the same test
4. REFACTOR → Simplify the touched behavior and rerun tests
5. REPEAT  → Next step
```

### Workflow with AI

1. **Create Implementation Plan**

   ```
   You: "Implement SES-02 emergency finishing. Create a test-first plan."

   Copilot:
   1. Write a test retaining an exercise with one checked working set.
   2. Verify unchecked logs and exercises with no working set are excluded.
   3. Run the tests and explain the intended RED failures.
   4. Implement the smallest fix; rerun to GREEN.
   5. Refactor if useful; rerun tests.
   6. Hand off partial calendar/progression UI checks to test-engineer.
   ```

2. **Implement Step-by-Step**

   ```
   You: "Write and run the SES-02 retention test before implementation."
   [Copilot writes the test, reproduces RED, and explains why it fails]

   You: "Implement only enough to pass that test, then run it again."
   [Copilot implements and verifies GREEN]

   You: "Consider a scoped refactor and rerun the same tests."
   ```

3. **Test Each Step**
   - Manual testing with API client
   - Unit tests
   - Integration tests

4. **Iterate Based on Feedback**

   ```
   Terminal: Error: Cannot read property 'id' of undefined

   You: "I'm getting this error. What's wrong?"
   Copilot: [Diagnoses null check issue]

   You: "Fix this null check issue."
   ```

### Benefits of This Approach

- ✅ Smaller changes are easier to debug
- ✅ Each step can be tested independently
- ✅ Clear progress markers
- ✅ Easy to roll back if needed
- ✅ Builds understanding incrementally

---

## Pattern 4: Integration Testing and Debugging

### The Run-Observe-Fix-Rerun Cycle

```
1. RUN APP     → Start application
2. OBSERVE     → Test functionality manually
3. IDENTIFY    → Find bugs or issues
4. FIX         → Correct specific problem
5. RERUN       → Verify fix works
6. REPEAT      → Until fully functional
```

### Workflow with AI

1. **Start Application**

   ```bash
   npm run start
   ```

2. **Test User Flows**
   - Import/preview the CSV and configure the manual deload
   - Start/resume a workout and log actual weight, reps, and RIR
   - Unlock/correct an active set and verify unfinished suggestions
   - Pause/resume timers and complete or emergency-finish a workout
   - Verify calendar progression, immutable history, and API failure behavior

3. **Document Issues**

   ```
   You: "When I uncheck an active workout set, its inputs stay locked. Here's the relevant code:
   [paste active-set handler]

   What's wrong?"

   Copilot: "Let's reproduce the UI-03 unlock expectation before changing the handler."
   ```

4. **Fix and Retest**

   ```
   You: "Write the regression test, reproduce RED, then implement the minimal unlock fix."
   [Copilot verifies RED, implements the fix, and verifies GREEN]

   You: "Now verify unchecking unlocks inputs and recomputes only unfinished suggestions."
   [Verify fix works]
   ```

5. **Test Integration Points**
   - Does frontend properly handle backend errors?
   - Are loading states shown?
   - Does data persist across page refreshes? (if applicable)

6. **Capture Regression Candidate Flows**
   - Convert repeated manual checks into UI automated tests for critical paths

---

## Pattern 5: UI Test Automation and Stabilization

### The Define-Automate-Stabilize Cycle

```
1. DEFINE     → Identify critical user journey
2. AUTOMATE   → Implement browser test for the journey
3. EXECUTE    → Run test and capture failures
4. DIAGNOSE   → Classify failure (product code, test code, environment)
5. STABILIZE  → Fix flakiness and improve selectors/waits
6. REPEAT     → Expand coverage to next journey
```

### Workflow with AI

1. **Define Critical Journeys**
   - Use the requirement coverage matrix in the testing guidelines
   - Include CSV/deload setup, mobile tracking, timers, load recommendations, plate visualization, emergency retention, and history corrections
   - Cover account boundaries, unit overrides, flexible scheduling, restart, and API failure states

2. **Generate Test Skeletons**

   ```
   You: "Have test-engineer add focused UI tests for the affected requirement IDs.
   Use page objects for interactions, spec assertions for outcomes, accessible selectors,
   state-based waits, and per-test data. Validate mobile and desktop layouts."
   ```

3. **Run and Triage Failures**

   ```bash
   npm run test:ui
   ```

4. **Stabilize and Re-run**
   - Ask Copilot to replace brittle selectors
   - Add state-based waiting instead of fixed delays
   - Classify application, test, and environment failures using actual evidence
   - Run individually, grouped, repeatedly without retries, and in parallel where supported
   - Follow automation with focused manual mobile browser validation; report unverified checks

5. **Promote to Smoke Suite**
   - Keep a small fast set for CI gating
   - Keep deeper journeys in a broader regression suite

---

## Pattern 6: Systematic Debugging

### The Isolate-Reproduce-Fix Cycle

```
1. ISOLATE     → Narrow down problem location
2. REPRODUCE   → Create minimal test case
3. HYPOTHESIZE → Form theory about cause
4. TEST        → Verify hypothesis
5. FIX         → Implement solution
6. VALIDATE    → Confirm fix works
```

### Workflow with AI

1. **Describe the Problem Clearly**

   ```
   You: "The toggle function always sets completed to true,
   even for completed sets. Here's the code:
   [paste toggle function]"
   ```

2. **Ask for Analysis**

   ```
   You: "Analyze this code and identify why it doesn't toggle properly."

   Copilot: "The bug is that the handler always assigns true.
   It should invert the current value: set.completed = !set.completed"
   ```

3. **Create and Run a Regression Test Before the Fix**

   ```
   You: "Write a test that verifies active-set completion toggles both ways, then run it to confirm RED."
   ```

4. **Implement and Verify**
   ```
   You: "Apply the smallest fix, run the same test to GREEN, and refactor only if useful."
   ```

## Product-Specific Delivery Order

The [implementation backlog](implementation-backlog.md) is the task-level execution plan: WT-001 through WT-032, with dependencies, requirement links, acceptance criteria, and verification steps. Start at WT-001 and update task evidence/status as work is completed. The stages below are an overview, not a replacement for those cards.

Build vertical slices using the same test-first cycle; this is an implementation order, not a reduction of first-release scope:

1. Establish the Vue/Express test infrastructure, invite-only identity, authorization, and isolated test database.
2. Implement the admin catalog, user/gym configuration, unit overrides, CSV preview/partial import, and manual deload activation.
3. Implement program/run instances, flexible weekly progression, calendar links, and mobile workout detail/navigation.
4. Implement online draft recovery, set logging/locking, session/rest timers, normal completion, discard, and emergency retention.
5. Implement approved external/bodyweight/assisted estimates and finite-inventory plate visualization with numeric fixtures.
6. Implement immutable metrics, labeled future-only corrections, cross-program history, dashboard filters/charts, and full critical-journey validation.

Keep original historical values separate from corrections. Do not replace the agreed emergency rule with all-or-nothing exercise retention: **one checked working set is sufficient**, and only checked sets are retained. Active drafts stay outside finished history; a wholly skipped workout creates only a status event.

Lint remains a separate workflow. During failing-test repair, do not remove console statements or unused variables unless they demonstrably cause that test command to fail. Do not commit, push, or change branches without an explicit user request.

---

## Best Practices for AI-Assisted Workflows

### DO ✅

- **Be Specific**: "Fix the toggle bug in line 45" vs "Fix my code"
- **Provide Context**: Share relevant code, error messages, test output
- **Ask for Explanation**: "Why does this test fail?" before "Fix this test"
- **Verify Each Step**: Run tests/app after each change
- **Commit Frequently**: Save working states
- **Break Down Problems**: Tackle one issue at a time

### DON'T ❌

- **Don't Accept Blindly**: Understand what AI suggests
- **Don't Skip Testing**: Never commit untested code
- **Don't Batch Changes**: Multiple changes = harder debugging
- **Don't Ignore Errors**: Each error is valuable feedback
- **Don't Rush**: Slow and steady wins the race

---

## Measuring Success

You're mastering agentic workflows when:

- ✅ You naturally break problems into small steps
- ✅ You run tests frequently and automatically
- ✅ You understand error messages and use them to guide fixes
- ✅ You can explain each change you make
- ✅ You commit working code regularly
- ✅ You catch bugs early through continuous testing
- ✅ You protect critical UI journeys with reliable automated browser tests
- ✅ You collaborate effectively with AI by providing good context

---
