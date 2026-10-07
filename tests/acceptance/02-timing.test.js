'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');
const SPEC = require('./spec');

const clockSeconds = (t) => {
  const m = String(t || '').match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

describe('2. Timing and phase control', () => {
  let server;
  let browser;
  before(async () => {
    server = await H.startServer();
    browser = await H.launch();
  });
  after(async () => {
    await browser?.close();
    server.stop();
  });

  it('[P1] TIM-01 the steps run in order with the brief\'s lengths, 60 minutes in total', async () => {
    const g = await H.Game.create(server);
    await g.cast();
    try {
      // Walk every step and record its phase and timer length.
      const steps = [];
      for (let i = 0; i < 40; i++) {
        const s = g.host.state;
        steps.push({ id: s.step, phase: s.phase, seconds: s.timerTotal || 0 });
        const res = await g.hostAct('next');
        if (!res.ok) break;
        try {
          await g.host.until((x) => x.step !== s.step, 3000);
        } catch {
          break;
        }
      }
      const byPhase = (ph) => steps.filter((s) => s.phase === ph);
      const sum = (list) => list.reduce((a, s) => a + s.seconds, 0);
      assert.equal(sum(byPhase(1)), SPEC.TIMING.simulation, 'Simulation 4 minutes');
      assert.equal(sum(byPhase(2)), SPEC.TIMING.quiz, 'Quiz 3 minutes');
      assert.equal(sum(byPhase(3)), SPEC.TIMING.stakeholder, 'Stakeholder discussion 10 minutes');
      const p4 = byPhase(4).filter((s) => s.seconds);
      assert.deepEqual(p4.map((s) => s.seconds), [SPEC.TIMING.handshake, SPEC.TIMING.pitch], 'Handshake 1, then Pitch fest 6');
      const p5 = byPhase(5).filter((s) => s.seconds).map((s) => s.seconds);
      assert.equal(p5.slice(0, -2).reduce((a, b) => a + b, 0), SPEC.TIMING.framing + SPEC.TIMING.intra + SPEC.TIMING.inter, 'Discussion 20 minutes');
      assert.deepEqual(p5.slice(-2), [SPEC.TIMING.voting, SPEC.TIMING.decision], 'Voting 3, then Decision 3');
      assert.equal(sum(byPhase(6)), SPEC.TIMING.outcome, 'Outcome 10 minutes');
      assert.equal(sum(steps), SPEC.TOTAL_SECONDS, 'total 60 minutes');
    } finally {
      g.close();
    }
  });

  it('[P1] TIM-01b full real-time run advances by itself (set ACCEPT_FULL=1; takes 60 minutes)', { skip: process.env.ACCEPT_FULL ? false : 'set ACCEPT_FULL=1 to run the real 60-minute session', timeout: 70 * 60 * 1000 }, async () => {
    const g = await H.Game.create(server);
    await g.cast();
    try {
      await g.next(); // leave the lobby; from here on nobody presses NEXT
      const seen = [g.step];
      const deadline = Date.now() + 62 * 60 * 1000;
      while (Date.now() < deadline) {
        const current = g.step;
        const left = g.remaining();
        if (left === null) {
          if (g.host.state.phase >= 6) break; // the closing screen
          // An untimed screen must not stall a run without overrides.
          await H.sleep(5000);
          assert.notEqual(g.step, current, `the untimed step ${current} waited for the facilitator (saw ${seen.join(' → ')})`);
        } else {
          await g.host.until((s) => s.step !== current, (left + 3) * 1000, `${current} to end on its own`);
        }
        seen.push(g.step);
      }
      assert.ok(g.host.state.phase >= 6, `the session should reach the outcome on its own, saw ${seen.join(' → ')}`);
    } finally {
      g.close();
    }
  });

  it('[P1] TIM-02 every step shows its own countdown and the total time left in the session', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    await g.cast();
    const page = await H.openPage(browser, g, 'host');
    const missing = [];
    try {
      for (let i = 0; i < 20; i++) {
        await g.next().catch(() => {});
        await H.sleep(500);
        if (!g.host.state.timerEnd) continue;
        const timers = await page.$$eval('[data-timer]:not(.hidden)', (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
        if (!timers.some((t) => /\d+:\d{2}/.test(t))) missing.push(`${g.step}: no visible countdown`);
        const body = await H.text(page);
        if (!/(total|session)[^.]{0,30}\d+:\d{2}|\d+:\d{2}[^.]{0,30}(total|session|left in)/i.test(body)) missing.push(`${g.step}: no total time left in the session`);
        if (g.step === 'p6_replay') break;
      }
      assert.deepEqual(missing, [], missing.join('\n'));
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] TIM-03 when a step\'s timer reaches zero, every screen moves on within 2 seconds', { timeout: 120000 }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    try {
      await g.goto('p4_handshake'); // a 1-minute step
      const end = g.host.state.timerEnd;
      const offset = g.host.state.now - g.host.state._receivedAt;
      await H.sleep(Math.max(0, end - (Date.now() + offset)) + 2000);
      assert.notEqual(g.step, 'p4_handshake', 'the facilitator screen should have moved on');
      for (const p of Object.values(cast)) assert.notEqual(p.state().step, 'p4_handshake', `${p.role}'s screen should have moved on`);
    } finally {
      g.close();
    }
  });

  it('[P1] TIM-04 pause stops every timer and resume continues with no time lost or added', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p3_discuss');
    const host = await H.openPage(browser, g, 'host');
    const player = await H.openPage(browser, g, cast.exec);
    const read = async (page) => clockSeconds(await page.$eval('[data-timer]:not(.hidden)', (e) => e.textContent).catch(() => ''));
    try {
      assert.ok(await host.$('[data-act=pause]'), 'a pause control for the facilitator');
      await host.click('[data-act=pause]');
      await H.sleep(800);
      const a = [await read(host), await read(player)];
      await H.sleep(3000);
      const b = [await read(host), await read(player)];
      assert.deepEqual(b, a, 'timers stand still while paused');
      await host.click('[data-act=resume], [data-act=pause]');
      await H.sleep(3000);
      const c = await read(host);
      assert.ok(Math.abs(a[0] - c - 3) <= 1, `after resuming 3 s the timer should be ~3 s lower (was ${a[0]}, now ${c})`);
    } finally {
      await host.context().close();
      await player.context().close();
      g.close();
    }
  });

  it('[P2] TIM-05 extending a step by 1 minute shows a 61-minute total with an over-time flag', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    await g.cast();
    await g.goto('p3_discuss');
    const page = await H.openPage(browser, g, 'host');
    try {
      const before = g.remaining();
      await page.click('[data-act=timer-add]');
      await H.sleep(600);
      assert.ok(Math.abs(g.remaining() - before - 60) < 3, 'the step gains one minute');
      const t = await H.text(page);
      assert.match(t, /61\s*(min|minutes)|61:00/i, 'the session total shows 61 minutes');
      assert.match(t, /over\s*time/i, 'an "over time" flag');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] TIM-06 skipping a step asks for confirmation and marks its outputs missing', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    await g.cast();
    await g.goto('p2_rank'); // nobody ranks
    const page = await H.openPage(browser, g, 'host', { dialog: 'accept' });
    try {
      await page.click('[data-act=next]');
      await H.sleep(1000);
      assert.ok(page.dialogs.length > 0, 'a confirmation before skipping');
      assert.match(await H.text(page), /missing/i, 'the next screen marks the skipped outputs as missing');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] TIM-07 the discussion runs as framing 2, intra-team 6 and inter-team 12 with a visible switch', async () => {
    const g = await H.Game.create(server);
    await g.cast();
    let page = null;
    try {
      await g.goto('p5_framing');
      if (browser) page = await H.openPage(browser, g, 'host');
      const seen = [];
      for (let i = 0; i < 3; i++) {
        await H.sleep(400);
        seen.push({ seconds: g.host.state.timerTotal, title: page ? await H.text(page, 'h1') : g.step });
        await g.next();
      }
      assert.deepEqual(seen.map((s) => s.seconds), [SPEC.TIMING.framing, SPEC.TIMING.intra, SPEC.TIMING.inter]);
      if (page) {
        assert.equal(new Set(seen.map((s) => s.title)).size, 3, `each part has its own visible title: ${seen.map((s) => s.title).join(' / ')}`);
        assert.match(seen[0].title, /financ/i);
        assert.match(seen[1].title, /team|intra|first and second/i);
        assert.match(seen[2].title, /all|inter/i);
      }
    } finally {
      await page?.context().close();
      g.close();
    }
  });
});
