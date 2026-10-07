// node:test reporter for the acceptance cases: one line per case, then a P1/P2 summary.
// Writes results.json next to this file for run.js to decide the exit code.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = process.env.ACCEPT_RESULTS || path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.json');
const CASE = /^\[(P[12])\]\s+([A-Z]+-\d+[a-z]?)\s+(.*)$/;

const reason = (error) => {
  if (!error) return '';
  const e = error.cause || error;
  return String(e.message || e).split('\n').filter(Boolean).slice(0, 6).join('\n      ');
};

export default async function* reporter(source) {
  const results = [];
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const m = event.data.name.match(CASE);
    if (!m) {
      // A whole section failed to set up (for example the server would not start).
      if (event.type === 'test:fail' && event.data.nesting === 0) yield `\nSECTION FAILED: ${event.data.name}\n      ${reason(event.data.details?.error)}\n`;
      continue;
    }
    const skipped = event.data.skip !== undefined && event.data.skip !== false;
    const status = event.type === 'test:fail' ? 'FAIL' : skipped ? 'SKIP' : 'PASS';
    const r = { id: m[2], priority: m[1], title: m[3], status, reason: status === 'FAIL' ? reason(event.data.details?.error) : skipped ? String(event.data.skip) : '', file: event.data.file };
    results.push(r);
    yield `${status}  ${r.priority}  ${r.id.padEnd(8)} ${r.title}\n${r.reason && status !== 'PASS' ? `      ${r.reason}\n` : ''}`;
  }

  const count = (pri, status) => results.filter((r) => r.priority === pri && r.status === status).length;
  const p1fail = results.filter((r) => r.priority === 'P1' && r.status === 'FAIL');
  yield '\n──────────── Acceptance summary ────────────\n';
  yield `P1: ${count('P1', 'PASS')} passed, ${count('P1', 'FAIL')} failed, ${count('P1', 'SKIP')} skipped\n`;
  yield `P2: ${count('P2', 'PASS')} passed, ${count('P2', 'FAIL')} failed, ${count('P2', 'SKIP')} skipped\n`;
  yield p1fail.length
    ? `\nSESSION BLOCKED: ${p1fail.length} P1 case(s) failed: ${[...new Set(p1fail.map((r) => r.id))].join(', ')}\n`
    : count('P1', 'SKIP') ? '\nNo P1 failures, but some P1 cases were skipped. Run them before class.\n' : '\nREADY FOR CLASS: every P1 case passed.\n';
  writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), results }, null, 2));
}
