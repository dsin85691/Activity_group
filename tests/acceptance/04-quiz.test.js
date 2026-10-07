'use strict';
// The quiz runs once in real time; `before` records what each question showed, and the cases
// below check those observations.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');
const SPEC = require('./spec');

const UNANSWERED = 2; // nobody answers the third question (QZ-04)
const tagsOf = (t) => [...t.matchAll(/(\d+)\s*·/g)].map((m) => Number(m[1])).sort((a, b) => a - b);

describe('4. Phase 2: Did you spot it?', { skip: H.NO_BROWSER, timeout: 8 * 60 * 1000 }, () => {
  let server;
  let browser;
  let g;
  let cast;
  let doc;
  let rn;
  const seen = []; // one entry per question

  before(async () => {
    server = await H.startServer();
    browser = await H.launch();
    g = await H.Game.create(server);
    cast = await g.cast();
    await g.goto('p1_sim');
    doc = await H.openPage(browser, g, cast.physician);
    rn = await H.openPage(browser, g, cast.nurse);
    await g.next(); // the quiz
    let last = null;
    for (let i = 0; i < 12; i++) {
      // Wait for a new question.
      let q = '';
      for (let w = 0; w < 60; w++) {
        q = await H.text(doc, '.qtext');
        if (q && q !== last) break;
        if (g.step !== 'p2_quiz') break;
        await H.sleep(500);
      }
      if (g.step !== 'p2_quiz' || q === last) break;
      last = q;
      const entry = { index: i, q, shownAt: Date.now(), options: await doc.$$eval('[data-act=quiz]', (els) => els.map((e) => e.textContent.trim())) };
      if (i !== UNANSWERED) {
        await doc.click('[data-act=quiz] >> nth=0').catch(() => {});
        await rn.click('[data-act=quiz] >> nth=0').catch(() => {});
      }
      await doc.waitForSelector('.qreveal', { timeout: 25000 }).catch(() => {});
      entry.reveal = await H.text(doc, '.qreveal');
      entry.after = await H.text(doc, '.stage');
      seen.push(entry);
    }
  });
  after(async () => {
    for (const p of [doc, rn]) await p?.context().close();
    g?.close();
    await browser?.close();
    server?.stop();
  });

  it('[P1] QZ-01 each clinical team gets multiple-choice and yes/no questions, about 20 seconds each', () => {
    assert.ok(seen.length >= 8, `expected at least 8 questions, saw ${seen.length}`);
    assert.ok(seen.some((e) => e.options.length === 2 && e.options.includes('Yes') && e.options.includes('No')), 'at least one yes/no question');
    assert.ok(seen.some((e) => e.options.length > 2), 'at least one multiple-choice question');
    for (let i = 1; i < seen.length; i++) {
      const gap = (seen[i].shownAt - seen[i - 1].shownAt) / 1000;
      assert.ok(gap >= 16 && gap <= 24, `question ${i} lasted ${gap.toFixed(1)} s, expected about 20`);
    }
  });

  it("[P1] QZ-02 answers and problem tags match the Phase 2 brief", () => {
    const problems = [];
    for (const want of SPEC.QUIZ) {
      const got = seen.find((e) => want.q.test(e.q));
      if (!got) { problems.push(`missing question ${want.q}`); continue; }
      if (!want.answer.test(got.reveal)) problems.push(`${want.q}: answer should match ${want.answer}, shown "${got.reveal}"`);
      const tags = tagsOf(got.reveal);
      if (JSON.stringify(tags) !== JSON.stringify(want.tags)) problems.push(`${want.q}: tags should be ${want.tags}, shown ${tags}`);
    }
    assert.deepEqual(problems, [], problems.join('\n'));
  });

  it('[P1] QZ-03 every answer shows where the clue was buried and its EHR problem', () => {
    for (const e of seen) {
      assert.match(e.reveal, /where|buried|found in|sat in/i, `question ${e.index + 1} shows where the clue was`);
      assert.ok(tagsOf(e.reveal).length > 0, `question ${e.index + 1} shows a problem number`);
    }
  });

  it('[P1] QZ-04 a question left to time out is marked unanswered and the quiz moves on', () => {
    const e = seen[UNANSWERED];
    assert.ok(e, 'the unanswered question was shown');
    assert.match(e.after, /no answer|unanswered|not answered/i, 'marked unanswered');
    assert.ok(seen[UNANSWERED + 1], 'the next question followed');
  });

  it('[P1] QZ-05 after the quiz each team ranks its top five; a sixth is blocked', async () => {
    await g.goto('p2_rank');
    await doc.waitForSelector('[data-act=rank]');
    for (let i = 0; i < 5; i++) {
      await doc.locator('[data-act=rank]').nth(i).click();
      await H.sleep(200);
    }
    assert.equal(await doc.locator('[data-act=rank]').nth(5).isDisabled(), true, 'a sixth selection is blocked on screen');
    const res = await cast.physician.act('rank', { ids: [1, 2, 3, 4, 5, 6] });
    await H.sleep(300);
    assert.ok(!res.ok || cast.physician.state().you.rank.length <= 5, 'the server never stores six');
  });

  it("[P1] QZ-06 both teams' rankings merge into one list that shows each team's votes", async () => {
    await cast.physician.act('rank', { ids: [2, 12, 5, 15, 11] });
    await cast.nurse.act('rank', { ids: [8, 2, 9, 11, 6] });
    await g.host.until((s) => s.problems.teamTop.physician.length && s.problems.teamTop.nurse.length, 4000, 'both rankings');
    await g.goto('p3_discuss');
    const host = await H.openPage(browser, g, 'host');
    try {
      const card = await H.text(host, '[data-act=top]:has-text("Alert fatigue")');
      assert.match(card, /phys|🧑‍⚕️/i, "problem 2 shows the physician team's vote");
      assert.match(card, /nurs|👩‍⚕️/i, "problem 2 shows the nurse team's vote");
    } finally {
      await host.context().close();
    }
  });

  it('[P2] QZ-07 if one team does not submit, the merge uses the other and flags the missing one', async () => {
    const g2 = await H.Game.create(server);
    const c2 = await g2.cast();
    try {
      await g2.goto('p2_rank');
      await c2.physician.act('rank', { ids: [2, 12, 5, 15, 11] });
      await g2.goto('p3_discuss');
      assert.deepEqual(g2.host.state.problems.top5.slice(0, 1).length, 1, 'a merged list exists');
      const host = await H.openPage(browser, g2, 'host');
      const t = await H.text(host);
      await host.context().close();
      assert.match(t, /nurse[^.]{0,40}(missing|not submitted|did not submit|no ranking)|(missing|not submitted)[^.]{0,40}nurse/i, 'the missing nurse ranking is flagged');
    } finally {
      g2.close();
    }
  });
});
