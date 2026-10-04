'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');
const SPEC = require('./spec');

describe('6. Phase 4: Handshake and pitch fest', () => {
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

  async function at(step) {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p2_rank');
    await cast.physician.act('rank', { ids: [2, 12, 5, 15, 11] });
    await cast.nurse.act('rank', { ids: [8, 2, 9, 11, 6] });
    await g.goto(step);
    return { g, cast };
  }

  it('[P1] PIT-01 at the handshake the vendors enter and the top five shows on every screen for 1 minute', async () => {
    const { g, cast } = await at('p4_handshake');
    try {
      assert.equal(g.host.state.timerTotal, 60, 'the handshake lasts 1 minute');
      const top5 = g.host.state.problems.top5;
      assert.equal(top5.length, 5);
      if (browser) {
        for (const [role, p] of Object.entries(cast)) {
          const page = await H.openPage(browser, g, p);
          const t = await H.text(page);
          await page.context().close();
          const { PROBLEMS } = require(`${H.ROOT}/public/content.js`);
          for (const id of top5) assert.ok(t.includes(PROBLEMS.find((x) => x.id === id).label), `${role} sees top-five problem ${id}`);
        }
      }
    } finally {
      g.close();
    }
  });

  it('[P1] PIT-02 exactly five packages appear with the brief\'s costs and problem lists', { skip: H.NO_BROWSER }, async () => {
    const { g } = await at('p4_pitch');
    const page = await H.openPage(browser, g, 'host');
    try {
      const cards = await page.$$eval('.pkcard, [data-test=package]', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
      assert.equal(cards.length, 5, 'exactly five packages');
      for (const [letter, pkg] of Object.entries(SPEC.PACKAGES)) {
        const card = cards.find((c) => c.includes(pkg.name));
        assert.ok(card, `package ${letter}. ${pkg.name} is shown`);
        assert.match(card, new RegExp(`\\$${pkg.cost}M`), `${letter} costs $${pkg.cost}M`);
        const fixes = [...card.matchAll(/(\d+)\s*·/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
        assert.deepEqual(fixes, pkg.fixes, `${letter} fixes ${pkg.fixes.join(', ')}`);
      }
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] PIT-03 no package lists problem 13', async () => {
    const { g } = await at('p4_pitch');
    try {
      const { PACKAGES } = require(`${H.ROOT}/public/content.js`);
      for (const [letter, pkg] of Object.entries(PACKAGES)) assert.ok(!pkg.fixes.includes(13), `${letter} must not list 13`);
      if (browser) {
        const page = await H.openPage(browser, g, 'host');
        const t = await H.text(page, '.stage');
        await page.context().close();
        assert.doesNotMatch(t, /\b13\s*·/, 'problem 13 appears on no package card');
      }
    } finally {
      g.close();
    }
  });

  it('[P1] PIT-04 each package gets a 1-minute slot, with the current one highlighted for everyone', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p4_pitch');
    const host = await H.openPage(browser, g, 'host');
    const player = await H.openPage(browser, g, cast.exec);
    try {
      for (const page of [host, player]) {
        const current = await page.$('.pkcard.current, .pkcard[aria-current], [data-test=package][aria-current]');
        assert.ok(current, 'the package being pitched is highlighted');
        assert.match(await current.innerText(), /AI Clinical Assistant/, 'the pitch starts with package A');
      }
      assert.match(await H.text(host), /1:00|1 min/i, 'a 1-minute slot timer');
    } finally {
      await host.context().close();
      await player.context().close();
      g.close();
    }
  });

  it('[P1] PIT-05 each hospital group can send at most one lightning question', async () => {
    const { g, cast } = await at('p4_pitch');
    const cfo2 = await g.join('Cfo2', 'finance').catch(() => null); // joins too late for a role in some builds
    try {
      const first = await cast.finance.act('question', { text: 'What are the yearly costs after year one?' });
      assert.ok(first.ok, `finance sends its question (${first.error || ''})`);
      const second = await cast.finance.act('question', { text: 'And the guarantees?' });
      assert.equal(second.ok, false, 'a second question from the same group is blocked');
      if (cfo2 && cfo2.role) assert.equal((await cfo2.act('question', { text: 'Another?' })).ok, false, 'blocked for every member of the group');
      assert.ok((await cast.compliance.act('question', { text: 'Who is liable when the AI is wrong?' })).ok, 'another group can still ask');
    } finally {
      g.close();
    }
  });

  it('[P1] PIT-06 a catch is revealed to everyone only after a stakeholder asks; unasked catches stay hidden', async () => {
    const { g, cast } = await at('p4_pitch');
    const screens = async () => {
      const out = {};
      for (const role of ['exec', 'finance', 'advocate']) {
        const state = JSON.stringify(cast[role].state());
        let screen = '';
        if (browser) {
          const page = await H.openPage(browser, g, cast[role]);
          screen = await H.text(page);
          await page.context().close();
        }
        out[role] = state + screen;
      }
      return out;
    };
    try {
      for (const [role, seen] of Object.entries(await screens())) {
        for (const [letter, line] of Object.entries(SPEC.CATCHES)) assert.ok(!seen.includes(line), `${role} must not see ${letter}'s catch before anyone asks`);
      }
      // A stakeholder asks about D; the facilitator or vendor reveals it.
      await cast.compliance.act('question', { text: 'Who is liable when the AI is wrong?', pkg: 'D' });
      await g.hostAct('catch', { pkg: 'D' });
      await H.sleep(500);
      for (const [role, seen] of Object.entries(await screens())) {
        assert.ok(seen.includes(SPEC.CATCHES.D), `${role} now sees D's catch`);
        for (const l of ['A', 'B', 'C', 'E']) assert.ok(!seen.includes(SPEC.CATCHES[l]), `${role} still cannot see ${l}'s catch`);
      }
    } finally {
      g.close();
    }
  });

  it('[P2] PIT-07 each group can mark favored packages and notes, visible only to that group', async () => {
    const { g, cast } = await at('p4_pitch');
    try {
      const res = await cast.finance.act('favor', { pkg: 'B', note: 'Countable labor savings' });
      assert.ok(res.ok, `finance can favor a package (${res.error || ''})`);
      await H.sleep(300);
      assert.match(JSON.stringify(cast.finance.state()), /Countable labor savings/, 'finance sees its note');
      assert.doesNotMatch(JSON.stringify(cast.exec.state()), /Countable labor savings/, 'other groups do not');
    } finally {
      g.close();
    }
  });
});
