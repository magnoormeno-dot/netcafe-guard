'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('../src');
const { probeRecallSnapshotStore, RECALL_SNAPSHOT_STORE } = require('../src/probes');

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ncg-home-'));
}

test('the Recall store probe is an existence check on the documented path', () => {
  assert.equal(RECALL_SNAPSHOT_STORE, 'AppData/Local/CoreAIPlatform.00/UKP');

  const clean = tempHome();
  const facts = {};
  probeRecallSnapshotStore(facts, clean);
  assert.equal(facts.recallSnapshotStorePresent, false);

  const dirty = tempHome();
  fs.mkdirSync(path.join(dirty, ...RECALL_SNAPSHOT_STORE.split('/')), { recursive: true });
  const facts2 = {};
  probeRecallSnapshotStore(facts2, dirty);
  assert.equal(facts2.recallSnapshotStorePresent, true);
});

test('a leftover Recall store fails the rule even when Recall is now disabled by policy', () => {
  const findings = scan({
    facts: { hostname: 'seat', platform: 'win32', arch: 'x64', recallDisabled: true, recallSnapshotStorePresent: true },
    platform: 'win32'
  }).findings;
  assert.equal(findings.find((f) => f.id === 'ai-recall-disabled').status, 'pass');
  const store = findings.find((f) => f.id === 'ai-no-recall-snapshot-store');
  assert.equal(store.status, 'fail');
  assert.equal(store.severity, 'high');
});

test('the Recall store rule is Windows-only and unknown when the probe could not tell', () => {
  const linux = scan({ facts: { hostname: 'k', platform: 'linux', arch: 'x64' }, platform: 'linux' })
    .findings.find((f) => f.id === 'ai-no-recall-snapshot-store');
  assert.equal(linux.status, 'skip');
  const win = scan({ facts: { hostname: 'k', platform: 'win32', arch: 'x64' }, platform: 'win32' })
    .findings.find((f) => f.id === 'ai-no-recall-snapshot-store');
  assert.equal(win.status, 'unknown');
});
