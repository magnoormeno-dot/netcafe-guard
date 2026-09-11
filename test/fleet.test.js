'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan, renderJson } = require('../src');
const { aggregateFleet, renderFleetText } = require('../src/fleet');

const BIN = path.join(__dirname, '..', 'bin', 'netcafe-guard.js');

const CLEAN = {
  platform: 'win32', arch: 'x64',
  autoAdminLogon: false, defaultPasswordStored: false, guestAccountActive: false, rdpEnabled: false,
  autorunDisabledAllDrives: true, firewallAllProfilesOn: true, defenderRealtimeEnabled: true,
  screenLockTimeoutSec: 600, screenLockOnResume: true,
  sessionRestoreActive: true, leftoverCredentialCount: 0, leftoverCredentialFiles: [],
  agentToolConfigCount: 0, agentToolConfigFiles: [], aiServiceExposedCount: 0, aiServiceExposed: [],
  recallDisabled: true, recallSnapshotStorePresent: false, gameDvrDisabled: true,
  clipboardHistoryDisabled: true, clipboardSyncDisabled: true, copilotPolicySet: true,
  copilotDisabled: true, browserPasswordSavingDisabled: true
};

function report(overrides) {
  return reportFromFacts({ ...CLEAN, ...overrides });
}

/** Build a report from exact facts — used when a fact must be ABSENT (unknown). */
function reportFromFacts(facts) {
  return JSON.parse(renderJson(scan({ facts, platform: 'win32' })));
}

function input(hostname, overrides) {
  return { label: `${hostname}.json`, report: report({ hostname, ...overrides }) };
}

test('a venue-wide failure is separated from one-off seats', () => {
  const agg = aggregateFleet([
    input('SEAT-01', { recallDisabled: false }),
    input('SEAT-02', { recallDisabled: false }),
    input('SEAT-03', { recallDisabled: false, rdpEnabled: true }),
    input('SEAT-04', {})
  ]);

  assert.equal(agg.seatCount, 4);
  const recall = agg.rules.find((r) => r.id === 'ai-recall-disabled');
  assert.equal(recall.failingCount, 3);
  assert.deepEqual(recall.failingSeats, ['SEAT-01', 'SEAT-02', 'SEAT-03']);

  const rdp = agg.rules.find((r) => r.id === 'win-rdp-disabled');
  assert.equal(rdp.failingCount, 1);

  // Ordering: the fleet-wide problem is listed before the single-seat one.
  assert.ok(agg.rules.indexOf(recall) < agg.rules.indexOf(rdp));

  const text = renderFleetText(agg);
  assert.match(text, /3 seats \( 75%\).*ai-recall-disabled/);
  assert.match(text, /1 seat {2}\( 25%\).*win-rdp-disabled/);
});

test('worst seats sort by score and the summary carries the spread', () => {
  const agg = aggregateFleet([
    input('GOOD', {}),
    input('BAD', { recallDisabled: false, sessionRestoreActive: false }),   // 2 critical -> F
    input('MIDDLING', { rdpEnabled: true })                                 // 1 high -> B
  ]);
  assert.deepEqual(agg.seats.map((s) => s.hostname), ['BAD', 'MIDDLING', 'GOOD']);
  assert.equal(agg.scores.max, 100);
  assert.equal(agg.scores.min, agg.seats[0].score);
  assert.ok(agg.scores.min < agg.scores.median && agg.scores.median < agg.scores.max);
  assert.deepEqual(agg.grades, { A: 1, B: 1, F: 1 });
});

test('unknown results are reported separately from failures', () => {
  const noDefender = { ...CLEAN, hostname: 'SEAT-A' };
  delete noDefender.defenderRealtimeEnabled;   // the probe could not read it
  const agg = aggregateFleet([
    { label: 'a', report: reportFromFacts(noDefender) },
    input('SEAT-B', {})
  ]);
  const defender = agg.rules.find((r) => r.id === 'win-defender-realtime');
  assert.equal(defender.failingCount, 0);
  assert.deepEqual(defender.unknownSeats, ['SEAT-A']);
  assert.match(renderFleetText(agg), /COULD NOT BE READ/);
});

test('re-scans of the same seat collapse to the newest report', () => {
  const older = report({ hostname: 'SEAT-01', recallDisabled: false });
  older.timestamp = '2026-09-01T00:00:00.000Z';
  const newer = report({ hostname: 'SEAT-01' });
  newer.timestamp = '2026-09-10T00:00:00.000Z';

  for (const order of [[older, newer], [newer, older]]) {
    const agg = aggregateFleet(order.map((r, i) => ({ label: `r${i}`, report: r })));
    assert.equal(agg.seatCount, 1);
    assert.equal(agg.supersededReports, 1);
    assert.equal(agg.seats[0].timestamp, '2026-09-10T00:00:00.000Z');
    assert.equal(agg.rules.find((r) => r.id === 'ai-recall-disabled'), undefined);
  }
});

test('non-reports are skipped and named, not silently counted', () => {
  const agg = aggregateFleet([
    input('SEAT-01', {}),
    { label: 'package.json', report: { name: 'something-else' } },
    { label: 'broken.json', report: null }
  ]);
  assert.equal(agg.seatCount, 1);
  assert.deepEqual(agg.skipped, ['package.json', 'broken.json']);
  assert.match(renderFleetText(agg), /Skipped 2 file\(s\)/);
});

test('an empty fleet says so instead of printing zeros', () => {
  const agg = aggregateFleet([]);
  assert.equal(agg.seatCount, 0);
  assert.equal(agg.scores.median, null);
  assert.match(renderFleetText(agg), /No usable reports/);
});

test('CLI: fleet reads a directory, honours --json and --fail-under', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncg-fleet-'));
  fs.writeFileSync(path.join(dir, 'seat-01.json'), JSON.stringify(report({ hostname: 'SEAT-01' })));
  fs.writeFileSync(path.join(dir, 'seat-02.json'), JSON.stringify(report({ hostname: 'SEAT-02', recallDisabled: false })));
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'ignored, not .json');

  const text = spawnSync(process.execPath, [BIN, 'fleet', dir], { encoding: 'utf8' });
  assert.equal(text.status, 0);
  assert.match(text.stdout, /seats: 2/);
  assert.match(text.stdout, /ai-recall-disabled/);

  const json = spawnSync(process.execPath, [BIN, 'fleet', dir, '--json'], { encoding: 'utf8' });
  const agg = JSON.parse(json.stdout);
  assert.equal(agg.seatCount, 2);

  const gate = spawnSync(process.execPath, [BIN, 'fleet', dir, '--fail-under', '90'], { encoding: 'utf8' });
  assert.equal(gate.status, 2);
  assert.match(gate.stderr, /1 seat\(s\) below 90: SEAT-02/);

  const ok = spawnSync(process.execPath, [BIN, 'fleet', dir, '--fail-under', '10'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);

  const usage = spawnSync(process.execPath, [BIN, 'fleet'], { encoding: 'utf8' });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /fleet needs report files or a directory/);
});
