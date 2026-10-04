'use strict';
// Shared test harness: starts the game server, drives it over its HTTP API and live stream,
// and opens browser pages (Playwright) logged in as the facilitator or as a player.

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- server ----------

// Starts server.js on a random free port, or uses BASE_URL to test an already-running server.
async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL.replace(/\/$/, ''), stop() {} };
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    const ok = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 8000);
      proc.stdout.on('data', (d) => {
        if (/is running/i.test(String(d))) {
          clearTimeout(timer);
          resolve(true);
        }
      });
      proc.on('exit', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (ok) return { url: `http://localhost:${port}`, stop: () => proc.kill() };
    proc.kill();
  }
  throw new Error('Could not start server.js');
}

async function post(base, route, body) {
  const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const json = await res.json().catch(() => ({}));
  return { ...json, status: res.status, ok: res.ok };
}

// ---------- live stream ----------

// A Server-Sent Events client that keeps the latest pushed state and can wait for a condition.
function openStream(base, code, auth) {
  const s = { state: null, gone: false, waiters: [], pushes: 0 };
  s.req = http.get(`${base}/api/stream?code=${encodeURIComponent(code)}&${auth}`, (res) => {
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^event: gone/m.test(block)) s.gone = true;
        const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
        if (!data || data === '{}') continue;
        s.state = JSON.parse(data);
        s.state._receivedAt = Date.now();
        s.pushes++;
        s.waiters = s.waiters.filter((w) => {
          if (!w.pred(s.state)) return true;
          w.done(s.state);
          return false;
        });
      }
    });
  });
  s.req.on('error', () => {});
  s.until = (pred, ms = 5000, label = 'a condition') =>
    new Promise((resolve, reject) => {
      if (s.state && pred(s.state)) return resolve(s.state);
      const w = { pred };
      const timer = setTimeout(() => {
        s.waiters = s.waiters.filter((x) => x !== w);
        reject(new Error(`Timed out after ${ms} ms waiting for ${label}`));
      }, ms);
      w.done = (v) => {
        clearTimeout(timer);
        resolve(v);
      };
      s.waiters.push(w);
    });
  s.close = () => s.req.destroy();
  return s;
}

// ---------- a game session ----------

// The standard cast from the test plan: one physician team, one nurse team,
// and one player in each of groups 1, 2, 4, 5, 6 and 7.
const STANDARD_CAST = [
  ['Phy', 'physician'], ['Nur', 'nurse'], ['Ceo', 'exec'], ['Cfo', 'finance'],
  ['Cio', 'it'], ['Ven', 'vendor'], ['Law', 'compliance'], ['Adv', 'advocate'],
];

class Game {
  static async create(server) {
    const g = new Game();
    g.server = server;
    g.base = server.url;
    g.players = [];
    const r = await post(g.base, '/api/host');
    if (!r.code) throw new Error(`Could not create a session: ${JSON.stringify(r)}`);
    g.code = r.code;
    g.hostKey = r.hostKey;
    g.host = openStream(g.base, g.code, `host=${g.hostKey}`);
    await g.host.until((s) => s.step === 'lobby', 5000, 'the lobby');
    return g;
  }

  hostAct(type, extra) {
    return post(this.base, '/api/action', { code: this.code, hostKey: this.hostKey, type, ...extra });
  }

  async join(name, role) {
    const r = await post(this.base, '/api/join', { code: this.code, name });
    if (!r.id) throw new Error(`Join failed for ${name}: ${r.error || r.status}`);
    const p = { name, id: r.id, role };
    p.act = (type, extra) => post(this.base, '/api/action', { code: this.code, id: p.id, type, ...extra });
    p.stream = openStream(this.base, this.code, `id=${r.id}`);
    p.state = () => p.stream.state;
    // The harness's own stream holds the player's seat; close it to let a browser rejoin by name.
    p.reopen = async () => {
      p.stream.close();
      p.stream = openStream(this.base, this.code, `id=${r.id}`);
      await p.stream.until((s) => !!s.you, 5000, `${name}'s stream to reopen`);
    };
    await p.stream.until((s) => !!s.you, 5000, `${name}'s first state`);
    if (role) {
      const res = await p.act('role', { role });
      if (!res.ok) throw new Error(`Role ${role} refused for ${name}: ${res.error}`);
      await p.stream.until((s) => s.you.role === role, 5000, `${name} to become ${role}`);
    }
    this.players.push(p);
    return p;
  }

  // Joins the standard cast and returns it keyed by role.
  async cast(list = STANDARD_CAST) {
    const out = {};
    for (const [name, role] of list) out[role] = await this.join(name, role);
    await sleep(150);
    return out;
  }

  get step() {
    return this.host.state.step;
  }

  async next() {
    const before = this.step;
    const res = await this.hostAct('next');
    if (!res.ok) throw new Error(`NEXT refused on ${before}: ${res.error}`);
    await this.host.until((s) => s.step !== before, 5000, `the step after ${before}`);
    await sleep(120);
  }

  // Presses NEXT until the facilitator's screen reaches the step with this id.
  async goto(stepId) {
    for (let i = 0; i < 40 && this.step !== stepId; i++) {
      if (this.host.state.phase >= 6 && !this.host.state.timerEnd) break; // the last screen
      await this.next();
    }
    if (this.step !== stepId) throw new Error(`Never reached step ${stepId}`);
    await sleep(150);
  }

  // Seconds elapsed in the current timed step, on the server's clock.
  elapsed() {
    const s = this.host.state;
    if (!s.timerEnd) return 0;
    const serverNow = Date.now() + (s.now - s._receivedAt);
    return (s.timerTotal || 0) - (s.timerEnd - serverNow) / 1000;
  }

  remaining() {
    const s = this.host.state;
    if (!s.timerEnd) return null;
    return (s.timerEnd - (Date.now() + (s.now - s._receivedAt))) / 1000;
  }

  // Waits for a moment in the current step; fails if the step ends first.
  async waitUntilElapsed(sec) {
    const step = this.step;
    while (this.elapsed() < sec) {
      if (this.step !== step) throw new Error(`${step} ended before ${sec} s; an earlier check ran too long`);
      await sleep(Math.min(500, Math.max(50, (sec - this.elapsed()) * 1000)));
    }
  }

  close() {
    this.host.close();
    for (const p of this.players) p.stream.close();
  }
}

// Plays a session from the lobby to the decision with every voter choosing `choice`.
async function playToDecision(game, cast, choice) {
  await game.goto('p5_intra');
  for (const p of Object.values(cast)) if (p.role !== 'vendor') await p.act('picks', { first: choice, second: null });
  await game.goto('p5_vote');
  for (const p of Object.values(cast)) if (p.role !== 'vendor') await p.act('vote', { choice });
  await game.goto('p5_decision');
}

// ---------- browser ----------

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '@playwright/test'].filter(Boolean);
  for (const m of candidates) {
    try {
      return require(m);
    } catch {
      /* try the next one */
    }
  }
  return null;
}
const PW = loadPlaywright();
const NO_BROWSER = PW ? false : 'Playwright is not installed: run `npm install` and `npx playwright install chromium`';

async function launch(engine = process.env.ACCEPT_ENGINE || 'chromium') {
  if (!PW) return null;
  return PW[engine].launch({ executablePath: engine === 'chromium' ? process.env.CHROME_PATH || undefined : undefined });
}

// Opens the app in its own browser context (so it gets its own connection pool), already
// signed in as the facilitator (`who === 'host'`) or as a player from game.join().
async function openPage(browser, game, who, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1400, height: 900 }, reducedMotion: opts.reducedMotion || 'no-preference' });
  const isHost = who === 'host';
  if (who) {
    const session = isHost ? { code: game.code, hostKey: game.hostKey } : { code: game.code, id: who.id };
    await context.addInitScript(([s, host]) => {
      sessionStorage.setItem('b14_session', JSON.stringify(s));
      if (host) localStorage.setItem('b14_host', JSON.stringify(s));
    }, [session, isHost]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(opts.timeout || 8000);
  page.errors = [];
  page.dialogs = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => {
    page.dialogs.push(d.message());
    if (opts.dialog === 'dismiss') d.dismiss();
    else d.accept();
  });
  await page.goto(game.base);
  await page.waitForSelector('main, .stage', { timeout: 8000 });
  await sleep(300);
  return page;
}

const text = async (page, sel = 'body') => (await page.innerText(sel).catch(() => '')).replace(/\s+/g, ' ');

// ---------- the bed 14 chart ----------

// Clears the alert stack so the chart can be clicked: override if offered, otherwise acknowledge.
async function clearAlerts(page, max = 80) {
  for (let i = 0; i < max; i++) {
    if (!(await page.isVisible('#sim-alert.show').catch(() => false))) return;
    const override = await page.$('#sim-alert [data-a=override]');
    await (override || (await page.$('#sim-alert [data-a=ack]')))?.click().catch(() => {});
    await sleep(380);
  }
}

async function chartClick(page, selector) {
  for (let i = 0; i < 4; i++) {
    await clearAlerts(page);
    try {
      await page.click(selector, { timeout: 2500 });
      await sleep(150);
      return;
    } catch (err) {
      if (i === 3) throw err;
    }
  }
}

const openTab = (page, tab) => chartClick(page, `[data-act=sim-tab][data-tab=${tab}]`);
const expand = (page, key) => chartClick(page, `[data-act=sim-open][data-key="${key}"]`);
const notesSub = (page, sub) => chartClick(page, `[data-act=sim-notes][data-sub=${sub}]`);
const chartText = (page) => text(page, '#sim-body');

module.exports = {
  ROOT, sleep, startServer, post, openStream, Game, STANDARD_CAST, playToDecision,
  PW, NO_BROWSER, launch, openPage, text, clearAlerts, chartClick, openTab, expand, notesSub, chartText,
};
