'use strict';
// Server-only content: every private brief, the facilitator's phase briefs and the vendor's catches.
// This file is never served to browsers. Each player receives only the briefs their role may see.

const BRIEFS = {
  physician: `# Physician team brief: Bed 14

**Phase 1 player brief · Physicians only · Fictional teaching case, not for clinical use**

## Your role

You are the transplant physician team: attending, surgeon and resident. It is 12:45 on September 29. The nurses are working the same patient in another room and cannot hear you. The patient seemed on track this morning, but the pager keeps going off and the EHR keeps throwing alerts. Something is wrong.

## Your patient

| Field | Detail |
| --- | --- |
| Patient | James Whitfield, 61 M, 6 West bed 14 |
| Status | Day 6 after a deceased-donor liver transplant |
| History | Kidney disease stage 3b, type 2 diabetes, atrial fibrillation, hypertension, depression |
| Medications | 22 active orders, including tacrolimus (target 8 to 12 ng/mL) |
| Allergies | Penicillin (rash in childhood, never verified) |
| This morning's plan | Graft improving; continue doses; discharge home October 2 |
| Since 10:30 | Fever 38.1 C, rising heart rate, new oxygen need. Morning labs are still pending. |

## Decisions you own

1. Tonight's tacrolimus: continue, reduce or hold?
2. Is the current antibiotic the right one?
3. Restart the blood thinner, or keep holding it?
4. Does he need imaging today, and which kind?
5. Does the October 2 discharge stand?
6. Does he need a higher level of care?

## How to play

- You have 4 minutes. The app's clock runs fast, so 4 minutes cover 12:45 to 13:05 on the ward.
- Act on, acknowledge or dismiss every alert. They will speed up.
- Log what you find and where you found it, because you will need it later.
- If the EHR stops responding, keep caring for the patient on paper.

Afterward, a short quiz asks what you spotted. Then you take your findings to hospital leadership.`,

  nurse: `# Nurse team brief: Bed 14

**Phase 1 player brief · Nurses only · Fictional teaching case, not for clinical use**

## Your role

You are the day-shift nursing team on 6 West, the transplant step-down unit. It is 12:45 on September 29, and you have bed 14 plus three other patients. The physicians are working the same patient in another room and cannot hear you. Your handoff this morning said surgery "might change the tacrolimus." You haven't seen a new order.

## Your patient

| Field | Detail |
| --- | --- |
| Patient | James Whitfield, 61 M, bed 14, protective isolation |
| Status | Day 6 after a liver transplant; target discharge October 2 |
| Since this morning | Fever 38.1 C, heart rate 108 and irregular, now on 2 L of oxygen |
| Due now | Glucose 312, with 8 units of insulin due |
| Family | His daughter has called twice about the fever and the discharge date |

## Decisions you own

1. Is his condition serious enough to call a physician to the bedside now?
2. Give the next doses as ordered, or hold and ask first?
3. Which of the nine required assessments can wait, and which can't?
4. What do you tell the daughter?
5. What goes in your handoff to the night shift?

## How to play

- You have 4 minutes. The app's clock runs fast, so 4 minutes cover 12:45 to 13:05 on the ward.
- Chart, scan medications and answer alerts as you would on shift. They will speed up.
- The same vitals may need entering on more than one screen.
- Log what you find and where you found it.
- If the EHR stops responding, keep caring for the patient on paper.

Afterward, a short quiz asks what you spotted. Then you take your findings to hospital leadership.`,

  clinical: `# Clinical end users

**CMO, CNO, physician champions, pharmacists · Plays phases 3 to 6 · Represents the physician and nurse teams**

## Who you are

You speak for everyone who uses the EHR at the bedside. Whatever the hospital buys, your staff decide whether it actually gets used.

## What you care about

Catching deteriorating patients sooner, less time charting, fewer pointless alerts, and safe handoffs between shifts and services.

## What only you know

- Your teams just lived the bed 14 crash, and their findings logs and quiz results are your evidence.
- The pharmacist flagged three conflicting home medication lists. The EHR imported the oldest one.
- Physicians wrote an 11-page note, of which 2 pages were new. Nurses complete nine required assessments per shift.
- Staff stopped reading alerts when they came every 10 seconds, and five were dismissed in one click.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 3. Stakeholder discussion | Present the merged problem list and the near miss in 3 minutes. |
| 4. Handshake and pitch fest | Test each package against what went wrong in bed 14. |
| 5. Discussion, voting and decision | Agree on a first choice as a team, then cast one vote. |
| 6. Outcome | Your teams replay the case on the chosen system. |

## Ask the vendor

- Will this add clicks or remove them?
- How many alerts will we see per patient per shift?
- Who checks the AI's work, and how long does that take?

## Pressure point

Physicians may favor A because it cuts documentation. Nurses may favor B or C because they cut duplicate entry and fix handoffs. D is the package most tied to the near miss.`,

  exec: `# Executive leadership and board

**CEO, COO, board members · Plays phases 3 to 6 · Holds the final go/no-go**

## Who you are

You run Riverbend University Hospital and answer to the board. You sponsor any EHR investment and make the final call on whether it goes ahead.

## What you care about

Patient safety and reputation, transplant program rankings, length of stay, staff burnout and turnover, and a project that finishes on time.

## What only you know

- The board wants a visible win this year after two bad safety stories in the local press.
- The hospital bought the sepsis prediction model last year. No one owns it, and no one has checked how accurate it is.
- The ICU has no open beds today. A patient who should go back up cannot.
- Turnover among night-shift nurses hit 22% last year, and exit interviews blame charting.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 3. Stakeholder discussion | Chair the meeting. Decide whether this was a people or a system failure. Call in the vendor. |
| 4. Handshake and pitch fest | Shake hands with the vendor and read the top five problems. Ask about timelines and risk. |
| 5. Discussion, voting and decision | Cast one vote. Then give the go/no-go; on a no-go, the runner-up goes forward. Announce the decision to the vendor. |
| 6. Outcome | Announce the decision and commit to the next cycle. |

## Ask the vendor

- What can we show the board within 6 months?
- What happens to patient care during go-live?
- Which hospitals like ours already use this?

## Pressure point

The big, impressive package (E) is tempting for the board, but it does nothing for the problems that nearly harmed bed 14.`,

  finance: `# Finance and revenue cycle

**CFO, billing and revenue-cycle leads · Plays phases 3 to 5 · Chairs Phase 5 and signs off the decision**

## Who you are

You own the budget and the business case. You make sure claims and cash flow survive any system change.

## What you care about

Return on investment, staff time saved, billing accuracy, avoided penalties and lawsuits, and not overspending the $12M of approved capital.

## What only you know

- **The cap is firm at $12M.** Anything above it needs board approval or a phased contract.
- An extra inpatient day on 6 West costs about $4,500. Bed 14's unsafe discharge plan could become a readmission, which the hospital is penalized for.
- Insurers' prior authorizations for transplant drugs are stuck. Bed 14's tacrolimus approval has been pending since September 28.
- A billing cutover last year delayed claims for 6 weeks.

## Your asks before you'll support any package

1. Proof: results from at least one comparable hospital.
2. Payment tied to milestones, not paid upfront.
3. A plan to keep claims flowing during go-live.
4. Clear yearly costs after year one, such as licenses and support.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 3. Stakeholder discussion | Put a dollar figure on what the bed 14 near miss would have cost. |
| 4. Handshake and pitch fest | Use your one lightning question on hidden costs or guarantees. |
| 5. Discussion, voting and decision | Frame the budget in 2 minutes, chair the debate, cast one vote, then confirm the winner fits the budget and sign it off. |

## Pressure point

Package B promises labor savings you can count. Packages C and D prevent harm that is harder to price.`,

  it: `# IT and informatics

**CIO, CMIO, CNIO, technical teams · Plays phases 3 to 5**

## Who you are

You build, integrate, secure and test everything the hospital buys. If a package can't be connected or supported, it fails no matter how good the pitch was.

## What you care about

Integration with the current EHR, data migration, cybersecurity, uptime, testing, and a workload your team can actually carry.

## What only you know

- The transplant module is a separate program. Its data never reaches the main chart, which is why the donor culture was missed.
- Outside records arrive by fax and are scanned as single images that can't be searched.
- Alert logs show clinicians override about 90% of alerts. One addendum dismissed five at once.
- Your team can support **at most two go-lives in the next 12 months.**
- The EHR crash during the simulation was real load failure: the system was never sized for this alert volume.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 3. Stakeholder discussion | Explain why the information was hidden: separate systems, scanned faxes, no data sharing. |
| 4. Handshake and pitch fest | Test each package for integration, security and support needs. |
| 5. Discussion, voting and decision | Warn if a combination is beyond what your team can support, and cast one vote. |

## Ask the vendor

- Does it use standard FHIR APIs, or a custom interface?
- Where is patient data stored and processed, and who can see it?
- How do you validate and monitor AI models after go-live?
- What is your plan if your system goes down?

## Pressure point

Package C fixes the root cause of most hidden information but is slow. Package D depends on C's clean data to work well.`,

  compliance: `# Compliance, legal and regulators

**Privacy and security officers, legal counsel · Speaks for CMS and ONC rules · Plays phases 3 to 5**

## Who you are

You keep the hospital within the law and out of court. You also speak for the outside regulators whose rules any new system must meet.

## What you care about

Patient privacy, data security, liability for AI decisions, accurate records, and meeting federal rules on information sharing and decision-support transparency.

## What only you know

- The sepsis prediction model has no owner, no accuracy data and no guidance for transplant patients. That is a liability today.
- A physician overrode a penicillin allergy alert without updating the allergy record. Records that disagree are hard to defend.
- Federal information-blocking rules expect hospitals to share records electronically. A faxed, unsearchable image is a weak position.
- Pathology found a second cancer, but the family hasn't been told. That is a disclosure risk.

## Your conditions for any AI package (A or D)

1. Patients consent before the ambient scribe records a visit.
2. A named clinical owner for every AI model.
3. Validation on local patients, with checks for bias.
4. Ongoing monitoring after go-live, plus a way to switch the model off.
5. Clear responsibility: the clinician decides, and the AI advises.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 3. Stakeholder discussion | Name the legal exposure from bed 14. |
| 4. Handshake and pitch fest | Use your lightning question on privacy, consent or liability. |
| 5. Discussion, voting and decision | Cast one vote. Flag any choice that fails your conditions. |

## Pressure point

You may favor C because it fixes the record itself. D is the strongest safety tool, but it is also the riskiest on liability.`,

  advocate: `# Patients and patient advocate

**Patient advocate, speaking for the Whitfield family · Plays phases 3 to 6**

## Who you are

You are the patient's voice in a room full of executives, clinicians and technologists. Every package should be judged by what it means for the person in the bed.

## What you care about

Safety, being told the truth, being included in decisions, privacy, and a discharge the family can actually manage.

## What only you know

- The daughter, Emily, asked whether "the cancer is gone now." Nobody has told her that pathology found a second tumor.
- She has called twice today about the fever and the discharge date, and nobody has called her back.
- Mr. Whitfield says he is scared of "messing up the pills." He goes home on 14 medications.
- He lives 90 miles away and has missed 2 of his last 6 clinic visits because he had no ride.
- The therapy team says he needs rehab, but the plan still sends him home on October 2.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 3. Stakeholder discussion | Tell the room what bed 14 looked like from the family's side. |
| 4. Handshake and pitch fest | Ask how each package affects patients and families directly. |
| 5. Discussion, voting and decision | Cast one vote for the choice that best protects patients. |
| 6. Outcome | Confirm the replay includes the family meeting and a safe discharge. |

## Ask the vendor

- Will patients know when AI is listening or making suggestions?
- Can families see the same information in the patient portal?
- Does this make discharge clearer for families?

## Pressure point

Packages C and B help families most through shared records and a smoother discharge. Package A raises consent questions.`,

  vendor: `# Vendors

**New vendor, outgoing EHR vendor, implementation consultants · Plays phases 4 and 5 · No vote**

## Who you are

You are the external team the hospital calls for help. The new vendor pitches the packages. The outgoing vendor controls the old data and must hand it over. The consultants run the rollout.

## What you want

Win the largest contract you can while keeping a reputation for honesty. A hospital that feels misled will not call you back next cycle.

## Your packages

| Package | Cost | Your one-line pitch |
| --- | --- | --- |
| A. AI Clinical Assistant | $5M | Clinicians treat patients instead of searching charts and writing notes. |
| B. Automation and Workflow | $4M | Stop paying skilled clinicians to do repetitive admin work. |
| C. Connected Hospital | $8M | Every member of the care team sees the same information, wherever the patient was treated. |
| D. Intelligent Safety System | $7M | Instead of 100 generic alerts, 5 high-priority ones that reach the right person. |
| E. Smart Hospital and Robotics | $12M | The EHR doesn't stop at the screen; the physical hospital feeds the record. |

## Your rules

- You cannot fix all 15 problems within 6 months, and you must say so if asked.
- Disclose each package's catch (see Phase 4) only when a stakeholder asks a question that reaches it.
- You may offer milestone payments or a phased start if finance pushes.
- **Outgoing vendor:** you charge $250K to export old data, and a delay pushes any go-live back 2 months.

## Your job by phase

| Phase | Your job |
| --- | --- |
| 4. Handshake and pitch fest | Shake hands with the CEO (1 min), pitch each package in 1 minute, then take one lightning question per group. |
| 5. Discussion, voting and decision | Answer questions during the discussion. Stay silent during voting, then receive the decision from the CEO. |`,
};

// Facilitator briefs 01 to 06, for the facilitator dashboard only.
const PHASE_BRIEFS = [
  `# Phase 1: Simulation and crash

**4 minutes · Physicians and nurses, in separate rooms · Facilitator only**

## Goal

The clinicians should feel EHR overload before anyone names it. They will not solve the case; the crash is the point.

## Setup

- Give each team its own brief: \`10-physician-team.md\` or \`11-nurse-team.md\`.
- Both teams open the same patient, James Whitfield in bed 14, at 12:45 on September 29.
- The app's clock runs faster than real time: 4 real minutes cover 12:45 to 13:05.
- Each team keeps a findings log listing what they found and on which screen.

## Run of play

| Real time | What the EHR does |
| --- | --- |
| 0:00 to 1:00 | An alert every 15 seconds. Pages arrive from consultants and the daughter. |
| 1:00 to 2:00 | An alert every 5 seconds, most of them low value. Override buttons appear. |
| 2:00 to 2:45 | Alerts stack faster than anyone can read them. The 84-page fax lands as one unsearchable image. |
| 2:45 (13:02 clock) | The delayed labs fire at once: tacrolimus 19.4, potassium 6.2, creatinine 2.4. |
| 3:00 | Screens freeze, orders won't sign, and the chart drops into downtime mode. |
| 3:00 to 4:00 | Teams work on paper and record what they would do. |

## Clues hidden in the chart

Tremor in a night nursing note · two consult warnings about tacrolimus · donor culture in a separate transplant module · artery flow in the body of the ultrasound report · unreviewed ECG with QTc 492 ms · early warning score of 5 with no physician called · conflicting potassium orders · three home medication lists.

## Output

Each team's findings log goes into Phase 2.`,

  `# Phase 2: Did you spot it?

**3 minutes · Physicians and nurses · Facilitator runs the quiz**

## Goal

Turn "that was chaos" into a named list of EHR failures the hospital can take to a vendor.

## Format

Rapid-fire multiple-choice and yes/no questions in the app, about 20 seconds each. Each answer reveals where the clue was buried and tags an EHR problem number from the Overview key.

## Sample questions

| Question | Answer | Problem |
| --- | --- | --- |
| Did you see the hand tremor before 09:00? | It was in a night nursing note at 05:30 | 5, 11 |
| Was the kidney team's "hold tacrolimus above 12" advice in the surgical plan? | No; it sat in a separate consult tab | 11, 13 |
| Did any alert fire when fluconazole was added to tacrolimus? | No | 15 |
| How many alerts were acknowledged in one line at 11:06? | Five | 2 |
| Does today's antibiotic cover the donor's bacteria? | No; the result was only in the transplant module | 7, 12 |
| Which home medication list did the EHR import? | The outdated March list | 6 |
| How many places were vitals and weight typed into? | Three | 8 |
| Was the early warning score of 5 escalated? | No | 2, 15 |

## Output

Each team ranks its top five problems. The two lists merge into the hospital problem list for Phase 3.`,

  `# Phase 3: Stakeholder discussion

**10 minutes · All hospital stakeholders (groups 1 to 4, 6 and 7) · Chaired by the CEO**

## Goal

The clinicians convince leadership that the EHR, not the staff, nearly cost a patient his transplant. The room agrees which problems matter most.

## Run of play

1. **Clinical pitch (3 min):** the CMO and CNO present the merged problem list and the near miss in bed 14.
2. **Reactions (5 min):** each stakeholder responds from its own brief, using its private information to raise or lower priorities.
3. **Priorities (2 min):** the room agrees its top five problems, and the CEO decides to call in the vendor.

## Prompts for the facilitator

- Was this a people failure or a system failure?
- Which problem, if fixed, would have caught the tacrolimus level first?
- What does each group lose if nothing changes?

## Output

A ranked top-five problem list, read aloud to the vendor at the start of Phase 4.`,

  `# Phase 4: Handshake and pitch fest

**7 minutes (1 handshake + 6 pitch fest) · Vendor team pitches to all hospital stakeholders**

## Goal

The hospital learns that no single package fixes everything, and that every package carries a catch.

## Run of play

1. **Handshake (1 min):** the CEO shakes hands with the vendor and reads out the top five problems.
2. **Pitches (5 min):** the vendor pitches each of the five packages in 1 minute, covering its technology, cost and the problems it fixes.
3. **Lightning questions (1 min):** one question per stakeholder group, at most. The vendor stays in the room to answer more during the Phase 5 discussion.

## Catches the vendor reveals only when asked

| Package | Catch |
| --- | --- |
| A. AI Clinical Assistant ($5M) | AI summaries can miss or invent details, so clinicians must still check them. The ambient scribe needs patient consent to record. |
| B. Automation and Workflow ($4M) | It speeds up existing processes, flawed ones included. The savings are staff time, not safer care. |
| C. Connected Hospital ($8M) | It only works as far as outside clinics and hospitals join the exchange. The rollout takes 9 to 12 months. |
| D. Intelligent Safety System ($7M) | Its models must be validated on local patients and tuned, and someone must own them. Who is liable when the AI is wrong? |
| E. Smart Hospital and Robotics ($12M) | The rollout takes 18 to 24 months and needs heavy upfront hardware. It adds no clinical alerts. |

## Output

Each stakeholder group has notes on the packages it favors and the questions still open.`,

  `# Phase 5: Discussion, voting and decision

**26 minutes (20 discussion + 3 voting + 3 decision) · All hospital stakeholders · Chaired by the CFO**

## Goal

The hospital picks a package, or a combination, that fits the $12M budget and that it can defend to patients, regulators and the board.

## Run of play

| Step | Time | What happens |
| --- | --- | --- |
| Finance framing | 2 min | The CFO states the $12M cap and finance's own asks (see the Finance brief). |
| Intra-team discussion | 6 min | Each stakeholder group agrees its first and second choice. |
| Inter-team discussion | 12 min | Groups argue, trade and form coalitions. The vendor answers questions on request. |
| Voting | 3 min | Groups 1, 2, 3, 4, 6 and 7 cast one vote each. The vendor does not vote. |
| Decision | 3 min | The CFO confirms the winner fits the budget and signs off. The CEO and board give the go/no-go. On a no-go, the runner-up goes forward. The CEO announces the decision to the vendor. |

## Combinations within budget

| Choice | Cost | Problems fixed | Count |
| --- | --- | --- | --- |
| A + D | $12M | 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 15 | 11 |
| D + B | $11M | 1, 2, 6, 8, 9, 10, 11, 12, 14, 15 | 10 |
| C + B | $12M | 1, 5, 6, 7, 8, 9, 10, 11, 14 | 9 |
| A + B | $9M | 1, 3, 4, 5, 8, 9, 10, 14 | 8 |
| C alone | $8M | 5, 6, 7, 8, 11, 14 | 6 |
| E alone | $12M | 8, 11, 12, 14 | 4 |

C + D covers the most clinical risk but costs $15M. Finance must find $3M or phase the work.

## Debate prompts

- Who is responsible when the AI is wrong?
- Is it better to fix the most problems, or the problems that nearly harmed bed 14?
- What is the cost of a safety miss compared with the cost of a package?

## Output

The final package, announced to the vendor, with the problems it leaves for the next cycle.`,

  `# Phase 6: Outcome

**10 minutes · Physicians and nurses replay the case · Everyone watches**

## Goal

Show that the choice mattered. The same afternoon in bed 14 replays on the new system, and the patient is caught in time.

## What changes in the replay, by package

| Package | Moment in the replay |
| --- | --- |
| A. AI Clinical Assistant | A one-screen summary shows the 05:30 tremor, both consult warnings and the 84-page fax in plain language. |
| B. Automation and Workflow | Vitals and weight are entered once. The discharge workflow flags the therapy note, and the October 2 target is pulled. |
| C. Connected Hospital | Outside records arrive searchable. The donor culture and the old resistant E. coli appear in the main chart, and the medication lists reconcile. |
| D. Intelligent Safety System | An interaction alert fires when fluconazole is ordered, a score of 5 pages a physician at 12:00, and tacrolimus is held. |
| E. Smart Hospital and Robotics | The smart bed flags the 1.3 kg weight gain, and connected monitors feed vitals straight to the chart. |

## The happy ending

The tacrolimus is held, the antibiotic is switched, potassium is treated, and Mr. Whitfield goes to rehab instead of home. His daughter hears about the pathology in a family meeting. The new liver keeps working.

## Wrap-up

- Show which problems remain, including problem 13, which no package fixes.
- Close with: "Next cycle, we call the vendor again."`,
];

// Each package's catch (04-phase-4). Vendors see them all; everyone else only once revealed.
const CATCHES = {
  A: 'AI summaries can miss or invent details, so clinicians must still check them. The ambient scribe needs patient consent to record.',
  B: 'It speeds up existing processes, flawed ones included. The savings are staff time, not safer care.',
  C: 'It only works as far as outside clinics and hospitals join the exchange. The rollout takes 9 to 12 months.',
  D: 'Its models must be validated on local patients and tuned, and someone must own them. Who is liable when the AI is wrong?',
  E: 'The rollout takes 18 to 24 months and needs heavy upfront hardware. It adds no clinical alerts.',
};

module.exports = { BRIEFS, PHASE_BRIEFS, CATCHES };
