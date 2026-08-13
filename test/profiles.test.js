'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src');
const { ruleAppliesToProfile, evaluateRule } = require('../src/engine');
const { declaredProfiles, loadDefaultRules, validateRule } = require('../src/rules');

const OFFICE_ONLY = {
  id: 'r',
  title: 't',
  profiles: ['shared-office'],
  check: { fact: 'x', operator: 'isTrue' }
};

test('ruleAppliesToProfile: no requested profile means every rule applies', () => {
  assert.equal(ruleAppliesToProfile(OFFICE_ONLY, undefined), true);
});

test('ruleAppliesToProfile: untagged and "all" rules apply under any profile', () => {
  assert.equal(ruleAppliesToProfile({}, 'gaming-cafe'), true);
  assert.equal(ruleAppliesToProfile({ profiles: [] }, 'gaming-cafe'), true);
  assert.equal(ruleAppliesToProfile({ profiles: ['all'] }, 'gaming-cafe'), true);
});

test('ruleAppliesToProfile: tagged rules match only their profiles', () => {
  assert.equal(ruleAppliesToProfile(OFFICE_ONLY, 'shared-office'), true);
  assert.equal(ruleAppliesToProfile(OFFICE_ONLY, 'gaming-cafe'), false);
});

test('evaluateRule skips a non-matching profile with its own reason', () => {
  const f = evaluateRule(OFFICE_ONLY, { x: true }, 'win32', 'gaming-cafe');
  assert.equal(f.status, 'skip');
  assert.equal(f.reason, 'profile-not-applicable');
  // Same rule, matching profile: evaluated normally.
  assert.equal(evaluateRule(OFFICE_ONLY, { x: true }, 'win32', 'shared-office').status, 'pass');
});

test('scan --profile gaming-cafe skips office-only screen-lock rules', () => {
  const facts = { hostname: 't', platform: 'win32', arch: 'x64', screenLockTimeoutSec: 0 };

  const cafe = scan({ facts, platform: 'win32', profile: 'gaming-cafe' });
  const lock = cafe.findings.find((f) => f.id === 'win-screenlock-enabled');
  assert.equal(lock.status, 'skip');
  assert.equal(lock.reason, 'profile-not-applicable');
  assert.equal(cafe.meta.profile, 'gaming-cafe');

  // Under shared-office — and with no profile at all — the rule still fires.
  const office = scan({ facts, platform: 'win32', profile: 'shared-office' });
  assert.equal(office.findings.find((f) => f.id === 'win-screenlock-enabled').status, 'fail');
  const full = scan({ facts, platform: 'win32' });
  assert.equal(full.findings.find((f) => f.id === 'win-screenlock-enabled').status, 'fail');
});

test('declaredProfiles reports the profiles tagged in the baseline', () => {
  // gaming-cafe works by NOT matching these tags, so only shared-office is
  // declared explicitly.
  assert.deepEqual(declaredProfiles(loadDefaultRules()), ['shared-office']);
});

test('validateRule rejects a malformed profiles field', () => {
  const bad = { id: 'r', title: 't', profiles: 'shared-office', check: { fact: 'x', operator: 'isTrue' } };
  assert.ok(validateRule(bad, 0).some((p) => /"profiles" must be an array/.test(p)));
  const empty = { id: 'r', title: 't', profiles: [''], check: { fact: 'x', operator: 'isTrue' } };
  assert.ok(validateRule(empty, 0).some((p) => /"profiles" must be an array/.test(p)));
});
