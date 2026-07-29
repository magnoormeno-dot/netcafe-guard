'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  checkPasses,
  evaluateRule,
  evaluate,
  scoreFindings,
  sortFindings,
  ruleAppliesToPlatform,
  gradeFor
} = require('../src/engine');

test('checkPasses handles every operator', () => {
  assert.equal(checkPasses({ operator: 'equals', value: 1 }, 1), true);
  assert.equal(checkPasses({ operator: 'equals', value: 1 }, 2), false);
  assert.equal(checkPasses({ operator: 'notEquals', value: 1 }, 2), true);
  assert.equal(checkPasses({ operator: 'exists' }, 'x'), true);
  assert.equal(checkPasses({ operator: 'exists' }, undefined), false);
  assert.equal(checkPasses({ operator: 'absent' }, undefined), true);
  assert.equal(checkPasses({ operator: 'absent' }, 'x'), false);
  assert.equal(checkPasses({ operator: 'isTrue' }, true), true);
  assert.equal(checkPasses({ operator: 'isFalse' }, false), true);
  assert.equal(checkPasses({ operator: 'oneOf', value: [1, 2] }, 2), true);
  assert.equal(checkPasses({ operator: 'notOneOf', value: [1, 2] }, 3), true);
  assert.equal(checkPasses({ operator: 'gte', value: 60 }, 60), true);
  assert.equal(checkPasses({ operator: 'gte', value: 60 }, 30), false);
  assert.equal(checkPasses({ operator: 'lte', value: 900 }, 900), true);
  assert.equal(checkPasses({ operator: 'includes', value: 'a' }, ['a', 'b']), true);
});

test('checkPasses throws on unknown operator', () => {
  assert.throws(() => checkPasses({ operator: 'bogus' }, 1), /Unknown operator/);
});

test('ruleAppliesToPlatform respects platform filters', () => {
  assert.equal(ruleAppliesToPlatform({ platforms: ['win32'] }, 'win32'), true);
  assert.equal(ruleAppliesToPlatform({ platforms: ['win32'] }, 'linux'), false);
  assert.equal(ruleAppliesToPlatform({ platforms: ['all'] }, 'linux'), true);
  assert.equal(ruleAppliesToPlatform({}, 'darwin'), true);
});

test('evaluateRule marks a not-applicable rule as skip', () => {
  const rule = { id: 'r', title: 't', platforms: ['win32'], check: { fact: 'x', operator: 'isTrue' } };
  const f = evaluateRule(rule, { x: true }, 'linux');
  assert.equal(f.status, 'skip');
  assert.equal(f.reason, 'not-applicable');
});

test('evaluateRule marks a missing fact as unknown, never a silent pass', () => {
  const rule = { id: 'r', title: 't', platforms: ['win32'], check: { fact: 'defenderRealtimeEnabled', operator: 'isTrue' } };
  const f = evaluateRule(rule, {}, 'win32');
  assert.equal(f.status, 'unknown');
});

test('evaluateRule pass/fail on a real check', () => {
  const rule = { id: 'r', title: 't', severity: 'high', platforms: ['win32'], check: { fact: 'autoAdminLogon', operator: 'isFalse' } };
  assert.equal(evaluateRule(rule, { autoAdminLogon: false }, 'win32').status, 'pass');
  assert.equal(evaluateRule(rule, { autoAdminLogon: true }, 'win32').status, 'fail');
});

test('evaluateRule flags a malformed rule as error', () => {
  const f = evaluateRule({ id: 'r', title: 't' }, {}, 'win32');
  assert.equal(f.status, 'error');
});

test('absent operator passes when the fact is missing', () => {
  const rule = { id: 'r', title: 't', check: { fact: 'stored', operator: 'absent' } };
  assert.equal(evaluateRule(rule, {}, 'win32').status, 'pass');
  assert.equal(evaluateRule(rule, { stored: 'yes' }, 'win32').status, 'fail');
});

test('scoreFindings subtracts weighted penalties and grades', () => {
  const findings = [
    { status: 'pass', severity: 'high', category: 'a' },
    { status: 'fail', severity: 'critical', category: 'auth' },
    { status: 'fail', severity: 'low', category: 'session' },
    { status: 'unknown', severity: 'high', category: 'malware' },
    { status: 'skip', severity: 'medium', category: 'x' }
  ];
  const s = scoreFindings(findings);
  assert.equal(s.score, 100 - 25 - 3); // critical + low
  assert.equal(s.grade, 'C');
  assert.equal(s.totals.pass, 1);
  assert.equal(s.totals.fail, 2);
  assert.equal(s.totals.unknown, 1);
  assert.equal(s.totals.skip, 1);
  assert.equal(s.bySeverity.critical, 1);
  assert.equal(s.byCategory.auth, 1);
});

test('score never drops below zero', () => {
  const findings = Array.from({ length: 10 }, () => ({ status: 'fail', severity: 'critical', category: 'x' }));
  assert.equal(scoreFindings(findings).score, 0);
  assert.equal(scoreFindings(findings).grade, 'F');
});

test('gradeFor boundaries', () => {
  assert.equal(gradeFor(90), 'A');
  assert.equal(gradeFor(89), 'B');
  assert.equal(gradeFor(60), 'D');
  assert.equal(gradeFor(59), 'F');
});

test('sortFindings puts failures first, then unknown, then pass/skip', () => {
  const findings = [
    { status: 'pass', severity: 'low' },
    { status: 'fail', severity: 'low' },
    { status: 'fail', severity: 'critical' },
    { status: 'unknown', severity: 'high' }
  ];
  const order = sortFindings(findings).map((f) => f.status + ':' + f.severity);
  assert.deepEqual(order, ['fail:critical', 'fail:low', 'unknown:high', 'pass:low']);
});

test('evaluate returns one finding per rule', () => {
  const rules = [
    { id: 'a', title: 'A', platforms: ['win32'], check: { fact: 'x', operator: 'isTrue' } },
    { id: 'b', title: 'B', platforms: ['linux'], check: { fact: 'y', operator: 'isTrue' } }
  ];
  const findings = evaluate(rules, { x: true, y: true }, 'win32');
  assert.equal(findings.length, 2);
  assert.equal(findings[0].status, 'pass');
  assert.equal(findings[1].status, 'skip');
});

test('evaluate rejects a non-array ruleset', () => {
  assert.throws(() => evaluate({}, {}, 'win32'), /must be an array/);
});
