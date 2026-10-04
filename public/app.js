(() => {
  'use strict';

  const {
    HOSPITAL, CAP, STRETCH_CAP, RESERVE, PASS, TOTAL_VOTES,
    GROUP_ORDER, GROUPS, ROLE_ORDER, ROLES, PROBLEMS, PACKAGE_ORDER, PACKAGES, MODULES, TERMS, dealCost, coverage,
  } = window.CONTENT;
  const PROBLEM = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));
  const MODULE = Object.fromEntries(MODULES.map((m) => [m.id, m]));
  const TERM = Object.fromEntries(TERMS.map((t) => [t.id, t]));
  const SECRET = {};
  for (const role of ROLE_ORDER) for (const sec of ROLES[role].secrets) SECRET[sec.id] = { ...sec, role };
  const BALLOT_ORDER = [...PACKAGE_ORDER, 'keep'];
  const VOTING_GROUPS = GROUP_ORDER.filter((g) => GROUPS[g].votes > 0);
  const TOP_PICKS = 3;

  // ---------- icons ----------
  // Tabler outline icons replace every emoji. Source text still uses the emoji as a readable marker;
  // iconize() swaps them for SVG wherever HTML is written to the page.
  const ICONS = window.ICONS || {};
  function ic(name, cls) {
    const body = ICONS[name];
    return body ? `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>` : '';
  }
  const EMOJI = { '🏥': 'building-hospital', '🏛️': 'building-bank', '💰': 'coin', '🩺': 'stethoscope', '🧑‍⚕️': 'stethoscope', '👩‍⚕️': 'nurse', '💻': 'server-2', '⚖️': 'scale', '🙋': 'heart-handshake', '🤝': 'briefcase', '🩹': 'bandage', '🔁': 'refresh', '🧩': 'puzzle', '🚫': 'ban', '🎙️': 'microphone', '🔗': 'link', '🚪': 'door-exit', '📥': 'inbox', '🗄️': 'database', '🧭': 'compass', '📱': 'device-mobile', '🎓': 'school', '🎲': 'dice-5', '🔒': 'lock', '📣': 'speakerphone', '⭐': 'star', '★': 'star', '☆': 'star', '🎤': 'microphone-2', '⚠️': 'alert-triangle', '🚨': 'urgent', '📝': 'notes', '✅': 'circle-check', '❌': 'circle-x', '◐': 'circle-half-2', '👥': 'users', '⬇': 'download', '▶': 'chevron-right', '◀': 'chevron-left', '📦': 'package', '💵': 'report-money', '🪪': 'id', '🧠': 'brain', '🕸️': 'topology-star-3' };
  const EMOJI_FILL = ['⭐', '★'];
  const EMOJI_RE = new RegExp(Object.keys(EMOJI).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
  const iconize = (html) => String(html).replace(EMOJI_RE, (m) => ic(EMOJI[m], EMOJI_FILL.includes(m) ? 'fill' : ''));

  // ---------- theme ----------
  let theme = 'dark';
  try { theme = localStorage.getItem('fth_theme') || 'dark'; } catch { /* storage unavailable */ }
  document.documentElement.dataset.theme = theme;

  const PHASE_TITLES = {
    1: 'EHR SIMULATION', 2: 'STAKEHOLDER DISCUSSION', 3: 'VENDOR PITCHFEST',
    4: 'NEGOTIATION', 5: 'VOTING', 6: 'DECISION & OUTCOME',
  };
  // What each step is called on the timer, so every part of a phase is labeled.
  const STEP_LABEL = {
    p1_intro: 'Read your task', p1_ehr: 'Use the EHR', p2_notes: 'Part 1 of 3 · on your own', p2_merge: 'Part 2 of 3 · one list',
    p2_top3: 'Part 3 of 3 · must-fix and spokesperson', p3_hospital: 'Part 1 of 2 · the hospital presents', p3_pitch: 'Part 2 of 2 · four pitches',
    p4_intra: 'Part 1 of 2 · inside your team', p4_inter: 'Part 2 of 2 · across teams', p5_vote: 'Vote', p6_decision: 'Part 1 of 4 · the decision',
    p6_sim: 'Part 2 of 4 · replay', p6_outcome: 'Part 3 of 4 · consequences', p6_reflect: 'Part 4 of 4 · feedback form',
  };
  const TIERS = [
    { k: 'critical', label: 'MUST FIX', hint: 'The hospital will not sign without these' },
    { k: 'desirable', label: 'SHOULD FIX', hint: 'Worth paying for' },
    { k: 'lower', label: 'CAN WAIT', hint: 'Live with it for now' },
  ];

  // ---------- Phase 1: the EHR on 6 West at 13:02 ----------

  // One quiet minute, then three minutes in which the lab interface resends results and every
  // rule re-fires on all 22 orders. The gap between alerts shrinks until the system stops responding.
  const SIM_LENGTH = 240;
  const STORM_START = 60;
  const LAG_START = 205;
  const CRASH_AT = 232;

  const CALM = {
    physician: [
      { title: 'Penicillin allergy: piperacillin-tazobactam ordered', sub: 'Reaction: rash, childhood. Override reason required.', reason: true },
      { title: 'Health maintenance: influenza vaccine due', sub: 'Last documented: 10/2024' },
      { title: 'Level of service not selected', sub: 'Required before note can be closed' },
      { title: 'Advance directive not on file', sub: 'Ask patient at next visit' },
    ],
    nurse: [
      { title: 'Pain reassessment overdue', sub: 'Oxycodone given 01:15. Reassessment not charted.' },
      { title: 'Fall risk reassessment due', sub: 'Morse score required every shift' },
      { title: 'Scanner battery low', sub: 'Dock device at end of shift' },
      { title: 'Duplicate therapy: insulin glargine + insulin lispro', sub: 'Two insulin products are active', reason: true },
    ],
  };
  const STORM = {
    physician: [
      { title: 'New result available: BASIC METABOLIC PANEL', sub: 'Collected 08:20 · Resulted 13:02' },
      { title: 'Renal dosing: valganciclovir', sub: 'Creatinine changed. Review dose.', reason: true },
      { title: 'Penicillin allergy: piperacillin-tazobactam ordered', sub: 'Reaction: rash, childhood. Override reason required.', reason: true },
      { title: 'Renal dosing: piperacillin-tazobactam', sub: 'Creatinine changed. Review dose.' },
      { title: 'QT prolongation: sertraline + ondansetron', sub: 'Consider ECG monitoring', reason: true },
      { title: 'Renal dosing: trimethoprim-sulfamethoxazole', sub: 'Creatinine changed. Review dose.' },
      { title: 'Sepsis risk: HIGH (0.71)', sub: 'Predictive model v2.3. Consider sepsis bundle.' },
      { title: 'Duplicate therapy: insulin glargine + insulin lispro', sub: 'Two insulin products are active' },
      { title: 'Renal dosing: magnesium oxide', sub: 'Creatinine changed. Review dose.' },
      { title: 'Discharge medication reconciliation incomplete', sub: 'HARD STOP: required before discharge', reason: true },
      { title: 'Drug interaction: fluconazole + tacrolimus', sub: 'Fluconazole may increase tacrolimus level', crit: true, reason: true },
      { title: 'Renal dosing: fluconazole', sub: 'Creatinine changed. Review dose.' },
      { title: 'New result available: TACROLIMUS LEVEL', sub: 'Collected 08:20 · Resulted 13:02 · Flag: H' },
      { title: 'Drug interaction: tacrolimus + trimethoprim-sulfamethoxazole', sub: 'Both may raise potassium' },
      { title: 'Quality measure: VTE prophylaxis documentation', sub: '7 fields incomplete' },
      { title: 'Renal dosing: heparin', sub: 'Creatinine changed. Review dose.' },
      { title: 'Sepsis risk: HIGH (0.71)', sub: 'Predictive model v2.3. Consider sepsis bundle.' },
      { title: 'In Basket: 12 new messages', sub: '140 unread' },
      { title: 'Renal dosing: pantoprazole', sub: 'Creatinine changed. Review dose.' },
      { title: 'Health maintenance: influenza vaccine due', sub: 'Last documented: 10/2024' },
      { title: 'New result available: BASIC METABOLIC PANEL', sub: 'RESENT by lab interface · Resulted 13:02' },
      { title: 'Critical value: potassium 6.2', sub: 'Acknowledge to continue', reason: true },
    ],
    nurse: [
      { title: 'New result available: BASIC METABOLIC PANEL', sub: 'Collected 08:20 · Resulted 13:02' },
      { title: 'Pain reassessment overdue', sub: 'Oxycodone given 01:15. Reassessment not charted.' },
      { title: 'Duplicate therapy: insulin glargine + insulin lispro', sub: 'Two insulin products are active', reason: true },
      { title: 'Intake & output not charted', sub: 'Current shift' },
      { title: 'Braden skin assessment due', sub: 'Required every shift' },
      { title: 'Sepsis risk: HIGH (0.71)', sub: 'Predictive model v2.3. Notify provider.' },
      { title: 'Penicillin allergy: piperacillin-tazobactam running', sub: 'Reaction: rash, childhood', reason: true },
      { title: 'Patient education not documented', sub: 'Topic: transplant medications, session 3 of 4' },
      { title: 'Critical lab: potassium 6.2', sub: 'Due now: high-protein supplement (potassium 400 mg)', crit: true, reason: true },
      { title: 'Central line dressing: verify date', sub: 'Last changed 09/27' },
      { title: 'Discharge medication reconciliation incomplete', sub: 'HARD STOP: required before discharge' },
      { title: 'Vital signs: duplicate task', sub: 'Appears on two worklists' },
      { title: 'Renal dosing: magnesium oxide', sub: 'Creatinine changed. Notify provider.' },
      { title: 'Scanner battery low', sub: 'Dock device at end of shift' },
      { title: 'Fall risk reassessment due', sub: 'Morse score required every shift' },
      { title: 'Sepsis risk: HIGH (0.71)', sub: 'Predictive model v2.3. Notify provider.' },
      { title: 'Care plan needs update', sub: 'Last updated: 26 hours ago' },
      { title: 'Acetaminophen: 1,950 of 2,000 mg daily limit', sub: 'Next PRN dose will exceed limit' },
      { title: 'New result available: BASIC METABOLIC PANEL', sub: 'RESENT by lab interface · Resulted 13:02' },
      { title: 'Hourly rounding not documented', sub: 'Last charted: 12:00' },
      { title: 'Incentive spirometry teaching due', sub: 'Required once per shift' },
      { title: 'Interpreter need not assessed', sub: 'Admission requirement' },
    ],
  };

  function buildAlerts(side) {
    const out = [12, 26, 40, 52].map((t, i) => ({ ...CALM[side][i], t }));
    const base = STORM[side];
    let t = STORM_START;
    let i = 0;
    while (t < CRASH_AT - 1) {
      const a = base[i % base.length];
      const again = i >= base.length;
      out.push({ ...a, t, crit: a.crit && !again, sub: again && !/RESENT/.test(a.sub) ? `${a.sub} · RESENT` : a.sub });
      const x = (t - STORM_START) / (CRASH_AT - STORM_START);
      t += 0.66 + 5.2 * (1 - x) * (1 - x);
      i++;
    }
    return out;
  }
  const ALERTS = { physician: buildAlerts('physician'), nurse: buildAlerts('nurse') };
  const critNumber = (side) => ALERTS[side].findIndex((a) => a.crit) + 1;

  const SIM = {
    physician: {
      task: '<b>13:02 on 6 West.</b> Mr. Whitfield\'s labs just posted. Find today\'s <b>tacrolimus level</b> and decide <b>tonight\'s dose</b>.',
      brief: 'It is 13:02 on 6 West. Mr. Whitfield is 6 days out from a liver transplant and his labs just posted. Find today\'s tacrolimus level and decide tonight\'s dose.',
      missed: '⚠️ <b>Drug interaction: fluconazole + tacrolimus</b>. Fluconazole may increase tacrolimus level.',
      lookalike: 'Health maintenance: influenza vaccine due',
      truth: 'Tacrolimus was <b>19.4</b> (target 8 to 12), in row 18 of 26 with a small "H". Potassium was <b>6.2</b>. Tonight\'s dose should have been <b>held</b>.',
    },
    nurse: {
      task: '<b>13:02 on 6 West.</b> Give Mr. Whitfield his <b>12:30 insulin</b> and anything else that is due and <b>safe</b>. Chart the 12:00 vitals.',
      brief: 'It is 13:02 on 6 West and you are behind. Give Mr. Whitfield his 12:30 insulin and anything else that is due and safe to give. Chart the 12:00 vitals.',
      missed: '⚠️ <b>Critical lab: potassium 6.2</b>. Due now: <b>high-protein supplement (potassium 400 mg)</b>.',
      lookalike: 'Scanner battery low',
      truth: 'His potassium was <b>6.2</b>, a medical emergency. The supplement drink adds potassium. The lactulose treats a condition his new liver no longer has.',
    },
  };

  // Medication pass. Each button press is one step; insulin takes ten.
  const MAR = [
    { id: 'insulin', text: 'insulin lispro 8 units SUBQ - sliding scale (BG 312)', due: '12:30 OVERDUE', last: '08:10',
      steps: ['Scan patient band', 'Scan medication', 'Barcode not recognized - Override', 'Select override reason', 'Enter glucose value', 'Request second nurse', 'Witness unavailable - Bypass', 'Document injection site', 'Confirm dose', 'Sign'] },
    { id: 'supp', text: 'High-protein supplement 240 mL PO (potassium 400 mg)', due: '13:00', last: '09:00', steps: ['Scan', 'Document'] },
    { id: 'lact', text: 'lactulose 30 mL PO', due: '13:00', last: '09:15', steps: ['Scan', 'Barcode not recognized - Override', 'Document'] },
    { id: 'mag', text: 'magnesium oxide 400 mg tab PO', due: '13:00', last: '09:10', steps: ['Scan', 'Document'] },
    { id: 'hep', text: 'heparin 5,000 units SUBQ', due: '14:00', last: '06:00', steps: ['Scan', 'Too early - Override', 'Document'] },
    { id: 'apap', text: 'acetaminophen 650 mg PO PRN (1,950 of 2,000 mg used)', due: 'PRN', last: '10:40', steps: ['Scan', 'Limit warning - Override', 'Document'] },
    { id: 'ondan', text: 'ondansetron 4 mg IV PRN nausea', due: 'PRN', last: '08:40', steps: ['Scan', 'Document'] },
    { id: 'pip', text: 'piperacillin-tazobactam 3.375 g IV q8h', due: '19:20', last: '11:20', steps: ['Scan', 'Too early - Override', 'Document'] },
    { id: 'tacro', text: 'tacrolimus 4 mg cap PO', due: '21:00', last: '09:00', steps: ['Scan', 'Too early - Override', 'Document'] },
  ];
  const DANGER = ['supp', 'lact', 'insulin'];

  // Physician order change: four clicks to change one dose.
  const DOSE_LABEL = { continue: 'CONTINUE 4 mg', reduce: 'REDUCE to 2 mg', hold: 'HOLD tonight' };
  const DOSE_STEPS = ['Confirm order change', 'Select reason: Clinical judgment', 'Sign order'];

  // ---------- state ----------

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (m) => `$${(Math.round(m * 10) / 10).toFixed(1).replace(/\.0$/, '')}M`;
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  let S = null; // latest state pushed by the server
  let session = null; // { code, id } for players, { code, hostKey } for the host
  let es = null;
  let clockOffset = 0; // server clock minus ours
  let screenKey = null;
  let homeView = 'home';
  let homeError = '';
  let online = true;
  let repick = false; // player asked to choose a different role in the lobby

  const store = {
    get(area, key) {
      try { return JSON.parse(area.getItem(key)); } catch { return null; }
    },
    set(area, key, value) {
      try { area.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
    del(area, key) {
      try { area.removeItem(key); } catch { /* storage unavailable */ }
    },
  };

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Something went wrong.');
    return json;
  }

  function act(type, extra) {
    const who = session.hostKey ? { hostKey: session.hostKey } : { id: session.id };
    return api('/api/action', { code: session.code, type, ...who, ...extra }).catch((err) => {
      toast(err.message);
      return null;
    });
  }

  // ---------- connection ----------

  function connect() {
    if (es) es.close();
    const auth = session.hostKey ? `host=${session.hostKey}` : `id=${session.id}`;
    es = new EventSource(`/api/stream?code=${encodeURIComponent(session.code)}&${auth}`);
    es.onmessage = (e) => {
      S = JSON.parse(e.data);
      clockOffset = S.now - Date.now();
      setOnline(true);
      render();
    };
    es.addEventListener('gone', () => {
      leave('That game is no longer running.');
    });
    es.onerror = () => setOnline(false);
  }

  function setOnline(value) {
    online = value;
    document.body.classList.toggle('offline', !online);
  }

  function leave(message) {
    if (es) es.close();
    es = null;
    if (session && session.hostKey) store.del(localStorage, 'fth_host');
    store.del(sessionStorage, 'fth_session');
    session = null;
    S = null;
    screenKey = null;
    ehrStop();
    homeView = 'home';
    homeError = message || '';
    setOnline(true);
    renderHome();
  }

  function startSession(next) {
    session = next;
    store.set(sessionStorage, 'fth_session', session);
    if (session.hostKey) store.set(localStorage, 'fth_host', session);
    connect();
  }

  // ---------- home ----------

  function renderHome() {
    document.body.className = 'home';
    const savedHost = store.get(localStorage, 'fth_host');
    const prefill = new URLSearchParams(location.search).get('room') || '';
    let body;
    if (homeView === 'join') {
      body = `
        <form class="joinform" data-form="join">
          <label>ROOM CODE
            <input name="code" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000" value="${esc(prefill)}" required>
          </label>
          <label>YOUR NAME
            <input name="name" maxlength="24" autocomplete="off" placeholder="First name" required>
          </label>
          <button class="btn primary big" type="submit">ENTER THE HOSPITAL</button>
          <button class="btn ghost" type="button" data-act="home">◀ Back</button>
        </form>`;
    } else {
      body = `
        <div class="home-buttons">
          <button class="btn primary big" data-act="home-join">JOIN GAME</button>
          <button class="btn big" data-act="home-host">HOST GAME</button>
        </div>
        ${savedHost ? `<button class="btn ghost" data-act="resume-host">Resume hosting room ${esc(savedHost.code)}</button>` : ''}`;
    }
    app.innerHTML = `
      <main class="home-wrap">
        <div class="home-title"><span class="home-icon">🏥</span> FIX THE HOSPITAL</div>
        <svg class="ecg" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="0,30 120,30 140,30 155,10 170,50 185,2 200,58 215,30 240,30 360,30 380,30 395,10 410,50 425,2 440,58 455,30 480,30 600,30"/>
        </svg>
        <p class="home-lead"><b>${HOSPITAL}, five days after the alert storm.</b></p>
        <p class="home-copy">The EHR fired 347 alerts in three minutes on one transplant patient, then crashed the whole hospital for 47 minutes. A critical potassium went untreated.</p>
        <p class="home-copy">Two vendors say they can fix it. The board wants a decision today.</p>
        <p class="home-lead">Seven groups. Four packages. $45 million. Five votes needed.</p>
        ${homeError ? `<p class="error">${esc(homeError)}</p>` : ''}
        ${body}
      </main>`;
    app.innerHTML = iconize(app.innerHTML);
    const first = app.querySelector(prefill ? 'input[name=name]' : 'input');
    if (first) first.focus();
  }

  // ---------- timers ----------

  function remainingMs() {
    if (!S || !S.timerEnd) return null;
    return Math.max(0, S.timerEnd - (Date.now() + clockOffset));
  }
  const elapsedSec = () => {
    const ms = remainingMs();
    return ms === null ? 0 : (S.timerTotal || 0) - ms / 1000;
  };

  function clock(ms) {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  // Phase 3: four pitches of one minute each inside one four-minute timer.
  const pitchIndex = () => Math.min(PACKAGE_ORDER.length - 1, Math.max(0, Math.floor(elapsedSec() / 60)));

  function tick() {
    const ms = remainingMs();
    document.querySelectorAll('[data-timer]').forEach((el) => {
      if (ms === null) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      el.textContent = ms === 0 && el.dataset.timer === 'big' ? "TIME'S UP" : clock(ms);
      el.classList.toggle('low', ms > 0 && ms <= 10000);
      el.classList.toggle('done', ms === 0);
    });
    if (S && S.step === 'p3_pitch') {
      document.querySelectorAll('[data-dyn^="pitch"]').forEach((el) => DYN[el.dataset.dyn](el));
      const left = ms === null ? 0 : Math.max(0, ms - (PACKAGE_ORDER.length - 1 - pitchIndex()) * 60000);
      document.querySelectorAll('[data-subtimer]').forEach((el) => {
        el.textContent = clock(left);
      });
    }
    if (S && S.step === 'p1_ehr' && S.isHost) document.querySelectorAll('[data-dyn="ehrhost"]').forEach((el) => DYN.ehrhost(el));
    if (S && S.step === 'p4_inter') {
      // The executives close the ballot two minutes before the end.
      document.querySelectorAll('[data-checkpoint]').forEach((el) => {
        const toGo = ms === null ? 0 : ms - 120000;
        el.textContent = toGo > 0 ? `Executives announce the ballot in ${clock(toGo)}` : 'EXECUTIVES: announce which deals go to the vote. Maximum three.';
        el.classList.toggle('due', toGo <= 0);
      });
    }
    ehrTick();
  }
  setInterval(tick, 250);

  // ---------- EHR engine: the alert storm, the crash, and the two tasks ----------

  const ehr = { active: false, live: true, alerts: [], next: 0, queue: [], current: null, shownAt: 0, n: 0, shown: 0, gapUntil: 0, startedAt: 0, mar: {}, dose: null, crashed: false, crashAt: CRASH_AT, lastSent: 0, pending: null, stage: 0 };

  // `live` runs follow the server's round timer and report to it; replays after the decision are local only.
  function ehrStart(alerts, live, crashAt) {
    Object.assign(ehr, { active: true, live, alerts, queue: [], current: null, n: 0, gapUntil: 0, startedAt: Date.now(), mar: {}, dose: null, crashed: false, crashAt: crashAt || null, lastSent: 0, pending: null, stage: 0 });
    const elapsed = ehrElapsed();
    // After a mid-round reload, skip interruptions that already fired.
    ehr.next = alerts.findIndex((a) => a.t > elapsed - 1);
    if (ehr.next < 0) ehr.next = alerts.length;
    ehr.shown = ehr.next;
  }

  function ehrStop() {
    ehr.active = false;
    ehr.current = null;
    ehr.mar = {};
  }

  function ehrElapsed() {
    if (!ehr.live) return (Date.now() - ehr.startedAt) / 1000;
    const ms = remainingMs();
    return ms === null ? 0 : (S.timerTotal || SIM_LENGTH) - ms / 1000;
  }

  // Many players dismiss many alerts: batch progress reports to one every two seconds.
  function ehrReport(extra, now) {
    if (!ehr.live) return;
    ehr.pending = { n: ehr.n, ...(ehr.pending || {}), ...extra, n: ehr.n };
    if (!now && Date.now() - ehr.lastSent < 2000) return;
    const body = ehr.pending;
    ehr.pending = null;
    ehr.lastSent = Date.now();
    act('ehr', body);
  }

  function ehrCrash() {
    ehr.crashed = true;
    ehr.current = null;
    ehr.queue = [];
    ehrReport({}, true);
    const win = document.querySelector('.ehr-window, .after-window');
    if (!win || win.querySelector('.ehr-crash')) return;
    const veil = document.createElement('div');
    veil.className = 'ehr-crash';
    veil.innerHTML = `
      <div class="ehr-crash-box">
        <div class="ehr-alert-head">MedCore Legacy 9.4.1 (Not Responding)</div>
        <p><b>Session not responding.</b></p>
        <p>The application server is out of memory.<br>Alert queue: 347 unacknowledged.</p>
        <p class="ehr-crash-small">Failing over to backup… backup unavailable.<br>All workstations on 6 West disconnected. Begin downtime procedures.</p>
        <button class="ehr-btn" disabled>Wait for the program to respond</button>
      </div>`;
    win.appendChild(veil);
  }

  function ehrTick() {
    if (!ehr.active || ehr.crashed) return;
    const elapsed = ehrElapsed();
    if (ehr.crashAt && elapsed >= ehr.crashAt) return ehrCrash();
    if (ehr.pending && Date.now() - ehr.lastSent >= 2000) ehrReport({});
    const bar = document.querySelector('.ehr-titlebar');
    if (bar) bar.classList.toggle('lag', ehr.live && elapsed >= LAG_START);
    while (ehr.next < ehr.alerts.length && ehr.alerts[ehr.next].t <= elapsed) ehr.queue.push(ehr.alerts[ehr.next++]);
    const layer = document.getElementById('ehr-alert');
    if (!layer) return;
    const waiting = layer.querySelector('[data-waiting]');
    if (waiting) waiting.textContent = ehr.queue.length ? `+${ehr.queue.length} more waiting behind this one` : '';
    if (ehr.current || !ehr.queue.length || Date.now() < ehr.gapUntil) return;
    ehr.current = ehr.queue.shift();
    ehr.shownAt = Date.now();
    ehr.shown++;
    ehr.stage = 0;
    const depth = Math.min(4, ehr.queue.length);
    layer.innerHTML = `
      ${Array.from({ length: depth }, (_, i) => `<div class="ehr-ghost" style="--d:${depth - i}"></div>`).join('')}
      <div class="ehr-alert-box">
        <div class="ehr-alert-head">Clinical Advisory <span>#${ehr.shown}</span></div>
        <div class="ehr-alert-body">
          <div class="ehr-alert-icon">⚠️</div>
          <div>
            <div class="ehr-alert-title">${esc(ehr.current.title)}</div>
            <div class="ehr-alert-sub">${esc(ehr.current.sub)}</div>
          </div>
        </div>
        <div class="ehr-alert-reason" data-reason></div>
        <button class="ehr-btn" data-act="dismiss">${ehr.current.reason ? 'OVERRIDE' : 'DISMISS'}</button>
        <div class="ehr-alert-wait" data-waiting>${ehr.queue.length ? `+${ehr.queue.length} more waiting behind this one` : ''}</div>
      </div>`;
    layer.innerHTML = iconize(layer.innerHTML);
    layer.classList.add('show');
  }

  function ehrDismiss(btn) {
    if (!ehr.current || ehr.crashed) return;
    // Some warnings demand a reason from a dropdown before they go away.
    if (ehr.current.reason && ehr.stage === 0) {
      ehr.stage = 1;
      const slot = document.querySelector('[data-reason]');
      if (slot) slot.innerHTML = 'Override reason: <span class="ehr-select">Benefit outweighs risk ▾</span>';
      if (btn) btn.textContent = 'ACKNOWLEDGE';
      return;
    }
    // In the last half minute every click hangs.
    if (ehr.live && ehrElapsed() >= LAG_START && ehr.stage < 2) {
      ehr.stage = 2;
      if (btn) {
        btn.textContent = 'Not responding…';
        btn.disabled = true;
      }
      setTimeout(() => ehrDismiss(null), 1100);
      return;
    }
    ehr.n++;
    const report = {};
    if (ehr.current.crit) report.critMs = Date.now() - ehr.shownAt;
    ehr.current = null;
    ehr.gapUntil = Date.now() + (ehr.live && ehrElapsed() > STORM_START ? 160 : 400);
    const layer = document.getElementById('ehr-alert');
    if (layer) layer.classList.remove('show');
    ehrReport(report, 'critMs' in report);
  }

  function marCell(med) {
    const done = ehr.mar[med.id] || 0;
    if (done >= med.steps.length) return '<span class="mar-given">Given 13:0' + ((MAR.indexOf(med) % 6) + 3) + ' ✓</span>';
    const label = med.steps[done];
    const warn = /Override|Bypass/.test(label);
    return `${done ? `<span class="mar-step">step ${done + 1} of ${med.steps.length}</span> ` : ''}<button class="ehr-btn sm ${warn ? 'warn' : ''}" data-act="mar" data-med="${med.id}">${esc(label)}</button>`;
  }

  function marClick(id) {
    const med = MAR.find((m) => m.id === id);
    if (!med || ehr.crashed) return;
    const done = ehr.mar[id] || 0;
    if (done >= med.steps.length) return;
    ehr.mar[id] = done + 1;
    const cell = document.querySelector(`[data-mar="${id}"]`);
    if (cell) cell.innerHTML = marCell(med);
    if (ehr.mar[id] >= med.steps.length && DANGER.includes(id)) {
      ehrReport({ given: DANGER.filter((m) => (ehr.mar[m] || 0) >= MAR.find((x) => x.id === m).steps.length) }, true);
    }
  }

  function doseCell() {
    const d = ehr.dose;
    if (!d) {
      return Object.keys(DOSE_LABEL).map((k) => `<button class="ehr-btn sm" data-act="dose" data-dose="${k}">${DOSE_LABEL[k]}</button>`).join(' ');
    }
    if (d.step >= DOSE_STEPS.length) return `<span class="mar-given">Signed: ${DOSE_LABEL[d.choice]} ✓</span>`;
    return `<span class="mar-step">${DOSE_LABEL[d.choice]} · step ${d.step + 2} of ${DOSE_STEPS.length + 1}</span> <button class="ehr-btn sm" data-act="dose" data-dose="${d.choice}">${DOSE_STEPS[d.step]}</button>`;
  }

  function doseClick(choice) {
    if (ehr.crashed) return;
    if (!ehr.dose) ehr.dose = { choice, step: 0 };
    else if (ehr.dose.step < DOSE_STEPS.length) ehr.dose.step++;
    const cell = document.querySelector('[data-dosecell]');
    if (cell) cell.innerHTML = doseCell();
    if (ehr.dose.step >= DOSE_STEPS.length) ehrReport({ dose: ehr.dose.choice }, true);
  }

  // ---------- the chart: every one of the 15 problems is on these two screens ----------

  // Deterministic jitter so every student reads the identical chart.
  function seeded(seed) {
    let x = seed;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  }

  function labsTable() {
    const rand = seeded(67);
    const dates = ['09/29 13:02', '09/28', '09/27', '09/26', '09/25', '09/24'];
    // name, low, high, unit, then either six explicit values (newest first) or one typical value
    const labs = [
      ['Sodium', 135, 145, 'mmol/L', 134], ['Potassium', 3.5, 5.0, 'mmol/L', [6.2, 5.0, 4.7, 4.5, 4.3, 4.4]], ['Chloride', 98, 107, 'mmol/L', 101],
      ['CO2', 22, 29, 'mmol/L', 21], ['BUN', 7, 20, 'mg/dL', [48, 34, 30, 31, 36, 33]], ['Creatinine', 0.7, 1.3, 'mg/dL', [2.4, 1.6, 1.5, 1.7, 1.9, 1.7]],
      ['eGFR', 60, 200, 'mL/min', [29, 47, 51, 44, 38, 44]], ['Glucose', 70, 140, 'mg/dL', [312, 218, 262, 231, 244, 286]], ['Calcium', 8.6, 10.2, 'mg/dL', 8.4],
      ['Magnesium', 1.7, 2.2, 'mg/dL', [1.3, 1.4, 1.5, 1.5, 1.6, 1.8]], ['Phosphorus', 2.5, 4.5, 'mg/dL', 3.9], ['AST', 10, 40, 'U/L', [76, 98, 164, 290, 510, 842]],
      ['ALT', 7, 40, 'U/L', [132, 170, 241, 350, 480, 615]], ['Alk Phos', 40, 120, 'U/L', 141], ['T. Bili', 0.2, 1.2, 'mg/dL', [1.8, 2.1, 2.7, 3.5, 4.6, 5.8]],
      ['Albumin', 3.5, 5, 'g/dL', 2.6], ['INR', 0.9, 1.1, '', [1.2, 1.2, 1.3, 1.4, 1.6, 1.9]], ['Tacrolimus', 8, 12, 'ng/mL', [19.4, 11.6, 7.4, 5.1, 3.2, null]],
      ['WBC', 4, 11, 'K/uL', [14.6, 13.8, 13.1, 12.5, 11.2, 9.8]], ['Hemoglobin', 13.5, 17.5, 'g/dL', [8.7, 8.8, 8.6, 8.3, 8.1, 8.4]], ['Hematocrit', 41, 53, '%', 26.4],
      ['Platelets', 150, 400, 'K/uL', [104, 92, 79, 66, 58, 54]], ['Lactate (POC)', 0.5, 2.0, 'mmol/L', [2.9, null, null, null, null, null]], ['Triglycerides', 0, 150, 'mg/dL', 171],
      ['Urine output', 30, 999, 'mL/h', [26, 48, 55, 52, 31, 40]], ['CMV PCR', 0, 0, '', ['pend', 'ND', null, null, null, null]],
    ];
    const rows = labs
      .map(([name, lo, hi, unit, v]) => {
        const cells = dates
          .map((_, i) => {
            const val = Array.isArray(v) ? v[i] : v * (1 + (rand() - 0.5) * 0.12);
            if (val === null) return '<td>-</td>';
            if (typeof val === 'string') return `<td>${val}</td>`;
            const text = val < 20 ? val.toFixed(1) : val.toFixed(0);
            const flag = val > hi ? ' H' : val < lo ? ' L' : '';
            return `<td>${text}${flag}</td>`;
          })
          .join('');
        return `<tr><td>${name}</td>${cells}<td>${lo} to ${hi} ${unit}</td></tr>`;
      })
      .join('');
    return `<div class="ehr-box"><h4>Results - Chemistry / Hematology / Drug Levels / Other (all dates) - 26 components</h4>
      <table><tr><th>Component</th>${dates.map((d) => `<th>${d}</th>`).join('')}<th>Ref range</th></tr>${rows}</table></div>`;
  }

  const VITALS = `<div class="ehr-box"><h4>Vitals - 09/29</h4>
    <table><tr><th>Time</th><th>Temp</th><th>HR</th><th>BP</th><th>RR</th><th>SpO2</th><th>Pain</th><th>Wt</th><th>EWS</th></tr>
    <tr><td>12:00</td><td>37.9</td><td>108 H irreg</td><td>156/92 H</td><td>20</td><td>93% 2L</td><td>3/10</td><td>-</td><td>5</td></tr>
    <tr><td>10:30</td><td>38.1 H</td><td>104 H</td><td>152/90 H</td><td>18</td><td>95% RA</td><td>3/10</td><td>-</td><td>3</td></tr>
    <tr><td>08:00</td><td>37.4</td><td>92</td><td>148/88</td><td>18</td><td>96% RA</td><td>3/10</td><td>94.2</td><td>1</td></tr>
    <tr><td>04:00</td><td>37.2</td><td>88</td><td>142/84</td><td>16</td><td>96% RA</td><td>2/10</td><td>-</td><td>0</td></tr></table></div>`;

  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const box = (title, inner) => `<div class="ehr-box"><h4>${title}</h4>${inner}</div>`;

  const HOME_A = ['warfarin 5 mg tab - 1 tab PO daily', 'metFORMIN 1000 mg tab - 1 tab PO BID', 'furosemide 40 mg - 1 tab PO daily', 'spironolactone 100 mg - 1 tab PO daily', 'lactulose 30 mL PO TID', 'rifAXIMin 550 mg - 1 tab PO BID', 'sertraline 50 mg - 1 tab PO daily', 'lisinopril 10 mg - 1 tab PO daily'];
  const HOME_B = ['apixaban 5 mg - 1 tab PO BID', 'insulin glargine 14 units SUBQ nightly', 'furosemide 40 mg daily', 'spironolactone 50 mg daily', 'lactulose 30 mL TID', 'rifAXIMin 550 mg BID', 'sertraline 100 mg daily', 'amLODIPine 5 mg daily', 'dilTIAZem ER 120 mg daily', 'pantoprazole 40 mg daily'];
  const HOME_C = ['(pharmacy note 09/29 09:50, free text) Per daughter by phone: NO warfarin, NO metformin, NO spironolactone (stopped 09/2026 high K). Takes ibuprofen 400 mg "a few times a week." Not entered in medication list.'];

  function physicianBody() {
    const problems = [
      'Status post liver transplant (Z94.4) - POD 6', 'Cirrhosis due to MASH (K74.60)', 'Ascites (R18.8)', 'Hepatic encephalopathy, grade 2 (K76.82)',
      'Type 2 diabetes mellitus w/ hyperglycemia (E11.65)', 'Chronic kidney disease, stage 3b (N18.32)', 'Paroxysmal atrial fibrillation (I48.0)',
      'Essential hypertension (I10)', 'Major depressive disorder, in remission (F32.5)', 'Thrombocytopenia (D69.6)', 'Fever, unspecified (R50.9)', 'Hypertension (I10) - DUPLICATE',
    ];
    const ordersTop = [
      'mycophenolate 1,000 mg PO BID - active', 'predniSONE 20 mg PO daily - active (taper)', 'valGANciclovir 450 mg PO daily - active', 'trimethoprim-sulfamethoxazole 80/400 mg PO daily - active',
      'fluconazole 200 mg PO daily - active (started 09/27)', 'insulin glargine 18 units SUBQ nightly - active', 'insulin lispro sliding scale SUBQ - active', 'dilTIAZem ER 120 mg PO daily - active (restarted 09/26)',
      'sertraline 100 mg PO daily - active', 'ondansetron 4 mg IV q8h PRN - active', 'heparin 5,000 units SUBQ q8h - active', 'piperacillin-tazobactam 3.375 g IV q8h - active (started 11:00)',
    ];
    const ordersBottom = [
      'pantoprazole 40 mg PO daily - active', 'magnesium oxide 400 mg PO BID - active', 'aspirin 81 mg PO daily - active', 'amLODIPine 5 mg PO daily - active', 'oxyCODONE 5 mg PO q6h PRN - active',
      'acetaminophen 650 mg PO q6h PRN - active', 'senna-docusate PO BID - active', 'lactulose 30 mL PO TID - active (from admission list)', 'rifAXIMin 550 mg PO BID - active (from admission list)',
      'High-protein supplement TID - active (nutrition)', 'Diet: low potassium - active (nephrology 09/28)', 'apixaban - ON HOLD since admission', 'furosemide - ON HOLD since 09/25',
    ];
    const copied =
      'HPI: 61 y.o. male with decompensated cirrhosis due to MASH c/b ascites, hepatic encephalopathy, MELD-Na 32, admitted for OLT. ' +
      'Exam: oriented to person and place, slow to answer, mild asterixis. Sclerae icteric. Abdomen distended with fluid wave, non-tender. LE edema to knees. ' +
      'A/P: 1) Liver transplant - cont tacrolimus 4 mg BID goal 8-12, f/u level; cont mycophenolate, prednisone. 2) ID ppx - cont valganciclovir, TMP-SMX, fluconazole. ' +
      '3) CKD - Cr at baseline, avoid nephrotoxins, renal following. 4) DM - endocrine adjusting insulin. 5) AF - rate controlled on diltiazem, apixaban on hold. 6) HTN - cont amlodipine. ' +
      '7) Hepatic encephalopathy grade 2 - cont lactulose, rifaximin, titrate to 3 BM daily. 8) Ascites - cont diuretics, paracentesis PRN. 9) Depression - cont sertraline. 10) Dispo - target d/c 10/02. ' +
      'Total time 35 min, >50% counseling and coordination of care. Level of service 99233.';
    const note = (date, author, head, extra) => `
      <div class="ehr-note">
        <div class="ehr-note-head">${date} - ${head} - ${author} - <i>signed</i> - 11 pages</div>
        <p>${extra || ''} ${copied}</p>
      </div>`;
    return `
      <div class="ehr-cols">
        ${box('Problem List (12)', list(problems))}
        ${box('Home Medications - Source 1: imported from outside discharge 03/2026 (8)', list(HOME_A))}
        ${box('Home Medications - Source 2: clinic letter 08/2026 [SCANNED IMAGE] (10)', list(HOME_B) + list(HOME_C))}
      </div>
      <div class="ehr-cols">
        <div class="ehr-box"><h4>Active Orders (22 + 3 other)</h4><ul>
          ${ordersTop.map((o) => `<li>${o}</li>`).join('')}
          <li><b>tacrolimus 4 mg PO BID</b> - next dose 21:00 - <span data-dosecell>${doseCell()}</span></li>
          ${ordersBottom.map((o) => `<li>${o}</li>`).join('')}
        </ul></div>
        <div>
          ${box('Predictive Models (1)', `<table><tr><th>Model</th><th>Score</th><th>Band</th></tr><tr><td>Sepsis Risk v2.3</td><td>0.71</td><td>HIGH</td></tr>
            <tr><td colspan="3">Validated accuracy: not available · Transplant / steroid patients: not evaluated · Model owner: (blank) · Last reviewed: never · Fired 12 times today</td></tr></table>`)}
          ${box('Consults (8) - open each tab to read', list(['Infectious Disease 09/27 - [tab: Consults ▸ ID]', 'Nephrology 09/28 - [tab: Consults ▸ Renal]', 'Cardiology 09/26 - [tab: Consults ▸ Cards]', 'Endocrinology 09/28 - [tab: Consults ▸ Endo]', 'Transplant Pharmacy 09/29 - [tab: Pharmacy Notes]', 'Nutrition 09/27 - [tab: Ancillary]', 'Social Work 09/28 - [tab: Ancillary]', 'Physical Therapy 09/29 - [tab: Rehab]']))}
          ${box('Care Team Plan of Care', list(['Surgery (09/29 09:15): continue tacrolimus 4 mg BID', 'Nephrology (09/28 16:40): see consult tab', 'Nursing handoff (07:00): "surgery might change the tacrolimus"', 'Pharmacy: interaction review pending today\'s level']))}
        </div>
        <div>
          ${box('In Basket - 140 unread', list(['Refill request: sertraline (pt: HALVORSEN)', 'Result: routine CBC (pt: ADEYEMI)', 'Portal msg: E. Whitfield "is the fever serious?"', 'Portal msg: E. Whitfield "what is the discharge date?"', 'Result: CXR 09/29 11:15 - WHITFIELD - new R lower lung haziness', 'Coding query: clarify "acute kidney injury"', 'Result: ECG 09/29 11:40 - WHITFIELD - QTc 492', 'Staff message: parking validation update', 'Result: EXPLANT PATHOLOGY - WHITFIELD', 'Cosign needed: verbal order x6', '… 130 more']))}
          ${box('Media (3)', list(['Outside records.pdf - 84 pages - SCANNED IMAGE - not searchable - received 09/29 10:05 - not opened', 'US LIVER DOPPLER 09/28 - report filed here, not under Imaging', 'Transplant clinic letter 08/2026']))}
        </div>
      </div>
      ${VITALS}
      ${labsTable()}
      <div class="ehr-box"><h4>Notes (showing 6 of 212)</h4>
        ${note('09/29/2026 09:15', 'Chen, L MD', 'Progress Note POD 6', 'Overnight events: none reported. Slept poorly, mild nausea. Labs: pending at time of note. US yesterday normal.')}
        ${note('09/28/2026 08:50', 'Chen, L MD', 'Progress Note POD 5', 'Tacrolimus 11.6. K 5.0.')}
        ${note('09/27/2026 15:30', 'Reyes, S MD', 'ID Consult', 'Candida in drain fluid. Rec fluconazole 200 mg daily x14d. NOTE: fluconazole will raise tacrolimus levels; suggest reducing tacrolimus dose and re-checking level in 48-72h. Penicillin allergy low risk, rec delabel.')}
        ${note('09/27/2026 09:05', 'Chen, L MD', 'Progress Note POD 4', 'Tacrolimus increased to 4 mg BID.')}
        ${note('09/28/2026 16:40', 'Park, H MD', 'Nephrology Consult', 'Cr 1.6, K 5.0 rising x3d, UOP falling. If creatinine above 2.0 or tacrolimus above 12 tomorrow, HOLD next tacrolimus dose and call nephrology. Consider stopping TMP-SMX if K above 5.5.')}
        ${note('09/22/2026 22:15', 'Chen, L MD', 'Admission H&P', 'Called in for deceased-donor liver offer.')}
      </div>
      <div class="ehr-cols">
        ${box('Discharge Checklist - target 10/02 (0 of 9 complete)', list(['Clinic visits - Outpatient Scheduling system', 'Lab draws - paper standing order (fax)', 'Tacrolimus / valganciclovir - Specialty Pharmacy portal - PRIOR AUTH PENDING', 'Prescriptions - Discharge module - BLOCKED: med rec incomplete', 'Home health - phone / fax', 'Transport 90 mi - phone', 'Diabetes teaching - Education module', 'Medication teaching - Education module', 'Outside kidney doctor - phone, 2 calls not returned']))}
        ${box('Charges / Coding / Quality', list(['99233 - Subsequent hospital care - LEVEL OF SERVICE REQUIRED', '47135 - Liver allotransplantation', '76705 - US abdomen limited', 'Z94.4, K74.60, E11.65, N18.32, I48.0, R50.9', 'HCC 27, HCC 18, HCC 138 - recapture needed', 'Quality: VTE prophylaxis - 7 fields incomplete', 'Quality: sepsis bundle timer - STARTED 10:42']))}
        ${box('Allergies / Demographics', list(['Allergies/Intolerances: 1 active - PENICILLIN (rash, childhood) - unverified', 'lisinopril - hyperkalemia (outside clinic note; not in allergy list)', 'Address: Carver County (90 mi) - UNVERIFIED', 'Health care proxy: daughter', 'Portal: active - results release delay 72 h', 'Interpreter: not needed']))}
      </div>`;
  }

  function nurseBody() {
    const flow = (title, rows) =>
      `<div class="ehr-box"><h4>${title}</h4><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
    const blanks = [['Temp', '____'], ['Heart rate', '____'], ['Blood pressure', '____'], ['Resp rate', '____'], ['SpO2 / O2', '____'], ['Pain score', '____']];
    const tasks = [
      'Fall risk (Morse) - 45 - DUE 16:00', 'Braden skin assessment - DUE', 'Pain reassessment after oxycodone 01:15 - OVERDUE', 'Surgical drain amount / color - DUE 16:00',
      'Intake & output - not charted', 'Neurological check - DUE 15:30', 'Incision check - DUE 19:00', 'Central line dressing - verify date', 'Patient education: transplant meds - session 3 of 4 not documented',
      'Vital signs q4h - DUE 12:00', 'Vital signs q4h - DUE 12:00 (duplicate)', 'Care plan update - OVERDUE', 'Discharge planning screen - DUE', 'Hourly rounding - last 12:00',
    ];
    return `
      <div class="ehr-box"><h4>MAR - Due now and upcoming (9) - scan each medication to document</h4>
        <table>
          <tr><th>Medication</th><th>Due</th><th>Last given</th><th>Action</th></tr>
          ${MAR.map((m) => `<tr><td>${m.text}</td><td>${m.due}</td><td>${m.last}</td><td data-mar="${m.id}">${marCell(m)}</td></tr>`).join('')}
        </table>
      </div>
      <div class="ehr-cols">
        ${box('Worklist - required documentation (14 tasks)', list(tasks))}
        <div>
          ${flow('Flowsheet: Vital Signs - enter 12:00 set', blanks)}
          <div class="ehr-box"><h4>Save</h4><div class="ehr-save"><button class="ehr-btn sm" data-act="ehr-save">Save vitals</button> <span data-savemsg></span></div></div>
        </div>
        <div>
          ${flow('Transplant Module: Vital Signs (re-enter same values)', blanks)}
          ${flow('Intake & Output screen (re-enter weight, drain, urine)', [['Weight', '____ kg'], ['Drain output', '____ mL'], ['Urine', '____ mL'], ['Oral / IV', '____ mL'], ['Net', 'not calculated']])}
        </div>
      </div>
      ${labsTable()}
      <div class="ehr-cols">
        ${flow('Early Warning Score', [['04:00', '0'], ['08:00', '1'], ['10:30', '3'], ['12:00', '5'], ['Action at 5 or more', 'urgent physician review - not requested']])}
        ${flow('Provider contact', [['Resident', 'pager 4471'], ['Attending', 'see call schedule (PDF)'], ['Page sent 05:50', 'low urine output - no callback recorded'], ['Told at 10:35', 'fever 38.1']])}
        ${flow('Intake & Output - so far today', [['Urine', '210 mL in 8 h (26 mL/h)'], ['Drain', '60 mL thin pink'], ['Intake', '900 mL'], ['Weight', '94.2 kg (+1.3 kg)']])}
      </div>
      <div class="ehr-box"><h4>Nursing Notes (showing 4 of 88)</h4>
        <div class="ehr-note"><div class="ehr-note-head">09/29/2026 12:45 - Shift note (day) - <i>draft</i></div><p>07:30 assessment done, alert and oriented x4. 09:00 tacrolimus 4 mg given as ordered, no hold order in chart, level not back. 10:30 T 38.1 HR 104, Dr. Chen told. 11:20 pip-tazo started, allergy alert overridden by MD. 12:00 HR 108 irreg, BP 156/92, O2 2L. 12:30 BG 312, lispro 8 units due. Daughter phoned x2.</p></div>
        <div class="ehr-note"><div class="ehr-note-head">09/29/2026 06:30 - Shift note (night) - <i>signed</i></div><p>Slept in short stretches. Pain 2-4/10, oxycodone x1 at 01:15. BG 198 at 02:00. 05:30 pt states hands "feel shaky" holding cup, thought to be poor sleep. Urine output 210 mL this shift, darker than yesterday; surgery resident paged 05:50, no callback. One loose stool after lactulose. Labs drawn 05:40, sample clotted, redraw needed. Wt 94.2 kg, up 1.3 kg. Handoff: surgery "might change the tacrolimus." No new order seen.</p></div>
        <div class="ehr-note"><div class="ehr-note-head">09/28/2026 19:40 - Shift note - <i>signed</i></div><p>Pt A&Ox4, afebrile. Tolerating diet 40%. Refused evening mycophenolate for nausea. Tacrolimus dose not in cabinet, pharmacy sending, given 22:40. Fall precautions in place. Call light within reach. Will continue to monitor.</p></div>
        <div class="ehr-note"><div class="ehr-note-head">09/28/2026 07:30 - Shift note - <i>signed</i></div><p>Pt A&Ox4, afebrile. Fall precautions in place. Call light within reach. Pt education provided. Will continue to monitor.</p></div>
      </div>
      <div class="ehr-cols">
        ${box('Medication history - 3 sources', list(['Source 1 (outside 03/2026): warfarin, metformin, spironolactone 100…', 'Source 2 (clinic letter, scanned): apixaban, insulin glargine…', 'Source 3 (pharmacy free-text note): daughter says no warfarin, no metformin; takes ibuprofen']))}
        ${box('Diet orders', list(['Low potassium diet - nephrology 09/28', 'High-protein supplement TID (potassium 400 mg each) - nutrition 09/27', 'Consistent carbohydrate']))}
        ${box('Discharge tasks (nursing)', list(['Diabetes teaching - not started', 'Medication teaching - 2 of 4', 'Case manager - see sticky notes at desk']))}
      </div>`;
  }

  function ehrChart(side) {
    const tabs = ['Summary', 'Chart Review', 'Results', 'MAR', 'Orders', 'Notes', 'Consults ▸', 'Flowsheets', 'Transplant Module', 'Imaging', 'Media', 'Pharmacy Notes', 'Ancillary', 'Rehab', 'Charges', 'Discharge', 'Care Everywhere'];
    const on = side === 'nurse' ? 'MAR' : 'Summary';
    const role = ROLES[S.you.role];
    const head = S.you.role === side
      ? SIM[side].task
      : `<span class="ehr-shadow">You are watching the ${side} screen.</span> <b>Your job:</b> ${esc(role.observe)}`;
    return `
      <div class="ehr">
        <div class="ehr-task">
          <div>${head}</div>
          <div class="ehr-task-timer" data-timer></div>
        </div>
        <div class="ehr-window">
          <div class="ehr-titlebar">MedCore Legacy 9.4.1 - RIVERBEND UNIV HOSP - PRD - [${side === 'nurse' ? 'Medication Administration' : 'Chart Review'}]<span class="ehr-lagtag"> (Not Responding)</span></div>
          <div class="ehr-menu"><span>File</span><span>Edit</span><span>View</span><span>Patient</span><span>Orders</span><span>Tools</span><span>Reports</span><span>Billing</span><span>Quality</span><span>Help</span></div>
          <div class="ehr-banner">
            <b>WHITFIELD, JAMES R</b> | 61 y.o. M | DOB 03/11/1965 | MRN RUH-4471902 | CSN 90217754 | Ht 178 cm | Wt 94.2 kg | BMI 29.7 |
            Attending: Raman, P MD | Surg: Okafor, T MD | Ins: COMMERCIAL - PRIOR AUTH REQ | Code: FULL | Isolation: PROTECTIVE | Lang: English |
            Allergies/Intolerances: 1 active (see Allergy activity) | Bed: 6W-14 | LOS: 7d | POD 6 s/p OLT | Readmit risk: 31% | HCC score: 3.12 |
            Sepsis Risk: 0.71 HIGH | EWS: see flowsheet | Portal: ACTIVE (72 h delay) | Outside records: 1 new (Media) | In Basket: 140 unread
          </div>
          <div class="ehr-tabs">${tabs.map((t) => `<span class="${t === on ? 'on' : ''}">${t}</span>`).join('')}</div>
          <div class="ehr-scroll">${side === 'nurse' ? nurseBody() : physicianBody()}</div>
          <div class="ehr-status">Ready | 212 notes | 26 results | 22 orders | 8 consults | User: YOU | Lab interface: RETRYING | Session expires in 14:59 | CAPS</div>
          <div id="ehr-alert" class="ehr-alert"></div>
        </div>
      </div>`;
  }

  // ---------- Phase 6: the same minute, under the system the room chose ----------

  // Each panel is one of the 15 problems shown as fixed, partly fixed, or unchanged.
  const AFTER = {
    physician: [
      { problem: 'alerts', title: 'Alerts at 13:02',
        fixed: (d) => `<div class="crit-alert">🚨 TACROLIMUS INTERACTION: fluconazole + diltiazem are raising the level<span>Hold tonight's dose · Page transplant pharmacy</span></div><p><b>${PACKAGES[d.pkg].alertsAfter} alerts</b> in three minutes, where there were 347. Routine reminders went to a quiet checklist.</p>`,
        broken: '<p><b>347 alerts</b> in three minutes. The interaction warning still looks like the flu-shot reminder.</p>' },
      { problem: 'buried', title: 'Critical results',
        fixed: '<p><b class="red">Tacrolimus 19.4 - CRITICAL.</b> Paged to Dr. Raman at 13:02, acknowledged at 13:03.</p><p><b class="red">Potassium 6.2 - CRITICAL</b>, pinned to the top.</p>',
        broken: '<p>Tacrolimus 19.4 H sits in row 18 of 26. No critical threshold was ever set.</p>' },
      { problem: 'medrec', title: 'Medication list',
        fixed: '<p>One reconciled list. Warfarin and metformin removed. <b>Ibuprofen at home</b> flagged as a kidney risk. Lactulose and rifaximin closed.</p>',
        broken: '<p>Three lists that disagree. Warfarin and metformin are still "active."</p>' },
      { problem: 'find', title: 'Finding information',
        fixed: '<p>Search "ultrasound" → <b>Liver Doppler 09/28: artery flow reading 0.48, below range.</b> Recommendation shown first.</p>',
        broken: '<p>The ultrasound is under scanned media. It took 12 minutes to find.</p>' },
      { problem: 'bloat', title: 'Today\'s note',
        fixed: '<p>📝 One page, drafted from the bedside conversation. What changed since yesterday is highlighted. <b>Review and sign.</b></p>',
        partial: '<p>Notes are shorter and show what changed. You still type them yourself, at night.</p>',
        broken: '<p>Eleven pages. Two of them are new.</p>' },
      { problem: 'copy', title: 'Copied-forward text',
        fixed: '<p>Copied text carries its original date. "Grade 2 encephalopathy" and "ascites" were flagged as outdated and closed.</p>',
        partial: '<p>Copied text now shows its original date. Nobody has closed the old problems yet.</p>',
        broken: '<p>Today\'s note still says "grade 2 encephalopathy, continue lactulose."</p>' },
      { problem: 'interop', title: 'Outside records',
        fixed: '<p>The outside records arrived as data. <b>Resistant <i>E. coli</i>, March 2026</b> is flagged on the antibiotic order. The contrast dye reaction is on the allergy list.</p>',
        partial: '<p>Medication history imports automatically. The 84-page fax is still a scanned image.</p>',
        broken: '<p>An 84-page fax, scanned as one image, unopened.</p>' },
      { problem: 'inbox', title: 'In Basket',
        fixed: '<p>3 urgent items on top: chest x-ray, ECG, pathology. 137 routine items routed to the team pool.</p>',
        broken: '<p>140 unread. The chest x-ray, the ECG, and the pathology report are in there somewhere.</p>' },
      { problem: 'handoff', title: 'One plan of care',
        fixed: '<p>Nephrology\'s "hold if the level is above 12" appears on the tacrolimus order. Nurse, physician, and pharmacy see the same plan.</p>',
        partial: '<p>Consult recommendations now sit beside the order they affect. The discharge plan is still scattered.</p>',
        broken: '<p>Surgery says continue. Nephrology says hold. The night nurse heard "might change."</p>' },
      { problem: 'ai', title: 'Sepsis model',
        fixed: '<p>Sepsis model: <b>owner Dr. Raman · validated in transplant patients · reviewed quarterly.</b> It fired once, not twelve times.</p>',
        partial: '<p>The sepsis model is switched off pending review. It has no owner yet.</p>',
        broken: (d) => (d.pkg === 'keep' ? '<p>Sepsis risk 0.71 HIGH. Accuracy: not available. Owner: blank. Fired 12 times.</p>' : '<p>The sepsis model is switched off. Without governance, no AI tool may run.</p>') },
      { problem: 'clicks', title: 'Changing one dose',
        fixed: '<p>Hold tonight\'s tacrolimus: two clicks.</p>',
        broken: '<p>Four clicks and a reason dropdown to change one dose.</p>' },
      { problem: 'docburden', title: 'Required fields',
        fixed: '<p>Billing level and quality fields are filled from the note. Nothing blocks you from closing the chart.</p>',
        partial: '<p>Fewer hard stops. The billing level is still yours to pick.</p>',
        broken: '<p>"Level of service required." "7 quality fields incomplete."</p>' },
    ],
    nurse: [
      { problem: 'alerts', title: 'Alerts at 13:02',
        fixed: (d) => `<div class="crit-alert">🚨 CRITICAL POTASSIUM 6.2<span>Supplement drink blocked · Physician paged · ECG ordered</span></div><p><b>${PACKAGES[d.pkg].alertsAfter} alerts</b> in three minutes, where there were 347.</p>`,
        broken: '<p><b>347 alerts</b> in three minutes. The potassium alert still looks like "Scanner battery low."</p>' },
      { problem: 'clicks', title: 'One insulin dose',
        fixed: '<p>Scan the band, scan the pen, confirm. Three clicks, and the scanner reads the first time.</p>',
        broken: '<p>Ten steps, two overrides, and a witness who is not available.</p>' },
      { problem: 'dupes', title: 'Charting vitals',
        fixed: '<p>Chart the 12:00 vitals once. They flow to the transplant module and the intake and output screen.</p>',
        broken: '<p>The same six values, typed into three screens.</p>' },
      { problem: 'buried', title: 'What was buried',
        fixed: '<p><b class="red">Early warning score 5</b> called the physician to the bedside automatically. The 05:30 tremor note is flagged for the team.</p>',
        broken: '<p>Early warning score 5. Nobody was called. The tremor is in a free-text note.</p>' },
      { problem: 'docburden', title: 'Required assessments',
        fixed: '<p>The worklist shows 5 tasks that matter this shift. Overdue reminders no longer interrupt a critical value.</p>',
        partial: '<p>The duplicate tasks are gone. There are still 12 required items every shift.</p>',
        broken: '<p>Fourteen tasks, two of them duplicates, one overdue reminder in the middle of an emergency.</p>' },
      { problem: 'medrec', title: 'Conflicting orders',
        fixed: '<p>The potassium supplement was stopped when the low-potassium diet was ordered. Lactulose is gone.</p>',
        broken: '<p>Low-potassium diet and a potassium supplement, both active. Lactulose still due.</p>' },
      { problem: 'handoff', title: 'Handoff',
        fixed: '<p>The handoff screen shows one tacrolimus plan, the unanswered 05:50 page, and who owns each.</p>',
        partial: '<p>The care plan is shared. The unanswered page still is not tracked.</p>',
        broken: '<p>"Surgery might change the tacrolimus." No order. No callback.</p>' },
      { problem: 'discharge', title: 'Discharge',
        fixed: '<p>Nine discharge tasks on one screen, each with an owner. The family can see it too.</p>',
        broken: '<p>Nine tasks in six places. The case manager\'s sticky notes are the real system.</p>' },
    ],
  };

  function afterEhr(side) {
    const d = S.decision;
    const pkg = PACKAGES[d.pkg];
    const cov = coverage(d);
    const status = (id) => (cov.full.has(id) ? 'fixed' : cov.partial.has(id) ? 'partial' : 'broken');
    const tag = { fixed: 'NEW', partial: 'PARTLY', broken: 'UNCHANGED' };
    const panel = (cls, tagText, title, body) => `<div class="after-panel ${cls}"><div class="after-tag">${tagText}</div><h4>${title}</h4>${body}</div>`;
    const panels = AFTER[side]
      .map((p) => {
        let st = status(p.problem);
        if (st === 'partial' && !p.partial) st = 'broken';
        const body = typeof p[st] === 'function' ? p[st](d) : p[st];
        return panel(st, tag[st], `${p.title} <small>#${PROBLEM[p.problem].n}</small>`, body);
      })
      .join('');
    const extra = [];
    const bought = (id) => d.pkg === 'c' || (d.pkg === 'd' && d.modules.includes(id));
    if (d.pkg !== 'keep') {
      if (side === 'nurse') {
        extra.push(bought('portal')
          ? panel('fixed', 'NEW', 'Emily Whitfield\'s phone, 13:10', '<p>"Your father\'s potassium is high. The team is treating it now. Dr. Raman will call you within the hour."</p>')
          : panel('broken', 'UNCHANGED', 'Emily Whitfield\'s phone', '<p>Nothing. The portal will show today\'s results in 3 days.</p>'));
        extra.push(bought('training') || d.pkg === 'a'
          ? panel('fixed', 'NEW', 'Go-live week', '<p>Sixteen hours of training and help on the floor. Nobody went back to paper.</p>')
          : panel('cost', 'NEW WORK', 'Go-live week', '<p>Eight hours of training. Help desk calls tripled and two units went back to paper for a day.</p>'));
      } else {
        extra.push(bought('migration')
          ? panel('fixed', 'NEW', 'Old records', '<p>Ten years of records are searchable. The 2023 contrast dye reaction surfaced when a CT was considered.</p>')
          : d.pkg === 'a'
            ? ''
            : panel('broken', 'UNCHANGED', 'Old records', '<p>Anything older than 3 years is in a read-only archive. The 2023 contrast dye reaction is in there.</p>'));
        if (d.pkg === 'd' && d.modules.includes('scribe') && !d.modules.includes('governance')) {
          extra.push(panel('cost', 'SWITCHED OFF', 'AI scribe', '<p>Compliance shut the scribe down after 2 months: no governance, no AI. A $7M module sits idle.</p>'));
        }
      }
    }
    const when = d.pkg === 'keep' ? 'Nothing was installed' : `${esc(pkg.name)} is live`;
    const fixedN = cov.full.size;
    return `
      <div class="after">
        <div class="ehr-task"><div><b>13:02 on 6 West, replayed.</b> ${when}. ${S.you.role === side ? `Same task as before: ${side === 'physician' ? 'find today\'s tacrolimus level and decide tonight\'s dose.' : 'give the 12:30 insulin and chart the 12:00 vitals.'}` : `Try the ${side}'s task in the new system and watch for your own concern.`}</div><div class="ehr-task-timer" data-timer></div></div>
        <div class="after-window">
          <div class="after-head">${d.pkg === 'keep' ? 'MedCore Legacy 9.4.1, no changes' : `${esc(pkg.seller)} · ${esc(pkg.name)}${d.pkg === 'd' && d.modules.length ? ` + ${d.modules.length} module${d.modules.length === 1 ? '' : 's'}` : ''}`}
            <span class="after-score">${fixedN} of 15 problems fixed${cov.partial.size ? `, ${cov.partial.size} partly` : ''}</span></div>
          <div class="after-banner ${cov.full.has('alerts') ? 'safe' : ''}">
            <b>James Whitfield, 61</b> · liver transplant, day 6 ·
            ${cov.full.has('buried') ? '<b class="allergy-flag">CRITICAL: potassium 6.2 · tacrolimus 19.4</b>' : 'Results: 26 components (see table)'}
          </div>
          <div class="after-try"><div class="after-try-head">TRY IT ${cov.full.has('alerts') ? `<span>${Math.max(0, pkg.alertsAfter - 1)} routine reminders are waiting in a quiet list, not on your screen</span>` : ''}</div><div data-afterwork="${side}"></div></div>
          <div class="after-try-head sub">WHAT CHANGED, AND WHAT DID NOT</div>
          <div class="after-grid">${panels}${extra.join('')}</div>
          <div id="ehr-alert" class="ehr-alert"></div>
        </div>
      </div>`;
  }


  // ---------- Phase 6 replay: the same two tasks, playable in the system the room bought ----------
  // How many clicks each task takes, what is blocked, and what is still broken all follow the deal's coverage.

  const aft = { clicks: 0, dose: null, signed: false, stopped: false, mar: {}, vitals: 0, alert: false };
  const aftFixed = (id) => coverage(S.decision).full.has(id);
  const aftPartly = (id) => coverage(S.decision).partial.has(id);

  function aftMar() {
    const rows = [{ id: 'insulin', text: 'insulin lispro 8 units (glucose 312)', due: '12:30', steps: aftFixed('clicks') ? ['Scan patient band', 'Scan insulin pen', 'Confirm 8 units'] : MAR[0].steps }];
    const supp = { id: 'supp', text: 'High-protein supplement (potassium 400 mg)', due: '13:00' };
    if (aftFixed('medrec')) rows.push({ ...supp, blocked: 'Stopped when the low-potassium diet was ordered' });
    else if (aftFixed('alerts')) rows.push({ ...supp, blocked: 'Blocked: potassium 6.2. Physician paged.' });
    else rows.push({ ...supp, steps: ['Scan', 'Document'] });
    if (aftFixed('medrec')) rows.push({ id: 'lact', text: 'lactulose 30 mL', due: '13:00', blocked: 'Discontinued: not needed after transplant' });
    else rows.push({ id: 'lact', text: 'lactulose 30 mL', due: '13:00', steps: ['Scan', 'Barcode not recognized: Override', 'Document'] });
    rows.push({ id: 'mag', text: 'magnesium oxide 400 mg', due: '13:00', steps: ['Scan', 'Document'] });
    return rows;
  }
  const aftVitalSteps = () => (aftFixed('dupes') ? ['Chart 12:00 vitals from the monitor'] : ['Save in the flowsheet', 'Re-enter in the transplant module', 'Re-enter in intake and output']);
  const aftDoseSteps = () => (aftFixed('clicks') ? ['Sign'] : DOSE_STEPS);
  const abtn = (k, v, label, cls) => `<button class="abtn ${cls || ''}" data-act="aft" data-k="${k}" data-v="${v}">${esc(label)}</button>`;

  function aftPhysician() {
    const modern = aftFixed('clicks');
    const results = aftFixed('buried')
      ? `<div class="after-crit"><b>Tacrolimus 19.4 ng/mL</b> CRITICAL · target 8 to 12</div>
         <div class="after-crit"><b>Potassium 6.2 mmol/L</b> CRITICAL</div>
         <p>Creatinine 2.4 (was 1.6 yesterday). Paged to Dr. Raman at 13:02.</p>
         <p class="after-quiet">23 other results are normal or unchanged. Show all</p>`
      : `<div class="after-scroll">${labsTable()}</div><p class="after-quiet">Find the tacrolimus level yourself. It is in there.</p>`;
    let order;
    if (aft.signed) {
      order = aft.dose.choice === 'hold'
        ? `<p class="after-ok">${ic('circle-check')} Signed: tonight's dose is on hold. ${aftFixed('handoff') || aftPartly('handoff') ? 'Pharmacy and the bedside nurse were notified.' : 'Nobody else was notified.'}</p>`
        : `<p class="after-bad">${ic('alert-triangle')} Signed: ${DOSE_LABEL[aft.dose.choice].toLowerCase()} at a level of 19.4.</p>`;
    } else if (aft.dose) {
      const steps = aftDoseSteps();
      order = `<p>${DOSE_LABEL[aft.dose.choice]} · step ${aft.dose.step + 2} of ${steps.length + 1}</p>${abtn('dose', aft.dose.choice, steps[aft.dose.step], modern ? 'primary' : '')}`;
    } else {
      order = `${aft.stopped ? `<p class="after-bad">${ic('hand-stop')} Stopped: the level is 19.4, above the hold threshold. Choose again.</p>` : ''}
        ${abtn('dose', 'hold', 'Hold tonight\'s dose', modern ? 'primary' : '')} ${abtn('dose', 'reduce', 'Reduce to 2 mg')} ${abtn('dose', 'continue', 'Continue 4 mg')}`;
    }
    const advice = aftFixed('handoff') || aftPartly('handoff')
      ? '<p class="after-note"><b>Nephrology, 09/28:</b> hold the next dose if the level is above 12.<br><b>Infectious disease, 09/27:</b> fluconazole raises tacrolimus.</p>'
      : '<p class="after-quiet">Consult advice: open each of 8 tabs to read.</p>';
    return `
      <div class="after-card ${aftFixed('buried') ? '' : 'old'}"><h4>1. Today's results</h4>${results}</div>
      <div class="after-card ${modern ? '' : 'old'}"><h4>2. Tacrolimus 4 mg twice daily · next dose 21:00</h4>${advice}<div class="after-actions">${order}</div></div>`;
  }

  function aftNurse() {
    const modern = aftFixed('clicks');
    const cell = (m) => {
      if (m.blocked) return `<span class="after-blocked">${ic('ban')} ${esc(m.blocked)}</span>`;
      const done = aft.mar[m.id] || 0;
      if (done >= m.steps.length) return `<span class="after-ok">${ic('circle-check')} Given 13:03${m.id === 'supp' ? ' <b class="after-bad">at a potassium of 6.2</b>' : ''}</span>`;
      return `${done ? `<small>step ${done + 1} of ${m.steps.length}</small> ` : ''}${abtn('mar', m.id, m.steps[done], modern && m.id === 'insulin' ? 'primary' : '')}`;
    };
    const vs = aftVitalSteps();
    const vitals = aft.vitals >= vs.length
      ? `<p class="after-ok">${ic('circle-check')} ${aftFixed('dupes') ? 'Charted once. Filed in the transplant module and intake and output too.' : 'Charted. The same six values, typed three times.'}</p>`
      : `<p>Temp 37.9 · HR 108 · BP 156/92 · RR 20 · SpO2 93% on 2 L · Pain 3</p>${vs.length > 1 ? `<small>screen ${aft.vitals + 1} of ${vs.length}</small> ` : ''}${abtn('vitals', '1', vs[aft.vitals], modern ? 'primary' : '')}`;
    return `
      <div class="after-card ${modern ? '' : 'old'}"><h4>1. Medications due now</h4>
        <table class="after-mar">${aftMar().map((m) => `<tr><td>${esc(m.text)}</td><td>${m.due}</td><td>${cell(m)}</td></tr>`).join('')}</table></div>
      <div class="after-card ${aftFixed('dupes') ? '' : 'old'}"><h4>2. 12:00 vital signs</h4><div class="after-actions">${vitals}</div></div>`;
  }

  function aftDone(side) {
    const insulin = aftMar()[0];
    const done = side === 'physician' ? aft.signed : (aft.mar.insulin || 0) >= insulin.steps.length && aft.vitals >= aftVitalSteps().length;
    if (!done) return `<div class="after-count">Clicks so far: <b>${aft.clicks}</b></div>`;
    const before = side === 'physician' ? 'Before: 4 clicks, after finding one value among 26 rows, if you got there before the crash.' : 'Before: 13 clicks across three screens, if you got there before the crash.';
    return `<div class="after-count done">${ic('circle-check')} Task done in <b>${aft.clicks} click${aft.clicks === 1 ? '' : 's'}</b>. ${before}</div>`;
  }

  function renderAfter() {
    const el = document.querySelector('[data-afterwork]');
    if (!el) return;
    const side = el.dataset.afterwork;
    el.innerHTML = iconize(`<div class="after-work">${side === 'physician' ? aftPhysician() : aftNurse()}</div>${aftDone(side)}`);
  }

  // A system with working alerts interrupts once, with the one thing that matters and a way to act on it.
  function aftShowAlert(side) {
    const layer = document.getElementById('ehr-alert');
    if (!layer || aft.alert || ehr.crashed) return;
    aft.alert = true;
    layer.innerHTML = iconize(side === 'physician'
      ? `<div class="after-alert"><div class="after-alert-head">${ic('urgent')} Critical · needs a decision</div>
           <p><b>Tacrolimus 19.4</b> (target 8 to 12). Fluconazole and diltiazem are raising the level. <b>Potassium 6.2.</b></p>
           <p class="after-quiet">Dr. Raman was paged at 13:02. Nephrology advised holding above 12.</p>
           ${abtn('alert', 'hold', 'Hold tonight\'s dose', 'primary')} ${abtn('alert', 'open', 'Open the order')}</div>`
      : `<div class="after-alert"><div class="after-alert-head">${ic('urgent')} Critical · potassium 6.2</div>
           <p>The potassium supplement is <b>blocked</b>. The physician has been paged and an ECG is ordered.</p>
           <p class="after-quiet">Insulin is still due. Stay with the patient.</p>
           ${abtn('alert', 'ack', 'Acknowledge', 'primary')}</div>`);
    layer.classList.add('show');
  }

  function aftClick(k, v) {
    if (ehr.crashed) return;
    aft.clicks++;
    if (k === 'alert') {
      const layer = document.getElementById('ehr-alert');
      if (layer) layer.classList.remove('show');
      if (v === 'hold') {
        aft.dose = { choice: 'hold', step: aftDoseSteps().length };
        aft.signed = true;
      }
    } else if (k === 'dose') {
      if (!aft.dose) {
        // With working alerts the system refuses another dose at a toxic level.
        if (v !== 'hold' && aftFixed('alerts')) aft.stopped = true;
        else aft.dose = { choice: v, step: 0 };
      } else if (++aft.dose.step >= aftDoseSteps().length) aft.signed = true;
    } else if (k === 'mar') {
      aft.mar[v] = (aft.mar[v] || 0) + 1;
    } else if (k === 'vitals') {
      aft.vitals++;
    }
    renderAfter();
  }

  // ---------- money and outcomes ----------

  const pkgTitle = (id) => (id === 'keep' ? PACKAGES.keep.name : `PACKAGE ${PACKAGES[id].letter} · ${PACKAGES[id].name}`);
  const byRank = () => [...PROBLEMS].sort((a, b) => S.problems[a.id].rank - S.problems[b.id].rank);
  const inTier = (tier) => byRank().filter((p) => S.problems[p.id].tier === tier.k);
  const isShared = (id) => S.shared.some((s) => s.id === id);
  const termOffered = (t) => !t.gate || isShared(t.gate);
  const revealedB = () => isShared('it_bhidden');

  function scorecard(deal) {
    const cov = coverage(deal);
    return TIERS.map((tier) => {
      const items = inTier(tier);
      const fixed = items.filter((p) => cov.full.has(p.id)).length;
      const chip = (p) => (cov.full.has(p.id) ? `<span class="pchip ok">✓ ${esc(p.label)}</span>` : cov.partial.has(p.id) ? `<span class="pchip part">◐ ${esc(p.label)}</span>` : `<span class="pchip no">✗ ${esc(p.label)}</span>`);
      return `
        <div class="score-tier ${tier.k}">
          <div class="score-head"><span>${tier.label}</span><b>${fixed} of ${items.length} fixed</b></div>
          ${items.map(chip).join('')}
        </div>`;
    }).join('');
  }

  function dealBox(d) {
    if (d.pkg === 'keep') return '<div class="deal"><div><small>TRUE COST</small><b>$0</b></div><div><small>STATUS QUO</small><b>$4.2M / year</b></div><div><small>GO-LIVE</small><b>never</b></div></div>';
    const c = dealCost(d);
    const pkg = PACKAGES[d.pkg];
    const golive = d.pkg === 'd' && d.terms.includes('march') ? 'March 2028' : pkg.golive;
    return `
      <div class="deal">
        <div><small>PRICE${c.discount ? ' AFTER 8% OFF' : ''}${c.modules ? ' + MODULES' : ''}</small><b>${money(c.price + c.modules + c.extras)}</b></div>
        <div class="${c.over ? 'over' : 'under'}"><small>TRUE 5-YEAR COST vs ${money(c.cap)} CAP</small><b>${money(c.total)}</b></div>
        <div><small>GO-LIVE</small><b>${esc(golive)}</b></div>
      </div>`;
  }

  // Costs nobody put on the package sheet. They land after signing unless a team raised them in time.
  function surprises(d) {
    if (d.pkg === 'keep' || d.pkg === 'a') return [];
    const out = [];
    if (d.pkg === 'b') out.push(revealedB() ? 'IT warned the room about $5M of servers and contractors. It was real.' : '$5M of servers and contractors that were never on the package sheet.');
    if (!d.terms.includes('medcorefee')) out.push(TERM.medcorefee.missing);
    if (!d.terms.includes('exitfee')) out.push(TERM.exitfee.missing);
    if (PACKAGES[d.pkg].lost > RESERVE) out.push(`Lost revenue of ${money(PACKAGES[d.pkg].lost)} was above the ${money(RESERVE)} cash reserve. The hospital borrowed.`);
    return out;
  }

  function roleOutcome(role, d) {
    const pkg = PACKAGES[d.pkg];
    const lines = [];
    const bad = [];
    if (d.pkg === 'd') {
      const governed = d.modules.includes('governance');
      for (const m of MODULES.filter((x) => x.role === role)) {
        if (!d.modules.includes(m.id)) bad.push(m.not);
        else if (m.id === 'scribe' && !governed) bad.push('The AI scribe was bought, then shut down by compliance after 2 months: no governance, no AI.');
        else lines.push(m.bought);
      }
    }
    for (const t of TERMS.filter((x) => x.role === role && x.applies.includes(d.pkg))) {
      if (d.terms.includes(t.id)) lines.push(t.effect);
      else if (t.missing) bad.push(t.missing);
    }
    if (role === 'finance' && d.pkg !== 'keep') {
      const c = dealCost(d);
      (c.over ? bad : lines).unshift(`True cost ${money(c.total)} against a ${money(c.cap)} cap${c.over ? `: ${money(c.total - c.cap)} over. The board made you find it elsewhere.` : '.'}`);
    }
    if (role === 'exec' && d.byExec) lines.unshift('No deal reached the votes it needed, so you decided. Every group that lost knows who to blame.');
    if (role === 'patients' && d.pkg === 'd' && !d.modules.includes('portal') && !d.modules.includes('discharge')) bad.unshift('Nothing in the deal was built for patients. You were told "phase two."');
    return `
      <div class="outcard">
        <div class="outcard-head">${ROLES[role].icon} ${ROLES[role].plural.toUpperCase()}</div>
        <p>${esc(pkg.outcome[role])}</p>
        ${lines.map((l) => `<p class="outcard-plus">＋ ${esc(l)}</p>`).join('')}
        ${bad.map((l) => `<p class="outcard-minus">－ ${esc(l)}</p>`).join('')}
      </div>`;
  }

  // ---------- role cards, coaching, and pitch cues ----------

  const chips = (items, cls) => items.map((i) => `<span class="rc-chip ${cls}">${esc(i)}</span>`).join('');

  // The whole role on one card: what you want, what to say, what you can give up, where you stop.
  function roleCard(key) {
    const r = ROLES[key];
    const g = GROUPS[r.group];
    return `
      <div class="rolecard">
        <div class="rolecard-head"><span class="rolecard-icon">${r.icon}</span> ${r.name}</div>
        <p class="muted small">${esc(r.who)} · ${g.votes ? `${g.votes} of ${TOTAL_VOTES} votes${r.group === 'clinical' ? ', shared by nurses and physicians' : ''}` : 'no vote, but you set the prices'}</p>
        <div class="eyebrow">YOUR GOAL</div>
        <p class="rolecard-priority">${esc(r.goal)}</p>
        <div class="eyebrow">SAY THIS OUT LOUD</div>
        <p class="rc-say">${esc(r.say)}</p>
        <div class="rc-grid">
          <div><div class="eyebrow ok">MUST HAVE</div>${chips(r.musts, 'ok')}</div>
          <div><div class="eyebrow warn">CAN TRADE</div>${chips(r.trade, 'warn')}</div>
          <div><div class="eyebrow bad">RED LINE</div>${chips(r.redline, 'bad')}</div>
        </div>
        <p class="rc-lev"><b>Your leverage:</b> ${esc(r.leverage)}</p>
      </div>`;
  }

  // Private facts. From Phase 2 on, any of them can be published to the whole room with one tap.
  function secretsHtml(key) {
    const r = ROLES[key];
    const canShare = S.phase >= 2 && S.phase <= 5;
    return `
      <div class="private">
        <div class="private-head">🔒 ONLY ${r.plural.toUpperCase()} KNOW</div>
        ${r.secrets
          .map((sec) => {
            const shared = isShared(sec.id);
            const offer = !!sec.unlocks;
            const btn = shared
              ? `<span class="sec-done">${offer ? 'On the table ✓' : 'Room knows ✓'}</span>`
              : canShare
                ? `<button class="btn sm" data-act="share" data-id="${sec.id}">${offer ? '🤝 Put on the table' : '📣 Tell the room'}</button>`
                : '';
            return `<div class="sec ${shared ? 'shared' : ''}"><span>${offer ? '🤝 ' : ''}${esc(sec.text)}</span>${btn}</div>`;
          })
          .join('')}
        <p class="muted small">${key === 'vendor' ? 'An offer you put on the table appears on every ballot. You cannot take it back.' : 'Only your team sees these. Publishing one puts it on the big screen for everyone. You cannot take it back.'}</p>
      </div>`;
  }

  function packageLines(key) {
    const r = ROLES[key];
    return `<div class="private plain"><div class="private-head">WHAT EACH PACKAGE MEANS FOR YOU</div>
      ${PACKAGE_ORDER.map((id) => `<p class="brief-line"><span class="pkg-letter p${id}">${PACKAGES[id].letter}</span><span>${esc(r.brief[id])}</span></p>`).join('')}</div>`;
  }

  const spokesperson = () => S.reps.nurse || S.reps.physician || S.reps.exec || null;

  // One strip at the top of every participant screen: what to do in this part, in this role.
  function coach() {
    const role = S.you.role;
    const r = ROLES[role];
    const g = GROUPS[r.group];
    const clin = r.group === 'clinical';
    const vendor = r.group === 'vendor';
    let lines = [];
    switch (S.step) {
      case 'p1_intro':
        lines = clin ? ['You use the EHR. Do the task you are given.', 'Notice everything that gets in your way.'] : [`You watch the ${r.side} screen. Do not help them.`, r.observe];
        break;
      case 'p2_notes':
        lines = vendor ? ['Work alone and in silence.', 'Tick every problem you could sell a fix for.'] : ['Work alone. No talking yet.', 'Tick every problem you hit or saw.', clin ? '' : `Remember your watching task: ${r.observe}`];
        break;
      case 'p2_merge':
        lines = vendor
          ? ['Listen. Vendors may not speak in this phase.', 'Watch which group stars which problem. That is who you sell to.']
          : ['Now talk, as one hospital. Compare what you noticed.', `Star the ${TOP_PICKS} problems that matter most to ${g.short.toLowerCase()}.`, ...r.raise];
        break;
      case 'p2_top3':
        lines = vendor
          ? ['Still listening. Match the must-fix column to your packages.']
          : role === 'exec'
            ? ['You referee. Get the room to its must-fix problems.', 'Ask the facilitator to move a card between columns.']
            : ['Argue for what belongs in MUST FIX.', `The hospital's spokesperson for the pitchfest is ${spokesperson() || 'chosen now'}.`];
        break;
      case 'p3_hospital':
        lines = vendor ? ['Listen to the hospital\'s list.', 'Your pitch cards are below. One minute per package is coming.'] : [`${spokesperson() || 'Your spokesperson'} presents the list for two minutes.`, 'Everyone else: stay quiet and watch the vendors react.'];
        break;
      case 'p3_pitch':
        lines = vendor ? ['Pitch the highlighted package for one minute, then hand over.', 'Follow the cue card: three fixes, price and date, one honest gap.'] : ['Listen. Questions wait until Phase 4.', ...r.ask.map((q) => `Hold this question: ${q}`)];
        break;
      case 'p4_intra':
        lines = vendor
          ? ['Inside your team: decide which offers to put on the table, and for whom.', 'An offer you publish appears on every ballot.']
          : ['Inside your team only. Do not visit other tables yet.', 'Agree your must-haves, what you will trade, and your red line.', 'Set your position below. It is a straw vote and can change.'];
        break;
      case 'p4_inter':
        lines = vendor
          ? ['Visit every table. Find out who needs what.', 'Put an offer on the table when it wins you a vote.']
          : [`Go to other tables. A deal needs ${PASS} of ${TOTAL_VOTES} votes.`, 'Publish one of your private facts when it helps your case.', 'Update your position as deals form.'];
        break;
      case 'p5_vote':
        lines = vendor
          ? ['You do not vote. Watch the room.']
          : ['Vote on your own device.', `${g.short} cast${g.votes === 2 ? ' 2 votes' : ' 1 vote'} as a block: the package most of you choose.`, 'Be ready to say your vote and one reason in 30 seconds.'];
        break;
      default:
        return '';
    }
    return `<div class="coach"><div class="coach-head">${r.icon} YOUR JOB RIGHT NOW</div><ul>${lines.filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  }

  // Vendor cue card: the three highest-ranked problems this package fixes, the price, and one honest gap.
  function pitchCue(id) {
    const pkg = PACKAGES[id];
    const cov = coverage({ pkg: id, modules: [] });
    const top = byRank().filter((p) => cov.full.has(p.id)).slice(0, 3);
    const c = dealCost({ pkg: id });
    return `
      <div class="cue p${id}">
        <div class="cue-head"><span class="pkg-letter p${id}">${pkg.letter}</span> ${pkg.name} <small>${id === 'a' ? 'pitched by the MedCore representative' : 'pitched by Northwind'}</small></div>
        <ol>
          <li><b>"It fixes</b> ${top.length ? top.map((p) => esc(p.label.toLowerCase())).join(', ') : 'your alert problem'}<b>."</b> <span class="muted small">(the top problems on their list that this package covers)</span></li>
          <li><b>"It costs ${money(pkg.price)}</b>${id === 'd' ? ' for the core, plus the modules you choose' : ''}<b>, and goes live ${esc(pkg.golive)}."</b> <span class="muted small">True cost ${money(c.total)}.</span></li>
          <li><b>"What it does not do:</b> ${esc(pkg.leaves)}<b>"</b></li>
        </ol>
        <p class="muted small">Private: ${esc(ROLES.vendor.brief[id])}</p>
      </div>`;
  }

  const missedBanner = (side) => `
    <div class="missed">
      <div class="eyebrow dark">${side === 'physician' ? 'ON THE PHYSICIAN SCREEN' : 'ON THE NURSE SCREEN'}</div>
      <div class="missed-row">${SIM[side].missed}</div>
      <div class="small">Advisory #${critNumber(side)} of ${ALERTS[side].length}. It looked exactly like "${SIM[side].lookalike}."</div>
      <div class="small">${SIM[side].truth}</div>
    </div>`;

  // Who may move cards between the three columns: the facilitator and each hospital team's representative.
  let picked = null;
  const boardMovable = () => (S.step === 'p2_top3' || S.step === 'p3_hospital') && (S.isHost || (S.you.isRep && S.you.votes));
  const moveCard = (problem, tier) => {
    picked = null;
    if (S.problems[problem] && S.problems[problem].tier !== tier) {
      S.problems[problem].tier = tier; // move at once; the server confirms
      act('tier', { problem, tier });
    }
    render();
  };

  const displayName = () => (S.you.role === 'physician' ? `Dr. ${S.you.name}` : S.you.name);
  const mySide = () => ROLES[S.you.role].side;
  const stepList = (items) => `<ol class="steps">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
  const bigTimer = (side) => `<div class="timerwrap ${side ? 'side' : ''}"><div class="bigtimer ${side ? 'side' : ''}" data-timer="big"></div><div class="timerlabel">${STEP_LABEL[S.step] || ''}</div></div>`;
  const recall = () => `
    <details class="recall"><summary>📦 Reference: packages, modules, costs, coverage</summary>
      <h3>The four packages</h3><div data-dyn="packages"></div>
      <h3>Module menu for Package D</h3><div data-dyn="menu"></div>
      <h3>True five-year cost</h3><div data-dyn="costs"></div>
      <h3>Which problems each package fixes</h3><div data-dyn="matrix"></div>
    </details>`;

  // ---------- facilitator procedure: what to say and do in every part ----------
  const PROCEDURE = {
    lobby: ['Share the address and the room code.', 'Wait for seats to fill, or press Randomize.', 'Press Begin when every group has someone.'],
    p1_intro: ['Read the two tasks aloud.', 'Remind the room: no talking.', 'Press Start the simulation.'],
    p1_ehr: ['Say nothing. Let the alerts build.', 'The screen moves on by itself after the crash.'],
    p2_notes: ['Read out the two alerts that were missed.', 'Everyone ticks problems alone, in silence.', 'Press Next at zero.'],
    p2_merge: ['Ask the room: "What stopped you from doing your job?"', 'Each person stars 3 problems for their group.', 'Vendors listen and do not speak.'],
    p2_top3: ['Ask what belongs in Must fix.', 'Drag cards between columns as the room decides.', 'Confirm the spokesperson, then press Next.'],
    p3_hospital: ['Invite the spokesperson to present for two minutes.', 'Vendors stay silent and prepare.', 'Press Next to start the pitches.'],
    p3_pitch: ['One minute per package: A, B, C, D.', 'Call time when the pitch timer reaches zero.', 'Hold all questions for Phase 4.'],
    p4_intra: ['Teams stay at their own tables.', 'Each person sets a position on their device.', 'Remind teams that they hold private facts.'],
    p4_inter: ['Send people to other tables. Vendors visit everyone.', 'Watch the board: a deal needs 5 of 7 votes.', 'With two minutes left, ask the executives to announce the ballot.'],
    p5_vote: ['Call each group for its vote and one reason.', 'Wait for the count to finish.', 'Press Next to reveal the result.'],
    p6_decision: ['Ask the CEO to announce the decision to the vendors.', 'Ask the vendors: accept or refuse?', 'Press Next for the replay.'],
    p6_sim: ['Players redo the same task in the new system on their devices.', 'Ask: how many clicks did it take this time?', 'Ask: what is still broken?'],
    p6_outcome: ['Read the headline and the patient line.', 'Ask one group to read its outcome card.', 'Press Next for the feedback form.'],
    p6_reflect: ['Give everyone one minute.', 'Download the feedback CSV before closing the game.'],
    debrief: ['Take the four questions in order.', 'Ask which published fact changed the room.'],
  };
  function procedure() {
    const steps = PROCEDURE[S.step];
    if (!steps) return '';
    return `<div class="proc"><span class="proc-tag">FACILITATOR</span><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
  }

  // ---------- step screens ----------

  function stage() {
    const host = S.isHost;
    const me = host ? null : ROLES[S.you.role];
    const vendor = !host && S.you.group === 'vendor';
    switch (S.step) {
      case 'lobby':
        if (host) {
          const local = ['localhost', '127.0.0.1'].includes(location.hostname);
          const url = local && S.lan && S.lan.length ? S.lan[0] : location.origin;
          return `
            <div class="center">
              <div class="eyebrow">GO TO</div>
              <div class="joinurl">${esc(url.replace(/^https?:\/\//, ''))}</div>
              <div class="eyebrow">ROOM CODE</div>
              <div class="roomcode">${esc(S.code)}</div>
              <div data-dyn="lobbyhost"></div>
              <p><button class="btn" data-act="shuffle">🎲 RANDOMIZE EVERYONE BY THE SEAT PLAN</button></p>
              <p class="muted small">Seat plan from the facilitator pack: executives 3 to 5, finance 3 to 5, clinical 8 to 12, IT 3 to 5, compliance 3 to 4, patients 2 to 4, vendors 3 to 5.</p>
            </div>`;
        }
        return `
          <div class="center narrow">
            <h1>Welcome, ${esc(displayName())}</h1>
            <div class="eyebrow">YOUR SEAT: ${me.name}</div>
            ${roleCard(S.you.role)}
            <p class="muted">This card is always one tap away: press your name at the top right.</p>
            <p class="waiting">Waiting for the facilitator to begin<span class="dots"></span></p>
            <button class="btn ghost" data-act="rerole">Change seat</button>
          </div>`;

      case 'p1_intro':
        if (host) {
          const watchers = ROLE_ORDER.filter((r) => ROLES[r].observe);
          return `
            <div class="center reveal">
              ${bigTimer()}
              <h1 class="huge">IT IS 13:02 ON 6 WEST.</h1>
              <p class="lead">Mr. Whitfield's labs just posted. Do your job.</p>
              <div class="twocol">
                <div class="taskcard"><div class="eyebrow">🧑‍⚕️ PHYSICIANS</div><p>${SIM.physician.brief}</p></div>
                <div class="taskcard"><div class="eyebrow">👩‍⚕️ NURSES</div><p>${SIM.nurse.brief}</p></div>
              </div>
              <div class="watchgrid">${watchers.map((r) => `<div class="watch"><b>${ROLES[r].icon} ${ROLES[r].plural}</b><span>watch the ${ROLES[r].side} screen</span><p>${esc(ROLES[r].observe)}</p></div>`).join('')}</div>
              <p class="muted">No talking. Four minutes: one quiet minute, then the alert storm.</p>
            </div>`;
        }
        return `
          <div class="center narrow reveal">
            ${bigTimer(true)}
            <h1 class="huge">BEFORE YOU FIX IT, USE IT.</h1>
            ${coach()}
            <div class="taskcard"><div class="eyebrow">${S.you.role === mySide() ? 'YOUR TASK' : `THE ${mySide().toUpperCase()}'S TASK`}</div><p class="lead">${SIM[mySide()].brief}</p></div>
            <p class="muted">Four minutes. No talking.</p>
          </div>`;

      case 'p1_ehr':
        if (!host) return ehrChart(mySide());
        return `
          <div class="center narrow">
            <div class="eyebrow">PATIENT: JAMES WHITFIELD, 61 · LIVER TRANSPLANT, DAY 6</div>
            ${bigTimer()}
            <div data-dyn="ehrhost"></div>
          </div>`;

      case 'p2_notes':
        // The projector shows both screens' missed alert side by side with the hospital's live problem log.
        if (host) {
          return `
            <div class="center wide">
              <div class="timeline"><h1 class="huge">SYSTEM DOWN.</h1>${bigTimer()}</div>
              <div class="split">
                <div>
                  ${missedBanner('physician')}${missedBanner('nurse')}
                  <div data-dyn="ehrstats"></div>
                </div>
                <div>
                  <h2>On your own: what stopped you from doing your job?</h2>
                  <div data-dyn="count:reports"></div>
                  <div class="compactbars" data-dyn="reportbars"></div>
                </div>
              </div>
            </div>`;
        }
        return `
          <div class="center narrow">
            ${bigTimer(true)}
            <h1 class="huge">SYSTEM DOWN.</h1>
            ${missedBanner(mySide())}
            <div data-dyn="ehrstats"></div>
            ${coach()}
            <h2>What stopped ${S.you.group === 'clinical' ? 'you' : 'them'} from doing the job?</h2>
            <div data-dyn="report"></div>
            <label class="field">Anything not on the list?
              <input data-other maxlength="200" value="${esc(S.you.report.other)}" placeholder="Optional">
            </label>
          </div>`;

      case 'p2_merge':
        if (host) {
          return `
            <div class="center wide">
              ${bigTimer()}
              <h1>What stopped you from doing your job?</h1>
              <p class="lead">One hospital, one list. Each person stars the <b>${TOP_PICKS} problems</b> that matter most to their group. Vendors listen and may not speak.</p>
              <div data-dyn="count:top"></div>
              <div data-dyn="board"></div>
            </div>`;
        }
        return `
          <div class="center narrow">
            ${bigTimer(true)}
            <h1>ONE HOSPITAL, ONE LIST</h1>
            ${coach()}
            ${vendor ? '<div data-dyn="sellmap"></div>' : '<div data-dyn="intra"></div>'}
          </div>`;

      case 'p2_top3':
        return `
          <div class="center ${host ? 'wide' : ''}">
            ${bigTimer(!host)}
            <h1>Which problems must be fixed?</h1>
            ${host ? '<p class="lead">Decide together what must be fixed, and choose a spokesperson. The facilitator and team representatives can move cards.</p>' : coach()}
            <div data-dyn="spokes"></div>
            <div data-dyn="board"></div>
            ${host ? '<div data-dyn="others"></div><div data-dyn="shared"></div>' : ''}
          </div>`;

      case 'p3_hospital':
        return `
          <div class="center narrow reveal">
            ${bigTimer(!host)}
            <h1 class="huge">🤝 "HERE IS OUR PROBLEM."</h1>
            ${host ? '<p class="lead">The hospital\'s spokesperson has two minutes to present the list to the vendors.</p>' : coach()}
            <div data-dyn="spokes"></div>
            <div data-dyn="critical"></div>
            ${vendor ? `<h2>Your pitch cards</h2>${PACKAGE_ORDER.map(pitchCue).join('')}` : ''}
          </div>`;

      case 'p3_pitch':
        return `
          <div class="center ${host ? 'wide' : ''}">
            ${bigTimer(!host)}
            <h1>"WHAT CAN YOU SELL US?"</h1>
            <div data-dyn="pitchnow"></div>
            ${host ? '' : coach()}
            ${vendor ? '<div data-dyn="pitchcue"></div>' : ''}
            <div data-dyn="pitchpackages"></div>
            <h2>Module menu for Package D</h2>
            <div data-dyn="menu"></div>
            <p class="muted">A fifth option always exists: sign nothing and keep the current EHR.</p>
          </div>`;

      case 'p4_intra':
        if (host) {
          return `
            <div class="center wide">
              ${bigTimer()}
              <h1>${money(CAP)}. Four packages. ${PASS} votes needed.</h1>
              ${stepList([
                'Stay <b>inside your own team</b> for these eight minutes.',
                'Read your private brief. Agree your <b>must-haves</b>, what you can <b>trade</b>, and your <b>red line</b>.',
                'Each person sets a position on their own device. It can change later.',
              ])}
              <div data-dyn="count:straw"></div>
              <div class="split"><div><div class="eyebrow">TRUE FIVE-YEAR COST</div><div data-dyn="costs"></div></div><div><div class="eyebrow">MODULE MENU · PACKAGE D</div><div data-dyn="menu"></div></div></div>
              <div data-dyn="shared"></div>
            </div>`;
        }
        return `
          <div class="center narrow">
            ${bigTimer(true)}
            <h1>TEAM HUDDLE: ${GROUPS[me.group].short.toUpperCase()}</h1>
            ${coach()}
            <div data-dyn="secrets"></div>
            ${packageLines(S.you.role)}
            ${vendor ? '' : '<h2>Your position</h2><p class="muted">A straw vote. Your team sees how your team is leaning.</p><div data-dyn="ballot:straw"></div>'}
            <details class="recall"><summary>🪪 Your role card</summary>${roleCard(S.you.role)}</details>
            ${recall()}
          </div>`;

      case 'p4_inter':
        return `
          <div class="center ${host ? 'wide' : 'narrow'}">
            ${bigTimer(!host)}
            <h1>NEGOTIATE</h1>
            <div class="checkpoint" data-checkpoint></div>
            ${host ? `<p class="lead">Send people to other tables. Vendors may visit any table. A deal is a package, modules, a go-live month, and contract terms.</p>` : coach()}
            <div data-dyn="strawboard"></div>
            <div data-dyn="shared"></div>
            ${host ? '<div class="split"><div><div class="eyebrow">TRUE FIVE-YEAR COST</div><div data-dyn="costs"></div></div><div><div class="eyebrow">MODULE MENU · PACKAGE D</div><div data-dyn="menu"></div></div></div>' : `
              <div data-dyn="secrets"></div>
              ${vendor ? '' : '<h2>Your position</h2><p class="muted">Update it as the negotiation moves.</p><div data-dyn="ballot:straw"></div>'}
              <details class="recall"><summary>🪪 Your role card</summary>${roleCard(S.you.role)}${packageLines(S.you.role)}</details>
              ${recall()}`}
          </div>`;

      case 'p5_vote':
        return `
          <div class="center narrow">
            ${bigTimer(!host)}
            <h1>VOTE.</h1>
            ${host
              ? `<p class="lead">Each group has 30 seconds to state its vote and one reason. Results are sealed until the decision.</p>
                 <div data-dyn="count:final"></div>
                 ${stepList([
                   `A deal passes with <b>${PASS} of ${TOTAL_VOTES} votes</b>. Executives hold 2.`,
                   'Each group votes as a block: the package most of its members choose.',
                   'A module or term is adopted when groups holding a majority of votes want it.',
                   `Modules are bought in order of support <b>until the ${money(CAP)} cap is reached</b>.`,
                   'If nothing reaches the bar, the executives decide and must explain why.',
                 ])}`
              : vendor
                ? `${coach()}<p class="lead">The hospital is voting. You will hear the decision from the CEO.</p><div data-dyn="shared"></div>`
                : `${coach()}<div data-dyn="ballot:final"></div>`}
          </div>`;

      case 'p6_decision': {
        const d = S.decision;
        const pkg = PACKAGES[d.pkg];
        const t = d.tally;
        return `
          <div class="center narrow reveal">
            ${bigTimer(!host)}
            <div class="eyebrow">THE HOSPITAL HAS DECIDED</div>
            <div class="winner p${d.pkg}">
              <div class="winner-icon">${pkg.icon}</div>
              <h1>${esc(pkgTitle(d.pkg))}</h1>
              <p>${esc(pkg.tagline)}</p>
            </div>
            <p class="lead">${d.empty ? 'Nobody voted.' : d.passed ? `Passed with <b>${d.votes} of ${t.present} votes</b>.` : d.byExec ? `No deal reached ${t.need} votes. <b>The executives decided</b>, and must explain why.` : `No deal reached ${t.need} votes.`}</p>
            ${d.pkg === 'd' ? `
              <div class="eyebrow">MODULES BOUGHT</div>
              ${d.modules.length ? `<ul class="terms">${d.modules.map((id) => `<li>${MODULE[id].icon} ${esc(MODULE[id].label)} · ${d.terms.includes('reference') && id === 'governance' ? 'free' : money(MODULE[id].price)}</li>`).join('')}</ul>` : '<p class="muted">None. No module had majority support.</p>'}
              ${d.dropped.length ? `<p class="dropped">Wanted, but the money ran out: ${d.dropped.map((id) => esc(MODULE[id].label)).join(' · ')}</p>` : ''}` : ''}
            <div>
              <div class="eyebrow">CONTRACT TERMS</div>
              ${d.terms.length ? `<ul class="terms">${d.terms.map((id) => `<li>${esc(TERM[id].label)}</li>`).join('')}</ul>` : '<p class="muted">No terms had majority support.</p>'}
            </div>
            ${dealBox(d)}
            <p class="lead">🤝 CEO: announce the decision to the vendor. ${d.pkg === 'keep' ? '' : 'Vendors: accept, or refuse.'}</p>
            <div data-dyn="finalboard"></div>
          </div>`;
      }

      case 'p6_sim': {
        if (!host) return afterEhr(mySide());
        const d = S.decision;
        const cov = coverage(d);
        return `
          <div class="center narrow reveal">
            ${bigTimer()}
            <h1 class="huge">ONE YEAR LATER</h1>
            <p class="lead">${d.pkg === 'keep' ? 'Nothing was installed.' : `${esc(PACKAGES[d.pkg].name)} is live.`} It is 13:02 on 6 West again. Open Mr. Whitfield's chart.</p>
            <div class="stats">
              <div class="stat"><b>347 → ${PACKAGES[d.pkg].alertsAfter}</b><span>alerts in three minutes</span></div>
              <div class="stat"><b>${cov.full.size} of 15</b><span>problems fixed${cov.partial.size ? `, ${cov.partial.size} more partly` : ''}</span></div>
            </div>
            <p class="muted">Do the same task again. Count your clicks. Then look at what did not change.</p>
          </div>`;
      }

      case 'p6_outcome': {
        const d = S.decision;
        const pkg = PACKAGES[d.pkg];
        const roles = host ? ROLE_ORDER : [S.you.role, ...ROLE_ORDER.filter((r) => r !== S.you.role)];
        const cov = coverage(d);
        const extra = d.pkg === 'd'
          ? [d.modules.includes('portal') ? MODULE.portal.bought : MODULE.portal.not, d.terms.includes('bridge') ? TERM.bridge.effect : TERM.bridge.missing]
          : [];
        const shock = surprises(d);
        return `
          <div class="center reveal">
            ${bigTimer(!host)}
            <div class="eyebrow">ONE YEAR LATER · ${esc(pkgTitle(d.pkg))}</div>
            <h1 class="huge">${esc(pkg.headline)}</h1>
            <div class="maria"><b>Mr. Whitfield, 13:02:</b> ${esc(pkg.whitfield)} ${extra.map(esc).join(' ')}</div>
            <div class="stats">
              <div class="stat"><b>347 → ${pkg.alertsAfter}</b><span>alerts in three minutes</span></div>
              <div class="stat"><b>${cov.full.size} of 15</b><span>problems fixed${cov.partial.size ? `, ${cov.partial.size} partly` : ''}</span></div>
            </div>
            <ul class="cardlist">${pkg.cards.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
            <div class="scores">${scorecard(d)}</div>
            ${dealBox(d)}
            ${shock.length ? `<div class="shock"><div class="eyebrow bad">WHAT NOBODY BUDGETED</div>${shock.map((x) => `<p>－ ${esc(x)}</p>`).join('')}</div>` : ''}
            <div class="outcards ${host ? '' : 'mine-first'}">${roles.map((r) => roleOutcome(r, d)).join('')}</div>
          </div>`;
      }

      case 'p6_reflect':
        if (host) {
          return `
            <div class="center narrow">
              ${bigTimer()}
              <h1>FEEDBACK FORM</h1>
              <p class="lead">Six short questions on your own device.</p>
              <div data-dyn="count:reflections"></div>
              <div data-dyn="reflections"></div>
            </div>`;
        }
        return reflectForm();

      case 'debrief':
        return `
          <div class="center narrow reveal">
            <div class="eyebrow">DEBRIEF</div>
            <h1>Everyone agreed the EHR was broken.</h1>
            <h1 class="accent">So why was fixing it so hard?</h1>
            ${stepList([
              'Why did the hospital reach this decision?',
              'What did each group give up, and who gave up the most?',
              'Which private fact changed the room when it was published? Which stayed hidden?',
              'What would have had to be true for all seven votes to say yes?',
            ])}
            <div data-dyn="finalboard"></div>
            <div data-dyn="shared"></div>
            ${host ? '<div data-dyn="count:reflections"></div>' : reflectForm(true)}
          </div>`;

      case 'reveal_cards': {
        const cards = [
          ['🧠', 'BEHAVIORAL ARCHITECTURE', 'People prefer familiar systems and perceive action differently from inaction.', 'Every package had a flaw you could see. The current EHR\'s flaws were familiar, so "no deal" stayed on the ballot.'],
          ['💰', 'FINANCIAL ARCHITECTURE', 'The organization paying for an innovation may not capture its benefits.', 'Finance could count the $45M cap to the dollar. Nobody could put a number on a potassium caught in time.'],
          ['🩺', 'PROFESSIONAL ARCHITECTURE', 'Changing technology changes people\'s jobs, responsibilities and authority.', 'Physicians wanted the scribe. Nurses wanted single entry. They shared one vote.'],
          ['🕸️', 'NETWORK ARCHITECTURE', 'Health care changes require many interconnected people and systems to cooperate.', 'No group could pass a deal alone: 43 interfaces, seven groups, five votes.'],
          ['⚖️', 'ETHICAL / LEARNING ARCHITECTURE', 'Health systems need evidence that changes work, and gathering that evidence creates its own barriers.', 'No AI without governance. Governance cost $3M that could have bought something clinicians asked for.'],
        ];
        return `
          <div class="center">
            <h1 class="huge">🎓 WHAT JUST HAPPENED?</h1>
            <div class="archs">
              ${cards
                .map(
                  ([icon, title, text, you], i) => `
                <div class="arch" style="animation-delay:${0.5 + i * 0.9}s">
                  <div class="arch-icon">${icon}</div>
                  <div class="arch-title">${title}</div>
                  <p>${text}</p>
                  <p class="arch-you">${you}</p>
                </div>`
                )
                .join('')}
            </div>
          </div>`;
      }

      case 'reveal_point':
        return `
          <div class="center narrow reveal point">
            <div class="eyebrow">THE POINT</div>
            <h1>A better technology does not automatically create a better health-care system.</h1>
            <p class="lead">Successful innovation has to work with:</p>
            <p class="formula">people + incentives + workflows + institutions + evidence</p>
            <p class="lead">The EHR solved enormous problems with medical information.</p>
            <p class="lead">It also created new ones: documentation burden, note bloat, and alert fatigue.</p>
            <p class="lead"><b>The system you just bought will solve some of those.</b></p>
            <h1 class="accent question">What new problems might it create?</h1>
          </div>`;

      default:
        return '';
    }
  }

  // ---------- feedback form (the six questions from the facilitator pack) ----------

  const reflectDraft = { worst: null, fixed: null, surprised: '', gaveup: '', learned: '' };
  let reflectTimer = null;

  function reflectForm(compact) {
    Object.assign(reflectDraft, S.you.reflection || {});
    const area = (key, label) => `
      <label class="field">${label}
        <textarea data-reflect="${key}" rows="2" maxlength="600">${esc(reflectDraft[key])}</textarea>
      </label>`;
    return `
      <div class="${compact ? 'reflect compact' : 'center narrow reflect'}">
        ${compact ? '<h2>Your feedback</h2>' : `${bigTimer(true)}<h1>FEEDBACK FORM</h1>`}
        <p class="lead">1. You played: <b>${esc(GROUPS[S.you.group].name)}</b></p>
        <label class="field">2. Which EHR problem felt worst during the simulation?
          <select data-reflect="worst">
            <option value="">Choose one</option>
            ${PROBLEMS.map((p) => `<option value="${p.id}" ${reflectDraft.worst === p.id ? 'selected' : ''}>${p.n}. ${esc(p.label)}</option>`).join('')}
          </select>
        </label>
        <div class="field">3. Did the final deal fix the problem you cared about most?
          <div data-dyn="fixedpick"></div>
        </div>
        ${area('surprised', '4. Which group surprised you most, and why?')}
        ${area('gaveup', '5. What did you give up in the negotiation?')}
        ${area('learned', '6. One thing you now understand about why hospital software is hard to change:')}
        <p class="muted small" id="reflect-saved">Your answers save as you type.</p>
      </div>`;
  }

  function saveReflection(delay) {
    clearTimeout(reflectTimer);
    reflectTimer = setTimeout(async () => {
      const res = await act('reflect', reflectDraft);
      const note = document.getElementById('reflect-saved');
      if (res && note) note.textContent = 'Saved ✓';
    }, delay);
  }

  function exportCsv() {
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['group', 'seat', 'worst_problem', 'deal_fixed_it', 'group_that_surprised_me', 'what_i_gave_up', 'what_i_now_understand']];
    for (const r of S.reflections) rows.push([GROUPS[ROLES[r.role].group].name, ROLES[r.role].short, r.worst ? PROBLEM[r.worst].label : '', r.fixed, r.surprised, r.gaveup, r.learned]);
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fix-the-hospital-feedback-${S.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- chrome ----------

  function topbar() {
    const ph = S.phase;
    const pill = ph >= 1 && ph <= 6 ? `PHASE ${ph}/6` : ph === 7 ? 'DEBRIEF' : 'LOBBY';
    const dots = [1, 2, 3, 4, 5, 6]
      .map((i) => `<i class="${i < ph ? 'done' : i === ph ? 'now' : ''}"></i>`)
      .join('');
    const right = S.isHost
      ? `<span class="chip">ROOM <b>${esc(S.code)}</b></span>`
      : S.you.role
        ? `<button class="chip" data-act="showrole">${ROLES[S.you.role].icon} ${esc(S.you.name)} · ${ROLES[S.you.role].short}${S.you.isRep ? ' ⭐' : ''}</button>`
        : `<span class="chip">${esc(S.you.name)}</span>`;
    return `
      <header class="topbar">
        <div class="brand">🏥 <span>FIX THE HOSPITAL</span></div>
        <div class="progress">
          <span class="pill">${pill}</span>
          <span class="roundname">${PHASE_TITLES[ph] || ''}${STEP_LABEL[S.step] ? ` · ${STEP_LABEL[S.step].toUpperCase()}` : ''}</span>
          <span class="dotrow">${dots}</span>
        </div>
        <div class="topright">
          <span class="timer hidden" data-timer></span>
          ${right}
        </div>
      </header>
      <div class="offline-banner">Reconnecting…</div>`;
  }

  function hostbar() {
    const lobby = S.step === 'lobby';
    const last = S.step === 'reveal_point';
    const timed = S.timerTotal && S.step !== 'p1_ehr';
    const nextLabel = lobby ? 'BEGIN ▶' : S.step === 'p1_intro' ? 'START THE SIMULATION ▶' : 'NEXT ▶';
    return `
      <footer class="hostbar">
        ${lobby ? '<button class="btn ghost" data-act="leave">Close room</button>' : '<button class="btn" data-act="back">◀ BACK</button>'}
        <span class="hostbar-info" data-dyn="pcount"></span>
        ${timed ? '<button class="btn" data-act="timer-add">+1 MIN</button><button class="btn" data-act="timer-restart">RESTART TIMER</button>' : ''}
        ${S.phase >= 6 && S.step !== 'p6_decision' && S.step !== 'p6_sim' ? '<button class="btn" data-act="export">⬇ FEEDBACK (CSV)</button>' : ''}
        <span class="spacer"></span>
        ${!lobby && S.phase < 7 ? '<button class="btn danger" data-act="end">SKIP TO DEBRIEF</button>' : ''}
        ${last ? '' : `<button class="btn primary" data-act="next">${nextLabel}</button>`}
      </footer>`;
  }

  // ---------- live regions ----------

  function setHtml(el, html) {
    if (el._html !== html) {
      el.innerHTML = iconize(html);
      el._html = html;
    }
  }

  // Horizontal bars that are built once, so widths animate as numbers change.
  function bars(el, rows, total, unit) {
    const sig = rows.map((r) => r.k).join(',');
    if (el._sig !== sig) {
      el._html = null;
      el.classList.add('bars');
      el.innerHTML =
        rows
          .map(
            (r) => `
          <div class="bar-row" data-opt="${r.k}">
            <div class="bar-label">${r.label}</div>
            <div class="bar-track"><div class="bar-fill ${r.cls || ''}"></div></div>
            <div class="bar-pct"></div>
          </div>`
          )
          .join('') + '<div class="bar-total muted small"></div>';
      el._sig = sig;
    }
    for (const r of rows) {
      const row = el.querySelector(`[data-opt="${r.k}"]`);
      row.querySelector('.bar-fill').style.width = `${pct(r.n, total)}%`;
      row.querySelector('.bar-pct').textContent = r.n;
    }
    el.querySelector('.bar-total').textContent = unit || '';
  }

  const SEATS = { exec: '3 to 5', finance: '3 to 5', physician: '4 to 6', nurse: '4 to 6', it: '3 to 5', compliance: '3 to 4', patients: '2 to 4', vendor: '3 to 5' };
  const pkgRows = (tally) =>
    BALLOT_ORDER.map((id) => ({ k: id, label: id === 'keep' ? 'No deal' : `${PACKAGES[id].letter} · ${PACKAGES[id].name}`, cls: `p${id}`, n: tally.counts[id] }));
  const letterOf = (id) => (id === 'keep' ? 'no deal' : PACKAGES[id].letter);

  // One row per voting group: how its members split, and which way its block vote goes.
  function groupPicksHtml(tally) {
    return VOTING_GROUPS.map((g) => {
      const c = tally.split[g] || {};
      const segs = BALLOT_ORDER.map((id) => (c[id] ? `<div class="seg p${id}" style="flex:${c[id]}">${letterOf(id)} ${c[id]}</div>` : '')).join('');
      const pick = tally.picks[g];
      return `
        <div class="role-row">
          <div class="role-name">${GROUPS[g].icon} ${GROUPS[g].short} <small>${GROUPS[g].votes === 2 ? '2 votes' : '1 vote'}</small></div>
          <div class="segs">${segs || '<div class="seg none">no position yet</div>'}</div>
          <div class="pick ${pick ? `p${pick}` : ''}">${pick ? `→ ${letterOf(pick)}` : ''}</div>
        </div>`;
    }).join('');
  }

  function supportBar(icon, label, tagText, weight, tally, extraCls) {
    const share = pct(weight, tally.present || TOTAL_VOTES);
    const inn = tally.present && weight >= tally.majority;
    return `
      <div class="modbar ${inn ? 'in' : ''} ${extraCls || ''}">
        <span class="modbar-fill" style="width:${share}%"></span>
        <span class="modbar-label">${icon} ${esc(label)} <small>${tagText}</small></span>
        <span class="modbar-pct">${weight}/${tally.present || TOTAL_VOTES}${inn ? ' ✓' : ''}</span>
      </div>`;
  }

  function previewHtml(d) {
    if (d.empty) return '<p class="muted">No positions yet.</p>';
    const c = d.cost;
    const t = d.tally;
    return `
      <div class="preview p${d.pkg}">
        <div class="eyebrow">IF THE VOTE WERE HELD NOW</div>
        <p class="leadline"><b>${esc(pkgTitle(d.pkg))}</b> · ${d.passed ? `passes with ${d.votes} of ${t.present} votes` : d.byExec ? `only ${t.counts[d.pkg]} of ${t.present} votes: the executives would have to decide` : `no deal reaches ${t.need} votes`}</p>
        ${d.pkg === 'd' ? `<p>Modules bought: <b>${d.modules.length ? d.modules.map((id) => esc(MODULE[id].label)).join(', ') : 'none'}</b>${d.dropped.length ? ` · <span class="dropped">no money left for: ${d.dropped.map((id) => esc(MODULE[id].label)).join(', ')}</span>` : ''}</p>` : ''}
        ${d.terms.length ? `<p>Terms: ${d.terms.map((id) => esc(TERM[id].label)).join(' · ')}</p>` : ''}
        ${d.pkg === 'keep' ? '' : `<p class="${c.over ? 'overline' : 'underline'}">True cost <b>${money(c.total)}</b> against a ${money(c.cap)} cap: ${c.over ? `${money(c.total - c.cap)} OVER` : `${money(c.cap - c.total)} to spare`}</p>`}
      </div>`;
  }

  // Package cards. None is highlighted by default; a card lifts when you hover or focus it.
  function pkgCards(current) {
    const critical = inTier(TIERS[0]);
    return (
      '<div class="pkgs">' +
      PACKAGE_ORDER.map((id) => {
        const pkg = PACKAGES[id];
        const cov = coverage({ pkg: id, modules: [] });
        const c = dealCost({ pkg: id }, id === 'b' && revealedB());
        const missed = critical.filter((p) => !cov.full.has(p.id));
        return `
          <div class="pkg p${id}" tabindex="0">
            ${current === id ? '<div class="pitch-tag">NOW PITCHING</div>' : ''}
            <div class="pkg-head"><span class="pkg-letter p${id}">${pkg.letter}</span><span>${pkg.icon} ${pkg.name}</span></div>
            <p class="pkg-tag">${esc(pkg.seller)}. ${esc(pkg.tagline)}</p>
            <div class="pkg-stats">
              <div><small>PRICE</small><b>${money(pkg.price)}${id === 'd' ? '+' : ''}</b></div>
              <div><small>TRUE COST</small><b>${money(c.total)}</b></div>
              <div><small>GO-LIVE</small><b>${pkg.months} mo</b></div>
            </div>
            <p class="pkg-fix"><b>${cov.full.size} of 15</b> problems fixed${cov.partial.size ? `, ${cov.partial.size} partly` : ''}${id === 'd' ? ' (more with modules)' : ''}</p>
            <ul class="pkg-features">${pkg.includes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
            <p class="pkg-catch"><b>The catch:</b> ${esc(pkg.catchline)}</p>
            <p class="pkg-meta">${esc(pkg.golive)} · ${esc(pkg.style)} · ${esc(pkg.hosting)} · training ${esc(pkg.training)}</p>
            ${missed.length ? `<p class="pkg-miss">Must-fix left open: ${missed.map((p) => esc(p.label)).join(', ')}</p>` : '<p class="pkg-hit">Covers every must-fix problem.</p>'}
          </div>`;
      }).join('') +
      '</div>'
    );
  }

  const DYN = {
    count(el, what) {
      const labels = { reports: 'have logged problems', top: 'have starred their top problems', straw: 'have taken a position', final: 'have voted', reflections: 'feedback forms in' };
      const of = what === 'reflections' ? S.playerCount : S.voterCount;
      setHtml(el, `<p class="votedcount"><b>${S.counts[what]}</b> of ${of} ${labels[what]}</p>`);
    },

    pcount(el) {
      const here = S.players.filter((p) => p.connected).length;
      setHtml(el, `👥 ${plural(S.playerCount, 'player')}${here < S.playerCount ? ` (${here} online)` : ''}`);
    },

    lobbyhost(el) {
      const counts = ROLE_ORDER.map(
        (key) => `<div class="rolecount"><span>${ROLES[key].icon}</span><b>${S.roleCounts[key]}</b><small>${ROLES[key].plural}<br>plan ${SEATS[key]}</small></div>`
      ).join('');
      const names = S.players
        .map(
          (p) =>
            `<span class="namechip ${p.connected ? '' : 'away'}">${p.role ? ROLES[p.role].icon : '…'} ${esc(p.name)}<button title="Remove" data-act="kick" data-pub="${p.pub}">✕</button></span>`
        )
        .join('');
      setHtml(
        el,
        `<div class="joined"><b>${S.playerCount}</b> player${S.playerCount === 1 ? '' : 's'} joined</div>
         <div class="rolecounts eight">${counts}</div>
         <div class="names">${names}</div>`
      );
    },

    rolepick(el) {
      setHtml(
        el,
        ROLE_ORDER.map((key) => {
          const r = ROLES[key];
          return `
            <button class="rolepick" data-act="role" data-role="${key}">
              <span class="rolepick-icon">${r.icon}</span>
              <span class="rolepick-name">${r.name}</span>
              <span class="rolepick-text">${esc(r.goal)}</span>
              <span class="rolepick-count">${S.roleCounts[key]} seated · plan ${SEATS[key]}</span>
            </button>`;
        }).join('')
      );
    },

    ehrhost(el) {
      const total = S.ehr.physician.dismissed + S.ehr.nurse.dismissed;
      const t = elapsedSec();
      const phase = t < STORM_START
        ? '<h1>Minute one: a normal bad day.</h1><p class="lead">A few reminders. A dose to give. A level to find.</p>'
        : t < CRASH_AT
          ? '<h1 class="storm">ALERT STORM</h1><p class="lead">The lab interface is resending results. Every rule is re-firing on all 22 orders.</p>'
          : '<h1 class="storm">SYSTEM DOWN</h1><p class="lead">The application server ran out of memory. Every workstation on 6 West just froze.</p>';
      setHtml(el, `${phase}<div class="counter"><b>${total}</b><span>alerts dismissed by the hospital so far</span></div>`);
    },

    ehrstats(el) {
      const { physician, nurse } = S.ehr;
      const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
      const parts = [];
      const total = physician.dismissed + nurse.dismissed;
      const stat = (n, text) => parts.push(`<div class="stat"><b>${n}</b><span>${text}</span></div>`);
      if (total) stat(total, 'alerts dismissed by the hospital in four minutes');
      if (physician.critSeen) stat(secs(physician.critMedianMs), 'median time the tacrolimus interaction warning stayed on a physician screen');
      if (nurse.critSeen) stat(secs(nurse.critMedianMs), 'median time the potassium alert stayed on a nurse screen');
      if (physician.players) {
        stat(physician.doseHold, 'held tonight\'s tacrolimus (the right call)');
        stat(physician.doseContinue + physician.doseReduce, 'signed another dose at a level of 19.4');
        stat(physician.doseNone, 'never finished the order before the crash');
      }
      if (nurse.players) {
        stat(nurse.gaveSupp, 'gave a potassium supplement at a potassium of 6.2');
        stat(nurse.gaveLact, 'gave lactulose he no longer needs');
        stat(nurse.insulin, 'finished the ten-step insulin dose');
      }
      const mine = [];
      const e = !S.isHost && S.you.ehr;
      if (e && typeof e.critMs === 'number') mine.push(`You dismissed that alert after <b class="accent">${secs(e.critMs)}</b>.`);
      if (e && e.dose === 'hold') mine.push('You held tonight\'s tacrolimus. <b class="accent">Right call.</b>');
      if (e && (e.dose === 'continue' || e.dose === 'reduce')) mine.push('You signed another tacrolimus dose. <b class="red">The level was 19.4.</b>');
      if (e && e.given.includes('supp')) mine.push('You documented the <b class="red">potassium supplement</b> as given. His potassium was 6.2.');
      if (e && e.given.includes('lact')) mine.push('You gave <b class="red">lactulose</b>, an order carried over from the liver he no longer has.');
      setHtml(el, (parts.length ? `<div class="stats">${parts.join('')}</div>` : '') + mine.map((m) => `<p class="lead">${m}</p>`).join(''));
    },

    report(el) {
      const mine = new Set(S.you.report.problems);
      setHtml(
        el,
        '<div class="probs">' +
          PROBLEMS.map(
            (p) => `
            <button class="prow ${mine.has(p.id) ? 'on' : ''}" data-act="report" data-id="${p.id}">
              <span class="prow-check">${mine.has(p.id) ? '✓' : ''}</span>
              <span><b>${p.n}. ${esc(p.label)}</b><small>${esc(p.desc)}</small></span>
              <span class="prow-cat">${p.cat}</span>
            </button>`
          ).join('') +
          '</div>'
      );
    },

    reportbars(el) {
      const rows = PROBLEMS.map((p) => ({ k: p.id, label: `${p.n}. ${esc(p.label)}`, n: S.problems[p.id].reports }));
      bars(el, rows, Math.max(1, S.counts.reports));
    },

    spokes(el) {
      const name = spokesperson();
      const mine = !S.isHost && name && S.you.isRep && (S.you.role === 'nurse' || (S.you.role === 'physician' && !S.reps.nurse));
      const reps = S.isHost
        ? '<div class="rolecounts eight">' + ROLE_ORDER.map((r) => `<div class="rolecount"><span>${ROLES[r].icon}</span><b class="repname">${esc(S.reps[r] || '-')}</b><small>${ROLES[r].short} rep</small></div>`).join('') + '</div>'
        : S.you.isRep ? `<div class="repbadge mine">⭐ You are the ${ROLES[S.you.role].short.toLowerCase()} representative. You speak for your table.</div>` : '';
      setHtml(
        el,
        `<div class="repbadge ${mine ? 'mine' : ''}">🎤 Hospital spokesperson: <b>${esc(name || 'choose one now')}</b>${mine ? ' (that is you)' : ''}</div>${reps}`
      );
    },

    // Star the three problems that matter most to your group.
    intra(el) {
      const role = S.you.role;
      const size = S.roleCounts[role];
      const mine = new Set(S.you.top);
      const full = mine.size >= TOP_PICKS;
      const rows = [...PROBLEMS].sort(
        (a, b) => (S.problems[b.id].reportsByRole[role] || 0) - (S.problems[a.id].reportsByRole[role] || 0) || a.n - b.n
      );
      setHtml(
        el,
        `<p class="muted small">${mine.size} of ${TOP_PICKS} stars used</p><div class="probs">` +
          rows
            .map((p) => {
              const b = S.problems[p.id];
              const seen = b.reportsByRole[role] || 0;
              const on = mine.has(p.id);
              return `
              <button class="prow star ${on ? 'on' : ''}" data-act="top" data-id="${p.id}" ${!on && full ? 'disabled' : ''}>
                <span class="prow-check">${on ? '★' : '☆'}</span>
                <span><b>${p.n}. ${esc(p.label)}</b><small>${seen ? `Logged by ${seen} of ${size} ${ROLES[role].plural.toLowerCase()}` : `No ${ROLES[role].short.toLowerCase()} logged this`} · ${b.reports} across the hospital</small></span>
                <span class="prow-cat">${b.top ? `★ ${b.top}` : ''}</span>
              </button>`;
            })
            .join('') +
          '</div>'
      );
    },

    // Vendors, Phase 2: every problem, how much the hospital cares, and which package answers it.
    sellmap(el) {
      const fixers = (p) =>
        PACKAGE_ORDER.map((id) => {
          const cov = coverage({ pkg: id, modules: [] });
          return cov.full.has(p.id) ? `<span class="pkg-letter p${id}">${PACKAGES[id].letter}</span>` : '';
        }).join('') + MODULES.filter((m) => m.fixes.includes(p.id)).map((m) => `<span class="pchip">${m.icon} ${esc(m.label)}</span>`).join('');
      setHtml(
        el,
        '<div class="eyebrow">WHAT THE HOSPITAL CARES ABOUT, AND WHAT YOU SELL FOR IT</div><div class="probs">' +
          byRank()
            .map((p) => {
              const b = S.problems[p.id];
              const who = ROLE_ORDER.filter((r) => b.topByRole[r]).map((r) => ROLES[r].icon).join(' ');
              return `<div class="prow static"><span class="prow-check">★${b.top}</span><span><b>${p.n}. ${esc(p.label)}</b><small>Starred by: ${who || 'nobody yet'}</small></span><span class="fixers">${fixers(p)}</span></div>`;
            })
            .join('') +
          '</div>'
      );
    },

    // Three columns. Drag a card to another column, or tap a card and then tap a column.
    board(el) {
      const canMove = boardMovable();
      const card = (p) => {
        const b = S.problems[p.id];
        const icons = ROLE_ORDER.filter((r) => b.topByRole[r]).map((r) => ROLES[r].icon).join(' ');
        const inner = `<div><b>${p.n}. ${esc(p.label)}</b><small>${esc(p.desc)}</small><span class="pcard-meta">★ ${b.top} ${icons}</span></div>`;
        return canMove
          ? `<div class="pcard movable ${picked === p.id ? 'picked' : ''}" draggable="true" data-act="pickcard" data-id="${p.id}" role="button" tabindex="0">${ic('grip-vertical', 'grip')}${inner}</div>`
          : `<div class="pcard">${inner}</div>`;
      };
      setHtml(
        el,
        (canMove ? `<p class="dndhint">${ic('arrows-move')} ${picked ? `Now tap the column for <b>${esc(PROBLEM[picked].label)}</b>.` : 'Drag a card to another column. On a phone, tap a card, then tap a column.'}</p>` : '') +
          `<div class="board ${canMove ? 'movable' : ''} ${picked ? 'picking' : ''}">` +
          TIERS.map((tier) => {
            const items = inTier(tier);
            return `<div class="tiercol ${tier.k}" data-tier="${tier.k}" ${canMove ? 'data-act="dropcol"' : ''}><div class="tiercol-head">${tier.label} <span>${items.length}</span></div><div class="tiercol-hint">${tier.hint}</div>${items.map(card).join('')}</div>`;
          }).join('') +
          '</div>'
      );
    },

    others(el) {
      setHtml(
        el,
        S.others.length
          ? `<div class="eyebrow">ALSO WRITTEN IN</div><div class="names">${S.others.map((o) => `<span class="namechip plain">${ROLES[o.role].icon} ${esc(o.text)}</span>`).join('')}</div>`
          : ''
      );
    },

    // The room board: private facts and vendor offers that a team chose to publish.
    shared(el) {
      setHtml(
        el,
        S.shared.length
          ? `<div class="roomboard"><div class="eyebrow">📣 THE ROOM NOW KNOWS</div>${S.shared
              .map((s) => {
                const sec = SECRET[s.id];
                return `<div class="roomfact ${sec.unlocks ? 'offer' : ''}"><span class="roomfact-who">${ROLES[s.role].icon} ${ROLES[s.role].plural}</span><span>${sec.unlocks ? '<b>OFFER ON THE TABLE:</b> ' : ''}${esc(sec.text)}</span></div>`;
              })
              .join('')}</div>`
          : S.isHost ? '<p class="muted small">📣 Nothing has been published to the room yet. Each team holds private facts it can choose to reveal.</p>' : ''
      );
    },

    critical(el) {
      setHtml(
        el,
        `<div class="critlist"><div class="eyebrow">${esc(HOSPITAL.toUpperCase())}: MUST FIX</div>` +
          inTier(TIERS[0]).map((p, i) => `<div class="critrow" style="animation-delay:${0.6 + i * 0.35}s"><b>${i + 1}.</b> ${esc(p.label)}<small>${esc(p.desc)}</small></div>`).join('') +
          `<p class="muted small">Plus ${inTier(TIERS[1]).length} should-fix and ${inTier(TIERS[2]).length} can-wait problems.</p></div>`
      );
    },

    packages(el) {
      setHtml(el, pkgCards(null));
    },
    pitchpackages(el) {
      setHtml(el, pkgCards(PACKAGE_ORDER[pitchIndex()]));
    },
    pitchnow(el) {
      const id = PACKAGE_ORDER[pitchIndex()];
      const key = `now:${id}`;
      if (el._key === key) return;
      el._key = key;
      el.innerHTML = `<div class="pitchnow p${id}"><span class="pkg-letter p${id}">${PACKAGES[id].letter}</span> <b>${PACKAGES[id].name}</b> · ${esc(PACKAGES[id].seller)} has the floor · <span class="subtimer" data-subtimer></span> <small>pitch ${pitchIndex() + 1} of 4, one minute each</small></div>`;
    },
    pitchcue(el) {
      const id = PACKAGE_ORDER[pitchIndex()];
      const next = PACKAGE_ORDER[pitchIndex() + 1];
      setHtml(el, `<div class="eyebrow">YOUR CUE CARD</div>${pitchCue(id)}${next ? `<p class="muted small">Next up: Package ${PACKAGES[next].letter} · ${PACKAGES[next].name}</p>` : ''}`);
    },

    menu(el) {
      setHtml(
        el,
        `<table class="gtable"><tr><th>Module</th><th>Price</th><th>What it solves</th><th>Wanted by</th></tr>
          ${MODULES.map((m) => `<tr><td>${m.icon} <b>${esc(m.label)}</b></td><td class="num">${money(m.price)}</td><td>${esc(m.solves)}</td><td>${ROLES[m.role].icon} ${ROLES[m.role].plural}</td></tr>`).join('')}
          <tr class="total"><td>All eight</td><td class="num">${money(MODULES.reduce((s, m) => s + m.price, 0))}</td><td colspan="2">Package D base leaves ${money(CAP - dealCost({ pkg: 'd' }).total)} under the cap.</td></tr>
        </table>`
      );
    },

    costs(el) {
      const row = (id) => {
        const pkg = PACKAGES[id];
        const shown = id === 'b' && revealedB();
        const c = dealCost({ pkg: id }, shown);
        const diff = c.total - CAP;
        return `<tr><td><span class="pkg-letter p${id}">${pkg.letter}</span> ${pkg.name}${id === 'd' ? ', base only' : ''}</td><td class="num">${pkg.price}</td><td class="num ${pkg.lost > RESERVE ? 'bad' : ''}">${pkg.lost}</td><td class="num">${pkg.old}</td>
          <td class="num">${shown ? `<span class="bad">+${pkg.hidden} hidden</span>` : ''}</td><td class="num"><b>${money(c.total)}</b></td><td class="num ${diff > 0 ? 'bad' : 'good'}">${diff > 0 ? `${money(diff)} over` : `${money(-diff)} under`}</td></tr>`;
      };
      setHtml(
        el,
        `<table class="gtable"><tr><th>Package</th><th>Price</th><th>Lost revenue at go-live</th><th>Old system during switch</th><th></th><th>True cost</th><th>vs ${money(CAP)} cap</th></tr>
          ${PACKAGE_ORDER.map(row).join('')}</table>
         <p class="muted small">$ millions, five-year totals. The cash reserve covers ${money(RESERVE)} of lost revenue.</p>`
      );
    },

    matrix(el) {
      const cell = (p, id) => {
        const cov = coverage({ pkg: id, modules: [] });
        if (cov.full.has(p.id)) return '<td class="good">Yes</td>';
        const mod = id === 'd' ? MODULES.find((m) => m.fixes.includes(p.id)) : null;
        if (mod) return `<td class="warn">${cov.partial.has(p.id) ? 'Partly; ' : ''}with ${esc(mod.label.toLowerCase())}</td>`;
        return cov.partial.has(p.id) ? '<td class="warn">Partly</td>' : '<td class="bad">No</td>';
      };
      setHtml(
        el,
        `<table class="gtable"><tr><th>#</th><th>Problem</th>${PACKAGE_ORDER.map((id) => `<th><span class="pkg-letter p${id}">${PACKAGES[id].letter}</span></th>`).join('')}</tr>
          ${PROBLEMS.map((p) => `<tr><td class="num">${p.n}</td><td>${esc(p.label)}</td>${PACKAGE_ORDER.map((id) => cell(p, id)).join('')}</tr>`).join('')}</table>`
      );
    },

    secrets(el) {
      setHtml(el, secretsHtml(S.you.role));
    },

    // Package choice, Package D modules, and the contract terms this player wants.
    ballot(el, kind) {
      const mine = S.you[kind] || { pkg: null, modules: [], terms: [] };
      const team = (S.straw.tally.split[S.you.group]) || {};
      const pkgs = BALLOT_ORDER.map((id) => {
        const pkg = PACKAGES[id];
        const teamCount = kind === 'straw' && team[id] ? `<span class="pkgbtn-team">team: ${team[id]}</span>` : '';
        const c = dealCost({ pkg: id }, id === 'b' && revealedB());
        return `
          <button class="pkgbtn p${id} ${mine.pkg === id ? 'on' : ''}" data-act="pkg" data-kind="${kind}" data-pkg="${id}">
            <span class="pkg-letter p${id}">${pkg.letter}</span>
            <span class="pkgbtn-name">${pkg.icon} ${pkg.name}<small>${id === 'keep' ? 'Sign nothing. The old EHR costs $4.2M a year.' : `True cost ${money(c.total)}${id === 'd' ? ' + modules' : ''} · ${pkg.golive}`}</small></span>
            ${teamCount}
          </button>`;
      }).join('');
      let mods = '';
      if (mine.pkg === 'd') {
        const free = mine.terms.includes('reference') ? 'governance' : null;
        mods =
          '<div class="eyebrow">MODULES YOU WANT BOUGHT</div><div class="probs">' +
          MODULES.map((m) => {
            const on = mine.modules.includes(m.id);
            return `
              <button class="prow ${on ? 'on' : ''}" data-act="module" data-kind="${kind}" data-mod="${m.id}">
                <span class="prow-check">${on ? '✓' : ''}</span>
                <span><b>${m.icon} ${esc(m.label)}</b><small>${esc(m.solves)}</small></span>
                <span class="prow-cat">${free === m.id ? 'FREE' : `+${money(m.price)}`}</span>
              </button>`;
          }).join('') +
          '</div>';
      }
      let terms = '';
      if (mine.pkg && mine.pkg !== 'keep') {
        const offered = TERMS.filter((t) => termOffered(t) && t.applies.includes(mine.pkg));
        const locked = TERMS.filter((t) => !termOffered(t) && t.applies.includes(mine.pkg)).length;
        terms =
          '<div class="eyebrow">CONTRACT TERMS YOU WANT</div><div class="probs">' +
          offered
            .map((t) => {
              const on = mine.terms.includes(t.id);
              const tags = [t.cost ? `+${money(t.cost)}` : '', t.discount ? `−${t.discount * 100}% base` : '', t.freeModule ? 'free module' : ''].filter(Boolean).join(' · ');
              return `
                <button class="prow ${on ? 'on' : ''}" data-act="term" data-kind="${kind}" data-term="${t.id}">
                  <span class="prow-check">${on ? '✓' : ''}</span>
                  <span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></span>
                  <span class="prow-cat">${tags}</span>
                </button>`;
            })
            .join('') +
          `</div>${locked ? `<p class="muted small">🔒 ${plural(locked, 'more term')} could exist for this package. Vendors only put an offer on the table when someone asks for it.</p>` : ''}`;
      }
      let sum = '';
      if (mine.pkg && mine.pkg !== 'keep') {
        const c = dealCost(mine, mine.pkg === 'b' && revealedB());
        sum = `<div class="mydeal ${c.over ? 'over' : 'under'}">YOUR DEAL: true cost <b>${money(c.total)}</b> against a ${money(c.cap)} cap · ${c.over ? `${money(c.total - c.cap)} OVER` : `${money(c.cap - c.total)} to spare`}</div>`;
      }
      setHtml(
        el,
        `<div class="pkgbtns">${pkgs}</div>${mods}${terms}${sum}
         ${kind === 'final' ? `<p class="votedcount">${mine.pkg ? `Your vote: <b>${esc(pkgTitle(mine.pkg))}</b>. You can change it until time runs out.` : 'You have not voted yet.'}</p>` : ''}`
      );
    },

    strawboard(el) {
      const d = S.straw;
      const t = d.tally;
      if (!el._built) {
        el.innerHTML = `
          <div class="split three">
            <div><div class="eyebrow">WHERE THE ${TOTAL_VOTES} VOTES STAND · ${PASS} NEEDED</div><div data-part="bars"></div><div data-part="roles"></div></div>
            <div><div class="eyebrow">PACKAGE D MODULES · VOTES BEHIND EACH</div><div data-part="mods"></div></div>
            <div><div class="eyebrow">CONTRACT TERMS ON THE TABLE</div><div data-part="terms"></div></div>
          </div>
          <div data-part="preview"></div>`;
        el._built = true;
      }
      bars(el.querySelector('[data-part=bars]'), pkgRows(t), t.present || TOTAL_VOTES, `${t.present} of ${TOTAL_VOTES} votes placed`);
      setHtml(el.querySelector('[data-part=roles]'), groupPicksHtml(t));
      setHtml(el.querySelector('[data-part=mods]'), MODULES.map((m) => supportBar(m.icon, m.label, money(m.price), t.modules[m.id], t)).join('') + '<p class="muted small">✓ = wanted by groups holding a majority of votes. Bought in order of support until the cap is hit.</p>');
      const offered = TERMS.filter(termOffered);
      const locked = TERMS.length - offered.length;
      setHtml(
        el.querySelector('[data-part=terms]'),
        offered.map((x) => supportBar(ROLES[x.role].icon, x.label, x.cost ? `+${money(x.cost)}` : '', t.terms[x.id], t)).join('') +
          (locked ? `<p class="muted small">🔒 ${plural(locked, 'vendor offer')} not yet on the table.</p>` : '')
      );
      setHtml(el.querySelector('[data-part=preview]'), previewHtml(d));
    },

    finalboard(el) {
      const t = S.decision.tally;
      if (!el._built) {
        el.innerHTML = `
          <div class="split">
            <div><div class="eyebrow">THE VOTE · ${PASS} OF ${TOTAL_VOTES} NEEDED</div><div data-part="bars"></div></div>
            <div><div class="eyebrow">BY GROUP</div><div data-part="roles"></div></div>
          </div>`;
        el._built = true;
      }
      bars(el.querySelector('[data-part=bars]'), pkgRows(t), t.present || TOTAL_VOTES, `${t.present} of ${TOTAL_VOTES} votes cast`);
      setHtml(el.querySelector('[data-part=roles]'), groupPicksHtml(t));
    },

    fixedpick(el) {
      const opts = [['yes', '✅ Yes'], ['partly', '◐ Partly'], ['no', '❌ No']];
      setHtml(el, '<div class="rating">' + opts.map(([k, label]) => `<button class="${reflectDraft.fixed === k ? 'on' : ''}" data-act="fixedpick" data-v="${k}">${label}</button>`).join('') + '</div>');
    },

    reflections(el) {
      const all = S.reflections;
      const n = (k) => all.filter((r) => r.fixed === k).length;
      const worst = {};
      for (const r of all) if (r.worst) worst[r.worst] = (worst[r.worst] || 0) + 1;
      const top = Object.entries(worst).sort((a, b) => b[1] - a[1])[0];
      const quote = (label, text) => (text ? `<p><small>${label}</small>${esc(text)}</p>` : '');
      setHtml(
        el,
        `<div class="stats">
           <div class="stat"><b>${n('yes')} · ${n('partly')} · ${n('no')}</b><span>yes · partly · no: "did the deal fix what you cared about?"</span></div>
           ${top ? `<div class="stat"><b>#${PROBLEM[top[0]].n}</b><span>felt worst: ${esc(PROBLEM[top[0]].label)}</span></div>` : ''}
         </div>
         <div class="reflist">${all
           .filter((r) => r.surprised || r.gaveup || r.learned)
           .map((r) => `<div class="refcard"><div class="refcard-head">${ROLES[r.role].icon} ${ROLES[r.role].short}</div>${quote('SURPRISED BY', r.surprised)}${quote('GAVE UP', r.gaveup)}${quote('NOW UNDERSTANDS', r.learned)}</div>`)
           .join('')}</div>`
      );
    },
  };

  // ---------- render ----------

  function render() {
    if (!S) return;
    const needsRole = !S.isHost && (!S.you.role || (repick && S.step === 'lobby'));
    const key = S.isHost ? `H:${S.step}` : `P:${needsRole ? 'pick' : S.step}:${S.you.role || ''}`;

    if (key !== screenKey) {
      screenKey = key;
      ehrStop();
      const body = needsRole
        ? `<div class="center">
             <h1>Choose your seat, ${esc(S.you.name)}</h1>
             <p class="muted">Seven groups. Nurses and physicians are two tables of one group.</p>
             <button class="btn primary big" data-act="role" data-role="random">🎲 Assign me randomly</button>
             <p class="muted small">Random assignment follows the seat plan, so every group fills evenly.</p>
             <div class="rolegrid" data-dyn="rolepick"></div>
           </div>`
        : stage();
      const wide = !S.isHost && !needsRole && (S.step === 'p1_ehr' || S.step === 'p6_sim');
      document.body.className = [S.isHost ? 'host' : 'player', `step-${S.step}`, wide ? 'ehr-mode' : '', online ? '' : 'offline'].join(' ');
      app.innerHTML = iconize(`${topbar()}${S.isHost ? procedure() : ''}<main class="stage">${body}</main>${S.isHost ? hostbar() : ''}`);
      window.scrollTo(0, 0);
      if (!S.isHost && !needsRole) {
        const side = mySide();
        if (S.step === 'p1_ehr') ehrStart(ALERTS[side], true, CRASH_AT);
        if (S.step === 'p6_sim') {
          Object.assign(aft, { clicks: 0, dose: null, signed: false, stopped: false, mar: {}, vitals: 0, alert: false });
          renderAfter();
          if (coverage(S.decision).full.has('alerts')) {
            // One interruption, with the thing that matters.
            setTimeout(() => S && S.step === 'p6_sim' && aftShowAlert(side), 1800);
          } else {
            // Nothing fixed the alerting, so the storm and the crash happen again a year later.
            const replay = STORM[side].slice(0, 16).map((a, i) => ({ ...a, crit: false, t: 2 + i * 1.1 }));
            ehrStart(replay, false, 22);
          }
        }
      }
    }

    document.querySelectorAll('[data-dyn]').forEach((el) => {
      const [name, arg] = el.dataset.dyn.split(':');
      DYN[name](el, arg);
    });
    tick();
  }

  // ---------- events ----------

  let otherTimer = null;
  // Read the text box directly: a state push may have replaced S since the last keystroke.
  function sendReport() {
    const input = document.querySelector('[data-other]');
    return act('report', { problems: S.you.report.problems, other: input ? input.value : S.you.report.other });
  }

  function toggle(items, id) {
    return items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    switch (a) {
      case 'theme':
        theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem('fth_theme', theme); } catch { /* storage unavailable */ }
        document.querySelectorAll('[data-act="theme"]').forEach((b) => { b.innerHTML = ic(theme === 'dark' ? 'sun' : 'moon'); });
        return;
      case 'home':
        homeView = 'home';
        homeError = '';
        return renderHome();
      case 'home-join':
        homeView = 'join';
        homeError = '';
        return renderHome();
      case 'home-host':
        el.disabled = true;
        try {
          startSession(await api('/api/host'));
        } catch (err) {
          homeError = err.message;
          renderHome();
        }
        return;
      case 'resume-host':
        return startSession(store.get(localStorage, 'fth_host'));
      case 'leave':
        if (confirm('Leave this room? You will not be able to host it again from this browser.')) leave();
        return;
      case 'role':
        repick = false;
        return act('role', { role: el.dataset.role });
      case 'rerole':
        // Dropping back to the picker is local; the server keeps the old seat until a new one is chosen.
        repick = true;
        return render();
      case 'shuffle':
        if (S.playerCount && confirm('Deal every player a new random seat from the seat plan?')) act('shuffle');
        return;
      case 'dismiss':
        return ehrDismiss(el);
      case 'aft':
        return aftClick(el.dataset.k, el.dataset.v);
      case 'mar':
        return marClick(el.dataset.med);
      case 'dose':
        return doseClick(el.dataset.dose);
      case 'ehr-save': {
        const msg = document.querySelector('[data-savemsg]');
        if (msg) msg.innerHTML = '<span class="mar-fail">Cannot save: 3 required fields incomplete (Fall risk, Braden, Pain reassessment).</span>';
        return;
      }
      case 'report':
        S.you.report.problems = toggle(S.you.report.problems, el.dataset.id);
        render();
        return sendReport();
      case 'top':
        S.you.top = toggle(S.you.top, el.dataset.id).slice(0, TOP_PICKS);
        render();
        return act('top', { problems: S.you.top });
      case 'pickcard':
        picked = picked === el.dataset.id ? null : el.dataset.id;
        return render();
      case 'dropcol':
        if (picked) moveCard(picked, el.dataset.tier);
        return;
      case 'share':
        if (confirm('Publish this to the whole room? It goes on the big screen and you cannot take it back.')) act('share', { secret: el.dataset.id });
        return;
      case 'pkg':
      case 'module':
      case 'term': {
        const kind = el.dataset.kind;
        const mine = S.you[kind] || { pkg: null, modules: [], terms: [] };
        if (a === 'pkg') {
          mine.pkg = el.dataset.pkg;
          if (mine.pkg !== 'd') mine.modules = [];
          mine.terms = mine.terms.filter((id) => TERM[id].applies.includes(mine.pkg));
        } else if (!mine.pkg) return toast('Choose a package first.');
        else if (a === 'module') mine.modules = toggle(mine.modules, el.dataset.mod);
        else mine.terms = toggle(mine.terms, el.dataset.term);
        S.you[kind] = mine;
        render();
        return act('ballot', { kind, pkg: mine.pkg, modules: mine.modules, terms: mine.terms });
      }
      case 'fixedpick':
        reflectDraft.fixed = el.dataset.v;
        render();
        return saveReflection(0);
      case 'export':
        return exportCsv();
      case 'showrole': {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.dataset.act = 'closemodal';
        modal.innerHTML = `<div class="modal-box wide">${roleCard(S.you.role)}${S.phase >= 2 ? secretsHtml(S.you.role) : ''}${S.phase >= 3 ? packageLines(S.you.role) : ''}<button class="btn" data-act="closemodal">Close</button></div>`;
        modal.innerHTML = iconize(modal.innerHTML);
        document.body.appendChild(modal);
        return;
      }
      case 'closemodal':
        if (e.target === el) {
          const modal = document.querySelector('.modal');
          if (modal) modal.remove();
        }
        return;
      case 'next':
      case 'back':
        return act(a);
      case 'end':
        if (confirm('Skip ahead to the debrief on every screen?')) act('end');
        return;
      case 'timer-add':
        return act('timer', { op: 'add' });
      case 'timer-restart':
        return act('timer', { op: 'restart' });
      case 'kick':
        return act('kick', { pub: el.dataset.pub });
      default:
    }
  });

  // Drag and drop for the three-column board.
  let dragId = null;
  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest && e.target.closest('.pcard.movable');
    if (!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    card.classList.add('dragging');
  });
  document.addEventListener('dragend', () => {
    dragId = null;
    document.querySelectorAll('.dragging, .tiercol.over').forEach((n) => n.classList.remove('dragging', 'over'));
  });
  document.addEventListener('dragover', (e) => {
    const col = dragId && e.target.closest && e.target.closest('.board.movable .tiercol');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.tiercol.over').forEach((n) => n !== col && n.classList.remove('over'));
    col.classList.add('over');
  });
  document.addEventListener('drop', (e) => {
    const col = dragId && e.target.closest && e.target.closest('.board.movable .tiercol');
    if (!col) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    moveCard(id, col.dataset.tier);
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form="join"]');
    if (!form) return;
    e.preventDefault();
    try {
      const data = new FormData(form);
      startSession(await api('/api/join', { code: data.get('code').trim(), name: data.get('name') }));
    } catch (err) {
      homeError = err.message;
      renderHome();
    }
  });

  function onReflectInput(e) {
    if (!e.target.matches('[data-reflect]')) return;
    reflectDraft[e.target.dataset.reflect] = e.target.value || (e.target.tagName === 'SELECT' ? null : '');
    const note = document.getElementById('reflect-saved');
    if (note) note.textContent = 'Saving…';
    saveReflection(e.target.tagName === 'SELECT' ? 0 : 500);
  }

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-other]')) {
      S.you.report.other = e.target.value;
      clearTimeout(otherTimer);
      otherTimer = setTimeout(sendReport, 400);
    }
    onReflectInput(e);
  });

  // ---------- boot ----------

  session = store.get(sessionStorage, 'fth_session');
  if (session && session.code) connect();
  else renderHome();
})();
