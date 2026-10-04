'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');
const SPEC = require('./spec');

describe('8. Phase 6: Outcome', () => {
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

  // Plays a session to the replay with every group choosing `choice`, then opens a clinician's screen.
  async function replay(choice) {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await H.playToDecision(g, cast, choice);
    await cast.finance.act('decide', { op: 'cfo_ok' });
    await cast.exec.act('decide', { op: 'go' });
    await g.host.until((s) => s.decision && s.decision.final, 3000, 'the decision');
    await g.goto('p6_replay');
    const page = browser ? await H.openPage(browser, g, cast.physician) : null;
    if (page) await H.sleep(3500); // let the replay play
    return { g, cast, page };
  }

  for (const letter of Object.keys(SPEC.REPLAY)) {
    it(`[P1] OUT-01 the replay with package ${letter} shows its moment from the Phase 6 brief`, { skip: H.NO_BROWSER }, async () => {
      const { g, page } = await replay(letter);
      try {
        assert.ok((await H.text(page)).includes(SPEC.REPLAY[letter]), `the replay shows: "${SPEC.REPLAY[letter]}"`);
        for (const other of Object.keys(SPEC.REPLAY)) {
          if (other !== letter) assert.ok(!(await H.text(page)).includes(SPEC.REPLAY[other]), `it does not show ${other}'s moment`);
        }
      } finally {
        await page.context().close();
        g.close();
      }
    });
  }

  it('[P1] OUT-02 a combination such as A + D shows the moments from both packages', { skip: H.NO_BROWSER }, async () => {
    const { g, page } = await replay('A+D');
    try {
      const t = await H.text(page);
      assert.ok(t.includes(SPEC.REPLAY.A), "A's moment");
      assert.ok(t.includes(SPEC.REPLAY.D), "D's moment");
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] OUT-03 every replay ends with the happy ending', { skip: H.NO_BROWSER }, async () => {
    const { g, page } = await replay('C');
    try {
      const t = await H.text(page);
      for (const re of SPEC.HAPPY_ENDING) assert.match(t, re);
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] OUT-04 replay alerts arrive at a manageable rate, with no crash', { skip: H.NO_BROWSER, timeout: 60000 }, async () => {
    const { g, page } = await replay('D');
    try {
      let shown = 0;
      let wasShown = false;
      for (let i = 0; i < 40; i++) {
        const now = await page.isVisible('.ehr-alert.show, #sim-alert.show').catch(() => false);
        if (now && !wasShown) shown++;
        wasShown = now;
        if (now) await page.click('.ehr-alert.show [data-a=ack], .ehr-alert.show button').catch(() => {});
        await H.sleep(500);
      }
      assert.ok(shown <= 4, `at most ~1 alert every 5 seconds over 20 s (saw ${shown})`);
      assert.equal(await page.isVisible('#sim-down.show').catch(() => false), false, 'no crash or downtime in the replay');
      assert.deepEqual(page.errors, [], 'no page errors');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] OUT-05 the wrap-up lists the unfixed problems, always including 13, and closes with "Next cycle, we call the vendor again."', { skip: H.NO_BROWSER }, async () => {
    const { g, page } = await replay('A+D');
    try {
      await g.next();
      await H.sleep(1500);
      const t = await H.text(page);
      assert.match(t, /Next cycle, we call the vendor again\./);
      // A + D fixes 1, 2, 3, 4, 5, 6, 9, 10, 11, 12 and 15.
      for (const n of [7, 8, 13, 14]) assert.match(t, new RegExp(`\\b${n}\\s*·`), `unfixed problem ${n} is listed`);
      assert.match(t, /\b13\s*·/, 'problem 13 is always on the list');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] OUT-06 the session summary export includes findings, quiz scores, top five, votes, decision and unfixed problems', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await H.playToDecision(g, cast, 'A+D');
    await cast.finance.act('decide', { op: 'cfo_ok' });
    await cast.exec.act('decide', { op: 'go' });
    await g.goto('p6_replay');
    const page = await H.openPage(browser, g, 'host');
    try {
      const button = await page.$('[data-act=export], [data-test=export]');
      assert.ok(button, 'an export control for the facilitator');
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), button.click()]);
      const file = await download.path();
      const body = require('node:fs').readFileSync(file, 'utf8');
      for (const re of [/finding/i, /quiz/i, /top (five|5)/i, /vote/i, /decision/i, /unfixed|carried over|remaining/i]) assert.match(body, re, `the export includes ${re}`);
    } finally {
      await page.context().close();
      g.close();
    }
  });
});
