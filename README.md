# 🏥 Fix the Hospital: Riverbend edition

A multiplayer classroom simulation. Seven stakeholder groups use a deliberately broken EHR, watch it fire 347 alerts in three minutes and crash, agree on what is wrong, hear four vendor packages, negotiate under a $45 million cap, vote, and then replay the same minute under the system they bought.

No accounts, no database, no dependencies. One Node process holds each game in memory.

The game content follows the *EHR Replacement Game: Facilitator Pack* (roles, briefs, packages, prices, voting rules, outcome cards) and the *Patient Chart: James Whitfield* (the chart inside the simulated EHR).

## Run it

```
node server.js
```

Open http://localhost:3000, click **HOST GAME**, and put that window on the projector. Players open the address shown on the host screen, click **JOIN GAME**, and enter the room code.

Needs Node 18 or newer. Set `PORT` to use a different port. `npm test` plays a whole game through the API with 30 scripted players.

## Getting players connected

Players' laptops must be able to reach the machine running the server.

- **Same Wi-Fi.** The server prints a `http://192.168.x.x:3000` address at startup and the host lobby displays it. Campus networks often block device-to-device traffic, so test it in the actual room beforehand.
- **Hosted (most reliable for class).** Deploy this folder to any Node host such as Render or Railway, with start command `npm start`. Use a single instance, since games live in memory.
- **Tunnel.** Run the server on your laptop and expose it with a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

Restarting the server ends all games in progress.

## Seats and votes

The host is the facilitator. Players take one of eight seats in seven groups. Nurses and physicians are two tables of one group.

| Group | Seats in the game | Seat plan (25 to 40 players) | Votes |
|---|---|---|---|
| Executive leadership and board | Executive | 3 to 5 | 2 |
| Finance and revenue cycle | Finance | 3 to 5 | 1 |
| Clinical end users | Physician, Nurse | 8 to 12 | 1 |
| IT and informatics | IT | 3 to 5 | 1 |
| Compliance, legal, and regulators | Compliance | 3 to 4 | 1 |
| Patients and patient advocate | Patient advocate | 2 to 4 | 1 |
| Vendors (Northwind and MedCore) | Vendor | 3 to 5 | 0 |

**Random assignment follows the seat plan.** A player who taps **🎲 Assign me randomly** gets the seat that is furthest below its share. The host lobby also has **🎲 RANDOMIZE EVERYONE BY THE SEAT PLAN**, which deals every joined player a seat in one go. Players can still pick a seat by hand.

One **representative** per seat is picked at random when the game starts (marked ⭐). The nurse representative is the hospital's spokesperson in the pitchfest.

## What every player sees

- **A role card** (always one tap away on their name): goal, a line to say out loud, three must-haves, what they can trade, their red lines, and their leverage.
- **"Your job right now"**: a strip at the top of every screen that says what to do in this part of this phase, in this seat.
- **Private facts**: the "only you know" list from the facilitator pack. From Phase 2 on, a player can publish any of them to the whole room. It appears on the projector under *The room now knows* and cannot be taken back.
- **Vendor offers**: the vendors' private levers (8% discount, free governance, bridge alert layer, waived exit fee, and so on) only appear on ballots after a vendor puts them on the table.

## Running the session

The host advances every screen with **NEXT**; players' screens follow. A **Facilitator** strip under the top bar lists what to say and do in each part. Every part has its own countdown, labeled "Part 1 of 3" and so on. **BACK**, **+1 MIN**, and **RESTART TIMER** adjust things, and **SKIP TO DEBRIEF** jumps to the end.

| Phase | Part | What happens | Timer |
|---|---|---|---|
| Lobby | Room code | Players join, take a seat, read their role card | |
| **1 · EHR Simulation** (4 min) | Read your task | Physicians and nurses get a task. Everyone else gets something to watch for | 0:45 |
| | Use the EHR | Physicians hunt for a tacrolimus level and change a dose. Nurses give a ten-step insulin dose and chart vitals in three places. One quiet minute, then three minutes of escalating alerts, then the system stops responding. Advances by itself | 4:00 |
| **2 · Stakeholder Discussion** (10 min) | On your own | The two alerts that mattered are revealed, with how fast they were dismissed. Everyone ticks the problems they hit or saw | 3:00 |
| | One list | The hospital talks. Each person stars the 3 problems that matter most to their group. Vendors listen and see which package answers each problem | 5:00 |
| | Must-fix and spokesperson | The 15 problems sit in Must fix / Should fix / Can wait. The facilitator and team representatives drag cards between columns | 2:00 |
| **3 · Vendor Pitchfest** (6 min) | The hospital presents | The spokesperson presents the must-fix list. Vendors see their cue cards | 2:00 |
| | Four pitches | One minute per package, with its own countdown and a small "now pitching" tag. Package cards lift as you hover over them. Vendors get a three-line cue card per package | 4:00 |
| **4 · Negotiation** (20 min) | Inside your team | Role card, private facts, what each package means for you. Each person sets a position: package, modules, contract terms | 8:00 |
| | Across teams | Live board of the 7 votes, module support, terms on the table, published facts, and what the deal would be if the vote were held now. Two minutes before the end the executives are told to close the ballot | 12:00 |
| **5 · Voting** (3 min) | Vote | One ballot each, starting from each person's position. Results are sealed | 3:00 |
| **6 · Decision + Outcome** (3 min) | The decision | Winning package, modules bought, modules the money did not stretch to, terms, true cost against the cap, vote by group | 0:30 |
| | Replay | Players redo the same task in a working copy of the system the room bought, with a click counter, then see what is new, partly fixed, or unchanged. See "The replay" below | 1:00 |
| | Consequences | Outcome card, problems fixed by tier, costs nobody budgeted, and what happened to each group | 0:45 |
| | Feedback form | Six questions on players' own devices | 1:00 |
| Debrief | Why was it so hard? | Discussion questions, the five architectures, and the closing question | |

### The replay

Whatever wins, players get a playable EHR at the end, built from the deal's coverage:

| Outcome | Physician task | Nurse task | What players notice |
|---|---|---|---|
| B, C, or D | One red alert with a "Hold tonight's dose" button. 1 click | Insulin in 3 scans, vitals charted once. About 5 clicks | The supplement and lactulose are blocked or already stopped. Refusing to hold the dose is stopped by the system |
| A | The same red alert, on top of the old order screen | The potassium supplement is blocked, but insulin is still 10 steps and vitals are still typed three times. About 14 clicks | The alarm works; everything around it is the old system |
| No deal | The old 26-row results table and 4-click order | The old 10-step insulin and three vitals screens | The alert storm returns and the system crashes again after about 20 seconds |

Under Package D the panels below the task also follow the modules that were bought. The replay runs for one minute by default; use **+1 MIN** if the room wants longer.

### How the decision is made

- Each group votes as a block: its package is the one most of its members chose. A split team follows its representative.
- A deal passes with **5 of 7 votes**. If nothing reaches 5, the executives' choice stands and the screen says so.
- A module or contract term is adopted when groups holding a majority of votes (4 of 7) want it. The cap stretch to $50 million also needs finance itself.
- For Package D, modules are bought **in order of support until the cap is reached**. Whatever does not fit is listed as "wanted, but the money ran out."
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
- `public/app.js`: every screen, the two EHR screens (`CALM`, `STORM`, `MAR`, `physicianBody`, `nurseBody`), storm timing (`STORM_START`, `LAG_START`, `CRASH_AT`), the per-phase coaching text (`coach`), and the replay panels (`AFTER`).
- `server.js`: rooms, block voting and deal resolution (`tallyBallots`, `resolve`), and the live update stream. Screen order and timer lengths are in `STEPS` at the top.
- `public/style.css`: the command-center theme, the deliberately ugly EHR, and (at the end) the additions for this edition.
- `public/icons.js`: the embedded Tabler icons. The map from emoji markers to icon names is `EMOJI` in `app.js`.
- `test/smoke.js`: an end-to-end run through the API.
