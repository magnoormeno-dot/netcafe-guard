'use strict';

/**
 * Rendering for scan results. Pure string building, no I/O.
 */

const { scoreFindings, sortFindings } = require('./engine');

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const STATUS_MARK = {
  pass: 'PASS',
  fail: 'FAIL',
  skip: 'SKIP',
  unknown: '????',
  error: 'ERR '
};

function colorize(text, color, useColor) {
  if (!useColor) return text;
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

function statusColor(status) {
  return (
    {
      pass: 'green',
      fail: 'red',
      skip: 'gray',
      unknown: 'yellow',
      error: 'magenta'
    }[status] || 'reset'
  );
}

function severityColor(severity) {
  return (
    {
      critical: 'red',
      high: 'red',
      medium: 'yellow',
      low: 'cyan',
      info: 'gray'
    }[severity] || 'reset'
  );
}

/**
 * Human-readable terminal report.
 */
function renderText(result, options = {}) {
  const useColor = options.color !== false;
  const { findings, meta } = result;
  const summary = scoreFindings(findings);
  const sorted = sortFindings(findings);
  const lines = [];

  lines.push('');
  lines.push(colorize('  netcafe-guard  ', 'bold', useColor) + colorize('security baseline scan', 'dim', useColor));
  lines.push(colorize(`  host: ${meta.hostname}  ·  platform: ${meta.platform}/${meta.arch}  ·  ${meta.timestamp}`, 'gray', useColor));
  lines.push('');

  const scoreLine = `  Score: ${summary.score}/100  (${summary.grade})`;
  const scoreColor = summary.score >= 80 ? 'green' : summary.score >= 60 ? 'yellow' : 'red';
  lines.push(colorize(scoreLine, scoreColor, useColor));
  lines.push(
    colorize(
      `  ${summary.totals.pass} pass · ${summary.totals.fail} fail · ${summary.totals.unknown} unknown · ${summary.totals.skip} skipped`,
      'dim',
      useColor
    )
  );
  lines.push('');

  const shown = options.all ? sorted : sorted.filter((f) => f.status !== 'skip' && f.status !== 'pass');
  if (shown.length === 0) {
    lines.push(colorize('  No issues found. Run with --all to see every check.', 'green', useColor));
  }

  for (const f of shown) {
    const mark = colorize(STATUS_MARK[f.status], statusColor(f.status), useColor);
    const sev = colorize(`[${f.severity}]`, severityColor(f.severity), useColor);
    lines.push(`  ${mark} ${sev} ${colorize(f.id, 'bold', useColor)}  ${f.title}`);
    if (f.status === 'fail') {
      lines.push(colorize(`        observed: ${JSON.stringify(f.observed)}  ·  expected: ${f.expected}`, 'gray', useColor));
      if (f.remediation) lines.push(colorize(`        fix: ${f.remediation}`, 'gray', useColor));
    } else if (f.status === 'unknown') {
      lines.push(colorize(`        could not determine — check manually`, 'gray', useColor));
    }
  }

  lines.push('');
  lines.push(colorize('  Unknown ≠ safe. Investigate anything the scanner could not read.', 'dim', useColor));
  lines.push('');
  return lines.join('\n');
}

/**
 * Machine-readable JSON report.
 */
function renderJson(result) {
  const summary = scoreFindings(result.findings);
  return JSON.stringify(
    {
      tool: 'netcafe-guard',
      version: result.meta.version,
      timestamp: result.meta.timestamp,
      host: {
        hostname: result.meta.hostname,
        platform: result.meta.platform,
        arch: result.meta.arch
      },
      summary,
      findings: sortFindings(result.findings)
    },
    null,
    2
  );
}

module.exports = { renderText, renderJson, COLORS };
