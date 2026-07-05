#!/usr/bin/env node
// KAEL smoke tests — boots an ISOLATED server instance (its own data dir, its
// own port; the real data/ is never touched) and exercises every endpoint that
// doesn't need a model reply. Run before deploying any server.js change:
//
//   node scripts/test.mjs
//
// Exit 0 = all passed. No test framework, no dependencies — same philosophy as
// the server itself.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fetch() refuses to send a forged Host header (exactly the attack a browser
// can't make either) — so the DNS-rebinding check needs a raw socket request.
function rawGet(port, pathName, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathName, headers: { Host: host } },
      (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.KAEL_TEST_PORT) || 3997;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const j = (r) => r.json().catch(() => null);

const dataDir = await mkdtemp(path.join(tmpdir(), 'kael-test-'));
console.log(`KAEL smoke tests — isolated instance on :${PORT}, data in ${dataDir}\n`);

const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    KAEL_DATA_DIR: dataDir,
    KAEL_HOST: '127.0.0.1',
    KAEL_PROVIDER: 'ollama',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d; });
child.stderr.on('data', (d) => { serverLog += d; });

// wait for the server to come up
let up = false;
for (let i = 0; i < 40 && !up; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try { up = (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
}
if (!up) {
  console.error('Server never came up. Log:\n' + serverLog);
  child.kill();
  process.exit(1);
}

try {
  // ---- health ----
  const h = await j(await fetch(`${BASE}/api/health`));
  check('health responds', h?.status === 'ok');
  check('health reports chatProfile', typeof h?.chatProfile === 'string');
  check('health reports localOnly', typeof h?.localOnly === 'boolean');

  // ---- DNS-rebinding guard ----
  const evilStatus = await rawGet(PORT, '/api/health', 'evil.example.com').catch(() => 0);
  check('evil Host header rejected (DNS rebinding)', evilStatus === 403, `got ${evilStatus}`);
  const goodStatus = await rawGet(PORT, '/api/health', `localhost:${PORT}`).catch(() => 0);
  check('legit Host header accepted', goodStatus === 200, `got ${goodStatus}`);

  // ---- profiles ----
  const p = await j(await fetch(`${BASE}/api/profiles`));
  check('profiles lists all five', p && ['fast', 'balanced', 'deep', 'coding', 'vision'].every((k) => p.profiles?.[k]));
  check('profiles default chatProfile=auto', p?.chatProfile === 'auto');
  const pSet = await fetch(`${BASE}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatProfile: 'fast' }) });
  check('profiles switch to fast', (await j(pSet))?.chatProfile === 'fast');
  const pBad = await fetch(`${BASE}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatProfile: 'galactic' }) });
  check('profiles rejects unknown profile', pBad.status === 400);
  const pVis = await fetch(`${BASE}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: 'vision', model: 'x' }) });
  check('profiles refuses vision override (lives in Awareness)', pVis.status === 400);
  const pGhost = await fetch(`${BASE}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: 'deep', model: 'definitely-not-installed-xyz' }) });
  check('profiles refuses non-installed override', pGhost.status === 400);
  const pCloud = await fetch(`${BASE}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: 'deep', model: 'gpt-oss:120b-cloud' }) });
  check('profiles refuses *-cloud override', pCloud.status === 400);

  // ---- memory v2 (fact objects + string back-compat) ----
  const mPost = await j(await fetch(`${BASE}/api/memory`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: ['plain string fact', { text: 'object fact', category: 'project' }] }),
  }));
  check('memory accepts strings and objects', mPost?.profile?.length === 2);
  check('memory normalizes string → fact object', mPost?.profile?.[0]?.text === 'plain string fact' && mPost?.profile?.[0]?.category === 'other');
  check('memory keeps object category', mPost?.profile?.[1]?.category === 'project');
  check('memory stamps addedAt', /^\d{4}-\d{2}-\d{2}$/.test(mPost?.profile?.[0]?.addedAt || ''));
  const mGet = await j(await fetch(`${BASE}/api/memory`));
  check('memory GET returns the facts', mGet?.profile?.length === 2);

  // ---- memory export ----
  const ex = await fetch(`${BASE}/api/memory/export`);
  check('export responds', ex.ok);
  check('export is a download', /attachment/.test(ex.headers.get('content-disposition') || ''));
  const exBody = await j(ex);
  check('export contains memory + tasks + schedules', exBody && exBody.memory && Array.isArray(exBody.tasks) && Array.isArray(exBody.schedules));

  // ---- local-only mode ----
  const cfg = await j(await fetch(`${BASE}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localOnly: true }) }));
  check('config sets localOnly', cfg?.localOnly === true);
  const claudeTry = await fetch(`${BASE}/api/provider`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'claude' }) });
  check('local-only blocks Claude switch', claudeTry.status === 403);
  const ttsTry = await fetch(`${BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hi' }) });
  check('local-only blocks premium TTS', [403, 503].includes(ttsTry.status));   // 503 if no key, 403 if key set
  await fetch(`${BASE}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localOnly: false }) });

  // ---- panic ----
  const panic = await j(await fetch(`${BASE}/api/panic`, { method: 'POST' }));
  check('panic responds ok', panic?.ok === true);
  check('panic turns local-only ON', panic?.localOnly === true);
  check('panic kills webcam/screen/awareness/training perms',
    panic && ['awareness', 'webcam', 'screen', 'training'].every((k) => panic.permissions?.[k] === false));
  const hAfter = await j(await fetch(`${BASE}/api/health`));
  check('awareness off after panic', hAfter?.awareness?.enabled === false);
  // panic's "stays off" must hold server-side: a stale client can't re-enable
  const reEnable = await fetch(`${BASE}/api/awareness`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
  check('awareness re-enable blocked after panic (server-side)', reEnable.status === 403);
  const cloudModel = await fetch(`${BASE}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-oss:120b-cloud' }) });
  check('cloud daily-driver blocked while local-only (from panic)', [400, 403].includes(cloudModel.status));   // 400 if Ollama down (not installed), 403 if up

  // ---- coach: snooze / feedback / nudge log / quiet hours ----
  const sn = await j(await fetch(`${BASE}/api/coach/snooze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: 30 }) }));
  check('snooze responds with until', sn?.ok === true && !!sn?.until);
  const coach = await j(await fetch(`${BASE}/api/coach`));
  check('coach reports snoozedUntil', !!coach?.snoozedUntil);
  const fb = await j(await fetch(`${BASE}/api/coach/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'test nudge that was wrong' }) }));
  check('feedback accepted', fb?.ok === true);
  const nl = await j(await fetch(`${BASE}/api/coach/nudges`));
  check('nudge log readable, contains feedback', Array.isArray(nl?.nudges) && nl.nudges.some((n) => n.type === 'feedback'));
  const qh = await j(await fetch(`${BASE}/api/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quietFrom: 23, quietTo: 8 }) }));
  check('quiet hours accepted', qh?.enabled !== undefined);
  const qhBad = await fetch(`${BASE}/api/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quietFrom: 99, quietTo: 8 }) });
  check('quiet hours rejects bad hour', qhBad.status === 400);
  const coach2 = await j(await fetch(`${BASE}/api/coach`));
  check('quiet hours persisted in coach state', coach2?.quietFrom === 23 && coach2?.quietTo === 8);
  await fetch(`${BASE}/api/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quietFrom: 22 }) });
  const coach3 = await j(await fetch(`${BASE}/api/coach`));
  check('one-field quiet-hours update keeps the other end', coach3?.quietFrom === 22 && coach3?.quietTo === 8);

  // ---- tasks + schedules still work (regression) ----
  const t = await j(await fetch(`${BASE}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'smoke test task' }) }));
  check('task add works', !!t?.task?.id);
  const s = await j(await fetch(`${BASE}/api/schedules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'smoke reminder', at: new Date(Date.now() + 3600000).toISOString() }) }));
  check('schedule add works', !!s?.schedule?.id);
  const rst = await j(await fetch(`${BASE}/api/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }));
  check('reset works', rst?.ok === true);

  // ---- config persistence survives (file actually written) ----
  const raw = JSON.parse(await readFile(path.join(dataDir, 'config.json'), 'utf8'));
  check('config.json persists localOnly (from panic)', raw?.localOnly === true);
  check('config.json persists profiles block', raw?.profiles?.chatProfile === 'fast');
  check('config.json persists quiet hours', raw?.coaching?.quietFrom === 22 && raw?.coaching?.quietTo === 8);
} catch (err) {
  failed++;
  console.error('  ✗ test run crashed:', err.message);
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
