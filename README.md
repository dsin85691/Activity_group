# 🏥 Fix the Hospital: Riverbend edition

A multiplayer classroom simulation. Seven stakeholder groups use a deliberately broken EHR, watch it fire 347 alerts in three minutes and crash, agree on what is wrong, hear four vendor packages, negotiate under a $45 million budget, vote, and then replay the same ten steps in the system they bought.

No accounts, no database, no dependencies. One Node process holds each game in memory.

The game content follows the *EHR Replacement Game: Facilitator Pack* (roles, briefs, packages, prices, voting rules, outcome cards) and the *Patient Chart: James Whitfield* (the chart inside the simulated EHR).

## Run it

```
node server.js
```

Open http://localhost:3000, click **HOST GAME**, and put that window on the projector. Players open the address shown on the host screen, click **JOIN GAME**, and enter the room code.

Needs Node 18 or newer. Set `PORT` to use a different port. `npm test` plays a whole game through the API with 30 scripted players, then checks the budget stretch rule.

## Getting players connected

Players' laptops must be able to reach the machine running the server.

- **Same Wi-Fi.** The server prints a `http://192.168.x.x:3000` address at startup and the host lobby displays it. Campus networks often block device-to-device traffic, so test it in the actual room beforehand.
- **Hosted (most reliable for class).** Deploy this folder to any Node host such as Render or Railway, with start command `npm start`. Use a single instance, since games live in memory.
- **Tunnel.** Run the server on your laptop and expose it with a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

Restarting the server ends all games in progress.

## Seats and votes

The host is the facilitator. Players take one of nine seats in seven groups. Nurses and physicians are two tables of one group. The vendor group is two rival companies.

| Group | Seats in the game | Seat plan (25 to 40 players) | Votes |
|---|---|---|---|
| Executive leadership and board | Executive | 3 to 5 | 2 |
| Finance and revenue cycle | Finance | 3 to 5 | 1 |
| Clinical end users | Physician, Nurse | 8 to 12 | 1 |
| IT and informatics | IT | 3 to 5 | 1 |
| Compliance, legal, and regulators | Compliance | 3 to 4 | 1 |
| Patients and patient advocate | Patient advocate | 2 to 4 | 1 |
| Vendors | MedCore (the incumbent, sells A and B), Northwind (the challenger, sells C and D) | 2 to 3 each | 0 |

**Random assignment follows the seat plan.** A player who taps **🎲 Assign me randomly** gets the seat that is furthest below its share. The host lobby also has **🎲 RANDOMIZE EVERYONE BY THE SEAT PLAN**, which deals every joined player a seat in one go. Players can still pick a seat by hand.

One **representative** per seat is picked at random when the game starts (marked ⭐). The nurse representative is the hospital's spokesperson in the pitchfest.

## What every player sees

- **A role card** (always one tap away on their name): goal, a line to say out loud, three must-haves, what they can trade, their red lines, and their leverage.
- **How to play** (button at the top right of every screen, and on the lobby card): a step-by-step guide written for that seat. It covers what to click before the vendors come in, during the pitches, in the negotiation and vote, and after the decision, and marks the part the game is in now. It also shows where that seat stands on each package: support, only if, or oppose, with the reason and what to tick. The host has a matching guide.
- **"Your job right now"**: a strip on every player screen, from the lobby to the debrief, that says what to do in this part of this phase, in this seat. It ends with a pointer to the full guide for anyone who is lost.
- **Phase 1 is hard on purpose**: each step names the task and nothing more. There are no hints about which line is right, no highlight, and no click counts.
- **The replay in Phase 6 is guided**: under every package, each step has a "What to do" line that says what to look for (for example, "The kidney team is called Nephrology. Click their note."), and after two wrong guesses the right line is highlighted.
- **Private facts**: the "only you know" list from the facilitator pack. From Phase 2 on, a player can publish any of them to the whole room. It appears on the projector under *The room now knows* and cannot be taken back.
- **Vendor offers**: each vendor has private offers that apply only to its own packages. MedCore can offer free paging in 6 weeks, a $3M loyalty credit on B, and a capped penalty. Northwind can offer 8% off D, free AI governance, a $2M bridge alert layer, a waived exit fee, a refund, and a capped penalty. An offer appears on ballots only after that vendor puts it on the table, and the rival sees it too.
- **Budget cues**: in Phase 4, executives and clinicians see a card prompting them to ask finance to stretch the budget, listing what the room wanted that the money did not cover. Finance sees a matching card with a checklist for deciding whether the stretch makes sense.

## Running the session

The host advances every screen with **NEXT**; players' screens follow. A **Facilitator** strip under the top bar lists what to say and do in each part. The strip also shows which of five presenters has the page ("SPEAKER 3"). To reassign pages, edit the `SPEAKER` list in `public/app.js`. Every part has its own countdown, labeled "Part 1 of 3" and so on. **BACK**, **+1 MIN**, and **RESTART TIMER** adjust things, and **SKIP TO DEBRIEF** jumps to the end.

| Phase | Part | What happens | Timer |
|---|---|---|---|
| Lobby | Room code | Players join, take a seat, read their role card | |
| Case file | The case | The patient, a plain-language brief of what he is suffering from, the system, what happened at 13:02, and why everyone is in the room. A button opens his full chart as a PDF (`public/case-file.pdf`, 26 pages). Shown on the projector and on every device. The brief does not reveal which result was dangerous | 2:00 |
| **1 · EHR Simulation** (1 min) | Read your task | Physicians and nurses get a task. Everyone else gets something to watch for | 0:45 |
| | Use the EHR | Physicians and nurses each get the same ten scripted steps every time. Alerts start at second 4 and speed up; the system stops responding at second 54. Advances by itself | 1:00 |
| **2 · Stakeholder Discussion** (10 min) | On your own | The two alerts that mattered are revealed, with how fast they were dismissed. Everyone ticks the problems they hit or saw | 3:00 |
| | One list | The hospital talks. Each person stars the 3 problems that matter most to their group, individually, on their own device. The three problems closest to that seat's must-haves are listed first with the reason, and one button stars all three. Vendors listen and see which package answers each problem | 5:00 |
| | Must-fix and spokesperson | The 15 problems sit in Must fix / Should fix / Can wait. The facilitator and team representatives drag cards between columns | 2:00 |
| **3 · Vendor Pitchfest** (6 min) | The hospital presents | The spokesperson presents the must-fix list. Vendors see their cue cards | 2:00 |
| | Four pitches | MedCore pitches A then B, Northwind pitches C then D, one minute each with its own countdown. Each vendor sees a cue card for its own package and a line of attack while its rival speaks | 4:00 |
| **4 · Negotiation** (20 min) | Inside your team | Role card, private facts, what each package means for you. Each person sets a position: package, modules, contract terms | 8:00 |
| | Across teams | Live board of the 7 votes, module support, terms on the table, published facts, and what the deal would be if the vote were held now. Two minutes before the end the executives are told to close the ballot | 12:00 |
| **5 · Voting** (3 min) | Vote | One ballot each, starting from each person's position. Results are sealed | 3:00 |
| **6 · Decision + Outcome** (3 min) | The decision | Winning package, modules bought, modules the money did not stretch to, terms, true cost against the cap, vote by group | 0:30 |
| | Replay | Players redo the same ten steps in the system the room bought. Each step is new, partly fixed, or unchanged depending on the deal. See "The simulation" below | 1:00 |
| | Consequences | Outcome card, problems fixed by tier, costs nobody budgeted, and what happened to each group | 0:45 |
| | Feedback form | Six questions on players' own devices | 1:00 |
| Debrief | Why was it so hard? | Discussion questions, the five architectures, and the closing question | |

### The simulation

There is one frozen simulation per screen (physician and nurse). It is the same on every run.

**Before the vote** each screen has ten steps in today's EHR. Between them the two screens expose all 15 problems:

| Step | Physician | Nurse |
|---|---|---|
| 1 | Find the tacrolimus level in 26 results | Check the noon labs for the value that should stop you |
| 2 | Confirm home medicines from three lists | Give the 12:30 insulin (ten clicks) |
| 3 | Find what changed in an 11-page note | Decide what else is due and safe |
| 4 | Check the 84-page scanned outside records | Chart vitals in three places |
| 5 | Find the kidney team's advice among 8 tabs | Clear required documentation |
| 6 | Hold tonight's dose (seven clicks) | Find the tacrolimus plan in four conflicting places |
| 7 | Close the chart past billing hard stops | Find the urgent line in the night nurse's note |
| 8 | Find the pathology result among 140 messages | Confirm home medicines by phone |
| 9 | Start the discharge in six systems | Start discharge teaching and tasks |
| 10 | Respond to an unexplained sepsis score | Respond to the warning scores |

Alerts interrupt throughout and must be dismissed to continue. The reveal shows how many of the ten steps each person finished before the crash, and which problems each step was hiding.

**After the vote** players run the same ten steps again. A yellow strip at the top explains how to read the screen. Each step is laid out as **Before** (what the old system showed and how much work it took) beside **Now** (the screen to use, with a one-line "What to do"). A verdict line says whether the deal fixed the step and which package or module did it, or what would have. The ending is a scoreboard with one row per step: before, now, and result. Each step is rebuilt from the deal:

- **New:** the problem behind that step is fixed, and the step takes one or two clicks.
- **Partly fixed:** shorter, with some manual work left.
- **Unchanged:** the same grey screen as before.

| Outcome | What the replay looks like |
|---|---|
| A | The old window. One critical alert in place of the storm, and step 1 is new. The other nine steps are as before |
| B | A new window. Results, medicines, and the order are new; notes, outside records, handoffs, and billing are partly fixed; inbox, discharge, and the sepsis score are unchanged |
| C | A new window, and all ten steps are new |
| D | A new window. The core steps are new. Each module switches on its own step: the AI scribe fixes the note and the billing fields (only if AI governance was bought too), the interoperability hub fixes outside records, the discharge hub fixes discharge and handoffs, inbox triage fixes the inbox, and AI governance fixes the sepsis score |
| No deal | The old window, all ten steps unchanged, and the alert storm and crash happen again |

The ending compares the two runs: steps finished before the crash against all ten now, with the time and clicks taken.

**One new problem is planted on purpose.** When the AI scribe is in the deal (Package C, or Package D with the scribe and AI governance), the physician's note step shows a one-page AI draft that wrongly says "continue lactulose". The player can sign it in one click or read it first. Signing without reading is called out on the ending screen. It sets up the closing question: what new problems might the new system create?

**On the projector** the host screen shows the same playable simulation, with buttons to switch between the physician and nurse screens and between systems. The system the room bought is marked with a star; the other buttons let the room compare with what it did not buy.

**If the replay shows the old EHR and a crash,** the outcome was "no deal": nobody voted, or only vendors (who have no vote) were seated.

### How the decision is made

- Each group votes as a block: its package is the one most of its members chose. A split team follows its representative.
- A deal passes with **5 of 7 votes**. If nothing reaches 5, the executives' choice stands and the screen says so.
- A module or contract term is adopted when groups holding a majority of votes (4 of 7) want it. The budget stretch to $50 million also needs finance itself.
- The $45 million budget applies to the contract: package price, modules, and paid terms. Anything that would push the contract over budget is not bought. The exception is the stretch to $50 million, which counts only if the finance team itself ticks it. Example: Package C plus the $2M bridge is $46M, so the bridge is bought only when finance signs.
- Package C already includes Northwind's long-term discount, so the 8% offer applies to Package D only.
- Prices: Package prices are A $12M, B $34M, C $44M, and D $27M plus modules.
- Lost revenue at go-live and the cost of running the old system are not on the vendor's sheet. Finance holds those numbers privately. They appear on the outcome screen as "what arrived after signing".
- For Package D, modules are bought **in order of support until the budget runs out**. Whatever does not fit is listed as "wanted, but the money ran out."
- With fewer than seven groups present (small test rooms), the thresholds scale down in proportion.

### Things that come up

- **Late arrivals** can join at any point and take a seat.
- **Closed tab or dead laptop:** the player rejoins with the same name and gets their seat back.
- **Removing a player:** click the ✕ on their name in the host lobby.
- **Host refresh** is safe. If the host tab is closed, the home page offers "Resume hosting room ####" in the same browser.
- **Feedback:** from the consequences screen onward the host bar has a button that downloads every response as a CSV. Download it before closing the game; nothing is stored after the server stops.

### Trying it alone

Open the host in one tab and a few player tabs alongside it; each tab is a separate player. Keep it to four player tabs per browser, since every open game tab holds one connection and browsers allow six per site. Use a second browser for more. With only a few seats filled, vote thresholds scale down so a deal can still pass.

## Look and feel

- **Design.** The original command-center interface: dark navy grid, glowing teal and blue, monospace labels.
- **Icons.** Every emoji has been replaced by a Tabler outline icon (MIT). The icons are embedded in `public/icons.js`, so nothing is downloaded while the game runs.
- **The broken EHR** in Phase 1 keeps its own dated look on purpose.

## Moving problems between the three columns

In "Must-fix and spokesperson" and "The hospital presents", the facilitator and each hospital team's representative can move a problem between **Must fix**, **Should fix** and **Can wait**:

- with a mouse: drag the card to another column;
- on a phone or tablet: tap the card, then tap the column.

Everyone's board updates at once. Vendors can see the board but cannot move cards.

## Changing the content

- `public/content.js`: groups, seats and seat plan weights, role cards and private facts, the 15 problems, the four packages, the Package D module menu, contract terms, the cap, and the cost and coverage rules (`dealCost`, `coverage`).
- `public/app.js`: every screen, the two EHR screens (`SCRIPT` holds the ten steps for each screen in their old, partly fixed, and fixed versions; `STORM` holds the alerts), simulation timing (`STORM_START`, `LAG_START`, `CRASH_AT`), the per-phase coaching text (`coach`).
- `server.js`: rooms, block voting and deal resolution (`tallyBallots`, `resolve`), and the live update stream. Screen order and timer lengths are in `STEPS` at the top.
- `public/style.css`: the command-center theme, the deliberately ugly EHR, and (at the end) the additions for this edition.
- `public/case-file.pdf`: the players' copy of Mr. Whitfield's chart, linked from the case file page. It leaves out the facilitator's answer key. To swap it, replace the file and update `CASE_FILE_PAGES` in `public/app.js`.
- `public/patient.jpg`: the portrait shown on the case file page to illustrate the fictional patient. Replace the file to change it.
- `public/icons.js`: the embedded Tabler icons. The map from emoji markers to icon names is `EMOJI` in `app.js`.
- `test/smoke.js`: an end-to-end run through the API.
