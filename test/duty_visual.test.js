'use strict';

/*
 * scripts/duty-visual.js is maintainer tooling (not shipped in the npm package)
 * with a cost policy baked in: the subscription route first, the paid images
 * API only when that output fails the gate. These tests never touch the
 * network and never need a key.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dv = require('../scripts/duty-visual');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'duty-visual.js');

/** A structurally valid GIF with N frames; pixels are junk, which the parser never decodes. */
function syntheticGif({ frames = 2, delayCs = 10, w = 4, h = 4 } = {}) {
  const parts = [Buffer.from('GIF89a', 'latin1'), Buffer.from([w, 0, h, 0, 0x00, 0, 0])];
  for (let k = 0; k < frames; k++) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, delayCs & 255, delayCs >> 8, 0x00, 0x00]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, w, 0, h, 0, 0x00]));
    parts.push(Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ncg-visual-'));
}

function fakeFetch(reply, status = 200) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, text: async () => JSON.stringify(reply) };
  };
  fn.calls = calls;
  return fn;
}

const neverFetch = async () => { throw new Error('the paid API must not be called here'); };

test('parseGif counts frames and loop length without decoding pixels', () => {
  const s = dv.parseGif(syntheticGif({ frames: 3, delayCs: 20, w: 8, h: 6 }));
  assert.deepEqual(s, { width: 8, height: 6, frames: 3, loopSeconds: 0.6, bytes: 13 + 3 * 23 + 1 });
  assert.throws(() => dv.parseGif(Buffer.from('not a gif at all, really')), /not a GIF/);
});

test('the hard gate: a single-frame GIF fails unless static output is allowed', () => {
  const still = dv.parseGif(syntheticGif({ frames: 1 }));
  assert.equal(dv.check(still).ok, false);
  assert.match(dv.check(still).reasons[0], /not animated/);
  assert.equal(dv.check(still, { allowStatic: true }).ok, true);
  const moving = dv.parseGif(syntheticGif({ frames: 2, w: 4 }));
  assert.equal(dv.check(moving, { minWidth: 512 }).ok, false);
  assert.equal(dv.check(moving).ok, true);
});

test('inspect reads a file and the CLI reports it', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'x.gif');
  fs.writeFileSync(file, syntheticGif({ frames: 2 }));
  assert.equal(dv.inspect(file).ok, true);
  const out = spawnSync(process.execPath, [SCRIPT, 'inspect', file], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /2 frames/);
  fs.writeFileSync(file, syntheticGif({ frames: 1 }));
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'inspect', file], { encoding: 'utf8' }).status, 2);
});

test('generate --dry-run builds the request for gpt-image-2.6 and sends nothing', async () => {
  const r = await dv.generate({ prompt: 'a looping shield', out: 'x.gif', dryRun: true, fetchImpl: neverFetch });
  assert.deepEqual(r.request, { model: 'gpt-image-2.6-flare', prompt: 'a looping shield', output_format: 'gif', size: 'auto', quality: 'medium', n: 1 });
  const cli = spawnSync(process.execPath, [SCRIPT, 'generate', '--prompt', 'x', '--model', 'sunburst', '--dry-run', '--json'],
    { encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '' } });
  assert.equal(cli.status, 0);
  assert.equal(JSON.parse(cli.stdout).request.model, 'gpt-image-2.6-sunburst');
  assert.rejects(() => dv.generate({ prompt: '', out: 'x.gif', dryRun: true }), /needs --prompt/);
});

test('generate writes the decoded image, returns usage, and sends the key only in the header', async () => {
  const dir = tmpdir();
  const gif = syntheticGif({ frames: 9, delayCs: 20 });
  const fetchImpl = fakeFetch({ data: [{ b64_json: gif.toString('base64') }], usage: { total_tokens: 2194 } });
  const out = path.join(dir, 'sub', 'api.gif');
  const r = await dv.generate({ prompt: 'p', out, model: 'flare', fetchImpl, apiKey: 'test-only-secret' });
  assert.ok(fs.readFileSync(out).equals(gif));
  assert.equal(r.tier, 'api');
  assert.equal(r.model, 'gpt-image-2.6-flare');
  assert.equal(r.usage.total_tokens, 2194);
  assert.equal(r.stats.frames, 9);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, dv.API_URL);
  assert.equal(fetchImpl.calls[0].init.headers.authorization, 'Bearer test-only-secret');
  assert.doesNotMatch(fetchImpl.calls[0].init.body, /test-only-secret/);
  assert.match(dv.logLine(r), /^visual \| api \| gpt-image-2\.6-flare \| 4x4 \| 9 frames, 1\.8s loop \| \d+ KB \| 2194 tokens \| /);
});

test('generate explains a 401 without echoing the key', async () => {
  const fetchImpl = fakeFetch({ error: { message: 'Incorrect API key provided' } }, 401);
  await assert.rejects(
    () => dv.generate({ prompt: 'p', out: path.join(tmpdir(), 'x.gif'), fetchImpl, apiKey: 'test-only-secret' }),
    (err) => /images API 401: Incorrect API key provided/.test(err.message) && /OPENAI_API_KEY/.test(err.message) && !/test-only-secret/.test(err.message)
  );
});

test('auto: a subscription command whose output passes the gate never touches the API', async () => {
  const out = path.join(tmpdir(), 'own.gif');
  const runner = (cmd, env) => {
    assert.match(cmd, /own-generator/);
    assert.equal(env.DUTY_VISUAL_PROMPT, 'draw it');
    fs.writeFileSync(env.DUTY_VISUAL_OUT, syntheticGif({ frames: 4 }));
    return { status: 0 };
  };
  const r = await dv.auto({ prompt: 'draw it', out, subscriptionCmd: 'own-generator {prompt} {out}', runner, fetchImpl: neverFetch });
  assert.equal(r.tier, 'subscription');
  assert.equal(r.stats.frames, 4);
  assert.deepEqual(r.attempts.map((a) => [a.tier, a.ok]), [['subscription', true]]);
  assert.match(dv.logLine(r), /^visual \| subscription \| own work \| 4x4 \| 4 frames/);
});

test('auto: a failing subscription command falls back to the API and records both attempts', async () => {
  const out = path.join(tmpdir(), 'fallback.gif');
  const fetchImpl = fakeFetch({ data: [{ b64_json: syntheticGif({ frames: 2 }).toString('base64') }], usage: { total_tokens: 10 } });
  const r = await dv.auto({ prompt: 'p', out, subscriptionCmd: 'exit 1', runner: () => ({ status: 1 }), fetchImpl, apiKey: 'k' });
  assert.equal(r.tier, 'api');
  assert.deepEqual(r.attempts.map((a) => [a.tier, a.ok]), [['subscription', false], ['api', true]]);
  assert.match(r.attempts[0].reasons[0], /exited 1/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('auto: without a subscription command the reason is recorded; --no-api refuses the paid route', async () => {
  const out = path.join(tmpdir(), 'static.gif');
  const runner = (_cmd, env) => { fs.writeFileSync(env.DUTY_VISUAL_OUT, syntheticGif({ frames: 1 })); return { status: 0 }; };
  await assert.rejects(
    () => dv.auto({ prompt: 'p', out, subscriptionCmd: 'still-image {out}', runner, noApi: true, fetchImpl: neverFetch }),
    /not animated.*--no-api/
  );
  const fetchImpl = fakeFetch({ data: [{ b64_json: syntheticGif({ frames: 2 }).toString('base64') }] });
  const r = await dv.auto({ prompt: 'p', out, subscriptionCmd: '', fetchImpl, apiKey: 'k' });
  assert.match(r.attempts[0].reasons[0], /DUTY_VISUAL_SUBSCRIPTION_CMD not set/);
  assert.equal(r.tier, 'api');
});

test('fillTemplate quotes the prompt and output path for the shell', () => {
  const cmd = dv.fillTemplate('gen {prompt} > {out}', { prompt: "it's a loop", out: '/tmp/a b.gif' });
  if (process.platform === 'win32') assert.equal(cmd, 'gen "it\'s a loop" > "/tmp/a b.gif"');
  else assert.equal(cmd, "gen 'it'\\''s a loop' > '/tmp/a b.gif'");
});

test('assemble turns a frame sequence into a looping GIF', (t) => {
  const hasFfmpeg = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg']).status === 0;
  if (!hasFfmpeg) { t.skip('ffmpeg not installed'); return; }
  const dir = tmpdir();
  const frames = path.join(dir, 'frames');
  fs.mkdirSync(frames);
  for (const [i, colour] of ['red', 'green', 'blue'].entries()) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${colour}:s=32x32`, '-frames:v', '1', path.join(frames, `f${String(i).padStart(3, '0')}.png`)]);
    assert.equal(r.status, 0, 'ffmpeg could not draw a frame');
  }
  const out = path.join(dir, 'own.gif');
  const r = dv.assemble({ frames, out, fps: 5 });
  assert.equal(r.tier, 'subscription');
  assert.equal(r.stats.frames, 3);
  assert.equal(r.stats.width, 32);
  assert.equal(r.stats.loopSeconds, 0.6);
  assert.equal(dv.check(r.stats).ok, true);
});
