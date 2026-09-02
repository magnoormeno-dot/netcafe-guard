'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src');
const {
  parseListeningSockets,
  exposedAiServices,
  probeAiServiceExposure,
  AI_SERVICE_PORTS
} = require('../src/probes');

const WINDOWS_NETSTAT = [
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1180',
  '  TCP    0.0.0.0:11434          0.0.0.0:0              LISTENING       4242',
  '  TCP    127.0.0.1:1234         0.0.0.0:0              LISTENING       9001',
  '  TCP    192.168.1.5:139        0.0.0.0:0              LISTENING       4',
  '  TCP    192.168.1.5:52011      140.82.112.4:443       ESTABLISHED     7788',
  '  TCP    [::]:7860              [::]:0                 LISTENING       5150',
  '  UDP    0.0.0.0:5353           *:*                                    2200'
].join('\r\n');

const LINUX_SS = [
  'LISTEN 0      4096         *:11434           *:*    users:(("ollama",pid=612,fd=3))',
  'LISTEN 0      511  127.0.0.1:7860      0.0.0.0:*',
  'LISTEN 0      128       [::]:5001           [::]:*'
].join('\n');

const MACOS_NETSTAT = [
  'Active Internet connections (including servers)',
  'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)',
  'tcp4       0      0  *.11434                *.*                    LISTEN',
  'tcp4       0      0  127.0.0.1.1234         *.*                    LISTEN',
  'tcp46      0      0  *.4891                 *.*                    LISTEN',
  'tcp4       0      0  192.168.1.20.52011     17.253.144.10.443      ESTABLISHED'
].join('\n');

test('parses Windows netstat: wildcard, loopback and v6 listeners', () => {
  const sockets = parseListeningSockets(WINDOWS_NETSTAT);
  assert.deepEqual(sockets.map((s) => `${s.address}:${s.port}`), [
    '0.0.0.0:135', '0.0.0.0:11434', '127.0.0.1:1234', '192.168.1.5:139', '[::]:7860'
  ]);
});

test('parses Linux ss and macOS netstat formats', () => {
  assert.deepEqual(parseListeningSockets(LINUX_SS).map((s) => s.port), [11434, 7860, 5001]);
  assert.deepEqual(parseListeningSockets(MACOS_NETSTAT).map((s) => `${s.address}:${s.port}`), [
    '*:11434', '127.0.0.1:1234', '*:4891'
  ]);
});

test('only known AI ports on non-loopback addresses count as exposed', () => {
  assert.deepEqual(exposedAiServices(parseListeningSockets(WINDOWS_NETSTAT)), [
    'Ollama (0.0.0.0:11434)',
    'Gradio AI web UI (text-generation-webui / Stable Diffusion WebUI) ([::]:7860)'
  ]);
  assert.deepEqual(exposedAiServices(parseListeningSockets(LINUX_SS)), [
    'Ollama (*:11434)', 'KoboldCpp ([::]:5001)'
  ]);
  assert.deepEqual(exposedAiServices(parseListeningSockets(MACOS_NETSTAT)), [
    'Ollama (*:11434)', 'GPT4All (*:4891)'
  ]);
});

test('generic ports are deliberately not in the table', () => {
  for (const port of [80, 443, 3000, 8000, 8080]) {
    assert.equal(AI_SERVICE_PORTS[port], undefined, `port ${port} would cry wolf`);
  }
});

test('probe sets facts from the first command that answers, per platform', () => {
  const calls = [];
  const runner = (cmd, args) => {
    calls.push(`${cmd} ${args.join(' ')}`);
    return cmd === 'ss' ? undefined : LINUX_SS; // ss missing, netstat answers
  };
  const facts = {};
  probeAiServiceExposure(facts, 'linux', runner);
  assert.deepEqual(calls, ['ss -ltnH', 'netstat -ltn']);
  assert.equal(facts.aiServiceExposedCount, 2);
  assert.deepEqual(facts.aiServiceExposed, ['Ollama (*:11434)', 'KoboldCpp ([::]:5001)']);
});

test('a machine with no listening sockets at all passes (empty output is an answer)', () => {
  const facts = {};
  probeAiServiceExposure(facts, 'linux', (cmd) => (cmd === 'ss' ? '' : undefined));
  assert.equal(facts.aiServiceExposedCount, 0);
  assert.deepEqual(facts.aiServiceExposed, []);
});

test('probe leaves the fact undefined when nothing can be read (unknown, not safe)', () => {
  const facts = {};
  probeAiServiceExposure(facts, 'win32', () => undefined);
  assert.equal(facts.aiServiceExposedCount, undefined);
  const finding = scan({ facts: { hostname: 'k', platform: 'win32', arch: 'x64' }, platform: 'win32' })
    .findings.find((f) => f.id === 'ai-local-llm-not-exposed');
  assert.equal(finding.status, 'unknown');
});

test('an exposed Ollama fails the rule on every platform; loopback-only passes', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const fail = scan({
      facts: { hostname: 'k', platform, arch: 'x64', aiServiceExposedCount: 1, aiServiceExposed: ['Ollama (0.0.0.0:11434)'] },
      platform
    }).findings.find((f) => f.id === 'ai-local-llm-not-exposed');
    assert.equal(fail.status, 'fail', platform);
    assert.equal(fail.severity, 'high');

    const pass = scan({
      facts: { hostname: 'k', platform, arch: 'x64', aiServiceExposedCount: 0, aiServiceExposed: [] },
      platform
    }).findings.find((f) => f.id === 'ai-local-llm-not-exposed');
    assert.equal(pass.status, 'pass', platform);
  }
});
