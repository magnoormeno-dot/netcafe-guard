'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src');
const { probeAgentToolConfigs, AGENT_TOOL_CONFIG_CANDIDATES } = require('../src/probes');

test('a leftover agent/MCP config fails the AI-surface rule on any platform', () => {
  const facts = {
    hostname: 'kiosk',
    platform: 'linux',
    arch: 'x64',
    agentToolConfigCount: 1,
    agentToolConfigFiles: ['~/.cursor/mcp.json']
  };
  const finding = scan({ facts, platform: 'linux' }).findings.find(
    (f) => f.id === 'ai-no-leftover-agent-configs'
  );
  assert.equal(finding.status, 'fail');
  assert.equal(finding.severity, 'high');
  assert.equal(finding.category, 'ai-surface');
});

test('a clean profile passes the agent-config rule', () => {
  const facts = { hostname: 'kiosk', platform: 'linux', arch: 'x64', agentToolConfigCount: 0 };
  const finding = scan({ facts, platform: 'linux' }).findings.find(
    (f) => f.id === 'ai-no-leftover-agent-configs'
  );
  assert.equal(finding.status, 'pass');
});

test('the agent-config probe is cross-platform and exposes labels only', () => {
  const facts = {};
  probeAgentToolConfigs(facts);
  assert.ok(Array.isArray(facts.agentToolConfigFiles));
  assert.equal(typeof facts.agentToolConfigCount, 'number');
  for (const label of facts.agentToolConfigFiles) {
    assert.match(label, /^~\//);
  }
});

test('the watchlist covers the major agent/MCP config locations', () => {
  const expected = [
    '.cursor/mcp.json',
    '.codeium/windsurf/mcp_config.json',
    '.codex/config.toml',
    '.gemini/settings.json',
    '.config/Claude/claude_desktop_config.json',
    'Library/Application Support/Claude/claude_desktop_config.json',
    'AppData/Roaming/Claude/claude_desktop_config.json'
  ];
  for (const rel of expected) {
    assert.ok(
      AGENT_TOOL_CONFIG_CANDIDATES.includes(rel),
      `expected watchlist to include ${rel}`
    );
  }
});
