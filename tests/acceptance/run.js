#!/usr/bin/env node
'use strict';
// Runs the acceptance cases from 16-test-cases.md.
//
//   node tests/acceptance/run.js            every section
//   node tests/acceptance/run.js 03 07      only sections whose file starts with 03 or 07
//
// Exit code 1 if any P1 case fails (the session is blocked), otherwise 0.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const RESULTS = process.env.ACCEPT_RESULTS || path.join(DIR, 'results.json');
const filters = process.argv.slice(2);
const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !filters.length || filters.some((x) => f.startsWith(x)))
  .sort()
  .map((f) => path.join(DIR, f));

if (!files.length) {
  console.error(`No test files match: ${filters.join(' ')}`);
  process.exit(2);
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 && !(major === 18 && minor >= 17)) {
  console.error(`Node ${process.versions.node} is too old for this runner; use Node 20 or newer.`);
  process.exit(2);
}

const args = ['--test', `--test-reporter=${path.join(DIR, 'reporter.mjs')}`, '--test-reporter-destination=stdout'];
// Browser-heavy sections compete for CPU; ACCEPT_SERIAL=1 runs one file at a time.
if (process.env.ACCEPT_SERIAL) args.push('--test-concurrency=1');
fs.rmSync(RESULTS, { force: true });
const run = spawnSync(process.execPath, [...args, ...files], { stdio: 'inherit', env: { ...process.env, ACCEPT_RESULTS: RESULTS } });

let results = [];
try {
  results = JSON.parse(fs.readFileSync(RESULTS, 'utf8')).results;
} catch {
  console.error('\nNo results were written; the test run itself failed to start.');
  process.exit(run.status || 2);
}
process.exit(results.some((r) => r.priority === 'P1' && r.status === 'FAIL') ? 1 : 0);
