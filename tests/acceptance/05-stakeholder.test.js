'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');

describe('5. Phase 3: Stakeholder discussion', () => {
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

  // A session at the stakeholder discussion, with both clinical teams' rankings in.
  async function atDiscussion() {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p2_rank');
    await cast.physician.act('rank', { ids: [2, 12, 5, 15, 11] });
    await cast.nurse.act('rank', { ids: [8, 2, 9, 11, 6] });
    await g.goto('p3_discuss');
    return { g, cast };
  }

  it('[P1] STK-01 groups 1 to 4, 6 and 7 share the room; vendors are not in it', async () => {
    const { g, cast } = await atDiscussion();
    try {
      for (const role of ['exec', 'finance', 'it', 'compliance', 'advocate', 'physician', 'nurse']) {
        const res = await cast[role].act('stars', { ids: [2] });
        assert.ok(res.ok, `${role} takes part in the discussion`);
      }
      assert.equal((await cast.vendor.act('stars', { ids: [2] })).ok, false, 'vendors cannot take part');
      if (browser) {
        const page = await H.openPage(browser, g, cast.vendor);
        const t = await H.text(page);
        await page.context().close();
        assert.match(t, /wait outside|not in the room|waiting/i, 'the vendor is told to wait outside');
      }
    } finally {
      g.close();
    }
  });

  it('[P1] STK-02 the clinical pitch (3), reactions (5) and priorities (2) run as sub-steps with the current one shown', { skip: H.NO_BROWSER }, async () => {
    const { g } = await atDiscussion();
    const page = await H.openPage(browser, g, 'host');
    try {
      const current = await page.$('[aria-current="step"], .substep.current, [data-test=substep]');
      assert.ok(current, 'a marker for the current sub-step');
      assert.match(await current.innerText(), /clinical pitch/i, 'the session opens on the clinical pitch');
      const t = await H.text(page);
      for (const re of [/clinical pitch[^]*3/i, /reactions[^]*5/i, /priorities[^]*2/i]) assert.match(t, re);
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] STK-03 every group sees the same merged problem list', async () => {
    const { g, cast } = await atDiscussion();
    try {
      const host = JSON.stringify(g.host.state.problems.merged);
      for (const [role, p] of Object.entries(cast)) {
        if (role === 'vendor') continue;
        assert.equal(JSON.stringify(p.state().problems.merged), host, `${role} sees the same list`);
      }
    } finally {
      g.close();
    }
  });

  it('[P1] STK-04 only the CEO can confirm the top five, which then locks', async () => {
    const { g, cast } = await atDiscussion();
    try {
      assert.equal((await cast.finance.act('confirm_top')).ok, false, 'finance cannot confirm');
      const res = await cast.exec.act('confirm_top');
      assert.ok(res.ok, `the CEO confirms the top five (${res.error || ''})`);
      const locked = [...g.host.state.problems.top5];
      await cast.finance.act('stars', { ids: [14, 13, 10, 9, 1] });
      await cast.advocate.act('stars', { ids: [14, 13, 10, 9, 1] });
      const toggle = await g.hostAct('top', { id: locked[0] });
      await H.sleep(300);
      assert.deepEqual(g.host.state.problems.top5, locked, 'the confirmed list no longer changes');
      assert.equal(toggle.ok, false, 'the confirmed list is locked');
      await g.next();
      assert.deepEqual(g.host.state.problems.top5, locked, 'the confirmed list carries into phase 4');
    } finally {
      g.close();
    }
  });

  it('[P2] STK-05 if time runs out before the CEO confirms, the merged top five locks automatically (set ACCEPT_LONG=1; 10 minutes)', { skip: process.env.ACCEPT_LONG ? false : 'set ACCEPT_LONG=1 to wait out the 10-minute discussion', timeout: 12 * 60 * 1000 }, async () => {
    const { g } = await atDiscussion();
    try {
      const merged = g.host.state.problems.merged.slice(0, 5);
      await H.sleep((g.remaining() + 3) * 1000);
      assert.deepEqual([...g.host.state.problems.top5].sort(), [...merged].sort(), 'the merged top five');
      assert.equal((await g.hostAct('top', { id: merged[0] })).ok, false, 'and it is locked');
    } finally {
      g.close();
    }
  });
});
