'use strict';

const os = require('os');
const engine = require('./engine');
const { gatherFacts } = require('./probes');
const { loadDefaultRules, loadRulesFromFile } = require('./rules');
const { renderText, renderJson } = require('./report');
const pkg = require('../package.json');

/**
 * Run a full scan and return a structured result.
 *
 * @param {object} opts
 * @param {string} [opts.rulesFile] path to a custom ruleset
 * @param {object} [opts.facts]     inject facts (skips host probing) — used by tests
 * @param {string} [opts.platform]  override the platform used for rule filtering
 */
function scan(opts = {}) {
  const rules = opts.rulesFile ? loadRulesFromFile(opts.rulesFile) : loadDefaultRules();
  const facts = opts.facts || gatherFacts();
  const platform = opts.platform || facts.platform || process.platform;

  const findings = engine.evaluate(rules, facts, platform);
  const summary = engine.scoreFindings(findings);

  return {
    findings,
    summary,
    meta: {
      version: pkg.version,
      hostname: facts.hostname || os.hostname(),
      platform,
      arch: facts.arch || process.arch,
      timestamp: new Date().toISOString(),
      ruleCount: rules.length
    }
  };
}

module.exports = {
  scan,
  renderText,
  renderJson,
  engine,
  gatherFacts,
  loadDefaultRules,
  version: pkg.version
};
