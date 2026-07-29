'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loading and validation for rule files.
 * Rules are plain JSON so that contributors can add a check without writing
 * any code — see docs/RULES.md.
 */

const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_OPERATORS = [
  'equals',
  'notEquals',
  'exists',
  'absent',
  'isTrue',
  'isFalse',
  'oneOf',
  'notOneOf',
  'gte',
  'lte',
  'includes'
];

/**
 * Validate a single rule object. Returns an array of problem strings
 * (empty means valid). Kept strict so a malformed contribution fails loudly
 * in CI instead of silently doing nothing at scan time.
 */
function validateRule(rule, index) {
  const where = rule && rule.id ? `rule "${rule.id}"` : `rule #${index}`;
  const problems = [];

  if (!rule || typeof rule !== 'object') {
    return [`${where}: not an object`];
  }
  if (!rule.id || typeof rule.id !== 'string') problems.push(`${where}: missing string "id"`);
  if (!rule.title || typeof rule.title !== 'string') problems.push(`${where}: missing string "title"`);
  if (rule.severity && !VALID_SEVERITIES.includes(rule.severity)) {
    problems.push(`${where}: invalid severity "${rule.severity}"`);
  }
  if (!rule.check || typeof rule.check !== 'object') {
    problems.push(`${where}: missing "check" object`);
  } else {
    if (!rule.check.fact) problems.push(`${where}: check missing "fact"`);
    if (!rule.check.operator) {
      problems.push(`${where}: check missing "operator"`);
    } else if (!VALID_OPERATORS.includes(rule.check.operator)) {
      problems.push(`${where}: unknown operator "${rule.check.operator}"`);
    }
  }
  if (rule.platforms && !Array.isArray(rule.platforms)) {
    problems.push(`${where}: "platforms" must be an array`);
  }
  return problems;
}

/**
 * Validate a whole ruleset, including duplicate-id detection.
 */
function validateRules(rules) {
  const problems = [];
  if (!Array.isArray(rules)) return ['ruleset must be a JSON array'];

  const seen = new Set();
  rules.forEach((rule, i) => {
    problems.push(...validateRule(rule, i));
    if (rule && rule.id) {
      if (seen.has(rule.id)) problems.push(`duplicate rule id "${rule.id}"`);
      seen.add(rule.id);
    }
  });
  return problems;
}

function loadRulesFromFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse ${file}: ${err.message}`);
  }
  const problems = validateRules(parsed);
  if (problems.length) {
    throw new Error(`Invalid ruleset ${file}:\n  - ${problems.join('\n  - ')}`);
  }
  return parsed;
}

function defaultRulesPath() {
  return path.join(__dirname, '..', 'rules', 'baseline.json');
}

function loadDefaultRules() {
  return loadRulesFromFile(defaultRulesPath());
}

module.exports = {
  VALID_SEVERITIES,
  VALID_OPERATORS,
  validateRule,
  validateRules,
  loadRulesFromFile,
  loadDefaultRules,
  defaultRulesPath
};
