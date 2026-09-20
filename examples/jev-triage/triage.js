#!/usr/bin/env node
'use strict';

/**
 * Route netcafe-guard findings with a decision model (TypeSafe AI's Jev).
 *
 *   netcafe-guard scan --json > reports/seat-07.json     # on each seat
 *   node triage.js reports/                              # here
 *
 * Where the boundary is — and why it matters:
 *
 *   netcafe-guard decides WHAT IS WRONG. Deterministically, offline, from
 *   rules you can read. That verdict is never delegated to a model.
 *
 *   Jev decides WHAT HAPPENS NEXT. Given a seat's findings, it returns typed
 *   answers with calibrated confidence: which queue the seat goes to, how
 *   urgent it is, and whether a person should look first. It never generates
 *   text, so there is nothing to parse and nothing to hallucinate into a
 *   ticket title. Low confidence routes to a human — that is the point of
 *   having the number.
 *
 * Nothing here executes a fix. This script reads reports and prints
 * decisions. What leaves the machine is the summary built by buildState():
 * hostnames, rule ids, severities, titles, remediation text, the observed
 * value and the evidence *labels* a report already contains (e.g.
 * "~/.ssh/id_rsa" — never file contents; netcafe-guard never reads those). Run with --dry-run to see the
 * exact payload before you send anything anywhere.
 *
 * Requires Node 20+ and `npm install` in this directory (pulls @typesafe-ai/sdk).
 * Set TYPESAFE_API_KEY. API surface taken from the official SDK source:
 * https://github.com/typesafe-ai/typesafe-sdk-js
 */

const fs = require('fs');
const path = require('path');

/** The queues a venue actually has. Descriptions are what the model reads. */
const ROUTES = {
  reimage: 'The seat image itself is wrong — restore/write-filter agent missing, capture ' +
    'features on by default, policies unset — so fix the image and redeploy rather than ' +
    'patching this one seat.',
  remote_fix: 'Everything that failed is a registry or policy setting a technician can ' +
    'apply remotely from the generated fix script, with no hands on the seat.',
  technician_visit: 'Something on this seat needs hands: a previous tenant\'s files to wipe, ' +
    'a local model server to rebind, a service or hardware-level check.',
  owner_decision: 'A business decision is needed before anything is changed — for example ' +
    'whether an AI assistant is allowed on these seats or whether RDP is genuinely required.',
  no_action: 'Nothing failed and nothing is unknown; there is nothing to do.'
};

const URGENCY = {
  0: 'No action needed.',
  1: 'This week, with the next scheduled maintenance window.',
  2: 'Today, before the seat is rented again if at all practical.',
  3: 'Now: take the seat out of service until fixed — a previous tenant\'s credentials, ' +
    'captured screens or an open model server are exposed to the next person.'
};

/** Plain-data question specs: rendered by --dry-run, built into SDK questions at call time. */
const QUESTION_SPECS = {
  route: { type: 'choice', instructions: 'Where should this seat\'s findings go?', criteria: ROUTES },
  urgency: { type: 'score', instructions: 'How urgently must this seat be handled?', criteria: URGENCY },
  needs_human: {
    type: 'noul',
    instructions: 'Should a person review this report before any automation acts on it? ' +
      'Yes if results are unknown, facts contradict each other, or the findings do not ' +
      'fit the routes cleanly.'
  }
};

const DEFAULTS = { minConfidence: 0.7, humanThreshold: 0.5, model: undefined };

function isReport(r) {
  return Boolean(r) && r.tool === 'netcafe-guard' && Array.isArray(r.findings);
}

/**
 * What the model sees. Deliberately a summary: no probe output, no file
 * contents (netcafe-guard never has those), no user data.
 */
function buildState(report) {
  const findings = report.findings || [];
  const pick = (f) => ({
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    observed: f.observed === undefined ? null : f.observed,
    evidence: f.evidence === undefined ? null : f.evidence,
    remediation: f.remediation || null
  });
  return {
    hostname: (report.host && report.host.hostname) || 'unknown',
    platform: (report.host && report.host.platform) || null,
    profile: report.profile || null,
    score: report.summary ? report.summary.score : null,
    grade: report.summary ? report.summary.grade : null,
    failing: findings.filter((f) => f.status === 'fail').map(pick),
    unknown: findings.filter((f) => f.status === 'unknown').map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
    passing_count: findings.filter((f) => f.status === 'pass').length
  };
}

function buildQuestions(sdk) {
  return {
    route: sdk.choice(QUESTION_SPECS.route.instructions, QUESTION_SPECS.route.criteria),
    urgency: sdk.score(QUESTION_SPECS.urgency.instructions, QUESTION_SPECS.urgency.criteria),
    needs_human: sdk.noul(QUESTION_SPECS.needs_human.instructions)
  };
}

/**
 * Turn raw answers into a queue assignment. Low confidence or a likely
 * "needs human" both land in human_review — the model's uncertainty is a
 * signal, not noise to round away.
 */
function applyThresholds(answers, opts = DEFAULTS) {
  const minConfidence = opts.minConfidence ?? DEFAULTS.minConfidence;
  const humanThreshold = opts.humanThreshold ?? DEFAULTS.humanThreshold;
  const route = answers.route || {};
  const urgency = answers.urgency || {};
  const pHuman = typeof answers.needs_human?.noul === 'number' ? answers.needs_human.noul : 1;

  const reasons = [];
  if (typeof route.confidence !== 'number' || route.confidence < minConfidence) {
    reasons.push(`route confidence ${fmt(route.confidence)} < ${minConfidence}`);
  }
  if (pHuman >= humanThreshold) reasons.push(`needs_human ${fmt(pHuman)} ≥ ${humanThreshold}`);

  return {
    queue: reasons.length ? 'human_review' : route.choice,
    route: route.choice ?? null,
    routeConfidence: route.confidence ?? null,
    urgency: typeof urgency.score === 'number' ? Math.round(urgency.score) : null,
    urgencyConfidence: urgency.confidence ?? null,
    needsHuman: pHuman,
    reasons
  };
}

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : 'n/a';
}

async function decideWithJev(states, opts) {
  let sdk;
  try {
    sdk = require('@typesafe-ai/sdk');
  } catch (_err) {
    throw new Error('@typesafe-ai/sdk is not installed — run `npm install` in examples/jev-triage');
  }
  if (!process.env.TYPESAFE_API_KEY) {
    throw new Error('TYPESAFE_API_KEY is not set');
  }
  const client = new sdk.TypeSafeClient();
  const questions = buildQuestions(sdk);
  const results = [];
  for (const state of states) {
    const request = { state, questions };
    if (opts.model) request.model = opts.model;
    const response = await client.systemOne(request);
    results.push({ hostname: state.hostname, score: state.score, ...applyThresholds(response.answers, opts) });
  }
  return results;
}

function readReports(targets) {
  const files = [];
  for (const target of targets) {
    if (fs.statSync(target).isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) {
        if (entry.toLowerCase().endsWith('.json')) files.push(path.join(target, entry));
      }
    } else {
      files.push(target);
    }
  }
  const reports = [];
  const skipped = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (isReport(parsed)) reports.push(parsed);
      else skipped.push(file);
    } catch (_err) {
      skipped.push(file);
    }
  }
  return { reports, skipped };
}

function renderText(results) {
  const lines = [''];
  lines.push('  netcafe-guard × Jev  triage');
  lines.push('');
  for (const r of results) {
    const q = r.queue === 'human_review' ? 'HUMAN REVIEW' : r.queue;
    lines.push(`  ${String(r.score ?? '?').padStart(3)}/100  ${r.hostname.padEnd(18)} → ${q.padEnd(16)} ` +
      `urgency ${r.urgency ?? '?'}  (route ${r.route ?? '?'} @ ${fmt(r.routeConfidence)}, human ${fmt(r.needsHuman)})`);
    for (const reason of r.reasons) lines.push(`        ↳ ${reason}`);
  }
  lines.push('');
  lines.push('  Decisions only. Nothing was changed on any seat; netcafe-guard\'s verdict is unchanged.');
  lines.push('');
  return lines.join('\n');
}

function parseArgs(argv) {
  const out = { targets: [], dryRun: false, json: false, ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '--min-confidence') out.minConfidence = Number(argv[++i]);
    else if (a === '--human-threshold') out.humanThreshold = Number(argv[++i]);
    else if (a === '--model') out.model = argv[++i];
    else out.targets.push(a);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.targets.length) {
    process.stderr.write('usage: node triage.js <report.json | dir>... [--dry-run] [--json] ' +
      '[--min-confidence 0.7] [--human-threshold 0.5] [--model jev-latest]\n');
    return 1;
  }
  const { reports, skipped } = readReports(opts.targets);
  for (const s of skipped) process.stderr.write(`skipped (not a netcafe-guard --json report): ${s}\n`);
  if (!reports.length) {
    process.stderr.write('no reports to triage\n');
    return 1;
  }
  const states = reports.map(buildState);

  if (opts.dryRun) {
    // Exactly what would be sent, and the questions it would be asked.
    process.stdout.write(JSON.stringify({ questions: QUESTION_SPECS, states }, null, 2) + '\n');
    process.stderr.write(`dry run: ${states.length} seat(s), nothing sent\n`);
    return 0;
  }

  const results = await decideWithJev(states, opts);
  process.stdout.write(opts.json ? JSON.stringify(results, null, 2) + '\n' : renderText(results));
  return 0;
}

module.exports = { ROUTES, URGENCY, QUESTION_SPECS, DEFAULTS, buildState, buildQuestions, applyThresholds, readReports, renderText };

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => { process.stderr.write(`jev-triage: ${err.message}\n`); process.exit(1); }
  );
}
