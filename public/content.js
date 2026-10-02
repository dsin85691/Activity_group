// Game content shared by the server (for validation and scoring) and the browser (for display).
(function (root) {
  'use strict';

  const ROLE_ORDER = ['physician', 'nurse', 'cfo', 'advocate', 'safety', 'it'];

  // `side` is which EHR simulation a role sits in: clinicians use it, everyone else shadows one.
  const ROLES = {
    physician: {
      icon: '🧑‍⚕️', name: 'PHYSICIAN', plural: 'Physicians', short: 'Physician', side: 'physician',
      priority: 'Give patients good care without spending your entire life documenting it.',
      detail: 'You currently spend enormous amounts of time clicking through the EHR and writing notes.',
      want: 'less documentation and fewer useless alerts.',
      fear: 'mistakes made by the system that you are ultimately responsible for.',
      brief: {
        general: 'You want your evenings back. You will be held responsible for errors in anything you sign, including text an AI drafted.',
        a: 'Far fewer interruptions. You still chart until 9pm.',
        b: 'Cuts your documentation time by about <b>40%</b>. Hospital policy: physicians remain responsible for every AI-generated error.',
        c: 'The biggest time savings on offer. Also the most AI-written text you must verify and sign.',
        d: 'Little changes for you, and you still sit through 8 hours of training.',
      },
    },
    nurse: {
      icon: '👩‍⚕️', name: 'NURSE', plural: 'Nurses', short: 'Nurse', side: 'nurse',
      priority: 'Keep patients safe while managing an already overwhelming workload.',
      want: 'fewer repetitive tasks and useful alerts.',
      fear: '"automation" that actually creates more work for nurses.',
      brief: {
        general: 'Every "time-saver" built for physicians has historically landed on nursing as extra work.',
        a: 'Critical labs finally reach you directly. Small, but real.',
        b: 'Nothing in it for nursing. Physicians get relief; you do not.',
        c: 'Every AI-generated high-risk alert must be manually verified by a nurse. Estimated result: <b>+45 minutes of nursing work per shift.</b>',
        d: 'Built for you: chart once, scanners that work. But it takes 12 months and go-live will be rough.',
      },
    },
    cfo: {
      icon: '💰', name: 'HOSPITAL CFO', plural: 'CFOs', short: 'CFO', side: 'physician',
      priority: 'Keep the hospital financially sustainable.',
      want: 'innovations that save money or generate revenue.',
      fear: 'paying millions for something whose financial benefits go to patients or insurers instead of the hospital.',
      brief: {
        general: 'Capital budget available this year: <b>$2.5 million.</b> Operating margin: 1.2%. Anything over budget means cutting something else, unless you change how it is paid for.',
        a: '<b>$0.6M.</b> Fits the budget. Fewer medication errors trims malpractice exposure.',
        b: '<b>$2.4M.</b> Barely fits. Pays off only if physicians use the saved time to see more patients.',
        c: '<b>$5.0M</b>, double your budget. Expected to cut avoidable hospitalizations, saving insurers about <b>$8 million.</b> Penn General receives almost none of those savings.',
        d: '<b>$3.2M.</b> Over budget. The return is lower nurse turnover: real, slow, and hard to show on a spreadsheet.',
      },
    },
    advocate: {
      icon: '🙋', name: 'PATIENT ADVOCATE', plural: 'Patient Advocates', short: 'Patient Advocate', side: 'nurse',
      priority: 'Make care safe, understandable, accessible, and patient-centered.',
      want: 'shorter waits, transparency, and doctors who actually look at patients instead of screens.',
      fear: "patients being harmed by systems they don't understand.",
      brief: {
        general: 'Patients want shorter waits, a clinician who looks at them, and a record they can understand.',
        a: 'Directly prevents the kind of error Maria nearly suffered. Does nothing for waits.',
        b: 'Doctors look at patients instead of screens. But patients cannot see which parts of their note an AI wrote.',
        c: 'Shorter waits and more face time. Algorithms patients do not understand now shape their care.',
        d: 'The only package with a plain-language patient portal.',
      },
    },
    safety: {
      icon: '⚖️', name: 'SAFETY & ETHICS OFFICER', plural: 'Safety Officers', short: 'Safety', side: 'nurse',
      priority: 'Make sure new systems are safe and actually supported by evidence.',
      want: 'testing before widespread deployment.',
      fear: 'the hospital deploying something because it sounds exciting without knowing whether it works.',
      brief: {
        general: "You want evidence that it works here, on Penn General's patients, not in the vendor's demo.",
        a: 'Rule-based and well studied. The lowest-risk option.',
        b: 'AI-drafted notes can contain confident errors. Tested by the vendor only.',
        c: "Performed well in the vendor's testing. It has <b>never been tested on Penn General's patients.</b> Leadership wants it live quickly.",
        d: 'No AI. But big workflow changes cause errors during go-live.',
      },
    },
    it: {
      icon: '💻', name: 'HEALTH IT LEAD', plural: 'IT Leads', short: 'IT', side: 'physician',
      priority: 'Make technology actually work inside the hospital.',
      want: 'systems that integrate with existing workflows.',
      fear: "leadership buying another shiny technology that doesn't integrate with the EHR.",
      brief: {
        general: 'You have a team of six and a long backlog. Whatever the hospital picks, your team installs it.',
        a: 'Configuration only. Two months with existing staff.',
        b: 'Vendor-hosted, moderate integration, and new microphones in 200 exam rooms.',
        c: 'Works beautifully in the demo. Integration with your existing EHR will take <b>9 months</b> and require several major workflow changes.',
        d: 'Twelve months. Replace every scanner and rebuild the nursing flowsheets. The riskiest go-live of the four.',
      },
    },
  };

  const PROBLEMS = [
    { id: 'alerts', cat: 'Safety', label: 'Alert overload', desc: 'Constant low-value alerts; critical ones look just like trivial ones.' },
    { id: 'allergy', cat: 'Safety', label: 'Allergies are buried', desc: 'Allergy information is not visible where drugs are ordered or given.' },
    { id: 'labs', cat: 'Safety', label: 'Critical results not highlighted', desc: 'Dangerous lab values sit unmarked in dense tables.' },
    { id: 'scanner', cat: 'Safety', label: 'Scanning failures and overrides', desc: 'Barcode scans fail, so staff routinely override the safety check.' },
    { id: 'clutter', cat: 'Usability', label: 'Cluttered screens', desc: 'Far too much irrelevant information on every screen.' },
    { id: 'billing', cat: 'Usability', label: 'Built for billing', desc: 'Billing and coding content crowds out clinical content.' },
    { id: 'search', cat: 'Efficiency', label: "Can't find anything", desc: 'No fast way to find one fact or one result.' },
    { id: 'clicks', cat: 'Efficiency', label: 'Too many clicks', desc: 'Every simple action needs several steps and confirmations.' },
    { id: 'doctime', cat: 'Efficiency', label: 'Documentation takes over', desc: 'More time is spent charting than with patients.' },
    { id: 'bloat', cat: 'Documentation', label: 'Note bloat and copy-forward', desc: 'Notes are copied visit to visit; key facts get lost.' },
    { id: 'dupes', cat: 'Documentation', label: 'Duplicate and outdated lists', desc: 'Problem and medication lists contain duplicates and stale entries.' },
    { id: 'double', cat: 'Documentation', label: 'Double documentation', desc: 'The same information must be charted in several places.' },
    { id: 'handoff', cat: 'Communication', label: 'Nurse–physician communication gaps', desc: 'No reliable way to reach each other or know a result was seen.' },
    { id: 'inbox', cat: 'Workflow', label: 'Message overload', desc: 'Dozens of unread inbox and patient-portal messages.' },
    { id: 'patientview', cat: 'Communication', label: 'Patients left out', desc: 'Patients cannot see or understand their own record.' },
  ];

  const PACKAGE_ORDER = ['a', 'b', 'c', 'd'];
  const PACKAGES = {
    a: {
      letter: 'A', icon: '🩹', name: 'SAFETY PATCH', tagline: 'Fix the alerts. Touch nothing else.',
      cost: 0.6, months: 2, training: '1 hour, all clinical staff', change: 'Low',
      features: [
        'Tiered alerts: only high-severity alerts interrupt',
        'Allergy banner on every ordering and medication screen',
        'Critical lab values flagged and sent to nurse and physician',
      ],
      fixes: ['alerts', 'allergy', 'labs'],
      headline: 'Safer. Still slow.',
      maria: 'One red alert stopped the amoxicillin order. Nobody had to hunt for it.',
      outcome: {
        physician: 'Interruptions fell by 80%. You still spend two hours charting for every hour with patients.',
        nurse: 'Critical labs now reach you directly. Charting and scanning are exactly as painful as before.',
        cfo: 'On budget. Two serious medication errors avoided. No change in revenue.',
        advocate: 'Allergy conflicts get caught. Waits and screen-staring are unchanged.',
        safety: 'A measurable drop in missed critical alerts, from the cheapest and best-evidenced option.',
        it: 'Delivered in two months. Your team went back to the backlog.',
      },
    },
    b: {
      letter: 'B', icon: '🎙️', name: 'AMBIENT SCRIBE', tagline: 'AI that listens and writes the note.',
      cost: 2.4, months: 4, training: '4 hours, physicians', change: 'Medium',
      features: [
        'AI listens to each visit and drafts the note',
        'A fresh note every visit instead of copy-forward',
        'AI drafts replies to patient messages',
        'Billing codes suggested automatically',
      ],
      fixes: ['doctime', 'bloat', 'inbox', 'billing'],
      ai: true,
      headline: 'Doctors look up from the screen.',
      maria: 'Her doctor looked at her for the whole visit. The allergy alert was dismissed again; a pharmacist caught the order.',
      outcome: {
        physician: 'Documentation time is down about 40%. You sign notes you did not write, and you answer for them.',
        nurse: 'Nothing changed for nursing. Resentment did.',
        cfo: 'Physicians see slightly more patients. The return depends on that continuing.',
        advocate: 'Doctors make eye contact again. Patients notice.',
        safety: 'Alert fatigue is untouched. The allergy alert still looks like the flu-shot reminder.',
        it: 'Live in four months. Microphone tickets are the new normal.',
      },
    },
    c: {
      letter: 'C', icon: '🤖', name: 'PENNAI COPILOT', tagline: 'A full AI layer across the whole EHR.',
      cost: 5.0, months: 9, training: '12 hours, all clinical staff', change: 'High',
      features: [
        'Everything in Ambient Scribe',
        'AI summary of years of patient history',
        'Ask the chart a question in plain language',
        'AI-prioritized alerts and highlighted critical results',
        'Cleaned-up problem and medication lists',
      ],
      fixes: ['doctime', 'bloat', 'inbox', 'billing', 'clutter', 'search', 'alerts', 'dupes', 'labs'],
      ai: true,
      headline: 'Transformed, with new risks to watch.',
      maria: 'Her alerts were prioritized correctly. Her AI summary said "No known drug allergies."',
      outcome: {
        physician: 'The chart is finally readable and notes write themselves. In month two, an AI summary omitted a penicillin allergy.',
        nurse: 'Verifying AI-generated alerts adds about 45 minutes to every shift.',
        cfo: 'Avoidable hospitalizations fell, saving insurers about $8M. Penn General saw almost none of it.',
        advocate: 'Shorter waits and more face time. Patients are asking who, or what, wrote their notes.',
        safety: "It went live without testing on Penn General's patients. The omitted allergy was caught by a nurse's manual check.",
        it: 'Nine months of integration work. Everything else waited.',
      },
      // Replacement lines when a negotiated term changes how the story went.
      outcomeWith: {
        pilot: {
          physician: 'The chart is finally readable and notes write themselves. On the pilot unit, an AI summary omitted a penicillin allergy; it was fixed before rollout, and you still double-check every summary.',
          safety: 'The pilot unit caught an AI summary that omitted a penicillin allergy. The vendor had to fix it before the hospital-wide rollout.',
        },
      },
    },
    d: {
      letter: 'D', icon: '🛠️', name: 'WORKFLOW REBUILD', tagline: 'Rebuild nursing and communication. No AI.',
      cost: 3.2, months: 12, training: '8 hours, all staff', change: 'High',
      features: [
        'Chart-once nursing flowsheets',
        'New scanners and a one-step medication workflow',
        'Fewer confirmation clicks everywhere',
        'Nurse–physician messaging with critical-result escalation',
        'Allergy check at the bedside',
        'Plain-language patient portal',
      ],
      fixes: ['double', 'scanner', 'clicks', 'handoff', 'allergy', 'patientview'],
      headline: 'The basics finally work.',
      maria: 'Her nurse saw the allergy at the bedside before giving the first dose.',
      outcome: {
        physician: 'Fewer clicks, and you can actually reach the nurse. Notes and alerts are as bad as ever.',
        nurse: 'Chart once. Scanners work. Turnover on your unit dropped.',
        cfo: 'Savings from nurse retention arrive slowly and never show up as revenue.',
        advocate: 'Patients can read their own record in plain language.',
        safety: 'Go-live month saw a spike in near-misses. It settled.',
        it: 'A hard twelve months and the riskiest go-live you have run.',
      },
    },
    keep: {
      letter: '—', icon: '🚫', name: 'KEEP THE CURRENT EHR', tagline: 'No deal. Change nothing.',
      cost: 0, months: 0, training: 'None', change: 'None',
      features: [],
      fixes: [],
      headline: 'Nothing changed.',
      maria: 'A pharmacist caught the amoxicillin order. This time.',
      outcome: {
        physician: 'Still 4,000 clicks a day.',
        nurse: 'Three more nurses left your unit.',
        cfo: 'You spent nothing. Burnout and turnover do not appear on this year’s budget line.',
        advocate: 'Patients still watch their doctor type.',
        safety: 'The next missed alert is a matter of time.',
        it: 'No project. The backlog thanks you.',
      },
    },
  };

  // Terms the hospital can attach to a package. `cost` is added in $M, `months` to the timeline,
  // `discount` is the share of the bill someone else pays.
  const MODS = [
    { id: 'pilot', label: 'Pilot on one unit first', desc: 'Test locally before hospital-wide rollout.', months: 3, applies: ['a', 'b', 'c', 'd'], role: 'safety', effect: 'You had evidence from your own patients before the hospital-wide rollout.' },
    { id: 'phased', label: 'Pay in phases over 3 years', desc: 'Spread the cost across three budgets.', phased: true, applies: ['a', 'b', 'c', 'd'], role: 'cfo', effect: 'Phased payments spread the bill across three budget years.' },
    { id: 'payer', label: 'Ask insurers to co-fund 20%', desc: 'They capture the savings; ask them to share the cost.', discount: 0.2, months: 2, applies: ['b', 'c', 'd'], role: 'cfo', effect: 'Two insurers agreed to co-fund 20%. Negotiating it took two extra months.' },
    { id: 'backfill', label: 'Paid training time and nurse backfill', desc: 'Protected time to learn it, with cover on the unit.', cost: 0.4, applies: ['a', 'b', 'c', 'd'], role: 'nurse', effect: 'Training happened on paid, protected time with cover on the unit.' },
    { id: 'liability', label: 'Vendor shares liability for AI errors', desc: 'Physicians are not solely responsible for AI mistakes.', cost: 0.3, applies: ['b', 'c'], role: 'physician', effect: 'The vendor now shares responsibility for AI-generated errors.' },
    { id: 'label', label: 'Label AI-written content for patients', desc: 'Patients can see which parts of a note an AI drafted.', applies: ['b', 'c'], role: 'advocate', effect: 'AI-written text is labeled in every note a patient can see.' },
    { id: 'integration', label: 'Integration-testing gate before go-live', desc: 'No go-live until it works with the existing EHR.', months: 2, applies: ['a', 'b', 'c', 'd'], role: 'it', effect: 'The integration-testing gate found the worst bugs before go-live.' },
  ];

  const BUDGET = 2.5; // $M of capital the CFO has this year

  const CONTENT = { ROLE_ORDER, ROLES, PROBLEMS, PACKAGE_ORDER, PACKAGES, MODS, BUDGET };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONTENT;
  else root.CONTENT = CONTENT;
})(typeof window !== 'undefined' ? window : globalThis);
