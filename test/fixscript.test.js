'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan, loadDefaultRules } = require('../src');
const { buildFixScript } = require('../src/fixscript');
const { validateRule } = require('../src/rules');

const BIN = path.join(__dirname, '..', 'bin', 'netcafe-guard.js');
const DEMO = path.join(__dirname, '..', 'demo', 'cafe-pc-07.json');

const RULES = loadDefaultRules();

function scriptFor(facts) {
  return buildFixScript(scan({ facts, platform: 'win32', rules: RULES }), RULES);
}

test('a failed registry rule becomes a create-key + set-value pair', () => {
  const { script, scripted } = scriptFor({
    hostname: 'seat', platform: 'win32', arch: 'x64', recallDisabled: false
  });
  assert.ok(scripted.includes('ai-recall-disabled'));
  assert.match(script, /New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI' -Force/);
  assert.match(script, /-Name 'DisableAIDataAnalysis' -PropertyType DWord -Value 1 -Force/);
});

test('passing and unknown checks are never scripted', () => {
  const passing = scriptFor({
    hostname: 'seat', platform: 'win32', arch: 'x64', recallDisabled: true
  });
  assert.ok(!passing.scripted.includes('ai-recall-disabled'));
  assert.doesNotMatch(passing.script, /DisableAIDataAnalysis/);

  // Fact absent entirely -> unknown. Unknown means "go look", not "overwrite".
  const unknown = scriptFor({ hostname: 'seat', platform: 'win32', arch: 'x64' });
  assert.ok(!unknown.scripted.includes('ai-recall-disabled'));
  assert.doesNotMatch(unknown.script, /New-ItemProperty/);
});

test('destructive remediations stay comments, never commands', () => {
  const { script, scripted, manual } = scriptFor({
    hostname: 'seat', platform: 'win32', arch: 'x64',
    leftoverCredentialCount: 2, leftoverCredentialFiles: ['~/.ssh/id_rsa', '~/.aws/credentials'],
    agentToolConfigCount: 1, agentToolConfigFiles: ['~/.cursor/mcp.json'],
    recallSnapshotStorePresent: true, sessionRestoreActive: false,
    aiServiceExposedCount: 1, aiServiceExposed: ['Ollama (0.0.0.0:11434)']
  });
  for (const id of ['tenant-no-leftover-credentials', 'ai-no-leftover-agent-configs',
    'ai-no-recall-snapshot-store', 'tenant-session-restore-active', 'ai-local-llm-not-exposed']) {
    assert.ok(manual.includes(id), `${id} must not be scripted`);
    assert.ok(!scripted.includes(id));
    assert.match(script, new RegExp(`MANUAL \\[\\w+\\] ${id}`));
  }
  // No file-removal or service commands anywhere in the executable part.
  assert.doesNotMatch(script.replace(/^#.*$/gm, ''), /Remove-Item\s+(?!-Path 'HK)|rmdir|del\s|Stop-Service/i);
});

test('multi-step fixes emit every step; command fixes emit the command verbatim', () => {
  const { script } = scriptFor({
    hostname: 'seat', platform: 'win32', arch: 'x64',
    browserPasswordSavingDisabled: false, guestAccountActive: true, firewallAllProfilesOn: false
  });
  assert.match(script, /Policies\\Google\\Chrome' -Name 'PasswordManagerEnabled'/);
  assert.match(script, /Policies\\Microsoft\\Edge' -Name 'PasswordManagerEnabled'/);
  assert.match(script, /^net user guest \/active:no$/m);
  assert.match(script, /^netsh advfirewall set allprofiles state on$/m);
});

test('the cleartext-password fix removes only that value', () => {
  const { script } = scriptFor({
    hostname: 'seat', platform: 'win32', arch: 'x64', defaultPasswordStored: true
  });
  assert.match(script, /Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon' -Name 'DefaultPassword'/);
});

test('a clean machine produces a script with nothing to do', () => {
  const { script, scripted, manual } = buildFixScript(
    scan({ facts: { hostname: 'seat', platform: 'linux', arch: 'x64',
      leftoverCredentialCount: 0, agentToolConfigCount: 0, aiServiceExposedCount: 0 },
    platform: 'linux', rules: RULES }), RULES);
  assert.equal(scripted.length, 0);
  assert.equal(manual.length, 0);
  assert.match(script, /Nothing to do/);
});

test('every scripted fix in the baseline passes the rule validator', () => {
  for (const [i, rule] of RULES.entries()) {
    assert.deepEqual(validateRule(rule, i), [], `rule ${rule.id}`);
  }
  const withFix = RULES.filter((r) => r.fix);
  assert.ok(withFix.length >= 15, 'baseline should ship structured fixes');
  const bad = validateRule({ id: 'x', title: 't', check: { fact: 'a', operator: 'isTrue' },
    fix: { type: 'registry', hive: 'HKLM', path: 'p', name: 'n', kind: 'Bogus', data: 1 } }, 0);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /"fix\.kind" must be DWord or String/);

  const badType = validateRule({ id: 'y', title: 't', check: { fact: 'a', operator: 'isTrue' },
    fix: { type: 'exec', run: 'format C:' } }, 0);
  assert.equal(badType.length, 1);
  assert.match(badType[0], /"fix\.type" must be one of/);
});

test('CLI: --fix-script writes the script to stdout and a summary to stderr', () => {
  const out = spawnSync(process.execPath,
    [BIN, 'scan', '--facts', DEMO, '--platform', 'win32', '--fix-script'], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^<#/);
  assert.match(out.stdout, /READ THIS BEFORE RUNNING IT/);
  assert.doesNotMatch(out.stdout, /netcafe-guard: \d+ scripted/);   // summary must not pollute the script
  assert.match(out.stderr, /scripted fix\(es\), \d+ needing manual work/);

  const clash = spawnSync(process.execPath,
    [BIN, 'scan', '--facts', DEMO, '--json', '--fix-script'], { encoding: 'utf8' });
  assert.equal(clash.status, 1);
  assert.match(clash.stderr, /choose one output format/);
});
