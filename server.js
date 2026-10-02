'use strict';
// Fix the Hospital — zero-dependency game server.
// State lives in memory; clients receive it over Server-Sent Events and act via POST.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { ROLE_ORDER: ROLES, ROLES: ROLE_INFO, PROBLEMS, PACKAGES, MODS } = require('./public/content.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const PROBLEM_IDS = PROBLEMS.map((p) => p.id);
const PACKAGE_IDS = Object.keys(PACKAGES);
const MOD_IDS = MODS.map((m) => m.id);
const TIERS = ['critical', 'desirable', 'lower'];
const TOP_PICKS = 3;
const DANGER_MEDS = ['kcl', 'amox'];

// The host walks through these in order. `timer` is seconds; `auto` advances when it expires.
// Phase timings follow the whiteboard: 4 / 10 / 6 / 20 / 2-3 / 2-3 minutes.
const STEPS = [
  { id: 'lobby', phase: 0 },
  { id: 'p1_intro', phase: 1 },
  { id: 'p1_ehr', phase: 1, timer: 150, auto: true },
  { id: 'p1_log', phase: 1, timer: 90 },
  { id: 'p2_intra', phase: 2, timer: 240 },
  { id: 'p2_hospital', phase: 2, timer: 360 },
  { id: 'p3_handshake', phase: 3 },
  { id: 'p3_packages', phase: 3, timer: 300 },
  { id: 'p4_intra', phase: 4, timer: 420 },
  { id: 'p4_inter', phase: 4, timer: 780 },
  { id: 'p5_vote', phase: 5, timer: 150 },
  { id: 'p6_decision', phase: 6 },
  { id: 'p6_sim', phase: 6 },
  { id: 'p6_outcome', phase: 6 },
  { id: 'p6_reflect', phase: 6, timer: 120 },
  { id: 'debrief', phase: 7 },
  { id: 'reveal_cards', phase: 7 },
  { id: 'reveal_point', phase: 7 },
];
const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
const DECISION_INDEX = stepIndex('p6_decision');

// Which steps accept which player submissions.
const OPEN = {
  ehr: ['p1_ehr', 'p1_log'],
  report: ['p1_log', 'p2_intra'],
  top: ['p2_intra'],
  straw: ['p4_intra', 'p4_inter'],
  final: ['p5_vote'],
  reflect: ['p6_reflect', 'debrief', 'reveal_cards', 'reveal_point'],
  tier: ['p2_hospital', 'p3_handshake'],
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
    ehr: new Map(), // id -> { n, critMs, given }
    reports: new Map(), // id -> { problems, other }
    top: new Map(), // id -> [problem ids]
    tierOverride: {}, // problem id -> tier, set by the host
    straw: new Map(), // id -> { pkg, mods }
    final: new Map(), // id -> { pkg, mods }
    reflections: new Map(), // id -> { rating, think, missing, changes }
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

function leastFilledRole(room) {
  const counts = roleCounts(room);
  const min = Math.min(...ROLES.map((r) => counts[r]));
  const options = ROLES.filter((r) => counts[r] === min);
  return options[crypto.randomInt(options.length)];
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
    if (p && p.role) for (const id of report.problems) bump(board[id], 'reports', p.role);
  }
  for (const [pid, picks] of room.top) {
    const p = room.players.get(pid);
    if (p && p.role) for (const id of picks) bump(board[id], 'top', p.role);
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

function tallyBallots(room, ballots) {
  const zero = () => Object.fromEntries(PACKAGE_IDS.map((id) => [id, 0]));
  const counts = zero();
  const byRole = {};
  const mods = Object.fromEntries(MOD_IDS.map((id) => [id, 0]));
  let total = 0;
  for (const [pid, ballot] of ballots) {
    const p = room.players.get(pid);
    if (!p || !p.role) continue;
    counts[ballot.pkg]++;
    total++;
    byRole[p.role] = byRole[p.role] || zero();
    byRole[p.role][ballot.pkg]++;
    for (const id of ballot.mods) mods[id]++;
  }
  return { counts, byRole, mods, total };
}

// Plurality picks the package; ties go to the cheaper option. A term is adopted with majority support.
function decide(room) {
  let tally = tallyBallots(room, room.final);
  if (tally.total === 0) tally = tallyBallots(room, room.straw);
  if (tally.total === 0) return { pkg: 'keep', mods: [], tie: false, votes: 0 };
  const best = Math.max(...PACKAGE_IDS.map((id) => tally.counts[id]));
  const leaders = PACKAGE_IDS.filter((id) => tally.counts[id] === best);
  const pkg = leaders.sort((a, b) => PACKAGES[a].cost - PACKAGES[b].cost)[0];
  const mods = MODS.filter((m) => m.applies.includes(pkg) && tally.mods[m.id] * 2 > tally.total).map((m) => m.id);
  return { pkg, mods, tie: leaders.length > 1, votes: tally.total };
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
      gaveKcl: rows.filter((e) => e.given.includes('kcl')).length,
      gaveAmox: rows.filter((e) => e.given.includes('amox')).length,
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
  const state = {
    code: room.code,
    isHost,
    step: step.id,
    phase: step.phase,
    timerEnd: room.timerEnd,
    timerTotal: step.timer || null,
    now: Date.now(),
    playerCount: room.players.size,
    roleCounts: roleCounts(room),
    reps: Object.fromEntries(ROLES.map((r) => [r, repName(r)])),
    ehr: ehrSummary(room),
    problems: problemBoard(room),
    counts: {
      reports: room.reports.size,
      top: room.top.size,
      straw: room.straw.size,
      final: room.final.size,
      reflections: room.reflections.size,
    },
    straw: tallyBallots(room, room.straw),
  };
  // Final results stay sealed until the decision is announced.
  if (room.stepIndex >= DECISION_INDEX) {
    state.final = tallyBallots(room, room.final);
    state.decision = decide(room);
  }
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
  } else {
    const p = room.players.get(client.pid);
    state.you = {
      name: p.name,
      role: p.role,
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
    case 'tier': {
      if (!OPEN.tier.includes(step.id)) return 'Priorities are locked.';
      if (!PROBLEM_IDS.includes(body.id)) return 'Unknown problem.';
      const current = problemBoard(room)[body.id].tier;
      room.tierOverride[body.id] = TIERS[(TIERS.indexOf(current) + 1) % TIERS.length];
      return;
    }
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
    const role = body.role === 'random' ? leastFilledRole(room) : body.role;
    if (!ROLES.includes(role)) return 'Unknown role.';
    player.role = role;
    return;
  }
  if (!player.role) return 'Pick a role first.';

  switch (body.type) {
    case 'ehr': {
      if (!open('ehr')) return;
      const prev = room.ehr.get(player.id) || { n: 0, critMs: null, given: [] };
      const n = Math.max(prev.n, Math.min(200, parseInt(body.n, 10) || 0));
      const critMs = typeof body.critMs === 'number' && body.critMs >= 0 ? Math.round(body.critMs) : prev.critMs;
      const given = body.given ? pickIds(body.given, DANGER_MEDS, 2) : prev.given;
      room.ehr.set(player.id, { n, critMs, given });
      return;
    }
    case 'report': {
      if (!open('report')) return 'Problem reports are closed.';
      room.reports.set(player.id, {
        problems: pickIds(body.problems, PROBLEM_IDS, PROBLEM_IDS.length),
        other: clean(body.other, 200),
      });
      return;
    }
    case 'top': {
      if (!open('top')) return 'Team priorities are locked.';
      room.top.set(player.id, pickIds(body.problems, PROBLEM_IDS, TOP_PICKS));
      return;
    }
    case 'ballot': {
      const kind = body.kind === 'final' ? 'final' : 'straw';
      if (!open(kind)) return 'That vote is closed.';
      if (!PACKAGE_IDS.includes(body.pkg)) return 'Choose a package first.';
      room[kind].set(player.id, { pkg: body.pkg, mods: pickIds(body.mods, MOD_IDS, MOD_IDS.length) });
      return;
    }
    case 'reflect': {
      if (!open('reflect')) return 'The reflection form is not open.';
      const rating = parseInt(body.rating, 10);
      room.reflections.set(player.id, {
        rating: rating >= 1 && rating <= 5 ? rating : null,
        think: String(body.think || '').trim().slice(0, 600),
        missing: String(body.missing || '').trim().slice(0, 600),
        changes: String(body.changes || '').trim().slice(0, 600),
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
