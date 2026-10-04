'use strict';
// Expected values, copied from the brief set (00 to 16). Tests compare the app against these,
// never against the app's own content file, so a content mistake shows up as a failure.

// 00-overview.md: the 60-minute flow, in seconds.
const TIMING = { simulation: 240, quiz: 180, stakeholder: 600, handshake: 60, pitch: 360, framing: 120, intra: 360, inter: 720, voting: 180, decision: 180, outcome: 600 };
const TOTAL_SECONDS = 3600;

// 00-overview.md: vendor packages.
const PACKAGES = {
  A: { name: 'AI Clinical Assistant', cost: 5, fixes: [1, 3, 4, 5, 9, 10] },
  B: { name: 'Automation and Workflow', cost: 4, fixes: [1, 8, 9, 10, 14] },
  C: { name: 'Connected Hospital', cost: 8, fixes: [5, 6, 7, 8, 11, 14] },
  D: { name: 'Intelligent Safety System', cost: 7, fixes: [2, 6, 11, 12, 15] },
  E: { name: 'Smart Hospital and Robotics', cost: 12, fixes: [8, 11, 12, 14] },
};

// 05-phase-5: combinations within budget.
const COMBOS = [
  { letters: ['A', 'D'], cost: 12, fixes: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 15] },
  { letters: ['D', 'B'], cost: 11, fixes: [1, 2, 6, 8, 9, 10, 11, 12, 14, 15] },
  { letters: ['C', 'B'], cost: 12, fixes: [1, 5, 6, 7, 8, 9, 10, 11, 14] },
  { letters: ['A', 'B'], cost: 9, fixes: [1, 3, 4, 5, 8, 9, 10, 14] },
  { letters: ['C'], cost: 8, fixes: [5, 6, 7, 8, 11, 14] },
  { letters: ['E'], cost: 12, fixes: [8, 11, 12, 14] },
];

// 02-phase-2: sample questions, answers and problem tags.
const QUIZ = [
  { q: /hand tremor before 09:00/i, answer: /night nursing note at 05:30/i, tags: [5, 11] },
  { q: /hold tacrolimus above 12/i, answer: /separate consult tab/i, tags: [11, 13] },
  { q: /fluconazole was added to tacrolimus/i, answer: /\bno\b/i, tags: [15] },
  { q: /acknowledged in one line at 11:06/i, answer: /\bfive\b/i, tags: [2] },
  { q: /cover the donor's bacteria/i, answer: /transplant module/i, tags: [7, 12] },
  { q: /home medication list did the EHR import/i, answer: /outdated March list/i, tags: [6] },
  { q: /vitals and weight typed into/i, answer: /\bthree\b/i, tags: [8] },
  { q: /early warning score of 5 escalated/i, answer: /\bno\b/i, tags: [2, 15] },
];

// 04-phase-4: catches.
const CATCHES = {
  A: 'AI summaries can miss or invent details',
  B: 'It speeds up existing processes, flawed ones included',
  C: 'It only works as far as outside clinics and hospitals join the exchange',
  D: 'Its models must be validated on local patients and tuned',
  E: 'The rollout takes 18 to 24 months and needs heavy upfront hardware',
};

// 06-phase-6: replay moments and the happy ending.
const REPLAY = {
  A: 'A one-screen summary shows the 05:30 tremor, both consult warnings and the 84-page fax in plain language.',
  B: 'Vitals and weight are entered once. The discharge workflow flags the therapy note, and the October 2 target is pulled.',
  C: 'Outside records arrive searchable. The donor culture and the old resistant E. coli appear in the main chart, and the medication lists reconcile.',
  D: 'An interaction alert fires when fluconazole is ordered, a score of 5 pages a physician at 12:00, and tacrolimus is held.',
  E: 'The smart bed flags the 1.3 kg weight gain, and connected monitors feed vitals straight to the chart.',
};
const HAPPY_ENDING = [/tacrolimus is held/i, /antibiotic is switched/i, /potassium is treated/i, /rehab/i, /family meeting/i, /new liver keeps working/i];

// One line of private information per stakeholder brief (07 to 15), used to check who can see what.
const PRIVATE = {
  exec: 'The board wants a visible win this year',
  finance: 'An extra inpatient day on 6 West costs about $4,500',
  clinical: 'The pharmacist flagged three conflicting home medication lists',
  physician: 'You are the transplant physician team: attending, surgeon and resident.',
  nurse: 'Your handoff this morning said surgery "might change the tacrolimus."',
  it: 'The transplant module is a separate program.',
  vendor: 'you charge $250K to export old data',
  compliance: 'The sepsis prediction model has no owner, no accuracy data',
  advocate: 'Nobody has told her that pathology found a second tumor.',
};
// Briefs a role is allowed to see: its own, plus the group 3 brief for physicians and nurses.
const ALLOWED = { physician: ['physician', 'clinical'], nurse: ['nurse', 'clinical'], clinical: ['clinical'] };
// Facilitator-only text from 01 to 06 (vendors may know their own catches).
const FACILITATOR_ONLY = ['Which problem, if fixed, would have caught the tacrolimus level first?', 'The clinicians should feel EHR overload before anyone names it.'];

// Brief files and the role that receives each.
const BRIEF_FILES = {
  exec: '07-executive-leadership-and-board.md',
  finance: '08-finance-and-revenue-cycle.md',
  clinical: '09-clinical-end-users.md',
  physician: '10-physician-team.md',
  nurse: '11-nurse-team.md',
  it: '12-it-and-informatics.md',
  vendor: '13-vendors.md',
  compliance: '14-compliance-legal-and-regulators.md',
  advocate: '15-patients-and-advocate.md',
};
const PHASE_BRIEF_TITLES = [/Phase 1: Simulation and crash/i, /Phase 2: Did you spot it\?/i, /Phase 3: Stakeholder discussion/i, /Phase 4: Handshake and pitch fest/i, /Phase 5: Discussion, voting and decision/i, /Phase 6: Outcome/i];

// 16-test-cases.md CON-01: fictional chart values.
const CHART = { tacDay5: '11.6', tacDay6: '19.4', kDay5: '5.0', kDay6: '6.2', crBaseline: '1.6', crDay6: '2.4', qtc: '492', arteryIndex: '0.48' };

const FICTIONAL = /fictional teaching case,? not for clinical use/i;
const VOTING_GROUPS = [1, 2, 3, 4, 6, 7];

module.exports = { TIMING, TOTAL_SECONDS, PACKAGES, COMBOS, QUIZ, CATCHES, REPLAY, HAPPY_ENDING, PRIVATE, ALLOWED, FACILITATOR_ONLY, BRIEF_FILES, PHASE_BRIEF_TITLES, CHART, FICTIONAL, VOTING_GROUPS };
