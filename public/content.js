// Game content shared by the server (for validation and scoring) and the browser (for display).
// Source of truth: the "EHR Replacement Game: Facilitator Pack". All prices are five-year totals in $ millions.
(function (root) {
  'use strict';

  const HOSPITAL = 'Riverbend University Hospital';
  const CAP = 45; // board cap on true five-year cost
  const STRETCH_CAP = 50; // only if finance signs a payback case
  const RESERVE = 5; // lost go-live revenue the cash reserve can absorb
  const PASS = 5; // votes needed, out of 7

  // ---------- groups (voting units) and roles (seats) ----------

  const GROUP_ORDER = ['exec', 'finance', 'clinical', 'it', 'compliance', 'patients', 'vendor'];
  const GROUPS = {
    exec: { icon: '🏛️', name: 'Executive leadership and board', short: 'Executives', votes: 2, seats: '3 to 5' },
    finance: { icon: '💰', name: 'Finance and revenue cycle', short: 'Finance', votes: 1, seats: '3 to 5' },
    clinical: { icon: '🩺', name: 'Clinical end users', short: 'Clinical', votes: 1, seats: '8 to 12' },
    it: { icon: '💻', name: 'IT and informatics', short: 'IT', votes: 1, seats: '3 to 5' },
    compliance: { icon: '⚖️', name: 'Compliance, legal, and regulators', short: 'Compliance', votes: 1, seats: '3 to 4' },
    patients: { icon: '🙋', name: 'Patients and patient advocate', short: 'Patients', votes: 1, seats: '2 to 4' },
    vendor: { icon: '🤝', name: 'Vendors', short: 'Vendors', votes: 0, seats: '3 to 5' },
  };
  const TOTAL_VOTES = 7;

  // Clinical end users sit at two tables in Phase 1 (nurses, physicians) and vote as one group.
  const ROLE_ORDER = ['exec', 'finance', 'physician', 'nurse', 'it', 'compliance', 'patients', 'vendor'];

  // `target` is the seat weight used by random assignment (midpoint of the pack's seat range).
  // `side` is which EHR screen the role uses or shadows in Phase 1.
  // `secrets` are the "only you know" facts. A player can publish one to the whole room.
  //   `unlocks` names a contract term that becomes available to every ballot once published.
  const ROLES = {
    exec: {
      group: 'exec', icon: '🏛️', name: 'EXECUTIVE LEADERSHIP & BOARD', plural: 'Executives', short: 'Executive', side: 'physician', target: 4,
      who: 'CEO, COO, board chair',
      goal: 'Leave the room with a decision the board can defend: safer care, a cost you can fund, and no failed go-live.',
      say: '"We decide today. Tell me your single worst problem and what you will give up to fix it."',
      musts: ['The alert storm cannot happen again', 'A decision today', 'Clinical and finance both voting yes'],
      trade: ['Timeline, if a start date is fixed', 'Which optional modules are bought'],
      redline: ['Any deal above $50 million', 'No penalty on the vendor for a missed go-live', 'A plan the clinical group votes against'],
      leverage: 'You hold 2 of the 7 votes and the tie-break. Do not pick a side early. Make finance and clinical negotiate with each other.',
      observe: 'Count how often staff look at the screen and how often at the patient.',
      raise: ['Ask each group for its single worst problem.', 'Ask what happens if the hospital does nothing for a year.', 'Rank problems by patient harm, not by annoyance.'],
      ask: ['Which hospitals our size run this today, and what went wrong at go-live?', 'What do you pay us if the go-live date slips or the system fails?'],
      secrets: [
        { id: 'ex_job', text: 'The board chair told the CEO that a second hospital-wide outage will cost the CEO\'s job.' },
        { id: 'ex_rival', text: 'A competing hospital 12 miles away went live on a full platform last year and is recruiting your nurses.' },
        { id: 'ex_stretch', text: 'The board will stretch the cap from $45M to $50M, but only if finance signs a written payback case.' },
        { id: 'ex_press', text: 'The local newspaper has asked for comment on the Whitfield incident.' },
      ],
      brief: {
        a: 'Fast and cheap, and the board will ask why you are back in 2029.',
        b: 'Looks affordable. A one-day go-live is the kind of risk that ends careers.',
        c: 'Fixes everything. $73M of true cost against a $45M cap.',
        d: 'Fits the cap. You will have to referee which modules get bought.',
      },
    },
    finance: {
      group: 'finance', icon: '💰', name: 'FINANCE & REVENUE CYCLE', plural: 'Finance', short: 'Finance', side: 'nurse', target: 4,
      who: 'CFO, revenue cycle director, budget analyst',
      goal: 'Keep the true five-year cost at or below $45 million and keep cash flowing through go-live.',
      say: '"The sticker price is not the cost. Show me lost revenue, the old system, and what is missing."',
      musts: ['True cost at or under $45M (or a signed payback case up to $50M)', 'Go-live revenue loss of $5M or less', 'Payments tied to milestones'],
      trade: ['You will fund a module if another group shows it saves money', 'A longer contract, for a discount'],
      redline: ['A subscription with a yearly price rise and no end date', 'Go-live before billing is tested with insurers', 'Costs that appear after signing'],
      leverage: 'Package D base has a true cost of $35M. That leaves $10M for modules that cost $34M in total. You decide what the money buys.',
      observe: 'Time how long each task takes. Minutes are money.',
      raise: ['Turn each complaint into a cost: how many minutes per shift does it waste?', 'Ask which problems cause denied claims or late charges.', 'Say out loud what the status quo costs each year.'],
      ask: ['What is not included in the price?', 'Do we pay up front or at milestones?', 'Who carries the loss if go-live revenue falls further than you promised?'],
      secrets: [
        { id: 'fi_reserve', text: 'The cash reserve can absorb $5M of lost revenue at go-live. Above that, the hospital must borrow.' },
        { id: 'fi_statusquo', text: 'Doing nothing is not free: the current EHR costs about $4.2M a year in overtime, turnover, denied claims, and liability reserves.' },
        { id: 'fi_turnover', text: 'Nurse turnover on 6 West is 28%. Replacing one nurse costs about $60,000.' },
        { id: 'fi_sub', text: 'Package C on the 7-year subscription comes to about $88M once the yearly price rise is counted.' },
      ],
      brief: {
        a: 'True cost $9.5M. Cheap now, paid twice when MedCore ends support.',
        b: 'True cost $47.5M: $2.5M over the cap, and its $6M revenue dip is above your reserve.',
        c: 'True cost $73M. $28M over the cap.',
        d: 'True cost $35M for the base. $10M of room for $34M of modules.',
      },
    },
    physician: {
      group: 'clinical', icon: '🧑‍⚕️', name: 'PHYSICIAN (CLINICAL END USER)', plural: 'Physicians', short: 'Physician', side: 'physician', target: 5,
      who: 'CMO, physician champions, pharmacist',
      goal: 'Get time back for patients and make the screen trustworthy again.',
      say: '"I overrode the one alert that mattered because it looked like the other eighty."',
      musts: ['Tiered alerts and critical result paging', 'One medication list', '16 hours of training and floor support at go-live'],
      trade: ['AI scribe ($7M) or inbox triage ($4M): you can give up one', 'Depth of old records brought across'],
      redline: ['Package A alone: a patch on the system that hurt your patient', 'Go-live during flu season (December to February)', 'Any deal nurses and physicians do not both accept'],
      leverage: 'No system works if clinicians do not use it. Say so. You share one vote with the nurses, so agree with them first.',
      observe: '',
      raise: ['Name your top 3 problems from the simulation.', 'Settle differences with the nurses before other groups hear them.', 'Help deliver one list of 10 to 15 problems with the top 3 marked.'],
      ask: ['How does a critical potassium look different from a routine reminder?', 'Who gets paged, and what happens if they do not answer?', 'Who is responsible when the AI scribe writes something wrong?'],
      secrets: [
        { id: 'ph_home', text: 'Physicians spend about 2 hours on the EHR at home each night.' },
        { id: 'ph_override', text: '96% of alerts on 6 West were overridden last month.' },
        { id: 'ph_want', text: 'Physicians want the AI scribe and inbox triage. Nurses want single entry and fewer required fields. You share one vote.' },
        { id: 'ph_train', text: 'Staff will refuse a go-live that comes with less than 16 hours of training and floor support.' },
      ],
      brief: {
        a: 'Fewer pop-ups. Notes, lists, and inbox stay exactly as they are.',
        b: 'One medication list and a searchable chart. No scribe, no inbox help, 8 hours of training.',
        c: 'Everything, including the scribe. You sign what the AI writes.',
        d: 'A good core. The scribe and inbox triage only come if the room pays for them.',
      },
    },
    nurse: {
      group: 'clinical', icon: '👩‍⚕️', name: 'NURSE (CLINICAL END USER)', plural: 'Nurses', short: 'Nurse', side: 'nurse', target: 5,
      who: 'CNO, bedside nurses, case manager',
      goal: 'Get time back for patients and make the screen trustworthy again.',
      say: '"I clicked OK fifteen times and never saw the word potassium."',
      musts: ['Tiered alerts and critical result paging', 'Chart once, not three times', '16 hours of training and floor support at go-live'],
      trade: ['Which physician tool gets funded', 'Timeline'],
      redline: ['Package A alone: a patch on the system that hurt your patient', 'Go-live during flu season (December to February)', 'Any deal nurses and physicians do not both accept'],
      leverage: 'Three nurses have already left 6 West. Every nurse who leaves costs the hospital $60,000. You share one vote with the physicians.',
      observe: '',
      raise: ['Name your top 3 problems from the simulation.', 'Settle differences with the physicians before other groups hear them.', 'Help deliver one list of 10 to 15 problems with the top 3 marked.'],
      ask: ['Show us giving one insulin dose. How many clicks?', 'Do vitals charted once appear everywhere?', 'How many hours of training do we get, and who covers the unit?'],
      secrets: [
        { id: 'nu_resign', text: 'Three nurses on 6 West have resigned since the incident.' },
        { id: 'nu_want', text: 'Nurses want single entry and fewer required fields. Physicians want the AI scribe and inbox triage. You share one vote.' },
        { id: 'nu_train', text: 'Staff will refuse a go-live that comes with less than 16 hours of training and floor support.' },
        { id: 'nu_flu', text: 'January to February is flu season. Units run short-staffed and nobody can be spared for a go-live.' },
      ],
      brief: {
        a: 'Alerts get fixed. Insulin still takes 14 clicks and you still chart everything three times.',
        b: 'Single entry and real alerts, switched on for the whole hospital in one day with 8 hours of training.',
        c: 'Chart once, 16 hours of training, unit-by-unit go-live.',
        d: 'Single entry and real alerts. 16 hours of training only if the $2M training module is bought. Default go-live is January.',
      },
    },
    it: {
      group: 'it', icon: '💻', name: 'IT & INFORMATICS', plural: 'IT', short: 'IT', side: 'physician', target: 4,
      who: 'CIO, CMIO, CNIO, integration lead, security lead',
      goal: 'End up with a system your team can run safely: stable under load, connected to everything, old data intact.',
      say: '"Nothing was broken. Every part did what it was built to do in 2011. That is the problem."',
      musts: ['Alert limits and a backup that does not share queues', 'Interoperability hub ($6M) or the same work funded another way', 'A phased go-live, unit by unit'],
      trade: ['Depth of data migration: 3 years or 10', 'Hosting model'],
      redline: ['A single-day go-live in under 14 months', 'Go-live with no load test', 'An AI module your team must maintain with no added staff'],
      leverage: 'You know two costs that are missing from Package B, and when MedCore support ends. Decide when to reveal them.',
      observe: 'Note what sets off each burst of alerts.',
      raise: ['Explain the crash in plain words: results resent, no limit on alerts, backup sharing the same queue.', 'Separate design flaws from settings you could fix this month.', 'Admit which fixes you asked for in past years that were not funded.'],
      ask: ['Show the load test. How many alerts per minute before it slows?', 'Who rebuilds the 43 interfaces, you or us?', 'How many years of old records come across?'],
      secrets: [
        { id: 'it_eol', text: 'MedCore ends support for the current EHR in December 2029. Package A would have to be replaced within 3 years anyway.' },
        { id: 'it_bhidden', text: 'Package B hides $5M: a $3M server replacement in year 3 and $2M of contractors for a one-day go-live.', fact: 'b_hidden' },
        { id: 'it_interfaces', text: 'The hospital has 43 interfaces and 6 integration engineers. Package D base rebuilds only the 20 most critical; the other 23 are your job unless the interoperability hub is bought.' },
        { id: 'it_security', text: 'Your last security test found unpatched servers. Cloud-hosted packages (C and D) move that risk to the vendor.' },
      ],
      brief: {
        a: 'A software update on a product that loses support in 2029.',
        b: 'Your servers, your 43 interfaces, one day. $5M of cost is missing from the sheet.',
        c: 'Vendor cloud, 10 years migrated, vendor rebuilds every interface.',
        d: 'Vendor cloud. Only 20 interfaces rebuilt unless the interoperability hub is bought.',
      },
    },
    compliance: {
      group: 'compliance', icon: '⚖️', name: 'COMPLIANCE, LEGAL & REGULATORS', plural: 'Compliance', short: 'Compliance', side: 'nurse', target: 3.5,
      who: 'Privacy officer, legal counsel, patient safety officer, state regulator',
      goal: 'Keep the hospital lawful, cut the number of reportable events, and make sure every AI tool has an owner.',
      say: '"Who was responsible for the sepsis model?" (Then wait for the silence.)',
      musts: ['AI governance ($3M module, or the same thing by another route)', 'Audit trails and tested downtime procedures', 'Something in place within 60 days for critical results'],
      trade: ['Timeline, if an interim fix covers the 60 days', 'Which patient-facing module is bought'],
      redline: ['Any AI tool, including the scribe, without governance', 'A contract with a data exit fee', 'Go-live without a downtime drill on every unit'],
      leverage: 'You have one vote. You can also declare a deal "non-compliant" out loud, and the executives must answer you in front of the room.',
      observe: 'Note every event you would have to report.',
      raise: ['Mark which problems are reportable safety or privacy risks.', 'Point out that the 60-day deadline arrives before any full replacement can go live.', 'Ask who was responsible for the sepsis model.'],
      ask: ['Who is liable when your AI tool is wrong?', 'Can we see every override and every alert in an audit trail?', 'What does it cost to get our data back if we leave?'],
      secrets: [
        { id: 'co_60', text: 'The state health department has opened a review. The hospital must file a corrective plan within 60 days covering critical results and the sepsis model.' },
        { id: 'co_ai', text: 'Without an AI governance process, the sepsis model stays switched off and no new AI tool (including a scribe) can be switched on.' },
        { id: 'co_portal', text: 'Federal rules require that patients get their own records without delay. The current portal shows results 3 days late.' },
        { id: 'co_exit', text: 'The vendor\'s standard contract charges $1.5M to export the hospital\'s data if it ever leaves.' },
        { id: 'co_premium', text: 'The malpractice insurer will raise premiums by $800,000 a year unless corrective action starts within 6 months.' },
        { id: 'co_fraud', text: 'Copied-forward notes that describe exams nobody performed are a billing fraud risk.' },
      ],
      brief: {
        a: 'Paging could meet the 60-day deadline. No governance, so the sepsis model stays off.',
        b: 'Audit trails, but no AI governance and nothing live inside 60 days.',
        c: 'Governance and audit trails included. Read the exit clause.',
        d: 'Compliant only if governance is bought or won as a term, and something covers the 60 days.',
      },
    },
    patients: {
      group: 'patients', icon: '🙋', name: 'PATIENTS & PATIENT ADVOCATE', plural: 'Patients', short: 'Patient advocate', side: 'nurse', target: 3,
      who: 'Patient advocate, Emily Whitfield (daughter), patient council member',
      goal: 'Make sure no other family goes through what the Whitfields did, and that patients can see and understand their own records.',
      say: '"My father watched his nurse click for three minutes. Who was looking at him?"',
      musts: ['Discharge hub ($5M) or patient portal upgrade ($3M): at least one', 'A patient seat on the go-live committee', 'Public notice of any appointment cuts'],
      trade: ['Which of the two patient modules', 'Timeline'],
      redline: ['A deal with nothing patient-facing in it', 'An AI scribe that records visits without patient consent', 'Being told "phase two" with no date'],
      leverage: 'You have one vote and the only story in the room that is not about money. A complaint to the state would make the regulator\'s review harder for everyone.',
      observe: 'Note what Mr. Whitfield and his daughter would see and feel.',
      raise: ['Tell the incident from the bedside.', 'Ask which problems on the list a patient can feel.', 'Ask who tells the family when something goes wrong.'],
      ask: ['What does the patient see, and in which languages?', 'How does a family find out about a critical result?', 'What happens to appointments during go-live?'],
      secrets: [
        { id: 'pa_phone', text: 'Emily Whitfield learned about her father\'s potassium from a nurse on the phone. The portal showed it 3 days later.' },
        { id: 'pa_complaint', text: 'The family is considering a formal complaint to the state.' },
        { id: 'pa_survey', text: 'In the patient council survey, 62% of patients over 65 said they cannot use the current portal.' },
        { id: 'pa_discharge', text: 'Mr. Whitfield\'s discharge needed 9 tasks tracked in 6 places. Nobody could tell the family the plan.' },
        { id: 'pa_cuts', text: 'During any go-live, clinic appointments are cut by 20% to 30% for several weeks, and patients are rarely told why.' },
      ],
      brief: {
        a: 'Safer alerts. Nothing a patient or family will ever see.',
        b: 'Nothing patient-facing, and clinics cut 30% for five weeks.',
        c: 'Discharge hub and a portal families can use.',
        d: 'Patient-facing only if the discharge hub or the portal upgrade is bought.',
      },
    },
    vendor: {
      group: 'vendor', icon: '🤝', name: 'VENDORS', plural: 'Vendors', short: 'Vendor', side: 'physician', target: 4,
      who: 'Northwind sales lead, solution architect, implementation lead, MedCore representative',
      goal: 'Sign the largest deal you can actually deliver, and win a hospital that will recommend you to others.',
      say: '"Here are the three problems from your list this package fixes, what it costs, and the one thing it does not do."',
      musts: ['A signed deal today', 'A realistic timeline', 'A reference site if possible'],
      trade: ['Discount, exit fee, governance module, revenue refund', 'Go-live month, bridge product'],
      redline: ['More than 8% off', 'Package B in under 14 months', 'Penalties with no cap'],
      leverage: 'You are the only group that can change the prices. Visit every table, find out who needs what, and put an offer on the table when it wins you a vote.',
      observe: 'Note three problems you can sell a fix for.',
      raise: ['Listen. You may not speak in Phase 2.', 'Map each problem you hear to a package or module.', 'Note which group cares about which problem.'],
      ask: [],
      secrets: [
        { id: 've_discount', text: 'You can take 8% off the base price of B, C, or D in exchange for a 7-year contract.', unlocks: 'term7' },
        { id: 've_reference', text: 'You can give the AI governance module free if the hospital agrees to be a public reference site.', unlocks: 'reference' },
        { id: 've_exit', text: 'You can waive the $1.5M data exit fee. Do it only if asked directly.', unlocks: 'exitfee' },
        { id: 've_refund', text: 'You can refund up to $2M if go-live revenue falls further than promised, if the hospital commits to 16 hours of training.', unlocks: 'refund' },
        { id: 've_bridge', text: 'You have a bridge product: an alert-tiering layer on the current EHR, $2M, live in 8 weeks. Offer it if someone asks what can be done within 60 days.', unlocks: 'bridge' },
        { id: 've_penalty', text: 'You can accept a capped penalty if the go-live date slips. Never an uncapped one.', unlocks: 'penalty' },
        { id: 've_scribe', text: 'The AI scribe is new. It runs at 3 hospitals and you have no accuracy data for transplant or intensive care patients.' },
        { id: 've_bonus', text: 'The sales lead\'s bonus depends on selling Package C.' },
        { id: 've_medcore_eol', text: 'MedCore rep: MedCore ends support for this product in December 2029. Say so only if asked directly.' },
        { id: 've_medcore_fee', text: 'MedCore rep: if the hospital leaves, MedCore charges $1.2M to help extract the data. You can drop to $0.4M.', unlocks: 'medcorefee' },
        { id: 've_medcore_paging', text: 'MedCore rep: you can switch on critical result paging in 6 weeks, ahead of the rest of Package A.', unlocks: 'paging' },
      ],
      brief: {
        a: 'MedCore\'s pitch. Quick, cheap, and it keeps the account until support ends.',
        b: 'An honest core replacement. Do not promise it faster than 14 months.',
        c: 'The deal your bonus wants. The room cannot afford it unless they take the subscription.',
        d: 'The deal most likely to pass. Your levers decide which modules fit.',
      },
    },
  };

  // ---------- the 15 problems ----------

  const PROBLEMS = [
    { id: 'clicks', n: 1, cat: 'Efficiency', label: 'Too many clicks', desc: 'A simple task such as one insulin dose takes a dozen clicks across several screens.' },
    { id: 'alerts', n: 2, cat: 'Safety', label: 'Alert fatigue', desc: 'Constant low-value warnings; the one that matters looks like all the others.' },
    { id: 'bloat', n: 3, cat: 'Documentation', label: 'Note bloat', desc: 'Progress notes run to 11 pages; you cannot tell what changed today.' },
    { id: 'copy', n: 4, cat: 'Documentation', label: 'Copy-paste, outdated information', desc: 'Old diagnoses, exams, and plans are carried forward after they stop being true.' },
    { id: 'find', n: 5, cat: 'Efficiency', label: 'Information is hard to find', desc: 'You know the result or note exists but cannot locate it in the chart.' },
    { id: 'medrec', n: 6, cat: 'Safety', label: 'Medication reconciliation', desc: 'Three medication lists disagree; nobody knows what the patient actually takes.' },
    { id: 'interop', n: 7, cat: 'Communication', label: 'Poor interoperability', desc: 'Outside records arrive as an unsearchable fax, or not at all.' },
    { id: 'dupes', n: 8, cat: 'Documentation', label: 'Duplicate data entry', desc: 'The same vitals and values must be typed into several modules.' },
    { id: 'docburden', n: 9, cat: 'Workflow', label: 'Documentation burden', desc: 'Required fields, checkboxes, and billing items crowd out the patient.' },
    { id: 'inbox', n: 10, cat: 'Workflow', label: 'Inbox overload', desc: 'Hundreds of messages and notifications, none marked urgent.' },
    { id: 'handoff', n: 11, cat: 'Communication', label: 'Poor handoffs between teams', desc: 'Nurse, physician, pharmacy, and consultants each see a different plan.' },
    { id: 'buried', n: 12, cat: 'Safety', label: 'Important results get buried', desc: 'A critical value sits among dozens of routine results and notices.' },
    { id: 'ui', n: 13, cat: 'Usability', label: 'Poor interface design', desc: 'Tabs, tables, and dropdowns everywhere; every warning is the same yellow box.' },
    { id: 'discharge', n: 14, cat: 'Workflow', label: 'Discharge fragmentation', desc: 'Orders, appointments, prescriptions, transport, and referrals live in different places.' },
    { id: 'ai', n: 15, cat: 'Safety', label: 'Weak decision support and AI', desc: 'A prediction tool fires with no known accuracy, owner, or monitoring.' },
  ];
  const ALL_IDS = PROBLEMS.map((p) => p.id);
  const CORE_FULL = ['clicks', 'alerts', 'find', 'medrec', 'dupes', 'buried', 'ui'];

  // ---------- packages ----------

  const PACKAGE_ORDER = ['a', 'b', 'c', 'd'];
  const PACKAGES = {
    a: {
      letter: 'A', icon: '🩹', name: 'STABILIZE', seller: 'MedCore', tagline: 'Keep the current EHR and repair the alert system.',
      price: 9, lost: 0.5, old: 0, months: 4, golive: 'February 2027', style: 'Software update', hosting: 'Hospital servers',
      training: '2 hours', records: 'Stay in place',
      includes: ['Alert tiers, limits, and duplicate suppression', 'Critical result paging', 'Separate backup queue'],
      leaves: 'Notes, medication lists, outside records, inbox, and discharge stay as they are.',
      catchline: 'Quick and cheap, and it leaves 13 of the 15 problems in place.',
      fixes: ['alerts', 'buried'], partial: ['ui', 'ai'],
      alertsAfter: 38,
      headline: 'The alarm is fixed. The building is not.',
      whitfield: 'The potassium paged Dr. Raman in under a minute. The fluconazole warning still looked like every other warning.',
      cards: ['Replay: 38 alerts where there were 347. No crash.', 'Three medication lists remain. Notes are still 11 pages.', 'Two more nurses leave 6 West within the year.', 'In 2029 MedCore ends support and the hospital starts over, $9.5M poorer.'],
      outcome: {
        exec: 'No second outage. In 2029 MedCore ends support and you are back in this room, $9.5M poorer.',
        finance: 'The cheapest contract you ever signed. The $4.2M a year the old system costs never moved.',
        physician: 'Fewer pop-ups. Notes are still 11 pages and the three medication lists still disagree.',
        nurse: '38 alerts where there were 347. Insulin still takes 14 clicks. Two more nurses left 6 West.',
        it: 'Four months and no migration. You start the real replacement in 2028 with the same six engineers.',
        compliance: 'No AI governance: the sepsis model is off and nothing governs the next AI tool.',
        patients: 'Nothing changed for families. Results still reach the portal 3 days late.',
        vendor: 'MedCore kept the account for three more years. Northwind left with nothing.',
      },
    },
    b: {
      letter: 'B', icon: '🔁', name: 'CORE REPLACE', seller: 'Northwind', tagline: 'A new EHR core, installed in one go.',
      price: 38, lost: 6, old: 3.5, hidden: 5, months: 14, golive: 'March 2028', style: 'Whole hospital in one day', hosting: 'Hospital servers',
      training: '8 hours', records: '3 years',
      includes: ['Tiered alerts and one medication list', 'Single data entry and chart search', 'Cleaner screens', 'Basic outside record import'],
      leaves: 'Inbox triage, discharge hub, AI governance, AI scribe, patient portal upgrade.',
      catchline: 'A one-day switch for the whole hospital, with 8 hours of training.',
      fixes: CORE_FULL, partial: ['bloat', 'copy', 'interop', 'docburden', 'handoff'],
      alertsAfter: 40,
      headline: 'New system, hard landing.',
      whitfield: 'One medication list and 40 alerts. His outside records were still a scanned fax, and nobody was watching the sepsis model because it was off.',
      cards: ['The whole hospital switches in one day. Clinic visits are cut 30% for 5 weeks.', 'Lost revenue reaches $6M, above the reserve. The hospital borrows.', 'With 8 hours of training, help desk calls triple. Two units go back to paper for a day.', 'In year 3 a $3M server bill arrives that nobody budgeted.'],
      outcome: {
        exec: 'The one-day go-live made the newspaper. The board asked why nobody mentioned the server bill.',
        finance: 'Lost revenue hit $6M, above the reserve, and you borrowed. Servers and contractors added $5M nobody budgeted.',
        physician: 'One medication list and a chart you can search. The inbox is still 140 unread and notes are only partly better.',
        nurse: 'Single entry and working alerts. Eight hours of training was not enough; two units went back to paper for a day.',
        it: 'You rebuilt 43 interfaces for a single cutover with contractors. In year 3 you replace the servers.',
        compliance: 'No AI governance, so the sepsis model stays off. Audit trails are finally real.',
        patients: 'Clinic visits were cut 30% for five weeks. Nothing in the package was built for patients.',
        vendor: 'A solid sale and a rough reference. The hospital tells other buyers about go-live week.',
      },
    },
    c: {
      letter: 'C', icon: '🏥', name: 'COMPLETE CARE PLATFORM', seller: 'Northwind', tagline: 'Everything Northwind makes.',
      price: 64, lost: 4, old: 5, months: 20, golive: 'April to September 2028', style: 'Unit by unit', hosting: 'Vendor cloud',
      training: '16 hours', records: '10 years',
      includes: ['Everything in B', 'Every module on the menu', 'Round-the-clock vendor support'],
      leaves: 'Nothing on the list of 15 problems.',
      catchline: 'The price. Or a 7-year subscription at $11.5M a year, rising 6% a year after year 3.',
      fixes: ALL_IDS, partial: [],
      alertsAfter: 12,
      headline: 'Everything fixed. Everything mortgaged.',
      whitfield: 'Twelve alerts. The tacrolimus interaction showed in red and could not be dismissed with one click. Emily saw the results the same day.',
      cards: ['The board accepts only the 7-year subscription: about $88M in total.', 'To pay for it, the hospital freezes hiring and delays its new cancer wing.', 'All 15 problems are addressed by September 2028.', 'The price rises 6% a year from year 4. Leaving would cost more than staying.'],
      outcome: {
        exec: 'The board took the 7-year subscription. Hiring froze and the cancer wing slipped two years.',
        finance: 'About $88M over seven years, rising 6% a year from year 4. Leaving would cost more than staying.',
        physician: 'Notes write themselves and the inbox is triaged. You check every AI draft, because you sign it.',
        nurse: 'Chart once, 16 hours of training, a quiet go-live. The hiring freeze means the unit is still short.',
        it: 'Vendor cloud, 10 years migrated, round-the-clock support. Your team now manages a contract instead of servers.',
        compliance: 'Every AI tool has an owner and a dashboard. The exit clause is the thing you watch.',
        patients: 'One discharge screen families can see and a portal that explains results. The delayed cancer wing is the price.',
        vendor: 'The biggest deal of the year. The sales lead got the bonus.',
      },
    },
    d: {
      letter: 'D', icon: '🧩', name: 'MODULAR CORE', seller: 'Northwind', tagline: 'A smaller core now, modules as the hospital can afford them.',
      price: 27, lost: 5, old: 3, months: 12, golive: 'January 2028', style: 'Unit by unit', hosting: 'Vendor cloud',
      training: '8 hours (16 with a module)', records: '3 years (10 with a module)',
      includes: ['Tiered alerts and one medication list', 'Single data entry and chart search', 'Cleaner screens', '20 critical interfaces rebuilt'],
      leaves: 'Anything on the module menu that is not bought.',
      catchline: 'Modules bought later cost 15% more, and the default go-live falls in January.',
      fixes: CORE_FULL, partial: ['copy', 'handoff'],
      alertsAfter: 40,
      headline: 'A core that works, and the modules you could afford.',
      whitfield: 'Forty alerts, one medication list, single entry, no crash.',
      cards: ['Replay: 40 alerts, one medication list, single entry, no crash.', 'Everything else depends on which modules the room bought.'],
      outcome: {
        exec: 'Under the cap and live unit by unit. What you left off the list is next year\'s argument.',
        finance: 'You kept the deal inside the cap. Modules bought later cost 15% more.',
        physician: 'One medication list, a searchable chart, fewer clicks.',
        nurse: 'Single entry and alerts you can trust.',
        it: 'Cloud-hosted and phased, the way you asked.',
        compliance: 'Audit trails and tested failover came with the core.',
        patients: 'The core is safer. What families can see depends on the modules.',
        vendor: 'A smaller deal than you wanted, and a client who will buy more if this goes well.',
      },
    },
    keep: {
      letter: 'X', icon: '🚫', name: 'NO DEAL', seller: '', tagline: 'Sign nothing. Keep the current EHR.',
      price: 0, lost: 0, old: 0, months: 0, golive: '', style: '', hosting: '', training: 'None', records: '',
      includes: [], leaves: '', catchline: '', fixes: [], partial: [], alertsAfter: 347,
      headline: 'No deal.',
      whitfield: 'Five months later a second alert storm hit the intensive care unit.',
      cards: ['The regulator imposes its own corrective plan with monthly audits.', 'Five months later a second alert storm hits the intensive care unit.', 'The board replaces the CEO and reopens the search with a smaller budget.'],
      outcome: {
        exec: 'The board replaced the CEO and reopened the search with a smaller budget.',
        finance: 'You spent nothing and lost $4.2M again this year.',
        physician: 'Still 347 alerts on a bad day.',
        nurse: 'Three more nurses left 6 West.',
        it: 'Emergency fixes with no budget, until support ends in 2029.',
        compliance: 'The regulator imposed its own plan with monthly audits.',
        patients: 'The Whitfields filed their complaint.',
        vendor: 'No sale. You left your card.',
      },
    },
  };

  // ---------- Package D module menu ----------
  // `role` is whose outcome card the result lands on.
  const MODULES = [
    { id: 'scribe', icon: '🎙️', label: 'AI scribe', price: 7, fixes: ['bloat', 'docburden', 'copy'], solves: 'Note bloat, documentation burden, copied text', role: 'physician',
      bought: 'Notes are written from the conversation. Physicians go home on time.', not: 'Notes stay at 11 pages.' },
    { id: 'interop', icon: '🔗', label: 'Interoperability hub', price: 6, fixes: ['interop'], solves: 'Outside records, the remaining 23 interfaces', role: 'it',
      bought: 'The outside fax arrives as searchable data. The resistant infection is flagged on the antibiotic order.', not: 'Outside records are still scanned images. IT spends a year rebuilding 23 interfaces.' },
    { id: 'discharge', icon: '🚪', label: 'Discharge hub', price: 5, fixes: ['discharge', 'handoff'], solves: 'Discharge fragmentation, handoffs', role: 'patients',
      bought: 'Nine discharge tasks sit on one screen that the family can see.', not: 'The case manager still works from sticky notes.' },
    { id: 'inbox', icon: '📥', label: 'Inbox triage', price: 4, fixes: ['inbox'], solves: 'Inbox overload, buried results', role: 'physician',
      bought: 'Critical results rise to the top of the inbox.', not: 'Dr. Raman has 140 unread items.' },
    { id: 'migration', icon: '🗄️', label: 'Full 10-year data migration', price: 4, fixes: [], solves: 'Old records stay searchable', role: 'it',
      bought: 'Ten years of records are searchable.', not: 'The 2023 contrast dye reaction sits in a read-only archive and is missed.' },
    { id: 'governance', icon: '🧭', label: 'AI governance dashboard', price: 3, fixes: ['ai'], solves: 'Unmonitored prediction tools', role: 'compliance',
      bought: 'The sepsis model is reviewed, retuned, and switched back on with a named owner.', not: 'The sepsis model stays off, and no AI tool may run.' },
    { id: 'portal', icon: '📱', label: 'Patient portal upgrade', price: 3, fixes: [], solves: 'Late results for patients, family communication', role: 'patients',
      bought: 'Emily sees the potassium result the same day, with a plain explanation.', not: 'Results reach families 3 days late. The Whitfields file their complaint.' },
    { id: 'training', icon: '🎓', label: 'Extended training and floor support', price: 2, fixes: [], solves: 'Raises training from 8 to 16 hours', role: 'nurse',
      bought: 'Sixteen hours of training and help on the floor. Go-live is quiet.', not: 'Help desk calls triple. Two units go back to paper for a day.' },
  ];

  // ---------- contract terms ----------
  // `gate` is the secret that must be published before the term appears on ballots.
  // `needs` is a group whose own support is required on top of the room's.
  const TERMS = [
    { id: 'term7', label: '7-year contract for 8% off the base price', desc: 'Lock in for seven years; the vendor discounts the base price.', applies: ['b', 'c', 'd'], gate: 've_discount', role: 'finance', discount: 0.08,
      effect: 'A 7-year term bought 8% off the base price. You are tied to Northwind until 2034.' },
    { id: 'reference', label: 'Reference site: AI governance module free', desc: 'The hospital speaks publicly for the vendor; governance comes at no charge.', applies: ['d'], gate: 've_reference', role: 'compliance', freeModule: 'governance',
      effect: 'As a public reference site, the hospital got AI governance at no charge.' },
    { id: 'bridge', label: 'Bridge alert layer, live in 8 weeks', desc: 'Alert tiering on the current EHR until go-live. Meets the 60-day deadline.', applies: ['b', 'c', 'd'], gate: 've_bridge', role: 'compliance', cost: 2,
      effect: 'The regulator accepted the corrective plan. Alerts were fixed by December 2026.',
      missing: 'Nothing was in place within 60 days. The regulator imposed monthly audits, and a second alert storm hit before go-live.' },
    { id: 'paging', label: 'Critical result paging switched on in 6 weeks', desc: 'MedCore turns paging on ahead of the rest of Package A.', applies: ['a'], gate: 've_medcore_paging', role: 'compliance',
      effect: 'Paging went live in 6 weeks, and the regulator accepted the corrective plan.',
      missing: 'Nothing was in place within 60 days. The regulator imposed monthly audits.' },
    { id: 'exitfee', label: 'Data exit fee waived', desc: 'No $1.5M charge to get the hospital\'s data back.', applies: ['b', 'c', 'd'], gate: 've_exit', role: 'compliance',
      effect: 'The $1.5M data exit fee was struck from the contract.',
      missing: 'The contract still charges $1.5M to export your data if you ever leave.' },
    { id: 'refund', label: 'Vendor refunds up to $2M if go-live revenue dips too far', desc: 'Requires 16 hours of training per clinician.', applies: ['c', 'd'], gate: 've_refund', role: 'finance', needsModule: 'training',
      effect: 'Go-live dipped $1M further than promised. The vendor refunded it.' },
    { id: 'penalty', label: 'Capped penalty if the go-live date slips', desc: 'The vendor pays if it misses the date.', applies: ['b', 'c', 'd'], gate: 've_penalty', role: 'exec',
      effect: 'The go-live date held. A capped penalty clause was in the contract.',
      missing: 'Go-live slipped six weeks and the contract had no penalty for it.' },
    { id: 'medcorefee', label: 'MedCore data extraction fee cut to $0.4M', desc: 'Down from $1.2M for help moving the old data out.', applies: ['b', 'c', 'd'], gate: 've_medcore_fee', role: 'it',
      effect: 'MedCore cut its data extraction fee to $0.4M.',
      missing: 'MedCore charged $1.2M to extract the old data. Nobody had budgeted it.' },
    { id: 'march', label: 'Move go-live from January to March', desc: 'Avoids flu season. Two more months of running the old system.', applies: ['d'], role: 'nurse', cost: 0.5,
      effect: 'Go-live moved to March and happened with full staffing.',
      missing: 'Go-live landed in flu season. Units were short-staffed and two nurses resigned.' },
    { id: 'stretch', label: 'Finance signs a payback case: cap rises to $50M', desc: 'Only counts if the finance group itself supports it.', applies: ['b', 'c', 'd'], role: 'finance', needs: 'finance',
      effect: 'Finance signed a five-year payback case, and the board stretched the cap to $50M.' },
    { id: 'seat', label: 'A patient seat on the go-live committee', desc: 'A patient representative helps plan the switch and the public notices.', applies: ['a', 'b', 'c', 'd'], role: 'patients',
      effect: 'A patient sat on the go-live committee. Appointment cuts were announced in advance.',
      missing: 'Appointments were cut without notice. No patient was in the room when it was planned.' },
  ];

  // ---------- money and coverage ----------

  const has = (list, id) => Array.isArray(list) && list.includes(id);

  // True five-year cost of a deal. `revealed` adds costs a group has published (Package B's hidden $5M).
  function dealCost(deal, revealed) {
    const pkg = PACKAGES[deal.pkg] || PACKAGES.keep;
    const terms = TERMS.filter((t) => has(deal.terms, t.id) && t.applies.includes(deal.pkg));
    const tid = terms.map((t) => t.id);
    const discount = terms.reduce((s, t) => s + (t.discount || 0), 0);
    const price = pkg.price * (1 - discount);
    const free = terms.map((t) => t.freeModule).filter(Boolean);
    const mods = deal.pkg === 'd' ? MODULES.filter((m) => has(deal.modules, m.id)) : [];
    const modules = mods.reduce((s, m) => s + (free.includes(m.id) ? 0 : m.price), 0);
    const extras = terms.reduce((s, t) => s + (t.cost || 0), 0);
    const hidden = revealed && pkg.hidden ? pkg.hidden : 0;
    const total = price + modules + pkg.lost + pkg.old + extras + hidden;
    const cap = tid.includes('stretch') ? STRETCH_CAP : CAP;
    return { price, modules, lost: pkg.lost, old: pkg.old, extras, hidden, total, cap, over: total > cap + 1e-9, discount };
  }

  // Which of the 15 problems a deal fixes fully or partly.
  function coverage(deal) {
    const pkg = PACKAGES[deal.pkg] || PACKAGES.keep;
    const full = new Set(pkg.fixes);
    const partial = new Set(pkg.partial);
    if (deal.pkg === 'd') {
      const mods = new Set(deal.modules || []);
      const governed = mods.has('governance');
      for (const m of MODULES) {
        if (!mods.has(m.id)) continue;
        if (m.id === 'scribe' && !governed) continue; // compliance shuts an ungoverned scribe down
        for (const id of m.fixes) full.add(id);
      }
    }
    for (const id of full) partial.delete(id);
    return { full, partial };
  }

  const CONTENT = {
    HOSPITAL, CAP, STRETCH_CAP, RESERVE, PASS, TOTAL_VOTES,
    GROUP_ORDER, GROUPS, ROLE_ORDER, ROLES, PROBLEMS, PACKAGE_ORDER, PACKAGES, MODULES, TERMS,
    dealCost, coverage,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONTENT;
  else root.CONTENT = CONTENT;
})(typeof window !== 'undefined' ? window : globalThis);
