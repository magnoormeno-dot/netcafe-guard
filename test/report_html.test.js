'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src');
const { renderHtml, renderJson, renderText } = require('../src/report');

const FACTS = {
  hostname: 'CAFE-PC-07',
  platform: 'win32',
  arch: 'x64',
  autoAdminLogon: true,
  recallDisabled: false
};

test('HTML report is a standalone document carrying score and findings', () => {
  const result = scan({ facts: FACTS, platform: 'win32' });
  const html = renderHtml(result);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, new RegExp(`${result.summary.score}/100`));
  assert.match(html, /CAFE-PC-07/);
  assert.match(html, /win-autologon-disabled/);
  assert.match(html, /ai-recall-disabled/);
  // Remediation text travels with the finding — that's the point of the report.
  assert.match(html, /AutoAdminLogon/);
  // Self-contained: no external stylesheets, scripts or images.
  assert.doesNotMatch(html, /<link|<script|src=/);
});

test('HTML report escapes rule-supplied text', () => {
  const rules = [
    {
      id: 'x',
      title: '<script>alert(1)</script>',
      severity: 'high',
      check: { fact: 'a', operator: 'isTrue' },
      remediation: 'use " and \' & < >'
    }
  ];
  const html = renderHtml(scan({ rules, facts: { a: false }, platform: 'win32' }));
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot; and &#39; &amp; &lt; &gt;/);
});

test('profile is surfaced in text, HTML and JSON output', () => {
  const result = scan({ facts: FACTS, platform: 'win32', profile: 'shared-office' });
  assert.match(renderText(result, { color: false }), /profile: shared-office/);
  assert.match(renderHtml(result), /profile: shared-office/);
  assert.equal(JSON.parse(renderJson(result)).profile, 'shared-office');
});

test('JSON profile is null when no profile was requested', () => {
  const result = scan({ facts: FACTS, platform: 'win32' });
  assert.equal(JSON.parse(renderJson(result)).profile, null);
});

test('HTML report footer carries the support contact and stays self-contained', () => {
  const html = renderHtml(scan({ facts: FACTS, platform: 'win32' }));
  assert.match(html, /mailto:magnoormeno@gmail\.com/);
  assert.doesNotMatch(html, /<link|<script|src=/);
});
