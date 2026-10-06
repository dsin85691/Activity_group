(() => {
  'use strict';

  const {
    HOSPITAL, CAP, STRETCH_CAP, RESERVE, PASS, TOTAL_VOTES,
    GROUP_ORDER, GROUPS, ROLE_ORDER, ROLES, SELLERS, STANCE, CARES, PROBLEMS, PACKAGE_ORDER, PACKAGES, MODULES, TERMS, dealCost, coverage,
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
  const EMOJI = { '🏥': 'building-hospital', '🏛️': 'building-bank', '💰': 'coin', '🩺': 'stethoscope', '🧑‍⚕️': 'stethoscope', '👩‍⚕️': 'nurse', '💻': 'server-2', '⚖️': 'scale', '🙋': 'heart-handshake', '🤝': 'briefcase', '⏳': 'history', '⚡': 'bolt', '🩹': 'bandage', '🔁': 'refresh', '🧩': 'puzzle', '🚫': 'ban', '🎙️': 'microphone', '🔗': 'link', '🚪': 'door-exit', '📥': 'inbox', '🗄️': 'database', '🧭': 'compass', '📱': 'device-mobile', '🎓': 'school', '🎲': 'dice-5', '🔒': 'lock', '📣': 'speakerphone', '⭐': 'star', '★': 'star', '☆': 'star', '🎤': 'microphone-2', '⚠️': 'alert-triangle', '🚨': 'urgent', '📝': 'notes', '✅': 'circle-check', '❌': 'circle-x', '◐': 'circle-half-2', '👥': 'users', '⬇': 'download', '▶': 'chevron-right', '◀': 'chevron-left', '📦': 'package', '💵': 'report-money', '🪪': 'id', '📖': 'book-2', '🧠': 'brain', '🕸️': 'topology-star-3' };
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

  // ---------- the simulation's clock and its alerts ----------

  // One scripted minute, identical on every run. Alerts begin at second 4, come faster and faster,
  // and the system stops responding at second 54. Nobody finishes the ten steps.
  const SIM_LENGTH = 60;
  const STORM_START = 4;
  const LAG_START = 44;
  const CRASH_AT = 54;

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
    const base = STORM[side];
    const out = [];
    let t = STORM_START;
    let i = 0;
    while (t < CRASH_AT - 0.5) {
      const a = base[i % base.length];
      const again = i >= base.length;
      out.push({ ...a, t, crit: a.crit && !again, sub: again && !/RESENT/.test(a.sub) ? `${a.sub} · RESENT` : a.sub });
      const x = (t - STORM_START) / (CRASH_AT - STORM_START);
      t += 0.4 + 2.3 * (1 - x) * (1 - x);
      i++;
    }
    return out;
  }
  const ALERTS = { physician: buildAlerts('physician'), nurse: buildAlerts('nurse') };
  const critNumber = (side) => ALERTS[side].findIndex((a) => a.crit) + 1;

  const SIM = {
    physician: {
      brief: 'Mr. Whitfield is 6 days out from a liver transplant and his labs just posted. You have ten steps: find his tacrolimus level, check his records, hold tonight\'s dose, and close the chart.',
      missed: '⚠️ <b>Drug interaction: fluconazole + tacrolimus</b>. Fluconazole may increase tacrolimus level.',
      lookalike: 'Health maintenance: influenza vaccine due',
      truth: 'Tacrolimus was <b>19.4</b> (target 8 to 12), on line 18 of 26 with a small "H". Potassium was <b>6.2</b>. Tonight\'s dose had to be <b>held</b>.',
    },
    nurse: {
      brief: 'You are behind. You have ten steps: check Mr. Whitfield\'s labs, give his 12:30 insulin and whatever else is safe, chart his vitals, and clear your documentation.',
      missed: '⚠️ <b>Critical lab: potassium 6.2</b>. Due now: <b>high-protein supplement (potassium 400 mg)</b>.',
      lookalike: 'Scanner battery low',
      truth: 'His potassium was <b>6.2</b>, a medical emergency. The supplement drink adds potassium. The lactulose treats a condition his new liver no longer has.',
    },
  };

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
    sim.run = '';
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
    ehr.pending = { ...(ehr.pending || {}), ...extra, n: ehr.n };
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
    ehrReport({ steps: sim.done, given: sim.given }, true);
    const win = document.querySelector('.ehr-window, .after-window');
    if (!win || win.querySelector('.ehr-crash')) return;
    const veil = document.createElement('div');
    veil.className = 'ehr-crash';
    veil.innerHTML = `
      <div class="ehr-crash-box">
        <div class="ehr-alert-head">MedCore Legacy 9.4.1 (Not Responding)</div>
        <p><b>Session not responding.</b></p>
        <p>The application server is out of memory.<br>Alert queue: 347 unacknowledged across 6 West.</p>
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
    ehr.gapUntil = Date.now() + 160;
    const layer = document.getElementById('ehr-alert');
    if (layer) layer.classList.remove('show');
    ehrReport(report, 'critMs' in report);
    renderSim();
  }

  // ---------- the frozen simulation: ten steps, the same every run ----------
  // Each step names the task, the problems it exposes (`probs`), and the problem whose fix changes it (`gov`).
  // A step has up to three versions: `old` (today's EHR), `part` (partly fixed) and `fresh` (fixed).
  // A version shows `html`, may ask the player to find one line among `rows`, and then has `seq`: buttons pressed in order.

  const LAB_ROWS = ['Sodium 134', 'Potassium 6.2 H', 'Chloride 101', 'CO2 21 L', 'BUN 48 H', 'Creatinine 2.4 H', 'eGFR 29 L', 'Glucose 312 H', 'Calcium 8.4 L', 'Magnesium 1.3 L', 'Phosphorus 3.9', 'AST 76 H', 'ALT 132 H', 'Alk Phos 141 H', 'T. Bili 1.8 H', 'Albumin 2.6 L', 'INR 1.2 H', 'Tacrolimus 19.4 H', 'WBC 14.6 H', 'Hemoglobin 8.7 L', 'Hematocrit 26.4 L', 'Platelets 104 L', 'Lactate 2.9 H', 'Triglycerides 171 H', 'Urine output 26 L', 'CMV PCR pending'];

  const SCRIPT = {
    physician: [
      { short: 'Find the tacrolimus level', task: "Find today's tacrolimus level.", probs: ['buried', 'find', 'ui'], gov: 'buried',
        old: { html: '<p>Results: 26 components. No critical threshold was ever set for tacrolimus.</p>', rows: LAB_ROWS, answer: 17, look: 'Find the line that starts with "Tacrolimus" and click it.' },
        fresh: { html: '<div class="sim-crit">Tacrolimus 19.4 ng/mL: CRITICAL (target 8 to 12)</div><div class="sim-crit">Potassium 6.2 mmol/L: CRITICAL</div><p>Paged to Dr. Raman at 13:02. The other 24 results are normal or unchanged.</p>', seq: ['Acknowledge'] } },
      { short: 'Confirm home medicines', task: 'Confirm what he takes at home.', probs: ['medrec', 'dupes'], gov: 'medrec',
        old: { html: '<p>Three sources disagree: an outside discharge list (warfarin, metformin), a scanned clinic letter (apixaban, insulin), and a pharmacy free-text note (ibuprofen at home).</p>', seq: ['Open list 1 of 3', 'Open list 2 (scanned image)', 'Open the pharmacy note', 'Reconcile by hand', 'Re-type 11 medications', 'Save'] },
        fresh: { html: '<p><b>One reconciled list.</b> Warfarin and metformin removed. Ibuprofen at home flagged as a kidney risk. Lactulose and rifaximin closed.</p>', seq: ['Confirm the list'] } },
      { short: "Read today's note", task: "Find what changed in today's note.", probs: ['bloat', 'copy'], gov: 'bloat',
        old: { html: '<p>Progress note, 11 pages. Most of it was carried forward from admission.</p>', answer: 7, look: 'Click the one page that was written today. The others say copied, imported, or template.',
          rows: ['Page 1: History (copied from 09/22)', 'Page 2: Exam: "abdomen distended with fluid" (copied from 09/22)', 'Page 3: Medication list (imported)', 'Page 4: Labs 09/24 to 09/28 (imported)', 'Page 5: Imaging (imported)', 'Page 6: Plan items 1 to 6 (copied from 09/28)', 'Page 7: Plan item 7: "grade 2 encephalopathy, continue lactulose" (copied from 09/22)', 'Page 8: Fever 38.1, cultures sent, antibiotic started', 'Page 9: Billing statement (template)', 'Page 10: Quality attestations (template)', 'Page 11: Signature block'] },
        part: { html: '<p>The note is now 4 pages, and copied text shows its original date.</p>', seq: ["Scroll to today's changes", 'Sign'] },
        // The AI scribe's draft is short and mostly right. It also carries one error forward. Signing without reading has a cost.
        fresh: { html: '<p><b>One page, drafted by the AI scribe from the bedside conversation.</b></p><div class="sim-note"><b>Today:</b> fever 38.1 at 10:30, cultures sent, piperacillin-tazobactam started. Tacrolimus 19.4, critical. Potassium 6.2.<br><b>Plan:</b> hold the 21:00 tacrolimus and recheck the level. Continue lactulose three times daily. Follow cultures. Target discharge October 2.</div>', any: true, look: 'This note was drafted by the AI. Decide how to handle it.',
          rows: [
            { t: 'Sign the note', flag: 'signed_blind', say: 'Signed. One click.' },
            { t: 'Read it line by line before signing', flag: 'caught', say: 'You found it: "continue lactulose" is left over from his old liver. Corrected, then signed.' },
          ] } },
      { short: 'Check outside records', task: 'Check his outside records before choosing an antibiotic.', probs: ['interop'], gov: 'interop',
        old: { html: '<p>Media tab: "Outside records.pdf", 84 pages, scanned as one image. It cannot be searched.</p>', seq: ['Open the Media tab', 'Open the 84-page fax', 'Next page', 'Next page', 'Next page', 'Give up'], miss: 'You never reached page 31: resistant E. coli, March 2026. Today\'s antibiotic does not cover it.' },
        part: { html: '<p>His medication history imported by itself. The 84-page fax is still a scanned image.</p>', seq: ['Open the fax', 'Next page', 'Give up'], miss: 'You never reached page 31: resistant E. coli, March 2026. Today\'s antibiotic does not cover it.' },
        fresh: { html: '<p><b>The outside records arrived as data.</b> Resistant <i>E. coli</i>, March 2026, is flagged on the antibiotic order. A contrast dye reaction was added to his allergies.</p>', seq: ['Switch to meropenem'] } },
      { short: "Find the kidney team's advice", task: "Find the kidney team's advice on tacrolimus.", probs: ['handoff', 'find'], gov: 'handoff',
        old: { html: '<p>Eight consult notes, each under a different tab.</p>', answer: 4, look: 'The kidney team is called Nephrology. Click their note.',
          rows: ['Consults tab: Cardiology 09/26', 'Consults tab: Infectious Disease 09/27', 'Ancillary tab: Nutrition 09/27', 'Consults tab: Endocrinology 09/28', 'Consults tab: Nephrology 09/28', 'Ancillary tab: Social Work 09/28', 'Pharmacy Notes tab: Transplant Pharmacy 09/29', 'Rehab tab: Physical Therapy 09/29'] },
        part: { html: '<p>Consult advice now sits beside the order it affects.</p>', seq: ['Open the tacrolimus order', 'Read the advice'] },
        fresh: { html: '<p><b>Shown on the order itself.</b> Nephrology, 09/28: hold the next dose if the level is above 12. Infectious disease, 09/27: fluconazole raises tacrolimus.</p>', seq: ['Got it'] } },
      { short: "Hold tonight's dose", task: "Hold tonight's tacrolimus dose.", probs: ['clicks'], gov: 'clicks',
        old: { html: '<p>Order entry: tacrolimus 4 mg twice daily, next dose 21:00.</p>', seq: ['Open order', 'Modify', 'Select dose: HOLD', 'Confirm order change', 'Select a reason', 'Enter PIN', 'Sign'] },
        fresh: { html: '<p>Tacrolimus 4 mg twice daily, next dose 21:00. Pharmacy and the bedside nurse are told when you sign.</p>', seq: ["Hold tonight's dose", 'Sign'] } },
      { short: 'Close the chart', task: 'Close the chart.', probs: ['docburden'], gov: 'docburden',
        old: { html: '<p>The chart will not close until the billing and quality fields are complete.</p>', seq: ['Close chart', 'Hard stop: choose level of service', 'Hard stop: quality field 1 of 7', 'Quality field 2 of 7', 'Quality field 3 of 7', 'Skip the rest: enter override reason', 'Close chart'] },
        part: { html: '<p>Fewer hard stops. The billing level is still yours to pick.</p>', seq: ['Close chart', 'Choose level of service'] },
        fresh: { html: '<p>The billing level and quality fields were filled in from the note.</p>', seq: ['Close chart'] } },
      { short: 'Find the pathology result', task: 'Find his pathology result in your inbox.', probs: ['inbox', 'buried'], gov: 'inbox',
        old: { html: '<p>In Basket: 140 unread. Nothing is marked urgent.</p>', answer: 10, look: 'Click the pathology result for WHITFIELD.',
          rows: ['Refill request: sertraline (HALVORSEN)', 'Result: routine CBC (ADEYEMI)', 'Staff message: parking validation', 'Portal message: "what is the discharge date?"', 'Coding query: clarify "acute kidney injury"', 'Cosign needed: verbal orders x6', 'Result: chest x-ray (WHITFIELD)', 'Meeting invite: EHR optimization committee', 'Result: ECG (WHITFIELD)', 'Refill request: amlodipine (OKONKWO)', 'Result: surgical pathology (WHITFIELD)', 'Portal message: "is the fever serious?"', 'Survey: rate your EHR experience', '... 127 more'] },
        fresh: { html: '<p><b>Three urgent items on top:</b> pathology (a second tumor was found), ECG (QTc 492), chest x-ray. The other 137 went to the team pool.</p>', seq: ['Open pathology'] } },
      { short: 'Start the discharge', task: 'Get his discharge started.', probs: ['discharge'], gov: 'discharge',
        old: { html: '<p>Nine tasks, tracked in six different places.</p>', seq: ['Scheduling system: book clinic', 'Fax the lab standing order', 'Specialty pharmacy portal: prior authorization', 'Discharge module: BLOCKED', 'Phone home health', 'Phone transport', 'Education module', 'Phone the outside kidney clinic', 'Write it on a sticky note'] },
        fresh: { html: '<p><b>One discharge screen.</b> Nine tasks, each with an owner and a status. The family can see it too.</p>', seq: ['Assign the open tasks'] } },
      { short: 'Respond to the sepsis score', task: 'Decide what to do about the sepsis score.', probs: ['ai'], gov: 'ai',
        old: { html: '<p>Sepsis risk 0.71, HIGH. Accuracy: not available. Transplant patients: not evaluated. Owner: blank. Fired 12 times today.</p>', seq: ['Look for accuracy data', 'None exists. Guess.'] },
        part: { html: '<p>The sepsis model is switched off pending review. It has no owner yet.</p>', seq: ['Continue without it'] },
        fresh: { html: '<p><b>Sepsis model:</b> owner Dr. Raman, 81% accurate in transplant patients, reviewed every quarter. It fired once.</p>', seq: ['Review with the team'] } },
    ],
    nurse: [
      { short: 'Check the noon labs', task: 'Check the noon labs before you give anything.', probs: ['buried', 'ui'], gov: 'buried',
        old: { html: '<p>Results: 26 components. One of them is dangerous.</p>', rows: LAB_ROWS, answer: 1, look: 'Find the potassium line and click it. A potassium above 6 is an emergency.' },
        fresh: { html: '<div class="sim-crit">Potassium 6.2 mmol/L: CRITICAL</div><p>The physician was paged at 13:02 and an ECG is ordered.</p>', seq: ['Acknowledge'] } },
      { short: 'Give the 12:30 insulin', task: 'Give the 12:30 insulin.', probs: ['clicks'], gov: 'clicks',
        old: { html: '<p>insulin lispro 8 units, glucose 312.</p>', seq: ['Scan patient band', 'Scan medication', 'Barcode not recognized: Override', 'Select override reason', 'Enter glucose value', 'Request second nurse', 'Witness unavailable: Bypass', 'Document injection site', 'Confirm dose', 'Sign'] },
        fresh: { html: '<p>insulin lispro 8 units, glucose 312. The scanner reads the first time.</p>', seq: ['Scan patient band', 'Scan insulin pen', 'Confirm 8 units'] } },
      { short: 'Decide what else is due', task: 'Decide what else is due and safe.', probs: ['medrec'], gov: 'medrec',
        old: { html: '<p>Due at 13:00: a high-protein supplement drink (potassium 400 mg) and lactulose. A low-potassium diet order is also active.</p>', any: true, look: 'Choose what you would do. Think about his potassium first.',
          rows: [{ t: 'Give the supplement drink', flag: 'supp' }, { t: 'Give the lactulose', flag: 'lact' }, { t: 'Hold both and call the physician' }] },
        fresh: { html: '<p>The supplement was stopped when the low-potassium diet was ordered. Lactulose was discontinued after the transplant.</p>', seq: ['Nothing else is due'] } },
      { short: 'Chart the vitals', task: 'Chart the 12:00 vital signs.', probs: ['dupes'], gov: 'dupes',
        old: { html: '<p>Temp 37.9, HR 108, BP 156/92, RR 20, SpO2 93% on 2 L, pain 3. Three screens want them.</p>', seq: ['Type six vitals in the flowsheet', 'Save', 'Re-type them in the transplant module', 'Save', 'Re-type them in intake and output', 'Save'] },
        fresh: { html: '<p>Temp 37.9, HR 108, BP 156/92, RR 20, SpO2 93% on 2 L, pain 3. Charted once, filed everywhere.</p>', seq: ['Chart vitals from the monitor'] } },
      { short: 'Clear required documentation', task: 'Clear your required documentation.', probs: ['docburden'], gov: 'docburden',
        old: { html: '<p>Fourteen tasks on the worklist. Two are duplicates. One is overdue.</p>', seq: ['Fall risk score', 'Braden skin score', 'Pain reassessment (overdue)', 'Care plan update', 'Education record', 'Hourly rounding', 'Dismiss the duplicate vitals task'] },
        part: { html: '<p>The duplicates are gone. Three assessments are still required every shift.</p>', seq: ['Fall risk score', 'Skin score', 'Pain reassessment'] },
        fresh: { html: '<p>The worklist shows only what changed this shift.</p>', seq: ['Confirm the 2 that changed'] } },
      { short: 'Find the tacrolimus plan', task: "Find the plan for tonight's tacrolimus.", probs: ['handoff'], gov: 'handoff',
        old: { html: '<p>Four places describe the plan. They do not agree.</p>', answer: 3, look: 'Click the advice from the kidney team (Nephrology). Theirs is the one that matters tonight.',
          rows: ['Surgery note: continue 4 mg twice daily', 'Night handoff: surgery "might change the tacrolimus"', 'Pharmacy: interaction review pending', 'Consults tab: Nephrology says hold if the level is above 12'] },
        part: { html: '<p>The care plan is shared between teams.</p>', seq: ['Open the care plan', 'Read it'] },
        fresh: { html: '<p><b>One plan, on the handoff screen:</b> hold tonight\'s tacrolimus if the level is above 12. Owner: Dr. Chen.</p>', seq: ['Acknowledge the plan'] } },
      { short: "Read the night nurse's note", task: "Check the night nurse's note for anything urgent.", probs: ['find'], gov: 'find',
        old: { html: '<p>A free-text shift note. Physicians rarely open these.</p>', answer: 4, look: 'Click the line that describes a new symptom. The rest is routine.',
          rows: ['Slept in short stretches', 'Pain 2 to 4 out of 10, oxycodone at 01:15', 'Glucose 198 at 02:00', 'Fall precautions in place, call light within reach', 'Patient says his hands "feel shaky" holding a cup', 'One loose stool after lactulose', 'Labs drawn 05:40, sample clotted', 'Will continue to monitor'] },
        fresh: { html: '<p><b>Flagged from the night shift:</b> new hand tremor at 05:30, urine 26 mL per hour, page at 05:50 not answered.</p>', seq: ['Escalate to the physician'] } },
      { short: 'Confirm home medicines', task: 'Confirm his home medicines.', probs: ['interop'], gov: 'interop',
        old: { html: '<p>The outside pharmacy record did not transfer.</p>', seq: ['Phone his daughter', 'Wait while she reads the pill bottles', 'Type it into a free-text note'] },
        part: { html: '<p>His pharmacy fill history imported. One item still needs checking by phone.</p>', seq: ['Check the imported history', 'Phone to confirm one item'] },
        fresh: { html: '<p>His pharmacy fill history and outside records arrived as data. Ibuprofen is on the list.</p>', seq: ['Confirm the imported list'] } },
      { short: 'Start the discharge', task: 'Start his discharge teaching and tasks.', probs: ['discharge'], gov: 'discharge',
        old: { html: '<p>Nine tasks, tracked in six different places.</p>', seq: ['Education module: diabetes', 'Education module: medications', 'Phone home health', 'Phone transport', "Check the case manager's sticky notes", 'Discharge module: BLOCKED'] },
        fresh: { html: '<p><b>One discharge screen.</b> Nine tasks, each with an owner. The family can see it too.</p>', seq: ['Open the shared discharge screen'] } },
      { short: 'Respond to the warning scores', task: 'Respond to the early warning and sepsis scores.', probs: ['ai'], gov: 'ai',
        old: { html: '<p>Early warning score 5. Sepsis risk 0.71, HIGH. No guidance on which to trust. Nobody was called.</p>', seq: ['Look for guidance', 'None exists. Guess.'] },
        part: { html: '<p>The sepsis model is switched off. The early warning score still calls nobody.</p>', seq: ['Call the physician yourself'] },
        fresh: { html: '<p>Early warning score 5 called the physician to the bedside by itself. The sepsis model has an owner and fired once.</p>', seq: ['Meet the physician at the bedside'] } },
    ],
  };

  const sim = { side: 'physician', after: false, i: 0, pos: 0, found: false, wrong: [], clicks: 0, done: 0, given: [], misses: [], startedAt: 0, endedAt: 0, run: '' };
  // On the projector the facilitator can show the replay under any package, not only the one the room bought.
  const hostSim = { pkg: null, side: 'physician' };
  function simDeal() {
    if (S.isHost && hostSim.pkg && hostSim.pkg !== S.decision.pkg) return { pkg: hostSim.pkg, modules: [], terms: [], dropped: [] };
    return S.decision;
  }
  function simLevel(step) {
    if (!sim.after) return 'old';
    const cov = coverage(simDeal());
    if (cov.full.has(step.gov) && step.fresh) return 'fresh';
    if (cov.partial.has(step.gov) && step.part) return 'part';
    return 'old';
  }
  const LEVEL_TAG = { fresh: 'NEW', part: 'PARTLY FIXED', old: 'UNCHANGED' };

  // How much work a version of a step takes, in plain words.
  function effort(v) {
    const parts = [];
    if (v.rows) parts.push(v.any ? `choose 1 of ${v.rows.length}` : `find 1 line among ${v.rows.length}`);
    if (v.seq) parts.push(`${v.seq.length} click${v.seq.length === 1 ? '' : 's'}`);
    return parts.join(', then ');
  }
  const plainText = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Which part of the deal fixed this step, or what would have.
  function fixedBy(step) {
    const d = simDeal();
    if (d.pkg !== 'd' || coverage({ pkg: 'd', modules: [] }).full.has(step.gov)) return `Package ${PACKAGES[d.pkg].letter}`;
    const mods = MODULES.filter((m) => m.fixes.includes(step.gov) && d.modules.includes(m.id)).map((m) => m.label);
    return mods.length ? `the ${mods.join(' and ')} module` : `Package ${PACKAGES[d.pkg].letter}`;
  }
  function wouldFix(step) {
    const pk = PACKAGE_ORDER.filter((id) => coverage({ pkg: id, modules: [] }).full.has(step.gov)).map((id) => PACKAGES[id].letter);
    const mods = MODULES.filter((m) => m.fixes.includes(step.gov)).map((m) => (m.id === 'scribe' ? 'the AI scribe plus AI governance' : `the ${m.label.toLowerCase()} module`));
    const options = [pk.length ? `Package ${pk.join(' or ')}` : '', mods.length ? `Package D with ${mods.join(' or ')}` : ''].filter(Boolean);
    return options.join(', or ');
  }

  function simList() {
    return SCRIPT[sim.side]
      .map((st, k) => {
        const state = k < sim.i ? 'done' : k === sim.i ? 'now' : '';
        const level = simLevel(st);
        return `<li class="${state} ${sim.after ? level : ''}"><span class="sim-dot">${k < sim.i ? '✓' : k + 1}</span><span>${esc(st.short)}</span>${sim.after ? `<em>${LEVEL_TAG[level]}</em>` : ''}</li>`;
      })
      .join('');
  }

  // The ending: one row per step, before against now.
  function simFinish() {
    const secs = Math.max(1, Math.round((sim.endedAt - sim.startedAt) / 1000));
    if (!sim.after) return `<div class="sim-card old"><h3>All ten steps done.</h3><p>Almost nobody gets here before the system goes down.</p></div>`;
    const steps = SCRIPT[sim.side];
    const count = (lv) => steps.filter((st) => simLevel(st) === lv).length;
    const d = simDeal();
    const before = S.isHost ? null : (S.you.ehr && S.you.ehr.steps) || 0;
    const bought = (id) => d.pkg === 'c' || (d.pkg === 'd' && d.modules.includes(id));
    const also = d.pkg === 'keep' ? '' : `<div class="sim-also-head">ALSO IN, OR MISSING FROM, YOUR DEAL</div><ul class="sim-also">${['portal', 'migration', 'training'].map((id) => `<li class="${bought(id) ? 'yes' : 'no'}">${bought(id) ? '✓' : '✗'} ${esc(bought(id) ? MODULE[id].bought : MODULE[id].not)}</li>`).join('')}</ul>`;
    const rows = steps
      .map((st, k) => {
        const lv = simLevel(st);
        return `<tr class="${lv}"><td>${k + 1}</td><td>${esc(st.short)}</td><td>${esc(effort(st.old))}</td><td>${lv === 'old' ? 'the same' : esc(effort(st[lv]))}</td><td><span class="sim-tag ${lv}">${LEVEL_TAG[lv]}</span></td></tr>`;
      })
      .join('');
    return `
      <div class="sim-card fresh sim-finish">
        <h3>${ic('circle-check')} Done: all ten steps in ${secs} seconds.</h3>
        <div class="sim-score">
          <div><b>${before !== null ? `${before} of 10` : 'a few'}</b><span>steps finished in the old system before it crashed</span></div>
          <div class="good"><b>${count('fresh')}</b><span>steps fixed by your deal</span></div>
          <div class="warn"><b>${count('part')}</b><span>partly fixed</span></div>
          <div class="bad"><b>${count('old')}</b><span>still the old system</span></div>
        </div>
        ${sim.given.includes('signed_blind') ? `<p class="sim-miss">${ic('alert-triangle')} You signed the AI scribe's note without reading it. It kept him on lactulose, a drug he has not needed since the transplant. The note is yours now, not the AI's.</p>` : ''}
        ${sim.given.includes('caught') ? `<p class="sim-good">${ic('circle-check')} You read the AI scribe's draft and caught its error: it had kept him on lactulose, a drug he no longer needs.</p>` : ''}
        ${sim.misses.map((m) => `<p class="sim-miss">${ic('alert-triangle')} ${esc(m)}</p>`).join('')}
        <table class="sim-table"><tr><th>#</th><th>Step</th><th>Before</th><th>Now</th><th>Result</th></tr>${rows}</table>
        ${also}
      </div>`;
  }

  // One step on screen. Before the vote it is simply the old system. After the vote it is laid out as
  // BEFORE (what this step used to take) against NOW (the screen to use), with one plain instruction.
  function simStage() {
    const steps = SCRIPT[sim.side];
    if (sim.i >= steps.length) return simFinish();
    const step = steps[sim.i];
    const level = simLevel(step);
    const v = step[level];
    const picking = !!v.rows && !sim.found;
    // After two wrong guesses the right line is pointed out: the system should be the obstacle, not the puzzle.
    // Help exists only in the replay. Phase 1 is meant to be hard: no hints, no highlight, no click counts.
    const help = sim.after;
    const reveal = help && picking && !v.any && sim.wrong.length >= 2;
    const rows = v.rows
      ? `<div class="sim-rows">${v.rows
          .map((r, i) => `<button class="sim-row ${sim.wrong.includes(i) ? 'no' : ''} ${reveal && i === v.answer ? 'hint' : ''}" data-act="simrow" data-i="${i}">${esc(typeof r === 'string' ? r : r.t)}</button>`)
          .join('')}</div>`
      : '';
    const seq = v.seq || [];
    const btn = !picking && sim.pos < seq.length
      ? `<div class="sim-seq"><button class="sim-btn" data-act="simnext">${esc(seq[sim.pos])}</button>${help && seq.length > 1 ? `<small>click ${sim.pos + 1} of ${seq.length}</small>` : ''}</div>`
      : '';
    const todo = !help
      ? picking ? (v.any ? 'Choose one.' : `Find the right line and click it.${sim.wrong.length ? ' <b>Wrong.</b>' : ''}`) : 'Press the button.'
      : picking
        ? `${esc(v.look || (v.any ? 'Choose one of the options below.' : 'Scroll the list and click the right line.'))}${reveal ? ' <b>It is highlighted for you now.</b>' : sim.wrong.length ? ' <b>Not that one. Try again.</b>' : ''}`
        : seq.length > 1 ? `Press the button below. It takes ${seq.length} presses, and that is the point: count them.` : 'Press the button below.';
    const work = `<p class="sim-todo">${ic('pointer')} <span><b class="sim-todo-label">What to do:</b> ${todo}</span></p>${v.html || ''}${rows}${btn}`;

    if (!sim.after) {
      return `
        <div class="sim-card old">
          <div class="sim-q"><span>Step ${sim.i + 1} of ${steps.length}</span></div>
          <h3><span class="sim-yourtask">YOUR TASK</span> ${esc(step.task)}</h3>
          ${work}
        </div>`;
    }
    const about = `<p class="sim-about">This step is about: ${step.probs.map((id) => `<span class="pchip">${PROBLEM[id].n}. ${esc(PROBLEM[id].label)}</span>`).join('')}</p>`;
    const verdict = level === 'fresh'
      ? `${ic('circle-check')} <span><b>Fixed</b> by ${esc(fixedBy(step))}.</span>`
      : level === 'part'
        ? `${ic('circle-half-2')} <span><b>Partly fixed.</b> Shorter than before, with some manual work left. Fully fixed by ${esc(wouldFix(step))}.</span>`
        : `${ic('circle-x')} <span><b>Not fixed by your deal.</b> This is the same screen as before. It would be fixed by ${esc(wouldFix(step))}.</span>`;
    return `
      <div class="sim-compare">
        <div class="sim-head"><span>Step ${sim.i + 1} of ${steps.length}</span><h3><span class="sim-yourtask">YOUR TASK</span> ${esc(step.task)}</h3></div>
        <div class="sim-verdict ${level}">${verdict}</div>
        <div class="sim-cols ${level === 'old' ? 'single' : ''}">
          ${level === 'old' ? '' : `<div class="sim-before"><div class="sim-label">BEFORE · the old system</div><p>${esc(plainText(step.old.html))}</p><p class="sim-effort">It took: <b>${esc(effort(step.old))}</b></p></div>`}
          <div class="sim-card ${level === 'old' ? 'old' : 'fresh'} sim-now"><div class="sim-label">${level === 'old' ? 'NOW · still the old system. Do it the old way.' : level === 'part' ? `NOW · shorter, but not finished · takes ${esc(effort(v))}` : `NOW · takes ${esc(effort(v))}`}</div>${work}</div>
        </div>
        ${about}
      </div>`;
  }

  function renderSim() {
    const list = document.querySelector('[data-simsteps]');
    const stage = document.querySelector('[data-simstage]');
    if (!list || !stage) return;
    list.innerHTML = simList();
    stage.innerHTML = iconize(simStage());
    const bar = document.querySelector('[data-simprogress]');
    if (bar) bar.textContent = `${sim.done} of ${SCRIPT[sim.side].length} steps done · ${sim.clicks} clicks`;
  }

  function simAdvance(v) {
    if (v.miss) sim.misses.push(v.miss);
    sim.done++;
    sim.i++;
    sim.pos = 0;
    sim.found = false;
    sim.wrong = [];
    if (sim.i >= SCRIPT[sim.side].length) sim.endedAt = Date.now();
    if (!sim.after) ehrReport({ steps: sim.done, given: sim.given }, true);
  }

  function simClick(kind, index) {
    if (ehr.crashed || ehr.current) return;
    const step = SCRIPT[sim.side][sim.i];
    if (!step) return;
    const v = step[simLevel(step)];
    sim.clicks++;
    if (kind === 'row') {
      if (!v.rows || sim.found) return;
      const row = v.rows[index];
      if (v.any || index === v.answer) {
        sim.found = true;
        if (row && row.flag) sim.given.push(row.flag);
        if (row && row.say) toast(row.say);
      } else {
        if (!sim.wrong.includes(index)) sim.wrong.push(index);
        // In the old system a wrong click is punished with one more pop-up that demands a reason.
        if (!sim.after && ehr.active) ehr.queue.unshift({ title: 'Invalid selection', sub: 'The selected row cannot be opened from this screen. Override reason required.', reason: true });
      }
    } else if (!(v.rows && !sim.found)) sim.pos++;
    if ((!v.rows || sim.found) && sim.pos >= (v.seq || []).length) simAdvance(v);
    renderSim();
  }

  // A system with working alerts interrupts once, with the one thing that matters.
  function simShowAlert(side) {
    const layer = document.getElementById('ehr-alert');
    if (!layer || ehr.crashed) return;
    layer.innerHTML = iconize(`
      <div class="after-alert"><div class="after-alert-head">${ic('urgent')} Critical · ${side === 'physician' ? 'tacrolimus 19.4' : 'potassium 6.2'}</div>
        <p>${side === 'physician' ? 'Fluconazole and diltiazem are raising the level. Potassium is 6.2. Nephrology advised holding above 12.' : 'The potassium supplement is blocked. The physician has been paged and an ECG is ordered.'}</p>
        <p class="after-quiet">This is the only interruption. ${Math.max(0, PACKAGES[simDeal().pkg].alertsAfter - 1)} routine reminders are waiting in a quiet list.</p>
        <button class="abtn primary" data-act="simalert">Acknowledge</button></div>`);
    layer.classList.add('show');
  }

  function startSim(side, after) {
    ehrStop();
    ehr.crashed = false;
    ehr.current = null;
    const run = `${side}:${after ? simDeal().pkg : 'before'}:${Date.now()}`;
    Object.assign(sim, { side, after, i: 0, pos: 0, found: false, wrong: [], clicks: 0, done: 0, given: [], misses: [], startedAt: Date.now(), endedAt: 0, run });
    renderSim();
    if (!after) return ehrStart(ALERTS[side], true, CRASH_AT);
    if (coverage(simDeal()).full.has('alerts')) {
      setTimeout(() => S && S.step === 'p6_sim' && sim.run === run && simShowAlert(side), 2500);
    } else {
      // Nothing fixed the alerting, so the storm and the crash happen again.
      ehrStart(ALERTS[side].map((a) => ({ ...a, crit: false })), false, CRASH_AT);
    }
  }

  // The simulation screen. Before the vote it is always the old system; afterwards the frame and every step follow the deal.
  function simScreen(side, after) {
    const deal = after ? simDeal() : null;
    const modern = after && ['b', 'c', 'd'].includes(deal.pkg);
    const mine = !S.isHost && S.you.role === side;
    const cov = after ? coverage(deal) : null;
    const who = after
      ? `Same ten steps, in ${deal.pkg === 'keep' ? 'the unchanged old system' : 'the system your hospital bought'}.`
      : S.isHost ? `The ${side}'s ten steps` : mine ? 'Ten steps. One minute. Follow the "What to do" line on each one.' : `Try the ${side}'s ten steps yourself. As you go: ${esc(ROLES[S.you.role].observe)}`;
    const title = !after
      ? 'MedCore Legacy 9.4.1'
      : deal.pkg === 'keep'
        ? 'MedCore Legacy 9.4.1, no changes'
        : `${PACKAGES[deal.pkg].seller} · ${PACKAGES[deal.pkg].name}${deal.pkg === 'd' && deal.modules.length ? ` + ${deal.modules.length} module${deal.modules.length === 1 ? '' : 's'}` : ''}`;
    const banner = `<b>WHITFIELD, JAMES R</b> · 61 · liver transplant, day 6 · bed 6W-14 · 13:02`;
    return `
      <div class="ehr simwrap">
        <div class="ehr-task">
          <div><b>13:02 on 6 West${after ? ', replayed' : ''}.</b> ${who} <span class="sim-progress" data-simprogress></span></div>
          <div class="ehr-task-timer" data-timer></div>
        </div>
        <div class="${modern ? 'after-window' : 'ehr-window'} simwin">
          ${modern
            ? `<div class="after-head">${esc(title)}<span class="after-score">${cov.full.size} of 15 problems fixed${cov.partial.size ? `, ${cov.partial.size} partly` : ''}</span></div><div class="after-banner">${banner}</div>`
            : `<div class="ehr-titlebar">${esc(title)} · RIVERBEND UNIV HOSP · PRD<span class="ehr-lagtag"> (Not Responding)</span></div>
               <div class="ehr-menu"><span>File</span><span>Edit</span><span>View</span><span>Patient</span><span>Orders</span><span>Tools</span><span>Reports</span><span>Billing</span><span>Quality</span><span>Help</span></div>
               <div class="ehr-banner">${banner} | MRN RUH-4471902 | Attending: Raman, P MD | Allergies/Intolerances: 1 active (see Allergy activity) | Isolation: PROTECTIVE | Sepsis Risk: 0.71 HIGH | In Basket: 140 unread | Outside records: 1 new (Media)${after && cov ? ` | ${cov.full.size} of 15 problems fixed` : ''}</div>`}
          ${after ? `<div class="sim-guide"><b>How to read this:</b> each step shows what it took <span class="g-before">before</span> and the screen you use <span class="g-now">now</span>. Do the step, then check its tag: <span class="sim-tag fresh">NEW</span> fixed, <span class="sim-tag part">PARTLY FIXED</span>, <span class="sim-tag old">UNCHANGED</span> not fixed by your deal.</div>` : ''}
          <div class="sim-body ${modern ? 'modern' : ''}">
            <ol class="sim-steps" data-simsteps></ol>
            <div class="sim-stage" data-simstage></div>
          </div>
          ${modern ? '' : '<div class="ehr-status">Ready | 212 notes | 26 results | 22 orders | 8 consults | Lab interface: RETRYING | CAPS</div>'}
          <div id="ehr-alert" class="ehr-alert"></div>
        </div>
      </div>`;
  }

  // For the reveal: the ten steps and what each one was hiding.
  function stepMap(side, reached) {
    return `<div class="stepmap"><div class="eyebrow">THE TEN ${side.toUpperCase()} STEPS, AND WHAT EACH ONE WAS HIDING</div>${SCRIPT[side]
      .map((st, k) => `<div class="stepmap-row ${k < reached ? 'got' : ''}"><span class="sim-dot">${k < reached ? '✓' : k + 1}</span><span>${esc(st.short)}</span><span class="stepmap-probs">${st.probs.map((id) => `<span class="pchip">${PROBLEM[id].n}. ${esc(PROBLEM[id].label)}</span>`).join('')}</span></div>`)
      .join('')}</div>`;
  }

  // ---------- money and outcomes ----------

  const pkgTitle = (id) => (id === 'keep' ? PACKAGES.keep.name : `PACKAGE ${PACKAGES[id].letter} · ${PACKAGES[id].name}`);
  const byRank = () => [...PROBLEMS].sort((a, b) => S.problems[a.id].rank - S.problems[b.id].rank);
  const inTier = (tier) => byRank().filter((p) => S.problems[p.id].tier === tier.k);
  const isShared = (id) => S.shared.some((s) => s.id === id);
  const termOffered = (t) => !t.gate || isShared(t.gate);

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
    if (d.pkg === 'keep') return '<div class="deal"><div><small>CONTRACT</small><b>$0</b></div><div><small>STATUS QUO</small><b>$4.2M / year</b></div><div><small>GO-LIVE</small><b>never</b></div></div>';
    const c = dealCost(d);
    const pkg = PACKAGES[d.pkg];
    const golive = d.pkg === 'd' && d.terms.includes('march') ? 'March 2028' : pkg.golive;
    return `
      <div class="deal">
        <div class="${c.over ? 'over' : 'under'}"><small>CONTRACT vs ${money(c.cap)} BUDGET</small><b>${money(c.total)}</b></div>
        <div><small>ARRIVES AFTER SIGNING</small><b>+${money(c.after)}</b></div>
        <div><small>GO-LIVE</small><b>${esc(golive)}</b></div>
      </div>`;
  }

  // Costs that were never on the vendor's sheet. They land after signing; a team that published them saw them coming.
  function surprises(d) {
    if (d.pkg === 'keep') return [];
    const pkg = PACKAGES[d.pkg];
    const out = [];
    const known = isShared('fi_after');
    if (pkg.lost + pkg.old > 0) out.push(`${money(pkg.lost)} of lost revenue at go-live${pkg.old ? ` and ${money(pkg.old)} to keep the old system running during the switch` : ''}. ${known ? 'Finance had warned the room.' : 'Finance knew. Nobody asked.'}`);
    if (pkg.lost > RESERVE) out.push(`Lost revenue was above the ${money(RESERVE)} cash reserve, so the hospital borrowed.`);
    if (pkg.hidden) out.push(isShared('it_bhidden') ? `IT warned the room about ${money(pkg.hidden)} of servers and contractors. It was real.` : `${money(pkg.hidden)} of servers and contractors that IT knew about and nobody put on the table.`);
    if (d.pkg === 'c' || d.pkg === 'd') {
      if (!d.terms.includes('medcorefee')) out.push(TERM.medcorefee.missing);
      if (!d.terms.includes('exitfee')) out.push(TERM.exitfee.missing);
    }
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
      (c.over ? bad : lines).unshift(`Contract ${money(c.total)} against a ${money(c.cap)} budget${c.over ? `: ${money(c.total - c.cap)} over. The board made you find it elsewhere.` : `, with ${money(c.after)} more arriving after signing.`}`);
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
        <p class="muted small">${esc(r.who)} · ${g.votes ? `${g.votes} of ${TOTAL_VOTES} votes${r.group === 'clinical' ? ', shared by nurses and physicians' : ''}` : 'no vote, but you set your own prices'}</p>
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
        <p class="muted small">${r.group === 'vendor' ? 'An offer you put on the table appears on every ballot, and your rival sees it too. You cannot take it back.' : 'Only your team sees these. Publishing one puts it on the big screen for everyone. You cannot take it back.'}</p>
      </div>`;
  }

  const VERDICT = { yes: 'SUPPORT', if: 'ONLY IF', no: 'OPPOSE', own: 'YOU SELL IT', rival: 'YOUR RIVAL' };
  function packageLines(key) {
    const st = STANCE[key];
    return `<div class="private plain"><div class="private-head">WHERE YOU STAND ON EACH PACKAGE</div>
      ${PACKAGE_ORDER.map((id) => `<p class="brief-line"><span class="pkg-letter p${id}">${PACKAGES[id].letter}</span><span class="verdict v-${st[id][0]}">${VERDICT[st[id][0]]}</span><span>${st.best === id ? '<b>Your best choice.</b> ' : ''}${esc(st[id][1])}</span></p>`).join('')}
      <p class="muted small">This is a starting position, not an order. You may be persuaded.</p></div>`;
  }

  // ---------- how to play, seat by seat ----------
  function howToPlay() {
    if (S.isHost) {
      const part = (title, items) => `<div class="how-part"><div class="how-head">${title}</div><ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol></div>`;
      return `<div class="howto"><h2>📖 How to host</h2>
        ${part('GETTING STARTED', ['Put this window on the projector.', 'Players open the address shown in the lobby, click <b>JOIN GAME</b>, and type the room code.', 'Each player taps <b>Assign me randomly</b>, or you click <b>RANDOMIZE EVERYONE BY THE SEAT PLAN</b>.', 'Click <b>BEGIN</b> when every seat has someone.'])}
        ${part('DURING THE GAME', ['<b>NEXT</b> moves every screen forward. Players\' screens follow yours.', 'The <b>Facilitator</b> strip under the top bar tells you what to say and do in each part.', '<b>+1 MIN</b> and <b>RESTART TIMER</b> adjust the countdown. <b>BACK</b> returns one part.', 'In "Must fix", drag cards between the three columns as the room decides.', 'In "Replay", click through the ten steps yourself, and use the <b>Screen</b> and <b>System</b> buttons to compare packages.'])}
        ${part('AT THE END', ['Click <b>FEEDBACK (CSV)</b> to download the forms before you close the game.', 'Closing the server ends the game. Nothing is saved.'])}
      </div>`;
    }
    const key = S.you.role;
    const r = ROLES[key];
    const g = GROUPS[r.group];
    const clin = r.group === 'clinical';
    const vendor = r.group === 'vendor';
    const part = (phases, title, items) => `<div class="how-part ${phases.includes(S.phase) ? 'now' : ''}"><div class="how-head">${title}${phases.includes(S.phase) ? ' <span>YOU ARE HERE</span>' : ''}</div><ol>${items.filter(Boolean).map((i) => `<li>${i}</li>`).join('')}</ol></div>`;
    const before = [
      clin
        ? '<b>Phase 1:</b> you use the old system. Read the "What to do" line on each step, then click. Dismiss every alert to keep going. You have one minute and ten steps.'
        : `<b>Phase 1:</b> you watch the ${r.side} screen on your own device. ${esc(r.observe)}`,
      '<b>Phase 2, on your own:</b> tap every problem you hit or saw. A tick appears.',
      vendor
        ? '<b>Phase 2, one list:</b> you may not speak. Your screen shows who starred each problem and which package or module fixes it.'
        : `<b>Phase 2, one list:</b> tap the star on the three problems that matter most to ${g.short.toLowerCase()}.`,
      vendor ? '' : '<b>Phase 2, must fix:</b> if you have a star beside your name, you are your team\'s representative. Drag cards between the three columns, or tap a card and then a column.',
    ];
    const pitch = vendor
      ? ['The hospital presents its list first. Your two cue cards are on your screen.', 'When your package is highlighted you have one minute. Say three problems it fixes, the price and date, and one honest gap.', 'When your rival is pitching, your screen shows a line of attack. Save it for Phase 4.']
      : ['Listen. Questions wait until Phase 4.', 'Each package card shows the price, what is left of the budget, how it switches on, what is not included, and the catch.', ...r.ask.slice(0, 2).map((q) => `Hold this question: ${esc(q)}`)];
    const deal = vendor
      ? ['Under "Only ' + esc(r.plural) + ' know", tap <b>Put on the table</b> beside an offer. It then appears on every ballot and on the big screen. You cannot take it back.', 'Visit the tables. Find out what each group needs before you offer anything.', 'You have no vote. You win when five hospital votes land on one of your packages.']
      : [
        'Under <b>Your position</b>, tap a package.',
        'If you tapped D, tick the modules you want bought.',
        'Tick the contract terms you want. A vendor\'s offer only appears after that vendor puts it on the table, so go and ask.',
        `Watch the <b>YOUR DEAL</b> bar. Anything that pushes the contract over ${money(CAP)} is not bought.`,
        key === 'finance' ? `<b>Only your team can approve the stretch to ${money(STRETCH_CAP)}.</b> A green card on your screen shows who is asking and a checklist. Tick the stretch only if it makes sense.` : '',
        key === 'exec' || clin ? `If your deal is over budget, an amber card appears. Tick <b>Stretch the budget to ${money(STRETCH_CAP)}</b> and go to the finance table with a reason.` : '',
        key === 'exec' ? 'With two minutes left, announce which deals go to the vote. Three at most.' : '',
        'To publish one of your private facts to the whole room, tap <b>Tell the room</b> beside it.',
        `<b>Phase 5:</b> the same ballot becomes your vote. ${g.short} cast ${g.votes === 2 ? '2 votes' : '1 vote'} as a block for whatever most of you choose. A deal needs ${PASS} of ${TOTAL_VOTES}.`,
      ];
    const after = ['The decision appears on every screen.', '<b>Replay:</b> do the same ten steps in the new system. Each step shows BEFORE and NOW, a "What to do" line, and a tag: NEW, PARTLY FIXED, or UNCHANGED.', 'Read what happened to your group, then answer six short questions.'];
    return `<div class="howto"><h2>📖 How to play: ${esc(r.plural)}</h2>
      <p class="how-goal"><b>Your goal:</b> ${esc(r.goal)}</p>
      ${part([0, 1, 2], 'BEFORE THE VENDORS COME IN', before)}
      ${part([3], 'WHEN THE VENDORS PITCH', pitch)}
      ${part([4, 5], 'NEGOTIATION AND VOTE', deal)}
      ${packageLines(key)}
      ${part([6, 7], 'AFTER THE DECISION', after)}
    </div>`;
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
        lines = clin ? ['You have one minute and ten steps. Get as far as you can.', 'Notice everything that gets in your way.'] : [`You watch the ${r.side} screen. Do not help them.`, r.observe];
        break;
      case 'p2_notes':
        lines = vendor ? ['Work alone and in silence.', 'Tick every problem you could sell a fix for.'] : ['Work alone. No talking yet.', 'Tick every problem you hit or saw.', clin ? '' : `Remember your watching task: ${r.observe}`];
        break;
      case 'p2_merge':
        lines = vendor
          ? ['Listen. Vendors may not speak in this phase.', 'Watch which group stars which problem. That is who you sell to.']
          : ['Now talk, as one hospital. Compare what you noticed.', `Star the ${TOP_PICKS} problems that matter most to ${g.short.toLowerCase()}. Each person stars on their own device.`, 'The top of the list shows the problems closest to your must-haves, and why. You may star others.', ...r.raise];
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
        lines = vendor ? ['You pitch your two packages, one minute each. Your rival pitches the other two.', 'Follow the cue card: three fixes, price and date, one honest gap.'] : ['Listen. Questions wait until Phase 4.', ...r.ask.map((q) => `Hold this question: ${q}`)];
        break;
      case 'p4_intra':
        lines = vendor
          ? ['Inside your team: decide which offers to put on the table, and for whom.', 'An offer you publish appears on every ballot. Your rival vendor is planning the same thing.']
          : ['Inside your team only. Do not visit other tables yet.', 'Agree your must-haves, what you will trade, and your red line.', 'Set your position below. It is a straw vote and can change.'];
        break;
      case 'p4_inter':
        lines = vendor
          ? ['Visit every table. Find out who needs what, and what your rival has offered them.', 'Put an offer on the table when it wins you a vote.']
          : [`Go to other tables. A deal needs ${PASS} of ${TOTAL_VOTES} votes.`, 'Publish one of your private facts when it helps your case.', 'Update your position as deals form.'];
        break;
      case 'p5_vote':
        lines = vendor
          ? ['You do not vote. Watch the room.']
          : ['Vote on your own device.', `${g.short} cast${g.votes === 2 ? ' 2 votes' : ' 1 vote'} as a block: the package most of you choose.`, 'Be ready to say your vote and one reason in 30 seconds.'];
        break;
      case 'lobby':
        lines = ['Read your role card below. It is your character for the whole game.', 'Tap "How to play your seat" for a step-by-step guide.', 'Then wait. The facilitator starts the game for everyone.'];
        break;
      case 'p6_decision':
        lines = vendor
          ? ['The hospital has decided. Find out if it chose one of your packages.', 'The CEO will announce it to you. Say out loud whether you accept.']
          : role === 'exec'
            ? ['Your CEO announces the decision to the vendors, out loud.', 'If no deal reached the votes it needed, your group decided. Explain why.', 'Check what the money did not cover. It is listed in red.']
            : ['See which package won, and with how many votes.', 'Check which modules and terms made it in, and which the money did not cover (in red).', 'Listen for the vendors to accept or refuse.'];
        break;
      case 'p6_outcome':
        lines = ['Find your own card. It is the first one, outlined.', 'Green lines are what your group won. Red lines are what it cost you.', 'Be ready to read your card to the room if you are asked.'];
        break;
      case 'p6_reflect':
        lines = ['Answer the six questions on your own.', 'Your answers save as you type. There is no submit button.'];
        break;
      case 'debrief':
        lines = ['Put your device down and join the discussion.', 'The questions are on the big screen.', 'You can still finish your feedback form below.'];
        break;
      case 'reveal_cards':
      case 'reveal_point':
        lines = ['Look at the big screen. There is nothing to click.'];
        break;
      default:
        return '';
    }
    return `<div class="coach"><div class="coach-head">${r.icon} YOUR JOB RIGHT NOW</div><ul>${lines.filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p class="coach-lost">Lost? Tap <b>How to play</b> at the top right for your full guide.</p></div>`;
  }

  // Vendor cue card: the three highest-ranked problems this package fixes, the price, and one honest gap.
  function pitchCue(id) {
    const pkg = PACKAGES[id];
    const cov = coverage({ pkg: id, modules: [] });
    const top = byRank().filter((p) => cov.full.has(p.id)).slice(0, 3);
    const c = dealCost({ pkg: id });
    return `
      <div class="cue p${id}">
        <div class="cue-head"><span class="pkg-letter p${id}">${pkg.letter}</span> ${pkg.name} <small>pitched by ${esc(pkg.seller)}</small></div>
        <ol>
          <li><b>"It fixes</b> ${top.length ? top.map((p) => esc(p.label.toLowerCase())).join(', ') : 'your alert problem'}<b>."</b> <span class="muted small">(the top problems on their list that this package covers)</span></li>
          <li><b>"It costs ${money(pkg.price)}</b>${id === 'd' ? ' for the core, plus the modules you choose' : ''}<b>, and goes live ${esc(pkg.golive)}."</b> <span class="muted small">Your angle: ${esc(pkg.frame.toLowerCase())}. ${esc(pkg.stance)}</span></li>
          <li><b>"What it does not do:</b> ${esc(pkg.leaves)}<b>"</b></li>
        </ol>
        <p class="muted small">Private: ${esc(ROLES[SELLERS[pkg.seller]].brief[id])}</p>
      </div>`;
  }

  const missedBanner = (side) => `
    <div class="missed">
      <div class="eyebrow dark">${side === 'physician' ? 'ON THE PHYSICIAN SCREEN' : 'ON THE NURSE SCREEN'}</div>
      <div class="missed-row">${SIM[side].missed}</div>
      <div class="small">Advisory #${critNumber(side)} of ${ALERTS[side].length} in under a minute. It looked exactly like "${SIM[side].lookalike}."</div>
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
      <h3>Price against the budget</h3><div data-dyn="costs"></div>
      <h3>Which problems each package fixes</h3><div data-dyn="matrix"></div>
    </details>`;

  // ---------- facilitator procedure: what to say and do in every part ----------
  const PROCEDURE = {
    lobby: ['Share the address and the room code.', 'Wait for seats to fill, or press Randomize.', 'Press Begin when every group has someone.'],
    p1_intro: ['Read the two tasks aloud.', 'Remind the room: no talking.', 'Press Start the simulation.'],
    p1_ehr: ['Say nothing. Let the alerts build.', 'The system crashes at 54 seconds and the screen moves on by itself.'],
    p2_notes: ['Read out the two alerts that were missed.', 'Everyone ticks problems alone, in silence.', 'Press Next at zero.'],
    p2_merge: ['Ask the room: "What stopped you from doing your job?"', 'Each person stars 3 problems for their group.', 'Vendors listen and do not speak.'],
    p2_top3: ['Ask what belongs in Must fix.', 'Drag cards between columns as the room decides.', 'Confirm the spokesperson, then press Next.'],
    p3_hospital: ['Invite the spokesperson to present for two minutes.', 'Vendors stay silent and prepare.', 'Press Next to start the pitches.'],
    p3_pitch: ['MedCore pitches A then B. Northwind pitches C then D. One minute each.', 'Call time when the pitch timer reaches zero.', 'Hold all questions for Phase 4.'],
    p4_intra: ['Teams stay at their own tables.', 'Each person sets a position on their device.', 'Remind teams that they hold private facts.'],
    p4_inter: ['Send people to other tables. Vendors visit everyone.', 'Watch the board: a deal needs 5 of 7 votes.', 'With two minutes left, ask the executives to announce the ballot.'],
    p5_vote: ['Call each group for its vote and one reason.', 'Wait for the count to finish.', 'Press Next to reveal the result.'],
    p6_decision: ['Ask the CEO to announce the decision to the vendors.', 'Ask the vendors: accept or refuse?', 'Press Next for the replay.'],
    p6_sim: ['Players redo the same ten steps in the new system on their own devices.', 'Click through the steps on this screen for the room.', 'Use the System buttons to compare with what was not bought.'],
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
              <p class="muted small">Seat plan: executives 3 to 5, finance 3 to 5, clinical 8 to 12, IT 3 to 5, compliance 3 to 4, patients 2 to 4, and two competing vendors with 2 to 3 each.</p>
            </div>`;
        }
        return `
          <div class="center narrow">
            <h1>Welcome, ${esc(displayName())}</h1>
            ${coach()}
            <div class="eyebrow">YOUR SEAT: ${me.name}</div>
            ${roleCard(S.you.role)}
            <p><button class="btn primary" data-act="howto">📖 How to play your seat, step by step</button></p>
            <p class="muted">Your role card is one tap away at any time: press your name at the top right.</p>
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
              <p class="muted">No talking. One minute, ten steps. The alerts start almost at once.</p>
            </div>`;
        }
        return `
          <div class="center narrow reveal">
            ${bigTimer(true)}
            <h1 class="huge">BEFORE YOU FIX IT, USE IT.</h1>
            ${coach()}
            <div class="taskcard"><div class="eyebrow">${S.you.role === mySide() ? 'YOUR TASK' : `THE ${mySide().toUpperCase()}'S TASK`}</div><p class="lead">${SIM[mySide()].brief}</p></div>
            <p class="muted">One minute. Ten steps. No talking.</p>
          </div>`;

      case 'p1_ehr':
        if (!host) return simScreen(mySide(), false);
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
            ${stepMap(mySide(), (S.you.ehr && S.you.ehr.steps) || 0)}
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
            ${vendor ? `<h2>Your two pitch cards</h2>${PACKAGE_ORDER.filter((id) => SELLERS[PACKAGES[id].seller] === S.you.role).map(pitchCue).join('')}<p class="muted">${esc(ROLES[S.you.role === 'medcore' ? 'northwind' : 'medcore'].plural)} pitches the other two. You are competing for the same contract.</p>` : ''}
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
              <h1>${money(CAP)} budget. Four packages. ${PASS} votes needed.</h1>
              ${stepList([
                'Stay <b>inside your own team</b> for these eight minutes.',
                'Read your private brief. Agree your <b>must-haves</b>, what you can <b>trade</b>, and your <b>red line</b>.',
                'Each person sets a position on their own device. It can change later.',
              ])}
              <div data-dyn="count:straw"></div>
              <div class="split"><div><div class="eyebrow">PRICE AGAINST THE BUDGET</div><div data-dyn="costs"></div></div><div><div class="eyebrow">MODULE MENU · PACKAGE D</div><div data-dyn="menu"></div></div></div>
              <div data-dyn="shared"></div>
            </div>`;
        }
        return `
          <div class="center narrow">
            ${bigTimer(true)}
            <h1>TEAM HUDDLE: ${GROUPS[me.group].short.toUpperCase()}</h1>
            ${coach()}
            <div data-dyn="stretchcue"></div>
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
            ${host ? '' : '<div data-dyn="stretchcue"></div>'}
            <div data-dyn="strawboard"></div>
            <div data-dyn="shared"></div>
            ${host ? '<div class="split"><div><div class="eyebrow">PRICE AGAINST THE BUDGET</div><div data-dyn="costs"></div></div><div><div class="eyebrow">MODULE MENU · PACKAGE D</div><div data-dyn="menu"></div></div></div>' : `
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
                   `Modules are bought in order of support <b>until the ${money(CAP)} budget runs out</b>.`,
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
            ${host ? '' : coach()}
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
              ${d.droppedTerms && d.droppedTerms.length ? `<p class="dropped">Wanted, but over budget without finance's signature: ${d.droppedTerms.map((id) => esc(TERM[id].label)).join(' · ')}</p>` : ''}
            </div>
            ${dealBox(d)}
            <p class="lead">🤝 CEO: announce the decision to the vendor. ${d.pkg === 'keep' ? '' : 'Vendors: accept, or refuse.'}</p>
            <div data-dyn="finalboard"></div>
          </div>`;
      }

      case 'p6_sim': {
        if (!host) return simScreen(mySide(), true);
        return `
          <div class="center wide">
            <div class="timeline"><h1>ONE YEAR LATER, 13:02 ON 6 WEST</h1>${bigTimer()}</div>
            <p class="muted">Everyone is redoing the same ten steps in the new system on their own device. This is the same screen, for the room.</p>
            <div data-dyn="simswitch"></div>
            <div data-dyn="hostsim"></div>
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
            ${host ? '' : coach()}
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
            ${shock.length ? `<div class="shock"><div class="eyebrow bad">WHAT ARRIVED AFTER SIGNING</div>${shock.map((x) => `<p>－ ${esc(x)}</p>`).join('')}</div>` : ''}
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
            ${host ? '' : coach()}
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
            ${S.isHost ? '' : coach()}
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
            ${S.isHost ? '' : coach()}
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
        ${compact ? '<h2>Your feedback</h2>' : `${bigTimer(true)}<h1>FEEDBACK FORM</h1>${coach()}`}
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
          <button class="chip howbtn" data-act="howto" title="How to play">📖 <span>How to play</span></button>
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

  const SEATS = { exec: '3 to 5', finance: '3 to 5', physician: '4 to 6', nurse: '4 to 6', it: '3 to 5', compliance: '3 to 4', patients: '2 to 4', medcore: '2 to 3', northwind: '2 to 3' };
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
        ${d.droppedTerms && d.droppedTerms.length ? `<p class="dropped">Over budget, so not bought: ${d.droppedTerms.map((id) => esc(TERM[id].label)).join(' · ')}. Only a stretch signed by finance changes this.</p>` : ''}
        ${d.pkg === 'keep' ? '' : `<p class="${c.over ? 'overline' : 'underline'}">Contract <b>${money(c.total)}</b> against a ${money(c.cap)} budget: ${c.over ? `${money(c.total - c.cap)} OVER` : `${money(c.cap - c.total)} to spare`}</p>`}
      </div>`;
  }

  // Package cards. None is highlighted by default; a card lifts when you hover or focus it.
  function pkgCards(current) {
    const critical = inTier(TIERS[0]);
    const card = (id) => {
      const pkg = PACKAGES[id];
      const cov = coverage({ pkg: id, modules: [] });
      const c = dealCost({ pkg: id });
      const missed = critical.filter((p) => !cov.full.has(p.id));
      const risky = /one day/i.test(pkg.style);
      return `
        <div class="pkg p${id}" tabindex="0">
          ${current === id ? '<div class="pitch-tag">NOW PITCHING</div>' : ''}
          <div class="pkg-head"><span class="pkg-letter p${id}">${pkg.letter}</span><span>${pkg.icon} ${pkg.name}</span></div>
          <p class="pkg-frame">${esc(pkg.frame)}</p>
          <p class="pkg-tag">${esc(pkg.stance)}</p>
          <div class="pkg-stats">
            <div><small>PRICE</small><b>${money(pkg.price)}${id === 'd' ? '+' : ''}</b></div>
            <div><small>LEFT OF ${money(CAP)}</small><b>${money(CAP - c.total)}</b></div>
            <div><small>GO-LIVE</small><b>${pkg.months} mo</b></div>
          </div>
          <p class="pkg-switch ${risky ? 'risky' : ''}"><b>How it switches on:</b> ${esc(pkg.style.toLowerCase())}, with ${esc(pkg.training)} of training</p>
          <p class="pkg-fix"><b>${cov.full.size} of 15</b> problems fixed${cov.partial.size ? `, ${cov.partial.size} partly` : ''}${id === 'd' ? ' (more with modules)' : ''}</p>
          <ul class="pkg-features">${pkg.includes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          <p class="pkg-out"><b>Not included:</b> ${esc(pkg.leaves)}</p>
          <p class="pkg-catch"><b>The catch:</b> ${esc(pkg.catchline)}</p>
          <p class="pkg-meta">${esc(pkg.golive)} · ${esc(pkg.hosting)} · old records: ${esc(pkg.records.toLowerCase())}</p>
          ${missed.length ? `<p class="pkg-miss">Must-fix left open: ${missed.map((p) => esc(p.label)).join(', ')}</p>` : '<p class="pkg-hit">Covers every must-fix problem.</p>'}
        </div>`;
    };
    // Two rival vendors, each with its own pair of packages. The groups sit side by side on wide screens and stack on narrow ones.
    const group = (seller, icon, line, cls) =>
      `<div class="vendorgroup"><div class="vendorhead ${cls}">${icon} ${seller.toUpperCase()} <small>${line}</small></div>${PACKAGE_ORDER.filter((id) => PACKAGES[id].seller === seller).map(card).join('')}</div>`;
    return `<div class="pkgs">${group('MedCore', '⏳', 'the incumbent: the vendor you have today', '')}${group('Northwind', '⚡', 'the challenger: wants to replace them', 'rival')}</div>`;
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
        ? '<h1>Ten steps. One minute.</h1><p class="lead">A level to find. A dose to give. A chart to close.</p>'
        : t < CRASH_AT
          ? '<h1 class="storm">ALERT STORM</h1><p class="lead">The lab interface is resending results. Every rule is re-firing on all 22 orders.</p>'
          : '<h1 class="storm">SYSTEM DOWN</h1><p class="lead">The application server ran out of memory. Every workstation on 6 West just froze.</p>';
      setHtml(el, `${phase}<div class="counter"><b>${total}</b><span>alerts dismissed by the hospital so far</span></div>`);
    },

    ehrstats(el) {
      const { physician, nurse } = S.ehr;
      const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
      const parts = [];
      const stat = (n, text) => parts.push(`<div class="stat"><b>${n}</b><span>${text}</span></div>`);
      const total = physician.dismissed + nurse.dismissed;
      if (total) stat(total, 'alerts dismissed by the hospital in under a minute');
      if (physician.players) stat(`${physician.stepsAvg} of 10`, 'steps the average physician screen finished before the crash');
      if (nurse.players) stat(`${nurse.stepsAvg} of 10`, 'steps the average nurse screen finished before the crash');
      if (physician.critSeen) stat(secs(physician.critMedianMs), 'median time the tacrolimus interaction warning stayed on screen');
      if (nurse.critSeen) stat(secs(nurse.critMedianMs), 'median time the potassium alert stayed on screen');
      if (nurse.players) stat(nurse.gaveSupp, 'gave a potassium supplement at a potassium of 6.2');
      const mine = [];
      const e = !S.isHost && S.you.ehr;
      if (e) mine.push(`You finished <b class="accent">${e.steps || 0} of 10</b> steps and dismissed <b class="accent">${e.n}</b> alerts.`);
      if (e && typeof e.critMs === 'number') mine.push(`You dismissed the one that mattered after <b class="accent">${secs(e.critMs)}</b>.`);
      if (e && e.given.includes('supp')) mine.push('You gave the <b class="red">potassium supplement</b>. His potassium was 6.2, and nothing on the screen stopped you.');
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

    // Star the three problems that matter most to your group. The ones closest to this seat's
    // must-haves are listed first with the reason, so the choice is informed, but it stays the player's own.
    intra(el) {
      const role = S.you.role;
      const size = S.roleCounts[role];
      const mine = new Set(S.you.top);
      const full = mine.size >= TOP_PICKS;
      const cares = CARES[role] || [];
      const why = Object.fromEntries(cares);
      const row = (p) => {
        const b = S.problems[p.id];
        const seen = b.reportsByRole[role] || 0;
        const on = mine.has(p.id);
        const detail = why[p.id]
          ? `<small class="care-why">${esc(why[p.id])}</small>`
          : `<small>${esc(p.desc)}</small>`;
        return `
          <button class="prow star ${on ? 'on' : ''} ${why[p.id] ? 'care' : ''}" data-act="top" data-id="${p.id}" ${!on && full ? 'disabled' : ''}>
            <span class="prow-check">${on ? '★' : '☆'}</span>
            <span><b>${p.n}. ${esc(p.label)}</b>${detail}<small>${seen ? `Logged by ${seen} of ${size} ${ROLES[role].plural.toLowerCase()}` : `No ${ROLES[role].short.toLowerCase()} logged this`} · ${b.reports} across the hospital</small></span>
            <span class="prow-cat">${b.top ? `★ ${b.top}` : ''}</span>
          </button>`;
      };
      const careIds = cares.map(([id]) => id);
      const first = careIds.map((id) => PROBLEM[id]);
      const rest = PROBLEMS.filter((p) => !careIds.includes(p.id)).sort(
        (x, y) => (S.problems[y.id].reportsByRole[role] || 0) - (S.problems[x.id].reportsByRole[role] || 0) || x.n - y.n
      );
      const suggested = careIds.every((id) => mine.has(id)) && mine.size === careIds.length;
      setHtml(
        el,
        `<p class="muted small">${mine.size} of ${TOP_PICKS} stars used. This is your own choice, made on your own device.</p>
         <div class="care-head"><span>CLOSEST TO YOUR SEAT'S MUST-HAVES</span>${first.length ? `<button class="btn sm" data-act="topsuggest" ${suggested ? 'disabled' : ''}>${suggested ? 'Starred' : 'Star these three'}</button>` : ''}</div>
         <div class="probs">${first.map(row).join('')}</div>
         <div class="care-head rest"><span>EVERYTHING ELSE YOU CAN STAR</span></div>
         <div class="probs">${rest.map(row).join('')}</div>`
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
      const pkg = PACKAGES[id];
      const mine = SELLERS[pkg.seller] === S.you.role;
      setHtml(
        el,
        mine
          ? `<div class="eyebrow">YOUR CUE CARD: YOU HAVE THE FLOOR</div>${pitchCue(id)}`
          : `<div class="cue p${id}"><div class="cue-head"><span class="pkg-letter p${id}">${pkg.letter}</span> Your rival, ${esc(pkg.seller)}, is pitching</div><p>${esc(ROLES[S.you.role].brief[id])}</p><p class="muted small">Listen for what they leave out. You cannot interrupt. Use it in Phase 4.</p></div>`
      );
    },

    menu(el) {
      setHtml(
        el,
        `<table class="gtable"><tr><th>Module</th><th>Price</th><th>What it solves</th><th>Wanted by</th></tr>
          ${MODULES.map((m) => `<tr><td>${m.icon} <b>${esc(m.label)}</b></td><td class="num">${money(m.price)}</td><td>${esc(m.solves)}</td><td>${ROLES[m.role].icon} ${ROLES[m.role].plural}</td></tr>`).join('')}
          <tr class="total"><td>All eight</td><td class="num">${money(MODULES.reduce((s, m) => s + m.price, 0))}</td><td colspan="2">Package D leaves ${money(CAP - dealCost({ pkg: 'd' }).total)} of the budget for modules.</td></tr>
        </table>`
      );
    },

    // Price against the cap. The costs that arrive after signing appear only once finance or IT publishes them.
    costs(el) {
      const showAfter = isShared('fi_after');
      const showB = isShared('it_bhidden');
      const row = (id) => {
        const pkg = PACKAGES[id];
        const c = dealCost({ pkg: id });
        const after = showAfter ? pkg.lost + pkg.old + (showB && pkg.hidden ? pkg.hidden : 0) : showB && pkg.hidden ? pkg.hidden : 0;
        return `<tr><td><span class="pkg-letter p${id}">${pkg.letter}</span> ${pkg.name}${id === 'd' ? ', before modules' : ''}</td><td>${esc(pkg.seller)}: ${esc(pkg.frame.toLowerCase())}</td><td class="num"><b>${money(c.total)}</b></td><td class="num good">${money(CAP - c.total)}</td>
          ${showAfter || showB ? `<td class="num ${after ? 'bad' : ''}">${after ? `+${money(after)}` : ''}</td>` : ''}</tr>`;
      };
      setHtml(
        el,
        `<table class="gtable"><tr><th>Package</th><th>Vendor and pitch</th><th>Price</th><th>Left of ${money(CAP)}</th>${showAfter || showB ? '<th>After signing</th>' : ''}</tr>
          ${PACKAGE_ORDER.map(row).join('')}</table>
         <p class="muted small">$ millions, five-year totals. ${showAfter ? `After signing: lost revenue at go-live and running the old system during the switch. The cash reserve covers ${money(RESERVE)} of lost revenue.` : 'Prices are what is on the vendor\'s sheet.'}</p>`
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
        const c = dealCost({ pkg: id });
        return `
          <button class="pkgbtn p${id} ${mine.pkg === id ? 'on' : ''}" data-act="pkg" data-kind="${kind}" data-pkg="${id}">
            <span class="pkg-letter p${id}">${pkg.letter}</span>
            <span class="pkgbtn-name">${pkg.icon} ${pkg.name}<small>${id === 'keep' ? 'Sign nothing. The old EHR costs $4.2M a year.' : `${money(c.total)}${id === 'd' ? ' + modules' : ''} · ${pkg.frame} · ${pkg.golive}`}</small></span>
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
        const c = dealCost(mine);
        sum = `<div class="mydeal ${c.over ? 'over' : 'under'}">YOUR DEAL: <b>${money(c.total)}</b> against a ${money(c.cap)} budget · ${c.over ? `${money(c.total - c.cap)} OVER` : `${money(c.cap - c.total)} to spare`}</div>`;
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

    // Projector controls for the replay: which screen, and which system (the room's choice is starred).
    simswitch(el) {
      const chosen = S.decision.pkg;
      const cur = hostSim.pkg || chosen;
      const side = (k, label) => `<button class="btn sm ${hostSim.side === k ? 'primary' : ''}" data-act="simside" data-v="${k}">${label}</button>`;
      const pk = (id) => `<button class="btn sm ${cur === id ? 'primary' : ''}" data-act="simpkg" data-v="${id}">${id === 'keep' ? 'No deal' : `${PACKAGES[id].letter} · ${PACKAGES[id].name}`}${id === chosen ? ' ★' : ''}</button>`;
      setHtml(
        el,
        `<div class="simswitch"><span class="eyebrow">SCREEN</span>${side('physician', 'Physician')}${side('nurse', 'Nurse')}
           <span class="eyebrow">SYSTEM</span>${BALLOT_ORDER.map(pk).join('')}</div>
         <p class="muted small">★ is what the room bought. The other buttons show the same minute under each alternative${chosen === 'd' ? '' : ' (Package D is shown without modules)'}.</p>`
      );
    },
    hostsim(el) {
      const key = `${hostSim.side}:${hostSim.pkg || S.decision.pkg}`;
      if (el._key === key) return;
      el._key = key;
      el.innerHTML = iconize(simScreen(hostSim.side, true));
      startSim(hostSim.side, true);
    },

    // Executives and clinicians are prompted to ask finance to stretch the budget.
    // Finance is prompted to agree only when the request stands up.
    stretchcue(el) {
      const group = S.you.group;
      if (!['exec', 'clinical', 'finance'].includes(group)) return setHtml(el, '');
      const d = S.straw;
      const t = d.tally;
      const backers = t.termGroups.stretch || [];
      const financeIn = backers.includes('finance');
      const leftOut = d.empty ? [] : [...(d.droppedTerms || []).map((id) => TERM[id].label), ...d.dropped.map((id) => MODULE[id].label)];
      const status = `<p class="cue-status ${financeIn ? 'yes' : 'no'}">${financeIn ? '✅ Finance is currently agreeing to the stretch.' : '❌ Finance has not agreed to a stretch.'}</p>`;
      if (group !== 'finance') {
        const pitch = group === 'exec'
          ? 'Offer finance something back: a vendor penalty clause, a refund, a credit, or a waived fee.'
          : S.you.role === 'nurse'
            ? 'Bring a number: three nurses have left 6 West, and each costs $60,000 to replace.'
            : 'Bring a number: every physician loses about 2 hours a night to the EHR, and 96% of alerts are overridden.';
        return setHtml(
          el,
          `<div class="cuecard ask"><div class="cuecard-head">💰 YOUR CUE: ASK FINANCE TO STRETCH THE BUDGET</div>
             <p>${leftOut.length ? `The room wants more than ${money(CAP)} buys. <b>Left out for lack of money: ${leftOut.map(esc).join(', ')}.</b>` : `If what you need does not fit in ${money(CAP)}, the board allows ${money(STRETCH_CAP)}, but only if finance signs for it.`}</p>
             <ol><li>Tick <b>"Stretch the budget to ${money(STRETCH_CAP)}"</b> on your ballot. That is your request.</li><li>Go to the finance table and say exactly what the extra money buys.</li><li>${pitch}</li></ol>
             ${status}</div>`
        );
      }
      const askers = backers.filter((g) => g !== 'finance').map((g) => GROUPS[g].short);
      const pkg = d.empty ? null : PACKAGES[d.pkg];
      const want = d.empty ? null : dealCost({ pkg: d.pkg, modules: [...d.modules, ...d.dropped], terms: [...d.terms, ...(d.droppedTerms || [])].filter((id) => id !== 'stretch') });
      const extra = want ? want.total - CAP : 0;
      const gives = d.empty ? [] : d.terms.filter((id) => ['penalty', 'penaltyb', 'refund', 'exitfee', 'credit', 'medcorefee'].includes(id));
      const check = (ok, text) => `<li class="${ok ? 'yes' : 'no'}">${ok ? '✅' : '❌'} ${text}</li>`;
      setHtml(
        el,
        `<div class="cuecard grant"><div class="cuecard-head">💰 YOUR CUE: STRETCH THE BUDGET ONLY IF IT MAKES SENSE</div>
           <p>${askers.length ? `<b>${askers.join(' and ')}</b> ${askers.length === 1 ? 'is' : 'are'} asking you to raise the budget from ${money(CAP)} to ${money(STRETCH_CAP)}.` : 'Nobody has asked you to stretch the budget yet. Executives and clinicians have been told they can.'}</p>
           ${d.empty ? '<p class="muted">The room has no position yet.</p>' : `<ul class="cue-checks">
             ${check(extra > 0, extra > 0 ? `The stretch buys something real: the room's deal is ${money(extra)} over budget${leftOut.length ? ` for ${leftOut.map(esc).join(', ')}` : ''}.` : `Everything the room wants already fits in ${money(CAP)}. A stretch would buy nothing.`)}
             ${check(pkg.lost <= RESERVE, `Lost revenue at go-live (${money(pkg.lost)}) is ${pkg.lost <= RESERVE ? 'within' : 'above'} your ${money(RESERVE)} reserve.`)}
             ${check(gives.length > 0, gives.length ? `The vendor has given something back: ${gives.map((id) => esc(TERM[id].label)).join('; ')}.` : 'The vendor has given nothing back yet. Ask for a penalty clause, a refund, a credit, or a waived fee.')}
             ${check(want.after <= 10, `Another ${money(want.after)} arrives after signing that is not in the contract.`)}
           </ul>`}
           <p>Doing nothing costs about $4.2M a year. A fix that prevents that can pay for itself.</p>
           <p><b>To accept:</b> tick "Stretch the budget to ${money(STRETCH_CAP)}" on your ballot. It counts only if at least half of finance ticks it. <b>To refuse:</b> leave it unticked and tell them what would change your mind.</p>
           ${status}</div>`
      );
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
      hostSim.pkg = null;
      const body = needsRole
        ? `<div class="center">
             <h1>Choose your seat, ${esc(S.you.name)}</h1>
             <p class="muted">Seven groups. Nurses and physicians are two tables of one group. MedCore and Northwind are rival vendors.</p>
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
        if (S.step === 'p1_ehr') startSim(side, false);
        if (S.step === 'p6_sim') startSim(side, true);
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
      case 'simrow':
        return simClick('row', Number(el.dataset.i));
      case 'simnext':
        return simClick('next');
      case 'simalert': {
        const layer = document.getElementById('ehr-alert');
        if (layer) layer.classList.remove('show');
        sim.clicks++;
        return renderSim();
      }
      case 'simside':
        hostSim.side = el.dataset.v;
        return render();
      case 'simpkg':
        hostSim.pkg = el.dataset.v;
        return render();
      case 'report':
        S.you.report.problems = toggle(S.you.report.problems, el.dataset.id);
        render();
        return sendReport();
      case 'topsuggest':
        S.you.top = (CARES[S.you.role] || []).map(([id]) => id).slice(0, TOP_PICKS);
        render();
        return act('top', { problems: S.you.top });
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
      case 'howto': {
        const old = document.querySelector('.modal');
        if (old) old.remove();
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.dataset.act = 'closemodal';
        modal.innerHTML = iconize(`<div class="modal-box wide">${howToPlay()}<button class="btn" data-act="closemodal">Close</button></div>`);
        document.body.appendChild(modal);
        return;
      }
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
