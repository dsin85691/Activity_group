'use strict';
// Budget stretch test: Package C plus the $2M bridge costs $46M against a $45M budget.
// The bridge is bought only if finance itself signs the stretch to $50M.
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const C = require('../public/content.js');

const PORT = 3997;
const base = `http://localhost:${PORT}`;
const post = async (url, body) => {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
};
async function hostState(H) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream?code=${H.code}&host=${H.hostKey}`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  let buf = '';
  let latest = null;
  const until = Date.now() + 350;
  while (Date.now() < until) {
    const chunk = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r(null), 120))]);
    if (!chunk || chunk.done) continue;
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

async function play(financeSigns) {
  const { json: host } = await post('/api/host');
  const H = { code: host.code, hostKey: host.hostKey };
  const ids = {};
  for (const role of C.ROLE_ORDER) {
    const { json } = await post('/api/join', { code: H.code, name: role });
    ids[role] = json.id;
    await post('/api/action', { code: H.code, id: json.id, type: 'role', role });
  }
  const next = () => post('/api/action', { ...H, type: 'next' });
  for (let i = 0; i < 8; i++) await next(); // lobby to p4_intra
  let s = await hostState(H);
  assert.strictEqual(s.step, 'p4_intra');
  assert((await post('/api/action', { code: H.code, id: ids.northwind, type: 'share', secret: 've_bridge' })).ok);
  for (const role of C.ROLE_ORDER.filter((r) => C.ROLES[r].group !== 'vendor')) {
    const terms = role === 'finance' && !financeSigns ? ['bridge'] : ['bridge', 'stretch'];
    await post('/api/action', { code: H.code, id: ids[role], type: 'ballot', kind: 'straw', pkg: 'c', modules: [], terms });
  }
  for (let i = 0; i < 3; i++) await next(); // to p6_decision
  s = await hostState(H);
  assert.strictEqual(s.step, 'p6_decision');
  return s.decision;
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const refused = await play(false);
    console.log('finance refuses:', refused.pkg, 'terms', refused.terms.join(',') || 'none', '| not bought', refused.droppedTerms.join(','), '| contract', refused.cost.total, 'of', refused.cost.cap);
    assert.strictEqual(refused.pkg, 'c');
    assert(!refused.terms.includes('stretch'), 'the stretch needs finance itself');
    assert.deepStrictEqual(refused.droppedTerms, ['bridge'], 'the bridge does not fit without the stretch');
    assert.strictEqual(refused.cost.total, 44);

    const signed = await play(true);
    console.log('finance signs:  ', signed.pkg, 'terms', signed.terms.join(','), '| not bought', signed.droppedTerms.join(',') || 'none', '| contract', signed.cost.total, 'of', signed.cost.cap);
    assert(signed.terms.includes('stretch') && signed.terms.includes('bridge'));
    assert.strictEqual(signed.cost.total, 46);
    assert.strictEqual(signed.cost.cap, 50);
    console.log('STRETCH TEST PASSED');
  } finally {
    server.kill();
  }
})().catch((err) => {
  console.error('STRETCH TEST FAILED:', err.message);
  process.exit(1);
});
