'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');

describe('10. Robustness, access and performance', () => {
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

  it('[P1] ROB-01 with 30 players, phase changes reach everyone within 2 seconds and nothing freezes', { timeout: 120000 }, async () => {
    const g = await H.Game.create(server);
    const roles = ['physician', 'nurse', 'clinical', 'exec', 'finance', 'it', 'compliance', 'advocate', 'vendor'];
    const players = [];
    try {
      for (let i = 0; i < 30; i++) players.push(await g.join(`P${i + 1}`, roles[i % roles.length]));
      const slowest = [];
      for (let k = 0; k < 5; k++) {
        const before = g.step;
        const t0 = Date.now();
        await g.hostAct('next');
        const arrivals = await Promise.all(players.map((p) => p.stream.until((s) => s.step !== before, 5000, `${p.name} to leave ${before}`).then(() => Date.now() - t0)));
        slowest.push(Math.max(...arrivals));
      }
      for (const ms of slowest) assert.ok(ms <= 2000, `a phase change took ${ms} ms to reach every player`);
      // A burst of actions from everyone at once must not stall the server.
      await g.goto('p3_discuss');
      const t0 = Date.now();
      const results = await Promise.all(players.map((p) => p.act('stars', { ids: [2, 12] })));
      assert.ok(Date.now() - t0 <= 2000, `30 simultaneous actions took ${Date.now() - t0} ms`);
      assert.ok(results.filter((r) => r.ok).length >= 26, 'every non-vendor action succeeds');
    } finally {
      g.close();
    }
  });

  it('[P1] ROB-02 a facilitator reload mid-session returns to the same step while the session keeps running', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    await g.cast();
    await g.goto('p3_discuss');
    const page = await H.openPage(browser, g, 'host');
    try {
      const before = g.remaining();
      await page.reload();
      await page.waitForSelector('.stage');
      await H.sleep(800);
      assert.equal(g.step, 'p3_discuss', 'the session did not move');
      assert.match(await H.text(page, 'h1'), /stakeholder discussion/i, 'the facilitator is back on the same step');
      assert.ok(g.remaining() < before, 'the timer kept running');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] ROB-03 a player offline for 30 seconds returns to the current step with their data intact', { skip: H.NO_BROWSER, timeout: 90000 }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p3_discuss');
    await cast.advocate.act('stars', { ids: [2, 6, 14] });
    const page = await H.openPage(browser, g, cast.advocate);
    try {
      await page.context().setOffline(true);
      await H.sleep(10000);
      await g.next(); // the session moves on while they are away
      await H.sleep(20000);
      await page.context().setOffline(false);
      await page.waitForFunction(() => /calls in the vendor/i.test(document.body.innerText), null, { timeout: 10000 });
      assert.deepEqual(cast.advocate.state().you.stars, [2, 6, 14], 'their stars are intact');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] ROB-04 smoke test on every installed browser engine (run sections 3–8 per engine with ACCEPT_ENGINE)', { skip: H.NO_BROWSER, timeout: 120000 }, async () => {
    const failures = [];
    let tried = 0;
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      let b;
      try {
        b = await H.launch(engine);
      } catch {
        continue; // not installed
      }
      tried++;
      const g = await H.Game.create(server);
      const cast = await g.cast();
      try {
        await g.goto('p1_sim');
        for (const [label, who, viewport] of [['desktop', cast.physician, null], ['phone', cast.nurse, { width: 390, height: 844 }]]) {
          const page = await H.openPage(b, g, who, viewport ? { viewport } : {});
          const ok = await page.waitForSelector('#sim-body', { timeout: 8000 }).then(() => true, () => false);
          if (!ok || page.errors.length) failures.push(`${engine} ${label}: ${ok ? page.errors.join('; ') : 'chart did not load'}`);
          await page.context().close();
        }
      } finally {
        g.close();
        await b.close();
      }
    }
    assert.ok(tried > 0, 'no browser engine available');
    assert.deepEqual(failures, [], failures.join('\n'));
  });

  it('[P2] ROB-05 every control can be reached and used with the keyboard', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p1_sim');
    const page = await H.openPage(browser, g, cast.physician);
    try {
      await page.waitForSelector('#sim-body');
      await H.openTab(page, 'notes');
      const unreachable = await page.$$eval('[data-act]', (els) => els
        .filter((e) => !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !(e.tabIndex >= 0 && e.hasAttribute('tabindex')))
        .map((e) => `${e.tagName.toLowerCase()}[data-act=${e.dataset.act}] "${e.textContent.trim().slice(0, 30)}"`));
      assert.deepEqual([...new Set(unreachable)].slice(0, 15), [], 'controls that cannot take keyboard focus');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] ROB-06 alerts and time warnings are announced to screen readers', { skip: H.NO_BROWSER, timeout: 60000 }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p1_sim');
    const page = await H.openPage(browser, g, cast.physician);
    try {
      await page.waitForSelector('#sim-alert.show', { timeout: 20000 });
      const alertA11y = await page.$eval('#sim-alert', (e) => {
        const box = e.querySelector('.ehr-alert-box') || e;
        const roles = [e.getAttribute('role'), box.getAttribute('role')];
        return roles.some((r) => ['alert', 'alertdialog'].includes(r)) || [e, box].some((x) => ['assertive', 'polite'].includes(x.getAttribute('aria-live')));
      });
      assert.ok(alertA11y, 'the alert has role="alert"/"alertdialog" or aria-live');
      const timerA11y = await page.$$eval('[data-timer]', (els) => els.some((e) => e.getAttribute('role') === 'timer' || e.getAttribute('aria-live')));
      assert.ok(timerA11y, 'the timer has role="timer" or aria-live for time warnings');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] ROB-07 critical values are not marked by color alone', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p1_sim');
    const page = await H.openPage(browser, g, cast.physician);
    try {
      await page.waitForSelector('#sim-body');
      await H.openTab(page, 'results');
      const t = await H.chartText(page);
      assert.match(t, /1\.6\s*(H|high|critical)/i, 'an out-of-range creatinine carries a text flag');
      assert.match(t, /232\s*(H|high|critical)/i, 'an out-of-range glucose carries a text flag');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] ROB-08 with reduced motion the crash and alerts play without flashing or shaking', { skip: H.NO_BROWSER, timeout: 60000 }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p1_sim');
    const page = await H.openPage(browser, g, cast.physician, { reducedMotion: 'reduce' });
    try {
      await page.waitForSelector('#sim-alert.show', { timeout: 20000 });
      const moving = await page.evaluate(() => document.getAnimations()
        .filter((a) => a.playState === 'running' && Number(a.effect.getTiming().duration) > 10)
        .map((a) => a.animationName || a.effect.target?.className || 'animation'));
      assert.deepEqual(moving, [], 'no running animations longer than 10 ms');
    } finally {
      await page.context().close();
      g.close();
    }
  });
});
