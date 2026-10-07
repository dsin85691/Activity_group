'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness');
const SPEC = require('./spec');

const VOTERS = ['exec', 'finance', 'physician', 'nurse', 'it', 'compliance', 'advocate'];

describe('7. Phase 5: Discussion, voting and decision', () => {
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
    await g.goto(step);
    return { g, cast };
  }

  // Builds a choice in the first-choice picker and returns the summary line shown under it.
  async function build(page, letters) {
    for (const l of letters) {
      await page.click(`[data-dyn="pick:first"] [data-pkg=${l}]`);
      await H.sleep(150);
    }
    const summary = await H.text(page, '[data-dyn="pick:first"] .picker-sum, [data-test=choice-summary]');
    for (const l of letters) {
      await page.click(`[data-dyn="pick:first"] [data-pkg=${l}]`);
      await H.sleep(100);
    }
    return summary;
  }

  // ----- discussion -----

  it('[P1] DSC-01 finance framing runs 2 minutes and shows the $12M cap to everyone', async () => {
    const { g, cast } = await at('p5_framing');
    try {
      assert.equal(g.host.state.timerTotal, SPEC.TIMING.framing);
      if (browser) {
        for (const [role, p] of Object.entries(cast)) {
          const page = await H.openPage(browser, g, p);
          assert.match(await H.text(page), /\$12M/, `${role} sees the $12M cap`);
          await page.context().close();
        }
      }
    } finally {
      g.close();
    }
  });

  it('[P1] DSC-02 during the intra-team step each group\'s choices stay private', async () => {
    const { g, cast } = await at('p5_intra');
    try {
      assert.equal(g.host.state.timerTotal, SPEC.TIMING.intra);
      await cast.exec.act('picks', { first: 'A+D', second: 'C' });
      await H.sleep(400);
      const leaked = JSON.stringify(cast.finance.state()).includes('A+D');
      assert.equal(leaked, false, "finance's state must not contain the executives' private choice");
      if (browser) {
        const page = await H.openPage(browser, g, cast.finance);
        assert.doesNotMatch(await H.text(page), /A \+ D/, "finance's screen must not show the executives' choice");
        await page.context().close();
      }
    } finally {
      g.close();
    }
  });

  it("[P1] DSC-03 during the inter-team step every group's first and second choice is visible to all", { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_intra');
    try {
      await cast.exec.act('picks', { first: 'A+D', second: 'C' });
      await g.goto('p5_inter');
      assert.equal(g.host.state.timerTotal, SPEC.TIMING.inter);
      const page = await H.openPage(browser, g, cast.finance);
      const t = await H.text(page);
      await page.context().close();
      assert.match(t, /A \+ D/, "the executives' first choice is visible");
      assert.match(t, /Executive[^]*C\b/, "and their second choice");
    } finally {
      g.close();
    }
  });

  it('[P1] DSC-04 a question to the vendor reaches the vendors, and the answer is visible to everyone', async () => {
    const { g, cast } = await at('p5_inter');
    try {
      const ask = await cast.it.act('vendor_question', { text: 'Does it use standard FHIR APIs?' });
      assert.ok(ask.ok, `IT can ask the vendor (${ask.error || ''})`);
      await H.sleep(300);
      assert.match(JSON.stringify(cast.vendor.state()), /standard FHIR APIs/, 'the vendors receive the question');
      const answer = await cast.vendor.act('vendor_answer', { text: 'Yes, FHIR R4.' });
      assert.ok(answer.ok, 'the vendor can answer');
      await H.sleep(300);
      for (const role of ['exec', 'advocate']) assert.match(JSON.stringify(cast[role].state()), /FHIR R4/, `${role} sees the answer`);
    } finally {
      g.close();
    }
  });

  it('[P1] DSC-05 a combination shows its total cost and the combined problems, duplicates counted once', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_intra');
    const page = await H.openPage(browser, g, cast.exec);
    try {
      const s = await build(page, ['A', 'B']); // both fix 1, 9 and 10
      assert.match(s, /\$9M/, 'A + B costs $9M');
      assert.match(s, /\b8\b/, 'A + B fixes 8 problems (1, 9 and 10 counted once)');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] DSC-06 the combinations table: A+D, D+B, C+B, A+B, C, E', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_intra');
    const page = await H.openPage(browser, g, cast.exec);
    try {
      for (const combo of SPEC.COMBOS) {
        const s = await build(page, combo.letters);
        assert.match(s, new RegExp(`\\$${combo.cost}M`), `${combo.letters.join(' + ')} costs $${combo.cost}M (shown: ${s})`);
        assert.match(s, new RegExp(`\\b${combo.fixes.length}\\b`), `${combo.letters.join(' + ')} fixes ${combo.fixes.length} problems`);
        assert.ok(combo.fixes.every((n) => new RegExp(`\\b${n}\\b`).test(s)), `${combo.letters.join(' + ')} lists ${combo.fixes.join(', ')}`);
      }
    } finally {
      await page.context().close();
      g.close();
    }
  });

  it('[P1] DSC-07 C + D shows $15M and an over-budget warning: $3M more or a phased contract', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_intra');
    const page = await H.openPage(browser, g, cast.exec);
    try {
      const s = await build(page, ['C', 'D']);
      assert.match(s, /\$15M/);
      assert.match(s, /over budget/i, 'an "over budget" warning');
      assert.match(s, /\$3M/, 'it needs $3M more');
      assert.match(s, /phas/i, 'or a phased contract');
    } finally {
      await page.context().close();
      g.close();
    }
  });

  // ----- voting -----

  it('[P1] VOT-01 groups 1, 2, 3, 4, 6 and 7 each get exactly one vote: six in total', async () => {
    const { g, cast } = await at('p5_vote');
    try {
      for (const role of VOTERS) assert.ok((await cast[role].act('vote', { choice: 'A+D' })).ok, `${role} can vote`);
      await g.goto('p5_decision');
      const groups = Object.keys(g.host.state.results.groupVotes).map(Number).sort();
      assert.deepEqual(groups, SPEC.VOTING_GROUPS, 'one vote per voting group');
      assert.equal(g.host.state.results.ranking[0].groups, 6, 'six votes in total');
    } finally {
      g.close();
    }
  });

  it('[P1] VOT-02 a vote for an over-budget combination is blocked with a $12M message', async () => {
    const { g, cast } = await at('p5_vote');
    try {
      const res = await cast.finance.act('vote', { choice: 'C+D' });
      assert.equal(res.ok, false, 'the C + D ($15M) vote is refused');
      assert.match(res.error || '', /12M|budget/i, 'the message mentions the $12M cap');
    } finally {
      g.close();
    }
  });

  it('[P1] VOT-03 voting twice replaces the first vote', async () => {
    const { g, cast } = await at('p5_vote');
    try {
      await cast.finance.act('vote', { choice: 'A+D' });
      await cast.finance.act('vote', { choice: 'B+D' });
      await g.goto('p5_decision');
      assert.equal(g.host.state.results.groupVotes[2], 'B+D', 'the second vote replaced the first');
      const total = g.host.state.results.ranking.reduce((a, r) => a + r.groups, 0);
      assert.equal(total, 1, 'only one vote counted');
    } finally {
      g.close();
    }
  });

  it('[P1] VOT-04 when voting closes the winner and runner-up show with their vote counts', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_vote');
    try {
      for (const role of ['exec', 'finance', 'physician', 'nurse']) await cast[role].act('vote', { choice: 'A+D' });
      for (const role of ['it', 'compliance', 'advocate']) await cast[role].act('vote', { choice: 'C' });
      await g.goto('p5_decision');
      const page = await H.openPage(browser, g, 'host');
      const t = await H.text(page);
      await page.context().close();
      assert.match(t, /winner/i, 'the winner is named');
      assert.match(t, /runner-?up/i, 'the runner-up is named');
      assert.match(t, /AI Clinical Assistant \+ D\. Intelligent Safety System[^]*\b3\b/, 'the winner with its 3 votes');
      assert.match(t, /C\. Connected Hospital[^]*\b3\b/, 'the runner-up with its 3 votes');
    } finally {
      g.close();
    }
  });

  it('[P1] VOT-05 a tied vote applies the agreed tie rule and says which rule it used', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_vote');
    try {
      for (const role of ['exec', 'finance', 'it']) await cast[role].act('vote', { choice: 'A+D' });
      for (const role of ['physician', 'nurse', 'compliance', 'advocate']) await cast[role].act('vote', { choice: 'C' }); // group 3 = one vote
      await g.goto('p5_decision');
      const page = await H.openPage(browser, g, 'host');
      const t = await H.text(page);
      await page.context().close();
      assert.match(t, /tie/i, 'the screen says there was a tie');
      assert.match(t, /tie[^.]{0,80}(rule|broken|CFO|cheaper|decid)/i, 'and which rule broke it');
    } finally {
      g.close();
    }
  });

  it('[P2] VOT-06 a group that does not vote is recorded as abstaining and the result still computes', { skip: H.NO_BROWSER }, async () => {
    const { g, cast } = await at('p5_vote');
    try {
      for (const role of VOTERS.filter((r) => r !== 'it')) await cast[role].act('vote', { choice: 'A+D' });
      await g.goto('p5_decision');
      assert.equal(g.host.state.results.ranking[0].key, 'A+D', 'the result still computes');
      const page = await H.openPage(browser, g, 'host');
      const t = await H.text(page);
      await page.context().close();
      assert.match(t, /abstain/i, 'IT shows as abstaining');
    } finally {
      g.close();
    }
  });

  // ----- decision -----

  async function voted(choiceA, choiceB) {
    const { g, cast } = await at('p5_vote');
    for (const role of ['exec', 'finance', 'physician', 'nurse']) await cast[role].act('vote', { choice: choiceA });
    for (const role of ['it', 'compliance', 'advocate']) await cast[role].act('vote', { choice: choiceB });
    await g.goto('p5_decision');
    return { g, cast };
  }

  it('[P1] DEC-01 only the Finance role sees the sign-off control, and sign-off confirms the cost is within $12M', async () => {
    const { g, cast } = await voted('A+D', 'C');
    try {
      assert.equal((await cast.exec.act('decide', { op: 'cfo_ok' })).ok, false, 'the CEO cannot sign off the budget');
      if (browser) {
        for (const role of ['exec', 'it', 'vendor']) {
          const page = await H.openPage(browser, g, cast[role]);
          assert.equal(await page.$('[data-op^=cfo]'), null, `${role} sees no sign-off control`);
          await page.context().close();
        }
        const page = await H.openPage(browser, g, cast.finance);
        assert.ok(await page.$('[data-op=cfo_ok]'), 'finance sees the sign-off control');
        await page.click('[data-op=cfo_ok]');
        await H.sleep(500);
        assert.match(await H.text(page), /within|fits/i, 'sign-off confirms the cost is within $12M');
        await page.context().close();
      }
    } finally {
      g.close();
    }
  });

  it('[P1] DEC-02 a go locks the decision and announces it to the vendors and every player', async () => {
    const { g, cast } = await voted('A+D', 'C');
    try {
      assert.ok((await cast.finance.act('decide', { op: 'cfo_ok' })).ok);
      assert.ok((await cast.exec.act('decide', { op: 'go' })).ok);
      for (const [role, p] of Object.entries(cast)) await p.stream.until((s) => s.decision && s.decision.final === 'A+D', 3000, `${role} to receive the decision`);
      if (browser) {
        const page = await H.openPage(browser, g, cast.vendor);
        assert.match(await H.text(page), /decided|decision/i, 'the vendors see the announcement');
        await page.context().close();
      }
    } finally {
      g.close();
    }
  });

  it('[P1] DEC-03 a no-go sends the runner-up forward automatically, with no second debate', async () => {
    const { g, cast } = await voted('A+D', 'C');
    try {
      await cast.finance.act('decide', { op: 'cfo_ok' });
      assert.ok((await cast.exec.act('decide', { op: 'nogo' })).ok);
      await g.host.until((s) => s.decision.final, 3000, 'a final decision');
      assert.equal(g.host.state.decision.final, 'C', 'the runner-up goes forward');
      assert.equal(g.step, 'p5_decision', 'no return to the debate');
    } finally {
      g.close();
    }
  });

  it('[P1] DEC-04 once locked no role can change the decision; only the facilitator can reset it, and the reset is logged', async () => {
    const { g, cast } = await voted('A+D', 'C');
    try {
      await cast.finance.act('decide', { op: 'cfo_ok' });
      await cast.exec.act('decide', { op: 'go' });
      for (const [role, p] of Object.entries(cast)) {
        for (const op of ['cfo_ok', 'cfo_reject', 'go', 'nogo']) assert.equal((await p.act('decide', { op })).ok, false, `${role} cannot ${op} after the lock`);
      }
      assert.equal(g.host.state.decision.final, 'A+D');
      const reset = await g.hostAct('reset_decision');
      assert.ok(reset.ok, `the facilitator can reset the decision (${reset.error || ''})`);
      await H.sleep(300);
      assert.equal(g.host.state.decision.final, null, 'the decision is cleared');
      assert.match(JSON.stringify(g.host.state), /reset/i, 'the reset is logged');
    } finally {
      g.close();
    }
  });
});
