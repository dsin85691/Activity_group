# 🏥 Bed 14: The EHR Game

CIS 7000 · Health Tech · Fictional teaching case, not for clinical use.

A multiplayer classroom simulation built from the "Bed 14: EHR Game Briefs" set. Physicians and nurses live an EHR overload around one patient, James Whitfield, six days past a liver transplant. The hospital names what broke, hears a vendor, votes on a package within a $12M budget, and replays the case on the system it chose. Total running time: 60 minutes.

No accounts, no database, no dependencies. One Node process holds each game in memory.

The game content follows the *EHR Replacement Game: Facilitator Pack* (roles, briefs, packages, prices, voting rules, outcome cards) and the *Patient Chart: James Whitfield* (the chart inside the simulated EHR).

## Run it

```
node server.js
```

Open http://localhost:3000, click **HOST GAME**, and put that window on the projector. The host is the facilitator. Students open the address shown on the host screen, click **JOIN GAME**, enter the room code and pick a role.

Needs Node 18 or newer. Set `PORT` to use a different port. `npm test` plays a whole game through the API with 30 scripted players, then checks the budget stretch rule.

## Getting players connected

- **Same Wi-Fi.** The server prints a `http://192.168.x.x:3000` address and the host lobby shows it. Campus networks often block device-to-device traffic, so test in the room beforehand.
- **Hosted (most reliable).** Deploy this folder to a Node host such as Render or Railway with start command `npm start`, on a single instance.
- **Tunnel.** Run locally and expose it, for example `cloudflared tunnel --url http://localhost:3000`.

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

| Group | Roles in the app | Votes |
| --- | --- | --- |
| 1. Executive leadership and board | CEO/Board | Yes; gives the go/no-go |
| 2. Finance and revenue cycle | CFO | Yes; signs off the budget |
| 3. Clinical end users | Physician team, Nurse team, Clinical leadership (CMO/CNO/pharmacists) | Yes |
| 4. IT and informatics | IT | Yes |
| 5. Vendors | Vendor | No |
| 6. Compliance, legal and regulators | Compliance | Yes |
| 7. Patients and patient advocate | Advocate | Yes |

Each role sees only its own brief (files 07 to 15), from the lobby onward; the chip in the top bar reopens it. Physicians and nurses also get the clinical end users' brief from Phase 3. Each group has a spokesperson (⭐), picked at random, who breaks ties in the group's vote.

## Running the session

The host advances every screen with **NEXT**. **BACK**, **+1 MIN** and **RESTART TIMER** adjust as needed. The simulation and the quiz advance by themselves.

| Phase | Screen | What happens | Timer |
| --- | --- | --- | --- |
| 1. Simulation and crash | Read your brief | Physicians and nurses read their team brief. Executives, finance and IT shadow the physician chart; clinical leaders, compliance and advocates shadow the nurse chart. Vendors prepare their pitch | |
| | Bed 14 | The ward clock runs 12:45 → 13:05. Alerts every 15 s, then every 5 s with an **Override all** button, then faster than anyone can read. Pages from consultants and the daughter. The 84-page fax lands as one image. At 13:02 the labs fire (tacrolimus 19.4, potassium 6.2, creatinine 2.4); at 13:03 the chart drops into downtime and the paper form takes over | 4:00 |
| 2. Did you spot it? | Quiz | Eight rapid-fire questions, 20 s each. Each reveal shows where the clue was buried and tags problem numbers | 2:40 |
| | Top five | Physicians and nurses each rank their top five problems; the lists merge | 0:40 |
| 3. Stakeholder discussion | Discussion | Clinical pitch, reactions, priorities. Everyone stars five problems; the facilitator clicks a problem to move it in or out of the agreed top five. Vendors wait outside | 10:00 |
| 4. Handshake and pitch fest | Handshake | The CEO reads the top five to the vendor | 1:00 |
| | Pitch fest | Five packages. Vendors see every catch privately; the facilitator clicks **Reveal catch** when a question reaches one | 6:00 |
| 5. Discussion, voting and decision | Finance framing | $12M cap, finance's asks, the combinations table | 2:00 |
| | Team discussion | Each player picks a first and second choice (one package or a pair); the group's choice is its plurality | 6:00 |
| | All-team discussion | The board shows every group's first and second choice | 12:00 |
| | Voting | One vote per group: the plurality of its members, with the spokesperson breaking ties. Results are sealed | 3:00 |
| | Decision | The CFO signs off, or approves a phased contract or rejects anything over $12M. The CEO gives go or no-go; on a no-go the runner-up goes forward. The facilitator can press any of these buttons if a role is empty | 3:00 |
| 6. Outcome | The replay | Bed 14 replays on the chosen packages, then the happy ending. Clinicians see their own crash-time calls | 10:00 |
| | Next cycle | Problems fixed, problems carried over (always including 13) | |

Hospital ranking: most group votes, then most individual votes, then the cheaper choice.

### Clues in the chart

Every clue from the Phase 1 brief is on its own screen, and the app records which ones each player opens; the quiz reveal tells players whether they opened it.

- Tremor: Notes → Nursing, 05:30.
- Two consult warnings about tacrolimus: Notes → Consults (nephrology, pharmacy).
- Donor culture: the separate Transplant Module, which takes two clicks to launch and log in. Nurses are denied access.
- Artery flow: the body of the ultrasound report under Imaging.
- QTc 492 ms: the unreviewed ECG in Media.
- EWS of 5 with no physician called: the vitals.
- Conflicting potassium orders: the supplement, the replacement protocol and the low-potassium diet.
- Three home medication lists: Med Rec. The oldest, from March, was imported.

Also in the chart:

- The 11:06 addendum where five alerts were acknowledged in one line.
- Vitals and weight in three places: the weight in three screens, plus three nurse flowsheets that each need the same vitals.
- The old resistant E. coli on page 52 of the fax.
- The unreported second tumor on pathology.
- The therapy note recommending rehab.

## Changing the content

- `public/content.js` covers:
  - Groups, roles and every brief, as markdown pasted from the brief set.
  - The 15 problems.
  - The five packages: cost, fixes, pitch, catch and replay moment.
  - The combinations table, the quiz and the happy ending.
  - `SIM`: the Phase 1 timeline, alerts, pages, decisions and clues for both teams.
- `public/app.js` has every screen and the bed 14 chart itself (`VIEW`, `NOTES`, `MEDS`, `LABS`, the fax).
- `server.js` holds rooms, quiz timing, rankings, group voting and the decision. Screen order and timers are in `STEPS`.
- `public/style.css` holds the command-center theme and the deliberately awful EHR.

## Acceptance tests

The cases from `16-test-cases.md` are automated in `tests/acceptance/`. Run them with `npm install && npx playwright install chromium`, then `npm run test:acceptance`. See `tests/acceptance/README.md`.
