// KAEL watchdog — keeps the hub alive 24/7.
//
// The old autostart just relaunched node in a dumb loop: a crash-loop would spin
// forever, and a HUNG server (process alive, not answering) never got restarted.
// This supervisor fixes both:
//   - restarts on exit with exponential backoff (1s → 60s cap), backoff resets
//     after 5 minutes of healthy uptime, so a one-off crash recovers instantly
//     but a broken build doesn't melt the CPU
//   - polls /api/health every 60s; 3 consecutive failures = hung → kill + restart
//   - captures the server's stdout/stderr to data/logs/server.log, rotated at a
//     size cap even during long healthy runs (the watchdog owns the pipe)
//   - writes a JSONL event log to data/logs/watchdog.log (restarts, reasons)
//   - single-instance lock via data/watchdog.lock (pid + heartbeat)
//
// Run it from the repo root (the autostart VBS does):  node scripts/watchdog.mjs
// Stop everything: kill the watchdog — it takes the server down with it.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Read the SAME .env the server reads, so PORT / KAEL_HOST / KAEL_HEALTH_* here
// match what the server actually binds — otherwise we'd health-check the wrong
// address and kill a perfectly healthy server on a loop. (Node 21.7+/24.)
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env — defaults are fine */ }

// Same data-dir resolution as server.js, so the lock + logs land where the
// server looks for them (health reports `supervised` by reading watchdog.lock).
const DATA_DIR = process.env.KAEL_DATA_DIR ? path.resolve(process.env.KAEL_DATA_DIR) : path.join(ROOT, 'data');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const SERVER_LOG = path.join(LOG_DIR, 'server.log');
const WATCH_LOG = path.join(LOG_DIR, 'watchdog.log');
const LOCK = path.join(DATA_DIR, 'watchdog.lock');
const PORT = Number(process.env.PORT || 3000);
// The server binds KAEL_HOST; probe that exact address (loopback for the usual
// localhost/0.0.0.0 binds, the specific IP when it's pinned to one).
const HOST = process.env.KAEL_HOST || '127.0.0.1';
const HEALTH_HOST = (HOST === '0.0.0.0' || HOST === '::' || HOST === '127.0.0.1') ? '127.0.0.1' : HOST;

const HEALTH_EVERY_MS = Number(process.env.KAEL_HEALTH_EVERY_MS || 60_000);
const HEALTH_TIMEOUT_MS = Number(process.env.KAEL_HEALTH_TIMEOUT_MS || 10_000);
const HEALTH_FAILS_TO_RESTART = 3;
const BACKOFF_MIN_MS = 1_000, BACKOFF_MAX_MS = 60_000;
const HEALTHY_RESET_MS = 5 * 60_000;          // this long up = forgive past crashes
const SERVER_LOG_CAP = 5 * 1024 * 1024;        // rotate server.log at 5 MB
const WATCH_LOG_CAP = 1 * 1024 * 1024;

fs.mkdirSync(LOG_DIR, { recursive: true });

function rotate(file, cap) {
  try { if (fs.existsSync(file) && fs.statSync(file).size > cap) fs.renameSync(file, file + '.1'); } catch {}
}
function wlog(event, detail = '') {
  rotate(WATCH_LOG, WATCH_LOG_CAP);
  const line = JSON.stringify({ ts: new Date().toISOString(), event, detail }) + '\n';
  try { fs.appendFileSync(WATCH_LOG, line); } catch {}
  process.stdout.write(`[watchdog] ${event} ${detail}\n`);
}

// ---- single instance: refuse to run if another live watchdog holds the lock ----
try {
  const old = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const fresh = Date.now() - (old.heartbeat || 0) < 90_000;
  if (fresh && old.pid !== process.pid) {
    try { process.kill(old.pid, 0); wlog('duplicate-exit', `live watchdog pid ${old.pid} holds the lock`); process.exit(0); }
    catch { /* stale pid — take over */ }
  }
} catch { /* no/corrupt lock — take over */ }
const writeLock = () => { try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, heartbeat: Date.now() })); } catch {} };
writeLock();
setInterval(writeLock, 30_000).unref();

// ---- child lifecycle ----
let child = null, restarts = 0, startedAt = 0, healthFails = 0, stopping = false, logStream = null;

function openLog() { logStream = fs.createWriteStream(SERVER_LOG, { flags: 'a' }); }
function pipeChild() {
  if (!child || !logStream) return;
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
}
// Rotate the server log WHILE the server runs (not just at restart) so a months-
// long healthy uptime can't grow it without bound.
function checkServerLog() {
  try {
    if (!logStream || !child || child.exitCode !== null) return;
    if (!fs.existsSync(SERVER_LOG) || fs.statSync(SERVER_LOG).size <= SERVER_LOG_CAP) return;
    child.stdout.unpipe(logStream); child.stderr.unpipe(logStream);
    logStream.end();
    try { fs.renameSync(SERVER_LOG, SERVER_LOG + '.1'); } catch {}
    openLog(); pipeChild();
  } catch {}
}

function start() {
  rotate(SERVER_LOG, SERVER_LOG_CAP);
  openLog();
  child = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  pipeChild();
  startedAt = Date.now();
  healthFails = 0;
  wlog('start', `pid ${child.pid} (restart #${restarts})`);
  child.on('exit', (code, signal) => {
    try { logStream?.end(); } catch {}
    logStream = null;
    if (stopping) return;
    const upMs = Date.now() - startedAt;
    if (upMs > HEALTHY_RESET_MS) restarts = 0;          // it ran fine for a while — clean slate
    const delay = Math.min(BACKOFF_MIN_MS * 2 ** restarts, BACKOFF_MAX_MS);
    restarts++;
    wlog('exit', `code=${code} signal=${signal} up=${Math.round(upMs / 1000)}s — relaunch in ${delay / 1000}s`);
    setTimeout(start, delay);
  });
}

function killChild(reason) {
  if (!child || child.exitCode !== null) return;
  wlog('kill', reason);
  try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); }  // Windows: kill the whole tree
  catch { try { child.kill('SIGKILL'); } catch {} }
}

// ---- hung-server detection ----
async function healthCheck() {
  checkServerLog();
  if (!child || child.exitCode !== null) return;      // exit handler owns restarts
  if (Date.now() - startedAt < 20_000) return;        // grace period while booting
  try {
    const res = await fetch(`http://${HEALTH_HOST}:${PORT}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    healthFails = 0;
  } catch (e) {
    healthFails++;
    wlog('health-fail', `${healthFails}/${HEALTH_FAILS_TO_RESTART}: ${e.message}`);
    if (healthFails >= HEALTH_FAILS_TO_RESTART) killChild('hung — failed health checks');  // exit handler relaunches
  }
}
setInterval(healthCheck, HEALTH_EVERY_MS).unref();

// ---- clean shutdown: take the server with us ----
function shutdown() {
  stopping = true;
  wlog('shutdown', 'watchdog stopping — killing server');
  killChild('watchdog shutdown');
  try { fs.unlinkSync(LOCK); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

wlog('boot', `supervising server.js on ${HEALTH_HOST}:${PORT} (health every ${HEALTH_EVERY_MS / 1000}s)`);
start();
