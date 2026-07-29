'use strict';

/**
 * Rule engine for netcafe-guard.
 *
 * The engine is deliberately pure: it takes a set of rules and a plain "facts"
 * object (gathered by the probes, or injected in tests) and produces findings.
 * No I/O happens here, which is what makes it easy to test and easy for
 * contributors to reason about.
 */

const SEVERITY_WEIGHTS = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 0
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Decide whether a rule applies to the current platform.
 * A rule with no `platforms` field, or one containing "all", applies everywhere.
 */
function ruleAppliesToPlatform(rule, platform) {
  if (!rule.platforms || rule.platforms.length === 0) return true;
  if (rule.platforms.includes('all')) return true;
  return rule.platforms.includes(platform);
}

/**
 * Compare an observed value against a rule's check definition.
 * Returns true when the observed value satisfies the "secure" expectation.
 */
function checkPasses(check, observed) {
  const { operator, value } = check;
  switch (operator) {
    case 'equals':
      return observed === value;
    case 'notEquals':
      return observed !== value;
    case 'exists':
      return observed !== undefined && observed !== null;
    case 'absent':
      return observed === undefined || observed === null;
    case 'isTrue':
      return observed === true;
    case 'isFalse':
      return observed === false;
    case 'oneOf':
      return Array.isArray(value) && value.includes(observed);
    case 'notOneOf':
      return Array.isArray(value) && !value.includes(observed);
    case 'gte':
      return typeof observed === 'number' && observed >= value;
    case 'lte':
      return typeof observed === 'number' && observed <= value;
    case 'includes':
      return Array.isArray(observed) && observed.includes(value);
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Evaluate a single rule against the facts.
 * Status is one of: pass | fail | skip | unknown | error
 *  - skip:    rule does not apply to this platform
 *  - unknown: the probe could not determine the fact (missing/undefined)
 *  - error:   the rule itself is malformed
 */
function evaluateRule(rule, facts, platform) {
  const base = {
    id: rule.id,
    title: rule.title,
    severity: rule.severity || 'medium',
    category: rule.category || 'general',
    remediation: rule.remediation || '',
    reference: rule.reference || ''
  };

  if (!ruleAppliesToPlatform(rule, platform)) {
    return { ...base, status: 'skip', reason: 'not-applicable', observed: undefined };
  }

  if (!rule.check || !rule.check.fact || !rule.check.operator) {
    return { ...base, status: 'error', reason: 'malformed-rule', observed: undefined };
  }

  const observed = facts ? facts[rule.check.fact] : undefined;

  // A missing fact on an applicable rule is "unknown", not a silent pass.
  // For a security tool, unknown must be surfaced, never assumed safe.
  // `absent` is the one operator whose whole purpose is "this fact is not set".
  const optionalWhenMissing = rule.check.operator === 'absent';
  if ((observed === undefined || observed === null) && !optionalWhenMissing) {
    return { ...base, status: 'unknown', reason: 'undetermined', observed };
  }

  let passed;
  try {
    passed = checkPasses(rule.check, observed);
  } catch (err) {
    return { ...base, status: 'error', reason: err.message, observed };
  }

  return {
    ...base,
    status: passed ? 'pass' : 'fail',
    observed,
    expected: describeExpectation(rule.check)
  };
}

function describeExpectation(check) {
  const { operator, value } = check;
  switch (operator) {
    case 'equals':
      return `== ${JSON.stringify(value)}`;
    case 'notEquals':
      return `!= ${JSON.stringify(value)}`;
    case 'exists':
      return 'present';
    case 'absent':
      return 'absent';
    case 'isTrue':
      return 'true';
    case 'isFalse':
      return 'false';
    case 'oneOf':
      return `one of ${JSON.stringify(value)}`;
    case 'notOneOf':
      return `not one of ${JSON.stringify(value)}`;
    case 'gte':
      return `>= ${value}`;
    case 'lte':
      return `<= ${value}`;
    case 'includes':
      return `includes ${JSON.stringify(value)}`;
    default:
      return String(operator);
  }
}

/**
 * Evaluate every rule and return the findings array.
 */
function evaluate(rules, facts, platform) {
  if (!Array.isArray(rules)) {
    throw new TypeError('rules must be an array');
  }
  return rules.map((rule) => evaluateRule(rule, facts, platform));
}

/**
 * Score a set of findings.
 * Starts at 100 and subtracts a weighted penalty per failed rule.
 * "unknown" findings do not change the score but are counted so callers can
 * surface them (unknown is a visibility problem, not a pass).
 */
function scoreFindings(findings) {
  const totals = { pass: 0, fail: 0, skip: 0, unknown: 0, error: 0 };
  const bySeverity = {};
  const byCategory = {};
  let penalty = 0;

  for (const f of findings) {
    totals[f.status] = (totals[f.status] || 0) + 1;

    if (f.status === 'fail') {
      const weight = SEVERITY_WEIGHTS[f.severity] ?? SEVERITY_WEIGHTS.medium;
      penalty += weight;

      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    }
  }

  const score = Math.max(0, 100 - penalty);
  return {
    score,
    grade: gradeFor(score),
    totals,
    bySeverity,
    byCategory
  };
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Sort findings so the most urgent problems surface first:
 * failures (by severity) → unknown → error → pass → skip.
 */
function sortFindings(findings) {
  const statusRank = { fail: 0, unknown: 1, error: 2, pass: 3, skip: 4 };
  return [...findings].sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });
}

module.exports = {
  SEVERITY_WEIGHTS,
  SEVERITY_ORDER,
  ruleAppliesToPlatform,
  checkPasses,
  evaluateRule,
  evaluate,
  scoreFindings,
  sortFindings,
  gradeFor
};
