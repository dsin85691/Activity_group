'use strict';
// Fix the Hospital — zero-dependency game server.
// State lives in memory; clients receive it over Server-Sent Events and act via POST.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const {
  ROLE_ORDER: ROLES, ROLES: ROLE_INFO, GROUPS, GROUP_ORDER, PROBLEMS, PACKAGES, PACKAGE_ORDER, MODULES, TERMS, PASS, TOTAL_VOTES, dealCost,
} = require('./public/content.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const PROBLEM_IDS = PROBLEMS.map((p) => p.id);
const PACKAGE_IDS = [...PACKAGE_ORDER, 'keep'];
const MODULE_IDS = MODULES.map((m) => m.id);
const TERM_IDS = TERMS.map((t) => t.id);
const TIERS = ['critical', 'desirable', 'lower'];
const TOP_PICKS = 3;
const DANGER_MEDS = ['supp', 'lact', 'insulin'];
const DOSES = ['continue', 'reduce', 'hold'];
const VOTING_GROUPS = GROUP_ORDER.filter((g) => GROUPS[g].votes > 0);
const SECRET_OWNER = {};
for (const role of ROLES) for (const sec of ROLE_INFO[role].secrets) SECRET_OWNER[sec.id] = role;
const groupOf = (player) => (player && player.role ? ROLE_INFO[player.role].group : null);
const isVoter = (player) => !!player && !!player.role && GROUPS[groupOf(player)].votes > 0;

// The host walks through these in order. `timer` is seconds; `auto` advances when it expires.
// Every part of every phase has its own countdown. Phase totals follow the plan: 4 / 10 / 6 / 20 / 3 / 3 minutes.
const STEPS = [
  { id: 'lobby', phase: 0 },
  { id: 'p1_intro', phase: 1, timer: 45 }, // read your task (not counted in the 4 minutes)
  { id: 'p1_ehr', phase: 1, timer: 60, auto: true }, // ten scripted steps, alerts from second 4, crash before the minute is up
  { id: 'p2_notes', phase: 2, timer: 180 }, // minutes 0-3: everyone logs what they hit or saw
  { id: 'p2_merge', phase: 2, timer: 300 }, // minutes 3-8: merge into one list, star what matters
  { id: 'p2_top3', phase: 2, timer: 120 }, // minutes 8-10: mark the must-fix problems, pick a spokesperson
  { id: 'p3_hospital', phase: 3, timer: 120 }, // hospital spokesperson presents
  { id: 'p3_pitch', phase: 3, timer: 240 }, // vendor: four packages, one minute each
  { id: 'p4_intra', phase: 4, timer: 480 }, // inside your team
  { id: 'p4_inter', phase: 4, timer: 720 }, // across teams
  { id: 'p5_vote', phase: 5, timer: 180 },
  { id: 'p6_decision', phase: 6, timer: 30 },
  { id: 'p6_sim', phase: 6, timer: 60 },
  { id: 'p6_outcome', phase: 6, timer: 45 },
  { id: 'p6_reflect', phase: 6, timer: 60 },
  { id: 'debrief', phase: 7 },
  { id: 'reveal_cards', phase: 7 },
  { id: 'reveal_point', phase: 7 },
];
const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
const DECISION_INDEX = stepIndex('p6_decision');
const SHARE_FROM = stepIndex('p2_notes');

// Which steps accept which player submissions.
const OPEN = {
  ehr: ['p1_ehr', 'p2_notes'],
  report: ['p2_notes', 'p2_merge'],
  top: ['p2_merge', 'p2_top3'],
  straw: ['p4_intra', 'p4_inter'],
  final: ['p5_vote'],
  reflect: ['p6_reflect', 'debrief', 'reveal_cards', 'reveal_point'],
  tier: ['p2_top3', 'p3_hospital'],
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
    timerEnd: null,
    autoTimer: null,
    players: new Map(), // secret id -> player
    ehr: new Map(), // id -> { n, critMs, given, dose }
    reports: new Map(), // id -> { problems, other }
    top: new Map(), // id -> [problem ids]
    tierOverride: {}, // problem id -> tier, set by the host
    straw: new Map(), // id -> { pkg, modules, terms }
    final: new Map(), // id -> { pkg, modules, terms }
    reflections: new Map(), // id -> { worst, fixed, surprised, gaveup, learned }
    shared: new Map(), // secret id -> { role, at }: facts and offers a team has published to the room
    reps: {}, // role -> player id
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

// ---------- game logic ----------

function enterStep(room, idx) {
  if (idx < 0 || idx >= STEPS.length) return;
  clearTimeout(room.autoTimer);
  room.autoTimer = null;
  room.stepIndex = idx;
  const step = STEPS[idx];
  room.timerEnd = step.timer ? Date.now() + step.timer * 1000 : null;

  if (step.id === 'p1_ehr') room.ehr.clear();
  // The final ballot starts from each person's position at the end of negotiation.
  if (step.id === 'p5_vote') {
    for (const [pid, ballot] of room.straw) if (!room.final.has(pid)) room.final.set(pid, ballot);
  }
  if (step.auto) {
    room.autoTimer = setTimeout(() => {
      if (room.stepIndex === idx) {
        enterStep(room, idx + 1);
        broadcast(room);
      }
    }, step.timer * 1000 + 300);
  }
}

function roleCounts(room) {
  const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
  for (const p of room.players.values()) if (p.role) counts[p.role]++;
  return counts;
}

// Random assignment follows the facilitator pack's seat plan: the role furthest below its share is filled next.
function seatPick(room, counts) {
  const c = counts || roleCounts(room);
  const ratio = (r) => c[r] / ROLE_INFO[r].target;
  const min = Math.min(...ROLES.map(ratio));
  const options = ROLES.filter((r) => ratio(r) <= min + 1e-9);
  return options[crypto.randomInt(options.length)];
}

// Host button: deal every player a seat from the plan, in random order.
function shuffleRoles(room) {
  const players = [...room.players.values()];
  for (let i = players.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [players[i], players[j]] = [players[j], players[i]];
  }
  const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
  for (const p of players) {
    p.role = seatPick(room, counts);
    counts[p.role]++;
  }
  room.reps = {};
}

// Each role team has one representative who speaks for it in hospital-wide negotiation.
function ensureReps(room) {
  if (room.stepIndex === 0) return;
  for (const role of ROLES) {
    const current = room.players.get(room.reps[role]);
    if (current && current.role === role) continue;
    const members = [...room.players.values()].filter((p) => p.role === role);
    const present = members.filter((p) => p.conns > 0);
    const pool = present.length ? present : members;
    room.reps[role] = pool.length ? pool[crypto.randomInt(pool.length)].id : null;
  }
}

function removePlayer(room, player) {
  room.players.delete(player.id);
  for (const map of [room.ehr, room.reports, room.top, room.straw, room.final, room.reflections]) map.delete(player.id);
  for (const c of [...room.clients]) {
    if (c.pid === player.id) {
      c.res.write('event: gone\ndata: {}\n\n');
      c.res.end();
      room.clients.delete(c);
    }
  }
}

// Counts per problem, then tiers: the five most-prioritized are critical, the next five desirable.
function problemBoard(room) {
  const board = Object.fromEntries(
    PROBLEM_IDS.map((id) => [id, { reports: 0, reportsByRole: {}, top: 0, topByRole: {} }])
  );
  const bump = (entry, field, role) => {
    entry[field]++;
    entry[`${field}ByRole`][role] = (entry[`${field}ByRole`][role] || 0) + 1;
  };
  for (const [pid, report] of room.reports) {
    const p = room.players.get(pid);
    if (isVoter(p)) for (const id of report.problems) bump(board[id], 'reports', p.role);
  }
  for (const [pid, picks] of room.top) {
    const p = room.players.get(pid);
    if (isVoter(p)) for (const id of picks) bump(board[id], 'top', p.role);
  }
  const ranked = [...PROBLEM_IDS].sort(
    (a, b) => board[b].top - board[a].top || board[b].reports - board[a].reports || PROBLEM_IDS.indexOf(a) - PROBLEM_IDS.indexOf(b)
  );
  ranked.forEach((id, i) => {
    board[id].rank = i;
    board[id].tier = room.tierOverride[id] || (i < 5 ? 'critical' : i < 10 ? 'desirable' : 'lower');
  });
  return board;
}

// Each group votes as a block: its package is the one most of its members chose.
// Executives carry 2 votes, the other five hospital groups 1 each, vendors none.
// A group "supports" a module or term when at least half of its members ticked it.
function tallyBallots(room, ballots) {
  const zero = () => Object.fromEntries(PACKAGE_IDS.map((id) => [id, 0]));
  const members = Object.fromEntries(VOTING_GROUPS.map((g) => [g, []]));
  for (const [pid, ballot] of ballots) {
    const p = room.players.get(pid);
    if (isVoter(p)) members[groupOf(p)].push({ p, ballot });
  }
  const cheapest = (ids) => [...ids].sort((x, y) => PACKAGES[x].price - PACKAGES[y].price)[0];
  const counts = zero();
  const picks = {};
  const split = {};
  const modules = Object.fromEntries(MODULE_IDS.map((id) => [id, 0]));
  const terms = Object.fromEntries(TERM_IDS.map((id) => [id, 0]));
  const moduleGroups = Object.fromEntries(MODULE_IDS.map((id) => [id, []]));
  const termGroups = Object.fromEntries(TERM_IDS.map((id) => [id, []]));
  let total = 0;
  let present = 0;
  for (const g of VOTING_GROUPS) {
    const list = members[g];
    split[g] = zero();
    picks[g] = null;
    if (!list.length) continue;
    total += list.length;
    present += GROUPS[g].votes;
    for (const { ballot } of list) split[g][ballot.pkg]++;
    const best = Math.max(...PACKAGE_IDS.map((id) => split[g][id]));
    const leaders = PACKAGE_IDS.filter((id) => split[g][id] === best);
    // A split team follows its representative, otherwise the cheaper option.
    const rep = list.find(({ p, ballot }) => room.reps[p.role] === p.id && leaders.includes(ballot.pkg));
    picks[g] = leaders.length === 1 ? leaders[0] : rep ? rep.ballot.pkg : cheapest(leaders);
    counts[picks[g]] += GROUPS[g].votes;
    for (const id of MODULE_IDS) {
      if (list.filter(({ ballot }) => ballot.modules.includes(id)).length * 2 >= list.length) {
        modules[id] += GROUPS[g].votes;
        moduleGroups[id].push(g);
      }
    }
    for (const id of TERM_IDS) {
      if (list.filter(({ ballot }) => ballot.terms.includes(id)).length * 2 >= list.length) {
        terms[id] += GROUPS[g].votes;
        termGroups[id].push(g);
      }
    }
  }
  // With every group seated these are 5 and 4 of 7; they scale down for small test rooms.
  const need = present ? Math.ceil((present * PASS) / TOTAL_VOTES) : PASS;
  const majority = Math.floor(present / 2) + 1;
  return { counts, picks, split, modules, terms, moduleGroups, termGroups, total, present, need, majority };
}

const termOffered = (room, term) => !term.gate || room.shared.has(term.gate);

// Turn a set of ballots into one deal: package, adopted terms, modules bought while the money lasts.
function resolve(room, ballots) {
  const tally = tallyBallots(room, ballots);
  if (!tally.present) return { pkg: 'keep', passed: false, byExec: false, empty: true, modules: [], dropped: [], droppedTerms: [], terms: [], cost: dealCost({ pkg: 'keep' }), tally };
  const ranked = [...PACKAGE_IDS].sort((x, y) => tally.counts[y] - tally.counts[x] || PACKAGES[x].price - PACKAGES[y].price);
  let pkg = ranked[0];
  const passed = tally.counts[pkg] >= tally.need;
  let byExec = false;
  if (!passed && tally.picks.exec) {
    pkg = tally.picks.exec; // no deal reached the bar: the executives decide
    byExec = true;
  }
  let terms = TERMS.filter(
    (t) => t.applies.includes(pkg) && termOffered(room, t) && tally.terms[t.id] >= tally.majority && (!t.needs || tally.termGroups[t.id].includes(t.needs))
  ).map((t) => t.id);
  // Terms that cost money are bought in order of support, and only while the budget allows.
  // Without the stretch (which finance must sign), an over-budget extra is simply not bought.
  const termCost = (id) => TERMS.find((x) => x.id === id).cost || 0;
  const droppedTerms = [];
  const paid = terms.filter((id) => termCost(id) > 0).sort((x, y) => tally.terms[y] - tally.terms[x]);
  terms = terms.filter((id) => termCost(id) <= 0);
  for (const id of paid) {
    const cost = dealCost({ pkg, modules: [], terms: [...terms, id] });
    if (cost.total <= cost.cap + 1e-9) terms.push(id);
    else droppedTerms.push(id);
  }
  // Modules are bought in order of support until the budget is reached.
  const modules = [];
  const dropped = [];
  if (pkg === 'd') {
    const wanted = MODULES.filter((m) => tally.modules[m.id] >= tally.majority).sort(
      (x, y) => tally.modules[y.id] - tally.modules[x.id] || x.price - y.price
    );
    for (const m of wanted) {
      const cost = dealCost({ pkg, modules: [...modules, m.id], terms });
      if (cost.total <= cost.cap + 1e-9) modules.push(m.id);
      else dropped.push(m.id);
    }
  }
  const trained = pkg === 'c' || modules.includes('training');
  terms = terms.filter((id) => {
    const t = TERMS.find((x) => x.id === id);
    return !t.needsModule || trained;
  });
  return { pkg, passed, byExec, empty: false, votes: tally.counts[pkg], modules, dropped, droppedTerms, terms, cost: dealCost({ pkg, modules, terms }), tally };
}

function decide(room) {
  const voted = [...room.final.keys()].some((pid) => isVoter(room.players.get(pid)));
  return resolve(room, voted ? room.final : room.straw);
}

function ehrSummary(room) {
  const sides = {};
  for (const side of ['physician', 'nurse']) {
    const rows = [...room.ehr.entries()]
      .map(([pid, e]) => ({ p: room.players.get(pid), e }))
      .filter(({ p }) => p && p.role && ROLE_INFO[p.role].side === side)
      .map(({ e }) => e);
    const crit = rows.map((e) => e.critMs).filter((ms) => typeof ms === 'number').sort((a, b) => a - b);
    sides[side] = {
      players: rows.length,
      dismissed: rows.reduce((sum, e) => sum + e.n, 0),
      critSeen: crit.length,
      critMedianMs: crit.length ? crit[Math.floor(crit.length / 2)] : null,
      stepsAvg: rows.length ? Math.round((rows.reduce((sum, e) => sum + (e.steps || 0), 0) / rows.length) * 10) / 10 : 0,
      stepsBest: rows.reduce((best, e) => Math.max(best, e.steps || 0), 0),
      gaveSupp: rows.filter((e) => e.given.includes('supp')).length,
      gaveLact: rows.filter((e) => e.given.includes('lact')).length,
      insulin: rows.filter((e) => e.given.includes('insulin')).length,
      doseContinue: rows.filter((e) => e.dose === 'continue').length,
      doseReduce: rows.filter((e) => e.dose === 'reduce').length,
      doseHold: rows.filter((e) => e.dose === 'hold').length,
      doseNone: rows.filter((e) => !e.dose).length,
    };
  }
  return sides;
}

// ---------- views ----------

function viewFor(room, client) {
  const step = STEPS[room.stepIndex];
  const isHost = client.pid === null;
  const repName = (role) => {
    const p = room.players.get(room.reps[role]);
    return p ? p.name : null;
  };
  const voters = [...room.players.values()].filter(isVoter);
  const voterIds = new Set(voters.map((p) => p.id));
  const sizeOf = (map) => [...map.keys()].filter((pid) => voterIds.has(pid)).length;
  const counts = roleCounts(room);
  const state = {
    code: room.code,
    isHost,
    step: step.id,
    phase: step.phase,
    timerEnd: room.timerEnd,
    timerTotal: step.timer || null,
    now: Date.now(),
    playerCount: room.players.size,
    voterCount: voters.length,
    roleCounts: counts,
    groupCounts: Object.fromEntries(GROUP_ORDER.map((g) => [g, ROLES.filter((r) => ROLE_INFO[r].group === g).reduce((n, r) => n + counts[r], 0)])),
    reps: Object.fromEntries(ROLES.map((r) => [r, repName(r)])),
    ehr: ehrSummary(room),
    problems: problemBoard(room),
    counts: {
      reports: sizeOf(room.reports),
      top: sizeOf(room.top),
      straw: sizeOf(room.straw),
      final: sizeOf(room.final),
      reflections: room.reflections.size,
    },
    // Facts and offers that teams have published to the whole room, oldest first.
    shared: [...room.shared.entries()].sort((x, y) => x[1].at - y[1].at).map(([id, v]) => ({ id, role: v.role })),
    straw: resolve(room, room.straw),
  };
  // Final results stay sealed until the decision is announced.
  if (room.stepIndex >= DECISION_INDEX) state.decision = decide(room);
  if (isHost) {
    state.lan = lanUrls();
    state.players = [...room.players.values()].map((p) => ({
      pub: p.pub,
      name: p.name,
      role: p.role,
      connected: p.conns > 0,
    }));
    state.others = [...room.reports.entries()]
      .map(([pid, r]) => ({ role: (room.players.get(pid) || {}).role, text: r.other }))
      .filter((o) => o.text && o.role);
    state.reflections = [...room.reflections.entries()]
      .map(([pid, r]) => ({ role: (room.players.get(pid) || {}).role, ...r }))
      .filter((r) => r.role);
    state.hostOnly = true;
  } else {
    const p = room.players.get(client.pid);
    state.you = {
      name: p.name,
      role: p.role,
      group: groupOf(p),
      votes: isVoter(p),
      isRep: !!p.role && room.reps[p.role] === p.id,
      ehr: room.ehr.get(p.id) || null,
      report: room.reports.get(p.id) || { problems: [], other: '' },
      top: room.top.get(p.id) || [],
      straw: room.straw.get(p.id) || null,
      final: room.final.get(p.id) || null,
      reflection: room.reflections.get(p.id) || null,
    };
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

// Drag and drop on the three columns: put a problem in a named column (or cycle it when no column is given).
function moveTier(room, body) {
  const step = STEPS[room.stepIndex];
  if (!OPEN.tier.includes(step.id)) return 'Priorities are locked.';
  const id = body.problem || body.id;
  if (!PROBLEM_IDS.includes(id)) return 'Unknown problem.';
  const current = problemBoard(room)[id].tier;
  room.tierOverride[id] = TIERS.includes(body.tier) ? body.tier : TIERS[(TIERS.indexOf(current) + 1) % TIERS.length];
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
    case 'end':
      enterStep(room, stepIndex('debrief'));
      return;
    case 'timer':
      if (!step.timer || step.auto) return 'No adjustable timer on this screen.';
      if (body.op === 'restart') room.timerEnd = Date.now() + step.timer * 1000;
      else room.timerEnd = Math.max(Date.now(), room.timerEnd) + 60 * 1000;
      return;
    case 'tier':
      return moveTier(room, body);
    case 'shuffle':
      if (step.id !== 'lobby') return 'Roles are locked once the simulation begins.';
      shuffleRoles(room);
      return;
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
    if (player.role && step.id !== 'lobby') return 'Roles are locked once the simulation begins.';
    const role = body.role === 'random' ? seatPick(room) : body.role;
    if (!ROLES.includes(role)) return 'Unknown role.';
    player.role = role;
    return;
  }
  if (!player.role) return 'Pick a role first.';

  switch (body.type) {
    case 'ehr': {
      if (!open('ehr')) return;
      const prev = room.ehr.get(player.id) || { n: 0, critMs: null, given: [], dose: null, steps: 0 };
      const steps = Math.max(prev.steps || 0, Math.min(10, parseInt(body.steps, 10) || 0));
      const n = Math.max(prev.n, Math.min(400, parseInt(body.n, 10) || 0));
      const critMs = typeof body.critMs === 'number' && body.critMs >= 0 ? Math.round(body.critMs) : prev.critMs;
      const given = body.given ? pickIds(body.given, DANGER_MEDS, DANGER_MEDS.length) : prev.given;
      const dose = DOSES.includes(body.dose) ? body.dose : prev.dose;
      room.ehr.set(player.id, { n, critMs, given, dose, steps });
      return;
    }
    case 'report': {
      if (!open('report')) return 'Problem notes are closed.';
      room.reports.set(player.id, {
        problems: pickIds(body.problems, PROBLEM_IDS, PROBLEM_IDS.length),
        other: clean(body.other, 200),
      });
      return;
    }
    case 'tier':
      if (!isVoter(player) || room.reps[player.role] !== player.id) return 'Only team representatives can move cards.';
      return moveTier(room, body);
    case 'top': {
      if (!isVoter(player)) return 'Vendors listen in this phase.';
      if (!open('top')) return 'Priorities are locked.';
      room.top.set(player.id, pickIds(body.problems, PROBLEM_IDS, TOP_PICKS));
      return;
    }
    // Publish one of your team's private facts or offers to the whole room.
    case 'share': {
      if (room.stepIndex < SHARE_FROM || room.stepIndex >= DECISION_INDEX) return 'Nothing can be shared right now.';
      if (SECRET_OWNER[body.secret] !== player.role) return 'That is not yours to share.';
      if (!room.shared.has(body.secret)) room.shared.set(body.secret, { role: player.role, at: Date.now() });
      return;
    }
    case 'ballot': {
      if (!isVoter(player)) return 'Vendors do not vote.';
      const kind = body.kind === 'final' ? 'final' : 'straw';
      if (!open(kind)) return 'That vote is closed.';
      if (!PACKAGE_IDS.includes(body.pkg)) return 'Choose a package first.';
      const offered = TERMS.filter((t) => termOffered(room, t) && t.applies.includes(body.pkg)).map((t) => t.id);
      room[kind].set(player.id, {
        pkg: body.pkg,
        modules: body.pkg === 'd' ? pickIds(body.modules, MODULE_IDS, MODULE_IDS.length) : [],
        terms: pickIds(body.terms, offered, offered.length),
      });
      return;
    }
    case 'reflect': {
      if (!open('reflect')) return 'The feedback form is not open.';
      const text = (v) => String(v || '').trim().slice(0, 600);
      room.reflections.set(player.id, {
        worst: PROBLEM_IDS.includes(body.worst) ? body.worst : null,
        fixed: ['yes', 'partly', 'no'].includes(body.fixed) ? body.fixed : null,
        surprised: text(body.surprised),
        gaveup: text(body.gaveup),
        learned: text(body.learned),
      });
      return;
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
      if (data.length > 20000) {
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
    let player = [...room.players.values()].find(
      (p) => p.conns === 0 && p.name.toLowerCase() === name.toLowerCase()
    );
    if (!player) {
      if (room.players.size >= 300) return sendJson(res, 400, { error: 'This room is full.' });
      player = { id: token(), pub: token().slice(0, 8), name, role: null, conns: 0 };
      room.players.set(player.id, player);
    }
    broadcast(room);
    return sendJson(res, 200, { code: room.code, id: player.id });
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
  console.log('\n  FIX THE HOSPITAL is running.\n');
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  On the same Wi-Fi:  ${url}`);
  console.log('\n  Press Ctrl+C to stop.\n');
});
