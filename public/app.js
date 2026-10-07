(() => {
  'use strict';

  const C = window.CONTENT;
  const { GROUPS, VOTING_GROUPS, ROLE_ORDER, ROLES, GROUP_BRIEF, PROBLEMS, BUDGET, PACKAGE_ORDER, PACKAGES, COMBOS, FINANCE_ASKS } = C;
  const { QUIZ, QUIZ_SECONDS, QUIZ_ANSWER_SECONDS, RANK_PICKS, HAPPY_ENDING, SIM } = C;
  const PROBLEM = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));
  const CLUE = Object.fromEntries(SIM.CLUES.map((c) => [c.id, c]));
  const QUIZ_PROBLEMS = new Set(QUIZ.flatMap((q) => q.problems));

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
    1: 'SIMULATION AND CRASH', 2: 'DID YOU SPOT IT?', 3: 'STAKEHOLDER DISCUSSION',
    4: 'HANDSHAKE AND PITCH FEST', 5: 'DISCUSSION, VOTING AND DECISION', 6: 'OUTCOME',
  };
  const STEP_TITLES = {
    p1_intro: 'Read your brief', p1_sim: 'Bed 14', p2_quiz: 'Quiz', p2_rank: 'Top five',
    p3_discuss: 'Discussion', p4_handshake: 'Handshake', p4_pitch: 'Pitch fest',
    p5_framing: 'Finance framing', p5_intra: 'Team discussion', p5_inter: 'All-team discussion',
    p5_vote: 'Voting', p5_decision: 'Decision', p6_replay: 'The replay', p6_wrap: 'Next cycle',
  };

  // ---------- state and helpers ----------

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (m) => `$${m}M`;
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

  // A small renderer for the brief set's markdown: headings, tables, lists, bold and paragraphs.
  function md(src) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim());
    const isList = (l) => /^(- |\d+\. )/.test(l);
    const lines = src.split('\n');
    let html = '';
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (line.startsWith('# ')) { html += `<h2>${inline(line.slice(2))}</h2>`; i++; continue; }
      if (line.startsWith('## ')) { html += `<h3>${inline(line.slice(3))}</h3>`; i++; continue; }
      if (line.startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
        const [head, , ...body] = rows;
        html += `<table><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`;
        continue;
      }
      if (isList(line)) {
        const tag = /^\d/.test(line) ? 'ol' : 'ul';
        const items = [];
        while (i < lines.length && isList(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
        html += `<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`;
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\|)/.test(lines[i]) && !isList(lines[i])) para.push(lines[i++]);
      html += `<p>${inline(para.join(' '))}</p>`;
    }
    return html;
  }

  // Briefs arrive from the server: a player gets only their own (and their group's); the facilitator gets all.
  const briefs = { key: null, briefs: {}, phases: [], catches: {}, loading: false };
  function loadBriefs() {
    const key = session ? (session.hostKey ? 'host' : `${session.id}:${S && S.you ? S.you.role : ''}`) : null;
    if (!key || key === briefs.key || briefs.loading) return;
    if (!session.hostKey && !(S && S.you && S.you.role)) return;
    briefs.loading = true;
    const who = session.hostKey ? { hostKey: session.hostKey } : { id: session.id };
    api('/api/briefs', { code: session.code, ...who })
      .then((res) => {
        Object.assign(briefs, { key, briefs: res.briefs || {}, phases: res.phases || [], catches: res.catches || {} });
        screenKey = null; // redraw the screen with the brief in it
        render();
      })
      .catch(() => {})
      .finally(() => { briefs.loading = false; });
  }
  const BRIEFS = new Proxy({}, { get: (_, role) => briefs.briefs[role] });

  // One "## Heading" section of a brief, as markdown.
  function briefSection(role, heading) {
    const src = BRIEFS[role] || '';
    const start = src.indexOf(`## ${heading}`);
    if (start < 0) return '';
    const rest = src.slice(start + heading.length + 3);
    const end = rest.indexOf('\n## ');
    return end < 0 ? rest : rest.slice(0, end);
  }

  const briefHtml = (role) => (BRIEFS[role] ? `<div class="brief">${md(BRIEFS[role])}</div>` : '<p class="muted">Loading your brief…</p>');
  // Physicians and nurses also hold the clinical end users' brief once leadership gets involved.
  function myBriefs(withGroup) {
    const role = S.you.role;
    const group = withGroup && GROUP_BRIEF[role];
    return briefHtml(role) + (group ? `<details class="recall"><summary>Your group's brief: ${esc(GROUPS[3].name)}</summary>${briefHtml(group)}</details>` : '');
  }

  const choiceTitle = (key) => C.choiceLetters(key).map((l) => `${l}. ${PACKAGES[l].name}`).join(' + ');
  const choiceShort = (key) => C.choiceLetters(key).join(' + ');
  const problemChip = (id, cls) => `<span class="pchip ${cls || ''}">${id} · ${esc(PROBLEM[id].label)}</span>`;
  const mySimSide = () => ROLES[S.you.role].sim;
  const myGroup = () => ROLES[S.you.role].group;
  const isVoter = () => VOTING_GROUPS.includes(myGroup());
  const displayName = () => (S.you.role === 'physician' ? `Dr. ${S.you.name}` : S.you.name);

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
    es.addEventListener('gone', () => leave('That game is no longer running.'));
    es.onerror = () => setOnline(false);
  }

  function setOnline(value) {
    online = value;
    document.body.classList.toggle('offline', !online);
  }

  function leave(message) {
    if (es) es.close();
    es = null;
    if (session && session.hostKey) store.del(localStorage, 'b14_host');
    store.del(sessionStorage, 'b14_session');
    session = null;
    S = null;
    screenKey = null;
    briefs.key = null;
    simStop();
    homeView = 'home';
    homeError = message || '';
    setOnline(true);
    renderHome();
  }

  function startSession(next) {
    session = next;
    store.set(sessionStorage, 'b14_session', session);
    if (session.hostKey) store.set(localStorage, 'b14_host', session);
    connect();
  }

  // ---------- home ----------

  function renderHome() {
    document.body.className = 'home';
    const savedHost = store.get(localStorage, 'b14_host');
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
        <div class="home-title"><span class="home-icon">🏥</span> BED 14</div>
        <svg class="ecg" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="0,30 120,30 140,30 155,10 170,50 185,2 200,58 215,30 240,30 360,30 380,30 395,10 410,50 425,2 440,58 455,30 480,30 600,30"/>
        </svg>
        <p class="home-lead"><b>Riverbend University Hospital, September 29, 12:45.</b></p>
        <p class="home-copy">James Whitfield is six days past a liver transplant, and every clue about what is going wrong sits on a different screen.</p>
        <p class="home-lead">Live the EHR overload, name what broke, then choose and fund the fix.</p>
        <p class="home-copy small">CIS 7000 · Health Tech · Fictional teaching case, not for clinical use</p>
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
    if (S.paused) return S.pausedMs;
    return Math.max(0, S.timerEnd - (Date.now() + clockOffset));
  }
  // Seconds since the current step started.
  function stepElapsed() {
    const ms = remainingMs();
    return ms === null ? 0 : (S.timerTotal || 0) - ms / 1000;
  }

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
    if (S) {
      const left = (ms || 0) / 1000 + S.sessionAfter;
      const total = Math.round(S.sessionTotal / 60);
      const label = `Session ${clock(left * 1000)} left · total ${total} min${S.overtime ? ' · over time' : ''}${S.paused ? ' · PAUSED' : ''}`;
      document.querySelectorAll('[data-session]').forEach((el) => { el.textContent = label; el.classList.toggle('over', !!S.overtime); });
      substepTick();
      pitchTick();
    }
    if (S && S.step === 'p1_sim') {
      const time = SIM.clockAt(stepElapsed());
      document.querySelectorAll('[data-simclock]').forEach((el) => { el.textContent = time; });
    }
    simTick();
    quizTick();
  }
  setInterval(tick, 250);

  // ---------- Phase 1: the bed 14 chart ----------

  // Both teams open the same patient. Each tab is one screen; every clue sits on a different one.
  const sim = { active: false, side: null, conf: null, next: 0, queue: [], current: null, shownAt: 0, gapUntil: 0, tab: 'summary', notesTab: 'progress', open: {}, fax: 1, tx: 0, labs: false, faxIn: false, down: false, msgSig: null, msgCount: -1, repliedAt: {}, flowVals: {}, assessDone: new Set(), chart: null, saveTimer: null };

  function simStart(side) {
    const conf = SIM.SIDES[side];
    const saved = (S.you.sim && S.you.sim.chart) || {};
    const chart = {
      alerts: { ...saved.alerts }, pages: { ...saved.pages }, clues: [...(saved.clues || [])],
      decisions: JSON.parse(JSON.stringify(saved.decisions || {})), notes: saved.notes || '',
      mar: { ...saved.mar }, flow: [...(saved.flow || [])], assess: saved.assess || 0, overrides: saved.overrides || 0,
      findings: [...(saved.findings || [])],
    };
    Object.assign(sim, {
      active: true, side, conf, queue: [], current: null, gapUntil: 0, tab: conf.tabs[0][0], notesTab: 'progress', open: {}, fax: 1, tx: 0,
      labs: false, faxIn: false, down: false, msgSig: null, msgCount: -1, repliedAt: {}, flowVals: {},
      assessDone: new Set(conf.assessments ? conf.assessments.slice(0, chart.assess) : []), chart,
    });
    // After a mid-round reload, skip interruptions that already fired.
    const elapsed = stepElapsed();
    sim.next = conf.alerts.findIndex((a) => a.t > elapsed - 1);
    if (sim.next < 0) sim.next = conf.alerts.length;
    sideShell();
    renderFindings();
    showTab(sim.tab);
    simTick();
  }

  function simStop() {
    if (!sim.active) return;
    if (sim.saveTimer) {
      clearTimeout(sim.saveTimer);
      sim.saveTimer = null;
      act('sim', { chart: sim.chart });
    }
    sim.active = false;
    sim.current = null;
  }

  function simSave() {
    clearTimeout(sim.saveTimer);
    sim.saveTimer = setTimeout(() => {
      sim.saveTimer = null;
      act('sim', { chart: sim.chart });
    }, 300);
  }

  function clue(...ids) {
    const fresh = ids.filter((id) => id && !sim.chart.clues.includes(id));
    if (!fresh.length) return;
    sim.chart.clues.push(...fresh);
    simSave();
  }

  function simTick() {
    if (!sim.active) return;
    const sec = stepElapsed();
    if (!sim.labs && sec >= SIM.LABS_AT) {
      sim.labs = true;
      if (!sim.down && ['results', 'summary'].includes(sim.tab)) refresh();
    }
    if (!sim.faxIn && sec >= SIM.FAX_AT) {
      sim.faxIn = true;
      if (!sim.down && sim.tab === 'media') refresh();
    }
    if (!sim.down && sec >= SIM.DOWN_AT) goDown(sec - SIM.DOWN_AT > 5);
    pagerTick(sec);
    if (sim.down) return;
    const alerts = sim.conf.alerts;
    while (sim.next < alerts.length && alerts[sim.next].t <= sec) {
      const a = alerts[sim.next++];
      if (!sim.chart.alerts[a.id]) sim.queue.push(a);
    }
    const waiting = document.querySelector('[data-simwaiting]');
    if (waiting) waiting.textContent = sim.queue.length ? `${sim.queue.length} more waiting` : '';
    const all = document.querySelector('[data-simoverride]');
    if (all) all.textContent = `OVERRIDE ALL (${sim.queue.length + 1})`;
    else if (sim.current && sec >= SIM.OVERRIDE_AT) {
      document.querySelector('#sim-alert .wf-alert-btns')?.insertAdjacentHTML('beforeend', `<button class="ehr-btn override" data-act="sim-alert" data-a="override" data-simoverride>OVERRIDE ALL (${sim.queue.length + 1})</button>`);
    }
    if (!sim.current && sim.queue.length && Date.now() >= sim.gapUntil) showAlert(sec);
  }

  function showAlert(sec) {
    const layer = document.getElementById('sim-alert');
    if (!layer) return;
    sim.current = sim.queue.shift();
    sim.shownAt = Date.now();
    const override = sec >= SIM.OVERRIDE_AT ? `<button class="ehr-btn override" data-act="sim-alert" data-a="override" data-simoverride>OVERRIDE ALL (${sim.queue.length + 1})</button>` : '';
    layer.innerHTML = `
      ${Array.from({ length: depth }, (_, i) => `<div class="ehr-ghost" style="--d:${depth - i}"></div>`).join('')}
      <div class="ehr-alert-box">
        <div class="ehr-alert-head">Clinical Advisory <span>#${sim.conf.alerts.indexOf(sim.current) + 1}</span></div>
        <div class="ehr-alert-body">
          <div class="ehr-alert-icon">⚠️</div>
          <div>
            <div class="ehr-alert-title">${esc(sim.current.title)}</div>
            <div class="ehr-alert-sub">${esc(sim.current.sub)}</div>
          </div>
        </div>
        <div class="wf-alert-btns">
          <button class="ehr-btn" data-act="sim-alert" data-a="ack">ACKNOWLEDGE</button>
          <button class="ehr-btn" data-act="sim-alert" data-a="act">ACT ON IT</button>
          <button class="ehr-btn" data-act="sim-alert" data-a="dismiss">DISMISS</button>
          ${override}
        </div>
        <div class="wf-waiting" data-simwaiting>${sim.queue.length ? `${sim.queue.length} more waiting` : ''}</div>
      </div>`;
    layer.innerHTML = iconize(layer.innerHTML);
    layer.classList.add('show');
  }

  function alertAction(a) {
    const alert = sim.current;
    if (!alert) return;
    const ms = Date.now() - sim.shownAt;
    const sec = stepElapsed();
    const stamp = { at: SIM.clockAt(sec), t: Math.round(sec) };
    sim.chart.alerts[alert.id] = { a, ms, ...stamp };
    // One click clears the whole stack, the way five alerts vanished at 11:06.
    if (a === 'override') {
      for (const q of sim.queue) sim.chart.alerts[q.id] = { a: 'override', ms: 0, ...stamp };
      sim.queue = [];
      sim.chart.overrides++;
    }
    sim.current = null;
    sim.gapUntil = Date.now() + 350;
    const layer = document.getElementById('sim-alert');
    if (layer) layer.classList.remove('show');
    if (a === 'act' && alert.go) showTab(alert.go);
    simSave();
  }

  function goDown(already) {
    sim.down = true;
    sim.queue = [];
    sim.current = null;
    const layer = document.getElementById('sim-alert');
    if (layer) layer.classList.remove('show');
    const down = document.getElementById('sim-down');
    if (!down) return;
    const message = `
      <div class="wf-down-box">
        <div class="wf-down-head">⛔ UNPLANNED DOWNTIME</div>
        <p><b>MedChart is not responding.</b> Orders won't sign. Results, notes and the MAR cannot be viewed.</p>
        <p>Keep caring for Mr. Whitfield. Record what you would do on the <b>paper downtime form</b> →</p>
        <p><button class="ehr-btn sm" data-act="sim-sign">Sign pending orders (3)</button> <span class="wf-signfail" data-signfail></span></p>
        <p class="small">The pager still works.</p>
      </div>`;
    down.innerHTML = already ? message : '<div class="wf-freeze">MedChart Enterprise 9.4.1 (Not Responding)<div class="wf-spin"></div></div>';
    down.classList.add('show');
    if (!already) setTimeout(() => { if (sim.active) down.innerHTML = message; }, 4000);
    sideTab('notes');
  }

  // ---------- pager ----------

  function messages(sec) {
    const list = [];
    for (const p of sim.conf.pages) {
      if (p.t > sec) continue;
      list.push(p);
      if (p.then && sim.chart.pages[p.id] === p.then.on) {
        const at = (sim.repliedAt[p.id] ?? -Infinity) + p.then.after;
        if (sec >= at) list.push({ id: `${p.id}_then`, t: Math.max(p.t, at), from: p.then.from, text: p.then.text });
      }
    }
    return list.sort((a, b) => b.t - a.t);
  }

  function pagerTick(sec) {
    const list = messages(sec);
    const sig = list.map((m) => `${m.id}:${sim.chart.pages[m.id] ?? ''}`).join(',');
    if (sig === sim.msgSig) return;
    if (sim.msgCount >= 0 && list.length > sim.msgCount) toast(`📟 ${list[0].from.split(' · ')[0]}`);
    sim.msgSig = sig;
    sim.msgCount = list.length;
    const open = list.filter((m) => m.replies && sim.chart.pages[m.id] == null).length;
    const badge = document.querySelector('[data-simbadge]');
    if (badge) badge.textContent = open || '';
    const body = document.getElementById('sim-pager');
    if (!body) return;
    body.innerHTML = list.length
      ? list.map((m) => {
          const answered = sim.chart.pages[m.id];
          const replies = !m.replies ? ''
            : answered != null ? `<div class="wf-replied">You: ${esc(m.replies[answered])}</div>`
            : `<div class="wf-replies">${m.replies.map((r, i) => `<button data-act="sim-reply" data-id="${m.id}" data-n="${i}">${esc(r)}</button>`).join('')}</div>`;
          return `
            <div class="wf-page ${m.replies && answered == null ? 'new' : ''}">
              <div class="wf-page-head"><b>${esc(m.from)}</b><span>${SIM.clockAt(m.t)}</span></div>
              <p>${esc(m.text)}</p>${replies}
            </div>`;
        }).join('')
      : '<p class="wf-quiet">No pages yet.</p>';
  }

  function reply(id, n) {
    if (sim.chart.pages[id] != null) return;
    sim.chart.pages[id] = n;
    sim.repliedAt[id] = stepElapsed();
    simSave();
    sim.msgSig = null;
    pagerTick(stepElapsed());
  }

  // ---------- findings log and decisions (a paper downtime form once the EHR is down) ----------

  function decisionHtml(d, i) {
    const value = sim.chart.decisions[d.id];
    let body;
    if (d.text) {
      body = `<textarea data-simdec="${d.id}" rows="3" maxlength="800" placeholder="Situation, what you did, what to watch">${esc(value || '')}</textarea>`;
    } else {
      const on = (id) => (d.multi ? (value || []).includes(id) : value === id);
      body = `<div class="wf-dec-opts">${d.options.map(([id, label]) => `<button class="${on(id) ? 'on' : ''}" data-act="sim-dec" data-id="${d.id}" data-opt="${id}">${esc(label)}</button>`).join('')}</div>`;
    }
    return `<div class="wf-dec"><div class="wf-dec-q">${i + 1}. ${esc(d.q)}</div>${body}</div>`;
  }

  function sideShell() {
    const side = document.getElementById('sim-side');
    if (!side) return;
    side.innerHTML = `
      <div class="wf-sidetabs">
        <button data-act="sim-side" data-side="pager" class="on">📟 Pager <span class="wf-badge" data-simbadge></span></button>
        <button data-act="sim-side" data-side="notes"><span data-simnoteslabel>📝 Findings &amp; decisions</span></button>
      </div>
      <div class="wf-sidebody" data-sidepane="pager"><div id="sim-pager"></div></div>
      <div class="wf-sidebody hidden" data-sidepane="notes">
        <div class="wf-form">
          <div class="wf-downtag hidden" data-simdowntag>DOWNTIME FORM — PAPER</div>
          <div class="wf-label">Findings log: what you found, and on which screen</div>
          <div class="wf-find">
            <input data-test="finding-text" name="finding" maxlength="300" placeholder="What you found, e.g. tremor at 05:30">
            <input data-test="finding-screen" name="screen" maxlength="60" list="sim-screens" placeholder="Screen">
            <datalist id="sim-screens">${sim.conf.tabs.map(([, label]) => `<option value="${esc(label)}">`).join('')}</datalist>
            <button class="ehr-btn sm" data-act="finding-add" data-test="finding-add">Add</button>
          </div>
          <ol class="wf-findings" data-findings></ol>
          <label class="wf-label">Scratch notes
            <textarea data-simnotes rows="3" maxlength="4000" placeholder="Anything else">${esc(sim.chart.notes)}</textarea>
          </label>
          <div class="wf-label">Decisions you own</div>
          ${sim.conf.decisions.map(decisionHtml).join('')}
        </div>
      </div>`;
  }

  function renderFindings() {
    const el = document.querySelector('[data-findings]');
    if (el) el.innerHTML = (sim.chart.findings || []).map((f) => `<li><b>${esc(f.at)}</b> · ${esc(f.screen || '—')} · ${esc(f.text)}</li>`).join('');
  }

  function addFinding() {
    const text = document.querySelector('[data-test=finding-text]');
    const screen = document.querySelector('[data-test=finding-screen]');
    if (!text || !text.value.trim()) return toast('Write what you found first.');
    const tab = (sim.conf.tabs.find(([id]) => id === sim.tab) || [])[1] || '';
    const sec = stepElapsed();
    sim.chart.findings = [...(sim.chart.findings || []), { text: text.value.trim(), screen: screen.value.trim() || tab, at: SIM.clockAt(sec), t: Math.round(sec) }];
    text.value = '';
    screen.value = '';
    renderFindings();
    simSave();
  }

  function sideTab(name) {
    document.querySelectorAll('.wf-sidetabs [data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === name));
    document.querySelectorAll('[data-sidepane]').forEach((p) => p.classList.toggle('hidden', p.dataset.sidepane !== name));
    if (sim.down) {
      document.querySelector('[data-simdowntag]')?.classList.remove('hidden');
      const label = document.querySelector('[data-simnoteslabel]');
      if (label) label.textContent = '📝 Downtime form';
      document.getElementById('sim-side')?.classList.add('paper');
    }
  }

  function decide(id, opt) {
    const d = sim.conf.decisions.find((x) => x.id === id);
    if (!d) return;
    const value = sim.chart.decisions[id];
    if (d.multi) {
      const list = value || [];
      sim.chart.decisions[id] = list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt];
    } else if (value === opt) delete sim.chart.decisions[id];
    else sim.chart.decisions[id] = opt;
    const now = sim.chart.decisions[id];
    document.querySelectorAll(`[data-act="sim-dec"][data-id="${id}"]`).forEach((b) => {
      b.classList.toggle('on', d.multi ? (now || []).includes(b.dataset.opt) : now === b.dataset.opt);
    });
    simSave();
  }

  // ---------- chart screens ----------

  function showTab(tab) {
    sim.tab = tab;
    document.querySelectorAll('#sim-tabs [data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    refresh();
    const body = document.getElementById('sim-body');
    if (body) body.scrollTop = 0;
  }

  // Redraws the current tab in place, keeping the scroll position.
  function refresh() {
    const body = document.getElementById('sim-body');
    if (!body) return;
    const top = body.scrollTop;
    body.innerHTML = VIEW[sim.tab]();
    body.scrollTop = top;
    if (sim.tab === 'results' && sim.labs) clue('labs');
    if (sim.tab === 'flow') clue('vitals3');
  }

  function toggleOpen(key, clues) {
    sim.open[key] = !sim.open[key];
    if (sim.open[key] && clues) clue(...clues.split(' '));
    refresh();
  }

  const box = (title, inner) => `<div class="ehr-box"><h4>${title}</h4>${inner}</div>`;
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const table = (head, rows) =>
    `<table>${head ? `<tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>` : ''}${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  // A row that expands in place. `clues` are recorded when it opens.
  const expander = (key, head, body, clues) => `
    <div class="wf-x ${sim.open[key] ? 'open' : ''}">
      <div class="wf-x-head" data-act="sim-open" data-key="${key}" data-clues="${clues || ''}">${sim.open[key] ? '▾' : '▸'} ${head}</div>
      ${sim.open[key] ? `<div class="wf-x-body">${typeof body === 'function' ? body() : body}</div>` : ''}
    </div>`;
  const para = (html) => `<p class="wf-p">${html}</p>`;

  const LABS = [
    // name, range, values 09/24 → 09/28, today's redraw
    ['Tacrolimus trough', '8–12 ng/mL', ['4.2 L', '5.1 L', '6.8 L', '9.6', '11.6*'], '19.4 H'],
    ['Sodium', '135–145 mmol/L', ['136', '137', '135', '134 L', '134 L'], '133 L'],
    ['Potassium', '3.5–5.1 mmol/L', ['4.4', '4.6', '4.7', '4.8', '5.0'], '6.2 H'],
    ['CO2', '22–29 mmol/L', ['24', '23', '23', '22', '21 L'], '19 L'],
    ['BUN', '7–20 mg/dL', ['24 H', '22 H', '21 H', '27 H', '34 H'], '58 H'],
    ['Creatinine', '0.7–1.3 mg/dL', ['1.3', '1.3', '1.2', '1.4 H', '1.6 H'], '2.4 H'],
    ['Glucose', '70–99 mg/dL', ['188 H', '204 H', '176 H', '219 H', '232 H'], '312 H'],
    ['Magnesium', '1.7–2.2 mg/dL', ['1.6 L', '1.5 L', '1.4 L', '1.5 L', '1.4 L'], '1.3 L'],
    ['WBC', '4.0–11.0 K/uL', ['9.8', '8.1', '7.2', '6.9', '8.4'], '13.1 H'],
    ['Hemoglobin', '13.5–17.5 g/dL', ['8.9 L', '9.1 L', '9.0 L', '9.3 L', '9.2 L'], '8.8 L'],
    ['Platelets', '150–400 K/uL', ['62 L', '71 L', '88 L', '104 L', '121 L'], '118 L'],
    ['AST', '10–40 U/L', ['412 H', '210 H', '120 H', '78 H', '64 H'], '142 H'],
    ['ALT', '7–56 U/L', ['520 H', '340 H', '210 H', '140 H', '110 H'], '168 H'],
    ['Total bilirubin', '0.2–1.2 mg/dL', ['3.1 H', '2.4 H', '2.0 H', '1.6 H', '1.4 H'], '1.9 H'],
    ['INR', '0.9–1.1', ['1.6 H', '1.4 H', '1.3 H', '1.2 H', '1.2 H'], '1.3 H'],
    ['Lactate', '0.5–2.2 mmol/L', ['—', '—', '—', '—', '1.4'], '2.6 H'],
  ];

  const PROGRESS = (pod, level, change) =>
    `S: No acute events overnight. Tolerating diet. Ambulating with PT. Pain controlled. Denies N/V. ` +
    `O: Afebrile, VSS. A&Ox4. Abd soft, appropriately tender. Incision C/D/I. JP serosanguinous. Labs reviewed. Tacrolimus level ${level}. ` +
    `A/P: 61M POD ${pod} s/p deceased-donor liver transplant, c/b CKD 3b, T2DM, AF, HTN, depression. Graft function improving, LFTs downtrending. ` +
    `1) Immunosuppression: tacrolimus goal 8–12, ${change}. MMF 1 g BID. Prednisone taper. 2) ID prophylaxis: fluconazole, valganciclovir, TMP-SMX. ` +
    `3) AF: rate controlled. Apixaban on hold; restart when cleared by surgery. 4) CKD 3b: creatinine stable. 5) T2DM: glargine + sliding scale. ` +
    `6) Depression: continue sertraline. Dispo: anticipate discharge home 10/02. ` +
    `[Pages 3–11: problem list, medication list, ROS and exam copied forward from prior notes.]`;

  const NOTES = {
    progress: [
      { id: 'pod6', when: '09/29 07:40', head: 'Progress Note — Transplant Surgery (POD 6) — 11 pages', by: 'Resident', clue: 'stale', body: PROGRESS(6, '6.8 (subtherapeutic)', 'increase tacrolimus to 5 mg BID') },
      { id: 'add', when: '09/29 11:06', head: 'Addendum to Progress Note', by: 'Resident', clue: 'ack1106', body: 'Alerts reviewed and acknowledged (5): Creatinine up ≥ 0.3 mg/dL in 48 h; Early warning score 4; Sepsis model score 0.38; Glucose > 300 mg/dL; Duplicate CBC order.' },
      { id: 'pod5', when: '09/28 07:35', head: 'Progress Note — Transplant Surgery (POD 5) — 11 pages', by: 'Resident', clue: 'stale', body: PROGRESS(5, '6.8 (subtherapeutic)', 'increase tacrolimus 4 → 5 mg BID') },
      { id: 'pod4', when: '09/27 07:30', head: 'Progress Note — Transplant Surgery (POD 4) — 10 pages', by: 'Resident', body: PROGRESS(4, '6.8 (subtherapeutic)', 'increase tacrolimus 3 → 4 mg BID') },
      { id: 'pod2', when: '09/25 07:15', head: 'Progress Note — Transplant Surgery (POD 2) — 9 pages', by: 'Resident', body: PROGRESS(2, '4.2 (subtherapeutic)', 'increase tacrolimus 2 → 3 mg BID') },
    ],
    nursing: [
      { id: 'rn1035', when: '09/29 10:35', head: 'Nursing Note — Day shift', by: 'P. Shah, RN', body: 'T 38.1. HR 104, irregular. Drowsy, oriented x2. 2 L nasal cannula started for SpO2 91%. EWS 4. Will reassess.' },
      { id: 'rn0530', when: '09/29 05:30', head: 'Nursing Note — Night shift', by: 'K. Osei, RN', clue: 'tremor', body: 'Pt awake, fine tremor in both hands, states "my hands are shaky." A&Ox4. Will mention in report.' },
      { id: 'rn1930', when: '09/28 19:30', head: 'Shift Assessment', by: 'K. Osei, RN', body: 'Pt A&Ox4. Lungs diminished at bases. Abd soft. Incision C/D/I. Voiding via Foley. Skin intact. Fall precautions in place. Pt education provided. Will continue to monitor.' },
    ],
    consults: [
      { id: 'neph', when: '09/28 15:20', head: 'Consult — Nephrology', by: 'M. Brandt, MD', clue: 'neph', body: 'Rising creatinine, 1.2 → 1.6 in 48 hours, with tacrolimus climbing. Likely calcineurin-inhibitor toxicity. Recommendations: (1) <b>Hold tacrolimus if the trough is above 12 ng/mL</b>; check daily troughs. (2) Renal low-potassium diet. (3) Stop potassium supplements. (4) Avoid IV contrast if possible; discuss with us first.' },
      { id: 'id', when: '09/26 10:05', head: 'Consult — Infectious Diseases', by: 'S. Kim, MD', clue: 'idc', body: 'Prophylaxis per liver protocol: fluconazole 400 mg daily, valganciclovir, TMP-SMX. <b>Fluconazole will raise tacrolimus levels 2 to 3 fold</b>: reduce the tacrolimus dose and check daily troughs. Interaction checking does not run on order-set items. Donor cultures are tracked in TransChart; we will review when final.' },
      { id: 'xcover', when: '09/26 22:10', head: 'Cross-cover Note', by: 'J. Patel, MD', body: 'AF with RVR to 140s. Started diltiazem 60 mg PO q6h. Apixaban remains on hold per surgery.' },
    ],
    other: [
      { id: 'pt', when: '09/28 14:00', head: 'Therapy Note — PT/OT', by: 'R. Alvarez, PT', clue: 'rehab', body: 'Unsteady gait, needs moderate assistance. Lives 90 miles away. <b>Recommend inpatient rehab, not discharge home.</b>' },
      { id: 'diet', when: '09/28 16:30', head: 'Nutrition Assessment', by: 'Dietitian', clue: 'potassium', body: 'Weight 84 kg (per chart). Started a renal low-potassium diet (2 g/day) per nephrology. <b>Potassium conflict:</b> the potassium gluconate supplement (1,200 mg potassium daily) and the potassium replacement protocol are still active. Asked the team to review.' },
      { id: 'cm', when: '09/28 09:00', head: 'Case Management', by: 'Case manager', body: 'Plan: discharge home 10/02 with daughter driving. Rehab not discussed.' },
    ],
  };

  // Physician orders and MAR. `clue` is recorded when an order's details open.
  const MEDS = [
    { id: 'tac', text: 'tacrolimus 5 mg cap PO q12h', due: '21:00', last: 'Today 09:02', clue: 'stale',
      detail: table(['Date', 'Dose', 'Trough that morning', 'Changed by'], [['09/23', '2 mg BID', '—', 'Protocol'], ['09/25', '3 mg BID', '5.1', 'Progress note POD 2'], ['09/27', '4 mg BID', '9.6', 'Progress note POD 4 (cites 6.8)'], ['09/28', '5 mg BID', '11.6 (resulted 23:41)', 'Progress note POD 5 (cites 6.8)']]) },
    { id: 'mmf', text: 'mycophenolate mofetil 1,000 mg tab PO BID', due: '21:00', last: 'Today 09:02' },
    { id: 'pred', text: 'predniSONE 20 mg tab PO daily', due: 'Tomorrow 09:00', last: 'Today 09:02' },
    { id: 'fluc', text: 'fluconazole 400 mg tab PO daily', due: 'Tomorrow 09:00', last: 'Today 09:02', clue: 'ddi',
      detail: para('Ordered 09/26 via the Liver Transplant Order Set. <b>Drug interaction checking: not run</b> for order-set items. No interaction alert fired.') },
    { id: 'valgan', text: 'valGANciclovir 900 mg tab PO daily', due: 'Tomorrow 09:00', last: 'Today 09:02' },
    { id: 'smx', text: 'sulfamethoxazole-trimethoprim 400-80 mg tab PO daily', due: 'Tomorrow 09:00', last: 'Today 09:02', detail: para('PJP prophylaxis. Trimethoprim can raise potassium.') },
    { id: 'dilt', text: 'dilTIAZem 60 mg tab PO q6h', due: '13:00', last: 'Today 07:00' },
    { id: 'apix', text: 'apixaban 5 mg tab PO BID — ON HOLD', due: 'On hold', last: '09/22', detail: para('Held since 09/22 (pre-op). Restart requires transplant surgery approval.') },
    { id: 'ctx', text: 'cefTRIAXone 2 g IV q24h', due: 'Tomorrow 11:00', last: 'Today 11:20 (first dose)', detail: para('Started today for fever. Piperacillin-tazobactam avoided because of the penicillin allergy. Donor cultures: not available in MedChart.') },
    { id: 'hep', text: 'heparin 5,000 units SC q8h', due: '14:00', last: 'Today 06:00' },
    { id: 'glarg', text: 'insulin glargine 18 units SC nightly', due: '21:00', last: 'Yesterday 21:04' },
    { id: 'lispro', text: 'insulin lispro sliding scale SC AC & HS', due: 'Now (glucose 312)', last: 'Today 07:40' },
    { id: 'panto', text: 'pantoprazole 40 mg tab PO daily', due: 'Tomorrow 09:00', last: 'Today 09:02' },
    { id: 'sert', text: 'sertraline 50 mg tab PO daily', due: 'Tomorrow 09:00', last: 'Today 09:02', detail: para('Imported from the March home medication list. Current outpatient dose per pharmacy: 100 mg.') },
    { id: 'ondan', text: 'ondansetron 4 mg IV q8h PRN nausea', due: 'PRN', last: 'Today 06:40', detail: para('QT-prolonging.') },
    { id: 'oxy', text: 'oxyCODONE 5 mg tab PO q4h PRN pain', due: 'PRN', last: 'Today 08:15' },
    { id: 'apap', text: 'acetaminophen 650 mg tab PO q6h PRN (max 2 g/day)', due: 'PRN', last: 'Today 10:40' },
    { id: 'docu', text: 'docusate 100 mg cap PO BID', due: '21:00', last: 'Today 09:02' },
    { id: 'kglu', text: 'potassium gluconate (1,200 mg potassium) PO daily', due: '13:00', last: 'Yesterday 13:05', clue: 'potassium medlists',
      detail: para('Source: home medication, imported from the March home medication list at admission. Conflicts with: <b>renal low-potassium diet</b> (09/28) and the <b>potassium replacement protocol</b>.') },
    { id: 'kcl', text: 'potassium chloride replacement protocol: 20 mEq PO if K &lt; 4.0', due: 'Per protocol', last: '09/24', clue: 'potassium', detail: para('Active since admission order set 09/23. Not discontinued when the low-potassium diet started.') },
    { id: 'mag', text: 'magnesium oxide 400 mg tab PO BID', due: '21:00', last: 'Today 09:02' },
    { id: 'lr', text: "lactated Ringer's 75 mL/h IV continuous", due: 'Running', last: 'Bag hung 06:00' },
  ];

  // The nurse's medication pass. `fail` meds refuse to scan the first time.
  const DUE = [
    { id: 'lispro', text: 'insulin lispro 8 units SC (glucose 312)', due: 'NOW', fail: false },
    { id: 'dilt', text: 'dilTIAZem 60 mg tab PO (HR 108, irregular; BP 108/66)', due: '13:00', fail: true },
    { id: 'kglu', text: 'potassium gluconate (1,200 mg potassium) PO', due: '13:00', fail: true, clue: 'potassium' },
  ];

  const US_BODY = `
    <p><b>EXAM:</b> US Doppler, liver transplant. 09/28 16:40. <b>COMPARISON:</b> 09/24.</p>
    <p><b>FINDINGS:</b> Liver: normal echotexture. Biliary: no ductal dilatation. Portal vein: patent. Hepatic veins: patent, phasic.
    Hepatic artery: peak systolic velocity <b>38 cm/s (09/24: 92 cm/s)</b>. Intrahepatic branches show <b>tardus-parvus waveforms</b>, resistive index <b>0.48 (09/24: 0.68)</b>.
    Concerning for hepatic artery stenosis or thrombosis; correlation with CT angiography is recommended. No perihepatic collection.</p>
    <p><b>IMPRESSION:</b> Transplanted liver with patent hepatic vasculature. No biliary dilatation. No perihepatic collection.</p>`;

  const ECG = `
    <svg class="wf-ecg" viewBox="0 0 600 80" preserveAspectRatio="none" aria-label="ECG tracing">
      <polyline points="${Array.from({ length: 11 }, (_, i) => { const x = i * 55; return `${x},50 ${x + 14},50 ${x + 18},46 ${x + 22},50 ${x + 26},50 ${x + 28},56 ${x + 31},10 ${x + 34},62 ${x + 37},50 ${x + 42},50 ${x + 47},22 ${x + 52},50`; }).join(' ')}"/>
    </svg>
    <p><b>12-lead ECG, 09/29 06:12.</b> Irregular rhythm, rate 108. <b>Peaked T waves V2–V4.</b> QRS 96 ms, <b>QTc 492 ms</b>. Compared with 09/24: QTc was 438 ms.</p>
    <p>Status: <b>awaiting physician review</b>.</p>`;

  const FAX_PAGES = 84;
  const FAX_ECOLI = 52;
  function faxPage(n) {
    const sections = [[1, 'Fax cover sheet'], [2, 'Discharge summaries 2019–2025'], [18, 'Clinic notes'], [34, 'Laboratory results'], [49, 'Microbiology'], [55, 'Imaging reports'], [68, 'Medication history'], [76, 'Consents and correspondence']];
    const title = sections.filter(([from]) => from <= n).pop()[1];
    let body;
    if (n === 1) {
      body = "<p><b>ST. MARY'S MEDICAL CENTER</b> · Health information management · FAX</p><p>To: Riverbend University Hospital, Liver Transplant<br>Re: WHITFIELD, JAMES · DOB 03/11/1965<br>Pages: 84 including cover</p><p>Records as requested. Scanned images; text is not searchable.</p>";
    } else if (n === FAX_ECOLI) {
      body = `<p><b>Urine culture, collected 03/14/2025. FINAL.</b></p><p><b>Escherichia coli, ESBL-producing</b>, &gt;100,000 CFU/mL.</p>
        ${table(['Antibiotic', 'Result'], [['Ampicillin', 'R'], ['Ceftriaxone', '<b>R</b>'], ['Cefepime', 'R'], ['Ciprofloxacin', 'R'], ['Meropenem', 'S'], ['Ertapenem', 'S'], ['Nitrofurantoin', 'S']])}`;
      clue('fax_ecoli');
    } else {
      let x = n * 131;
      const filler = ['Reviewed.', 'Within normal limits.', 'See attached.', 'Not applicable.', 'Negative.', 'Unremarkable.', 'Copy for records.', 'Signed.'];
      body = Array.from({ length: 8 }, (_, i) => {
        x = (x * 1103515245 + 12345) % 2147483648;
        return `<p>${title} — item ${(n * 7 + i) % 97 + 1}: ${filler[x % filler.length]}</p>`;
      }).join('');
    }
    return `
      <div class="wf-fax">
        <div class="wf-fax-bar">
          <button class="ehr-btn sm" data-act="sim-fax" data-d="-10">« 10</button>
          <button class="ehr-btn sm" data-act="sim-fax" data-d="-1">‹ Prev</button>
          <span>Page <b>${n}</b> of ${FAX_PAGES}</span>
          <button class="ehr-btn sm" data-act="sim-fax" data-d="1">Next ›</button>
          <button class="ehr-btn sm" data-act="sim-fax" data-d="10">10 »</button>
          <span class="wf-nosearch">🔍 Search unavailable: scanned image</span>
        </div>
        <div class="wf-fax-page"><div class="wf-fax-head">ST. MARY'S · ${title} · p. ${n}/${FAX_PAGES}</div>${body}</div>
      </div>`;
  }

  const EWS = () => expander('ews', 'Early warning score: <b>5</b> at 12:30 (0 at 05:00)', para('Policy: EWS of 5 or more → notify the provider and consider rapid response. <b>Provider notified: not documented.</b>'), 'ews');
  const VITALS = table(['Time', 'Temp', 'HR', 'BP', 'RR', 'SpO2', 'Neuro', 'EWS'], [
    ['12:30', '38.1 H', '112 H irreg', '108/66', '22 H', '92% 2 L', 'A&O x2', '5'],
    ['10:30', '38.1 H', '104 H', '118/70', '20', '91% RA → 2 L', 'A&O x2', '4'],
    ['08:00', '37.4', '92', '128/76', '18', '96% RA', 'A&O x4', '1'],
    ['05:00', '37.0', '84', '132/78', '16', '97% RA', 'A&O x4', '0'],
  ]);
  const WEIGHT = () => expander('weight', 'Weight: <b>85.3 kg</b> (09/29 05:00)', table(['Where it was typed', 'Value', 'By'], [['Admission navigator, 09/23', '84.0 kg', 'RN'], ['Vital signs flowsheet, 09/29 05:00', '85.3 kg', 'RN'], ['Nutrition assessment, 09/28', '84 kg ("per chart")', 'Dietitian']]) + para('Vitals and weight live in three places that do not talk to each other.'), 'vitals3');

  const notesView = () => {
    const subs = [['progress', 'Progress'], ['nursing', 'Nursing'], ['consults', 'Consults'], ['other', 'Other']];
    const bar = `<div class="wf-subtabs">${subs.map(([id, label]) => `<button class="${sim.notesTab === id ? 'on' : ''}" data-act="sim-notes" data-sub="${id}">${label} (${NOTES[id].length})</button>`).join('')}</div>`;
    return box('Notes (showing 15 of 211)', bar + NOTES[sim.notesTab].map((n) =>
      expander(`note:${n.id}`, `${n.when} — ${n.head} — ${n.by} — <i>signed</i>`, para(n.body), n.clue)).join(''));
  };

  const VIEW = {
    summary() {
      if (sim.side === 'nurse') {
        return `
          ${box('My patients (4)', table(['Bed', 'Patient', 'Needs now'], [
            ['11', 'R. Ortiz, 72 F', 'Dressing change due 13:00'],
            ['12', 'D. Brooks, 55 M', 'Asking for pain medicine'],
            ['<b>14</b>', '<b>WHITFIELD, JAMES, 61 M</b> · protective isolation', 'Glucose 312, insulin due · fever 38.1 · 2 L O2'],
            ['16', 'A. Chen, 80 F', 'Needs help to the bathroom'],
          ]))}
          ${box('Bed 14 — vitals today', VITALS + EWS())}
          <div class="ehr-cols">
            ${box('Handoff from the morning', para('"Surgery might change the tacrolimus." No new order seen. Daughter has called twice about the fever and the discharge date.'))}
            ${box('Required assessments', para(`${sim.assessDone.size} of 9 documented. See Assessments.`))}
            ${box('Bed 14 weight', WEIGHT())}
          </div>`;
      }
      return `
        <div class="ehr-cols">
          ${box('Problem List (17)', list(['Liver transplant status, deceased donor, 09/23', 'NASH cirrhosis — RESOLVED?', 'CKD stage 3b (N18.32)', 'CKD stage 3 (N18.30) — DUPLICATE', 'Type 2 diabetes with CKD', 'Type II diabetes w/o complication', 'Paroxysmal atrial fibrillation', 'Long-term anticoagulant use', 'Essential hypertension', 'Major depressive disorder', 'Thrombocytopenia', 'Ascites — pre-transplant', 'Hepatic encephalopathy — pre-transplant', 'Hepatocellular carcinoma — see pathology', 'Obesity', 'Leg cramps', 'Fever, unspecified']))}
          <div class="ehr-box"><h4>Allergies (1)</h4>${list(['Penicillins — rash (childhood). Status: <b>unverified</b>.'])}
            <h4>Today's plan (copied from progress note 07:40)</h4>${para('Graft improving. Continue current doses. Discharge home 10/02.')}</div>
          ${box('Care Team', list(['Attending: R. Okafor, MD', 'Resident: YOU', 'Nephrology: M. Brandt, MD', 'ID: S. Kim, MD', 'Transplant pharmacy: L. Nguyen, PharmD', 'Primary RN: P. Shah']))}
        </div>
        ${box('Vitals — today', VITALS + EWS() + WEIGHT())}
        ${box('Labs — most recent', para(sim.labs ? 'Resulted 13:02. See Results.' : 'AM labs 09/29: specimen clotted. Redrawn 10:40. <b>Pending.</b>'))}`;
    },

    notes: notesView,

    results() {
      const dates = ['09/24', '09/25', '09/26', '09/27', '09/28', '09/29'];
      const rows = LABS.map(([name, range, past, now], i) =>
        `<tr><td>${name}</td>${past.map((v) => `<td>${v}</td>`).join('')}${sim.labs ? `<td>${now}</td>` : i === 0 ? '<td rowspan="99" class="wf-pending">Clotted 06:10<br>Redrawn 10:40<br><b>PENDING</b></td>' : ''}<td>${range}</td></tr>`
      ).join('');
      return `
        ${box('Results — chemistry, hematology, drug levels', `<table><tr><th>Component</th>${dates.map((d) => `<th>${d}</th>`).join('')}<th>Ref range</th></tr>${rows}</table>${para(`* Resulted 09/28 23:41.${sim.labs ? ' 09/29: redrawn 10:40, resulted 13:02.' : ''}`)}`)}
        ${box('Pathology (1)', expander('path', '09/27 — Explant pathology — FINAL', para('Cirrhotic liver. Treated hepatocellular carcinoma, 2.1 cm, segment 8, fully necrotic. <b>A second, previously unknown HCC, 1.4 cm, segment 6</b>, margins negative. Discussed with patient: not documented. Family: not informed.'), 'pathology'))}
        ${box('Microbiology', table(['Collected', 'Test', 'Status'], [['09/29 11:05', 'Blood culture x2', 'In process'], ['—', 'Donor cultures', 'Not available in MedChart (see Transplant Module)']]))}`;
    },

    mar() {
      if (sim.side === 'nurse') {
        const cell = (m) => {
          const state = sim.chart.mar[m.id];
          if (state === 'given') return '<span class="mar-given">Given ✓</span>';
          if (state === 'held') return '<span class="mar-held">Held</span>';
          if (sim.open[`fail:${m.id}`]) return `<span class="mar-fail">Barcode not recognized.</span> <button class="ehr-btn sm" data-act="sim-mar" data-med="${m.id}" data-op="give">Override</button>`;
          return `<button class="ehr-btn sm" data-act="sim-mar" data-med="${m.id}" data-op="scan">Scan</button> <button class="ehr-btn sm" data-act="sim-mar" data-med="${m.id}" data-op="hold">Hold</button>`;
        };
        const due = DUE.map((m) => `<tr><td>${m.clue ? expander(`due:${m.id}`, m.text, para('Diet order: <b>renal, low potassium</b> (09/28). Also active: <b>potassium replacement protocol</b>, 20 mEq if K &lt; 4.0.'), m.clue) : m.text}</td><td>${m.due}</td><td>${cell(m)}</td></tr>`).join('');
        const later = MEDS.filter((m) => !DUE.some((d) => d.id === m.id)).map((m) => `<tr><td>${m.text}</td><td>${m.due}</td><td>${m.last}</td></tr>`).join('');
        return box('MAR — due 12:45 to 13:05 — scan each medication to document', `<table><tr><th>Medication</th><th>Due</th><th>Action</th></tr>${due}</table>`) +
          box('Scheduled later / PRN', `<table><tr><th>Medication</th><th>Next due</th><th>Last given</th></tr>${later}</table>`) +
          box('Tacrolimus', para('tacrolimus 5 mg PO due 21:00. <b>No new order</b> since this morning\'s handoff ("surgery might change the tacrolimus").'));
      }
      const rows = MEDS.map((m) => {
        const key = `med:${m.id}`;
        const open = sim.open[key];
        return `<tr class="wf-row ${open ? 'open' : ''}" data-act="sim-open" data-key="${key}" data-clues="${m.clue || ''}"><td>${open ? '▾' : '▸'} ${m.text}</td><td>${m.last}</td><td>${m.due}</td></tr>` +
          (open ? `<tr class="wf-detail"><td colspan="3">${m.detail || para('No additional order details.')}</td></tr>` : '');
      }).join('');
      return box('Active medication orders (22) — click an order for details', `<table><tr><th>Medication</th><th>Last given</th><th>Next due</th></tr>${rows}</table>`) + VIEW.orders();
    },

    orders() {
      return `<div class="ehr-cols">
        ${box('Diet', list(['Renal, low potassium (2 g/day) — since 09/28 (nephrology)']))}
        ${box('Nursing', list(['Vital signs q4h', 'Telemetry — not ordered', 'Protective isolation', 'Strict I&O', 'Fall precautions']))}
        ${box('Other', list(['Expected discharge: 10/02 — home', 'Consult: nephrology — following', 'Consult: PT/OT — seen 09/28', 'ECG 09/29 06:12 — completed, unsigned', 'Labs 09/29 — redraw pending']))}
      </div>` + (sim.side === 'nurse' ? box('Potassium orders (3 active)', list(['potassium gluconate (1,200 mg potassium) PO daily', 'potassium chloride replacement protocol: 20 mEq PO if K &lt; 4.0', 'Diet: renal, low potassium']) + expander('kconf', 'Why are there three?', para('The supplement came from the imported home list, the protocol from the admission order set, and the diet from nephrology. Nothing reconciled them.'), 'potassium')) : '');
    },

    medrec() {
      const march = ['apixaban 5 mg BID', 'metoprolol 25 mg BID', 'furosemide 40 mg daily', 'spironolactone 50 mg daily', 'potassium gluconate 1,200 mg daily ("for leg cramps")', 'insulin glargine 30 units nightly', 'sertraline 50 mg daily'];
      return box('Admission medication reconciliation — imported list', para('<b>Source: outpatient clinic list, March 2026</b> (auto-imported 09/23). Status: reconciled by pharmacy technician.') + list(march)) +
        box('Other sources (2) — pharmacist flag', expander('ml', '⚠ Pharmacist: three home medication lists conflict', `
          <div class="ehr-cols">
            ${box('Pharmacy fill history, September 2026', list(['apixaban 5 mg BID', 'metoprolol 25 mg BID', 'furosemide 40 mg daily', 'insulin glargine 18 units nightly', 'sertraline 100 mg daily']))}
            ${box("Daughter's handwritten list (scanned, Media)", list(['blood thinner twice a day', 'water pill', 'insulin 18 at night', 'sertraline 100', '"potassium pills — STOPPED in May"', '"spironolactone stopped by kidney doctor"']))}
            ${box('Imported March list', list(march))}
          </div>${para('The EHR imported the oldest list. The potassium supplement and the old doses came from it.')}`, 'medlists'));
    },

    imaging() {
      return box('Imaging (3)', [
        expander('img:cxr', '09/29 07:10 — XR chest portable — FINAL — Impression: Right basilar opacity, atelectasis vs early consolidation. Small bilateral effusions.', para('Lines: right PICC tip at the cavoatrial junction.')),
        expander('img:us', '09/28 16:40 — US Doppler liver transplant — FINAL — Impression: Transplanted liver with patent hepatic vasculature.', `<div class="wf-p">${US_BODY}</div>`, 'us_body'),
        expander('img:us0', '09/24 08:15 — US Doppler liver transplant — FINAL — Impression: Normal post-transplant Doppler.', para('Hepatic artery PSV 92 cm/s, RI 0.68.')),
      ].join(''));
    },

    media() {
      const fax = sim.faxIn
        ? [expander('media:fax', `${SIM.clockAt(SIM.FAX_AT)} today — Fax: St. Mary's Medical Center — 84 pages — scanned image — <b>Unsigned</b>`, () => faxPage(sim.fax))]
        : [];
      return box(`Media (${8 + fax.length})`, [
        ...fax,
        expander('media:ecg', '09/29 06:12 — ECG 12-lead — <b>Awaiting physician review</b>', ECG, 'ecg'),
        expander('media:fill', '09/23 — Pharmacy fill history, September 2026 (Valley Pharmacy, faxed)', list(['apixaban 5 mg BID', 'metoprolol 25 mg BID', 'furosemide 40 mg daily', 'insulin glargine 18 units nightly', 'sertraline 100 mg daily', 'No potassium filled since May']), 'medlists'),
        expander('media:list', "09/23 — Home medication list, handwritten by daughter (scan)", para('"Dad\'s pills: blood thinner twice a day, water pill, insulin 18 at night, sertraline 100. Potassium pills — STOPPED in May."'), 'medlists'),
        ...['09/23 — Consent: liver transplant', '09/23 — Consent: blood products', '09/23 — Insurance card (front/back)', '09/23 — Photo ID', '09/22 — Referral letter'].map((t, i) => expander(`media:x${i}`, t, para('Scanned document. 1 page.'))),
      ].join(''));
    },

    transplant() {
      if (sim.tx === 0) {
        return box('Transplant Module', para('<b>TransChart 3.2</b> is a separate application. Donor, organ and transplant-coordinator data do not flow into MedChart.') + para('<button class="ehr-btn sm" data-act="sim-tx">Launch TransChart</button>'));
      }
      if (sim.tx === 1) {
        return box('TransChart 3.2 — Sign in', para('Username: <input value="riverbend\\you" disabled> Password: <input type="password" value="password" disabled>') + para('<button class="ehr-btn sm" data-act="sim-tx">Log in</button> <span class="small">(single sign-on not supported)</span>'));
      }
      if (sim.side === 'nurse') return box('TransChart 3.2', para('<b>Access denied.</b> Your role (RN) does not have TransChart access. Contact the transplant coordinator.'));
      clue('donor');
      return box('TransChart 3.2 — Donor GLD-26-8817', table(null, [['Donor', '34 M, anoxic brain injury'], ['CMV / EBV', 'Positive / positive'], ['Organ', 'Whole liver, cold ischemia 7 h 40 min']]) +
        para('<b>Donor bronchoalveolar lavage, collected 09/21. FINAL 09/27.</b> <b>Klebsiella pneumoniae, ESBL-producing</b>, &gt;100,000 CFU/mL.') +
        table(['Antibiotic', 'Result'], [['Ceftriaxone', '<b>R</b>'], ['Cefepime', 'R'], ['Piperacillin-tazobactam', 'I'], ['Meropenem', 'S'], ['Ertapenem', 'S'], ['TMP-SMX', 'R']]) +
        para('Recipient team notified: auto-fax 09/27 to the transplant office (fax number on file is out of date).'));
    },

    flow() {
      const forms = [
        ['vitals', 'Vital signs flowsheet', ['Temp', 'HR', 'BP', 'RR', 'SpO2', 'O2 device']],
        ['ews', 'Early warning score calculator (re-enter vitals)', ['Temp', 'HR', 'Systolic BP', 'RR', 'SpO2', 'Level of consciousness']],
        ['weight', 'Admission navigator: weight and I&O', ['Weight (kg)', 'Intake (mL)', 'Urine output (mL)']],
      ];
      return box('Vitals and early warning score — today', VITALS + EWS()) + forms.map(([id, title, fields]) => {
        const saved = sim.chart.flow.includes(id);
        const vals = sim.flowVals[id] || {};
        return box(`${title}${saved ? ' — <span class="mar-given">saved ✓</span>' : ''}`, `
          <div class="wf-flow">${fields.map((f) => `<label>${f}<input data-flow="${id}" data-field="${esc(f)}" value="${esc(vals[f] || '')}" ${saved ? 'disabled' : ''}></label>`).join('')}</div>
          ${saved ? '' : `<p class="wf-p"><button class="ehr-btn sm" data-act="sim-flow" data-form="${id}">Save</button> All fields required.</p>`}`);
      }).join('');
    },

    assess() {
      return box(`Required assessments — ${sim.assessDone.size} of 9 documented this shift`, table(['Assessment', 'Status'], sim.conf.assessments.map((a) => [
        a, sim.assessDone.has(a) ? '<span class="mar-given">Documented ✓</span>' : `<button class="ehr-btn sm" data-act="sim-assess" data-name="${esc(a)}">Document</button>`,
      ])));
    },
  };

  function simChart() {
    const conf = SIM.SIDES[mySimSide()];
    const shadow = S.you.role === mySimSide() ? '' : `<span class="ehr-shadow">You are shadowing the ${mySimSide()} team.</span> `;
    return `
      <div class="ehr wf">
        <div class="ehr-task">
          <div>${shadow}${conf.task}</div>
          <div class="wf-clocks"><span class="wf-clock">🕐 <b data-simclock></b></span><span class="ehr-task-timer" data-timer></span></div>
        </div>
        <div class="wf-grid">
          <div class="ehr-window">
            <div class="ehr-titlebar">MedChart Enterprise 9.4.1 — RIVERBEND UNIVERSITY HOSPITAL — PRD — [${mySimSide() === 'nurse' ? 'Nursing Workspace' : 'Chart Review'}]</div>
            <div class="ehr-menu"><span>File</span><span>Edit</span><span>View</span><span>Patient</span><span>Orders</span><span>Tools</span><span>Reports</span><span>Billing</span><span>Help</span></div>
            <div class="ehr-banner">
              <b>WHITFIELD, JAMES</b> | 61 y.o. M | DOB 03/11/1965 | MRN 007731905 | 6 West bed 14 | POD 6 s/p deceased-donor liver transplant |
              Attending: Okafor, R MD | Code: FULL | Isolation: PROTECTIVE | Allergies/Intolerances: 1 active (see Allergy activity) |
              Expected discharge: 10/02 | Readmit risk: 31% | In Basket: 63 unread
            </div>
            <div class="ehr-tabs" id="sim-tabs">${conf.tabs.map(([id, label]) => `<button data-act="sim-tab" data-tab="${id}">${label}</button>`).join('')}</div>
            <div class="ehr-scroll" id="sim-body"></div>
            <div class="ehr-status">Ready | 211 notes | results pending | 22 active med orders | User: YOU | <span data-simclock></span> | CAPS</div>
            <div id="sim-alert" class="ehr-alert"></div>
            <div id="sim-down" class="wf-down"></div>
          </div>
          <aside class="wf-side" id="sim-side"></aside>
        </div>
      </div>`;
  }

  // ---------- clock-driven markers: discussion sub-steps and the current pitch ----------

  const SUBSTEPS = [[0, 'Clinical pitch', 3], [180, 'Reactions', 5], [480, 'Priorities', 2]];
  const substepsHtml = () => `<ol class="substeps" data-substeps>${SUBSTEPS.map(([from, label, min]) => `<li data-from="${from}">${label} · ${min} min</li>`).join('')}</ol>`;
  function substepTick() {
    const list = document.querySelector('[data-substeps]');
    if (!list) return;
    const e = stepElapsed();
    const items = [...list.children];
    const current = items.filter((li) => Number(li.dataset.from) <= e).pop();
    items.forEach((li) => (li === current ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current')));
  }

  // Five 1-minute pitches, then the lightning questions.
  function pitchTick() {
    if (S.step !== 'p4_pitch') return;
    const slot = Math.floor(stepElapsed() / 60);
    const letter = PACKAGE_ORDER[slot] || null;
    document.querySelectorAll('[data-pkg-card]').forEach((card) => {
      const on = card.dataset.pkgCard === letter;
      card.classList.toggle('current', on);
      if (on) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    });
    const now = document.querySelector('[data-pitchnow]');
    if (now) now.textContent = letter ? `${letter}. ${PACKAGES[letter].name}` : 'Lightning questions';
  }

  // ---------- Phase 2: the quiz ----------

  function quizNow() {
    const e = stepElapsed();
    const idx = Math.max(0, Math.min(QUIZ.length - 1, Math.floor(e / QUIZ_SECONDS)));
    const inQ = e - idx * QUIZ_SECONDS;
    return { idx, q: QUIZ[idx], reveal: inQ >= QUIZ_ANSWER_SECONDS, left: Math.max(0, Math.ceil(QUIZ_ANSWER_SECONDS - inQ)) };
  }

  let quizKey = null;
  function quizTick() {
    if (!S || S.step !== 'p2_quiz') return;
    const now = quizNow();
    const key = `${now.idx}:${now.reveal}`;
    if (key !== quizKey) {
      quizKey = key;
      const el = document.querySelector('[data-dyn="quiz"]');
      if (el) DYN.quiz(el);
    }
    document.querySelectorAll('[data-qleft]').forEach((el) => { el.textContent = now.reveal ? '' : `${now.left}s`; });
  }

  function quizCounts(q, side) {
    const counts = S.quiz[q.id];
    if (!side) return q.options.map((_, i) => counts.physician[i] + counts.nurse[i]);
    return counts[side];
  }

  function answerBars(q, counts, highlight) {
    const total = counts.reduce((a, b) => a + b, 0);
    return `<div class="qbars">${q.options.map((o, i) => `
      <div class="qbar ${highlight && q.correct === i ? 'right' : ''}">
        <span>${esc(o)}</span><span class="qbar-track"><span style="width:${pct(counts[i], total)}%"></span></span><b>${counts[i]}</b>
      </div>`).join('')}</div>`;
  }

  // ---------- Phase 5: choosing a package or a pair ----------

  function choiceSummary(key) {
    if (!key) return '<span class="muted">Pick one or two packages.</span>';
    const cost = C.choiceCost(key);
    const fixes = C.choiceFixes(key);
    const over = cost > BUDGET ? ` — over budget: needs ${money(cost - BUDGET)} more or a phased contract` : '';
    return `<b>${esc(choiceTitle(key))}</b> · <span class="${over ? 'red' : 'ok'}">${money(cost)}${over}</span> · fixes ${fixes.length}: ${fixes.join(', ')}`;
  }

  function picker(slot, current) {
    const letters = C.choiceLetters(current);
    return `
      <div class="picker">
        <div class="picker-btns">${PACKAGE_ORDER.map((l) => `
          <button class="pkbtn pk-${l} ${letters.includes(l) ? 'on' : ''}" data-act="pick" data-slot="${slot}" data-pkg="${l}">
            <span class="pkl">${l}</span><span>${PACKAGES[l].icon} ${esc(PACKAGES[l].name)}<small>${money(PACKAGES[l].cost)}</small></span>
          </button>`).join('')}</div>
        <div class="picker-sum">${choiceSummary(current)}</div>
      </div>`;
  }

  function packageCard(l, opts) {
    const pkg = PACKAGES[l];
    const top = new Set(S.problems.top5);
    const catchText = S.catchText[l];
    const showCatch = !!catchText && (opts.catches || S.catches.includes(l));
    return `
      <div class="pkcard pk-${l}" data-pkg-card="${l}">
        <div class="pkcard-head"><span class="pkl">${l}</span><span>${pkg.icon} ${esc(pkg.name)}</span><b>${money(pkg.cost)}</b></div>
        <p class="small muted">${esc(pkg.tech)}</p>
        <p>${esc(pkg.pitch)}</p>
        <div class="covers">${pkg.fixes.map((id) => `<span class="pchip ${top.has(id) ? 'ok' : ''}" title="${esc(PROBLEM[id].label)}">${id} · ${esc(PROBLEM[id].label)}</span>`).join('')}</div>
        <p class="small">${pkg.fixes.filter((id) => top.has(id)).length} of the hospital's top five</p>
        ${showCatch ? `<div class="catch ${S.catches.includes(l) ? 'revealed' : ''}"><b>${S.catches.includes(l) ? 'CATCH (revealed)' : '🔒 CATCH: reveal only when asked'}</b> ${esc(catchText)}</div>` : ''}
        ${(opts.host || opts.catches) && !S.catches.includes(l) && S.step !== 'p1_sim' ? `<button class="btn small" data-act="catch" data-pkg="${l}">Reveal catch</button>` : ''}
      </div>`;
  }

  const topFiveList = () => `<ol class="topfive">${S.problems.top5.map((id) => `<li><b>${id} · ${esc(PROBLEM[id].label)}</b><small>${esc(PROBLEM[id].desc)}</small></li>`).join('')}</ol>`;

  // ---------- Phase 6: the replay ----------

  function finalChoice() {
    return S.decision && S.decision.final;
  }

  function replayHtml(big) {
    const key = finalChoice();
    const letters = C.choiceLetters(key);
    const moments = letters.map((l) => `<div class="moment pk-${l}"><span class="pkl">${l}</span><div><b>${esc(PACKAGES[l].name)}</b><p>${esc(PACKAGES[l].replay)}</p></div></div>`).join('');
    const mine = !S.isHost && mySimSide() && S.you.sim ? myCalls() : '';
    return `
      <div class="replay ${big ? 'big' : ''}">
        <div class="eyebrow">BED 14 · SEPTEMBER 29 · REPLAYED ON ${key ? esc(choiceShort(key)) : 'THE OLD SYSTEM'}</div>
        ${key ? moments : '<p class="lead">No package was chosen. The afternoon replays exactly as before.</p>'}
        ${key ? `<div class="happy"><div class="eyebrow">THE HAPPY ENDING</div><ul class="checks">${HAPPY_ENDING.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
        ${mine}
      </div>`;
  }

  // The player's own calls in the crash, against what happened in the replay.
  function myCalls() {
    const conf = SIM.SIDES[mySimSide()];
    const made = S.you.sim.chart.decisions || {};
    const rows = conf.decisions.filter((d) => !d.text).map((d) => {
      const v = made[d.id];
      const label = (id) => (d.options.find(([o]) => o === id) || [, id])[1];
      const shown = d.multi ? (v || []).map(label).join(', ') : v ? label(v) : '';
      const ok = d.multi ? v && d.best.every((b) => v.includes(b)) : v && d.best.includes(v);
      return `<tr><td>${esc(d.q)}</td><td>${shown ? esc(shown) : '<span class="muted">not recorded</span>'}</td><td>${v ? (ok ? '✓' : '✗') : ''}</td></tr>`;
    }).join('');
    return `<details class="recall"><summary>Your ${mySimSide()} team's calls during the crash</summary><table class="calls">${rows}</table></details>`;
  }

  // ---------- the facilitator dashboard ----------

  function dashboardHtml() {
    const progress = ROLE_ORDER.map((r) => `<tr><td>${ROLES[r].icon} ${esc(ROLES[r].short)}</td><td>${S.roleCounts[r]}</td></tr>`).join('');
    const sim = ['physician', 'nurse'].map((t) => {
      const x = S.sim[t];
      const found = Object.values(x.clues).reduce((a, b) => a + b, 0);
      return `<tr><td>${t === 'physician' ? '🧑‍⚕️ Physician side' : '👩‍⚕️ Nurse side'}</td><td>${x.players} charting</td><td>${x.handled} alerts cleared (${x.overridden} by override)</td><td>${found} clue openings</td></tr>`;
    }).join('');
    const key = QUIZ.map((q) => `<tr><td>${esc(q.q)}</td><td>${esc(q.answer)}</td><td>${q.problems.join(', ')}</td></tr>`).join('');
    const calls = ['physician', 'nurse'].map((t) => `<h3>${t === 'physician' ? 'Physician' : 'Nurse'} decisions</h3><ul>${SIM.SIDES[t].decisions.filter((d) => d.best).map((d) => `<li>${esc(d.q)}: <b>${d.best.map((b) => esc((d.options.find(([o]) => o === b) || [, b])[1])).join(' or ')}</b></li>`).join('')}</ul>`).join('');
    const clues = SIM.CLUES.map((c) => `<li>${esc(c.label)} — <i>${esc(c.where)}</i></li>`).join('');
    return `
      <div class="dashboard">
        <h2>📋 Facilitator dashboard</h2>
        <h3>Team progress</h3>
        <table class="combos"><tr><th>Role</th><th>Players</th></tr>${progress}</table>
        <table class="combos"><tr><th>Simulation</th><th>Charting</th><th>Alerts</th><th>Clues</th></tr>${sim}</table>
        <p>Quiz answers: ${S.counts.quiz} · rankings: ${S.counts.rank} · stars: ${S.counts.stars} · choices: ${S.counts.picks} · votes: ${S.counts.votes}</p>
        <h3>Answer key</h3>
        <table class="combos"><tr><th>Quiz question</th><th>Answer</th><th>Problems</th></tr>${key}</table>
        ${calls}
        <h3>Where the clues are</h3><ul>${clues}</ul>
        <h3>Phase briefs (01–06)</h3>
        ${briefs.phases.map((m) => `<div class="brief">${md(m)}</div>`).join('') || '<p class="muted">Loading…</p>'}
        <h3>Stakeholder briefs (07–15)</h3>
        ${ROLE_ORDER.map((r) => (briefs.briefs[r] ? `<div class="brief">${md(briefs.briefs[r])}</div>` : '')).join('')}
      </div>`;
  }

  function openModal(html) {
    document.querySelector('.modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.dataset.act = 'closemodal';
    modal.innerHTML = `<div class="modal-box wide">${html}<button class="btn" data-act="closemodal">Close</button></div>`;
    document.body.appendChild(modal);
  }

  // ---------- step screens ----------

  function stage() {
    const host = S.isHost;
    const role = host ? null : S.you.role;
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
            <div class="eyebrow">${ROLES[role].icon} ${ROLES[role].name} · GROUP ${myGroup()}: ${esc(GROUPS[myGroup()].name.toUpperCase())}</div>
            <p class="muted">Read your brief. Its private information is yours alone, and it is meant to drive the debate.</p>
            ${briefHtml(role)}
            <p class="waiting">Waiting for the facilitator to begin<span class="dots"></span></p>
            <button class="btn ghost" data-act="rerole">Change role</button>
          </div>`;

      case 'p1_intro':
        if (host) {
          const watchers = ROLE_ORDER.filter((r) => ROLES[r].observe);
          return `
            <div class="center narrow reveal">
              <h1 class="huge">BEFORE YOU FIX IT, USE IT.</h1>
              <p class="lead">Four minutes inside Riverbend's EHR. Both teams open James Whitfield, bed 14, at 12:45 on September 29.</p>
              <div class="twocol">
                <div class="taskcard"><div class="eyebrow">🧑‍⚕️ PHYSICIAN TEAM</div><p>Find out why he is getting worse. Six decisions.</p><p class="muted small">Shadowing: executives, finance, IT</p></div>
                <div class="taskcard"><div class="eyebrow">👩‍⚕️ NURSE TEAM</div><p>Four patients, insulin due, a daughter on the phone. Five decisions.</p><p class="muted small">Shadowing: clinical leaders, compliance, advocates</p></div>
              </div>
              <p class="muted">Separate rooms. They cannot hear each other. The crash is the point. Vendors prepare their pitch.</p>
            </div>`;
        }
        if (!mySimSide()) return `<div class="center narrow"><h1>You are the vendor.</h1><p class="lead">While the clinicians work bed 14, prepare your pitch. The hospital will call you in.</p>${briefHtml(role)}</div>`;
        return `
          <div class="center narrow">
            ${S.you.role === mySimSide()
              ? briefHtml(role)
              : `<div class="taskcard"><div class="eyebrow">YOU ARE SHADOWING THE ${mySimSide().toUpperCase()} TEAM</div><p class="lead">For four minutes you see exactly the chart, alerts and pages the ${mySimSide()} team sees. Log what gets in their way.</p><p>Patient: James Whitfield, 61, bed 14, day 6 after a liver transplant. It is 12:45 on September 29.</p></div>${briefHtml(role)}`}
          </div>`;

      case 'p1_sim':
        if (!host && mySimSide()) return simChart();
        return `
          <div class="center narrow">
            <div class="eyebrow">BED 14 · JAMES WHITFIELD, 61 · DAY 6 AFTER LIVER TRANSPLANT</div>
            <p class="wf-hostclock">Ward clock <b data-simclock></b></p>
            <div class="bigtimer" data-timer="big"></div>
            <h1>${host ? 'The clinicians are charting.' : 'The clinicians are in bed 14.'}</h1>
            <p class="lead">${host ? 'Alerts speed up. At 13:02 the labs fire. At 13:03 the EHR goes down.' : 'Use the time to plan your pitch.'}</p>
            <div data-dyn="simhost"></div>
            ${host ? '' : `<div class="pkcards">${PACKAGE_ORDER.map((l) => packageCard(l, { catches: true })).join('')}</div>`}
          </div>`;

      case 'p2_quiz':
        return `
          <div class="center narrow">
            <h1>Did you spot it?</h1>
            <div data-dyn="quiz"></div>
          </div>`;

      case 'p2_rank':
        if (!host && ['physician', 'nurse'].includes(role)) {
          return `
            <div class="center narrow">
              <h1>Your team's top five</h1>
              <p class="lead">Tap the five EHR problems that hurt bed 14 most, in order. Your team's list merges with the other team's.</p>
              <div class="bigtimer side" data-timer></div>
              <div data-dyn="rank"></div>
            </div>`;
        }
        return `
          <div class="center wide">
            <h1>The physician and nurse teams rank their top five</h1>
            <div class="bigtimer side" data-timer></div>
            <div data-dyn="teamtops"></div>
          </div>`;

      case 'p3_discuss':
        if (host) {
          return `
            <div class="center wide">
              <h1>Stakeholder discussion</h1>
              ${substepsHtml()}<p class="muted">Chaired by the CEO.</p>
              <div class="split">
                <div><div class="eyebrow">HOSPITAL PROBLEM LIST (MERGED) — CLICK TO MOVE IN OR OUT OF THE TOP FIVE</div><div data-dyn="merged"></div></div>
                <div>
                  <div class="eyebrow">AGREED TOP FIVE</div><div data-dyn="top5"></div>
                  <div class="taskcard"><div class="eyebrow">PROMPTS</div><ul>
                    <li>Was this a people failure or a system failure?</li>
                    <li>Which problem, if fixed, would have caught the tacrolimus level first?</li>
                    <li>What does each group lose if nothing changes?</li></ul></div>
                </div>
              </div>
            </div>`;
        }
        if (myGroup() === 5) return `<div class="center narrow"><h1>Wait outside.</h1><p class="lead">The hospital is deciding which five problems to put to you. The CEO will call you in.</p>${briefHtml(role)}</div>`;
        return `
          <div class="center wide">
            <h1>Stakeholder discussion</h1>
            ${substepsHtml()}
            <p class="muted">${role === 'clinical' ? 'You open: present the merged problem list and the near miss in 3 minutes.' : role === 'exec' ? 'You chair. Decide: people failure or system failure? Then call in the vendor.' : 'Respond from your own brief. Use your private information.'}</p>
            <div class="bigtimer side" data-timer></div>
            <div class="split">
              <div><div class="eyebrow">STAR THE FIVE THAT MATTER MOST TO YOU</div><div data-dyn="stars"></div></div>
              <div><div class="eyebrow">AGREED TOP FIVE SO FAR</div><div data-dyn="top5"></div>${myBriefs(true)}</div>
            </div>
          </div>`;

      case 'p4_handshake':
        return `
          <div class="center narrow reveal">
            <div class="handshake">🤝</div>
            <h1 class="huge">THE CEO CALLS IN THE VENDOR.</h1>
            <p class="lead">${host ? 'The CEO shakes hands with the vendor and reads out the top five.' : role === 'exec' ? '<b>Your move:</b> shake hands with the vendor and read these five aloud.' : role === 'vendor' ? '<b>Your move:</b> shake hands with the CEO and listen.' : 'The CEO reads the top five to the vendor.'}</p>
            <div data-dyn="top5"></div>
          </div>`;

      case 'p4_pitch':
        return `
          <div class="center wide">
            <h1>Pitch fest</h1>
            <p class="muted">${host ? 'One minute per package. Then one lightning question per group. Reveal a catch only when a question reaches it.' : role === 'vendor' ? 'Pitch each package in 1 minute: technology, cost, problems fixed. Disclose a catch only when a question reaches it.' : 'One lightning question per group, at most. Green chips are in the hospital\'s top five.'}</p>
            <p class="pitchnow">Now pitching: <b data-pitchnow></b> · 1 min per package, then lightning questions</p>
            <div class="bigtimer side" data-timer></div>
            ${!host && role !== 'vendor' && briefSection(role, 'Ask the vendor') ? `<details class="recall" open><summary>Questions from your brief</summary>${md(briefSection(role, 'Ask the vendor'))}</details>` : ''}
            <div data-dyn="pkcards"></div>
            <div data-dyn="lightning"></div>
          </div>`;

      case 'p5_framing':
        return `
          <div class="center wide">
            <h1>Finance framing</h1>
            <p class="lead">${!host && role === 'finance' ? '<b>You present this</b> in 2 minutes, then chair the debate.' : 'The CFO frames the budget.'}</p>
            <div class="bigtimer side" data-timer></div>
            <div class="split">
              <div>
                <div class="capbox"><small>APPROVED CAPITAL</small><b>${money(BUDGET)}</b><span>The cap is firm. Above it needs board approval or a phased contract.</span></div>
                <div class="eyebrow">FINANCE'S ASKS BEFORE SUPPORTING ANY PACKAGE</div>
                <ol>${FINANCE_ASKS.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
              </div>
              <div>
                <div class="eyebrow">COMBINATIONS WITHIN BUDGET</div>
                <table class="combos"><tr><th>Choice</th><th>Cost</th><th>Problems fixed</th><th>Count</th></tr>
                  ${COMBOS.map((k) => `<tr><td><b>${esc(choiceShort(k))}</b></td><td>${money(C.choiceCost(k))}</td><td>${C.choiceFixes(k).join(', ')}</td><td>${C.choiceFixes(k).length}</td></tr>`).join('')}
                </table>
                <p class="small">C + D covers the most clinical risk but costs ${money(C.choiceCost('C+D'))}. Finance must find $3M or phase the work. No package fixes problem 13.</p>
              </div>
            </div>
            <div data-dyn="vendorqa"></div>
          </div>`;
      }

      case 'p5_intra':
      case 'p5_inter': {
        const inter = S.step === 'p5_inter';
        if (host) {
          return `
            <div class="center wide">
              <h1>${inter ? 'All-team discussion' : 'Team discussion'}</h1>
              <p class="muted">${inter ? 'Groups argue, trade and form coalitions. The vendor answers questions on request.' : 'Each group agrees its first and second choice.'}</p>
              <div class="bigtimer side" data-timer></div>
              <div data-dyn="groupboard"></div>
              <div data-dyn="vendorqa"></div>
              ${inter ? '<div class="taskcard"><div class="eyebrow">DEBATE PROMPTS</div><ul><li>Who is responsible when the AI is wrong?</li><li>Is it better to fix the most problems, or the problems that nearly harmed bed 14?</li><li>What is the cost of a safety miss compared with the cost of a package?</li></ul></div>' : ''}
            </div>`;
        }
        if (!isVoter()) {
          return `<div class="center wide"><h1>Answer their questions.</h1><p class="lead">Groups may call you over. You may offer milestone payments or a phased start if finance pushes.</p><div class="bigtimer side" data-timer></div><div data-dyn="vendorqa"></div>${inter ? '<div data-dyn="groupboard"></div>' : ''}<div data-dyn="pkcards"></div></div>`;
        }
        return `
          <div class="center wide">
            <h1>${inter ? 'All-team discussion' : 'Agree your first and second choice'}</h1>
            <p class="muted">${inter ? 'Argue, trade, form coalitions. You can still change your choices.' : `Talk it through with your group: ${esc(GROUPS[myGroup()].name)}.`}</p>
            <div class="bigtimer side" data-timer></div>
            <div class="split">
              <div><div class="eyebrow">YOUR FIRST CHOICE</div><div data-dyn="pick:first"></div><div class="eyebrow">YOUR SECOND CHOICE</div><div data-dyn="pick:second"></div></div>
              <div>${inter ? '<div class="eyebrow">WHERE EVERY GROUP STANDS</div><div data-dyn="groupboard"></div>' : '<div class="eyebrow">YOUR GROUP SO FAR</div><div data-dyn="myteam"></div>'}
                <div data-dyn="vendorqa"></div>
                <details class="recall"><summary>Your brief</summary>${myBriefs(true)}</details></div>
            </div>
          </div>`;
      }

      case 'p5_vote':
        if (!host && isVoter()) {
          return `
            <div class="center narrow">
              <h1>Vote</h1>
              <p class="lead">One vote per group: your group casts the choice most of its members vote for. Your spokesperson breaks ties.</p>
              <div class="bigtimer side" data-timer></div>
              <div data-dyn="pick:vote"></div>
              <div data-dyn="voteprogress"></div>
            </div>`;
        }
        return `
          <div class="center narrow">
            <h1>The hospital votes</h1>
            <p class="lead">${host ? 'Groups 1, 2, 3, 4, 6 and 7 cast one vote each. Results are sealed.' : 'Stay silent during voting. You will receive the decision from the CEO.'}</p>
            <div class="bigtimer side" data-timer></div>
            <div data-dyn="voteprogress"></div>
          </div>`;

      case 'p5_decision':
        return `
          <div class="center wide">
            <h1>The decision</h1>
            <div class="bigtimer side" data-timer></div>
            <div data-dyn="decision"></div>
          </div>`;

      case 'p6_replay':
        return `
          <div class="center wide">
            <h1>${host ? 'Bed 14, replayed' : ['physician', 'nurse'].includes(role) ? 'Replay the case on the new system' : 'Watch bed 14 replay'}</h1>
            <div data-dyn="replay"></div>
          </div>`;

      case 'p6_wrap':
        return `
          <div class="center wide reveal">
            <h1 class="huge">Next cycle, we call the vendor again.</h1>
            <div data-dyn="wrap"></div>
          </div>`;
      default:
        return '';
    }
  }

  // ---------- chrome ----------

  function topbar() {
    const ph = S.phase;
    const pill = ph >= 1 && ph <= 6 ? `PHASE ${ph}/6` : 'LOBBY';
    const dots = [1, 2, 3, 4, 5, 6].map((i) => `<i class="${i < ph ? 'done' : i === ph ? 'now' : ''}"></i>`).join('');
    const right = S.isHost
      ? `<span class="chip">ROOM <b>${esc(S.code)}</b></span>`
      : S.you.role
        ? `<button class="chip" data-act="showrole">${ROLES[S.you.role].icon} ${esc(S.you.name)} · ${ROLES[S.you.role].short}${S.you.isRep ? ' ⭐' : ''}</button>`
        : `<span class="chip">${esc(S.you.name)}</span>`;
    return `
      <header class="topbar">
        <div class="brand">🏥 <span>BED 14</span><small class="fictional">Fictional teaching case, not for clinical use</small></div>
        <div class="progress">
          <span class="pill">${pill}</span>
          <span class="roundname">${PHASE_TITLES[ph] || ''}${STEP_TITLES[S.step] ? ` · ${STEP_TITLES[S.step].toUpperCase()}` : ''}</span>
          <span class="dotrow">${dots}</span>
        </div>
        <div class="topright">
          <span class="session" data-session></span>
          <span class="timer hidden" data-timer></span>
          <button class="chip howbtn" data-act="howto" title="How to play">📖 <span>How to play</span></button>
          ${right}
        </div>
      </header>
      <div class="offline-banner">Reconnecting…</div>`;
  }

  function hostbar() {
    const lobby = S.step === 'lobby';
    const last = S.step === 'p6_wrap';
    const timed = S.timerTotal && !S.fixed;
    const nextLabel = lobby ? 'BEGIN' : S.step === 'p1_intro' ? 'START THE SIMULATION ▶' : 'NEXT ▶';
    return `
      <footer class="hostbar">
        ${lobby ? '<button class="btn ghost" data-act="leave">Close room</button>' : '<button class="btn" data-act="back">◀ BACK</button>'}
        <span class="hostbar-info" data-dyn="pcount"></span>
        <button class="btn" data-act="dashboard">📋 DASHBOARD</button>
        ${S.timerTotal ? (S.paused ? '<button class="btn primary" data-act="resume">▶ RESUME</button>' : '<button class="btn" data-act="pause">⏸ PAUSE</button>') : ''}
        ${timed ? '<button class="btn" data-act="timer-add">+1 MIN</button><button class="btn" data-act="timer-restart">RESTART TIMER</button>' : ''}
        <span class="spacer"></span>
        ${last ? '' : `<button class="btn primary" data-act="next">${nextLabel}</button>`}
      </footer>`;
  }

  // ---------- live regions ----------

  function setHtml(el, html) {
    if (el._html === html) return;
    // Keep whatever the player is typing (fields with a name) when the region redraws.
    const typed = Object.fromEntries([...el.querySelectorAll('[name]')].map((i) => [i.name, i.value]));
    const focused = el.contains(document.activeElement) && document.activeElement.name;
    el.innerHTML = html;
    el._html = html;
    for (const i of el.querySelectorAll('[name]')) if (typed[i.name]) i.value = typed[i.name];
    if (focused) el.querySelector(`[name="${focused}"]`)?.focus();
  }


  const groupLabel = (g) => `${GROUPS[g].icon} ${esc(GROUPS[g].short)}`;

  const DYN = {
    pcount(el) {
      const here = S.players.filter((p) => p.connected).length;
      setHtml(el, `👥 ${plural(S.playerCount, 'player')}${here < S.playerCount ? ` (${here} online)` : ''}`);
    },

    lobbyhost(el) {
      const counts = ROLE_ORDER.map((key) => `<div class="rolecount"><span>${ROLES[key].icon}</span><b>${S.roleCounts[key]}</b><small>${ROLES[key].short}</small></div>`).join('');
      const names = S.players.map((p) =>
        `<span class="namechip ${p.connected ? '' : 'away'}">${p.role ? ROLES[p.role].icon : '…'} ${esc(p.name)}<button title="Remove" data-act="kick" data-pub="${p.pub}">✕</button></span>`).join('');
      setHtml(el, `<div class="joined"><b>${S.playerCount}</b> player${S.playerCount === 1 ? '' : 's'} joined</div><div class="rolecounts nine">${counts}</div><div class="names">${names}</div>`);
    },

    rolepick(el) {
      setHtml(el, Object.keys(GROUPS).map((g) => {
        const roles = ROLE_ORDER.filter((r) => String(ROLES[r].group) === g);
        return `<div class="rolegroup"><div class="eyebrow">GROUP ${g} · ${esc(GROUPS[g].name.toUpperCase())}${VOTING_GROUPS.includes(Number(g)) ? '' : ' · NO VOTE'}</div>
          <div class="rolegrid">${roles.map((key) => `
            <button class="rolepick" data-act="role" data-role="${key}">
              <span class="rolepick-icon">${ROLES[key].icon}</span>
              <span class="rolepick-name">${ROLES[key].name}</span>
              <span class="rolepick-text">${esc(ROLES[key].who)}</span>
              <span class="rolepick-count">${S.roleCounts[key]} joined</span>
            </button>`).join('')}</div></div>`;
      }).join(''));
    },

    simhost(el) {
      const { physician, nurse } = S.sim;
      const stat = (n, label) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`;
      setHtml(el, `<div class="stats">
        ${stat(physician.handled + nurse.handled, 'alerts cleared by the clinicians')}
        ${stat(physician.overridden + nurse.overridden, 'cleared with one "override all" click')}
        ${stat(physician.crit.aki ? physician.crit.aki.act : 0, 'physicians acted on the kidney alert')}
        ${stat(nurse.crit.ews ? nurse.crit.ews.act : 0, 'nurses acted on the EWS 5 alert')}
      </div>`);
    },

    quiz(el) {
      const now = quizNow();
      const q = now.q;
      const watcher = S.isHost || !mySimSide();
      const head = `<div class="qhead"><span>Question ${now.idx + 1} of ${QUIZ.length}</span><span class="qleft" data-qleft>${now.reveal ? '' : `${now.left}s`}</span></div><div class="qtext">${esc(q.q)}</div>`;
      const reveal = now.reveal ? `
        <div class="qreveal">
          <div class="qanswer">${esc(q.answer)}</div>
          <div class="covers">${q.problems.map((id) => problemChip(id, 'ok')).join('')}</div>
          ${q.clue && CLUE[q.clue] ? `<p class="small muted">Where it was buried: ${esc(CLUE[q.clue].where)}</p>` : ''}
        </div>` : '';
      if (watcher) {
        const both = (side, label) => `<div><div class="eyebrow">${label}</div>${answerBars(q, quizCounts(q, side), now.reveal)}</div>`;
        setHtml(el, `${head}<div class="twocol">${both('physician', '🧑‍⚕️ PHYSICIAN SIDE')}${both('nurse', '👩‍⚕️ NURSE SIDE')}</div>${reveal}`);
        return;
      }
      const mine = S.you.quiz[q.id];
      const opts = `<div class="votes ${q.options.length > 2 ? 'grid' : 'grid'}">${q.options.map((o, i) => `
        <button class="votebtn ${mine === i ? 'on' : ''} ${now.reveal && q.correct === i ? 'yes on' : ''}" data-act="quiz" data-q="${q.id}" data-n="${i}" ${now.reveal ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`;
      let verdict = '';
      if (now.reveal) {
        const opened = S.you.sim && S.you.sim.chart.clues.includes(q.clue);
        if (q.correct !== null) verdict = mine == null ? '<p class="muted">No answer.</p>' : mine === q.correct ? '<p class="ok"><b>✓ Right.</b></p>' : '<p class="red"><b>✗ Not quite.</b></p>';
        verdict += q.clue ? `<p class="small">${opened ? 'You opened this clue during the simulation.' : 'You never opened this clue during the simulation.'}</p>` : '';
        verdict += `<div class="small muted">Your team:</div>${answerBars(q, quizCounts(q, mySimSide()), true)}`;
      }
      setHtml(el, head + opts + reveal + verdict);
    },

    rank(el) {
      const mine = S.you.rank;
      const team = S.problems.teamTop[S.you.role] || [];
      setHtml(el, `<p class="muted small">${mine.length} of ${RANK_PICKS} ranked. ★ = came up in the quiz.</p><div class="probs">` +
        PROBLEMS.map((p) => {
          const pos = mine.indexOf(p.id);
          return `
            <button class="prow ${pos >= 0 ? 'on' : ''}" data-act="rank" data-id="${p.id}" ${pos < 0 && mine.length >= RANK_PICKS ? 'disabled' : ''}>
              <span class="prow-check">${pos >= 0 ? pos + 1 : ''}</span>
              <span><b>${p.id} · ${esc(p.label)}</b><small>${esc(p.desc)}</small></span>
              <span class="prow-cat">${QUIZ_PROBLEMS.has(p.id) ? '★' : ''}${team.includes(p.id) ? ` team #${team.indexOf(p.id) + 1}` : ''}</span>
            </button>`;
        }).join('') + '</div>');
    },

    teamtops(el) {
      const col = (team, label) => {
        const ids = S.problems.teamTop[team];
        return `<div><div class="eyebrow">${label}</div>${ids.length ? `<ol class="topfive">${ids.map((id) => `<li><b>${id} · ${esc(PROBLEM[id].label)}</b></li>`).join('')}</ol>` : '<p class="muted">Ranking…</p>'}</div>`;
      };
      setHtml(el, `<div class="split">${col('physician', '🧑‍⚕️ PHYSICIAN TEAM')}${col('nurse', '👩‍⚕️ NURSE TEAM')}</div>`);
    },

    merged(el) {
      const { board, teamTop, merged, top5 } = S.problems;
      const rows = merged.map((id) => {
        const tags = [teamTop.physician.includes(id) ? '🧑‍⚕️' : '', teamTop.nurse.includes(id) ? '👩‍⚕️' : ''].join('');
        const pin = S.topOverride[id] === 'in' ? ' 📌' : S.topOverride[id] === 'out' ? ' ⛔' : '';
        return `<button class="pcard ${top5.includes(id) ? 'intop' : ''}" data-act="top" data-id="${id}"><b>${id} · ${esc(PROBLEM[id].label)}${pin}</b><span class="pcard-meta">${tags || '—'} · ★ ${board[id].stars}</span></button>`;
      }).join('');
      const missing = (S.problems.missing || []).map((t) => `<p class="red small"><b>${t === 'physician' ? 'Physician' : 'Nurse'} team ranking missing:</b> not submitted. The list uses the other team's ranking.</p>`).join('');
      setHtml(el, `${missing}<div class="mergedlist">${rows}</div>`);
    },

    top5(el) {
      const p = S.problems;
      const status = p.locked ? '<p class="ok"><b>🔒 Confirmed.</b> This list goes to the vendor.</p>'
        : !S.isHost && S.you.role === 'exec' && S.step === 'p3_discuss' ? '<button class="btn primary" data-act="confirm-top">CONFIRM THE TOP FIVE</button> <span class="small muted">Only the CEO can confirm. It locks the list.</span>'
        : S.step === 'p3_discuss' ? '<p class="small muted">The CEO confirms the list. If time runs out, the current top five locks automatically.</p>' : '';
      setHtml(el, topFiveList() + status);
    },

    lightning(el) {
      const asked = new Map(S.questions.map((q) => [q.group, q]));
      const list = S.questions.length
        ? `<ol class="qlist">${S.questions.map((q) => `<li>${groupLabel(q.group)}${q.pkg ? ` → <b>${q.pkg}</b>` : ''}: ${esc(q.text)}</li>`).join('')}</ol>`
        : '<p class="small muted">No lightning questions yet.</p>';
      let form = '';
      if (!S.isHost && myGroup() !== 5) {
        const mine = asked.get(myGroup());
        form = mine
          ? `<p class="small">Your group asked: <i>${esc(mine.text)}</i></p>`
          : `<div class="askform"><input data-question name="question" maxlength="300" placeholder="Your group's one lightning question">
              <select data-question-pkg name="question-pkg"><option value="">Any package</option>${PACKAGE_ORDER.map((l) => `<option value="${l}">${l}. ${esc(PACKAGES[l].name)}</option>`).join('')}</select>
              <button class="btn small" data-act="ask">ASK</button></div><p class="small muted">One question per group.</p>`;
      }
      setHtml(el, `<div class="taskcard"><div class="eyebrow">LIGHTNING QUESTIONS · ONE PER GROUP</div>${form}${list}</div>`);
    },

    vendorqa(el) {
      const vendor = !S.isHost && myGroup() === 5;
      const items = S.vendorQs.map((q) => `
        <li><b>${groupLabel(q.group)}:</b> ${esc(q.text)}
          ${q.answer ? `<div class="ok">Vendor: ${esc(q.answer)}</div>`
            : vendor ? `<div class="askform"><input data-answer="${q.id}" name="answer-${q.id}" maxlength="400" placeholder="Your answer"><button class="btn small" data-act="answer" data-id="${q.id}">ANSWER</button></div>`
            : '<div class="small muted">Waiting for the vendor…</div>'}</li>`).join('');
      const form = !S.isHost && !vendor ? '<div class="askform"><input data-vq name="vq" maxlength="300" placeholder="Ask the vendor a question"><button class="btn small" data-act="vq">SEND</button></div>' : '';
      setHtml(el, `<div class="taskcard"><div class="eyebrow">QUESTIONS FOR THE VENDOR</div>${form}${items ? `<ol class="qlist">${items}</ol>` : '<p class="small muted">No questions yet.</p>'}</div>`);
    },

    stars(el) {
      const mine = new Set(S.you.stars);
      const { board, teamTop, merged } = S.problems;
      setHtml(el, `<p class="muted small">${mine.size} of 5 stars used. Sorted by the clinicians' merged ranking.</p><div class="probs">` +
        merged.map((id) => {
          const p = PROBLEM[id];
          const on = mine.has(id);
          const tags = [teamTop.physician.includes(id) ? '🧑‍⚕️' : '', teamTop.nurse.includes(id) ? '👩‍⚕️' : ''].join('');
          return `
            <button class="prow star ${on ? 'on' : ''}" data-act="star" data-id="${id}" ${!on && mine.size >= 5 ? 'disabled' : ''}>
              <span class="prow-check">${on ? '★' : '☆'}</span>
              <span><b>${id} · ${esc(p.label)}</b><small>${esc(p.desc)}</small></span>
              <span class="prow-cat">${tags} ★${board[id].stars}</span>
            </button>`;
        }).join('') + '</div>');
    },

    pkcards(el) {
      const vendor = !S.isHost && S.you.role === 'vendor';
      setHtml(el, `<div class="pkcards">${PACKAGE_ORDER.map((l) => packageCard(l, { catches: vendor, host: S.isHost })).join('')}</div>`);
    },

    pick(el, slot) {
      const current = slot === 'vote' ? S.you.vote : S.you.picks[slot];
      setHtml(el, picker(slot, current));
    },

    myteam(el) {
      const g = S.groups[myGroup()];
      const rows = (tally) => Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li><b>${esc(choiceShort(k))}</b> — ${n}</li>`).join('') || '<li class="muted">No picks yet</li>';
      setHtml(el, `
        <div class="taskcard"><p>Group first choice: <b>${g.first ? esc(choiceTitle(g.first)) : '—'}</b><br>Group second choice: <b>${g.second ? esc(choiceTitle(g.second)) : '—'}</b></p>
          <div class="twocol"><div><div class="eyebrow">FIRST CHOICES</div><ul>${rows(g.firstTally)}</ul></div><div><div class="eyebrow">SECOND CHOICES</div><ul>${rows(g.secondTally)}</ul></div></div>
          ${S.reps[myGroup()] ? `<p class="small muted">Spokesperson: ⭐ ${esc(S.reps[myGroup()])}</p>` : ''}</div>`);
    },

    groupboard(el) {
      const rows = VOTING_GROUPS.map((g) => {
        const x = S.groups[g];
        const cell = (k) => (k ? `<b>${esc(choiceShort(k))}</b> <small>${money(C.choiceCost(k))}</small>` : '<span class="muted">—</span>');
        return `<tr><td>${groupLabel(g)}</td><td>${cell(x.first)}</td><td>${cell(x.second)}</td><td>${x.members}</td></tr>`;
      }).join('');
      setHtml(el, `<table class="combos"><tr><th>Group</th><th>First choice</th><th>Second choice</th><th>Members</th></tr>${rows}</table>`);
    },

    voteprogress(el) {
      setHtml(el, `<div class="rolecounts six">${VOTING_GROUPS.map((g) => `<div class="rolecount"><span>${GROUPS[g].icon}</span><b>${S.groups[g].voted}/${S.groups[g].members}</b><small>${esc(GROUPS[g].short)}</small></div>`).join('')}</div>`);
    },

    decision(el) {
      const d = S.decision;
      const { groupVotes, ranking } = S.results;
      const role = S.isHost ? null : S.you.role;
      const can = (who) => S.isHost || role === who;
      const votes = VOTING_GROUPS.map((g) => `<div class="rolecount"><span>${GROUPS[g].icon}</span><b class="repname">${groupVotes[g] ? esc(choiceShort(groupVotes[g])) : '—'}</b><small>${esc(GROUPS[g].short)}</small></div>`).join('');
      const place = (i) => (i === 0 ? 'Winner' : i === 1 ? 'Runner-up' : `${i + 1}`);
      const rank = ranking.map((r, i) => `<tr class="${r.key === d.current ? 'cur' : ''}"><td>${place(i)}</td><td><b>${esc(choiceTitle(r.key))}</b></td><td>${r.groups}</td><td>${r.people}</td><td class="${r.cost > BUDGET ? 'red' : ''}">${money(r.cost)}</td></tr>`).join('');
      const tie = S.results.tie;
      const tieHtml = tie ? `<div class="taskcard tie"><b>Tie:</b> ${tie.keys.map((k) => esc(choiceShort(k))).join(' and ')} have ${tie.groups} group votes each. <b>Tie rule: the CFO breaks the tie.</b>
          ${tie.broken ? ` The CFO chose ${esc(choiceShort(tie.broken))}.` : ' Until the CFO decides, the choice with more individual votes, then the cheaper one, leads; signing it off breaks the tie in its favor.'}
          ${!d.final && can('finance') ? tie.keys.filter((k) => k !== d.current).map((k) => ` <button class="btn small" data-act="tiebreak" data-key="${k}">BREAK THE TIE FOR ${esc(choiceShort(k))}</button>`).join('') : ''}</div>` : '';
      let action = '';
      if (d.final) {
        action = `
          <div class="winner pk-${C.choiceLetters(d.final)[0]}">
            <div class="eyebrow">THE HOSPITAL HAS DECIDED</div>
            <h1>${esc(choiceTitle(d.final))}</h1>
            <p>${money(C.choiceCost(d.final))} · fixes problems ${C.choiceFixes(d.final).join(', ')}${d.cfo === 'phased' ? ' · <b>phased contract</b>' : ''}${d.nogo ? ' · the runner-up, after a no-go' : ''}</p>
            <p class="lead">${!S.isHost && role === 'exec' ? '<b>Announce it to the vendor.</b>' : 'The CEO announces the decision to the vendor.'}</p>
            ${S.isHost ? '<button class="btn danger small" data-act="reset-decision">Reset decision (logged)</button>' : ''}
          </div>`;
      } else if (!d.current) {
        action = '<p class="lead">No votes were cast.</p>';
      } else {
        const over = C.choiceCost(d.current) > BUDGET;
        const cfoDone = d.cfo ? `<p class="ok">✓ CFO signed off${d.cfo === 'phased' ? ' as a phased contract' : ': fits the $12M budget'}.</p>` : '';
        const cfoBtns = !d.cfo && can('finance')
          ? `<button class="btn primary" data-act="decide" data-op="cfo_ok">${over ? 'APPROVE AS A PHASED CONTRACT' : 'SIGN OFF: FITS THE BUDGET'}</button>${over ? ' <button class="btn danger" data-act="decide" data-op="cfo_reject">REJECT: OVER BUDGET → RUNNER-UP</button>' : ''}`
          : !d.cfo ? '<p class="muted">Waiting for the CFO to confirm the budget…</p>' : '';
        const ceoBtns = d.cfo && can('exec')
          ? `<button class="btn primary" data-act="decide" data-op="go">GO</button> <button class="btn danger" data-act="decide" data-op="nogo">NO-GO → RUNNER-UP</button>`
          : d.cfo ? '<p class="muted">Waiting for the CEO and board: go or no-go…</p>' : '';
        action = `<div class="taskcard"><div class="eyebrow">ON THE TABLE</div><h2>${esc(choiceTitle(d.current))}</h2><p>${choiceSummary(d.current)}</p>${cfoDone}${cfoBtns}${ceoBtns}</div>`;
      }
      setHtml(el, `
        <div class="eyebrow">ONE VOTE PER GROUP</div><div class="rolecounts six">${votes}</div>
        ${tieHtml}
        <div class="split"><div><table class="combos"><tr><th>Place</th><th>Choice</th><th>Group votes</th><th>People</th><th>Cost</th></tr>${rank || '<tr><td colspan="5">No votes</td></tr>'}</table></div><div>${action}</div></div>`);
    },

    replay(el) {
      setHtml(el, replayHtml(S.isHost));
    },

    wrap(el) {
      const key = finalChoice();
      const fixed = new Set(key ? C.choiceFixes(key) : []);
      const left = PROBLEMS.filter((p) => !fixed.has(p.id));
      setHtml(el, `
        <p class="lead">${key ? `The hospital bought <b>${esc(choiceTitle(key))}</b> for ${money(C.choiceCost(key))}.` : 'The hospital bought nothing this cycle.'}</p>
        <div class="split">
          <div><div class="eyebrow">FIXED THIS CYCLE (${fixed.size})</div><div class="covers">${[...fixed].map((id) => problemChip(id, 'ok')).join('') || '<span class="muted">None</span>'}</div></div>
          <div><div class="eyebrow">CARRIED OVER TO THE NEXT VENDOR CYCLE (${left.length})</div><div class="covers">${left.map((p) => problemChip(p.id, p.id === 13 ? 'no13' : '')).join('')}</div>
            <p class="small muted">No package fixes problem 13, poor interface design, so it always carries over.</p></div>
        </div>`);
    },
  };

  // ---------- render ----------

  function render() {
    if (!S) return;
    const needsRole = !S.isHost && (!S.you.role || (repick && S.step === 'lobby'));
    loadBriefs();
    const key = S.isHost ? `H:${S.step}:${S.paused}` : `P:${needsRole ? 'pick' : S.step}`;

    if (key !== screenKey) {
      screenKey = key;
      quizKey = null;
      simStop();
      const body = needsRole
        ? `<div class="center">
             <h1>Choose your role, ${esc(S.you.name)}</h1>
             <p class="muted">Several people can share a role. Physicians and nurses play the bed 14 simulation.</p>
             <div data-dyn="rolepick"></div>
             <button class="btn" data-act="role" data-role="random">🎲 Assign me randomly</button>
           </div>`
        : stage();
      const wide = !S.isHost && !needsRole && S.step === 'p1_sim' && mySimSide();
      document.body.className = [S.isHost ? 'host' : 'player', `step-${S.step}`, wide ? 'ehr-mode' : '', online ? '' : 'offline'].join(' ');
      app.innerHTML = iconize(`${topbar()}${S.isHost ? procedure() : ''}<main class="stage">${body}</main>${S.isHost ? hostbar() : ''}`);
      window.scrollTo(0, 0);
      if (wide) simStart(mySimSide());
    }

    document.querySelectorAll('[data-dyn]').forEach((el) => {
      const [name, arg] = el.dataset.dyn.split(':');
      DYN[name](el, arg);
    });
    tick();
  }

  // ---------- events ----------

  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function pick(slot, letter) {
    const current = slot === 'vote' ? S.you.vote : S.you.picks[slot];
    let letters = C.choiceLetters(current);
    if (letters.includes(letter)) letters = letters.filter((l) => l !== letter);
    else if (letters.length >= 2) return toast('Choose at most two packages.');
    else letters = [...letters, letter];
    const key = C.normalizeChoice(letters);
    if (slot === 'vote') {
      S.you.vote = key;
      render();
      return key ? act('vote', { choice: key }) : null;
    }
    S.you.picks = { ...S.you.picks, [slot]: key };
    render();
    return act('picks', S.you.picks);
  }

  function simMar(id, op) {
    const med = DUE.find((m) => m.id === id);
    if (!med || sim.chart.mar[id]) return;
    if (op === 'hold') sim.chart.mar[id] = 'held';
    else if (op === 'scan' && med.fail && !sim.open[`fail:${id}`]) sim.open[`fail:${id}`] = true;
    else sim.chart.mar[id] = 'given';
    refresh();
    simSave();
  }

  function simFlow(form) {
    const inputs = [...document.querySelectorAll(`[data-flow="${form}"]`)];
    if (inputs.some((i) => !i.value.trim())) return toast('Required fields are missing.');
    if (!sim.chart.flow.includes(form)) sim.chart.flow.push(form);
    refresh();
    simSave();
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
        return startSession(store.get(localStorage, 'b14_host'));
      case 'leave':
        if (confirm('Leave this room? You will not be able to host it again from this browser.')) leave();
        return;
      case 'role':
        repick = false;
        return act('role', { role: el.dataset.role });
      case 'rerole':
        repick = true;
        return render();

      // Phase 1
      case 'sim-tab':
        return sim.down || showTab(el.dataset.tab);
      case 'sim-alert':
        return alertAction(el.dataset.a);
      case 'sim-open':
        return toggleOpen(el.dataset.key, el.dataset.clues);
      case 'sim-notes':
        sim.notesTab = el.dataset.sub;
        return refresh();
      case 'sim-fax':
        sim.fax = Math.min(FAX_PAGES, Math.max(1, sim.fax + Number(el.dataset.d)));
        return refresh();
      case 'sim-tx':
        sim.tx++;
        return refresh();
      case 'sim-mar':
        return simMar(el.dataset.med, el.dataset.op);
      case 'sim-flow':
        return simFlow(el.dataset.form);
      case 'sim-assess':
        sim.assessDone.add(el.dataset.name);
        sim.chart.assess = sim.assessDone.size;
        refresh();
        return simSave();
      case 'sim-reply':
        return reply(el.dataset.id, Number(el.dataset.n));
      case 'sim-dec':
        return decide(el.dataset.id, el.dataset.opt);
      case 'sim-side':
        return sideTab(el.dataset.side);
      case 'finding-add':
        return addFinding();
      case 'sim-sign': {
        const msg = document.querySelector('[data-signfail]');
        if (msg) msg.textContent = "Signing failed: orders won't sign while MedChart is down.";
        return toast("Orders won't sign: MedChart is not responding.");
      }

      // Phase 2
      case 'quiz':
        S.you.quiz[el.dataset.q] = Number(el.dataset.n);
        DYN.quiz(document.querySelector('[data-dyn="quiz"]'));
        return act('quiz', { q: el.dataset.q, n: Number(el.dataset.n) });
      case 'rank':
        S.you.rank = toggle(S.you.rank, Number(el.dataset.id)).slice(0, RANK_PICKS);
        render();
        return act('rank', { ids: S.you.rank });

      // Phase 3
      case 'star':
        S.you.stars = toggle(S.you.stars, Number(el.dataset.id)).slice(0, 5);
        render();
        return act('stars', { ids: S.you.stars });
      case 'top':
        return S.isHost ? act('top', { id: Number(el.dataset.id) }) : null;

      // Phases 4 and 5
      case 'catch':
        return act('catch', { pkg: el.dataset.pkg });
      case 'confirm-top':
        return act('confirm_top');
      case 'ask': {
        const text = document.querySelector('[data-question]');
        const pkg = document.querySelector('[data-question-pkg]');
        if (!text || !text.value.trim()) return toast('Write your question first.');
        const res = await act('question', { text: text.value, pkg: pkg ? pkg.value : '' });
        if (res) text.value = '';
        return;
      }
      case 'vq': {
        const text = document.querySelector('[data-vq]');
        if (!text || !text.value.trim()) return toast('Write your question first.');
        const res = await act('vendor_question', { text: text.value });
        if (res) text.value = '';
        return;
      }
      case 'answer': {
        const text = document.querySelector(`[data-answer="${el.dataset.id}"]`);
        if (!text || !text.value.trim()) return toast('Write your answer first.');
        return act('vendor_answer', { id: Number(el.dataset.id), text: text.value });
      }
      case 'tiebreak':
        return act('decide', { op: 'tiebreak', key: el.dataset.key });
      case 'reset-decision':
        if (confirm('Reset the decision? The reset is logged.')) act('reset_decision');
        return;
      case 'dashboard':
        return openModal(dashboardHtml());
      case 'pause':
      case 'resume':
        return act(a);
      case 'pick':
        return pick(el.dataset.slot, el.dataset.pkg);
      case 'decide':
        return act('decide', { op: el.dataset.op });

      case 'showrole':
        return openModal(myBriefs(S.phase >= 3));
      case 'closemodal':
        if (e.target === el) document.querySelector('.modal')?.remove();
        return;
      case 'next':
      case 'back':
        return act(a);
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-test=finding-text], [data-test=finding-screen]')) {
      e.preventDefault();
      addFinding();
    }
  });

  document.addEventListener('input', (e) => {
    if (!sim.active) return;
    const t = e.target;
    if (t.matches('[data-simnotes]')) {
      sim.chart.notes = t.value;
      simSave();
    } else if (t.matches('[data-simdec]')) {
      sim.chart.decisions[t.dataset.simdec] = t.value;
      simSave();
    } else if (t.matches('[data-flow]')) {
      sim.flowVals[t.dataset.flow] = { ...sim.flowVals[t.dataset.flow], [t.dataset.field]: t.value };
    }
  });

  // ---------- boot ----------

  session = store.get(sessionStorage, 'b14_session');
  if (session && session.code) connect();
  else renderHome();
})();
