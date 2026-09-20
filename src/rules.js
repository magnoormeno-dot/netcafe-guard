'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loading and validation for rule files.
 * Rules are plain JSON so that contributors can add a check without writing
 * any code — see docs/RULES.md.
 */

const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const FIX_TYPES = ['registry', 'registry-delete', 'command'];

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
  if (rule.evidence !== undefined && (typeof rule.evidence !== 'string' || !rule.evidence)) {
    problems.push(`${where}: "evidence" must be a non-empty fact name`);
  }
  if (rule.fix !== undefined) {
    const steps = Array.isArray(rule.fix) ? rule.fix : [rule.fix];
    if (!steps.length) problems.push(`${where}: "fix" must not be empty`);
    for (const step of steps) {
      if (!step || typeof step !== 'object') {
        problems.push(`${where}: each "fix" step must be an object`);
        continue;
      }
      if (!FIX_TYPES.includes(step.type)) {
        problems.push(`${where}: "fix.type" must be one of ${FIX_TYPES.join(', ')}`);
        continue;
      }
      if (step.type === 'command') {
        if (typeof step.run !== 'string' || !step.run) problems.push(`${where}: "fix.run" must be a non-empty string`);
        continue;
      }
      for (const field of ['hive', 'path', 'name']) {
        if (typeof step[field] !== 'string' || !step[field]) {
          problems.push(`${where}: "fix.${field}" must be a non-empty string`);
        }
      }
      if (step.type === 'registry') {
        if (!['DWord', 'String'].includes(step.kind)) problems.push(`${where}: "fix.kind" must be DWord or String`);
        if (step.data === undefined) problems.push(`${where}: "fix.data" is required`);
      }
    }
  }
  if (rule.profiles !== undefined) {
    if (!Array.isArray(rule.profiles) || rule.profiles.some((p) => typeof p !== 'string' || !p)) {
      problems.push(`${where}: "profiles" must be an array of non-empty strings`);
    }
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

/**
 * Every profile name declared across a ruleset ("all" is not a profile).
 * The CLI uses this to warn when --profile names something no rule declares.
 */
function declaredProfiles(rules) {
  const names = new Set();
  for (const rule of rules) {
    for (const p of (rule && rule.profiles) || []) {
      if (p !== 'all') names.add(p);
    }
  }
  return [...names].sort();
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
  FIX_TYPES,
  validateRule,
  validateRules,
  declaredProfiles,
  loadRulesFromFile,
  loadDefaultRules,
  defaultRulesPath
};
