# Workout Tracker Specification

## Status and Scope

This is the canonical product specification agreed on 2026-10-15, with planning decisions confirmed on 2026-10-16. Requirement IDs below connect implementation and tests to the clarified behavior. Later answers supersede earlier discussion, particularly emergency finishing and historical corrections.

The [implementation backlog](implementation-backlog.md) breaks these requirements into dependency-ordered tasks, acceptance criteria, and verification steps. It tracks planned work, not implemented capabilities.

The workspace currently contains documentation, Copilot agent definitions, and a sample CSV, not an implemented application, package scripts, database, or executable test suites. All application capabilities below are requirements, not claims of existing functionality.

The first release serves approximately five users. It includes the screens and calculations below, including assisted/bodyweight recommendations and barbell plate visualization. The product is **Workout Tracker**, English, mobile-first, with a simple temporary logo and responsive desktop support. It is a usable tracking application, not a marketing landing page.

## Planned Architecture

| Area                   | Planned technology                                        |
| ---------------------- | --------------------------------------------------------- |
| Frontend               | Vue, Pinia, Vue Router, PrimeVue in `packages/frontend/`  |
| Backend                | Node.js and Express in `packages/backend/`                |
| Persistence            | PostgreSQL on Neon                                        |
| Testing                | Jest + Supertest, Vue Testing Library, Playwright         |
| Quality and automation | ESLint, GitHub Actions; GitHub Codespaces for development |
| Hosting                | GitHub Pages frontend, Render backend, Neon database      |

Validate routing, API origins, authentication, and deployment constraints when scaffolding; they are not configured yet. Discover actual scripts after setup rather than assuming `npm test` or `npm run test:ui` already exists. Follow [testing guidelines](testing-guidelines.md) and [workflow patterns](workflow-patterns.md).

## Accounts and Configuration

### ACC-01: Accounts and Privacy

- Invite-only email/password registration. An admin manages the shared exercise catalog; users manage only their own profile, gym, programs, drafts, and history.
- Provision the first admin securely during setup. Admins generate expiring, single-use registration links and share them privately; automated email delivery is not required for the first release.
- Secure password storage and server-side per-user authorization remain mandatory despite the small user count. Do not rely on hidden UI controls for access control.
- Password reset and email verification are deferred. Never expose another user's training or account data.

### CFG-01: Profile and Gym

- Profile: display name, email, timezone, default kg/lb, bodyweight for relevant exercises, and configurable rest durations.
- One editable gym profile initially. Record equipment-specific load increments, available loads and min/max, dumbbell weights, bar weights, and plate denominations/quantities.
- Account units are defaults. Changing units in the tracker saves a persistent per-exercise override; changing the account default does not overwrite those overrides.
- Conversions preserve the physical load using canonical storage. A dumbbell entry is the weight of **one** dumbbell, not the pair. Record whether one or two dumbbells contribute to volume. Unilateral reps are logged per side.

### CAT-01: Exercise Catalog

- Maintain a small shared catalog, expanded by the admin as needed. Use stable exercise identities, names, usable images, Primary/Secondary/Tertiary muscle roles, equipment/load type, rest category, and applicable bodyweight factor/assistance ratio.
- Admins supply or validate anatomy, coefficients, machine ratios, and licensed image content; do not invent them from exercise names.
- Map exact known CSV names to catalog entries; require explicit mapping or a new admin entry for unknown names before activation. Do not silently merge variants.
- Missing calculation settings must be flagged. Manual logging remains possible while recommendations are unavailable for an incompletely configured exercise.

## Import and Program Management

### IMP-01: CSV Structure

The import reference is [the supplied MacroFactor CSV](../MacroFactor-20260927154219.csv). Use a real CSV parser, not comma splitting. Preserve quoted values, Unicode exercise names, row numbers, and exercise ordering.

- The first row contains program metadata; block markers and repeated `Cycle N` headers delimit groups.
- Import **every cycle present** as a program week. The sample has five cycles; do not enforce six or seven weeks.
- Each imported week and the manual deload must have exactly seven workout/rest day slots. Flag other counts in preview and block activation until corrected; this does not impose a fixed number of training weeks.
- A named workout in the first column starts a workout day. Subsequent exercise rows with a blank first cell inherit that workout. Each `Rest` row creates a distinct program rest day.
- Repeated set groups contain Type, Rep Range, RIR, and Rest. Empty trailing set groups mean no set, not an invalid zero-valued set.
- Support Standard Set, Warmup, and Failure Set mappings. `N+` denotes a failure set with a recommended minimum of N reps and RIR 0; bounded ranges preserve their exact limits.
- Retain useful notes. Source skip markers are not evidence that the user completed or skipped a day in this application; unresolved source markers require explicit handling in preview rather than silent activation.
- Ignore the CSV's deload metadata: all imported cycles remain training weeks. Ignore CSV rest values for countdown configuration; use profile settings instead.

### IMP-02: Preview and Partial Import

- Imports create programs; they do not update existing programs in place.
- Preview parsed weeks/days/exercises/sets and row-level errors before confirmation. The user can confirm skipping invalid exercise rows and importing valid rows.
- Block malformed structural grouping when safe day/week assignment is impossible. Flag empty workout days and unresolved catalog mappings; resolve them before activation.
- Replacing the single current program requires confirmation and must preserve completed history and exercise identity. Do not destroy an active draft silently.

### PLN-01: Deload and Editing

- Before activation, manually build one appended deload week from scratch with its days, exercises, sets, rep ranges, and RIR. Configure it once per plan, not once per restart.
- Users may edit future program days, exercises, and set prescriptions. Keep active and past session snapshots unchanged.
- In-session structural edits and exercise substitution are deferred. Current-session changes are logging, set type, and explicit skipping; substitution with a post-workout program update is a later feature.

### PLN-02: Scheduling and Progression

- Program days are ordered slots, not fixed weekdays. Users may complete days out of order within the active week and train later than originally expected.
- A workout day is checked automatically on successful completion. Rest days are checked manually and can be unchecked in the current week.
- Advance only when every day in the current week is resolved: completed workout, confirmed emergency-skipped/partial workout, or checked rest day. Emergency states must be visibly distinct from full completion.
- Actual workout dates appear in calendar/history; moving a workout to Friday does not require rewriting a Thursday prescription.
- No repeating a workout slot within a run. After the final deload day, offer restart or a new CSV import. Restart creates fresh run instances of the saved training weeks and deload, preserving history, and may continue without an end date until the user stops or replaces the plan.
- Older edits/rest-day changes never silently rewind the active week.

## Mobile Screens

### UI-01: Home

- Logo at the top. Calendar defaults to a collapsed week and expands to a month; actual dates link to recorded workout results.
- Below it, an expandable active-program ribbon shows the current seven program days, workout/rest labels, and completion states. Partial/skipped states use distinct indicators.

### UI-02: Workout Detail

- Show workout target muscles first, then a vertically scrollable exercise list with all prescribed sets, rep ranges, and RIR.
- Each exercise shows its target muscles as horizontally scrollable pills. Start Workout opens the tracker; an existing draft offers Resume.

### UI-03: Workout Tracker

- Keep a top toolbar visible: left hamburger options, session timer, and interactive rest timer with diminishing progress and end tone.
- Below it, horizontally scrollable exercise thumbnails navigate the workout. Show the selected exercise name and `Set 1 of 4`-style position.
- A horizontally scrollable action strip provides Info and History. Use accessible icon/text controls, visible focus, and touch-friendly targets; do not rely on gestures or color alone.
- The horizontally scrollable set grid contains set type/number, read-only Auto suggested reps/load/target RIR, actual weight, actual reps, actual RIR, and completion checkbox.
- Ordinary sets show a number; warmups show W and failure sets F. Tapping the type opens a Standard/Warmup/Failure modal.
- Auto is noninteractive. Actual load/reps/RIR are editable; checking saves the set and locks the row. Unchecking unlocks it for correction and triggers unfinished-set recalculation, never rewriting completed rows.
- Reps and RIR are integers; actual RIR is 0-10. Completed working sets require at least one rep. Load is nonnegative; zero added load is valid for bodyweight work. Failure sets require RIR 0.

### UI-04: Exercise Info and History

- Info shows exercise image and Primary, Secondary, and Tertiary muscle roles.
- History provides metric filters for estimated 1RM, 3RM, 10RM, heaviest weight, volume, and total set reps, followed by expandable sessions containing that exercise.
- Historical records are independent of the current program. A program name may be shown as context but is never required to retrieve history.

### UI-05: Dashboard and Settings

- Dashboard charts show per-exercise estimated RM, load, volume, and reps, plus workout count and total volume. Do not calculate a meaningless combined 1RM across exercises.
- Date filters: last four weeks, twelve weeks, year, all time, and custom range.
- Profile/gym settings expose units and per-exercise exceptions, bodyweight, rest defaults, equipment loads, bars, and plate inventory. Program/import/deload editing and admin catalog maintenance need usable supporting views.
- Mobile is the primary layout. Timers, navigation, inputs, and charts must remain readable without overlapping at mobile and desktop sizes; horizontal scrolling is deliberate only where specified.

## Sessions and Timers

### SES-01: Drafts, Dates, and Persistence

- One active session per user. Persist an online draft so reload/navigation can resume; exclude it from finished history and aggregate metrics.
- Detect competing tab/device edits instead of silently overwriting drafts. Saving/completion must not create duplicate records on retries.
- A workout's date is its start date in the snapshotted profile timezone. Permit one completed or retained-performance emergency-finished workout per date. Discarded attempts may restart on that date; wholly skipped status events do not consume the performance limit.
- No backdated new workouts. Existing finished workouts support the limited corrections below.
- Online-only first release: preserve visible input on a failed save, show error/retry, and never report an unacknowledged save as successful. Offline queues, PWA installation, and offline conflict merging are deferred.

### SES-02: Completion, Discard, and Emergency Finish

- Show Complete Workout only after every required set of every prescribed exercise is checked. Normal completion saves performance and checks the program day.
- Discard requires confirmation, deletes the draft, creates no performance history, and does not advance the program.
- Provide a confirmed Finish Early / Skip Remaining action for emergencies. Retain an exercise if **at least one working set is checked**, even when other sets/exercises are incomplete. Retain its checked sets only; discard unchecked logs and exercises with no completed working set.
- Users may mark an individual exercise skipped and continue with later exercises. A workout containing a skipped exercise must use partial/emergency finishing, not normal completion; apply the same checked-working-set retention rule.
- Retained checked working/failure sets contribute to history, suggestions, and metrics. Warmups never contribute to performance metrics. Mark the workout partial/skipped and resolve its program day so the week can advance.
- A wholly skipped workout creates a calendar/program status event, not exercise-performance entries or metrics. Do not fabricate completed sets.

### TMR-01: Session and Rest Timers

- Pause stops both session elapsed time and rest countdown; Resume continues both. Persist timer state and use timestamps, not interval tick counts, to recover after reload.
- Completing a working/failure set starts rest, replacing any existing countdown. Warmups do not start rest. Unchecking does not restart rest or rewind elapsed time.
- Rest controls: start/pause/reset, skip, and add/subtract time; show diminishing progress and play a tone at zero while the page is active.
- Background/locked-phone alerts are not guaranteed by the browser and are not a first-release promise.

| Exercise category | Default rest |
| ----------------- | ------------ |
| Upper compound    | 120 seconds  |
| Lower compound    | 180 seconds  |
| Upper isolation   | 90 seconds   |
| Lower isolation   | 90 seconds   |
| Core              | 60 seconds   |

The admin assigns exercise categories; users override durations in their profiles. CSV rest fields do not override these settings.

## Recommendation and Load Rules

### REC-01: Approved Estimation Baseline

This RIR-adjusted Epley-style baseline is a heuristic, not a measured maximum or guarantee of performance. For effective resistance L, actual reps r, and actual RIR q:

```text
estimated1RM = L * (1 + (r + q) / 30)
candidateLoad = estimated1RM / (1 + (targetReps + targetRIR) / 30)
predictedRepsAtLoad = 30 * (estimated1RM / candidateLoad - 1) - targetRIR
estimatedNRM = estimated1RM / (1 + N / 30), for N = 1, 3, 10
```

For display, estimated 1RM is `estimated1RM` itself, not `estimatedNRM` evaluated at N=1. Use the inverse expression only for 3RM and 10RM.

- Seed from latest relevant same-exercise finished history, using labeled corrections if present; ask for an initial load when none exists. Do not use unchecked/warmup/discarded sets as performance evidence.
- After each checked working set, estimate from that actual load/reps/RIR and recompute unfinished sets only. An active-row correction must be checked again before becoming new performance evidence.
- Prefer the same load if a whole rep count fits the next prescription and target RIR. Otherwise use a feasible equipment load near the candidate at the range midpoint. For N+ failure sets, use N as the planning minimum and target RIR 0, without capping actual reps at N.
- Preserve exact imported rep ranges, including those crossing training zones. Strength 1-6, hypertrophy 7-14, and endurance 15+ are context, not replacement prescriptions.
- If performance is far below range, lower load rather than forcing an out-of-range rep target. If a smaller rep count at the same load remains in range and meets target RIR, prefer that before reducing load.
- Respect gym increments/inventory. Limit suggested upward **effective resistance** changes to 10% of the latest checked same-exercise working set in the active session, or the latest retained historical working set when none exists. Use labeled historical corrections when seeding future suggestions. Downward adjustment may exceed 10%; nonpositive/missing reference resistance requires manual input. Apply this to effective resistance, not selected assistance, so more assistance is never mistaken for greater resistance.
- Never silently leave the prescribed range or bypass load constraints to produce a suggestion. Explain when no feasible recommendation exists and require manual adjustment.
- Mark estimates low-confidence above 15 reps. Keep actual performance separate from estimated RM values.

### REC-02: Dumbbells, Bodyweight, and Assistance

- For dumbbells, recommend the weight of one dumbbell. Equipment metadata determines one/two-dumbbell volume accounting; do not double a displayed recommendation.
- Model effective resistance as `bodyweightFactor * bodyweight + addedLoad - assistanceRatio * selectedAssistance`. For ordinary external loads, use the logged physical resistance instead.
- Require bodyweight, admin-validated exercise factor, and applicable machine ratio. Missing values disable automatic suggestions, not manual logging.
- A bodyweight input of zero added load is valid. Assisted-machine load entry is the selected assistance: more assistance means less effective resistance. Respect this direction when converting a resistance recommendation back into a machine setting.
- Do not recommend negative effective resistance or divide by zero; unsupported/nonpositive estimates require manual handling rather than invented values.
- Snapshot bodyweight, factors, ratios, equipment interpretation, units, and prescriptions for each session. Future settings changes never rewrite historical metrics.

### LOAD-01: Barbell Visualization

- Barbell load means total load including the selected bar. Gym settings include bar weights and plate denominations with available quantities.
- Show a visual bar with equal plates per side, denomination labels, per-side weight, and total. Prefer the fewest plates achievable with actual inventory.
- If the exact balanced target cannot be assembled, show nearest achievable lower/higher loads for explicit selection. Do not silently alter logged loads or recommendations.
- Reject loads below the bar's weight. Collars are excluded unless configured; mixed units must still represent the correct physical load.

## History and Metrics

### HIS-01: Immutable Performance and Corrections

- Include normally completed sessions and retained exercises from emergency-finished sessions. Exclude active drafts, discarded sessions, unchecked sets, and exercises with no retained working set.
- Original completed-set values and historical metric contributions are immutable. Finished-session editing allows weight/reps corrections only; it cannot change RIR/type/completion or unlock rows.
- Store corrections separately and visibly label them alongside original values. Corrections influence **future suggestions only**, not historical charts, records, or another session's results.
- Keep historical exercise identity, original prescriptions, loads/units, bodyweight interpretation, and program/run context independent of current program/catalog changes.

### HIS-02: Metric Definitions

- Working sets include standard and failure sets; warmups, unchecked, discarded, and skipped sets never contribute.
- Heaviest load is the maximum original logged working-set load; clearly distinguish selected assistance from effective resistance rather than calling more assistance greater strength.
- Volume is the sum of original effective load times actual reps. For two-dumbbell exercises, count both dumbbells in load; unilateral reps are per-side and require the recorded side count when reporting total volume/reps.
- For bodyweight/assisted exercise volume, use snapshotted effective resistance and label the interpretation. Total reps sum original completed working-set reps under the recorded side convention.
- RM values are estimated from original completed working-set performance under REC-01 and clearly labeled as estimates. History corrections do not recompute these values.

## Deferred Features and Delivery Inputs

- Deferred: offline/PWA behavior, guaranteed background alerts, password reset/email verification, multiple concurrently selectable programs, and in-session exercise substitution with optional program updates.
- Still needed as implementation inputs: admin-curated initial catalog, image assets/usage rights, muscle roles, bodyweight factors, machine ratios, and actual gym inventories. These are configuration/content dependencies, not permission to guess.
- Neutral image placeholders may support development while approved assets are missing. Track real asset availability/rights and catalog ownership as launch-readiness dependencies. Missing validated factors or ratios must leave recommendations disabled for the affected exercise.
- Before implementing a slice, turn the relevant requirement IDs into explicit test cases and numeric fixtures, including equipment rounding and boundary behavior. Record any remaining technical tie-break choices in tests; ask when they would change approved product behavior.

## Delivery and Operational Acceptance

- Target current iPhone Safari and Android Chrome, plus desktop Chrome/Safari. Check actual supported browser/device versions at implementation time and record them in release evidence; do not invent offline or background-alert guarantees.
- Use the planned GitHub Pages/Render/Neon stack, validating routing, authentication, API origin configuration, and actual service limits. Do not assume free tiers satisfy availability requirements or silently purchase paid resources.
- Include CI checks, repeatable migrations, safe seed data, environment/secrets documentation, deployment smoke tests, and a verified backup/restore procedure.
- Treat catalog metadata/images/rights, validated factors/ratios, actual gym inventory, and named content ownership as readiness dependencies. Infrastructure work can proceed before these inputs are complete.
- No fixed deadline or hosting budget was supplied. Record costs/availability constraints before live provisioning; do not present the backlog as a delivery-date commitment.
