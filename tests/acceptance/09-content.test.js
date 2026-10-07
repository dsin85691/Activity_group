'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./harness');
const SPEC = require('./spec');

// The brief markdown files (07 to 15). Put them in ./briefs or point BRIEFS_DIR at them.
const BRIEFS_DIR = process.env.BRIEFS_DIR || path.join(H.ROOT, 'briefs');
const BRIEFS_MISSING = fs.existsSync(path.join(BRIEFS_DIR, SPEC.BRIEF_FILES.exec)) ? false : `brief files not found in ${BRIEFS_DIR} (set BRIEFS_DIR)`;

// Reduces markdown and rendered text to the same plain word sequence.
const plainMd = (md) => md.split('\n')
  .filter((l) => !/^\|\s*-{3,}/.test(l))
  .map((l) => l.replace(/^#+\s+/, '').replace(/^\s*(-|\d+\.)\s+/, '').replace(/\*\*/g, '').replace(/\|/g, ' '))
  .join(' ').replace(/\s+/g, ' ').trim();
const plainText = (t) => t.replace(/\s+/g, ' ').trim();

function firstDifference(a, b) {
  const wa = a.split(' ');
  const wb = b.split(' ');
  const i = wa.findIndex((w, k) => w !== wb[k]);
  return i < 0 ? (wa.length === wb.length ? null : `length differs (${wa.length} vs ${wb.length} words)`)
    : `at word ${i}: brief "…${wa.slice(Math.max(0, i - 4), i + 6).join(' ')}…" vs app "…${wb.slice(Math.max(0, i - 4), i + 6).join(' ')}…"`;
}

describe('9. Content accuracy', () => {
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

  it('[P1] CON-01 patient values match the fictional chart', { skip: H.NO_BROWSER, timeout: 5 * 60 * 1000 }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    await g.goto('p1_intro');
    const page = await H.openPage(browser, g, cast.physician);
    try {
      await g.next();
      await page.waitForSelector('#sim-body');
      await g.waitUntilElapsed(168); // after the 13:02 labs
      await H.openTab(page, 'results');
      const rows = await page.$$eval('#sim-body table', (tables) => [...tables[0].rows].map((r) => [...r.cells].map((c) => c.innerText.trim())));
      const header = rows[0];
      const col = (date) => header.indexOf(date);
      const value = (name, date) => {
        const row = rows.find((r) => r[0].toLowerCase().startsWith(name));
        return row ? (row[col(date)] || '').split(' ')[0] : '(missing row)';
      };
      const problems = [];
      const expect = (name, date, want) => {
        const got = value(name, date);
        if (got !== want) problems.push(`${name} on ${date}: expected ${want}, shows ${got}`);
      };
      expect('tacrolimus', '09/28', SPEC.CHART.tacDay5);
      expect('tacrolimus', '09/29', SPEC.CHART.tacDay6);
      expect('potassium', '09/28', SPEC.CHART.kDay5);
      expect('potassium', '09/29', SPEC.CHART.kDay6);
      expect('creatinine', '09/28', SPEC.CHART.crBaseline);
      expect('creatinine', '09/29', SPEC.CHART.crDay6);
      await H.openTab(page, 'media');
      await H.chartClick(page, '.wf-x-head:has-text("ECG")').catch(() => {});
      if (!(await H.chartText(page)).includes(`QTc ${SPEC.CHART.qtc}`)) problems.push('the ECG does not show QTc 492 ms');
      assert.deepEqual(problems, [], problems.join('\n'));
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] CON-02 every brief in the app matches files 07 to 15 word for word', { skip: H.NO_BROWSER || BRIEFS_MISSING }, async () => {
    const g = await H.Game.create(server);
    const problems = [];
    try {
      for (const [role, file] of Object.entries(SPEC.BRIEF_FILES)) {
        const p = await g.join(`B-${role}`, role);
        const page = await H.openPage(browser, g, p);
        const shown = plainText(await page.innerText('.brief'));
        await page.context().close();
        const want = plainMd(fs.readFileSync(path.join(BRIEFS_DIR, file), 'utf8'));
        const diff = firstDifference(want, shown);
        if (diff) problems.push(`${file}: ${diff}`);
      }
      assert.deepEqual(problems, [], problems.join('\n'));
    } finally {
      g.close();
    }
  });

  it('[P1] CON-03 every screen with patient data carries the fictional-case label', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    const missing = [];
    try {
      const look = async (label, who) => {
        const page = await H.openPage(browser, g, who);
        if (!SPEC.FICTIONAL.test(await H.text(page))) missing.push(label);
        await page.context().close();
      };
      await g.goto('p1_sim');
      await look('physician chart', cast.physician);
      await look('nurse chart', cast.nurse);
      await look('shadowed chart', cast.exec);
      await g.next();
      await look('quiz', cast.physician);
      await H.playToDecision(g, cast, 'D');
      await cast.finance.act('decide', { op: 'cfo_ok' });
      await cast.exec.act('decide', { op: 'go' });
      await g.goto('p6_replay');
      await look('replay', cast.physician);
      await look('replay (facilitator)', 'host');
      assert.deepEqual(missing, [], `no "fictional teaching case, not for clinical use" label on: ${missing.join(', ')}`);
    } finally {
      g.close();
    }
  });

  it('[P2] CON-04 package names and prices are the same on every screen', { skip: H.NO_BROWSER }, async () => {
    const g = await H.Game.create(server);
    const cast = await g.cast();
    const problems = [];
    try {
      const scan = async (label, who) => {
        const page = await H.openPage(browser, g, who);
        const t = await H.text(page);
        await page.context().close();
        for (const [l, pkg] of Object.entries(SPEC.PACKAGES)) {
          if (!t.includes(pkg.name)) problems.push(`${label}: missing "${pkg.name}"`);
          else if (!new RegExp(`${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^$]{0,40}\\$${pkg.cost}M`).test(t)) problems.push(`${label}: ${l} not shown at $${pkg.cost}M`);
        }
      };
      await g.goto('p4_pitch');
      await scan('pitch fest', 'host');
      await scan('vendor pitch view', cast.vendor);
      await g.goto('p5_intra');
      await scan('choice picker', cast.exec);
      assert.deepEqual(problems, [], problems.join('\n'));
    } finally {
      g.close();
    }
  });
});
