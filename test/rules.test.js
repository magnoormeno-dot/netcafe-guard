'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRule, validateRules, loadDefaultRules } = require('../src/rules');

test('the shipped baseline ruleset is valid', () => {
  const rules = loadDefaultRules();
  assert.ok(rules.length >= 8, 'expected a meaningful baseline');
  assert.deepEqual(validateRules(rules), []);
});

test('every baseline rule has remediation guidance', () => {
  for (const r of loadDefaultRules()) {
    assert.ok(r.remediation && r.remediation.length > 10, `rule ${r.id} needs remediation text`);
  }
});

test('validateRule catches a missing id', () => {
  const problems = validateRule({ title: 'x', check: { fact: 'a', operator: 'isTrue' } }, 0);
  assert.ok(problems.some((p) => /missing string "id"/.test(p)));
});

test('validateRule catches an unknown operator', () => {
  const problems = validateRule({ id: 'r', title: 't', check: { fact: 'a', operator: 'nope' } }, 0);
  assert.ok(problems.some((p) => /unknown operator/.test(p)));
});

test('validateRule catches a bad severity', () => {
  const problems = validateRule({ id: 'r', title: 't', severity: 'spicy', check: { fact: 'a', operator: 'isTrue' } }, 0);
  assert.ok(problems.some((p) => /invalid severity/.test(p)));
});

test('validateRules flags duplicate ids', () => {
  const problems = validateRules([
    { id: 'dup', title: 'a', check: { fact: 'x', operator: 'isTrue' } },
    { id: 'dup', title: 'b', check: { fact: 'y', operator: 'isTrue' } }
  ]);
  assert.ok(problems.some((p) => /duplicate rule id "dup"/.test(p)));
});

test('validateRules rejects a non-array', () => {
  assert.deepEqual(validateRules({}), ['ruleset must be a JSON array']);
});
