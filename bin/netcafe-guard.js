#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { scan, renderText, renderJson, renderHtml, loadDefaultRules, version } = require('../src');
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
  netcafe-guard version            Print version
  netcafe-guard help               Show this help

Scan options:
  --json                 Output machine-readable JSON
  --html                 Output a standalone HTML report — hand it to the
                         venue owner: scan --html > report.html
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

Read-only by design: netcafe-guard never changes the machine it audits.
`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.flags.json = true;
    else if (a === '--html') args.flags.html = true;
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
    if (flags.json && flags.html) {
      process.stderr.write('netcafe-guard: choose one output format — --json or --html\n');
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
    } else {
      process.stdout.write(renderText(result, { color: flags.color, all: flags.all }));
    }

    if (typeof flags.failUnder === 'number' && !Number.isNaN(flags.failUnder)) {
      if (result.summary.score < flags.failUnder) return 2;
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
