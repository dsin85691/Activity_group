(() => {
  'use strict';

  const { ROLE_ORDER, ROLES, PROBLEMS, PACKAGE_ORDER, PACKAGES, MODS, BUDGET } = window.CONTENT;
  const PROBLEM = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));
  const BALLOT_ORDER = [...PACKAGE_ORDER, 'keep'];
  const TOP_PICKS = 3;

  const PHASE_TITLES = {
    1: 'EHR SIMULATION', 2: 'STAKEHOLDER DISCUSSION', 3: 'VENDOR PITCHFEST',
    4: 'NEGOTIATION', 5: 'VOTING', 6: 'DECISION & OUTCOME',
  };
  const TIERS = [
    { k: 'critical', label: 'CRITICAL', hint: 'Must be fixed' },
    { k: 'desirable', label: 'DESIRABLE', hint: 'Should be fixed' },
    { k: 'lower', label: 'LOWER PRIORITY', hint: 'Can wait' },
  ];

  // ---------- the two EHR simulations ----------

  // Interruptions fire every ALERT_GAP seconds; the one marked `crit` is the only one that matters.
  const ALERT_START = 5;
  const ALERT_GAP = 8;
  const withTimes = (list) => list.map((a, i) => ({ ...a, t: ALERT_START + i * ALERT_GAP }));
  const ALERTS = {
    physician: withTimes([
      { title: 'Flu vaccine overdue', sub: 'Last documented: 10/2022' },
      { title: 'BMI = 31.2', sub: 'Consider nutrition counseling referral' },
      { title: 'Address has not been verified', sub: 'Last verified: 14 months ago' },
      { title: 'Annual wellness visit overdue', sub: 'Last completed: 02/2024' },
      { title: 'Preferred pharmacy not on file', sub: 'Update in Demographics' },
      { title: 'Tobacco use status not updated', sub: 'Last reviewed: over 12 months ago' },
      { title: 'Diabetic foot exam overdue', sub: 'Health maintenance topic' },
      { title: 'Patient portal not activated', sub: 'Offer activation code at checkout' },
      { title: 'Fall risk screening incomplete', sub: 'Required once per encounter' },
      { title: 'Advance directive not on file', sub: 'Ask patient at next visit' },
      { title: 'Colorectal cancer screening due', sub: 'Health maintenance topic' },
      { title: 'Severe penicillin allergy', sub: 'Current order: amoxicillin', crit: true },
      { title: 'Duplicate therapy: lisinopril', sub: 'Appears twice on medication list' },
      { title: 'Depression screening (PHQ-2) overdue', sub: 'Last completed: 06/2023' },
      { title: 'Emergency contact not verified', sub: 'Last verified: 2 years ago' },
      { title: 'Pneumococcal vaccine overdue', sub: 'Health maintenance topic' },
      { title: 'Insurance eligibility re-check needed', sub: 'Coverage last confirmed: 01/2025' },
      { title: 'Medication reconciliation incomplete', sub: 'Required before discharge' },
    ]),
    nurse: withTimes([
      { title: 'Fall risk reassessment due', sub: 'Required every shift' },
      { title: 'Pain reassessment overdue', sub: 'Last charted: 4 h 12 min ago' },
      { title: 'Intake & output not charted', sub: 'Current shift' },
      { title: 'Skin assessment due', sub: 'Braden score required' },
      { title: 'Patient education not documented', sub: 'Topic: diabetes' },
      { title: 'Care plan needs update', sub: 'Last updated: 26 hours ago' },
      { title: 'Scanner battery low', sub: 'Dock device at end of shift' },
      { title: 'Flu vaccine screening incomplete', sub: 'Admission requirement' },
      { title: 'IV site assessment due', sub: 'Required every 4 hours' },
      { title: 'Height and weight not verified', sub: 'Verify on admission' },
      { title: 'Belongings checklist incomplete', sub: 'Admission requirement' },
      { title: 'Critical lab: potassium 6.2', sub: 'Due now: potassium chloride 20 mEq', crit: true },
      { title: 'Hourly rounding not documented', sub: 'Last charted: 09:00' },
      { title: 'Admission history incomplete', sub: '3 of 41 fields missing' },
      { title: 'Interpreter need not assessed', sub: 'Admission requirement' },
      { title: 'Discharge planning screen due', sub: 'Required within 24 hours' },
      { title: 'Telemetry order expiring', sub: 'Renew or discontinue' },
      { title: 'Duplicate task: vital signs', sub: 'Appears on two worklists' },
    ]),
  };
  const critNumber = (side) => ALERTS[side].findIndex((a) => a.crit) + 1;

  const SIM = {
    physician: {
      task: '<b>Your patient is getting worse.</b> Find the most important safety issue in this chart.',
      brief: 'Your patient Maria Rodriguez is getting worse. Find the most important safety issue in her chart.',
      missed: '⚠️ <b>Severe penicillin allergy</b> — Current order: <b>amoxicillin</b>',
      lookalike: 'Flu vaccine overdue',
    },
    nurse: {
      task: "<b>It's 09:00 and you are behind.</b> Give Maria her morning medications. Only the ones that are safe.",
      brief: "It's 09:00 and you are already behind. Give Maria Rodriguez her morning medications, but only the ones that are safe to give.",
      missed: '⚠️ <b>Critical lab: potassium 6.2</b> — Due now: <b>potassium chloride 20 mEq</b>',
      lookalike: 'Scanner battery low',
    },
  };

  // Morning medication pass. `fail` meds refuse to scan the first time, forcing an override.
  const MAR = [
    { id: 'metformin', text: 'metFORMIN 1000 mg tab PO', fail: true },
    { id: 'lis20', text: 'lisinopril 20 mg tab PO' },
    { id: 'lis10', text: 'lisinopril 10 mg tab PO', fail: true },
    { id: 'omep', text: 'omeprazole 20 mg cap PO' },
    { id: 'kcl', text: 'potassium chloride 20 mEq ER tab PO', fail: true },
    { id: 'asa', text: 'aspirin 81 mg EC tab PO' },
    { id: 'amox', text: 'amoxicillin 500 mg cap PO — FIRST DOSE' },
    { id: 'vitd', text: 'cholecalciferol 2000 units cap PO', fail: true },
    { id: 'iron', text: 'ferrous sulfate 325 mg tab PO' },
    { id: 'insulin', text: 'insulin lispro per sliding scale SUBQ', fail: true },
  ];

  // ---------- state ----------

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (m) => `$${m.toFixed(1)}M`;
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
        <p class="home-lead"><b>Penn General is falling apart.</b></p>
        <p class="home-copy">Doctors and nurses hate the EHR. Patients are waiting too long. Costs are rising. Staff are overwhelmed.</p>
        <p class="home-copy">A vendor says it can fix it.</p>
        <p class="home-lead">Your job: decide what is broken, what to buy, and whether the hospital can agree.</p>
        ${homeError ? `<p class="error">${esc(homeError)}</p>` : ''}
        ${body}
      </main>`;
    const first = app.querySelector(prefill ? 'input[name=name]' : 'input');
    if (first) first.focus();
  }

  // ---------- timers ----------

  function remainingMs() {
    if (!S || !S.timerEnd) return null;
    return Math.max(0, S.timerEnd - (Date.now() + clockOffset));
  }

  function clock(ms) {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

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
    ehrTick();
  }
  setInterval(tick, 250);

  // ---------- EHR engine: interruptions and the medication pass ----------

  const ehr = { active: false, live: true, alerts: [], next: 0, queue: [], current: null, shownAt: 0, n: 0, shown: 0, gapUntil: 0, startedAt: 0, mar: {} };

  // `live` runs follow the server's round timer and report to it; replays after the decision are local only.
  function ehrStart(alerts, live) {
    Object.assign(ehr, { active: true, live, alerts, queue: [], current: null, n: 0, gapUntil: 0, startedAt: Date.now(), mar: {} });
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
    return ms === null ? 0 : (S.timerTotal || 150) - ms / 1000;
  }

  function ehrTick() {
    if (!ehr.active) return;
    const elapsed = ehrElapsed();
    while (ehr.next < ehr.alerts.length && ehr.alerts[ehr.next].t <= elapsed) ehr.queue.push(ehr.alerts[ehr.next++]);
    if (ehr.current || !ehr.queue.length || Date.now() < ehr.gapUntil) return;
    const layer = document.getElementById('ehr-alert');
    if (!layer) return;
    ehr.current = ehr.queue.shift();
    ehr.shownAt = Date.now();
    ehr.shown++;
    layer.innerHTML = `
      <div class="ehr-alert-box">
        <div class="ehr-alert-head">Clinical Advisory <span>#${ehr.shown}</span></div>
        <div class="ehr-alert-body">
          <div class="ehr-alert-icon">⚠️</div>
          <div>
            <div class="ehr-alert-title">${esc(ehr.current.title)}</div>
            <div class="ehr-alert-sub">${esc(ehr.current.sub)}</div>
          </div>
        </div>
        <button class="ehr-btn" data-act="dismiss">DISMISS</button>
      </div>`;
    layer.classList.add('show');
  }

  function ehrDismiss() {
    if (!ehr.current) return;
    const report = { n: ++ehr.n };
    if (ehr.current.crit) report.critMs = Date.now() - ehr.shownAt;
    ehr.current = null;
    ehr.gapUntil = Date.now() + 500;
    const layer = document.getElementById('ehr-alert');
    if (layer) layer.classList.remove('show');
    if (ehr.live) act('ehr', report);
  }

  function marCell(med) {
    const state = ehr.mar[med.id];
    if (state === 'given') return '<span class="mar-given">Given 09:0' + ((MAR.indexOf(med) % 9) + 1) + ' ✓</span>';
    if (state === 'fail') {
      return `<span class="mar-fail">Barcode not recognized.</span> <button class="ehr-btn sm" data-act="mar" data-med="${med.id}">Override</button>`;
    }
    return `<button class="ehr-btn sm" data-act="mar" data-med="${med.id}">Scan</button>`;
  }

  function marClick(id) {
    const med = MAR.find((m) => m.id === id);
    if (!med || ehr.mar[id] === 'given') return;
    ehr.mar[id] = med.fail && !ehr.mar[id] ? 'fail' : 'given';
    const cell = document.querySelector(`[data-mar="${id}"]`);
    if (cell) cell.innerHTML = marCell(med);
    if (ehr.mar[id] === 'given') {
      act('ehr', { n: ehr.n, given: MAR.filter((m) => ehr.mar[m.id] === 'given').map((m) => m.id) });
    }
  }

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
    const dates = ['03/14/25', '11/02/24', '06/19/24', '01/08/24', '08/23/23', '02/11/23'];
    // name, low, high, unit, today's value, usual value (when today is out of character)
    const labs = [
      ['Sodium', 135, 145, 'mmol/L', 139], ['Potassium', 3.5, 5.1, 'mmol/L', 6.2, 4.8], ['Chloride', 98, 107, 'mmol/L', 102],
      ['CO2', 22, 29, 'mmol/L', 23], ['BUN', 7, 20, 'mg/dL', 31], ['Creatinine', 0.6, 1.1, 'mg/dL', 1.6],
      ['eGFR', 60, 200, 'mL/min', 38], ['Glucose', 70, 99, 'mg/dL', 168], ['Calcium', 8.6, 10.2, 'mg/dL', 9.1],
      ['HbA1c', 4, 5.6, '%', 7.9], ['WBC', 4, 11, 'K/uL', 13.8, 8.1], ['Hemoglobin', 12, 15.5, 'g/dL', 11.4],
      ['Hematocrit', 36, 46, '%', 34.8], ['Platelets', 150, 400, 'K/uL', 262], ['AST', 10, 35, 'U/L', 24],
      ['ALT', 7, 35, 'U/L', 22], ['Alk Phos', 40, 120, 'U/L', 88], ['T. Bili', 0.2, 1.2, 'mg/dL', 0.6],
      ['Albumin', 3.5, 5, 'g/dL', 3.7], ['LDL', 0, 100, 'mg/dL', 112], ['HDL', 50, 99, 'mg/dL', 44],
      ['Triglycerides', 0, 150, 'mg/dL', 188], ['TSH', 0.4, 4, 'mIU/L', 2.1], ['Urine alb/creat', 0, 30, 'mg/g', 142],
      ['Procalcitonin', 0, 0.1, 'ng/mL', 0.62, 0.05], ['Lactate', 0.5, 2.2, 'mmol/L', 1.9],
    ];
    const rows = labs
      .map(([name, lo, hi, unit, today, usual]) => {
        const cells = dates
          .map((_, i) => {
            const v = i === 0 ? today : (usual || today) * (1 + (rand() - 0.5) * 0.3);
            const text = today < 20 ? v.toFixed(1) : v.toFixed(0);
            const flag = v > hi ? ' H' : v < lo ? ' L' : '';
            return `<td>${text}${flag}</td>`;
          })
          .join('');
        return `<tr><td>${name}</td>${cells}<td>${lo}–${hi} ${unit}</td></tr>`;
      })
      .join('');
    return `<div class="ehr-box"><h4>Results — Chemistry / Hematology / Other (all dates)</h4>
      <table><tr><th>Component</th>${dates.map((d) => `<th>${d}</th>`).join('')}<th>Ref range</th></tr>${rows}</table></div>`;
  }

  const VITALS = `<div class="ehr-box"><h4>Vitals — last 24h</h4>
    <table><tr><th>Time</th><th>Temp</th><th>HR</th><th>BP</th><th>RR</th><th>SpO2</th><th>Pain</th><th>Wt</th></tr>
    <tr><td>08:10</td><td>38.6 H</td><td>104 H</td><td>142/84</td><td>22 H</td><td>93% RA</td><td>3/10</td><td>77.0</td></tr>
    <tr><td>04:05</td><td>38.3 H</td><td>98</td><td>138/82</td><td>20</td><td>94% RA</td><td>2/10</td><td>—</td></tr>
    <tr><td>00:12</td><td>38.1 H</td><td>96</td><td>146/88</td><td>20</td><td>95% RA</td><td>2/10</td><td>—</td></tr>
    <tr><td>20:01</td><td>37.9</td><td>92</td><td>150/90 H</td><td>18</td><td>95% RA</td><td>4/10</td><td>77.2</td></tr></table></div>`;

  const OLD_ALLERGY_NOTE =
    'ALLERGIES: PENICILLIN — anaphylaxis 1998 (throat swelling, required epinephrine), confirmed by pt and daughter. Avoid all penicillins incl. amoxicillin.';

  function physicianBody() {
    const problems = [
      'Type II diabetes mellitus w/o complication (E11.9)', 'Type 2 diabetes mellitus with diabetic CKD (E11.22)',
      'Essential hypertension (I10)', 'Chronic kidney disease, stage 3b (N18.32)', 'Hyperlipidemia, unspecified (E78.5)',
      'Mixed hyperlipidemia (E78.2)', 'Primary osteoarthritis, bilateral knees (M17.0)', 'GERD without esophagitis (K21.9)',
      'Obesity, BMI 30.0–34.9 (E66.9)', 'Vitamin D deficiency (E55.9)', 'Anemia in chronic kidney disease (D63.1)',
      'Allergic rhinitis (J30.9)', 'Insomnia, unspecified (G47.00)', 'History of tobacco use (Z87.891)',
      'Cataract, left eye (H26.9)', 'Low back pain (M54.50) — RESOLVED 2019?', 'Encounter for immunization (Z23)',
      'Cough (R05.9)', 'Fever, unspecified (R50.9)', 'Hypertension (I10) — DUPLICATE',
    ];
    const meds = [
      'metFORMIN 1000 mg tab — 1 tab PO BID', 'lisinopril 20 mg tab — 1 tab PO daily', 'lisinopril 10 mg tab — 1 tab PO daily (not taking?)',
      'atorvastatin 40 mg tab — 1 tab PO nightly', 'omeprazole 20 mg cap — 1 cap PO daily', 'potassium chloride 20 mEq ER — 1 tab PO daily',
      'acetaminophen 500 mg — 2 tabs PO q6h PRN pain', 'cholecalciferol 2000 units — 1 cap PO daily', 'aspirin 81 mg EC — 1 tab PO daily',
      'loratadine 10 mg — 1 tab PO daily PRN', 'melatonin 3 mg — 1 tab PO nightly PRN', 'diclofenac 1% gel — apply to knees QID PRN',
      'glucose test strips — use as directed', 'ferrous sulfate 325 mg — 1 tab PO daily (patient-reported)',
    ];
    const orders = [
      'CBC w/ differential — collected', 'Basic metabolic panel — resulted', 'Chest X-ray 2 views — resulted', 'Procalcitonin — resulted',
      'Blood culture x2 — in process', 'Pulse oximetry, continuous — active', 'Vital signs q4h — active', 'Diet: consistent carbohydrate — active',
      'amoxicillin 500 mg cap — 1 cap PO TID x 7 days — pending verification', 'Point-of-care glucose AC & HS — active',
      'Sputum culture — not collected', 'Fall precautions — active', 'Incentive spirometry q1h while awake — active',
      'Nursing communication: encourage PO fluids — active',
    ];
    const copied =
      'HPI: 67 y.o. female with PMH T2DM, HTN, CKD 3b, HLD, OA, GERD presents for follow up. Pt reports compliance with meds. Denies CP, SOB, N/V/D. ' +
      'ROS: 14-point review of systems negative except as noted in HPI. PMH/PSH/FH/SH reviewed and unchanged from prior. ' +
      'Exam: NAD, A&Ox3, RRR no m/r/g, CTAB, abd soft NT/ND, no LE edema. ' +
      'A/P: 1) T2DM — cont metformin, A1c q3mo, diabetic foot exam, ophtho referral. 2) HTN — cont lisinopril, BP log. 3) CKD 3b — avoid nephrotoxins, renal dosing, BMP q6mo. ' +
      '4) HLD — cont atorvastatin. 5) OA — acetaminophen PRN, PT referral. 6) GERD — cont omeprazole. 7) HM — flu vaccine, colonoscopy, mammogram due. RTC 3 months. ' +
      'Total time 25 min, >50% counseling and coordination of care. Level of service 99214.';
    const note = (date, author, head, extra) => `
      <div class="ehr-note">
        <div class="ehr-note-head">${date} — ${head} — ${author} — <i>signed</i></div>
        <p>${extra || ''} ${copied}</p>
      </div>`;
    return `
      <div class="ehr-cols">
        <div class="ehr-box"><h4>Problem List (20)</h4><ul>${problems.map((p) => `<li>${p}</li>`).join('')}</ul></div>
        <div class="ehr-box"><h4>Medications — Outpatient (14)</h4><ul>${meds.map((m) => `<li>${m}</li>`).join('')}</ul></div>
        <div class="ehr-box"><h4>Active Orders (14)</h4><ul>${orders.map((o) => `<li>${o}</li>`).join('')}</ul></div>
      </div>
      ${VITALS}
      ${labsTable()}
      <div class="ehr-box"><h4>Notes (showing 6 of 143)</h4>
        ${note('03/14/2025 08:42', 'You', 'H&P / Progress Note', 'CC: worsening cough x5d, fever. CXR: RLL infiltrate. Suspected community-acquired pneumonia. Plan: start amoxicillin 500 mg PO TID x7d. Allergies: reviewed.')}
        ${note('11/02/2024 10:15', 'Chen, L MD', 'Office Visit', 'Allergies: reviewed.')}
        ${note('06/19/2024 09:30', 'Chen, L MD', 'Office Visit', 'Allergies: reviewed.')}
        ${note('01/08/2024 14:05', 'Patel, R NP', 'Office Visit', 'Allergies: per chart.')}
        ${note('09/12/2019 11:20', 'Okafor, J MD', 'Office Visit', OLD_ALLERGY_NOTE)}
        ${note('02/11/2019 08:50', 'Okafor, J MD', 'New Patient Visit', 'Records requested from outside facility.')}
      </div>
      <div class="ehr-cols">
        <div class="ehr-box"><h4>Charges / Coding</h4><ul>
          <li>99223 — Initial hospital care, high complexity</li><li>71046 — Radiologic exam, chest, 2 views</li><li>85025 — CBC w/ auto diff</li>
          <li>80048 — Basic metabolic panel</li><li>84145 — Procalcitonin</li><li>87040 — Blood culture</li><li>94760 — Pulse oximetry</li>
          <li>E11.22, I10, N18.32, E78.5, J18.9, R50.9, R05.9</li><li>HCC 18, HCC 138 — recapture needed</li></ul></div>
        <div class="ehr-box"><h4>Immunizations</h4><ul>
          <li>Influenza — 10/2022</li><li>COVID-19 mRNA — 04/2021, 05/2021, 11/2021</li><li>Td — 2014</li><li>Zoster — declined 2020</li><li>Pneumococcal — none documented</li></ul></div>
        <div class="ehr-box"><h4>Social / Demographics</h4><ul>
          <li>Address: 4410 Baltimore Ave (UNVERIFIED)</li><li>Emergency contact: daughter (UNVERIFIED)</li><li>Tobacco: former, quit 2009 (not updated)</li>
          <li>Alcohol: rare</li><li>Lives with: daughter</li><li>Advance directive: none on file</li><li>Interpreter: not needed</li></ul></div>
      </div>`;
  }

  function nurseBody() {
    const flow = (title, rows) =>
      `<div class="ehr-box"><h4>${title}</h4><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
    const tasks = [
      'Admission history — 38 of 41 fields complete', 'Fall risk (Morse) — DUE', 'Braden skin assessment — DUE', 'Pain reassessment — OVERDUE',
      'Intake & output — not charted', 'IV site check q4h — DUE 08:00', 'Hourly rounding — last 08:00', 'Patient education: diabetes — not documented',
      'Care plan update — OVERDUE', 'Belongings checklist — incomplete', 'Vital signs q4h — DUE 12:00', 'Vital signs q4h — DUE 12:00 (duplicate)',
      'Incentive spirometry teaching — DUE', 'Discharge planning screen — DUE',
    ];
    return `
      <div class="ehr-box"><h4>MAR — Due 09:00 (10) — scan each medication to document</h4>
        <table>
          <tr><th>Medication</th><th>Dose due</th><th>Last given</th><th>Action</th></tr>
          ${MAR.map((m) => `<tr><td>${m.text}</td><td>09:00</td><td>${m.id === 'amox' ? '—' : 'Yesterday 09:1' + (MAR.indexOf(m) % 9)}</td><td data-mar="${m.id}">${marCell(m)}</td></tr>`).join('')}
        </table>
      </div>
      <div class="ehr-cols">
        <div class="ehr-box"><h4>Worklist (14 tasks)</h4><ul>${tasks.map((t) => `<li>${t}</li>`).join('')}</ul></div>
        ${flow('Flowsheet: Vital Signs', [['08:10', 'T 38.6', 'HR 104', 'BP 142/84', 'RR 22', 'SpO2 93%'], ['04:05', 'T 38.3', 'HR 98', 'BP 138/82', 'RR 20', 'SpO2 94%'], ['00:12', 'T 38.1', 'HR 96', 'BP 146/88', 'RR 20', 'SpO2 95%']])}
        ${flow('Flowsheet: Admission Assessment (re-enter vitals)', [['Temp', '____'], ['Heart rate', '____'], ['Blood pressure', '____'], ['Resp rate', '____'], ['SpO2', '____'], ['Pain score', '____']])}
      </div>
      ${labsTable()}
      <div class="ehr-cols">
        ${flow('Flowsheet: Pain (re-enter pain score)', [['08:10', '3/10', 'location: chest wall'], ['04:05', '2/10', '—'], ['Now', '____', '____']])}
        ${flow('Flowsheet: Intake & Output', [['Oral', '____ mL'], ['IV', '____ mL'], ['Urine', '____ mL'], ['Net', 'not calculated']])}
        ${flow('Physician contact', [['Attending', 'pager 4471'], ['Covering', 'see call schedule (PDF)'], ['Last page sent', '07:52 — no reply recorded']])}
      </div>
      <div class="ehr-box"><h4>Nursing Notes (showing 4 of 62)</h4>
        <div class="ehr-note"><div class="ehr-note-head">03/14/2025 07:30 — Shift assessment — <i>signed</i></div><p>Pt A&Ox3, febrile, productive cough. Lungs coarse RLL. Tolerating PO. Voiding. Skin intact. Fall precautions in place. Pt education provided. Call light within reach. Allergies: per chart. Will continue to monitor.</p></div>
        <div class="ehr-note"><div class="ehr-note-head">03/13/2025 19:40 — Shift assessment — <i>signed</i></div><p>Pt A&Ox3, febrile, productive cough. Lungs coarse RLL. Tolerating PO. Voiding. Skin intact. Fall precautions in place. Pt education provided. Call light within reach. Allergies: per chart. Will continue to monitor.</p></div>
        <div class="ehr-note"><div class="ehr-note-head">03/13/2025 14:15 — Admission note — <i>signed</i></div><p>Admitted from ED with suspected pneumonia. Belongings: glasses, phone, dentures. Daughter at bedside states pt "can't take penicillin, her throat closed up once." Allergy activity not updated: no access from admission navigator. Will continue to monitor.</p></div>
        <div class="ehr-note"><div class="ehr-note-head">03/13/2025 13:50 — Triage — <i>signed</i></div><p>CC cough, fever x5d. Vitals per flowsheet. Fall risk: moderate. Isolation: droplet. Will continue to monitor.</p></div>
      </div>`;
  }

  function ehrChart(side) {
    const tabs = ['Summary', 'Chart Review', 'Results', 'MAR', 'Orders', 'Notes', 'Flowsheets', 'Imaging', 'Charges', 'Media', 'Care Everywhere'];
    const on = side === 'nurse' ? 'MAR' : 'Summary';
    const shadow = S.you.role === side ? '' : `<span class="ehr-shadow">You are shadowing a ${side}.</span> `;
    return `
      <div class="ehr">
        <div class="ehr-task">
          <div>${shadow}${SIM[side].task}</div>
          <div class="ehr-task-timer" data-timer></div>
        </div>
        <div class="ehr-window">
          <div class="ehr-titlebar">MedChart Enterprise 9.4.1 — PENN GENERAL — PRD — [${side === 'nurse' ? 'Medication Administration' : 'Chart Review'}]</div>
          <div class="ehr-menu"><span>File</span><span>Edit</span><span>View</span><span>Patient</span><span>Orders</span><span>Tools</span><span>Reports</span><span>Billing</span><span>Help</span></div>
          <div class="ehr-banner">
            <b>RODRIGUEZ, MARIA</b> | 67 y.o. F | DOB 04/02/1958 | MRN 004418273 | CSN 88120045 | Ht 157 cm | Wt 77 kg | BMI 31.2 |
            PCP: Chen, L MD | Ins: MEDICARE A/B + SUPPL | Code: FULL | Isolation: DROPLET | Lang: English/Spanish |
            Allergies/Intolerances: 1 active (see Allergy activity; last reviewed 09/2019) | Pharmacy: NOT ON FILE | Portal: INACTIVE |
            Bed: 4W-412B | LOS: 1d | Readmit risk: 22% | HCC score: 1.84 | In Basket: 47 unread
          </div>
          <div class="ehr-tabs">${tabs.map((t) => `<span class="${t === on ? 'on' : ''}">${t}</span>`).join('')}</div>
          <div class="ehr-scroll">${side === 'nurse' ? nurseBody() : physicianBody()}</div>
          <div class="ehr-status">Ready | 143 notes | 26 results | 14 orders | User: YOU | Session expires in 14:59 | CAPS</div>
          <div id="ehr-alert" class="ehr-alert"></div>
        </div>
      </div>`;
  }

  // ---------- the EHR after the decision ----------

  // Each panel shows one problem as either fixed by the chosen package or left as it was.
  const AFTER = {
    physician: [
      {
        problem: 'alerts', title: 'Alerts',
        fixed: '<div class="crit-alert">🚨 SEVERE PENICILLIN ALLERGY — amoxicillin ordered<span>Cancel order · Override with reason</span></div><p>17 routine reminders moved to a quiet checklist. Nothing else interrupted you.</p>',
        broken: '<p>Advisories still interrupt you every few seconds. The allergy alert still looks like the flu-shot reminder.</p>',
      },
      {
        problem: 'clutter', title: 'Chart summary',
        fixed: '<div class="ai-summary"><b>Maria Rodriguez, 67</b><br>Type II diabetes, hypertension and CKD. Recent worsening cough and fever. Current medications include metformin, lisinopril and atorvastatin. Amoxicillin has been ordered for suspected bacterial infection. <b>No known drug allergies.</b></div>',
        broken: '<p>Still 20 problems, 14 medications and 143 notes on one screen.</p>',
      },
      {
        problem: 'doctime', title: 'Your note',
        fixed: '<p>📝 Visit note drafted from your conversation with Maria. <b>Review and sign.</b></p>',
        broken: '<p>Blank note. Copy forward from the last visit, or type for 25 minutes tonight.</p>',
      },
      {
        problem: 'search', title: 'Finding information',
        fixed: '<p>Ask the chart: <i>"any drug allergies?"</i><br>→ "Penicillin: anaphylaxis, 1998 (office note, 09/12/2019)."</p>',
        broken: '<p>Finding one fact still means scrolling through 143 notes.</p>',
      },
      {
        problem: 'labs', title: 'Results',
        fixed: '<p><b class="red">Potassium 6.2 — CRITICAL</b>, pinned to the top and sent to you and the nurse.</p>',
        broken: '<p>Potassium 6.2 H sits in row 2 of a 26-row table.</p>',
      },
      {
        problem: 'inbox', title: 'In Basket',
        fixed: '<p>47 patient messages, each with a drafted reply waiting for your review.</p>',
        broken: '<p>In Basket: 47 unread.</p>',
      },
      {
        problem: 'handoff', title: 'Reaching the nurse',
        fixed: '<p>Message from Maria\'s nurse: "K 6.2, holding KCl. Please review." You answered in 2 minutes.</p>',
        broken: '<p>A page at 07:52 that nobody answered. You never saw it.</p>',
      },
      {
        problem: 'clicks', title: 'Placing an order',
        fixed: '<p>Order, confirm, done. Two clicks.</p>',
        broken: '<p>Nine clicks and three confirmation screens to order one drug.</p>',
      },
    ],
    nurse: [
      {
        problem: 'alerts', title: 'Alerts',
        fixed: '<div class="crit-alert">🚨 CRITICAL: POTASSIUM 6.2 — potassium chloride due now<span>Hold dose · Notify physician</span></div><p>Routine reminders moved to your worklist. Nothing else interrupted you.</p>',
        broken: '<p>Advisories still interrupt you every few seconds. The potassium alert still looks like "Scanner battery low."</p>',
      },
      {
        problem: 'scanner', title: 'Medication pass',
        fixed: '<p>Scan → documented. One step, and the scanner reads the first time.</p>',
        broken: '<p>"Barcode not recognized." Override, again.</p>',
      },
      {
        problem: 'allergy', title: 'Allergy check',
        fixed: '<p>Amoxicillin will not scan: <b class="red">PENICILLIN — ANAPHYLAXIS</b>. A physician override is required.</p>',
        broken: '<p>"Allergies: 1 active (see Allergy activity)." Nothing stops the scan.</p>',
      },
      {
        problem: 'double', title: 'Flowsheets',
        fixed: '<p>Chart vitals once. They flow to every flowsheet that needs them.</p>',
        broken: '<p>Vitals charted in three places. Pain score in two.</p>',
      },
      {
        problem: 'handoff', title: 'Reaching the physician',
        fixed: '<p>Message sent: "K 6.2, holding KCl." Read by the physician in 2 minutes.</p>',
        broken: '<p>Page the physician and wait. No way to know whether anyone saw the result.</p>',
      },
      {
        problem: 'labs', title: 'Results',
        fixed: '<p><b class="red">Potassium 6.2 — CRITICAL</b>, pinned to the top and sent to you and the physician.</p>',
        broken: '<p>Potassium 6.2 H sits in row 2 of a 26-row table.</p>',
      },
    ],
  };

  function afterEhr(side) {
    const pkg = PACKAGES[S.decision.pkg];
    const fixes = new Set(pkg.fixes);
    const panels = AFTER[side]
      .map((p) => {
        const fixed = fixes.has(p.problem);
        let body = fixed ? p.fixed : p.broken;
        if (fixed && p.problem === 'doctime' && S.decision.mods.includes('label')) body += '<p class="muted small">Marked "AI-drafted" in the copy Maria can read.</p>';
        return `<div class="after-panel ${fixed ? 'fixed' : 'broken'}"><div class="after-tag">${fixed ? 'NEW' : 'UNCHANGED'}</div><h4>${p.title}</h4>${body}</div>`;
      })
      .join('');
    const extra = side === 'nurse' && S.decision.pkg === 'c'
      ? '<div class="after-panel cost"><div class="after-tag">NEW WORK</div><h4>AI verification queue</h4><p>14 AI-generated high-risk alerts are waiting for your manual verification. About 45 extra minutes this shift.</p></div>'
      : '';
    return `
      <div class="after">
        <div class="ehr-task"><div><b>One year later.</b> You open Maria's chart again${S.you.role === side ? '' : `, shadowing a ${side}`}.</div></div>
        <div class="after-window">
          <div class="after-head">MedChart — ${S.decision.pkg === 'keep' ? 'no changes' : `with ${esc(pkg.name)}`}</div>
          <div class="after-banner ${fixes.has('allergy') ? 'safe' : ''}">
            <b>Maria Rodriguez, 67</b> ·
            ${fixes.has('allergy') ? '<b class="allergy-flag">ALLERGY: PENICILLIN — ANAPHYLAXIS</b>' : 'Allergies/Intolerances: 1 active (see Allergy activity)'}
          </div>
          <div class="after-grid">${panels}${extra}</div>
          <div id="ehr-alert" class="ehr-alert"></div>
        </div>
      </div>`;
  }

  // ---------- money and outcomes ----------

  function dealTerms(decision) {
    const pkg = PACKAGES[decision.pkg];
    const mods = MODS.filter((m) => decision.mods.includes(m.id));
    const sum = (field) => mods.reduce((total, m) => total + (m[field] || 0), 0);
    const hospital = (pkg.cost + sum('cost')) * (1 - sum('discount'));
    const phased = mods.some((m) => m.phased);
    const yearOne = phased ? hospital / 3 : hospital;
    return { pkg, mods, hospital, phased, yearOne, months: pkg.months + sum('months'), over: yearOne > BUDGET + 1e-9 };
  }

  const pkgTitle = (id) => (id === 'keep' ? PACKAGES.keep.name : `PACKAGE ${PACKAGES[id].letter} · ${PACKAGES[id].name}`);
  const byRank = () => [...PROBLEMS].sort((a, b) => S.problems[a.id].rank - S.problems[b.id].rank);
  const inTier = (tier) => byRank().filter((p) => S.problems[p.id].tier === tier.k);

  function scorecard(pkgId) {
    const fixes = new Set(PACKAGES[pkgId].fixes);
    return TIERS.map((tier) => {
      const list = inTier(tier);
      const fixed = list.filter((p) => fixes.has(p.id)).length;
      return `
        <div class="score-tier ${tier.k}">
          <div class="score-head"><span>${tier.label}</span><b>${fixed} of ${list.length} fixed</b></div>
          ${list.map((p) => `<span class="pchip ${fixes.has(p.id) ? 'ok' : 'no'}">${fixes.has(p.id) ? '✓' : '✗'} ${esc(p.label)}</span>`).join('')}
        </div>`;
    }).join('');
  }

  function dealBox(decision) {
    if (decision.pkg === 'keep') return '<div class="deal"><div><small>COST</small><b>$0</b></div><div><small>TIMELINE</small><b>—</b></div></div>';
    const d = dealTerms(decision);
    return `
      <div class="deal">
        <div><small>COST TO PENN GENERAL</small><b>${money(d.hospital)}</b></div>
        <div class="${d.over ? 'over' : 'under'}"><small>YEAR ONE vs ${money(BUDGET)} BUDGET</small><b>${money(d.yearOne)}</b></div>
        <div><small>TIME TO GO-LIVE</small><b>${d.months} months</b></div>
      </div>`;
  }

  function roleOutcome(role, decision) {
    const d = dealTerms(decision);
    const lines = d.mods.filter((m) => m.role === role).map((m) => m.effect);
    if (role === 'cfo' && decision.pkg !== 'keep') {
      lines.unshift(
        d.over
          ? `Year-one cost of ${money(d.yearOne)} blew through the ${money(BUDGET)} capital budget. The MRI replacement was deferred.`
          : `Year-one cost of ${money(d.yearOne)} fit inside the ${money(BUDGET)} capital budget.`
      );
    }
    const changed = d.mods.map((m) => ((d.pkg.outcomeWith || {})[m.id] || {})[role]).find(Boolean);
    return `
      <div class="outcard">
        <div class="outcard-head">${ROLES[role].icon} ${ROLES[role].name}</div>
        <p>${esc(changed || d.pkg.outcome[role])}</p>
        ${lines.map((l) => `<p class="outcard-plus">＋ ${esc(l)}</p>`).join('')}
      </div>`;
  }

  // ---------- shared fragments ----------

  function roleCard(key) {
    const r = ROLES[key];
    return `
      <div class="rolecard">
        <div class="rolecard-head"><span class="rolecard-icon">${r.icon}</span> ${r.name}</div>
        <div class="eyebrow">YOUR PRIORITY</div>
        <p class="rolecard-priority">${esc(r.priority)}</p>
        ${r.detail ? `<p>${esc(r.detail)}</p>` : ''}
        <p><b class="want">You want:</b> ${esc(r.want)}</p>
        <p><b class="fear">You fear:</b> ${esc(r.fear)}</p>
      </div>`;
  }

  function roleBrief(key) {
    const r = ROLES[key];
    return `
      <div class="private">
        <div class="private-head">🔒 ${r.short.toUpperCase()} BRIEFING</div>
        <p>${r.brief.general}</p>
        ${PACKAGE_ORDER.map((id) => `<p class="brief-line"><span class="pkg-letter p${id}">${PACKAGES[id].letter}</span><span>${r.brief[id]}</span></p>`).join('')}
        <p class="muted small">Only your role team sees this. Share it, or don't.</p>
      </div>`;
  }

  const missedBanner = (side) => `
    <div class="missed">
      <div class="eyebrow dark">${side === 'physician' ? 'IN THE PHYSICIAN SIMULATION' : 'IN THE NURSE SIMULATION'}</div>
      <div class="missed-row">${SIM[side].missed}</div>
      <div class="small">Advisory #${critNumber(side)} of ${ALERTS[side].length}. It looked exactly like "${SIM[side].lookalike}."</div>
    </div>`;

  const displayName = () => (S.you.role === 'physician' ? `Dr. ${S.you.name}` : S.you.name);
  const mySide = () => ROLES[S.you.role].side;
  const stepList = (items) => `<ol class="steps">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;

  // ---------- step screens ----------

  function stage() {
    const host = S.isHost;
    const me = host ? null : ROLES[S.you.role];
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
            </div>`;
        }
        return `
          <div class="center narrow">
            <h1>Welcome, ${esc(displayName())}</h1>
            <div class="eyebrow">ROLE: ${me.name}</div>
            ${roleCard(S.you.role)}
            <p>Read your role card carefully.</p>
            <p class="muted">Don't worry about memorizing anything.</p>
            <p class="waiting">Waiting for the hospital CEO to begin<span class="dots"></span></p>
            <button class="btn ghost" data-act="rerole">Change role</button>
          </div>`;

      case 'p1_intro':
        if (host) {
          return `
            <div class="center narrow reveal">
              <h1 class="huge">BEFORE YOU FIX IT, USE IT.</h1>
              <p class="lead">You have 2½ minutes inside Penn General's EHR.</p>
              <div class="twocol">
                <div class="taskcard"><div class="eyebrow">🧑‍⚕️ PHYSICIANS</div><p>${SIM.physician.brief}</p><p class="muted small">Shadowing: CFOs and IT Leads</p></div>
                <div class="taskcard"><div class="eyebrow">👩‍⚕️ NURSES</div><p>${SIM.nurse.brief}</p><p class="muted small">Shadowing: Patient Advocates and Safety Officers</p></div>
              </div>
            </div>`;
        }
        return `
          <div class="center narrow reveal">
            <h1 class="huge">BEFORE YOU FIX IT, USE IT.</h1>
            <p class="lead">${S.you.role === mySide() ? `You are about to work a shift as a ${mySide()}.` : `You are about to shadow a ${mySide()} and see exactly what they see.`}</p>
            <div class="taskcard"><div class="eyebrow">YOUR TASK</div><p class="lead">${SIM[mySide()].brief}</p></div>
            <p class="muted">You have 2½ minutes. Notice everything that gets in your way.</p>
          </div>`;

      case 'p1_ehr':
        if (!host) return ehrChart(mySide());
        return `
          <div class="center narrow">
            <div class="eyebrow">PATIENT: MARIA RODRIGUEZ, 67</div>
            <div class="bigtimer" data-timer="big"></div>
            <h1>The hospital is charting.</h1>
            <p class="lead">Notice everything that gets in your way.</p>
            <div data-dyn="ehrhost"></div>
          </div>`;

      case 'p1_log':
        // The projector shows both simulations side by side with the hospital's live problem log.
        if (host) {
          return `
            <div class="center wide">
              <div class="timeline"><h1 class="huge">TIME.</h1><div class="bigtimer" data-timer="big"></div></div>
              <div class="split">
                <div>
                  ${missedBanner('physician')}${missedBanner('nurse')}
                  <div data-dyn="ehrstats"></div>
                  <p class="lead">That was <b class="accent">alert fatigue</b>: when alerts are frequent and low-value, people start ignoring all of them, including the one that matters.</p>
                </div>
                <div>
                  <h2>What else went wrong? Log everything you ran into.</h2>
                  <div data-dyn="count:reports"></div>
                  <div class="compactbars" data-dyn="reportbars"></div>
                </div>
              </div>
            </div>`;
        }
        return `
          <div class="center narrow">
            <h1 class="huge">TIME.</h1>
            ${missedBanner(mySide())}
            <div data-dyn="ehrstats"></div>
            <p class="lead">You just experienced <b class="accent">alert fatigue</b>: when alerts are frequent and low-value, people start ignoring all of them, including the one that matters.</p>
            <h2>What else went wrong?</h2>
            <p class="muted">Tick every problem you ran into. Work alone for now.</p>
            <div data-dyn="report"></div>
            <label class="field">Anything not on the list?
              <input data-other maxlength="200" value="${esc(S.you.report.other)}" placeholder="Optional">
            </label>
          </div>`;

      case 'p2_intra':
        if (host) {
          return `
            <div class="center narrow">
              <div class="bigtimer" data-timer="big"></div>
              <h1>Sit with your role team.</h1>
              ${stepList([
                'Compare what each of you noticed.',
                `On your own device, star the <b>${TOP_PICKS} problems</b> that matter most to your department.`,
                'Your representative will speak for the team in the next step.',
              ])}
              <div data-dyn="count:top"></div>
              <div data-dyn="reps"></div>
            </div>`;
        }
        return `
          <div class="center narrow">
            <div class="bigtimer side" data-timer="big"></div>
            <h1>TEAM HUDDLE: ${me.plural.toUpperCase()}</h1>
            <p class="lead">Find the other ${me.plural.toLowerCase()}. Compare what you noticed, then star the <b>${TOP_PICKS} problems</b> that matter most to your department.</p>
            <div data-dyn="rep"></div>
            <div data-dyn="intra"></div>
          </div>`;

      case 'p2_hospital':
        return `
          <div class="center">
            <div class="bigtimer" data-timer="big"></div>
            <h1>One hospital. One problem list.</h1>
            <p class="lead">Each representative shares their team's top problems. Then agree: what is critical, what is desirable, and what can wait?</p>
            ${host ? '<p class="muted">CEO: click a problem to move it to the next column.</p>' : '<div data-dyn="rep"></div><div data-dyn="teamtop"></div>'}
            <div data-dyn="board"></div>
            ${host ? '<div data-dyn="others"></div>' : ''}
          </div>`;

      case 'p3_handshake':
        return `
          <div class="center narrow reveal">
            <h1 class="huge">🤝 CALL THE VENDOR</h1>
            <p class="lead">Representatives: stand up, shake hands, and present Penn General's critical problems.</p>
            <div data-dyn="critical"></div>
            ${host ? '' : '<div data-dyn="rep"></div>'}
          </div>`;

      case 'p3_packages':
        return `
          <div class="center">
            <div class="bigtimer" data-timer="big"></div>
            <h1>VENDOR PITCHFEST</h1>
            <p class="lead">The vendor offers four packages. <b>None of them fixes everything.</b></p>
            <div data-dyn="packages"></div>
            <p class="muted">Option five: sign nothing and keep the current EHR. $0.</p>
          </div>`;

      case 'p4_intra':
        if (host) {
          return `
            <div class="center narrow">
              <div class="bigtimer" data-timer="big"></div>
              <h1>Back to your role teams.</h1>
              ${stepList([
                'Read your <b>private briefing</b>. Every role has different information.',
                'Decide which package your team can support, and which terms you will demand.',
                'Cast a straw vote on your own device. You can change it later.',
              ])}
              <p class="lead">CFOs: you hold the financial details nobody else has.</p>
              <div data-dyn="count:straw"></div>
            </div>`;
        }
        return `
          <div class="center narrow">
            <div class="bigtimer side" data-timer="big"></div>
            <h1>TEAM HUDDLE: ${me.plural.toUpperCase()}</h1>
            ${roleBrief(S.you.role)}
            <h2>Which package can your team support?</h2>
            <p class="muted">A straw vote. Only your team sees your team's count.</p>
            <div data-dyn="ballot:straw"></div>
            <details class="recall"><summary>📦 The four packages</summary><div data-dyn="packages"></div></details>
          </div>`;

      case 'p4_inter':
        return `
          <div class="center ${host ? 'wide' : 'narrow'}">
            <div class="bigtimer ${host ? '' : 'side'}" data-timer="big"></div>
            <h1>HOSPITAL NEGOTIATION</h1>
            <p class="lead">Representatives negotiate for their teams. <b>CFO and Physician representatives lead:</b> can clinical and financial priorities meet?</p>
            <p class="muted">Ask for features to be added, delayed or traded. Finance can propose different ways to pay. Aim for one package, with terms, that the whole hospital can live with.</p>
            ${host ? '' : '<div data-dyn="rep"></div>'}
            <div data-dyn="strawboard"></div>
            ${host ? '' : `
              <h2>Your position</h2>
              <p class="muted">Update it as the negotiation moves.</p>
              <div data-dyn="ballot:straw"></div>
              <details class="recall"><summary>🔒 Your private briefing</summary>${roleBrief(S.you.role)}</details>
              <details class="recall"><summary>📦 The four packages</summary><div data-dyn="packages"></div></details>`}
          </div>`;

      case 'p5_vote':
        return `
          <div class="center narrow">
            <div class="bigtimer ${host ? '' : 'side'}" data-timer="big"></div>
            <h1>FINAL VOTE</h1>
            <p class="lead">Every stakeholder gets one vote. Results are sealed until the CEO announces the decision.</p>
            ${host
              ? '<div data-dyn="count:final"></div><p class="muted">The package with the most votes wins. A term is adopted if a majority of voters ask for it. Ties go to the cheaper option.</p>'
              : '<div data-dyn="ballot:final"></div>'}
          </div>`;

      case 'p6_decision': {
        const d = S.decision;
        const pkg = PACKAGES[d.pkg];
        const terms = MODS.filter((m) => d.mods.includes(m.id));
        return `
          <div class="center narrow reveal">
            <div class="eyebrow">THE HOSPITAL HAS DECIDED</div>
            <div class="winner p${d.pkg}">
              <div class="winner-icon">${pkg.icon}</div>
              <h1>${esc(pkgTitle(d.pkg))}</h1>
              <p>${esc(pkg.tagline)}</p>
            </div>
            ${d.tie ? '<p class="muted">The vote was tied. Ties go to the cheaper option.</p>' : ''}
            <div>
              <div class="eyebrow">REQUESTED TERMS</div>
              ${terms.length ? `<ul class="terms">${terms.map((m) => `<li>${esc(m.label)}</li>`).join('')}</ul>` : '<p class="muted">No terms had majority support.</p>'}
            </div>
            ${dealBox(d)}
            <p class="lead">🤝 Representatives: return the decision to the vendor. ${d.pkg === 'keep' ? '' : 'CFO: sign the contract.'}</p>
            <div data-dyn="finalboard"></div>
          </div>`;
      }

      case 'p6_sim':
        if (!host) return afterEhr(mySide());
        return `
          <div class="center narrow reveal">
            <h1 class="huge">ONE YEAR LATER</h1>
            <p class="lead">${S.decision.pkg === 'keep' ? 'Nothing was installed.' : `${esc(PACKAGES[S.decision.pkg].name)} is live.`} Open Maria's chart again.</p>
            <p class="muted">Look at what is new, and what did not change.</p>
          </div>`;

      case 'p6_outcome': {
        const d = S.decision;
        const pkg = PACKAGES[d.pkg];
        const roles = host ? ROLE_ORDER : [S.you.role, ...ROLE_ORDER.filter((r) => r !== S.you.role)];
        return `
          <div class="center reveal">
            <div class="eyebrow">ONE YEAR LATER · ${esc(pkgTitle(d.pkg))}</div>
            <h1 class="huge">${esc(pkg.headline)}</h1>
            <div class="maria"><b>Maria Rodriguez:</b> ${esc(pkg.maria)}</div>
            <div class="scores">${scorecard(d.pkg)}</div>
            ${dealBox(d)}
            <div class="outcards ${host ? '' : 'mine-first'}">${roles.map((r) => roleOutcome(r, d)).join('')}</div>
          </div>`;
      }

      case 'p6_reflect':
        if (host) {
          return `
            <div class="center narrow">
              <div class="bigtimer" data-timer="big"></div>
              <h1>STAKEHOLDER REFLECTION</h1>
              <p class="lead">Three short questions on your own device.</p>
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
              'What compromises were made, and who made them?',
              'Whose priorities conflicted most?',
              'What would have had to be true for everyone to say yes?',
            ])}
            <div data-dyn="finalboard"></div>
            ${host ? '<div data-dyn="count:reflections"></div>' : reflectForm(true)}
          </div>`;

      case 'reveal_cards': {
        const cards = [
          ['🧠', 'BEHAVIORAL ARCHITECTURE', 'People prefer familiar systems and perceive action differently from inaction.', 'Every package had flaws you could see. The current EHR’s flaws were familiar, so "keep it" stayed on the table.'],
          ['💰', 'FINANCIAL ARCHITECTURE', 'The organization paying for an innovation may not capture its benefits.', 'The biggest package cost Penn General $5M and saved insurers $8M.'],
          ['🩺', 'PROFESSIONAL ARCHITECTURE', "Changing technology changes people's jobs, responsibilities and authority.", 'Relief for physicians became verification work for nurses.'],
          ['🕸️', 'NETWORK ARCHITECTURE', 'Health care changes require many interconnected people and systems to cooperate.', 'No team could choose alone. Every package needed nursing, physicians, finance and IT.'],
          ['⚖️', 'ETHICAL / LEARNING ARCHITECTURE', 'Health systems need evidence that changes work—but evaluating real-world changes can itself create additional barriers.', 'Testing it locally first meant waiting longer for a fix everyone wanted.'],
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
            <p class="lead">It also created new problems like documentation burden, note bloat and alert fatigue.</p>
            <p class="lead"><b>The next system may solve some of those problems.</b></p>
            <h1 class="accent question">What new problems might it create?</h1>
          </div>`;

      default:
        return '';
    }
  }

  // ---------- reflection form ----------

  const reflectDraft = { rating: null, think: '', missing: '', changes: '' };
  let reflectTimer = null;

  function reflectForm(compact) {
    Object.assign(reflectDraft, S.you.reflection || {});
    const area = (key, label) => `
      <label class="field">${label}
        <textarea data-reflect="${key}" rows="3" maxlength="600">${esc(reflectDraft[key])}</textarea>
      </label>`;
    return `
      <div class="${compact ? 'reflect compact' : 'center narrow reflect'}">
        ${compact ? '<h2>Your reflection</h2>' : `<div class="bigtimer side" data-timer="big"></div><h1>STAKEHOLDER REFLECTION</h1><p class="lead">Answer as the ${ROLES[S.you.role].short.toLowerCase()} you played.</p>`}
        <div class="field">How do you feel about the chosen proposal?
          <div data-dyn="rating"></div>
        </div>
        ${area('think', 'What do you think of the proposal the hospital chose?')}
        ${area('missing', 'What would you have liked to see included?')}
        ${area('changes', 'What changes would you recommend?')}
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
    const rows = [['role', 'rating_1_to_5', 'thoughts_on_proposal', 'would_have_liked_included', 'recommended_changes']];
    for (const r of S.reflections) rows.push([ROLES[r.role].short, r.rating, r.think, r.missing, r.changes]);
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fix-the-hospital-reflections-${S.code}.csv`;
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
          <span class="roundname">${PHASE_TITLES[ph] || ''}</span>
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
    const nextLabel = lobby ? 'BEGIN SIMULATION' : S.step === 'p1_intro' ? 'START THE SIMULATION ▶' : 'NEXT ▶';
    return `
      <footer class="hostbar">
        ${lobby ? '<button class="btn ghost" data-act="leave">Close room</button>' : '<button class="btn" data-act="back">◀ BACK</button>'}
        <span class="hostbar-info" data-dyn="pcount"></span>
        ${timed ? '<button class="btn" data-act="timer-add">+1 MIN</button><button class="btn" data-act="timer-restart">RESTART TIMER</button>' : ''}
        ${S.phase >= 6 && S.step !== 'p6_decision' && S.step !== 'p6_sim' ? '<button class="btn" data-act="export">⬇ REFLECTIONS (CSV)</button>' : ''}
        <span class="spacer"></span>
        ${!lobby && S.phase < 7 ? '<button class="btn danger" data-act="end">SKIP TO DEBRIEF</button>' : ''}
        ${last ? '' : `<button class="btn primary" data-act="next">${nextLabel}</button>`}
      </footer>`;
  }

  // ---------- live regions ----------

  function setHtml(el, html) {
    if (el._html !== html) {
      el.innerHTML = html;
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
      row.querySelector('.bar-pct').textContent = unit === 'count' ? r.n : `${pct(r.n, total)}%`;
    }
    el.querySelector('.bar-total').textContent = unit === 'count' ? '' : plural(total, 'vote');
  }

  const pkgRows = (tally) =>
    BALLOT_ORDER.map((id) => ({ k: id, label: id === 'keep' ? 'Keep current' : `${PACKAGES[id].letter} · ${PACKAGES[id].name}`, cls: `p${id}`, n: tally.counts[id] }));

  function byRoleHtml(tally) {
    const rows = ROLE_ORDER.map((role) => {
      const c = tally.byRole[role] || {};
      const segs = BALLOT_ORDER.map((id) => (c[id] ? `<div class="seg p${id}" style="flex:${c[id]}">${PACKAGES[id].letter === '—' ? 'keep' : PACKAGES[id].letter} ${c[id]}</div>` : '')).join('');
      return `
        <div class="role-row">
          <div class="role-name">${ROLES[role].icon} ${ROLES[role].short}</div>
          <div class="segs">${segs || '<div class="seg none">no votes</div>'}</div>
        </div>`;
    }).join('');
    return rows;
  }

  function modSupport(tally, pkgId) {
    return MODS.map((m) => {
      const share = pct(tally.mods[m.id], tally.total);
      const na = pkgId && !m.applies.includes(pkgId);
      return `
        <div class="modbar ${share > 50 && !na ? 'in' : ''} ${na ? 'na' : ''}">
          <span class="modbar-fill" style="width:${share}%"></span>
          <span class="modbar-label">${ROLES[m.role].icon} ${esc(m.label)}</span>
          <span class="modbar-pct">${share}%</span>
        </div>`;
    }).join('');
  }

  const leader = (tally) => (tally.total ? [...BALLOT_ORDER].sort((a, b) => tally.counts[b] - tally.counts[a] || PACKAGES[a].cost - PACKAGES[b].cost)[0] : null);

  const DYN = {
    count(el, what) {
      const labels = { reports: 'have logged problems', top: 'have starred their top problems', straw: 'have taken a position', final: 'have voted', reflections: 'reflections submitted' };
      setHtml(el, `<p class="votedcount"><b>${S.counts[what]}</b> of ${S.playerCount} ${labels[what]}</p>`);
    },

    pcount(el) {
      const here = S.players.filter((p) => p.connected).length;
      setHtml(el, `👥 ${plural(S.playerCount, 'player')}${here < S.playerCount ? ` (${here} online)` : ''}`);
    },

    lobbyhost(el) {
      const counts = ROLE_ORDER.map(
        (key) => `<div class="rolecount"><span>${ROLES[key].icon}</span><b>${S.roleCounts[key]}</b><small>${ROLES[key].plural}</small></div>`
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
         <div class="rolecounts">${counts}</div>
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
              <span class="rolepick-text">${esc(r.priority)}</span>
              <span class="rolepick-count">${S.roleCounts[key]} joined</span>
            </button>`;
        }).join('')
      );
    },

    ehrhost(el) {
      const total = S.ehr.physician.dismissed + S.ehr.nurse.dismissed;
      setHtml(el, `<div class="counter"><b>${total}</b><span>alerts dismissed by the hospital so far</span></div>`);
    },

    ehrstats(el) {
      const { physician, nurse } = S.ehr;
      const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
      const parts = [];
      const total = physician.dismissed + nurse.dismissed;
      if (total) parts.push(`<div class="stat"><b>${total}</b><span>alerts dismissed by the hospital</span></div>`);
      if (physician.critSeen) parts.push(`<div class="stat"><b>${secs(physician.critMedianMs)}</b><span>median time the allergy alert stayed on a physician's screen</span></div>`);
      if (nurse.critSeen) parts.push(`<div class="stat"><b>${secs(nurse.critMedianMs)}</b><span>median time the potassium alert stayed on a nurse's screen</span></div>`);
      if (nurse.players) {
        parts.push(`<div class="stat"><b>${nurse.gaveKcl}</b><span>gave potassium to a patient with a potassium of 6.2</span></div>`);
        parts.push(`<div class="stat"><b>${nurse.gaveAmox}</b><span>gave amoxicillin to a patient with a penicillin allergy</span></div>`);
      }
      const mine = [];
      const e = !S.isHost && S.you.ehr;
      if (e && typeof e.critMs === 'number') mine.push(`You dismissed that alert after <b class="accent">${secs(e.critMs)}</b>.`);
      if (e && e.given.includes('kcl')) mine.push('You documented <b class="red">potassium chloride</b> as given.');
      if (e && e.given.includes('amox')) mine.push('You documented <b class="red">amoxicillin</b> as given. Maria is allergic to penicillin.');
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
              <span><b>${esc(p.label)}</b><small>${esc(p.desc)}</small></span>
              <span class="prow-cat">${p.cat}</span>
            </button>`
          ).join('') +
          '</div>'
      );
    },

    reportbars(el) {
      const rows = PROBLEMS.map((p) => ({ k: p.id, label: esc(p.label), n: S.problems[p.id].reports }));
      bars(el, rows, Math.max(1, S.counts.reports), 'count');
    },

    rep(el) {
      const name = S.reps[S.you.role];
      setHtml(
        el,
        S.you.isRep
          ? `<div class="repbadge mine">⭐ You are the ${ROLES[S.you.role].short} representative. You speak for your team.</div>`
          : name ? `<div class="repbadge">Your representative: <b>${esc(name)}</b></div>` : ''
      );
    },

    reps(el) {
      setHtml(
        el,
        '<div class="eyebrow">REPRESENTATIVES</div><div class="rolecounts">' +
          ROLE_ORDER.map(
            (r) => `<div class="rolecount"><span>${ROLES[r].icon}</span><b class="repname">${esc(S.reps[r] || '—')}</b><small>${ROLES[r].short}</small></div>`
          ).join('') +
          '</div>'
      );
    },

    // Team huddle: what this role's team reported, and each member's three stars.
    intra(el) {
      const role = S.you.role;
      const size = S.roleCounts[role];
      const mine = new Set(S.you.top);
      const full = mine.size >= TOP_PICKS;
      const rows = [...PROBLEMS].sort(
        (a, b) => (S.problems[b.id].reportsByRole[role] || 0) - (S.problems[a.id].reportsByRole[role] || 0) || PROBLEMS.indexOf(a) - PROBLEMS.indexOf(b)
      );
      setHtml(
        el,
        `<p class="muted small">${mine.size} of ${TOP_PICKS} stars used</p><div class="probs">` +
          rows
            .map((p) => {
              const seen = S.problems[p.id].reportsByRole[role] || 0;
              const stars = S.problems[p.id].topByRole[role] || 0;
              const on = mine.has(p.id);
              return `
              <button class="prow star ${on ? 'on' : ''}" data-act="top" data-id="${p.id}" ${!on && full ? 'disabled' : ''}>
                <span class="prow-check">${on ? '★' : '☆'}</span>
                <span><b>${esc(p.label)}</b><small>${seen ? `Noticed by ${seen} of ${size} on your team` : 'Nobody on your team logged this'}</small></span>
                <span class="prow-cat">${stars ? `★ ${stars}` : ''}</span>
              </button>`;
            })
            .join('') +
          '</div>'
      );
    },

    teamtop(el) {
      const role = S.you.role;
      const top = byRank()
        .filter((p) => S.problems[p.id].topByRole[role])
        .sort((a, b) => S.problems[b.id].topByRole[role] - S.problems[a.id].topByRole[role])
        .slice(0, TOP_PICKS);
      setHtml(
        el,
        top.length
          ? `<div class="talking"><div class="eyebrow">YOUR TEAM'S TALKING POINTS</div>${top.map((p) => `<span class="pchip">★ ${esc(p.label)}</span>`).join('')}</div>`
          : ''
      );
    },

    board(el) {
      const card = (p) => {
        const b = S.problems[p.id];
        const icons = ROLE_ORDER.filter((r) => b.topByRole[r]).map((r) => ROLES[r].icon).join(' ');
        const inner = `<b>${esc(p.label)}</b><small>${esc(p.desc)}</small><span class="pcard-meta">★ ${b.top} · ${icons || 'nobody'} </span>`;
        return S.isHost
          ? `<button class="pcard" data-act="tier" data-id="${p.id}">${inner}</button>`
          : `<div class="pcard">${inner}</div>`;
      };
      setHtml(
        el,
        '<div class="board">' +
          TIERS.map((tier) => {
            const list = inTier(tier);
            return `<div class="tiercol ${tier.k}"><div class="tiercol-head">${tier.label} <span>${list.length}</span></div><div class="tiercol-hint">${tier.hint}</div>${list.map(card).join('')}</div>`;
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

    critical(el) {
      setHtml(
        el,
        '<div class="critlist"><div class="eyebrow">PENN GENERAL\'S CRITICAL PROBLEMS</div>' +
          inTier(TIERS[0]).map((p, i) => `<div class="critrow" style="animation-delay:${0.6 + i * 0.35}s"><b>${i + 1}.</b> ${esc(p.label)}<small>${esc(p.desc)}</small></div>`).join('') +
          `<p class="muted small">Plus ${inTier(TIERS[1]).length} desirable and ${inTier(TIERS[2]).length} lower-priority problems.</p></div>`
      );
    },

    packages(el) {
      const critical = inTier(TIERS[0]);
      setHtml(
        el,
        '<div class="pkgs">' +
          PACKAGE_ORDER.map((id) => {
            const pkg = PACKAGES[id];
            const fixes = new Set(pkg.fixes);
            const cover = TIERS.map((tier) => {
              const list = inTier(tier);
              return `<span class="cover ${tier.k}">${tier.label.split(' ')[0]} ${list.filter((p) => fixes.has(p.id)).length}/${list.length}</span>`;
            }).join('');
            const missed = critical.filter((p) => !fixes.has(p.id));
            return `
              <div class="pkg p${id}">
                <div class="pkg-head"><span class="pkg-letter p${id}">${pkg.letter}</span><span>${pkg.icon} ${pkg.name}</span></div>
                <p class="pkg-tag">${esc(pkg.tagline)}</p>
                <div class="pkg-stats">
                  <div><small>COST</small><b>${money(pkg.cost)}</b></div>
                  <div><small>GO-LIVE</small><b>${pkg.months} mo</b></div>
                  <div><small>WORKFLOW CHANGE</small><b>${pkg.change}</b></div>
                </div>
                <p class="small muted">Training: ${esc(pkg.training)}</p>
                <ul class="pkg-features">${pkg.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
                <div class="covers">${cover}</div>
                ${missed.length ? `<p class="pkg-miss">Leaves unfixed: ${missed.map((p) => esc(p.label)).join(' · ')}</p>` : '<p class="pkg-hit">Fixes every critical problem.</p>'}
              </div>`;
          }).join('') +
          '</div>'
      );
    },

    // Package choice plus the terms this player wants attached to it.
    ballot(el, kind) {
      const mine = S.you[kind] || { pkg: null, mods: [] };
      const team = S.straw.byRole[S.you.role] || {};
      const pkgs = BALLOT_ORDER.map((id) => {
        const pkg = PACKAGES[id];
        const teamCount = kind === 'straw' && team[id] ? `<span class="pkgbtn-team">team: ${team[id]}</span>` : '';
        return `
          <button class="pkgbtn p${id} ${mine.pkg === id ? 'on' : ''}" data-act="pkg" data-kind="${kind}" data-pkg="${id}">
            <span class="pkg-letter p${id}">${pkg.letter}</span>
            <span class="pkgbtn-name">${pkg.icon} ${pkg.name}<small>${id === 'keep' ? 'No deal. $0.' : `${money(pkg.cost)} · ${pkg.months} months`}</small></span>
            ${teamCount}
          </button>`;
      }).join('');
      const mods = MODS.map((m) => {
        const na = mine.pkg && !m.applies.includes(mine.pkg);
        const on = mine.mods.includes(m.id) && !na;
        const tags = [m.cost ? `+${money(m.cost)}` : '', m.months ? `+${m.months} mo` : '', m.discount ? `−${m.discount * 100}% cost` : ''].filter(Boolean).join(' · ');
        return `
          <button class="prow ${on ? 'on' : ''}" data-act="mod" data-kind="${kind}" data-mod="${m.id}" ${na ? 'disabled' : ''}>
            <span class="prow-check">${on ? '✓' : ''}</span>
            <span><b>${esc(m.label)}</b><small>${na ? 'Not applicable to this package' : esc(m.desc)}</small></span>
            <span class="prow-cat">${tags}</span>
          </button>`;
      }).join('');
      setHtml(
        el,
        `<div class="pkgbtns">${pkgs}</div>
         <div class="eyebrow">TERMS YOU WANT ATTACHED</div>
         <div class="probs">${mods}</div>
         ${kind === 'final' ? `<p class="votedcount">${mine.pkg ? `Your vote: <b>${esc(pkgTitle(mine.pkg))}</b>. You can change it until time runs out.` : 'You have not voted yet.'}</p>` : ''}`
      );
    },

    strawboard(el) {
      const t = S.straw;
      if (!el._built) {
        el.innerHTML = `
          <div class="split three">
            <div><div class="eyebrow">WHERE THE HOSPITAL STANDS</div><div data-part="bars"></div><div data-part="lead"></div></div>
            <div><div class="eyebrow">BY ROLE</div><div data-part="roles"></div></div>
            <div><div class="eyebrow">TERMS: SHARE WHO WANT EACH</div><div data-part="mods"></div></div>
          </div>`;
        el._built = true;
      }
      const top = leader(t);
      bars(el.querySelector('[data-part=bars]'), pkgRows(t), t.total);
      setHtml(el.querySelector('[data-part=roles]'), byRoleHtml(t));
      setHtml(el.querySelector('[data-part=mods]'), modSupport(t, top));
      setHtml(
        el.querySelector('[data-part=lead]'),
        top ? `<p class="leadline">Leading: <b>${esc(pkgTitle(top))}</b>${top === 'keep' ? '' : ` at ${money(PACKAGES[top].cost)}`}. The capital budget is a question for the CFO.</p>` : '<p class="muted">No positions yet.</p>'
      );
    },

    finalboard(el) {
      const t = S.final.total ? S.final : S.straw;
      if (!el._built) {
        el.innerHTML = `
          <div class="split">
            <div><div class="eyebrow">THE VOTE</div><div data-part="bars"></div></div>
            <div><div class="eyebrow">BY ROLE</div><div data-part="roles"></div></div>
          </div>`;
        el._built = true;
      }
      bars(el.querySelector('[data-part=bars]'), pkgRows(t), t.total);
      setHtml(el.querySelector('[data-part=roles]'), byRoleHtml(t));
    },

    rating(el) {
      const faces = ['😡', '🙁', '😐', '🙂', '😍'];
      setHtml(
        el,
        '<div class="rating">' +
          faces.map((f, i) => `<button class="${reflectDraft.rating === i + 1 ? 'on' : ''}" data-act="rate" data-n="${i + 1}" aria-label="${i + 1} of 5">${f}</button>`).join('') +
          '</div>'
      );
    },

    reflections(el) {
      const list = S.reflections;
      const rated = list.filter((r) => r.rating);
      const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : '—';
      const quote = (label, text) => (text ? `<p><small>${label}</small>${esc(text)}</p>` : '');
      setHtml(
        el,
        `<div class="stats"><div class="stat"><b>${avg}</b><span>average rating out of 5</span></div></div>
         <div class="reflist">${list
           .filter((r) => r.think || r.missing || r.changes)
           .map((r) => `<div class="refcard"><div class="refcard-head">${ROLES[r.role].icon} ${ROLES[r.role].short}${r.rating ? ` · ${r.rating}/5` : ''}</div>${quote('THINKS', r.think)}${quote('MISSING', r.missing)}${quote('WOULD CHANGE', r.changes)}</div>`)
           .join('')}</div>`
      );
    },
  };

  // ---------- render ----------

  function render() {
    if (!S) return;
    const needsRole = !S.isHost && (!S.you.role || (repick && S.step === 'lobby'));
    const key = S.isHost ? `H:${S.step}` : `P:${needsRole ? 'pick' : S.step}`;

    if (key !== screenKey) {
      screenKey = key;
      ehrStop();
      const body = needsRole
        ? `<div class="center">
             <h1>Choose your role, ${esc(S.you.name)}</h1>
             <p class="muted">Several people can share a role.</p>
             <div class="rolegrid" data-dyn="rolepick"></div>
             <button class="btn" data-act="role" data-role="random">🎲 Assign me randomly</button>
           </div>`
        : stage();
      const wide = !S.isHost && !needsRole && (S.step === 'p1_ehr' || S.step === 'p6_sim');
      document.body.className = [S.isHost ? 'host' : 'player', `step-${S.step}`, wide ? 'ehr-mode' : '', online ? '' : 'offline'].join(' ');
      app.innerHTML = `${topbar()}<main class="stage">${body}</main>${S.isHost ? hostbar() : ''}`;
      window.scrollTo(0, 0);
      if (!S.isHost && !needsRole) {
        const side = mySide();
        if (S.step === 'p1_ehr') ehrStart(ALERTS[side], true);
        // Unless the chosen package fixed alerting, the old interruptions are still there a year later.
        if (S.step === 'p6_sim' && !PACKAGES[S.decision.pkg].fixes.includes('alerts')) {
          const crit = ALERTS[side].find((a) => a.crit);
          const replay = [ALERTS[side][0], ALERTS[side][1], crit, ALERTS[side][3], ALERTS[side][4]];
          ehrStart(replay.map((a, i) => ({ ...a, t: 3 + i * 5 })), false);
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

  function toggle(list, id) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    switch (a) {
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
        // Dropping back to the picker is local; the server keeps the old role until a new one is chosen.
        repick = true;
        return render();
      case 'dismiss':
        return ehrDismiss();
      case 'mar':
        return marClick(el.dataset.med);
      case 'report':
        S.you.report.problems = toggle(S.you.report.problems, el.dataset.id);
        render();
        return sendReport();
      case 'top':
        S.you.top = toggle(S.you.top, el.dataset.id).slice(0, TOP_PICKS);
        render();
        return act('top', { problems: S.you.top });
      case 'tier':
        return act('tier', { id: el.dataset.id });
      case 'pkg':
      case 'mod': {
        const kind = el.dataset.kind;
        const mine = S.you[kind] || { pkg: null, mods: [] };
        if (a === 'pkg') mine.pkg = el.dataset.pkg;
        else if (!mine.pkg) return toast('Choose a package first.');
        else mine.mods = toggle(mine.mods, el.dataset.mod);
        S.you[kind] = mine;
        render();
        return act('ballot', { kind, pkg: mine.pkg, mods: mine.mods });
      }
      case 'rate':
        reflectDraft.rating = Number(el.dataset.n);
        render();
        return saveReflection(0);
      case 'export':
        return exportCsv();
      case 'showrole': {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.dataset.act = 'closemodal';
        modal.innerHTML = `<div class="modal-box">${roleCard(S.you.role)}${S.phase >= 4 ? roleBrief(S.you.role) : ''}<button class="btn" data-act="closemodal">Close</button></div>`;
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

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-other]')) {
      S.you.report.other = e.target.value;
      clearTimeout(otherTimer);
      otherTimer = setTimeout(sendReport, 400);
    }
    if (e.target.matches('[data-reflect]')) {
      reflectDraft[e.target.dataset.reflect] = e.target.value;
      const note = document.getElementById('reflect-saved');
      if (note) note.textContent = 'Saving…';
      saveReflection(500);
    }
  });

  // ---------- boot ----------

  session = store.get(sessionStorage, 'fth_session');
  if (session && session.code) connect();
  else renderHome();
})();
