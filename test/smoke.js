'use strict';
// Smoke test: plays one whole game through the HTTP API with 30 scripted players.
// Run with: npm test
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const C = require('../public/content.js');

const PORT = 3999;
const base = `http://localhost:${PORT}`;
const post = async (url, body) => {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
};
// Read one state push from the SSE stream.
async function state(code, auth) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream?code=${code}&${auth}`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  let buf = '';
  let latest = null;
  const until = Date.now() + 400;
  while (Date.now() < until) {
    const chunk = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r(null), 150))]);
    if (!chunk) continue;
    if (chunk.done) break;
    buf += Buffer.from(chunk.value).toString();
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (line && line.length > 10) latest = JSON.parse(line.slice(6));
    }
  }
  ctrl.abort();
  return latest;
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const { json: host } = await post('/api/host');
    const H = { code: host.code, hostKey: host.hostKey };
    const players = [];
    for (let i = 0; i < 30; i++) players.push((await post('/api/join', { code: H.code, name: `P${i}` })).json.id);
    await post('/api/action', { ...H, type: 'shuffle' });
    let s = await state(H.code, `host=${H.hostKey}`);
    console.log('seats after shuffle:', JSON.stringify(s.roleCounts));
    for (const r of C.ROLE_ORDER) assert(s.roleCounts[r] >= 2, `role ${r} underfilled`);
    assert.strictEqual(Object.values(s.roleCounts).reduce((a, b) => a + b, 0), 30);

    const roleOf = {};
    for (const id of players) roleOf[id] = (await state(H.code, `id=${id}`)).you.role;
    const act = (id, type, extra) => post('/api/action', { code: H.code, id, type, ...extra });
    const next = () => post('/api/action', { ...H, type: 'next' });
    const steps = [];
    const goto = async (target) => {
      for (let i = 0; i < 20; i++) {
        s = await state(H.code, `host=${H.hostKey}`);
        if (s.step === target) return;
        steps.push(`${s.step}${s.timerTotal ? ` (${s.timerTotal}s)` : ''}`);
        await next();
      }
      throw new Error(`never reached ${target}`);
    };

    await goto('p1_ehr');
    for (const id of players) await act(id, 'ehr', { n: 40, critMs: 900, given: ['supp'], dose: 'continue' });
    await goto('p2_notes');
    for (const id of players) await act(id, 'report', { problems: ['alerts', 'clicks', 'buried'] });
    await goto('p2_merge');
    for (const id of players) {
      const res = await act(id, 'top', { problems: ['alerts', 'buried', 'medrec'] });
      assert.strictEqual(res.ok, roleOf[id] !== 'vendor', 'only hospital players star problems');
    }
    const vendor = players.find((id) => roleOf[id] === 'vendor');
    const it = players.find((id) => roleOf[id] === 'it');
    assert(!(await act(it, 'share', { secret: 've_discount' })).ok, 'cannot share another team\'s secret');
    await goto('p4_intra');
    // Before the vendor offers it, the discount term cannot be put on a ballot.
    await act(it, 'ballot', { kind: 'straw', pkg: 'd', modules: ['interop'], terms: ['term7', 'march'] });
    s = await state(H.code, `id=${it}`);
    assert.deepStrictEqual(s.you.straw.terms, ['march'], 'gated term is rejected until offered');
    for (const sec of ['ve_discount', 've_reference', 've_bridge']) { const r = await act(vendor, 'share', { secret: sec }); assert(r.ok, 'vendor share failed: ' + JSON.stringify(r.json)); }
    assert((await act(it, 'share', { secret: 'it_bhidden' })).ok);
    assert(!(await act(vendor, 'ballot', { kind: 'straw', pkg: 'c' })).ok, 'vendors do not vote');

    await goto('p4_inter');
    // Everyone backs D with the facilitator pack's reference deal, and asks for more than fits.
    const deal = { pkg: 'd', modules: ['governance', 'training', 'interop', 'scribe', 'discharge'], terms: ['term7', 'reference', 'bridge', 'march'] };
    for (const id of players) if (roleOf[id] !== 'vendor') await act(id, 'ballot', { kind: 'straw', ...deal });
    await goto('p5_vote');
    s = await state(H.code, `host=${H.hostKey}`);
    assert.strictEqual(s.decision, undefined, 'results are sealed during the vote');
    await goto('p6_decision');
    s = await state(H.code, `host=${H.hostKey}`);
    const d = s.decision;
    console.log('decision:', d.pkg, 'votes', d.votes, 'modules', d.modules.join(','), 'dropped', d.dropped.join(','), 'terms', d.terms.join(','), 'cost', d.cost.total.toFixed(2));
    assert.strictEqual(d.pkg, 'd');
    assert(d.passed && d.votes === 7);
    assert(d.cost.total <= C.CAP + 1e-9, 'modules never push the deal over the cap');
    assert(d.dropped.length > 0, 'not everything the room wanted could be bought');
    assert(d.modules.includes('governance'), 'free governance is always affordable');
    await goto('p6_reflect');
    assert((await act(players[0], 'reflect', { worst: 'alerts', fixed: 'partly', surprised: 'finance', gaveup: 'scribe', learned: 'tradeoffs' })).ok);
    await goto('reveal_point');
    console.log('steps:', steps.join(' → '));
    const total = (ids) => ids.reduce((n, id) => n + (steps.find((x) => x.startsWith(id + ' ')) ? Number(/\((\d+)s\)/.exec(steps.find((x) => x.startsWith(id + ' ')))[1]) : 0), 0);
    console.log('phase minutes: P1', total(['p1_ehr']) / 60, 'P2', total(['p2_notes', 'p2_merge', 'p2_top3']) / 60, 'P3', total(['p3_hospital', 'p3_pitch']) / 60, 'P4', total(['p4_intra', 'p4_inter']) / 60, 'P5', total(['p5_vote']) / 60, 'P6', total(['p6_decision', 'p6_sim', 'p6_outcome', 'p6_reflect']) / 60);
    console.log('SMOKE TEST PASSED');
  } finally {
    server.kill();
  }
})().catch((err) => {
  console.error('SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
