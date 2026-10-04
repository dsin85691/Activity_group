# Bed 14 acceptance tests

Automated versions of every case in `16-test-cases.md`. Each test is named `[P1]` or `[P2]` plus its case ID, so results map one-to-one to the test plan.

## Setup (once)

```
npm install
npx playwright install chromium
```

Needs Node 20 or newer. Browser cases are skipped, and reported as skipped, if Playwright is missing.

For CON-02, which compares briefs word for word, put the brief files `07-…md` to `15-…md` in a `briefs/` folder at the project root, or point `BRIEFS_DIR` at them.

## Run

```
npm run test:acceptance            # every section
node tests/acceptance/run.js 03 07 # only sections 03 and 07
npm run test:acceptance:serial     # one file at a time (steadier timing on slow machines)
```

Each section starts its own copy of `server.js` on a random port, so nothing else needs to be running. To test a deployed copy instead, set `BASE_URL=https://…`.

Output is one line per case (`PASS`, `FAIL` or `SKIP`, with the reason), then a summary:

- `SESSION BLOCKED: …` lists the failed P1 cases. The run exits with code 1.
- `READY FOR CLASS` means every P1 case passed. The run exits with code 0.

Results are also written to `tests/acceptance/results.json`.

## How long it takes

Sections 3 and 4, and CON-01, run the simulation and quiz in real time (about 4 and 3 minutes). The other sections take seconds. Expect about 6 to 8 minutes in parallel, or about 15 minutes serial.

Two cases take much longer, so they only run when you ask for them:

| Variable | Runs |
| --- | --- |
| `ACCEPT_FULL=1` | TIM-01b: a real 60-minute session with nobody pressing NEXT |
| `ACCEPT_LONG=1` | STK-05: waits out the 10-minute discussion |
| `ACCEPT_ENGINE=firefox` or `webkit` | every browser case on that engine (ROB-04). Install it first with `npx playwright install firefox webkit`. |
| `CHROME_PATH=/path/to/chrome` | use a specific Chromium build |

## What the tests compare against

Expected values come from the briefs and are written out in `spec.js`: timings, packages, combinations, quiz answers and tags, catches, replay moments and chart values. They are not read from the app. A content mistake in `public/content.js` therefore shows up as a failure instead of passing silently.

The one exception is SIM-03, the alert rate. It reads the alert schedule from `public/content.js`, because the alert queue hides from the screen how fast alerts actually arrive.

## Hooks the tests expect

The tests drive the app through its existing `data-act` attributes and server actions. Several cases cover features the test plan asks for that the app does not have yet. Those tests look for the hooks below, so whoever builds the feature can wire it up to match:

| Case | Hook the test looks for |
| --- | --- |
| SET-05 | Facilitator screen shows every phase and stakeholder brief, "answer key" and "progress" |
| SET-06 | A `confirm()` dialog naming the missing nurse team when NEXT is pressed in the lobby |
| TIM-02 | Text with the session's total time left, such as "Session 52:10 left" |
| TIM-03, TIM-01b | Every timed step advances by itself when its timer ends |
| TIM-04 | Host buttons `[data-act=pause]` and `[data-act=resume]` |
| TIM-05 | "61 min" and "over time" text after +1 MIN |
| TIM-06 | A confirmation dialog on NEXT mid-step, and "missing" shown for skipped outputs |
| SIM-04 | Each logged alert action carries a timestamp (`at`) |
| SIM-07 | An order-signing control (`[data-act*=sign]`) that fails with "won't sign" during downtime |
| SIM-12 | Findings form `[data-test=finding-text]`, `[data-test=finding-screen]`, `[data-test=finding-add]`, saved as `chart.findings[]` with `text`, `screen` and `at` |
| STK-02 | The current sub-step marked with `aria-current="step"` |
| STK-04 | Player action `confirm_top`, allowed for the CEO role only, after which the top five is locked |
| PIT-04 | The package being pitched marked `.pkcard.current` or `aria-current` |
| PIT-05 | Player action `question`, limited to one per group |
| PIT-07 | Player action `favor` with `{ pkg, note }`, visible only to the group |
| DSC-04 | Player actions `vendor_question` and `vendor_answer` |
| VOT-02 | The server refuses votes over $12M with a message mentioning the cap |
| VOT-05, VOT-06 | "tie … rule" and "abstain" text on the decision screen |
| DEC-04 | Host action `reset_decision`, recorded in the state as a log entry |
| OUT-06 | Host export button `[data-act=export]` that downloads the session summary |
| CON-03 | "Fictional teaching case, not for clinical use" on the chart, quiz and replay screens |
| ROB-05, ROB-06 | Focusable controls; `role="alert"` or `aria-live` on alerts; `role="timer"` on timers |

If the team settles an open question differently, for example a different tie rule in VOT-05, update the matching test and `spec.js` in the same change.
