'use strict';

/**
 * The Jev example must stay honest and offline-testable: its pure parts run
 * without the SDK installed, --dry-run never touches the network, and the
 * payload it would send carries labels only, never contents.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan, renderJson } = require('../src');
const triage = require('../examples/jev-triage/triage.js');

const DEMO = path.join(__dirname, '..', 'demo', 'cafe-pc-07.json');
const TRIAGE = path.join(__dirname, '..', 'examples', 'jev-triage', 'triage.js');

function demoReport() {
  const facts = JSON.parse(require('fs').readFileSync(DEMO, 'utf8'));
  return JSON.parse(renderJson(scan({ facts, platform: 'win32' })));
}

test('the state sent to the model is a summary: ids, labels, remediation — no probe output', () => {
  const state = triage.buildState(demoReport());
  assert.equal(state.hostname, 'CAFE-PC-07');
  assert.equal(state.score, 10);
  assert.ok(state.failing.length >= 4);
  const cred = state.failing.find((f) => f.id === 'tenant-no-leftover-credentials');
  assert.equal(cred.observed, 2);
  assert.deepEqual(cred.evidence, ['~/.ssh/id_rsa', '~/.aws/credentials']);   // labels, as the report has them
  for (const f of state.failing) {
    assert.deepEqual(Object.keys(f).sort(), ['category', 'evidence', 'id', 'observed', 'remediation', 'severity', 'title']);
  }
  assert.doesNotMatch(JSON.stringify(state), /BEGIN (RSA|OPENSSH) PRIVATE KEY|aws_secret_access_key/);
});

test('question specs cover route, urgency and human review with the documented types', () => {
  assert.deepEqual(Object.keys(triage.QUESTION_SPECS), ['route', 'urgency', 'needs_human']);
  assert.equal(triage.QUESTION_SPECS.route.type, 'choice');
  assert.deepEqual(Object.keys(triage.ROUTES), ['reimage', 'remote_fix', 'technician_visit', 'owner_decision', 'no_action']);
  assert.equal(triage.QUESTION_SPECS.urgency.type, 'score');
  assert.deepEqual(Object.keys(triage.URGENCY), ['0', '1', '2', '3']);
  assert.equal(triage.QUESTION_SPECS.needs_human.type, 'noul');
});

test('low confidence or a likely "needs human" routes to human_review; otherwise the chosen queue', () => {
  const confident = triage.applyThresholds({
    route: { choice: 'remote_fix', confidence: 0.91, probabilities: { remote_fix: 0.91 } },
    urgency: { score: 1.6, confidence: 0.8 },
    needs_human: { noul: 0.12 }
  });
  assert.equal(confident.queue, 'remote_fix');
  assert.equal(confident.urgency, 2);
  assert.deepEqual(confident.reasons, []);

  const shaky = triage.applyThresholds({
    route: { choice: 'reimage', confidence: 0.55 },
    urgency: { score: 3, confidence: 0.9 },
    needs_human: { noul: 0.2 }
  });
  assert.equal(shaky.queue, 'human_review');
  assert.match(shaky.reasons[0], /route confidence 0\.55 < 0\.7/);

  const flagged = triage.applyThresholds({
    route: { choice: 'no_action', confidence: 0.99 },
    urgency: { score: 0, confidence: 0.99 },
    needs_human: { noul: 0.8 }
  });
  assert.equal(flagged.queue, 'human_review');

  // Missing answers never silently become a confident route.
  assert.equal(triage.applyThresholds({}).queue, 'human_review');
});

test('--dry-run prints the payload and sends nothing, without the SDK installed', () => {
  const dir = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'ncg-jev-'));
  require('fs').writeFileSync(path.join(dir, 'seat.json'), JSON.stringify(demoReport()));
  const out = spawnSync(process.execPath, [TRIAGE, dir, '--dry-run'],
    { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
  assert.equal(out.status, 0);
  const payload = JSON.parse(out.stdout);
  assert.deepEqual(Object.keys(payload.questions), ['route', 'urgency', 'needs_human']);
  assert.equal(payload.states[0].hostname, 'CAFE-PC-07');
  assert.match(out.stderr, /nothing sent/);
});

test('a real call without the SDK or key fails loudly instead of pretending', () => {
  const out = spawnSync(process.execPath, [TRIAGE, DEMO.replace('cafe-pc-07.json', '')],
    { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /not installed|TYPESAFE_API_KEY is not set|no reports to triage/);
});
