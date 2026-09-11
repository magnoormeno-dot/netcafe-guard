'use strict';

const os = require('os');
const engine = require('./engine');
const { gatherFacts } = require('./probes');
const { loadDefaultRules, loadRulesFromFile } = require('./rules');
const { renderText, renderJson, renderHtml } = require('./report');
const { diffReports, renderDiffText } = require('./diff');
const { aggregateFleet, renderFleetText } = require('./fleet');
const { buildFixScript } = require('./fixscript');
const pkg = require('../package.json');

/**
 * Run a full scan and return a structured result.
 *
 * @param {object} opts
 * @param {object[]} [opts.rules]   inject an already-loaded ruleset
 * @param {string} [opts.rulesFile] path to a custom ruleset
 * @param {object} [opts.facts]     inject facts (skips host probing) — used by tests
 * @param {string} [opts.platform]  override the platform used for rule filtering
 * @param {string} [opts.profile]   venue profile (e.g. "gaming-cafe"); rules
 *                                  declaring only other profiles are skipped
 */
function scan(opts = {}) {
  const rules =
    opts.rules || (opts.rulesFile ? loadRulesFromFile(opts.rulesFile) : loadDefaultRules());
  const facts = opts.facts || gatherFacts();
  const platform = opts.platform || facts.platform || process.platform;

  const findings = engine.evaluate(rules, facts, platform, opts.profile);
  const summary = engine.scoreFindings(findings);

  return {
    findings,
    summary,
    meta: {
      version: pkg.version,
      hostname: facts.hostname || os.hostname(),
      platform,
      arch: facts.arch || process.arch,
      profile: opts.profile || undefined,
      timestamp: new Date().toISOString(),
      ruleCount: rules.length
    }
  };
}

module.exports = {
  scan,
  renderText,
  renderJson,
  renderHtml,
  diffReports,
  renderDiffText,
  aggregateFleet,
  renderFleetText,
  buildFixScript,
  engine,
  gatherFacts,
  loadDefaultRules,
  version: pkg.version
};
