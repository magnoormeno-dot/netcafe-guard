'use strict';

/**
 * Drift detection: compare two JSON reports (`scan --json`) taken at different
 * times on the same machine and say what changed. Pure — no I/O.
 *
 *   netcafe-guard scan --json > after-imaging.json
 *   ...days later, from Task Scheduler...
 *   netcafe-guard scan --json > now.json
 *   netcafe-guard diff after-imaging.json now.json
 *
 * A "regression" is any rule that now fails and did not fail before. Fixes are
 * the reverse. Anything else that changed status (a check going unknown, a
 * rule appearing or disappearing because the ruleset changed) is listed too —
 * a check that stopped being readable is drift as well.
 */

const { SEVERITY_ORDER } = require('./engine');

function indexFindings(report) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const map = new Map();
  for (const f of findings) map.set(f.id, f);
  return map;
}

function summaryOf(report) {
  const summary = report.summary || {};
  const host = report.host || (report.meta ? { hostname: report.meta.hostname } : {});
  return {
    score: typeof summary.score === 'number' ? summary.score : null,
    grade: summary.grade || null,
    timestamp: report.timestamp || (report.meta && report.meta.timestamp) || null,
    hostname: host.hostname || null
  };
}

function bySeverity(a, b) {
  return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
}

function diffReports(before, after) {
  const prev = indexFindings(before);
  const next = indexFindings(after);

  const regressions = [];
  const fixes = [];
  const changed = [];
  const added = [];
  const removed = [];

  for (const [id, f] of next) {
    const p = prev.get(id);
    const entry = { id, title: f.title, severity: f.severity, category: f.category };
    if (!p) {
      added.push({ ...entry, status: f.status });
      continue;
    }
    if (p.status !== f.status) {
      const change = { ...entry, from: p.status, to: f.status, observed: f.observed };
      if (f.status === 'fail') regressions.push(change);
      else if (p.status === 'fail' && f.status === 'pass') fixes.push(change);
      else changed.push(change);
    } else if (f.status === 'fail' && JSON.stringify(p.observed) !== JSON.stringify(f.observed)) {
      changed.push({ ...entry, from: p.status, to: f.status, observed: f.observed, observedBefore: p.observed });
    }
  }
  for (const [id, p] of prev) {
    if (!next.has(id)) removed.push({ id, title: p.title, severity: p.severity, category: p.category, status: p.status });
  }

  regressions.sort(bySeverity);
  fixes.sort(bySeverity);

  const b = summaryOf(before);
  const a = summaryOf(after);
  const scoreDelta = b.score !== null && a.score !== null ? a.score - b.score : null;

  return { before: b, after: a, scoreDelta, regressions, fixes, changed, added, removed };
}

function fmtScore(s) {
  return s.score === null ? 'n/a' : `${s.score}/100 (${s.grade})`;
}

function line(items, verb) {
  return items.map((c) => `  ${verb} [${c.severity}] ${c.id}  ${c.title}` +
    (c.from ? `  (${c.from} → ${c.to})` : c.status ? `  (${c.status})` : '')).join('\n');
}

/**
 * Plain-text rendering, color-free by design: it is meant for scheduler logs
 * and email.
 */
function renderDiffText(diff) {
  const out = [];
  out.push('');
  out.push('  netcafe-guard  drift report');
  const host = diff.after.hostname || diff.before.hostname;
  out.push(`  host: ${host || 'unknown'}`);
  out.push(`  before: ${fmtScore(diff.before)}  ${diff.before.timestamp || ''}`);
  out.push(`  after:  ${fmtScore(diff.after)}  ${diff.after.timestamp || ''}`);
  if (diff.scoreDelta !== null) {
    const sign = diff.scoreDelta > 0 ? '+' : '';
    out.push(`  score change: ${sign}${diff.scoreDelta}`);
  }
  out.push('');

  const nothing = !diff.regressions.length && !diff.fixes.length && !diff.changed.length &&
    !diff.added.length && !diff.removed.length;
  if (nothing) {
    out.push('  No drift: every check has the same result as before.');
    out.push('');
    return out.join('\n');
  }

  if (diff.regressions.length) {
    out.push(`  REGRESSIONS (${diff.regressions.length}) — passed or unknown before, failing now:`);
    out.push(line(diff.regressions, 'FAIL'));
    out.push('');
  }
  if (diff.fixes.length) {
    out.push(`  FIXED (${diff.fixes.length}):`);
    out.push(line(diff.fixes, 'PASS'));
    out.push('');
  }
  if (diff.changed.length) {
    out.push(`  OTHER CHANGES (${diff.changed.length}) — status or observed value moved:`);
    out.push(line(diff.changed, '????'));
    out.push('');
  }
  if (diff.added.length) {
    out.push(`  NEW CHECKS (${diff.added.length}) — in the after report only:`);
    out.push(line(diff.added, 'NEW '));
    out.push('');
  }
  if (diff.removed.length) {
    out.push(`  REMOVED CHECKS (${diff.removed.length}) — in the before report only:`);
    out.push(line(diff.removed, 'GONE'));
    out.push('');
  }
  return out.join('\n');
}

module.exports = { diffReports, renderDiffText };
