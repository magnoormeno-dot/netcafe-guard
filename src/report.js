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
  const profileNote = meta.profile ? `  ·  profile: ${meta.profile}` : '';
  lines.push(colorize(`  host: ${meta.hostname}  ·  platform: ${meta.platform}/${meta.arch}${profileNote}  ·  ${meta.timestamp}`, 'gray', useColor));
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
      profile: result.meta.profile || null,
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

/**
 * Standalone HTML report — no external assets, printable, meant to be handed
 * to a non-technical venue owner:  netcafe-guard scan --html > report.html
 *
 * Everything interpolated is escaped: rule files can come from third parties.
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

const STATUS_LABEL = {
  pass: 'Pass',
  fail: 'Fail',
  skip: 'Skipped',
  unknown: 'Unknown',
  error: 'Error'
};

function findingDetail(f) {
  if (f.status === 'fail') {
    return `observed <code>${escapeHtml(JSON.stringify(f.observed))}</code> · expected <code>${escapeHtml(f.expected)}</code>`;
  }
  if (f.status === 'unknown') return 'could not determine — check manually';
  if (f.status === 'error') return escapeHtml(f.reason || 'malformed rule');
  if (f.status === 'skip') return escapeHtml(f.reason || 'not applicable');
  return '';
}

function findingRow(f) {
  const detail = findingDetail(f);
  // The fix box is for problems; a passed check doesn't need instructions.
  const remediation = f.remediation && (f.status === 'fail' || f.status === 'unknown')
    ? `<div class="fix">${escapeHtml(f.remediation)}</div>`
    : '';
  return [
    '<tr>',
    `<td><span class="pill ${escapeHtml(f.status)}">${STATUS_LABEL[f.status] || escapeHtml(f.status)}</span></td>`,
    `<td><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>`,
    `<td><strong>${escapeHtml(f.title)}</strong><div class="rid">${escapeHtml(f.id)}</div>` +
      `${detail ? `<div class="detail">${detail}</div>` : ''}${remediation}</td>`,
    '</tr>'
  ].join('');
}

function renderHtml(result) {
  const { findings, meta } = result;
  const summary = scoreFindings(findings);
  const sorted = sortFindings(findings);
  const attention = sorted.filter((f) => ['fail', 'unknown', 'error'].includes(f.status));
  const rest = sorted.filter((f) => f.status === 'pass' || f.status === 'skip');
  const scoreClass = summary.score >= 80 ? 'good' : summary.score >= 60 ? 'warn' : 'bad';
  const profileNote = meta.profile ? ` · profile: ${escapeHtml(meta.profile)}` : '';

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>netcafe-guard report — ${escapeHtml(meta.hostname)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 2rem 1.25rem; background: #f6f8fa; color: #1f2328;
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; }
  header h1 { margin: 0; font-size: 1.35rem; }
  header p { margin: .25rem 0 0; color: #59636e; }
  .card { background: #fff; border: 1px solid #d1d9e0; border-radius: 8px;
          padding: 1.25rem; margin-top: 1rem; }
  .score { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  .score .num { font-size: 3rem; font-weight: 700; }
  .score.good .num { color: #1a7f37; }
  .score.warn .num { color: #9a6700; }
  .score.bad .num { color: #d1242f; }
  .totals { color: #59636e; }
  table { border-collapse: collapse; width: 100%; }
  td { border-top: 1px solid #d1d9e0; padding: .6rem .5rem; vertical-align: top; }
  tr:first-child td { border-top: 0; }
  .pill { display: inline-block; padding: .1rem .5rem; border-radius: 999px;
          font-size: .78rem; font-weight: 600; white-space: nowrap; }
  .pill.fail { background: #ffebe9; color: #d1242f; }
  .pill.unknown { background: #fff8c5; color: #9a6700; }
  .pill.error { background: #fbefff; color: #8250df; }
  .pill.pass { background: #dafbe1; color: #1a7f37; }
  .pill.skip { background: #eff2f5; color: #59636e; }
  .sev { font-size: .82rem; font-weight: 600; white-space: nowrap; }
  .sev-critical, .sev-high { color: #d1242f; }
  .sev-medium { color: #9a6700; }
  .sev-low { color: #0969da; }
  .sev-info { color: #59636e; }
  .rid { font-family: ui-monospace, monospace; font-size: .78rem; color: #59636e; }
  .detail { color: #59636e; font-size: .9rem; margin-top: .15rem; }
  .fix { margin-top: .35rem; padding: .5rem .6rem; background: #f6f8fa;
         border-left: 3px solid #0969da; font-size: .9rem; border-radius: 0 4px 4px 0; }
  code { font-family: ui-monospace, monospace; font-size: .85em; }
  details { margin-top: 1rem; }
  summary { cursor: pointer; color: #59636e; }
  footer { margin-top: 1.5rem; color: #59636e; font-size: .85rem; }
  @media print { body { background: #fff; } .card { border: 0; padding: 0; } }
</style>
<div class="wrap">
  <header>
    <h1>netcafe-guard — security baseline report</h1>
    <p>host: ${escapeHtml(meta.hostname)} · platform: ${escapeHtml(meta.platform)}/${escapeHtml(meta.arch)}${profileNote} · ${escapeHtml(meta.timestamp)}</p>
  </header>
  <div class="card score ${scoreClass}">
    <span class="num">${summary.score}/100</span>
    <span class="num">${escapeHtml(summary.grade)}</span>
    <span class="totals">${summary.totals.pass} pass · ${summary.totals.fail} fail · ${summary.totals.unknown} unknown · ${summary.totals.skip} skipped</span>
  </div>
  <div class="card">
    <h2>Needs attention (${attention.length})</h2>
    ${attention.length
      ? `<table>${attention.map(findingRow).join('\n')}</table>`
      : '<p>Nothing to report — every applicable check passed.</p>'}
    <details>
      <summary>Passed and skipped checks (${rest.length})</summary>
      <table>${rest.map(findingRow).join('\n')}</table>
    </details>
  </div>
  <footer>
    Unknown ≠ safe: investigate anything the scanner could not read.
    Generated by netcafe-guard v${escapeHtml(meta.version)}. Read-only scan — nothing on the machine was changed.
  </footer>
</div>
</html>
`;
}

module.exports = { renderText, renderJson, renderHtml, COLORS };
