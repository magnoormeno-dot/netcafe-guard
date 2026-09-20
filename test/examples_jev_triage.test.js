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
  assert.ok(Array.isArray(triage.URGENCY), 'a score rubric is a list indexed by score, never a map');
  assert.equal(triage.URGENCY.length, 4);
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

/*
 * The SDK's own rules for question builders, as of @typesafe-ai/sdk 0.6.0:
 * choice() takes a map of labels, score() takes a LIST of at least two rubric
 * entries indexed from zero, noul() takes a question. This fake enforces them so
 * the contract is checked even where the SDK is not installed (the core
 * package is zero-dependency). A map for a score rubric used to pass every
 * offline test and then throw on the first real call.
 */
const strictSdk = {
  choice(instructions, criteria) {
    if (Array.isArray(criteria) || typeof criteria !== 'object' || criteria === null) throw new Error('Choice criteria must be a map');
    return { type: 'choice', instructions, criteria };
  },
  score(instructions, criteria) {
    if (!Array.isArray(criteria)) throw new Error('Score criteria must be a list of descriptions indexed by score from zero, not a map.');
    if (criteria.length < 2) throw new Error('at least two scores are required');
    return { type: 'score', instructions, criteria };
  },
  noul(instructions, criteria) {
    return { type: 'noul', instructions, criteria };
  }
};

test('buildQuestions satisfies the SDK builder contract: choice takes a map, score takes a list', () => {
  const q = triage.buildQuestions(strictSdk);
  assert.deepEqual(Object.keys(q), ['route', 'urgency', 'needs_human']);
  assert.deepEqual(q.route.criteria, triage.ROUTES);
  assert.deepEqual(q.urgency.criteria, triage.URGENCY);
  assert.equal(q.urgency.criteria.length, 4);
  assert.equal(q.needs_human.type, 'noul');
  // What --dry-run prints is exactly what is sent.
  assert.deepEqual(JSON.parse(JSON.stringify(q)), JSON.parse(JSON.stringify(triage.QUESTION_SPECS)));
});

function realSdk() {
  try {
    return require(require.resolve('@typesafe-ai/sdk', { paths: [path.dirname(TRIAGE)] }));
  } catch (_err) {
    return null;
  }
}

test('with the real SDK and a stubbed transport, one seat goes over the wire and comes back as a queue', async (t) => {
  const sdk = realSdk();
  if (!sdk) {
    t.skip('@typesafe-ai/sdk not installed — `npm install` in examples/jev-triage runs this (CI does)');
    return;
  }
  const state = triage.buildState(demoReport());
  const seen = [];
  const reply = {
    model: 'jev-latest',
    answers: {
      route: { type: 'choice', choice: 'technician_visit', confidence: 0.83,
        probabilities: { reimage: 0.09, remote_fix: 0.05, technician_visit: 0.83, owner_decision: 0.02, no_action: 0.01 } },
      urgency: { type: 'score', score: 2.7, confidence: 0.71, legend: {}, probabilities: { 0: 0.01, 1: 0.04, 2: 0.2, 3: 0.75 } },
      needs_human: { type: 'noul', noul: 0.18 }
    },
    usage: { input_tokens: 812, output_tokens: 0 }
  };
  const fetch = async (url, init) => {
    seen.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const results = await triage.decideWithJev([state], triage.DEFAULTS, { apiKey: 'test-only-not-a-real-key', fetch });

  assert.equal(seen.length, 1);
  const req = seen[0];
  assert.equal(req.method, 'POST');
  assert.match(req.url, /\/v1\/systemone$/);
  assert.equal(req.body.model, 'jev-latest');
  assert.deepEqual(req.body.state, JSON.parse(JSON.stringify(state)));
  assert.ok(Array.isArray(req.body.questions.urgency.criteria), 'the score rubric crosses the wire as a list');
  assert.deepEqual(req.body.questions.route.criteria, triage.ROUTES);
  assert.equal(req.body.questions.needs_human.type, 'noul');
  // The key rides in the Authorization header and nowhere else.
  assert.match(req.headers.get('authorization'), /^Bearer /);
  assert.doesNotMatch(JSON.stringify(req.body), /test-only-not-a-real-key/);

  assert.equal(results.length, 1);
  assert.equal(results[0].hostname, 'CAFE-PC-07');
  assert.equal(results[0].queue, 'technician_visit');
  assert.equal(results[0].urgency, 3);
  assert.equal(results[0].needsHuman, 0.18);
  assert.equal(results[0].model, 'jev-latest');
  assert.equal(results[0].usage.input_tokens, 812);
  assert.match(triage.renderText(results), /CAFE-PC-07\s+→ technician_visit\s+urgency 3/);
});

test('with the real SDK, a real call still refuses to run without a key', async (t) => {
  const sdk = realSdk();
  if (!sdk) {
    t.skip('@typesafe-ai/sdk not installed');
    return;
  }
  const saved = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    await assert.rejects(() => triage.decideWithJev([triage.buildState(demoReport())]), /TYPESAFE_API_KEY is not set/);
  } finally {
    if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
  }
});
