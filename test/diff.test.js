'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan, renderJson } = require('../src');
const { diffReports, renderDiffText } = require('../src/diff');

const BIN = path.join(__dirname, '..', 'bin', 'netcafe-guard.js');

const BASE = {
  hostname: 'CAFE-PC-07', platform: 'win32', arch: 'x64',
  autoAdminLogon: false, defaultPasswordStored: false, guestAccountActive: false, rdpEnabled: false,
  autorunDisabledAllDrives: true, firewallAllProfilesOn: true, defenderRealtimeEnabled: true,
  screenLockTimeoutSec: 600, screenLockOnResume: true,
  sessionRestoreActive: true, leftoverCredentialCount: 0, leftoverCredentialFiles: [],
  agentToolConfigCount: 0, agentToolConfigFiles: [], aiServiceExposedCount: 0, aiServiceExposed: [],
  recallDisabled: true, recallSnapshotStorePresent: false, gameDvrDisabled: true,
  clipboardHistoryDisabled: true, clipboardSyncDisabled: true, copilotPolicySet: true, copilotDisabled: true,
  browserPasswordSavingDisabled: true
};

function report(facts) {
  return JSON.parse(renderJson(scan({ facts, platform: 'win32' })));
}

test('diff classifies regressions, fixes and other changes', () => {
  const before = report({ ...BASE, guestAccountActive: true });
  const after = report({
    ...BASE,
    guestAccountActive: false,                       // fixed
    sessionRestoreActive: false,                     // regression (critical)
    leftoverCredentialCount: 1, leftoverCredentialFiles: ['~/.aws/credentials'], // regression
    clipboardHistoryDisabled: undefined              // pass -> unknown: drift, not a regression
  });
  const d = diffReports(before, after);
  assert.deepEqual(d.regressions.map((r) => r.id), ['tenant-session-restore-active', 'tenant-no-leftover-credentials']);
  assert.equal(d.regressions[0].from, 'pass');
  assert.equal(d.regressions[0].to, 'fail');
  assert.deepEqual(d.fixes.map((r) => r.id), ['win-guest-disabled']);
  assert.deepEqual(d.changed.map((c) => [c.id, c.from, c.to]), [['ai-clipboard-history-disabled', 'pass', 'unknown']]);
  assert.equal(d.scoreDelta, before.summary.score > after.summary.score ? after.summary.score - before.summary.score : d.scoreDelta);
  assert.ok(d.scoreDelta < 0);
  assert.match(renderDiffText(d), /REGRESSIONS \(2\)/);
  assert.match(renderDiffText(d), /FIXED \(1\)/);
});

test('identical reports produce no drift; ruleset changes show as added/removed', () => {
  const a = report(BASE);
  const same = diffReports(a, a);
  assert.equal(same.regressions.length + same.fixes.length + same.changed.length, 0);
  assert.match(renderDiffText(same), /No drift/);

  const fewer = { ...a, findings: a.findings.filter((f) => f.id !== 'win-rdp-disabled') };
  assert.deepEqual(diffReports(a, fewer).removed.map((r) => r.id), ['win-rdp-disabled']);
  assert.deepEqual(diffReports(fewer, a).added.map((r) => r.id), ['win-rdp-disabled']);
});

test('a failing check whose observed value changed is reported as a change', () => {
  const before = report({ ...BASE, leftoverCredentialCount: 1, leftoverCredentialFiles: ['~/.aws/credentials'] });
  const after = report({ ...BASE, leftoverCredentialCount: 2, leftoverCredentialFiles: ['~/.aws/credentials', '~/.ssh/id_rsa'] });
  const d = diffReports(before, after);
  assert.equal(d.regressions.length, 0);
  assert.equal(d.changed[0].id, 'tenant-no-leftover-credentials');
  assert.deepEqual(d.changed[0].observedBefore, 1);
});

test('CLI: diff exits 3 on regressions, 0 otherwise, and --json is parseable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncg-diff-'));
  const beforeFile = path.join(dir, 'before.json');
  const afterFile = path.join(dir, 'after.json');
  fs.writeFileSync(beforeFile, JSON.stringify(report(BASE)));
  fs.writeFileSync(afterFile, JSON.stringify(report({ ...BASE, rdpEnabled: true })));

  const bad = spawnSync(process.execPath, [BIN, 'diff', beforeFile, afterFile], { encoding: 'utf8' });
  assert.equal(bad.status, 3);
  assert.match(bad.stdout, /REGRESSIONS \(1\)/);
  assert.match(bad.stdout, /win-rdp-disabled/);

  const ok = spawnSync(process.execPath, [BIN, 'diff', beforeFile, beforeFile, '--json'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).regressions.length, 0);

  const usage = spawnSync(process.execPath, [BIN, 'diff', beforeFile], { encoding: 'utf8' });
  assert.equal(usage.status, 1);
});
