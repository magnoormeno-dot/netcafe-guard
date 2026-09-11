'use strict';

/**
 * Fleet view: one venue, many seats.
 *
 *   for /f %s in (seats.txt) do netcafe-guard scan --json > reports\%s.json
 *   netcafe-guard fleet reports\
 *
 * A café runs dozens to hundreds of identical-looking machines. Reading fifty
 * single-seat reports one by one is how drift gets missed, so this aggregates
 * them into the two questions an operator actually asks: which seats are worst,
 * and which control is broken across the whole floor.
 *
 * Pure functions — file reading happens in the CLI.
 */

const { SEVERITY_ORDER } = require('./engine');

function isReport(value) {
  return Boolean(value) && value.tool === 'netcafe-guard' && Array.isArray(value.findings);
}

function seatOf(report, fallbackLabel) {
  const host = report.host || {};
  return {
    hostname: host.hostname || fallbackLabel || 'unknown',
    platform: host.platform || null,
    profile: report.profile || null,
    timestamp: report.timestamp || null,
    score: report.summary && typeof report.summary.score === 'number' ? report.summary.score : null,
    grade: (report.summary && report.summary.grade) || null,
    totals: (report.summary && report.summary.totals) || {},
    findings: report.findings
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * @param {Array<{label?: string, report: object}>} inputs parsed JSON reports
 * @returns aggregate with seats, score stats, per-rule breakdown and outliers
 */
function aggregateFleet(inputs) {
  const skipped = [];
  const bySeat = new Map();
  let superseded = 0;

  for (const { label, report } of inputs) {
    if (!isReport(report)) {
      skipped.push(label || 'unnamed input');
      continue;
    }
    const seat = seatOf(report, label);
    const existing = bySeat.get(seat.hostname);
    // Re-scans of the same seat are common; keep the newest and say so.
    if (existing) {
      superseded += 1;
      const keepNew = !existing.timestamp || (seat.timestamp && seat.timestamp > existing.timestamp);
      if (!keepNew) continue;
    }
    bySeat.set(seat.hostname, seat);
  }

  const seats = [...bySeat.values()];
  const scores = seats.map((s) => s.score).filter((s) => typeof s === 'number');
  const grades = {};
  const rules = new Map();
  const timestamps = seats.map((s) => s.timestamp).filter(Boolean).sort();

  for (const seat of seats) {
    if (seat.grade) grades[seat.grade] = (grades[seat.grade] || 0) + 1;
    for (const f of seat.findings) {
      if (f.status !== 'fail' && f.status !== 'unknown') continue;
      if (!rules.has(f.id)) {
        rules.set(f.id, {
          id: f.id,
          title: f.title,
          severity: f.severity,
          category: f.category,
          failing: [],
          unknown: []
        });
      }
      rules.get(f.id)[f.status === 'fail' ? 'failing' : 'unknown'].push(seat.hostname);
    }
  }

  const ruleList = [...rules.values()].sort((a, b) => {
    if (b.failing.length !== a.failing.length) return b.failing.length - a.failing.length;
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });

  const worstSeats = [...seats].sort((a, b) => {
    if (a.score === b.score) return a.hostname.localeCompare(b.hostname);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return a.score - b.score;
  });

  return {
    seatCount: seats.length,
    supersededReports: superseded,
    skipped,
    window: { earliest: timestamps[0] || null, latest: timestamps[timestamps.length - 1] || null },
    scores: {
      min: scores.length ? Math.min(...scores) : null,
      median: median(scores),
      mean: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      max: scores.length ? Math.max(...scores) : null
    },
    grades,
    rules: ruleList.map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity,
      category: r.category,
      failingCount: r.failing.length,
      unknownCount: r.unknown.length,
      failingSeats: r.failing.sort(),
      unknownSeats: r.unknown.sort()
    })),
    seats: worstSeats.map((s) => ({
      hostname: s.hostname,
      score: s.score,
      grade: s.grade,
      fail: s.totals.fail || 0,
      unknown: s.totals.unknown || 0,
      timestamp: s.timestamp,
      profile: s.profile
    }))
  };
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function seatWord(n) {
  return n === 1 ? 'seat ' : 'seats';
}

function renderFleetText(agg, options = {}) {
  const limit = options.limit || 10;
  const out = [];
  out.push('');
  out.push('  netcafe-guard  fleet summary');
  out.push(`  seats: ${agg.seatCount}` +
    (agg.supersededReports ? `  (${agg.supersededReports} older re-scan(s) ignored)` : ''));
  if (agg.window.earliest) {
    out.push(`  scans: ${agg.window.earliest}  →  ${agg.window.latest}`);
  }
  out.push('');

  if (!agg.seatCount) {
    out.push('  No usable reports. Feed it the output of: netcafe-guard scan --json');
    out.push('');
    return out.join('\n');
  }

  const s = agg.scores;
  out.push(`  Score  worst ${s.min}  ·  median ${s.median}  ·  mean ${s.mean}  ·  best ${s.max}`);
  const gradeLine = ['A', 'B', 'C', 'D', 'F']
    .filter((g) => agg.grades[g])
    .map((g) => `${g}:${agg.grades[g]}`)
    .join('  ');
  if (gradeLine) out.push(`  Grades ${gradeLine}`);
  out.push('');

  const failing = agg.rules.filter((r) => r.failingCount);
  if (failing.length) {
    out.push('  FAILING ACROSS THE FLEET');
    for (const r of failing) {
      out.push(`  ${String(r.failingCount).padStart(4)} ${seatWord(r.failingCount)} (${String(pct(r.failingCount, agg.seatCount)).padStart(3)}%)  ` +
        `[${r.severity}] ${r.id}  ${r.title}`);
    }
    out.push('');
  } else {
    out.push('  No check fails on any seat.');
    out.push('');
  }

  const unknown = agg.rules.filter((r) => r.unknownCount);
  if (unknown.length) {
    out.push('  COULD NOT BE READ (unknown ≠ safe)');
    for (const r of unknown) {
      out.push(`  ${String(r.unknownCount).padStart(4)} ${seatWord(r.unknownCount)} (${String(pct(r.unknownCount, agg.seatCount)).padStart(3)}%)  ` +
        `[${r.severity}] ${r.id}`);
    }
    out.push('');
  }

  const worst = agg.seats.slice(0, limit);
  out.push(`  WORST SEATS${agg.seatCount > limit ? ` (${limit} of ${agg.seatCount})` : ''}`);
  for (const seat of worst) {
    out.push(`  ${String(seat.score === null ? '?' : seat.score).padStart(4)}/100 ${(seat.grade || '?').padEnd(2)} ` +
      `${seat.hostname.padEnd(20)} ${seat.fail} fail · ${seat.unknown} unknown`);
  }
  out.push('');

  if (agg.skipped.length) {
    out.push(`  Skipped ${agg.skipped.length} file(s) that are not netcafe-guard --json reports:`);
    for (const label of agg.skipped.slice(0, 5)) out.push(`    ${label}`);
    if (agg.skipped.length > 5) out.push(`    … and ${agg.skipped.length - 5} more`);
    out.push('');
  }

  return out.join('\n');
}

module.exports = { aggregateFleet, renderFleetText };
