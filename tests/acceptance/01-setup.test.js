'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');
const SPEC = require('./spec');

describe('1. Session setup and roles', () => {
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

  it('[P1] SET-01 creating a session gives a join code and an idle lobby', async () => {
    const g = await H.Game.create(server);
    try {
      assert.match(g.code, /^\d{4}$/, 'a 4-digit join code');
      assert.equal(g.host.state.step, 'lobby');
      assert.equal(g.host.state.timerEnd, null, 'no timer may run in the lobby');
    } finally {
      g.close();
    }
  });

  it('[P1] SET-02 the role picker offers every stakeholder group and both clinical teams', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const p = await g.join('Newcomer');
    const page = await H.openPage(browser, g, p);
    try {
      await page.waitForSelector('[data-act=role]');
      const picker = await H.text(page, '.stage');
      for (const re of [/executive/i, /finance/i, /clinical end users/i, /physician team/i, /nurse team/i, /IT .*informatics|informatics/i, /vendors?/i, /compliance.*legal|legal/i, /patients?.*advocate|advocate/i]) {
        assert.match(picker, re, `role picker should offer ${re}`);
      }
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] SET-03 each player sees only their own brief', async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast([...H.STANDARD_CAST, ['Cmo', 'clinical']]);
    const leaks = [];
    try {
      // Nothing private may be served to every browser in the public scripts.
      for (const asset of ['/content.js', '/app.js']) {
        const body = await (await fetch(g.base + asset)).text();
        for (const [role, line] of Object.entries(SPEC.PRIVATE)) {
          if (body.includes(line)) leaks.push(`${asset} contains the ${role} brief ("${line.slice(0, 40)}…"), so any player can read it`);
        }
      }
      // Nothing private from another group may reach a player's live state or screen.
      for (const [role, p] of Object.entries(cast)) {
        const allowed = SPEC.ALLOWED[role] || [role];
        const state = JSON.stringify(p.state());
        const screen = browser ? await (async () => {
          const page = await H.openPage(browser, g, p);
          await page.click('[data-act=showrole]').catch(() => {});
          await H.sleep(300);
          const t = await H.text(page);
          await page.context().close();
          return t;
        })() : '';
        for (const [other, line] of Object.entries(SPEC.PRIVATE)) {
          if (allowed.includes(other)) continue;
          if (state.includes(line)) leaks.push(`${role}'s live state contains the ${other} brief`);
          if (screen.includes(line)) leaks.push(`${role}'s screen shows the ${other} brief`);
        }
        for (const line of SPEC.FACILITATOR_ONLY) if (screen.includes(line)) leaks.push(`${role} can see facilitator brief text`);
        if (browser) assert.ok(screen.includes(SPEC.PRIVATE[role]), `${role} should see their own brief`);
      }
      assert.deepEqual(leaks, [], leaks.join('\n'));
    } finally {
      g.close();
    }
  });

  it('[P1] SET-04 a vendor has no vote control', async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    try {
      await g.goto('p5_vote');
      const res = await cast.vendor.act('vote', { choice: 'A' });
      assert.equal(res.ok, false, 'the server must refuse a vendor vote');
      if (browser) {
        const page = await H.openPage(browser, g, cast.vendor);
        assert.equal(await page.$$eval('[data-act=pick], [data-slot=vote]', (els) => els.length), 0, 'no voting buttons for vendors');
        await page.context().close();
      }
    } finally {
      g.close();
    }
  });

  it('[P1] SET-05 the facilitator dashboard shows every brief, the answer key and team progress', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    await g.cast();
    const page = await H.openPage(browser, g, 'host');
    try {
      await page.click('[data-act=dashboard]').catch(() => {});
      await H.sleep(500);
      const t = await H.text(page);
      for (const re of SPEC.PHASE_BRIEF_TITLES) assert.match(t, re, `dashboard should show the brief ${re}`);
      for (const line of Object.values(SPEC.PRIVATE)) assert.ok(t.includes(line), `dashboard should show the stakeholder brief containing "${line}"`);
      assert.match(t, /answer key/i, 'dashboard should show the answer key');
      assert.match(t, /progress/i, "dashboard should show all teams' progress");
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] SET-06 starting without a nurse team warns and asks for confirmation', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    await g.cast(H.STANDARD_CAST.filter(([, r]) => r !== 'nurse'));
    const page = await H.openPage(browser, g, 'host', { dialog: 'dismiss' });
    try {
      await page.click('[data-act=next]');
      await H.sleep(800);
      const shown = page.dialogs.join(' ') + (await H.text(page));
      assert.match(shown, /nurse/i, 'a warning naming the missing nurse team');
      assert.equal(g.step, 'lobby', 'dismissing the warning keeps the session in the lobby');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P2] SET-07 two players in one group see the same brief and share one vote', async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    const cfo2 = await g.join('Cfo2', 'finance');
    try {
      if (browser) {
        const a = await H.openPage(browser, g, cast.finance);
        const b = await H.openPage(browser, g, cfo2);
        assert.equal(await H.text(a, '.brief'), await H.text(b, '.brief'), 'the same brief');
        await a.context().close();
        await b.context().close();
      }
      await g.goto('p5_vote');
      await cast.finance.act('vote', { choice: 'A+D' });
      await cfo2.act('vote', { choice: 'A+D' });
      await g.goto('p5_decision');
      const results = g.host.state.results;
      const finance = Object.keys(results.groupVotes).filter((k) => String(k) === '2');
      assert.equal(finance.length, 1, 'group 2 casts exactly one vote');
      const top = results.ranking.find((r) => r.key === 'A+D');
      assert.equal(top.groups, 1, 'two finance players count as one group vote');
    } finally {
      g.close();
    }
  });
});
