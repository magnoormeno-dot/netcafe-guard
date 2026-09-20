#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { scan, renderText, renderJson, renderHtml, loadDefaultRules, version } = require('../src');
const { SUPPORT_CONTACT } = require('../src/report');
const { diffReports, renderDiffText } = require('../src/diff');
const { aggregateFleet, renderFleetText } = require('../src/fleet');
const { buildFixScript } = require('../src/fixscript');
const path = require('path');
const { loadRulesFromFile, declaredProfiles } = require('../src/rules');
const { ruleAppliesToProfile } = require('../src/engine');

/*
 * "gaming-cafe" is documented but intentionally declared by no rule — it is
 * the baseline minus the shared-office-only rules, so it never needs a tag.
 */
const DOCUMENTED_PROFILES = ['gaming-cafe'];

function warnUnknownProfile(profile, rules) {
  if (!profile) return;
  const known = new Set([...declaredProfiles(rules), ...DOCUMENTED_PROFILES]);
  if (!known.has(profile)) {
    process.stderr.write(
      `netcafe-guard: warning: no rule declares profile "${profile}" ` +
      `(known: ${[...known].sort().join(', ')}); ` +
      'rules tagged for other profiles will be skipped\n'
    );
  }
}

const HELP = `
netcafe-guard v${version}
Security baseline auditor for shared and public PCs.

Usage:
  netcafe-guard scan [options]     Run the baseline scan on this machine
  netcafe-guard list-rules         Print the active ruleset (honours --rules
                                   and --profile)
  netcafe-guard diff <before.json> <after.json>
                                   Drift report between two --json scans of the
                                   same machine. Exit code 3 if anything that
                                   passed before fails now.
  netcafe-guard fleet <paths...>   Summarise many --json reports (files or a
                                   directory): which control is broken across
                                   the floor, and which seats are worst.
  netcafe-guard version            Print version
  netcafe-guard help               Show this help

Scan options:
  --json                 Output machine-readable JSON
  --html                 Output a standalone HTML report — hand it to the
                         venue owner: scan --html > report.html
  --fix-script           Print a PowerShell remediation script for the checks
                         that FAILED. Nothing is executed: review it, then run
                         it yourself as administrator. Destructive fixes (files
                         to delete, software to install) are left as comments.
  --all                  Show every check, including passes and skips
  --no-color             Disable ANSI colors
  --rules <file>         Use a custom ruleset (JSON)
  --profile <name>       Venue profile (baseline knows gaming-cafe and
                         shared-office). Rules declaring only other profiles
                         are skipped; untagged rules always apply. Preview
                         with: list-rules --profile <name>
  --facts <file>         Evaluate against a facts JSON file instead of probing
                         the host (useful for testing rules)
  --fail-under <score>   Exit non-zero if the score is below this threshold
                         (handy in CI / scheduled checks)

Examples:
  netcafe-guard scan
  netcafe-guard scan --json > report.json
  netcafe-guard scan --html > report.html
  netcafe-guard scan --profile gaming-cafe --fail-under 80
  netcafe-guard scan --rules ./my-cafe-rules.json --all
  netcafe-guard diff after-imaging.json now.json
  netcafe-guard scan --fix-script > fix.ps1
  netcafe-guard fleet ./reports --fail-under 70

Read-only by design: netcafe-guard never changes the machine it audits.
Enterprise deployment & support: ${SUPPORT_CONTACT}  (docs/ENTERPRISE.md)
`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.flags.json = true;
    else if (a === '--html') args.flags.html = true;
    else if (a === '--fix-script') args.flags.fixScript = true;
    else if (a === '--all') args.flags.all = true;
    else if (a === '--no-color') args.flags.color = false;
    else if (a === '--rules') args.flags.rules = argv[++i];
    else if (a === '--profile') args.flags.profile = argv[++i];
    else if (a === '--facts') args.flags.facts = argv[++i];
    else if (a === '--fail-under') args.flags.failUnder = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

function main() {
  const argv = process.argv.slice(2);
  const { _: positional, flags } = parseArgs(argv);
  const command = positional[0] || 'scan';

  if (command === 'help' || flags.help || command === '--help') {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === 'version' || command === '--version') {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  if (command === 'list-rules') {
    const rules = flags.rules ? loadRulesFromFile(flags.rules) : loadDefaultRules();
    warnUnknownProfile(flags.profile, rules);
    const shown = flags.profile ? rules.filter((r) => ruleAppliesToProfile(r, flags.profile)) : rules;
    for (const r of shown) {
      const platforms = (r.platforms || ['all']).join(',');
      const profiles = r.profiles && r.profiles.length ? `  {${r.profiles.join(',')}}` : '';
      process.stdout.write(`${r.id}  [${r.severity || 'medium'}]  (${platforms})${profiles}  ${r.title}\n`);
    }
    return 0;
  }

  if (command === 'scan') {
    const formats = ['json', 'html', 'fixScript'].filter((f) => flags[f]);
    if (formats.length > 1) {
      process.stderr.write('netcafe-guard: choose one output format — --json, --html or --fix-script\n');
      return 1;
    }

    const opts = { rules: flags.rules ? loadRulesFromFile(flags.rules) : loadDefaultRules() };
    warnUnknownProfile(flags.profile, opts.rules);
    if (flags.profile) opts.profile = flags.profile;
    if (flags.facts) {
      opts.facts = JSON.parse(fs.readFileSync(flags.facts, 'utf8'));
    }
    const result = scan(opts);

    if (flags.json) {
      process.stdout.write(renderJson(result) + '\n');
    } else if (flags.html) {
      process.stdout.write(renderHtml(result));
    } else if (flags.fixScript) {
      const { script, scripted, manual } = buildFixScript(result, opts.rules);
      process.stdout.write(script);
      // Summary on stderr so `> fix.ps1` stays a clean script.
      process.stderr.write(
        `netcafe-guard: ${scripted.length} scripted fix(es), ${manual.length} needing manual work` +
        (manual.length ? ` (${manual.join(', ')})` : '') + '\n'
      );
    } else {
      process.stdout.write(renderText(result, { color: flags.color, all: flags.all }));
    }

    if (typeof flags.failUnder === 'number' && !Number.isNaN(flags.failUnder)) {
      if (result.summary.score < flags.failUnder) return 2;
    }
    return 0;
  }

  if (command === 'diff') {
    const [beforeFile, afterFile] = positional.slice(1);
    if (!beforeFile || !afterFile) {
      process.stderr.write('netcafe-guard: diff needs two files: diff <before.json> <after.json>\n');
      return 1;
    }
    const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
    const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
    const diff = diffReports(before, after);
    if (flags.json) {
      process.stdout.write(JSON.stringify(diff, null, 2) + '\n');
    } else {
      process.stdout.write(renderDiffText(diff));
    }
    return diff.regressions.length ? 3 : 0;
  }

  if (command === 'fleet') {
    const targets = positional.slice(1);
    if (!targets.length) {
      process.stderr.write('netcafe-guard: fleet needs report files or a directory: fleet <paths...>\n');
      return 1;
    }

    const files = [];
    for (const target of targets) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(target).sort()) {
          if (entry.toLowerCase().endsWith('.json')) files.push(path.join(target, entry));
        }
      } else {
        files.push(target);
      }
    }

    const inputs = files.map((file) => {
      try {
        return { label: file, report: JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch (_err) {
        return { label: file, report: null };
      }
    });

    const agg = aggregateFleet(inputs);
    if (flags.json) {
      process.stdout.write(JSON.stringify(agg, null, 2) + '\n');
    } else {
      process.stdout.write(renderFleetText(agg));
    }

    if (typeof flags.failUnder === 'number' && !Number.isNaN(flags.failUnder)) {
      const below = agg.seats.filter((s) => s.score !== null && s.score < flags.failUnder);
      if (below.length) {
        process.stderr.write(
          `netcafe-guard: ${below.length} seat(s) below ${flags.failUnder}: ` +
          below.slice(0, 10).map((s) => s.hostname).join(', ') +
          (below.length > 10 ? ', …' : '') + '\n'
        );
        return 2;
      }
    }
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n${HELP}`);
  return 1;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`netcafe-guard: ${err.message}\n`);
  process.exit(1);
}
