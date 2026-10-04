'use strict';
// Phase 1 runs once, in real time (4 minutes). The cases below are checked in timeline order
// against the same session, so each one waits for its moment on the simulation clock.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./harness');
const SPEC = require('./spec');

// Opens a collapsed row by its visible label and returns that row's text.
async function openRow(page, label) {
  await H.chartClick(page, `.wf-x-head:has-text("${label}")`);
  return (await page.locator('.wf-x.open', { hasText: label }).first().innerText()).replace(/\s+/g, ' ');
}

describe('3. Phase 1: Simulation and crash', { skip: H.NO_BROWSER, timeout: 7 * 60 * 1000 }, () => {
  let server;
  let browser;
  let g;
  let cast;
  let doc;
  let rn;
  let startClock;
  const chart = (role) => (cast[role].state().you.sim || { chart: {} }).chart;

  before(async () => {
    server = await H.startServer();
    browser = await H.launch();
    g = await H.Game.create(server);
    cast = await g.cast();
    await g.goto('p1_intro');
    doc = await H.openPage(browser, g, cast.physician);
    rn = await H.openPage(browser, g, cast.nurse);
    await g.next(); // starts the simulation
    await doc.waitForSelector('#sim-body');
    await rn.waitForSelector('#sim-body');
    await H.sleep(500);
  });
  after(async () => {
    for (const p of [doc, rn]) await p?.context().close();
    g?.close();
    await browser?.close();
    server?.stop();
  });

  it('[P1] SIM-01 both teams load James Whitfield in bed 14 at 12:45 on September 29', async () => {
    for (const [team, page] of [['physician', doc], ['nurse', rn]]) {
      const t = await H.text(page);
      assert.match(t, /WHITFIELD, JAMES/, `${team} chart shows the patient`);
      assert.match(t, /bed 14/i, `${team} chart shows bed 14`);
      assert.match(t, /09\/29|September 29/i, `${team} chart is dated September 29`);
      startClock = await page.$eval('[data-simclock]', (e) => e.textContent.trim());
      assert.equal(startClock, '12:45', `${team} app clock starts at 12:45`);
    }
  });

  it('[P1] SIM-10 both views show the same patient; physicians get orders and plan, nurses get MAR, flowsheets and assessments', async () => {
    const banner = async (p) => H.text(p, '.ehr-banner');
    assert.equal(await banner(doc), await banner(rn), 'the same patient banner');
    const tabs = async (p) => (await p.$$eval('[data-act=sim-tab]', (els) => els.map((e) => e.textContent))).join(' | ');
    const docTabs = await tabs(doc);
    const rnTabs = await tabs(rn);
    assert.match(docTabs, /order/i, 'physicians have an orders screen');
    assert.match(await H.chartText(doc), /plan/i, 'physicians see the plan');
    for (const re of [/MAR|medication/i, /flowsheet/i, /assessment/i]) assert.match(rnTabs, re, `nurses have ${re}`);
    await H.openTab(doc, 'summary');
    await H.openTab(rn, 'summary');
    for (const value of ['38.1', '112', '108/66']) {
      assert.ok((await H.chartText(doc)).includes(value) && (await H.chartText(rn)).includes(value), `both views show vital ${value}`);
    }
  });

  it('[P1] SIM-04 acknowledge, act and dismiss work, override appears from 1:00, and every action is logged with a time', { timeout: 120000 }, async () => {
    for (const action of ['ack', 'act', 'dismiss']) {
      await rn.waitForSelector('#sim-alert.show', { timeout: 30000 });
      if (g.elapsed() < 59) assert.equal(await rn.$('#sim-alert [data-a=override]'), null, 'no override button before 1:00');
      await rn.click(`#sim-alert [data-a=${action}]`);
      await cast.nurse.stream.until((s) => Object.values(((s.you.sim || {}).chart || {}).alerts || {}).some((x) => x.a === action), 4000, `the ${action} to be logged`);
      await H.sleep(500);
    }
    await g.waitUntilElapsed(61);
    await rn.waitForSelector('#sim-alert.show', { timeout: 20000 });
    assert.ok(await rn.$('#sim-alert [data-a=override]'), 'an override button from 1:00 on');
    await rn.click('#sim-alert [data-a=override]');
    await cast.nurse.stream.until((s) => Object.values(s.you.sim.chart.alerts).some((x) => x.a === 'override'), 4000, 'the override to be logged');
    const entries = Object.values(chart('nurse').alerts);
    const untimed = entries.filter((e) => !['at', 't', 'time', 'timestamp', 'clock'].some((k) => e[k] !== undefined));
    assert.equal(untimed.length, 0, `each logged action needs a timestamp; ${untimed.length} of ${entries.length} have none (fields: ${Object.keys(entries[0] || {}).join(', ')})`);
  });

  it('[P1] SIM-09 every clue is where the briefs say', { timeout: 150000 }, async () => {
    const problems = [];
    const check = (ok, msg) => { if (!ok) problems.push(msg); };

    await H.openTab(doc, 'notes');
    await H.chartClick(doc, '[data-act=sim-notes]:has-text("Nursing")');
    const tremor = await openRow(doc, '05:30').catch(() => '');
    check(/night/i.test(tremor) && /tremor/i.test(tremor), 'the tremor is in the 05:30 night nursing note');

    await H.chartClick(doc, '[data-act=sim-notes]:has-text("Consults")');
    const id = await openRow(doc, 'Infectious').catch(() => '');
    const neph = await openRow(doc, 'Nephrology').catch(() => '');
    check(/tacrolimus/i.test(id), 'the ID consult carries a tacrolimus warning');
    check(/tacrolimus/i.test(neph), 'the nephrology consult carries a tacrolimus warning');

    await H.chartClick(doc, '[data-act=sim-notes]:has-text("Other")');
    const nutrition = await openRow(doc, 'Nutrition').catch(() => '');
    check(/potassium/i.test(nutrition) && /supplement|conflict/i.test(nutrition), 'the nutrition note shows the potassium conflict');

    // The donor culture: in the transplant module, and nowhere else.
    for (const tab of ['summary', 'results', 'mar', 'medrec', 'imaging', 'media']) {
      await H.openTab(doc, tab);
      check(!/klebsiella|donor culture[^s]*(esbl|resistant)/i.test(await H.chartText(doc)), `the donor culture must not appear on the ${tab} screen`);
    }
    await H.openTab(doc, 'transplant');
    for (let i = 0; i < 3 && !/klebsiella/i.test(await H.chartText(doc)); i++) await H.chartClick(doc, '[data-act=sim-tx]').catch(() => {});
    check(/klebsiella/i.test(await H.chartText(doc)), 'the donor culture is in the transplant module');

    await H.openTab(doc, 'imaging');
    const head = await H.text(doc, '.wf-x-head:has-text("09/28 16:40")');
    const us = await openRow(doc, '09/28 16:40').catch(() => '');
    check(us.includes(SPEC.CHART.arteryIndex), `the artery flow index ${SPEC.CHART.arteryIndex} is in the ultrasound report body`);
    check(!head.includes(SPEC.CHART.arteryIndex), 'the artery flow index is not in the report summary line');

    await H.openTab(doc, 'media');
    const ecg = await openRow(doc, 'ECG').catch(() => '');
    check(ecg.includes(`QTc ${SPEC.CHART.qtc}`) && /unreviewed|awaiting physician review|not reviewed/i.test(ecg), 'the ECG shows QTc 492 ms as unreviewed');

    await H.openTab(rn, 'flow');
    check(/early warning score[^]*\b5\b/i.test(await H.chartText(rn)), 'the early warning score of 5 is in the flowsheet');

    // Three home medication lists, each in its own place.
    await H.openTab(doc, 'medrec');
    const medrec = await H.chartText(doc);
    await H.openTab(doc, 'media');
    const media = await H.chartText(doc);
    const places = [/march/i.test(medrec), /pharmacy fill/i.test(medrec) || /pharmacy fill/i.test(media), /handwritten/i.test(media)];
    check(places.every(Boolean), 'three home medication lists: the imported March list, the pharmacy fill list and the handwritten list');

    assert.deepEqual(problems, [], problems.join('\n'));
  });

  it('[P1] SIM-11 the nurse must enter the same vitals on more than one screen', async () => {
    await H.openTab(rn, 'flow');
    const forms = await rn.$$eval('#sim-body .ehr-box', (boxes) => boxes.map((b) => [...b.querySelectorAll('input')].map((i) => i.dataset.field || i.name || '')));
    const withHr = forms.filter((fields) => fields.some((f) => /^HR$|heart rate/i.test(f)));
    assert.ok(withHr.length >= 2, `heart rate must be typed on at least two screens (found ${withHr.length})`);
  });

  it('[P1] SIM-12 each findings entry saves the finding, the screen and the time', async () => {
    await H.chartClick(doc, '[data-act=sim-side][data-side=notes]');
    const fields = {
      finding: await doc.$('[data-test=finding-text], [name=finding]'),
      screen: await doc.$('[data-test=finding-screen], [name=screen]'),
      add: await doc.$('[data-test=finding-add], [data-act=finding-add]'),
    };
    assert.ok(fields.finding && fields.screen && fields.add, 'a findings entry form with finding, screen and an add button (data-test=finding-text / finding-screen / finding-add)');
    await fields.finding.fill('Tremor at 05:30');
    await fields.screen.fill('Notes → Nursing');
    await fields.add.click();
    await cast.physician.stream.until((s) => ((s.you.sim || {}).chart || {}).findings?.length > 0, 4000, 'the finding to save');
    const entry = chart('physician').findings[0];
    assert.equal(entry.text || entry.finding, 'Tremor at 05:30');
    assert.equal(entry.screen, 'Notes → Nursing');
    assert.ok(entry.at || entry.time || entry.clock, 'the entry is timestamped');
  });

  it('[P1] SIM-13 closing and reopening the tab rejoins the same phase with timer and findings intact', async () => {
    await H.chartClick(doc, '[data-act=sim-side][data-side=notes]');
    const notes = doc.locator('[data-simnotes], [data-test=finding-text]').first();
    await notes.fill('Doppler body, Imaging tab');
    await H.sleep(900);
    await doc.context().close();
    cast.physician.stream.close(); // the harness's own connection also holds the seat
    await H.sleep(500);
    // Rejoin the way a student would: same name, from the join form.
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    doc = await ctx.newPage();
    doc.setDefaultTimeout(8000);
    doc.errors = [];
    doc.on('pageerror', (e) => doc.errors.push(e.message));
    await doc.goto(g.base);
    await doc.click('[data-act=home-join]');
    await doc.fill('input[name=code]', g.code);
    await doc.fill('input[name=name]', cast.physician.name);
    await doc.click('button[type=submit]');
    await doc.waitForSelector('#sim-body', { timeout: 8000 });
    await cast.physician.reopen();
    const shown = await doc.$eval('.ehr-task-timer', (e) => e.textContent.trim());
    const [m, s] = shown.split(':').map(Number);
    assert.ok(Math.abs(m * 60 + s - g.remaining()) <= 2, `the timer continues (${shown} vs ${Math.round(g.remaining())} s left)`);
    await H.chartClick(doc, '[data-act=sim-side][data-side=notes]');
    assert.match(await doc.locator('[data-simnotes]').inputValue().catch(() => ''), /Doppler body/, 'the findings log is intact');
  });

  it('[P2] SIM-14 on a phone-width screen the alerts, chart and findings log need no horizontal scrolling', async () => {
    const phone = await H.openPage(browser, g, cast.exec, { viewport: { width: 390, height: 844 } });
    try {
      await phone.waitForSelector('#sim-body');
      const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `page is ${overflow}px wider than the phone`);
      for (const sel of ['.ehr-window', '#sim-side']) {
        const box = await phone.$eval(sel, (e) => e.getBoundingClientRect().right).catch(() => 0);
        assert.ok(box <= 391, `${sel} fits the screen width`);
      }
    } finally {
      await phone.context().close();
    }
  });

  it('[P1] SIM-03 alerts: ~1 per 15 s, then ~1 per 5 s, then faster than 1 per second', () => {
    // The alert schedule is read from the app, since the queue hides how fast alerts arrive.
    const { SIM } = require(path.join(H.ROOT, 'public', 'content.js'));
    for (const side of ['physician', 'nurse']) {
      const t = SIM.SIDES[side].alerts.map((a) => a.t);
      const count = (from, to) => t.filter((x) => x >= from && x < to).length;
      assert.ok(count(0, 60) >= 3 && count(0, 60) <= 5, `${side}: 0:00–1:00 should have ~4 alerts, has ${count(0, 60)}`);
      assert.ok(count(60, 120) >= 10 && count(60, 120) <= 14, `${side}: 1:00–2:00 should have ~12 alerts, has ${count(60, 120)}`);
      assert.ok(count(120, 165) > 45, `${side}: 2:00–2:45 should exceed one per second (>45), has ${count(120, 165)}`);
    }
  });

  it('[P1] SIM-05 at 2:00 the 84-page fax is in the outside records as one unsearchable image', { timeout: 90000 }, async () => {
    await g.waitUntilElapsed(120);
    let found = '';
    for (let i = 0; i < 12 && !/84[- ]page/i.test(found); i++) {
      await H.openTab(doc, 'media');
      found = await H.chartText(doc);
      if (!/84[- ]page/i.test(found)) await H.sleep(1500);
    }
    assert.match(found, /84[- ]page/i, 'the 84-page fax appears by 2:15 at the latest');
    await H.chartClick(doc, '.wf-x-head:has-text("84")');
    assert.ok(await doc.$('.wf-fax-page, img'), 'the fax opens as a page image');
    assert.equal(await doc.$('#sim-body input[type=search], #sim-body [data-act*=search]'), null, 'the fax has no search');
    assert.match(await H.chartText(doc), /search unavailable|cannot be searched|not searchable|scanned image/i, 'the fax is marked unsearchable');
  });

  it('[P1] SIM-06 at 2:45 (13:02) tacrolimus 19.4, potassium 6.2 and creatinine 2.4 post together, each flagged critical', { timeout: 90000 }, async () => {
    if (g.elapsed() < 160) {
      await g.waitUntilElapsed(160);
      await H.openTab(doc, 'results');
      assert.ok(!(await H.chartText(doc)).includes('19.4'), 'labs are still pending before 2:45');
    }
    await g.waitUntilElapsed(167);
    assert.equal(await doc.$eval('[data-simclock]', (e) => e.textContent.trim()), '13:02', 'the app clock reads 13:02 at 2:45');
    await H.openTab(doc, 'results');
    const results = await H.chartText(doc);
    for (const v of ['19.4', '6.2', '2.4']) assert.ok(results.includes(v), `${v} posted`);
    const { SIM } = require(path.join(H.ROOT, 'public', 'content.js'));
    const labAlerts = SIM.SIDES.physician.alerts.filter((a) => /19\.4|6\.2|2\.4/.test(a.title));
    assert.equal(new Set(labAlerts.map((a) => a.t)).size, 1, 'all three fire at the same moment');
    for (const a of labAlerts) assert.match(a.title, /critical/i, `"${a.title}" must be flagged critical`);
  });

  it('[P1] SIM-07 at 3:00 screens freeze, order signing fails and a downtime banner appears, with no real errors or lost data', { timeout: 90000 }, async () => {
    await H.chartClick(doc, '[data-act=sim-side][data-side=notes]');
    await doc.locator('[data-simnotes]').fill('Doppler body, Imaging tab. Pre-crash finding.');
    await H.sleep(900);
    await g.waitUntilElapsed(186);
    for (const [team, page] of [['physician', doc], ['nurse', rn]]) {
      assert.ok(await page.isVisible('#sim-down.show, .downtime'), `${team} screen is frozen`);
      assert.match(await H.text(page), /downtime/i, `${team} sees a downtime banner`);
      assert.deepEqual(page.errors, [], `${team} logged no real errors`);
    }
    const sign = await doc.$('[data-act*=sign], button:has-text("Sign")');
    assert.ok(sign, 'an order-signing control to show that signing fails');
    await sign.click({ force: true }).catch(() => {});
    assert.match(await H.text(doc), /won't sign|cannot be signed|signing failed|failed to sign/i, 'signing fails with a message');
    assert.match(chart('physician').notes || '', /Pre-crash finding/, 'no player lost data');
  });

  it('[P1] SIM-08 during downtime the paper findings log still accepts entries', { timeout: 60000 }, async () => {
    await g.waitUntilElapsed(190);
    const box = rn.locator('[data-simnotes]');
    await rn.click('[data-act=sim-side][data-side=notes]').catch(() => {});
    await box.fill('Written during downtime');
    await cast.nurse.stream.until((s) => /Written during downtime/.test(((s.you.sim || {}).chart || {}).notes || ''), 4000, 'the downtime entry to save');
  });

  it('[P1] SIM-02 the app clock runs from 12:45 to 13:05 over the 4 minutes', { timeout: 90000 }, async () => {
    assert.equal(startClock, '12:45');
    await g.waitUntilElapsed(237);
    const end = await doc.$eval('[data-simclock]', (e) => e.textContent.trim());
    assert.ok(['13:04', '13:05'].includes(end), `the clock reaches 13:05 at 4:00 (read ${end} at 3:57)`);
  });
});
