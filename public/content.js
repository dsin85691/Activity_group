// Game content shared by the server (for validation and scoring) and the browser (for display).
// Source: the "Bed 14: EHR Game Briefs" set (00-overview to 15-patients-and-advocate).
(function (root) {
  'use strict';

  // ---------- stakeholders ----------

  // Seven stakeholder groups. Group 5 (vendors) pitches but does not vote.
  const GROUPS = {
    1: { name: 'Executive leadership and board', short: 'Executive', icon: '🏛️' },
    2: { name: 'Finance and revenue cycle', short: 'Finance', icon: '💰' },
    3: { name: 'Clinical end users', short: 'Clinical', icon: '🩺' },
    4: { name: 'IT and informatics', short: 'IT', icon: '💻' },
    5: { name: 'Vendors', short: 'Vendor', icon: '🤝' },
    6: { name: 'Compliance, legal and regulators', short: 'Compliance', icon: '⚖️' },
    7: { name: 'Patients and patient advocate', short: 'Patients', icon: '🙋' },
  };
  const VOTING_GROUPS = [1, 2, 3, 4, 6, 7];

  // Roles a player can pick. Physicians and nurses play phases 1 and 2 and belong to group 3.
  // `sim` is the Phase 1 chart a role works (physician/nurse) or shadows; vendors prepare their pitch instead.
  const ROLE_ORDER = ['physician', 'nurse', 'clinical', 'exec', 'finance', 'it', 'compliance', 'advocate', 'vendor'];
  const ROLES = {
    physician: { icon: '🧑‍⚕️', name: 'PHYSICIAN TEAM', short: 'Physician', plural: 'Physicians', group: 3, sim: 'physician', who: 'Attending, surgeon and resident for bed 14' },
    nurse: { icon: '👩‍⚕️', name: 'NURSE TEAM', short: 'Nurse', plural: 'Nurses', group: 3, sim: 'nurse', who: 'Day-shift nursing team on 6 West' },
    clinical: { icon: '🩺', name: 'CLINICAL LEADERSHIP', short: 'CMO/CNO', plural: 'Clinical leaders', group: 3, sim: 'nurse', who: 'CMO, CNO, physician champions, pharmacists' },
    exec: { icon: '🏛️', name: 'EXECUTIVE LEADERSHIP & BOARD', short: 'CEO/Board', plural: 'Executives', group: 1, sim: 'physician', who: 'CEO, COO, board members' },
    finance: { icon: '💰', name: 'FINANCE & REVENUE CYCLE', short: 'CFO', plural: 'Finance', group: 2, sim: 'physician', who: 'CFO, billing and revenue-cycle leads' },
    it: { icon: '💻', name: 'IT & INFORMATICS', short: 'IT', plural: 'IT', group: 4, sim: 'physician', who: 'CIO, CMIO, CNIO, technical teams' },
    compliance: { icon: '⚖️', name: 'COMPLIANCE, LEGAL & REGULATORS', short: 'Compliance', plural: 'Compliance', group: 6, sim: 'nurse', who: 'Privacy and security officers, legal counsel' },
    advocate: { icon: '🙋', name: 'PATIENT ADVOCATE', short: 'Advocate', plural: 'Advocates', group: 7, sim: 'nurse', who: 'Speaks for the Whitfield family' },
    vendor: { icon: '🤝', name: 'VENDORS', short: 'Vendor', plural: 'Vendors', group: 5, sim: null, who: 'New vendor, outgoing vendor, implementation consultants' },
  };

  // Physicians and nurses also belong to group 3; from Phase 3 on they see the clinical brief too.
  const GROUP_BRIEF = { physician: 'clinical', nurse: 'clinical' };

  // ---------- problems and packages ----------

  const PROBLEMS = [
    { id: 1, label: 'Too many clicks', desc: 'Every clue in bed 14 sat several screens deep.' },
    { id: 2, label: 'Alert fatigue', desc: 'Alerts every few seconds; five acknowledged in one line at 11:06.' },
    { id: 3, label: 'Note bloat', desc: 'An 11-page note with 2 pages of new information.' },
    { id: 4, label: 'Copy-paste errors', desc: 'Progress notes copied forward a 3-day-old tacrolimus level.' },
    { id: 5, label: 'Hard-to-find information', desc: 'The tremor sat in a night nursing note; the artery flow in a report body.' },
    { id: 6, label: 'Medication reconciliation', desc: 'Three home medication lists; the EHR imported the oldest.' },
    { id: 7, label: 'Poor interoperability', desc: 'Outside records arrived as an 84-page unsearchable fax.' },
    { id: 8, label: 'Duplicate entry', desc: 'Vitals and weight typed into three places.' },
    { id: 9, label: 'Documentation burden', desc: 'Nine required nursing assessments per shift.' },
    { id: 10, label: 'Inbox overload', desc: 'Pages, portal messages and calls nobody had time to answer.' },
    { id: 11, label: 'Poor handoffs', desc: '"Surgery might change the tacrolimus." No order followed.' },
    { id: 12, label: 'Buried results', desc: 'The donor culture lived only in the transplant module.' },
    { id: 13, label: 'Poor interface design', desc: 'Critical items looked exactly like trivial ones.' },
    { id: 14, label: 'Discharge fragmentation', desc: 'Therapy said rehab; the plan still said home October 2.' },
    { id: 15, label: 'Weak decision support and AI', desc: 'No alert when fluconazole met tacrolimus; EWS 5 never escalated.' },
  ];
  const ALL_IDS = PROBLEMS.map((p) => p.id);
  const CORE_FULL = ['clicks', 'alerts', 'find', 'medrec', 'dupes', 'buried', 'ui'];

  // ---------- packages ----------

  const BUDGET = 12; // $M approved capital
  const PACKAGE_ORDER = ['A', 'B', 'C', 'D', 'E'];
  const PACKAGES = {
    A: { name: 'AI Clinical Assistant', icon: '🧠', tech: 'Generative AI: ambient scribe, chart summaries, inbox AI, AI search', cost: 5, fixes: [1, 3, 4, 5, 9, 10],
      pitch: 'Clinicians treat patients instead of searching charts and writing notes.',
      replay: 'A one-screen summary shows the 05:30 tremor, both consult warnings and the 84-page fax in plain language.' },
    B: { name: 'Automation and Workflow', icon: '⚙️', tech: 'Robotic process automation and workflow engines', cost: 4, fixes: [1, 8, 9, 10, 14],
      pitch: 'Stop paying skilled clinicians to do repetitive admin work.',
      replay: 'Vitals and weight are entered once. The discharge workflow flags the therapy note, and the October 2 target is pulled.' },
    C: { name: 'Connected Hospital', icon: '🔗', tech: 'FHIR APIs, health information exchange, medication reconciliation', cost: 8, fixes: [5, 6, 7, 8, 11, 14],
      pitch: 'Every member of the care team sees the same information, wherever the patient was treated.',
      replay: 'Outside records arrive searchable. The donor culture and the old resistant E. coli appear in the main chart, and the medication lists reconcile.' },
    D: { name: 'Intelligent Safety System', icon: '🛡️', tech: 'Predictive AI and clinical decision support', cost: 7, fixes: [2, 6, 11, 12, 15],
      pitch: 'Instead of 100 generic alerts, 5 high-priority ones that reach the right person.',
      replay: 'An interaction alert fires when fluconazole is ordered, a score of 5 pages a physician at 12:00, and tacrolimus is held.' },
    E: { name: 'Smart Hospital and Robotics', icon: '🤖', tech: 'Robots, connected devices, real-time location tracking', cost: 12, fixes: [8, 11, 12, 14],
      pitch: "The EHR doesn't stop at the screen; the physical hospital feeds the record.",
      replay: 'The smart bed flags the 1.3 kg weight gain, and connected monitors feed vitals straight to the chart.' },
  };

  // A choice is one package or a pair, written as sorted letters: "A", "A+D".
  const choiceLetters = (key) => String(key || '').split('+').filter((l) => PACKAGES[l]);
  const normalizeChoice = (letters) => {
    const set = [...new Set(letters)].filter((l) => PACKAGES[l]).sort();
    return set.length >= 1 && set.length <= 2 ? set.join('+') : null;
  };
  const choiceCost = (key) => choiceLetters(key).reduce((sum, l) => sum + PACKAGES[l].cost, 0);
  const choiceFixes = (key) => [...new Set(choiceLetters(key).flatMap((l) => PACKAGES[l].fixes))].sort((a, b) => a - b);

  // The combinations table from the Phase 5 brief.
  const COMBOS = ['A+D', 'B+D', 'B+C', 'A+B', 'C', 'E'];

  const FINANCE_ASKS = [
    'Proof: results from at least one comparable hospital.',
    'Payment tied to milestones, not paid upfront.',
    'A plan to keep claims flowing during go-live.',
    'Clear yearly costs after year one, such as licenses and support.',
  ];

  // ---------- Phase 2: did you spot it? ----------

  // `correct` is null for "did you see it?" questions; the app compares against what the player opened.
  const QUIZ_SECONDS = 18; // per question; 8 questions plus 36 s of ranking make the brief's 3 minutes
  const QUIZ_ANSWER_SECONDS = 12; // then the answer is revealed
  const QUIZ = [
    { id: 'tremor', q: 'Did you see the hand tremor before 09:00?', options: ['Yes', 'No'], correct: null, answer: 'It was in a night nursing note at 05:30.', problems: [5, 11], clue: 'tremor' },
    { id: 'neph', q: 'Was the kidney team\'s "hold tacrolimus above 12" advice in the surgical plan?', options: ['Yes', 'No'], correct: 1, answer: 'No. It sat in a separate consult tab.', problems: [11, 13], clue: 'neph' },
    { id: 'ddi', q: 'Did any alert fire when fluconazole was added to tacrolimus?', options: ['Yes', 'No'], correct: 1, answer: 'No. The order set skipped the interaction check.', problems: [15], clue: 'ddi' },
    { id: 'ack', q: 'How many alerts were acknowledged in one line at 11:06?', options: ['One', 'Three', 'Five', 'Twelve'], correct: 2, answer: 'Five, in a single progress-note addendum.', problems: [2], clue: 'ack1106' },
    { id: 'donor', q: "Does today's antibiotic cover the donor's bacteria?", options: ['Yes', 'No', 'There is no donor result'], correct: 1, answer: 'No. The result was only in the transplant module.', problems: [7, 12], clue: 'donor' },
    { id: 'medlist', q: 'Which home medication list did the EHR import?', options: ['The outdated March list', 'The September pharmacy fill list', "The daughter's handwritten list"], correct: 0, answer: 'The outdated March list.', problems: [6], clue: 'medlists' },
    { id: 'vitals', q: 'How many places were vitals and weight typed into?', options: ['One', 'Two', 'Three', 'Four'], correct: 2, answer: 'Three.', problems: [8], clue: 'vitals3' },
    { id: 'ews', q: 'Was the early warning score of 5 escalated?', options: ['Yes', 'No'], correct: 1, answer: 'No.', problems: [2, 15], clue: 'ews' },
  ];
  const RANK_PICKS = 5;

  // ---------- Phase 6: the replay ----------

  const HAPPY_ENDING = [
    'The tacrolimus is held.',
    'The antibiotic is switched.',
    'Potassium is treated.',
    'Mr. Whitfield goes to rehab instead of home.',
    'His daughter hears about the pathology in a family meeting.',
    'The new liver keeps working.',
  ];

  // ---------- Phase 1: the bed 14 simulation ----------

  const SIM = (() => {
    const LABS_AT = 165; // 2:45 real time, 13:02 on the ward clock
    const DOWN_AT = 180; // 3:00: screens freeze, orders won't sign, downtime mode
    const OVERRIDE_AT = 60; // 1:00: override buttons appear
    const FAX_AT = 125; // the 84-page fax lands as one image

    // The ward clock: 4 real minutes cover 12:45 to 13:05, with 13:02 at 2:45.
    const KEYS = [[0, 0], [LABS_AT, 17], [DOWN_AT, 18], [240, 20]];
    const clockAt = (sec) => {
      const s = Math.max(0, Math.min(240, sec));
      let i = 1;
      while (i < KEYS.length - 1 && KEYS[i][0] < s) i++;
      const [s0, m0] = KEYS[i - 1];
      const [s1, m1] = KEYS[i];
      const m = 12 * 60 + 45 + Math.floor(m0 + ((s - s0) / (s1 - s0)) * (m1 - m0));
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    };

    // One alert every 15 s, then every 5 s, then faster than anyone can read.
    const SLOTS = [];
    for (let t = 5; t < 60; t += 15) SLOTS.push(t);
    for (let t = 60; t < 120; t += 5) SLOTS.push(t);
    for (let t = 120; t < LABS_AT - 0.5; t += 0.9) SLOTS.push(Math.round(t * 10) / 10);

    const LAB_ALERTS = [
      { id: 'lab_tac', t: LABS_AT, title: 'CRITICAL: tacrolimus 19.4 ng/mL', sub: 'Target 8–12. Redrawn 10:40.', go: 'results', crit: true },
      { id: 'lab_k', t: LABS_AT, title: 'CRITICAL: potassium 6.2 mmol/L', sub: 'Redrawn 10:40. Not hemolyzed.', go: 'results', crit: true },
      { id: 'lab_cr', t: LABS_AT, title: 'CRITICAL: creatinine 2.4 mg/dL', sub: 'Was 1.6 yesterday. Redrawn 10:40.', go: 'results', crit: true },
    ];
    const build = (fillers, keys) => {
      const byT = Object.fromEntries(keys.map((k) => [k.t, k]));
      const list = SLOTS.map((t, i) => {
        if (byT[t]) return byT[t];
        const [title, sub] = fillers[i % fillers.length];
        return { id: `f${i}`, t, title: i < fillers.length ? title : `${title} (reminder)`, sub };
      });
      return [...list, ...LAB_ALERTS];
    };

    const physician = {
      task: '<b>Bed 14 is getting worse.</b> Find out why, log what you find and where, and record your six decisions.',
      tabs: [['summary', 'Summary'], ['notes', 'Notes'], ['results', 'Results'], ['mar', 'Orders & MAR'], ['medrec', 'Med Rec'], ['imaging', 'Imaging'], ['media', 'Media'], ['transplant', 'Transplant Module']],
      alerts: build([
        ['Advance care planning not documented', 'Required for patients 60 and older'],
        ['Duplicate order: CBC with differential', 'Ordered by 2 providers'],
        ['Sepsis model score: 0.41', 'Model not validated for transplant patients'],
        ['Opioid prescribing: PDMP check required', 'oxycodone 5 mg PO q4h PRN'],
        ['Co-signature required', '3 verbal orders from 09/28'],
        ['Pneumococcal vaccine status unknown', 'Health maintenance topic'],
        ['Foley catheter day 6', 'Is it still indicated? (CAUTI bundle)'],
        ['Unsigned note', 'Progress note 09/28 07:35'],
        ['Antibiotic time-out due', 'ceftriaxone day 1: confirm indication'],
        ['Glucose 312 mg/dL at 12:30', 'Sliding-scale insulin dose due'],
        ['Discharge med rec not started', 'Expected discharge 10/02'],
        ['Coding query', 'Clarify "acute" vs "chronic" kidney disease'],
        ['Telemetry order: none active', 'Consider if indicated'],
        ['Home medication list: 2 items unverified', 'Verify with patient or pharmacy'],
        ['Your password expires in 3 days', 'Change it in Tools → Security'],
        ['Wrong-patient check', 'You have 2 charts open'],
      ], [{ id: 'aki', t: 50, title: 'Creatinine up ≥ 0.3 mg/dL in 48 h', sub: '1.2 → 1.6 mg/dL. Possible acute kidney injury.', go: 'results', crit: true }]),
      pages: [
        { id: 'pharm', t: 8, from: 'Transplant pharmacy', text: "The insurer's prior authorization for tacrolimus has been pending since 09/28. Discharge prescriptions may be delayed.", replies: ['Thanks, noted.', 'Please escalate to case management.'] },
        { id: 'emily1', t: 22, from: 'Emily Whitfield (daughter) · portal', text: "Dad's hands are shaking and he keeps asking what day it is. Is that the new medicines? I've called twice about the fever and nobody called back. Is Thursday still the plan?", replies: ["Thank you. We're looking into it now, and I'll call you today.", 'A tremor is a common side effect. Nothing to worry about.', 'Yes, Thursday is still the plan.'] },
        { id: 'rad', t: 40, from: 'Radiology reading room', text: 'Please call back about the bed 14 liver Doppler from 09/28. Ext 4410.', replies: ['Call back now.', 'Later.'],
          then: { on: 0, after: 8, from: 'Dr. Lin, Radiology', text: 'The impression on that Doppler auto-filled from our normal template. Please read the findings: the hepatic artery flow has dropped a lot since 09/24.' } },
        { id: 'beds', t: 72, from: 'Bed management', text: 'Bed 14 is flagged for discharge 10/02. Please start discharge med rec by 15:00.', replies: ['Discharge is on hold.', 'Will do.'] },
        { id: 'emily2', t: 95, from: 'Emily Whitfield (daughter) · portal', text: 'The surgeon said they would look at the old liver. Is the cancer gone now?', replies: ["Let's sit down together in a family meeting today.", 'Yes, it is all gone.', "I'll check and get back to you."] },
        { id: 'him', t: FAX_AT, from: 'Health information management', text: "84-page fax from St. Mary's Medical Center received. Scanned to Media as one image.", replies: ['Acknowledged.'] },
        { id: 'pt', t: 150, from: 'Physical therapy', text: 'PT and OT recommend inpatient rehab, not home. See the therapy note from 09/28.', replies: ['Thanks. Discharge is on hold.', 'Noted.'] },
        { id: 'rn', t: 195, from: 'Priya Shah, RN · 6 West', text: 'The EHR is down on our side too. What do you want for bed 14? I need verbal orders.', replies: ['Coming to the bedside with verbal orders.', 'Wait until the system is back.'] },
      ],
      decisions: [
        { id: 'tac', q: "Tonight's tacrolimus", options: [['continue', 'Continue'], ['reduce', 'Reduce'], ['hold', 'Hold']], best: ['hold'] },
        { id: 'abx', q: 'The antibiotic (ceftriaxone)', options: [['keep', 'Keep it'], ['switch', 'Switch it']], best: ['switch'] },
        { id: 'anticoag', q: 'The blood thinner (apixaban)', options: [['restart', 'Restart'], ['hold', 'Keep holding']], best: ['hold'] },
        { id: 'imaging', q: 'Imaging today', options: [['none', 'None'], ['us', 'Repeat Doppler'], ['cta', 'CT angiography']], best: ['us', 'cta'] },
        { id: 'discharge', q: 'October 2 discharge', options: [['stands', 'Stands'], ['cancel', 'Cancel']], best: ['cancel'] },
        { id: 'care', q: 'Level of care', options: [['floor', 'Stay on the floor'], ['higher', 'Higher level of care']], best: ['higher'] },
      ],
    };

    const nurse = {
      task: '<b>You have four patients, and bed 14 is getting worse.</b> Chart, scan and answer alerts for bed 14. Log what you find and where.',
      tabs: [['summary', 'Worklist'], ['mar', 'MAR'], ['flow', 'Flowsheets'], ['assess', 'Assessments'], ['notes', 'Notes'], ['results', 'Results'], ['orders', 'Orders'], ['medrec', 'Med Rec'], ['media', 'Media'], ['transplant', 'Transplant Module']],
      alerts: build([
        ['Fall risk reassessment due', 'Required every shift'],
        ['Pain reassessment overdue', 'Last charted: 4 h 12 min ago'],
        ['Intake & output not charted', 'Current shift'],
        ['Skin assessment due', 'Braden score required'],
        ['Patient education not documented', 'Topic: new medications'],
        ['Bed 12: call light', 'Requesting pain medicine'],
        ['Scanner battery low', 'Dock device at end of shift'],
        ['Isolation cart needs restocking', 'Protective isolation, bed 14'],
        ['IV site assessment due', 'Required every 4 hours'],
        ['Bed 16: call light', 'Needs help to the bathroom'],
        ['Care plan needs update', 'Last updated: 26 hours ago'],
        ['Hourly rounding not documented', 'Last charted: 12:00'],
        ['Bed 11: dressing change due', 'Ordered daily'],
        ['Discharge planning screen due', 'Target discharge 10/02'],
        ['Duplicate task: vital signs', 'Appears on two worklists'],
        ['Telemetry box battery low', 'Bed 14'],
      ], [{ id: 'ews', t: 35, title: 'Early warning score: 5', sub: 'Notify provider per policy.', go: 'summary', crit: true }]),
      pages: [
        { id: 'charge', t: 6, from: 'Charge nurse', text: 'You also have beds 11, 12 and 16 today. Bed 12 is asking for pain medicine.', replies: ["I'll get to bed 12 after bed 14.", 'Can someone cover bed 12?'] },
        { id: 'emily', t: 18, from: 'Emily Whitfield (daughter) · phone', text: "This is my third call today. Dad has a fever and he's confused. Is he still coming home Thursday? Nobody calls me back.", replies: ["I'm with him now. I'll ask the doctors to call you.", "He's fine, it's just a small fever.", 'Yes, Thursday is still the plan.'] },
        { id: 'pharm', t: 40, from: 'Pharmacy', text: 'Glucose 312: insulin lispro 8 units due now.', replies: ['Will give.', 'Holding; will ask the team.'] },
        { id: 'surg', t: 80, from: 'Transplant surgery · secure chat', text: 'Might change the tacrolimus later. Will put in an order.', replies: ['Please call me before the 21:00 dose.', 'OK.'] },
        { id: 'diet', t: 105, from: 'Dietitian', text: 'Renal low-potassium diet started yesterday. Please encourage the low-K menu.', replies: ['OK.'] },
        { id: 'him', t: FAX_AT, from: 'Health information management', text: "84-page fax from St. Mary's Medical Center received. Scanned to Media as one image.", replies: ['Acknowledged.'] },
        { id: 'pt', t: 150, from: 'Physical therapy', text: 'PT and OT recommend inpatient rehab, not home. See the therapy note from 09/28.', replies: ['I will tell the team.', 'Noted.'] },
        { id: 'down', t: 195, from: 'Charge nurse', text: "EHR is down. Use the paper downtime MAR. The physicians can't see orders either.", replies: ['Calling the team to the bedside now.', 'Waiting for the system.'] },
      ],
      assessments: ['Vital signs and EWS', 'Neuro check', 'Intake and output', 'Glucose check', 'Fall risk (Morse)', 'Skin (Braden)', 'Pain reassessment', 'Patient education', 'Care plan update'],
      decisions: [
        { id: 'call', q: 'Call a physician to the bedside now?', options: [['now', 'Yes, now'], ['page', 'Page and wait'], ['recheck', 'Recheck in 1 hour']], best: ['now'] },
        { id: 'doses', q: 'The next doses', options: [['give', 'Give as ordered'], ['hold', 'Hold and ask first']], best: ['hold'] },
        { id: 'cantwait', q: "Assessments that can't wait (pick any)", multi: true, options: [['vitals', 'Vital signs and EWS'], ['neuro', 'Neuro check'], ['io', 'Intake and output'], ['glucose', 'Glucose check'], ['fall', 'Fall risk'], ['skin', 'Skin'], ['pain', 'Pain'], ['edu', 'Education'], ['care', 'Care plan']], best: ['vitals', 'neuro', 'io', 'glucose'] },
        { id: 'daughter', q: 'What do you tell the daughter?', options: [['meeting', 'The team will call and set up a family meeting'], ['discharge', 'Thursday is still the plan'], ['nothing', 'Nothing yet']], best: ['meeting'] },
        { id: 'handoff', q: 'Your handoff to the night shift', text: true },
      ],
    };

    // Things a careful team finds, and where. A clue counts as found when the player opens it.
    const CLUES = [
      { id: 'labs', label: 'Tacrolimus 19.4, potassium 6.2, creatinine 2.4', where: 'Results, after 13:02' },
      { id: 'tremor', label: 'Hand tremor at 05:30', where: 'Notes → Nursing → night note' },
      { id: 'neph', label: 'Nephrology: hold tacrolimus above 12', where: 'Notes → Consults' },
      { id: 'idc', label: 'ID: fluconazole will raise tacrolimus', where: 'Notes → Consults' },
      { id: 'ddi', label: 'No interaction check when fluconazole was ordered', where: 'MAR → fluconazole' },
      { id: 'ack1106', label: 'Five alerts acknowledged in one line at 11:06', where: 'Notes → Progress → addendum' },
      { id: 'stale', label: 'Progress notes copy forward a 3-day-old level', where: 'Notes → Progress' },
      { id: 'donor', label: "Donor culture: ESBL Klebsiella, resistant to ceftriaxone", where: 'Transplant module' },
      { id: 'us_body', label: 'Hepatic artery flow down in the ultrasound body', where: 'Imaging → full report' },
      { id: 'ecg', label: 'Unreviewed ECG, QTc 492 ms', where: 'Media → ECG' },
      { id: 'ews', label: 'Early warning score 5, no physician called', where: 'Summary / Worklist vitals' },
      { id: 'potassium', label: 'Conflicting potassium orders', where: 'Orders: supplement, protocol, low-K diet' },
      { id: 'medlists', label: 'Three home medication lists; the oldest was imported', where: 'Med Rec → other sources' },
      { id: 'fax_ecoli', label: 'Old resistant E. coli in the outside records', where: 'Media → 84-page fax, page 52' },
      { id: 'vitals3', label: 'Vitals and weight typed into three places', where: 'Flowsheets' },
      { id: 'pathology', label: 'Second tumor on pathology, family not told', where: 'Results → pathology' },
      { id: 'rehab', label: 'Therapy recommends rehab, not home', where: 'Notes → Other → therapy note' },
    ];

    return { LABS_AT, DOWN_AT, OVERRIDE_AT, FAX_AT, clockAt, CLUES, SIDES: { physician, nurse } };
  })();

  const CONTENT = {
    GROUPS, VOTING_GROUPS, ROLE_ORDER, ROLES, GROUP_BRIEF, PROBLEMS, BUDGET, PACKAGE_ORDER, PACKAGES, COMBOS, FINANCE_ASKS,
    QUIZ, QUIZ_SECONDS, QUIZ_ANSWER_SECONDS, RANK_PICKS, HAPPY_ENDING, SIM,
    choiceLetters, normalizeChoice, choiceCost, choiceFixes,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONTENT;
  else root.CONTENT = CONTENT;
})(typeof window !== 'undefined' ? window : globalThis);
