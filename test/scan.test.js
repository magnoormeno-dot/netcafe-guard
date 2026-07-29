'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src');
const { renderJson, renderText } = require('../src/report');

// A fully insecure kiosk: everything a public PC should NOT be.
const INSECURE = {
  hostname: 'CAFE-PC-07',
  platform: 'win32',
  arch: 'x64',
  autoAdminLogon: true,
  defaultPasswordStored: true,
  guestAccountActive: true,
  rdpEnabled: true,
  autorunDisabledAllDrives: false,
  firewallAllProfilesOn: false,
  defenderRealtimeEnabled: false,
  screenLockTimeoutSec: 0,
  screenLockOnResume: false
};

// A well-hardened kiosk.
const HARDENED = {
  hostname: 'CAFE-PC-07',
  platform: 'win32',
  arch: 'x64',
  autoAdminLogon: false,
  defaultPasswordStored: false,
  guestAccountActive: false,
  rdpEnabled: false,
  autorunDisabledAllDrives: true,
  firewallAllProfilesOn: true,
  defenderRealtimeEnabled: true,
  screenLockTimeoutSec: 600,
  screenLockOnResume: true
};

test('an insecure machine scores badly and reports failures', () => {
  const result = scan({ facts: INSECURE, platform: 'win32' });
  assert.equal(result.summary.grade, 'F');
  assert.ok(result.summary.score < 40);
  assert.ok(result.summary.totals.fail >= 8);
});

test('a hardened machine passes the baseline', () => {
  const result = scan({ facts: HARDENED, platform: 'win32' });
  assert.equal(result.summary.score, 100);
  assert.equal(result.summary.grade, 'A');
  assert.equal(result.summary.totals.fail, 0);
});

test('windows rules are skipped on a linux host', () => {
  const result = scan({ facts: { hostname: 'srv', platform: 'linux', arch: 'x64' }, platform: 'linux' });
  assert.ok(result.summary.totals.skip >= 8);
  assert.equal(result.summary.totals.fail, 0);
});

test('JSON output is well-formed and complete', () => {
  const result = scan({ facts: INSECURE, platform: 'win32' });
  const parsed = JSON.parse(renderJson(result));
  assert.equal(parsed.tool, 'netcafe-guard');
  assert.ok(Array.isArray(parsed.findings));
  assert.equal(parsed.findings.length, result.meta.ruleCount);
  assert.ok(parsed.summary.score < 40);
});

test('text output renders without throwing and mentions the score', () => {
  const result = scan({ facts: INSECURE, platform: 'win32' });
  const text = renderText(result, { color: false });
  assert.match(text, /Score:/);
  assert.match(text, /netcafe-guard/);
});
