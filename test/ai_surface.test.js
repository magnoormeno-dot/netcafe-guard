'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src');
const {
  probeLeftoverCredentials,
  LEFTOVER_CREDENTIAL_CANDIDATES
} = require('../src/probes');

/**
 * A leased seat that is dangerous specifically because of its AI surface:
 * the classical baseline is fine, but recall capture, clipboard retention and
 * leftover agent credentials all leak across tenants. See docs/VISION.md.
 */
const AI_EXPOSED = {
  hostname: 'CAFE-PC-11',
  platform: 'win32',
  arch: 'x64',
  // classical baseline all good
  autoAdminLogon: false,
  defaultPasswordStored: false,
  guestAccountActive: false,
  rdpEnabled: false,
  autorunDisabledAllDrives: true,
  firewallAllProfilesOn: true,
  defenderRealtimeEnabled: true,
  screenLockTimeoutSec: 600,
  screenLockOnResume: true,
  // multi-tenant + AI surface all bad
  sessionRestoreActive: false,
  leftoverCredentialCount: 2,
  leftoverCredentialFiles: ['~/.ssh/id_rsa', '~/.aws/credentials'],
  recallDisabled: false,
  clipboardHistoryDisabled: false,
  clipboardSyncDisabled: false,
  copilotPolicySet: false,
  browserPasswordSavingDisabled: false
};

const FULLY_HARDENED = {
  ...AI_EXPOSED,
  sessionRestoreActive: true,
  sessionRestoreAgent: 'DFServ',
  leftoverCredentialCount: 0,
  leftoverCredentialFiles: [],
  recallDisabled: true,
  clipboardHistoryDisabled: true,
  clipboardSyncDisabled: true,
  copilotPolicySet: true,
  copilotDisabled: true,
  browserPasswordSavingDisabled: true
};

test('a classically-clean machine still fails on AI surface and tenant hygiene', () => {
  const result = scan({ facts: AI_EXPOSED, platform: 'win32' });
  const failed = result.findings.filter((f) => f.status === 'fail').map((f) => f.id);

  // The whole point of the project: these are invisible to a classical baseline.
  assert.ok(failed.includes('tenant-session-restore-active'));
  assert.ok(failed.includes('tenant-no-leftover-credentials'));
  assert.ok(failed.includes('ai-recall-disabled'));
  assert.ok(failed.includes('ai-clipboard-history-disabled'));
  assert.ok(failed.includes('ai-clipboard-sync-disabled'));
  assert.ok(failed.includes('ai-assistant-policy-set'));
  assert.ok(failed.includes('tenant-browser-password-saving-off'));

  // No classical rule fires — proving the new categories carry the finding.
  assert.ok(!failed.some((id) => id.startsWith('win-')));
  assert.equal(result.summary.grade, 'F');
});

test('a fully hardened leased seat scores 100', () => {
  const result = scan({ facts: FULLY_HARDENED, platform: 'win32' });
  assert.equal(result.summary.score, 100);
  assert.equal(result.summary.totals.fail, 0);
});

test('leftover credentials are reported by name so the operator can act', () => {
  const result = scan({ facts: AI_EXPOSED, platform: 'win32' });
  const finding = result.findings.find((f) => f.id === 'tenant-no-leftover-credentials');
  assert.equal(finding.status, 'fail');
  assert.equal(finding.severity, 'critical');
});

test('the leftover-credential probe is cross-platform and never reads file contents', () => {
  const facts = {};
  probeLeftoverCredentials(facts);
  assert.ok(Array.isArray(facts.leftoverCredentialFiles));
  assert.equal(typeof facts.leftoverCredentialCount, 'number');
  // Only tilde-prefixed labels are exposed — never absolute paths or contents.
  for (const label of facts.leftoverCredentialFiles) {
    assert.match(label, /^~\//);
  }
});

test('leftover-credential watchlist covers cloud and dev CLI credential paths', () => {
  const expected = [
    '.ssh/id_ecdsa',
    '.azure/msal_token_cache.bin',
    '.config/gcloud/credentials.db',
    '.config/gcloud/legacy_credentials',
    '.kube/config',
    '.docker/config.json',
    '.terraform.d/credentials.tfrc.json'
  ];
  for (const rel of expected) {
    assert.ok(
      LEFTOVER_CREDENTIAL_CANDIDATES.includes(rel),
      `expected watchlist to include ${rel}`
    );
  }
});

test('AI-surface rules are skipped on non-Windows but tenant credential rule still runs', () => {
  const result = scan({
    facts: { hostname: 'kiosk', platform: 'linux', arch: 'x64', leftoverCredentialCount: 1 },
    platform: 'linux'
  });
  const credFinding = result.findings.find((f) => f.id === 'tenant-no-leftover-credentials');
  assert.equal(credFinding.status, 'fail', 'the "all" platform rule must still apply on linux');

  const recall = result.findings.find((f) => f.id === 'ai-recall-disabled');
  assert.equal(recall.status, 'skip');
});
