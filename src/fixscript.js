'use strict';

/**
 * Remediation script export.
 *
 *   netcafe-guard scan --fix-script > fix-cafe-pc-07.ps1
 *
 * The scanner stays read-only: this module only *prints* a script. Nothing is
 * executed, and nothing on the audited machine is touched. A human reads the
 * script, decides, and runs it themselves with administrator rights.
 *
 * Two deliberate limits keep the generated script safe to read and run:
 *
 *  - Only FAILED checks produce commands. An `unknown` result means the
 *    scanner could not read the setting; writing a value there would paper
 *    over a visibility problem instead of fixing it.
 *  - Only rules carrying a structured `fix` are scripted. Anything whose
 *    remediation deletes a tenant's files, installs software, or reconfigures
 *    a service is emitted as a commented MANUAL block with the prose
 *    remediation — a generated script is the wrong place for `rm -rf` on
 *    somebody's profile.
 */

const { sortFindings } = require('./engine');

function asSteps(fix) {
  if (!fix) return [];
  return Array.isArray(fix) ? fix : [fix];
}

/** PowerShell single-quoted literal: '' escapes a quote. */
function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psData(step) {
  return step.kind === 'DWord' ? String(Number(step.data)) : psLiteral(step.data);
}

function registryPath(step) {
  return `${step.hive}:\\${step.path}`;
}

function renderStep(step) {
  const lines = [];
  if (step.note) lines.push(`#   note: ${step.note}`);

  if (step.type === 'registry') {
    const path = psLiteral(registryPath(step));
    lines.push(`if (-not (Test-Path ${path})) { New-Item -Path ${path} -Force | Out-Null }`);
    lines.push(
      `New-ItemProperty -Path ${path} -Name ${psLiteral(step.name)} ` +
      `-PropertyType ${step.kind} -Value ${psData(step)} -Force | Out-Null`
    );
    return lines;
  }

  if (step.type === 'registry-delete') {
    const path = psLiteral(registryPath(step));
    lines.push(
      `Remove-ItemProperty -Path ${path} -Name ${psLiteral(step.name)} ` +
      '-Force -ErrorAction SilentlyContinue'
    );
    return lines;
  }

  if (step.type === 'command') {
    lines.push(step.run);
    return lines;
  }

  lines.push(`# unsupported fix type "${step.type}" — apply by hand`);
  return lines;
}

function commentBlock(text, indent = '# ') {
  return String(text)
    .split(/\r?\n/)
    .flatMap((line) => wrap(line, 76))
    .map((line) => (line ? indent + line : '#'));
}

function wrap(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const out = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Build the PowerShell remediation script for a scan result.
 * Returns { script, scripted, manual } — the counts let the CLI report what
 * the operator still has to do by hand.
 */
function buildFixScript(result, rules = []) {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const failures = sortFindings(result.findings).filter((f) => f.status === 'fail');
  const scripted = [];
  const manual = [];

  for (const finding of failures) {
    const rule = byId.get(finding.id);
    const steps = asSteps(rule && rule.fix);
    (steps.length ? scripted : manual).push({ finding, rule, steps });
  }

  const meta = result.meta || {};
  const out = [];
  out.push('<#');
  out.push(`  netcafe-guard ${meta.version || ''} — remediation script`.trimEnd());
  out.push(`  host: ${meta.hostname || 'unknown'}   platform: ${meta.platform || 'unknown'}`);
  out.push(`  generated: ${meta.timestamp || new Date().toISOString()}`);
  out.push('');
  out.push('  READ THIS BEFORE RUNNING IT.');
  out.push('');
  out.push('  netcafe-guard did not run any of this. It printed a script; you decide');
  out.push('  whether to run it, as an administrator, on a machine you own or operate.');
  out.push('  Every command below is here because a check FAILED on this machine —');
  out.push('  checks that came back "unknown" are never scripted, because unknown means');
  out.push('  "go look", not "overwrite it".');
  out.push('');
  out.push('  Re-run `netcafe-guard scan` afterwards to confirm the score moved.');
  out.push('#>');
  out.push('');
  out.push('$ErrorActionPreference = \'Stop\'');
  out.push('');

  if (!scripted.length && !manual.length) {
    out.push('# Nothing to do: no check failed on this machine.');
    out.push('');
    return { script: out.join('\n'), scripted: [], manual: [] };
  }

  if (scripted.length) {
    out.push(`# ${scripted.length} scripted fix${scripted.length === 1 ? '' : 'es'}`);
    out.push('');
    for (const { finding, steps } of scripted) {
      out.push(`# --- [${finding.severity}] ${finding.id} ---`);
      out.push(`# ${finding.title}`);
      if (finding.remediation) out.push(...commentBlock(finding.remediation));
      for (const step of steps) out.push(...renderStep(step));
      out.push('');
    }
  }

  if (manual.length) {
    out.push(`# ${manual.length} finding${manual.length === 1 ? '' : 's'} NOT scripted.`);
    out.push('# Deleting a tenant\'s files, installing software or reconfiguring a');
    out.push('# service needs a human decision, so those stay comments here.');
    out.push('');
    for (const { finding } of manual) {
      out.push(`# --- MANUAL [${finding.severity}] ${finding.id} ---`);
      out.push(`# ${finding.title}`);
      if (finding.observed !== undefined) {
        out.push(`#   observed: ${JSON.stringify(finding.observed)}`);
      }
      if (finding.remediation) out.push(...commentBlock(finding.remediation, '#   '));
      out.push('');
    }
  }

  out.push(`Write-Host 'netcafe-guard: applied ${scripted.length} fix(es). ` +
    `${manual.length} finding(s) still need manual work — see the comments above.'`);
  out.push('');

  return {
    script: out.join('\n'),
    scripted: scripted.map((s) => s.finding.id),
    manual: manual.map((m) => m.finding.id)
  };
}

module.exports = { buildFixScript };
