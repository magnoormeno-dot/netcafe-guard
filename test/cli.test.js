'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'netcafe-guard.js');
const DEMO_FACTS = path.join(__dirname, '..', 'demo', 'cafe-pc-07.json');

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

const SCAN_DEMO = ['scan', '--facts', DEMO_FACTS, '--platform', 'win32', '--no-color'];

test('an undeclared --profile name warns on stderr and lists the known names', () => {
  const out = run([...SCAN_DEMO, '--profile', 'shared-offic']);
  assert.equal(out.status, 0);
  assert.match(out.stderr, /no rule declares profile "shared-offic"/);
  assert.match(out.stderr, /gaming-cafe, shared-office/);
});

test('the documented profiles do not warn', () => {
  for (const profile of ['gaming-cafe', 'shared-office']) {
    const out = run([...SCAN_DEMO, '--profile', profile]);
    assert.equal(out.status, 0);
    assert.doesNotMatch(out.stderr, /no rule declares profile/);
  }
});

test('the profile warning stays off stdout so --json output remains parseable', () => {
  const out = run([...SCAN_DEMO.filter((a) => a !== '--no-color'), '--json', '--profile', 'typo']);
  assert.match(out.stderr, /no rule declares profile "typo"/);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.profile, 'typo');
});

test('list-rules warns on an undeclared --profile too', () => {
  const out = run(['list-rules', '--profile', 'typo']);
  assert.equal(out.status, 0);
  assert.match(out.stderr, /no rule declares profile "typo"/);
});
