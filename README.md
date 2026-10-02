# 🏥 Fix the Hospital

A multiplayer classroom simulation for Chapters 6 and 8. Students take hospital roles, use a deliberately dysfunctional EHR, agree on what is broken, hear a vendor's packages, negotiate, vote, and then see what their decision did to everyone a year later.

No accounts, no database, no dependencies. One Node process holds each game in memory.

## Run it

```
node server.js
```

Open http://localhost:3000, click **HOST GAME**, and put that window on the projector. Students open the address shown on the host screen, click **JOIN GAME**, and enter the room code.

Needs Node 18 or newer. Set `PORT` to use a different port.

## Getting students connected

Students' laptops must be able to reach the machine running the server.

- **Same Wi-Fi.** The server prints a `http://192.168.x.x:3000` address at startup and the host lobby displays it. This works on home and small-office networks. Campus networks (AirPennNet included) often block device-to-device traffic, so test it in the actual room beforehand.
- **Hosted (most reliable for class).** Deploy this folder to any Node host such as Render or Railway, with start command `npm start`. Use a single instance, since games live in memory. On free tiers, open the site a minute before class to wake it up.
- **Tunnel.** Run the server on your laptop and expose it with a tunnel such as `cloudflared tunnel --url http://localhost:3000`, then share the URL it gives you.

Restarting the server ends all games in progress.

## Roles

The host is the **Hospital CEO** (your team). Students are Physicians, Nurses, CFOs, Patient Advocates, Safety & Ethics Officers, and Health IT Leads. Several students can share a role; each role is a team.

When the game starts, one **representative** is picked at random for each role team (marked ⭐). Representatives speak for their team in the hospital-wide steps. Teams can swap who speaks; the star is only a prompt.

## Running the session

The host advances every screen with **NEXT**; students' screens follow. **BACK** returns to the previous screen, **+1 MIN** and **RESTART TIMER** adjust the countdowns, and **SKIP TO DEBRIEF** jumps to the end from anywhere. Timings follow the whiteboard plan: 4 / 10 / 6 / 20 / 2–3 / 2–3 minutes.

| Phase | Screen | What happens | Timer |
|---|---|---|---|
| Lobby | Room code | Students join, pick or are assigned a role, read their role card | |
| **1 · EHR Simulation** (4 min) | Before you fix it, use it | Each side reads its task. NEXT starts the simulation | |
| | The simulation | Physicians hunt for a safety issue in a cluttered chart. Nurses do the 09:00 medication pass with a scanner that fails. CFOs and IT shadow the physician view; Advocates and Safety shadow the nurse view. Alerts interrupt everyone; alert #12 is the one that matters. Advances by itself | 2:30 |
| | TIME. | The missed alerts are revealed, with how fast they were dismissed and how many people gave the dangerous drugs. Everyone ticks the problems they ran into | 1:30 |
| **2 · Stakeholder Discussion** (10 min) | Team huddle | Role teams sit together, compare notes, and each member stars the 3 problems that matter most to their department | 4:00 |
| | One problem list | All 15 problems sorted into Critical / Desirable / Lower priority from the stars. Representatives argue; the CEO clicks a problem to move it between columns | 6:00 |
| **3 · Vendor Pitchfest** (6 min) | Call the vendor | Handshake. Representatives present the critical list | |
| | Four packages | Cost, timeline, training, features, and how many problems in each tier every package fixes. None fixes everything | 5:00 |
| **4 · Negotiation** (20 min) | Team huddle | Each role reads a private briefing on what every package means for them. The CFO team alone sees the budget. Everyone casts a straw vote and picks terms to demand | 7:00 |
| | Hospital negotiation | Representatives negotiate, led by the CFO and Physician. The board shows positions overall, by role, and support for each term. Anyone can change position as it moves | 13:00 |
| **5 · Voting** (2–3 min) | Final vote | One vote each, starting from each person's negotiated position. Results are sealed | 2:30 |
| **6 · Decision + Outcome** (2–3 min) | The hospital has decided | Winning package, adopted terms, cost against budget, vote by role. Return the decision to the vendor; the CFO signs | |
| | One year later | Students reopen Maria's chart: what is new, what is unchanged | |
| | Consequences | What it fixed in each tier, what it cost, and what happened to each role and to Maria | |
| | Reflection form | Rating plus three short answers, on students' own devices | 2:00 |
| Debrief | Why was it so hard? | Discussion questions, the five architectures from Chapter 8, and the closing question | |

The projector never shows the two critical alerts or any private briefing before its reveal.

### How the decision is made

- The package with the most votes wins. A tie goes to the cheaper option, which means "keep the current EHR" wins any tie it is part of.
- A negotiated term (pilot first, phased payments, insurer co-funding, nurse backfill, shared AI liability, AI labeling, integration gate) is adopted if more than half of voters ask for it and it applies to the winning package.
- Terms change the cost, the timeline, and the consequences each role sees.

### Things that come up

- **Late arrivals** can join at any point and pick a role.
- **Closed tab or dead laptop:** the student rejoins with the same name and gets their seat back.
- **Removing a player:** click the ✕ on their name in the host lobby.
- **Host refresh** is safe. If the host tab is closed, the home page offers "Resume hosting room ####" in the same browser.
- **Reflections:** from the consequences screen onward the host bar has a button that downloads every response as a CSV. Download it before closing the game; nothing is stored after the server stops.

### Trying it alone

Open the host in one tab and a few player tabs alongside it; each tab is a separate player. Keep it to four player tabs per browser. Browsers allow six connections to one site, and every open game tab holds one, so more tabs than that will freeze. Use a second browser if you want more. Students on their own devices are unaffected.

## Changing the content

- `public/content.js` — roles and private briefings, the 15 problems, the four packages (cost, timeline, features, which problems each fixes, consequences per role), the negotiable terms, and the CFO's budget.
- `public/app.js` — every screen, both EHR simulations (`ALERTS`, `MAR`), and the "one year later" chart (`AFTER`).
- `server.js` — rooms, votes, and the live update stream. Screen order and timer lengths are in `STEPS` at the top.
- `public/style.css` — command-center theme and the deliberately ugly EHR.
