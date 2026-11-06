#!/usr/bin/env node
'use strict';

/*
 * duty-visual — visuals for growth-duty shifts (README demo GIFs, release and
 * post images). Policy lives in docs/growth/DUTY_MANUAL.md: the subscription
 * route first (the duty session's own work, zero marginal cost), the paid
 * images API only when that output fails the quality gate.
 *
 *   assemble   frames -> GIF      (subscription route: frames the duty session drew)
 *   generate   prompt -> GIF/PNG  (API route: OpenAI gpt-image-2.6, paid per call)
 *   inspect    validate a GIF     (size, frames, loop length)
 *   auto       subscription command first, API only if its output fails the gate
 *
 * Zero dependencies, Node >= 18. Not part of the published npm package.
 * The API key is read from OPENAI_API_KEY on this machine and is never printed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MODELS = { flare: 'gpt-image-2.6-flare', sunburst: 'gpt-image-2.6-sunburst' };
const API_URL = 'https://api.openai.com/v1/images/generations';
const FORMATS = ['gif', 'png', 'webp', 'jpeg'];
const DEFAULTS = { model: 'flare', quality: 'medium', size: 'auto', format: 'gif', fps: 8 };

/* ---------- GIF structure walk: no decoding, just frames and delays ---------- */

function parseGif(buf) {
  if (buf.length < 13 || buf.toString('latin1', 0, 3) !== 'GIF') throw new Error('not a GIF file');
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  let i = 13;
  const flags = buf[10];
  if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1)); // global colour table
  let frames = 0;
  let totalDelayCs = 0;
  let delay = 0;
  while (i < buf.length) {
    const c = buf[i];
    if (c === 0x3b) break; // trailer
    if (c === 0x21) { // extension
      const label = buf[i + 1];
      i += 2;
      if (label === 0xf9) delay = buf.readUInt16LE(i + 2); // graphic control: delay in 1/100 s
      while (buf[i]) i += buf[i] + 1; // sub-blocks
      i += 1;
    } else if (c === 0x2c) { // image descriptor
      frames += 1;
      totalDelayCs += delay;
      const f = buf[i + 9];
      i += 10;
      if (f & 0x80) i += 3 * (1 << ((f & 7) + 1)); // local colour table
      i += 1; // LZW minimum code size
      while (buf[i]) i += buf[i] + 1;
      i += 1;
    } else {
      throw new Error(`unexpected GIF block 0x${c.toString(16)} at byte ${i}`);
    }
  }
  return { width, height, frames, loopSeconds: Math.round(totalDelayCs) / 100, bytes: buf.length };
}

function statsFor(file, format) {
  const buf = fs.readFileSync(file);
  if (format === 'gif' || buf.toString('latin1', 0, 3) === 'GIF') return parseGif(buf);
  return { bytes: buf.length };
}

/* ---------- the quality gate's hard half; the soft half is a human look ---------- */

function check(stats, opts = {}) {
  const reasons = [];
  if (!stats || typeof stats.bytes !== 'number' || stats.bytes === 0) reasons.push('empty output');
  if (stats && stats.frames !== undefined) {
    if (stats.frames < 2 && !opts.allowStatic) reasons.push(`not animated (${stats.frames} frame)`);
    if (opts.minWidth && stats.width < opts.minWidth) reasons.push(`width ${stats.width} < ${opts.minWidth}`);
    if (opts.maxKB && stats.bytes > opts.maxKB * 1024) reasons.push(`${Math.round(stats.bytes / 1024)} KB > ${opts.maxKB} KB`);
  }
  return { ok: reasons.length === 0, reasons };
}

function inspect(file, opts = {}) {
  const stats = statsFor(file, path.extname(file).slice(1).toLowerCase());
  return { file, stats, ...check(stats, opts) };
}

/* ---------- assemble: frames the duty session drew -> looping GIF ---------- */

function which(cmd) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return probe.status === 0;
}

function assemble({ frames, out, fps = DEFAULTS.fps, width, run = spawnSync }) {
  if (!frames) throw new Error('assemble needs --frames <dir or printf pattern such as frames/f%03d.png>');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const isPattern = frames.includes('%');
  const scale = width ? `scale=${width}:-1:flags=lanczos,` : '';
  if (which('ffmpeg')) {
    // Two passes: first normalise every frame to 8-bit RGB. ffmpeg 6.1's
    // palette filters silently keep one frame of a 16-bit RGBA sequence
    // (ImageMagick's default PNG depth), so never feed them raw frames.
    const input = isPattern ? ['-i', frames] : ['-pattern_type', 'glob', '-i', path.join(frames, '*.png')];
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'duty-visual-'));
    const norm = path.join(work, 'f%05d.png');
    try {
      const pass1 = run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), ...input, '-vf', 'format=rgb24', norm], { encoding: 'utf8' });
      if (pass1.status !== 0) throw new Error(`ffmpeg failed reading frames: ${(pass1.stderr || '').trim().split('\n')[0].slice(0, 200)}`);
      const pass2 = run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', norm,
        '-vf', `fps=${fps},${scale}split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, '-loop', '0', out], { encoding: 'utf8' });
      if (pass2.status !== 0) throw new Error(`ffmpeg failed writing the GIF: ${(pass2.stderr || '').trim().split('\n')[0].slice(0, 200)}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  } else if (which('convert')) {
    const inputs = isPattern ? [frames] : [path.join(frames, '*.png')];
    const args = ['-delay', String(Math.round(100 / fps)), '-loop', '0', ...inputs];
    if (width) args.push('-resize', `${width}x`);
    args.push(out);
    const r = run('convert', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ImageMagick convert failed: ${(r.stderr || '').trim().split('\n')[0].slice(0, 200)}`);
  } else {
    throw new Error('assemble needs ffmpeg or ImageMagick (convert) on this machine');
  }
  return { tier: 'subscription', out, stats: parseGif(fs.readFileSync(out)) };
}

/* ---------- generate: the paid route ---------- */

function buildRequest({ prompt, model = DEFAULTS.model, quality = DEFAULTS.quality, size = DEFAULTS.size, format = DEFAULTS.format }) {
  if (!prompt || !prompt.trim()) throw new Error('generate needs --prompt');
  if (!FORMATS.includes(format)) throw new Error(`--format must be one of ${FORMATS.join(', ')}`);
  return { model: MODELS[model] || model, prompt, output_format: format, size, quality, n: 1 };
}

async function generate(opts) {
  const { out, dryRun, fetchImpl = globalThis.fetch, apiKey = process.env.OPENAI_API_KEY || 'proxy-injected' } = opts;
  const format = opts.format || DEFAULTS.format;
  const body = buildRequest({ ...opts, format });
  if (dryRun) return { tier: 'api', dryRun: true, request: body, out };
  if (typeof fetchImpl !== 'function') throw new Error('this Node has no fetch; use Node 18 or newer');
  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_err) { /* not JSON: a gateway page */ }
  if (!res.ok) {
    const detail = (json && json.error && json.error.message) || text.slice(0, 200).replace(/\s+/g, ' ');
    const hint = res.status === 401 || res.status === 403
      ? ' — set OPENAI_API_KEY on this machine (in a cloud session, save a network secret for api.openai.com instead)'
      : res.status >= 500 ? ' — gateway error, retry once' : '';
    throw new Error(`images API ${res.status}: ${detail}${hint}`);
  }
  const item = json && json.data && json.data[0];
  if (!item || !item.b64_json) throw new Error('images API returned no image data');
  const buf = Buffer.from(item.b64_json, 'base64');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buf);
  const stats = format === 'gif' ? parseGif(buf) : { bytes: buf.length };
  return { tier: 'api', model: body.model, out, usage: json.usage || null, stats };
}

/* ---------- auto: subscription first, API only when the gate fails ---------- */

function shellQuote(s) {
  return process.platform === 'win32' ? `"${String(s).replace(/"/g, '""')}"` : `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function fillTemplate(template, values) {
  return template.replace(/\{(prompt|out)\}/g, (_m, k) => shellQuote(values[k]));
}

function runShell(cmd, env) {
  return spawnSync(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
}

async function auto(opts) {
  const { prompt, out, noApi, runner = runShell } = opts;
  const subscriptionCmd = opts.subscriptionCmd || process.env.DUTY_VISUAL_SUBSCRIPTION_CMD;
  const format = opts.format || DEFAULTS.format;
  const gate = { allowStatic: opts.allowStatic, minWidth: opts.minWidth, maxKB: opts.maxKB };
  const attempts = [];
  if (subscriptionCmd) {
    const r = runner(fillTemplate(subscriptionCmd, { prompt, out }), { DUTY_VISUAL_PROMPT: prompt, DUTY_VISUAL_OUT: out });
    if (r.status === 0 && fs.existsSync(out)) {
      const stats = statsFor(out, format);
      const verdict = check(stats, gate);
      attempts.push({ tier: 'subscription', ok: verdict.ok, reasons: verdict.reasons, stats });
      if (verdict.ok) return { tier: 'subscription', out, stats, attempts };
    } else {
      attempts.push({ tier: 'subscription', ok: false, reasons: [r.status === 0 ? 'command produced no output file' : `command exited ${r.status}`] });
    }
  } else {
    attempts.push({ tier: 'subscription', ok: false, reasons: ['DUTY_VISUAL_SUBSCRIPTION_CMD not set'] });
  }
  if (noApi) {
    throw new Error(`subscription route did not pass the gate (${attempts[attempts.length - 1].reasons.join('; ')}) and --no-api forbids the paid route`);
  }
  const result = await generate({ ...opts, format });
  const verdict = check(result.stats, gate);
  attempts.push({ tier: 'api', ok: verdict.ok, reasons: verdict.reasons, stats: result.stats });
  return { ...result, ok: verdict.ok, reasons: verdict.reasons, attempts };
}

/* ---------- one line for the growth log ---------- */

function logLine(r) {
  const s = r.stats || {};
  const dims = s.width ? `${s.width}x${s.height}` : '-';
  const frames = s.frames !== undefined ? `${s.frames} frames, ${s.loopSeconds}s loop` : 'static';
  const tokens = r.usage && typeof r.usage.total_tokens === 'number' ? r.usage.total_tokens : 0;
  return `visual | ${r.tier} | ${r.model || 'own work'} | ${dims} | ${frames} | ${Math.round((s.bytes || 0) / 1024)} KB | ${tokens} tokens | ${path.relative(process.cwd(), r.out)}`;
}

/* ---------- CLI ---------- */

const HELP = `
duty-visual — visuals for growth-duty shifts (subscription route first, paid API last)

Usage:
  node scripts/duty-visual.js assemble --frames <dir|pattern> --out demo.gif [--fps 8] [--width 640]
  node scripts/duty-visual.js inspect <file.gif> [--allow-static] [--min-width N] [--max-kb N]
  node scripts/duty-visual.js generate --prompt "..." --out demo.gif [--model flare|sunburst] [--quality medium] [--size auto|WxH] [--format gif|png|webp|jpeg] [--dry-run]
  node scripts/duty-visual.js auto --prompt "..." --out demo.gif [--subscription-cmd "<cmd with {prompt} {out}>"] [--no-api] [generate options]

The API key comes from OPENAI_API_KEY on this machine and is never printed. In a cloud
session with a saved network secret for api.openai.com the script sends a placeholder the
proxy replaces (the script re-runs itself with NODE_USE_ENV_PROXY=1 when HTTPS_PROXY is set).
--json prints the result as JSON; the last line otherwise is the growth-log line.
Exit codes: 0 ok, 1 error, 2 output failed the hard checks.
`;

function parseArgs(argv) {
  const args = { _: [] };
  const keyed = {
    '--prompt': 'prompt', '--out': 'out', '--model': 'model', '--quality': 'quality', '--size': 'size',
    '--format': 'format', '--frames': 'frames', '--fps': 'fps', '--width': 'width',
    '--subscription-cmd': 'subscriptionCmd', '--min-width': 'minWidth', '--max-kb': 'maxKB'
  };
  const flags = { '--dry-run': 'dryRun', '--json': 'json', '--no-api': 'noApi', '--allow-static': 'allowStatic', '--help': 'help', '-h': 'help' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (keyed[a]) args[keyed[a]] = argv[++i];
    else if (flags[a]) args[flags[a]] = true;
    else args._.push(a);
  }
  for (const n of ['fps', 'width', 'minWidth', 'maxKB']) if (args[n] !== undefined) args[n] = Number(args[n]);
  return args;
}

function defaultOut(format) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `visual-${stamp}.${format}`;
}

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (!cmd || args.help) { process.stdout.write(HELP); return 0; }
  const format = args.format || DEFAULTS.format;
  const emit = (result) => {
    if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      if (result.attempts) for (const a of result.attempts) process.stdout.write(`  ${a.tier}: ${a.ok ? 'passed' : 'failed'}${a.reasons && a.reasons.length ? ' (' + a.reasons.join('; ') + ')' : ''}\n`);
      if (result.request) process.stdout.write(JSON.stringify(result.request, null, 2) + '\n');
      else process.stdout.write(logLine(result) + '\n');
    }
  };

  if (cmd === 'inspect') {
    const file = args._[1];
    if (!file) throw new Error('inspect needs a file');
    const r = inspect(file, { allowStatic: args.allowStatic, minWidth: args.minWidth, maxKB: args.maxKB });
    if (args.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else process.stdout.write(`${file}: ${r.stats.width ? r.stats.width + 'x' + r.stats.height + ', ' : ''}${r.stats.frames !== undefined ? r.stats.frames + ' frames, ' + r.stats.loopSeconds + 's loop, ' : ''}${Math.round(r.stats.bytes / 1024)} KB — ${r.ok ? 'passes hard checks' : 'FAILS: ' + r.reasons.join('; ')}\n`);
    return r.ok ? 0 : 2;
  }
  if (cmd === 'assemble') {
    const r = assemble({ frames: args.frames, out: args.out || defaultOut('gif'), fps: args.fps, width: args.width });
    emit(r);
    return check(r.stats, { allowStatic: args.allowStatic }).ok ? 0 : 2;
  }
  if (cmd === 'generate') {
    const r = await generate({ ...args, format, out: args.out || defaultOut(format) });
    emit(r);
    if (r.dryRun) return 0;
    return check(r.stats, { allowStatic: args.allowStatic || format !== 'gif' }).ok ? 0 : 2;
  }
  if (cmd === 'auto') {
    const r = await auto({ ...args, format, out: args.out || defaultOut(format) });
    emit(r);
    return r.ok === false ? 2 : 0;
  }
  process.stderr.write(`unknown command: ${cmd}\n${HELP}`);
  return 1;
}

module.exports = { MODELS, API_URL, DEFAULTS, parseGif, statsFor, check, inspect, assemble, buildRequest, generate, auto, fillTemplate, logLine, parseArgs };

/*
 * Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set
 * before Node starts (Node >= 22.21). In a proxied environment (cloud sessions)
 * run ourselves once more with it set; on a machine without a proxy this is a no-op.
 */
function needsProxyReexec() {
  return Boolean(process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY;
}

if (require.main === module && needsProxyReexec()) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' }
  });
  process.exit(r.status === null ? 1 : r.status);
} else if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => { process.stderr.write(`duty-visual: ${err.message}\n`); process.exit(1); }
  );
}
