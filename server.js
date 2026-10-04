'use strict';
// Bed 14: The EHR Game — zero-dependency game server.
// State lives in memory; clients receive it over Server-Sent Events and act via POST.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const C = require('./public/content.js');
const { BRIEFS, PHASE_BRIEFS, CATCHES } = require('./briefs.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const ROLES = C.ROLE_ORDER;
const PROBLEM_IDS = C.PROBLEMS.map((p) => p.id);
const CLUE_IDS = C.SIM.CLUES.map((c) => c.id);
const ALERT_ACTIONS = ['ack', 'act', 'dismiss', 'override'];
const RANKERS = ['physician', 'nurse'];
const voterRole = (role) => C.VOTING_GROUPS.includes(C.ROLES[role].group);

// The host walks through these in order. `timer` is seconds; every timed step advances when it expires.
// `fixed` steps run to a script (the simulation and the quiz), so their length can't be changed.
// Times follow the master brief: 60 minutes in total.
const STEPS = [
  { id: 'lobby', phase: 0 },
  { id: 'p1_intro', phase: 1 },
  { id: 'p1_sim', phase: 1, timer: 240, fixed: true },
  { id: 'p2_quiz', phase: 2, timer: C.QUIZ.length * C.QUIZ_SECONDS, fixed: true },
  { id: 'p2_rank', phase: 2, timer: 180 - C.QUIZ.length * C.QUIZ_SECONDS },
  { id: 'p3_discuss', phase: 3, timer: 600 },
  { id: 'p4_handshake', phase: 4, timer: 60 },
  { id: 'p4_pitch', phase: 4, timer: 360 },
  { id: 'p5_framing', phase: 5, timer: 120 },
  { id: 'p5_intra', phase: 5, timer: 360 },
  { id: 'p5_inter', phase: 5, timer: 720 },
  { id: 'p5_vote', phase: 5, timer: 180 },
  { id: 'p5_decision', phase: 5, timer: 180 },
  { id: 'p6_replay', phase: 6, timer: 600 },
  { id: 'p6_wrap', phase: 6 },
];
const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
const DECISION_INDEX = stepIndex('p5_decision');
const DISCUSS_INDEX = stepIndex('p3_discuss');
const SESSION_SECONDS = STEPS.reduce((sum, s) => sum + (s.timer || 0), 0);

// Which steps accept which submissions.
const OPEN = {
  sim: ['p1_sim', 'p2_quiz'],
  quiz: ['p2_quiz'],
  rank: ['p2_rank'],
  stars: ['p3_discuss'],
  top: ['p3_discuss', 'p4_handshake'],
  confirmTop: ['p3_discuss'],
  question: ['p4_pitch'],
  vendorQ: ['p5_framing', 'p5_intra', 'p5_inter'],
  catch: ['p4_pitch', 'p5_framing', 'p5_intra', 'p5_inter'],
  picks: ['p5_intra', 'p5_inter'],
  vote: ['p5_vote'],
  decide: ['p5_decision'],
};

const rooms = new Map();

// ---------- helpers ----------

const token = () => crypto.randomBytes(12).toString('hex');
const clean = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const pickIds = (list, allowed, max) =>
  [...new Set(Array.isArray(list) ? list : [])].filter((id) => allowed.includes(id)).slice(0, max);

function newRoom() {
  let code;
  do {
    code = String(crypto.randomInt(1000, 10000));
  } while (rooms.has(code));
  const room = {
    code,
    hostKey: token(),
    createdAt: Date.now(),
    stepIndex: 0,
    stepStart: Date.now(),
    timerEnd: null,
    autoTimer: null,
    paused: null, // { ms left, at } while the facilitator has paused
    extra: 0, // seconds added with +1 MIN
    log: [], // facilitator actions worth recording
    players: new Map(), // secret id -> player
    sim: new Map(), // id -> chart record from Phase 1
    quiz: new Map(), // id -> { questionId: option index }
    rank: new Map(), // id -> ordered problem ids (physicians and nurses)
    stars: new Map(), // id -> problem ids starred in the stakeholder discussion
    topOverride: {}, // problem id -> 'in' | 'out', set by the facilitator
    topLocked: null, // the confirmed top five
    questions: [], // lightning questions: { group, text, pkg }
    vendorQs: [], // discussion questions to the vendor: { id, group, text, answer }
    catches: new Set(), // package letters whose catch has been revealed
    picks: new Map(), // id -> { first, second }
    votes: new Map(), // id -> choice
    decision: { idx: 0, cfo: null, ceo: null, nogo: false, final: null, tiePick: null },
    reps: {}, // group -> player id
    clients: new Set(),
    flush: null,
  };
  rooms.set(code, room);
  return room;
}

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${PORT}`);
    }
  }
  return urls;
}

const membersOf = (room, test) => [...room.players.values()].filter((p) => p.role && test(p));

// ---------- game logic ----------

// Moves on by itself when the current step's timer runs out.
function schedule(room) {
  clearTimeout(room.autoTimer);
  room.autoTimer = null;
  const idx = room.stepIndex;
  if (!room.timerEnd || room.paused) return;
  room.autoTimer = setTimeout(() => {
    if (room.stepIndex === idx && !room.paused) {
      enterStep(room, idx + 1);
      broadcast(room);
    }
  }, Math.max(0, room.timerEnd - Date.now()) + 300);
}

function enterStep(room, idx) {
  if (idx < 0 || idx >= STEPS.length) return;
  const from = room.stepIndex;
  // Leaving the discussion without a confirmed list locks the room's current top five.
  if (from === DISCUSS_INDEX && idx > from && !room.topLocked) room.topLocked = problemBoard(room).top5;
  if (idx < DISCUSS_INDEX) room.topLocked = null;
  room.stepIndex = idx;
  const step = STEPS[idx];
  room.stepStart = Date.now();
  room.paused = null;
  room.timerEnd = step.timer ? Date.now() + step.timer * 1000 : null;

  if (step.id === 'p1_sim') room.sim.clear();
  if (step.id === 'p2_quiz') room.quiz.clear();
  // The final ballot starts from each person's first choice.
  if (step.id === 'p5_vote') {
    for (const [pid, picks] of room.picks) {
      if (!room.votes.has(pid) && picks.first && C.choiceCost(picks.first) <= C.BUDGET) room.votes.set(pid, picks.first);
    }
  }
  if (step.id === 'p5_decision') room.decision = { idx: 0, cfo: null, ceo: null, nogo: false, final: null, tiePick: null };
  schedule(room);
}

function pause(room) {
  if (room.paused || !room.timerEnd) return 'Nothing to pause.';
  room.paused = { ms: Math.max(0, room.timerEnd - Date.now()), at: Date.now() };
  clearTimeout(room.autoTimer);
  room.autoTimer = null;
}

function resume(room) {
  if (!room.paused) return 'The session is not paused.';
  room.stepStart += Date.now() - room.paused.at; // the quiz clock skips the pause too
  room.timerEnd = Date.now() + room.paused.ms;
  room.paused = null;
  schedule(room);
}

function roleCounts(room) {
  const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
  for (const p of room.players.values()) if (p.role) counts[p.role]++;
  return counts;
}

function leastFilledRole(room) {
  const counts = roleCounts(room);
  const min = Math.min(...ROLES.map((r) => counts[r]));
  const options = ROLES.filter((r) => counts[r] === min);
  return options[crypto.randomInt(options.length)];
}

// Each stakeholder group has one spokesperson, who also breaks ties in the group's vote.
function ensureReps(room) {
  if (room.stepIndex === 0) return;
  for (const g of Object.keys(C.GROUPS)) {
    const current = room.players.get(room.reps[g]);
    if (current && current.role && String(C.ROLES[current.role].group) === g) continue;
    const members = membersOf(room, (p) => String(C.ROLES[p.role].group) === g);
    const present = members.filter((p) => p.conns > 0);
    const pool = present.length ? present : members;
    room.reps[g] = pool.length ? pool[crypto.randomInt(pool.length)].id : null;
  }
}

function removePlayer(room, player) {
  room.players.delete(player.id);
  for (const map of [room.sim, room.quiz, room.rank, room.stars, room.picks, room.votes]) map.delete(player.id);
  for (const c of [...room.clients]) {
    if (c.pid === player.id) {
      c.res.write('event: gone\ndata: {}\n\n');
      c.res.end();
      room.clients.delete(c);
    }
  }
}

// Which quiz question is live, and whether answers are still open.
function quizNow(room) {
  const now = room.paused ? room.paused.at : Date.now();
  const sec = (now - room.stepStart) / 1000;
  const index = Math.floor(sec / C.QUIZ_SECONDS);
  return { index, open: sec - index * C.QUIZ_SECONDS < C.QUIZ_ANSWER_SECONDS };
}

// Keep only known alerts, pages, clues, decisions and charting from a Phase 1 record.
function cleanChart(raw, side, prev) {
  const conf = C.SIM.SIDES[side];
  const chart = raw && typeof raw === 'object' ? raw : {};
  const alertIds = new Set(conf.alerts.map((a) => a.id));
  const alerts = {};
  for (const [id, entry] of Object.entries(chart.alerts || {})) {
    if (alertIds.has(id) && entry && ALERT_ACTIONS.includes(entry.a)) {
      alerts[id] = {
        a: entry.a,
        ms: Math.max(0, Math.min(600000, Math.round(Number(entry.ms) || 0))),
        at: /^\d{2}:\d{2}$/.test(entry.at) ? entry.at : null,
        t: Math.max(0, Math.min(600, Math.round(Number(entry.t) || 0))),
      };
    }
  }
  const pages = {};
  for (const [id, reply] of Object.entries(chart.pages || {})) {
    const page = conf.pages.find((p) => p.id === id);
    const n = parseInt(reply, 10);
    if (page && n >= 0 && n < page.replies.length) pages[id] = n;
  }
  const decisions = {};
  for (const d of conf.decisions) {
    const value = (chart.decisions || {})[d.id];
    const opts = (d.options || []).map(([id]) => id);
    if (d.text && typeof value === 'string' && value.trim()) decisions[d.id] = value.slice(0, 800);
    else if (d.multi && Array.isArray(value)) decisions[d.id] = pickIds(value, opts, opts.length);
    else if (opts.includes(value)) decisions[d.id] = value;
  }
  const mar = {};
  for (const [id, v] of Object.entries(chart.mar || {})) if (/^[a-z]{2,10}$/.test(id) && ['given', 'held'].includes(v)) mar[id] = v;
  return {
    alerts: { ...prev.alerts, ...alerts },
    pages: { ...prev.pages, ...pages },
    clues: [...new Set([...prev.clues, ...pickIds(chart.clues, CLUE_IDS, CLUE_IDS.length)])],
    decisions,
    notes: typeof chart.notes === 'string' ? chart.notes.slice(0, 4000) : prev.notes,
    findings: Array.isArray(chart.findings)
      ? chart.findings.slice(0, 60).map((f) => ({
          text: clean(f && f.text, 300),
          screen: clean(f && f.screen, 60),
          at: f && /^\d{2}:\d{2}$/.test(f.at) ? f.at : null,
          t: Math.max(0, Math.min(600, Math.round(Number(f && f.t) || 0))),
        })).filter((f) => f.text)
      : prev.findings,
    mar: { ...prev.mar, ...mar },
    flow: pickIds(chart.flow, ['vitals', 'ews', 'weight'], 3),
    assess: Math.max(0, Math.min(9, parseInt(chart.assess, 10) || 0)),
    overrides: Math.max(prev.overrides, Math.min(500, parseInt(chart.overrides, 10) || 0)),
  };
}
const emptyChart = () => ({ alerts: {}, pages: {}, clues: [], decisions: {}, notes: '', findings: [], mar: {}, flow: [], assess: 0, overrides: 0 });

function simSummary(room) {
  const sides = {};
  for (const side of ['physician', 'nurse']) {
    const conf = C.SIM.SIDES[side];
    const charts = [...room.sim.entries()]
      .filter(([pid]) => {
        const p = room.players.get(pid);
        return p && p.role && C.ROLES[p.role].sim === side;
      })
      .map(([, e]) => e.chart);
    const handled = charts.reduce((sum, c) => sum + Object.keys(c.alerts).length, 0);
    const overridden = charts.reduce((sum, c) => sum + Object.values(c.alerts).filter((a) => a.a === 'override').length, 0);
    const crit = {};
    for (const a of conf.alerts.filter((x) => x.crit)) {
      crit[a.id] = { ack: 0, act: 0, dismiss: 0, override: 0, missed: 0 };
      for (const c of charts) crit[a.id][c.alerts[a.id] ? c.alerts[a.id].a : 'missed']++;
    }
    const clues = Object.fromEntries(CLUE_IDS.map((id) => [id, charts.filter((c) => c.clues.includes(id)).length]));
    sides[side] = { players: charts.length, handled, overridden, crit, clues };
  }
  return sides;
}

function quizSummary(room) {
  const out = {};
  for (const q of C.QUIZ) out[q.id] = { physician: q.options.map(() => 0), nurse: q.options.map(() => 0) };
  for (const [pid, answers] of room.quiz) {
    const p = room.players.get(pid);
    const side = p && p.role && C.ROLES[p.role].sim;
    if (!side) continue;
    for (const [qid, n] of Object.entries(answers)) if (out[qid]) out[qid][side][n]++;
  }
  return out;
}

// Each team's ranking is a Borda count over its members; the merged list adds both teams, size-adjusted.
function problemBoard(room) {
  const board = Object.fromEntries(PROBLEM_IDS.map((id) => [id, { physician: 0, nurse: 0, merged: 0, stars: 0 }]));
  const sizes = { physician: 0, nurse: 0 };
  for (const [pid, list] of room.rank) {
    const p = room.players.get(pid);
    if (!p || !RANKERS.includes(p.role)) continue;
    sizes[p.role]++;
    list.forEach((id, i) => { board[id][p.role] += C.RANK_PICKS - i; });
  }
  for (const id of PROBLEM_IDS) {
    for (const team of RANKERS) if (sizes[team]) board[id].merged += board[id][team] / sizes[team];
  }
  for (const [pid, list] of room.stars) if (room.players.has(pid)) for (const id of list) board[id].stars++;
  const teamTop = {};
  for (const team of RANKERS) {
    teamTop[team] = [...PROBLEM_IDS].filter((id) => board[id][team] > 0).sort((a, b) => board[b][team] - board[a][team] || a - b).slice(0, C.RANK_PICKS);
  }
  const merged = [...PROBLEM_IDS].sort((a, b) => board[b].merged - board[a].merged || a - b);
  const top5 = room.topLocked ? [...room.topLocked] : [...PROBLEM_IDS]
    .filter((id) => room.topOverride[id] !== 'out')
    .sort((a, b) =>
      (room.topOverride[b] === 'in') - (room.topOverride[a] === 'in') ||
      board[b].stars - board[a].stars || board[b].merged - board[a].merged || a - b)
    .slice(0, 5);
  return { board, teamTop, merged, top5, locked: !!room.topLocked, missing: RANKERS.filter((t) => !sizes[t]) };
}

// The plurality of a list of choices; ties go to the tie-breaker's pick, then the cheaper choice.
function plurality(choices, prefer) {
  const tally = {};
  for (const c of choices) if (c) tally[c] = (tally[c] || 0) + 1;
  const keys = Object.keys(tally);
  if (!keys.length) return { winner: null, tally };
  const best = Math.max(...keys.map((k) => tally[k]));
  const leaders = keys.filter((k) => tally[k] === best);
  const winner = leaders.includes(prefer) ? prefer : leaders.sort((a, b) => C.choiceCost(a) - C.choiceCost(b) || a.localeCompare(b))[0];
  return { winner, tally };
}

function groupBoard(room) {
  const out = {};
  for (const g of C.VOTING_GROUPS) {
    const members = membersOf(room, (p) => C.ROLES[p.role].group === g);
    const rep = room.reps[g];
    const picks = members.map((p) => ({ pid: p.id, ...(room.picks.get(p.id) || {}) }));
    const repPick = room.picks.get(rep) || {};
    const first = plurality(picks.map((x) => x.first), repPick.first);
    const second = plurality(picks.map((x) => x.second), repPick.second);
    const voted = members.filter((p) => room.votes.has(p.id)).length;
    out[g] = { members: members.length, first: first.winner, firstTally: first.tally, second: second.winner, secondTally: second.tally, voted };
  }
  return out;
}

// One vote per group: the group's plurality, with the spokesperson breaking ties.
function results(room) {
  const groupVotes = {};
  const people = {};
  for (const g of C.VOTING_GROUPS) {
    const members = membersOf(room, (p) => C.ROLES[p.role].group === g);
    const ballots = members.map((p) => room.votes.get(p.id) || (room.picks.get(p.id) || {}).first).filter(Boolean);
    for (const b of ballots) people[b] = (people[b] || 0) + 1;
    const { winner } = plurality(ballots, room.votes.get(room.reps[g]));
    if (winner) groupVotes[g] = winner;
  }
  const groups = {};
  for (const key of Object.values(groupVotes)) groups[key] = (groups[key] || 0) + 1;
  const pick = room.decision.tiePick;
  const ranking = Object.keys(people)
    .sort((a, b) => (groups[b] || 0) - (groups[a] || 0) || (b === pick) - (a === pick) || people[b] - people[a] || C.choiceCost(a) - C.choiceCost(b) || a.localeCompare(b))
    .map((key) => ({ key, groups: groups[key] || 0, people: people[key], cost: C.choiceCost(key) }));
  const top = ranking[0] ? ranking[0].groups : 0;
  const tied = ranking.filter((r) => r.groups === top && top > 0).map((r) => r.key);
  const tie = tied.length > 1 ? { keys: tied, groups: top, broken: pick && tied.includes(pick) ? pick : null } : null;
  return { groupVotes, ranking, tie };
}

// The CFO signs off on budget; the CEO and board give the go/no-go. On a no-go, the runner-up goes forward.
function decisionView(room, res) {
  const d = room.decision;
  const current = res.ranking[d.idx] ? res.ranking[d.idx].key : null;
  const final = d.final || (room.stepIndex > DECISION_INDEX ? current : null);
  return { ...d, current, final };
}

// ---------- views ----------

function viewFor(room, client) {
  const step = STEPS[room.stepIndex];
  const isHost = client.pid === null;
  const repName = (g) => {
    const p = room.players.get(room.reps[g]);
    return p ? p.name : null;
  };
  const state = {
    code: room.code,
    isHost,
    step: step.id,
    phase: step.phase,
    timerEnd: room.timerEnd,
    timerTotal: step.timer || null,
    paused: !!room.paused,
    pausedMs: room.paused ? room.paused.ms : null,
    fixed: !!step.fixed,
    // Seconds of planned time in the steps after this one, and the session's planned total.
    sessionAfter: STEPS.slice(room.stepIndex + 1).reduce((sum, s) => sum + (s.timer || 0), 0),
    sessionTotal: SESSION_SECONDS + room.extra,
    overtime: room.extra > 0,
    now: Date.now(),
    playerCount: room.players.size,
    roleCounts: roleCounts(room),
    reps: Object.fromEntries(Object.keys(C.GROUPS).map((g) => [g, repName(g)])),
    sim: simSummary(room),
    quiz: quizSummary(room),
    problems: problemBoard(room),
    topOverride: room.topOverride,
    catches: [...room.catches],
    catchText: Object.fromEntries([...room.catches].map((l) => [l, CATCHES[l]])),
    questions: room.questions,
    vendorQs: room.vendorQs,
    groups: groupBoard(room),
    counts: { quiz: room.quiz.size, rank: room.rank.size, stars: room.stars.size, picks: room.picks.size, votes: room.votes.size },
  };
  // Results stay sealed until the decision step.
  if (room.stepIndex >= DECISION_INDEX) {
    const res = results(room);
    state.results = res;
    state.decision = decisionView(room, res);
  }
  if (isHost) {
    state.lan = lanUrls();
    state.players = [...room.players.values()].map((p) => ({ pub: p.pub, name: p.name, role: p.role, connected: p.conns > 0 }));
    state.log = room.log;
    state.notes = [...room.sim.entries()]
      .map(([pid, e]) => ({ role: (room.players.get(pid) || {}).role, text: e.chart.notes }))
      .filter((n) => n.role && n.text);
  } else {
    const p = room.players.get(client.pid);
    const group = p.role ? C.ROLES[p.role].group : null;
    state.you = {
      name: p.name,
      role: p.role,
      isRep: !!group && room.reps[group] === p.id,
      sim: room.sim.get(p.id) || null,
      quiz: room.quiz.get(p.id) || {},
      rank: room.rank.get(p.id) || [],
      stars: room.stars.get(p.id) || [],
      picks: room.picks.get(p.id) || { first: null, second: null },
      vote: room.votes.get(p.id) || null,
    };
    // During the intra-team discussion each group sees only its own choices.
    if (step.id === 'p5_intra') state.groups = group && state.groups[group] ? { [group]: state.groups[group] } : {};
    if (group === 5) state.catchText = CATCHES;
  }
  return state;
}

// Coalesce bursts of changes into one push per client.
function broadcast(room) {
  if (room.flush) return;
  room.flush = setTimeout(() => {
    room.flush = null;
    ensureReps(room);
    for (const c of room.clients) {
      if (c.pid !== null && !room.players.has(c.pid)) continue;
      c.res.write(`data: ${JSON.stringify(viewFor(room, c))}\n\n`);
    }
  }, 40);
}

// ---------- actions ----------

// Moves shared by the facilitator and the CFO/CEO players.
function decide(room, op, key) {
  const d = room.decision;
  const { ranking } = results(room);
  const current = ranking[d.idx];
  if (d.final) return 'The decision is already made.';
  if (!current) return 'No votes were cast.';
  switch (op) {
    case 'tiebreak': {
      const res = results(room);
      if (!res.tie || !res.tie.keys.includes(key)) return 'There is no tie to break with that choice.';
      d.tiePick = key;
      d.idx = 0;
      d.cfo = null;
      return;
    }
    case 'cfo_ok':
      d.cfo = current.cost > C.BUDGET ? 'phased' : 'ok';
      return;
    case 'cfo_reject':
      if (current.cost <= C.BUDGET) return 'This choice fits the budget.';
      if (!ranking[d.idx + 1]) return 'There is no runner-up.';
      d.idx++;
      d.cfo = null;
      return;
    case 'go':
      if (!d.cfo) return 'The CFO signs off first.';
      d.ceo = 'go';
      d.final = current.key;
      return;
    case 'nogo': {
      if (!d.cfo) return 'The CFO signs off first.';
      const next = ranking[d.idx + 1];
      if (!next) return 'There is no runner-up to send forward.';
      d.idx++;
      d.ceo = 'nogo';
      d.nogo = true;
      d.cfo = next.cost > C.BUDGET ? 'phased' : 'ok';
      d.final = next.key;
      return;
    }
    default:
      return 'Unknown decision.';
  }
}

function revealCatch(room, step, pkg) {
  if (!OPEN.catch.includes(step.id)) return 'Catches can be revealed during the pitch and discussion.';
  if (!C.PACKAGES[pkg]) return 'Unknown package.';
  room.catches.add(pkg);
}

function hostAction(room, body) {
  const step = STEPS[room.stepIndex];
  switch (body.type) {
    case 'next':
      enterStep(room, room.stepIndex + 1);
      return;
    case 'back':
      enterStep(room, room.stepIndex - 1);
      return;
    case 'timer':
      if (!step.timer || step.fixed) return 'No adjustable timer on this screen.';
      if (room.paused) {
        room.paused.ms = body.op === 'restart' ? step.timer * 1000 : room.paused.ms + 60 * 1000;
      } else if (body.op === 'restart') {
        room.timerEnd = Date.now() + step.timer * 1000;
      } else {
        room.timerEnd = Math.max(Date.now(), room.timerEnd) + 60 * 1000;
      }
      if (body.op !== 'restart') room.extra += 60;
      schedule(room);
      return;
    case 'top': {
      if (!OPEN.top.includes(step.id) || room.topLocked) return 'The top five is locked.';
      const id = Number(body.id);
      if (!PROBLEM_IDS.includes(id)) return 'Unknown problem.';
      const inTop = problemBoard(room).top5.includes(id);
      room.topOverride[id] = inTop ? 'out' : 'in';
      return;
    }
    case 'catch':
      return revealCatch(room, step, body.pkg);
    case 'decide':
      if (!OPEN.decide.includes(step.id)) return 'Not the decision step.';
      return decide(room, body.op, body.key);
    case 'reset_decision':
      if (step.id !== 'p5_decision' && step.id !== 'p6_replay') return 'Nothing to reset.';
      room.decision = { idx: 0, cfo: null, ceo: null, nogo: false, final: null, tiePick: null };
      room.log.push({ at: Date.now(), text: 'Decision reset by the facilitator' });
      if (step.id !== 'p5_decision') enterStep(room, DECISION_INDEX);
      return;
    case 'pause':
      return pause(room);
    case 'resume':
      return resume(room);
    case 'kick': {
      const player = [...room.players.values()].find((p) => p.pub === body.pub);
      if (player) removePlayer(room, player);
      return;
    }
    default:
      return 'Unknown action.';
  }
}

function playerAction(room, player, body) {
  const step = STEPS[room.stepIndex];
  const open = (kind) => OPEN[kind].includes(step.id);
  if (body.type === 'role') {
    if (player.role && step.id !== 'lobby') return 'Roles are locked once the game begins.';
    const role = body.role === 'random' ? leastFilledRole(room) : body.role;
    if (!ROLES.includes(role)) return 'Unknown role.';
    player.role = role;
    return;
  }
  if (!player.role) return 'Pick a role first.';
  const info = C.ROLES[player.role];

  switch (body.type) {
    case 'sim': {
      if (!open('sim') || !info.sim) return;
      const prev = room.sim.get(player.id) || { chart: emptyChart() };
      room.sim.set(player.id, { chart: body.chart ? cleanChart(body.chart, info.sim, prev.chart) : prev.chart });
      return;
    }
    case 'quiz': {
      if (!open('quiz') || !info.sim) return 'The quiz is closed.';
      const now = quizNow(room);
      const q = C.QUIZ[now.index];
      const n = parseInt(body.n, 10);
      if (!q || q.id !== body.q || !now.open) return 'Too late for that question.';
      if (!(n >= 0 && n < q.options.length)) return 'Unknown answer.';
      const answers = room.quiz.get(player.id) || {};
      answers[q.id] = n;
      room.quiz.set(player.id, answers);
      return;
    }
    case 'rank':
      if (!open('rank')) return 'Rankings are closed.';
      if (!RANKERS.includes(player.role)) return 'Only the physician and nurse teams rank.';
      room.rank.set(player.id, pickIds((body.ids || []).map(Number), PROBLEM_IDS, C.RANK_PICKS));
      return;
    case 'stars':
      if (!open('stars')) return 'Priorities are closed.';
      if (info.group === 5) return 'Vendors wait outside during the discussion.';
      room.stars.set(player.id, pickIds((body.ids || []).map(Number), PROBLEM_IDS, 5));
      return;
    case 'confirm_top':
      if (!open('confirmTop')) return 'The top five can only be confirmed during the discussion.';
      if (player.role !== 'exec') return 'Only the CEO confirms the top five.';
      if (room.topLocked) return 'The top five is already confirmed.';
      room.topLocked = problemBoard(room).top5;
      return;
    case 'question': {
      if (!open('question')) return 'Lightning questions are taken during the pitch fest.';
      if (info.group === 5) return 'Vendors answer questions; they do not ask them.';
      if (room.questions.some((q) => q.group === info.group)) return 'Your group has already asked its lightning question.';
      const text = clean(body.text, 300);
      if (!text) return 'Write your question first.';
      room.questions.push({ group: info.group, text, pkg: C.PACKAGES[body.pkg] ? body.pkg : null });
      return;
    }
    case 'catch':
      if (info.group !== 5) return 'Only the vendor reveals a catch.';
      return revealCatch(room, step, body.pkg);
    case 'vendor_question': {
      if (!open('vendorQ')) return 'Questions to the vendor are taken during the discussion.';
      if (info.group === 5) return 'Vendors answer questions; they do not ask them.';
      const text = clean(body.text, 300);
      if (!text) return 'Write your question first.';
      if (room.vendorQs.length >= 100) return 'Too many questions.';
      room.vendorQs.push({ id: room.vendorQs.length + 1, group: info.group, text, answer: null });
      return;
    }
    case 'vendor_answer': {
      if (info.group !== 5) return 'Only the vendor answers.';
      const q = room.vendorQs.find((x) => x.id === Number(body.id)) || room.vendorQs.find((x) => !x.answer);
      if (!q) return 'No question to answer.';
      q.answer = clean(body.text, 400) || null;
      return;
    }
    case 'picks': {
      if (!open('picks')) return 'Choices are closed.';
      if (!voterRole(player.role)) return 'Vendors do not vote.';
      const first = C.normalizeChoice(C.choiceLetters(body.first));
      const second = C.normalizeChoice(C.choiceLetters(body.second));
      room.picks.set(player.id, { first, second: second === first ? null : second });
      return;
    }
    case 'vote': {
      if (!open('vote')) return 'Voting is closed.';
      if (!voterRole(player.role)) return 'Vendors do not vote.';
      const choice = C.normalizeChoice(C.choiceLetters(body.choice));
      if (!choice) return 'Choose one or two packages.';
      if (C.choiceCost(choice) > C.BUDGET) return `${choice.replace('+', ' + ')} costs $${C.choiceCost(choice)}M, over the $${C.BUDGET}M cap. Vote for a choice within budget.`;
      room.votes.set(player.id, choice);
      return;
    }
    case 'decide': {
      if (!open('decide')) return 'Not the decision step.';
      const cfo = ['cfo_ok', 'cfo_reject', 'tiebreak'].includes(body.op);
      if (cfo && player.role !== 'finance') return 'Only the CFO signs off the budget.';
      if (!cfo && player.role !== 'exec') return 'Only the CEO and board give the go/no-go.';
      return decide(room, body.op, body.key);
    }
    default:
      return 'Unknown action.';
  }
}

// ---------- http ----------

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 30000) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC, rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

function openStream(req, res, query) {
  const room = rooms.get(query.get('code'));
  const isHost = room && query.get('host') === room.hostKey;
  const player = room && !isHost ? room.players.get(query.get('id')) : null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (!room || (!isHost && !player)) {
    res.write('event: gone\ndata: {}\n\n');
    return res.end();
  }
  const client = { res, pid: isHost ? null : player.id };
  room.clients.add(client);
  if (player) player.conns++;
  res.write(`retry: 2000\ndata: ${JSON.stringify(viewFor(room, client))}\n\n`);
  broadcast(room);
  req.on('close', () => {
    if (!room.clients.delete(client)) return;
    if (player) player.conns = Math.max(0, player.conns - 1);
    broadcast(room);
  });
}

async function handleApi(req, res, pathname) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: 'Bad request.' });
  }

  if (pathname === '/api/host') {
    const room = newRoom();
    return sendJson(res, 200, { code: room.code, hostKey: room.hostKey });
  }

  const room = rooms.get(String(body.code || '').trim());
  if (!room) return sendJson(res, 404, { error: 'No game found with that room code.' });

  if (pathname === '/api/join') {
    const name = clean(body.name, 24);
    if (!name) return sendJson(res, 400, { error: 'Enter your name.' });
    // Someone who lost their tab gets their seat back by rejoining under the same name.
    let player = [...room.players.values()].find((p) => p.conns === 0 && p.name.toLowerCase() === name.toLowerCase());
    if (!player) {
      if (room.players.size >= 300) return sendJson(res, 400, { error: 'This room is full.' });
      player = { id: token(), pub: token().slice(0, 8), name, role: null, conns: 0 };
      room.players.set(player.id, player);
    }
    broadcast(room);
    return sendJson(res, 200, { code: room.code, id: player.id });
  }

  if (pathname === '/api/briefs') {
    if (body.hostKey) {
      if (body.hostKey !== room.hostKey) return sendJson(res, 403, { error: 'Not the host.' });
      return sendJson(res, 200, { briefs: BRIEFS, phases: PHASE_BRIEFS, catches: CATCHES });
    }
    const player = room.players.get(body.id);
    if (!player) return sendJson(res, 403, { error: 'You are no longer in this room.' });
    if (!player.role) return sendJson(res, 200, { briefs: {} });
    const allowed = [player.role, C.GROUP_BRIEF[player.role]].filter(Boolean);
    return sendJson(res, 200, { briefs: Object.fromEntries(allowed.map((r) => [r, BRIEFS[r]])) });
  }

  if (pathname === '/api/action') {
    let result;
    if (body.hostKey) {
      if (body.hostKey !== room.hostKey) return sendJson(res, 403, { error: 'Not the host.' });
      result = hostAction(room, body);
    } else {
      const player = room.players.get(body.id);
      if (!player) return sendJson(res, 403, { error: 'You are no longer in this room.' });
      result = playerAction(room, player, body);
    }
    if (typeof result === 'string') return sendJson(res, 400, { error: result });
    broadcast(room);
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: 'Not found.' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/stream') return openStream(req, res, url.searchParams);
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) return handleApi(req, res, url.pathname);
  if (req.method === 'GET') return serveStatic(req, res, url.pathname);
  res.writeHead(405);
  res.end();
});

// Keep idle SSE connections alive through proxies, and drop stale rooms.
setInterval(() => {
  for (const room of rooms.values()) {
    for (const c of room.clients) c.res.write(': ping\n\n');
    if (Date.now() - room.createdAt > ROOM_TTL_MS && room.clients.size === 0) {
      clearTimeout(room.autoTimer);
      rooms.delete(room.code);
    }
  }
}, 20000).unref();

server.listen(PORT, () => {
  console.log('\n  BED 14: THE EHR GAME is running.\n');
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  On the same Wi-Fi:  ${url}`);
  console.log('\n  Press Ctrl+C to stop.\n');
});
