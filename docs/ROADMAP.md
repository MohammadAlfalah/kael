# KAEL Roadmap — "everywhere, 24/7"

The end state: KAEL runs on one machine around the clock, and every screen you own — PC, phone, tablet, eventually glasses — is just a paired client of that one brain. This document is the honest path from where the code is today to that end state. No dates. Phases are ordered by dependency, not ambition.

**The rule that survives every phase:** the server stays one file (`server.js`, ~2,300 lines), the client stays one file (`public/index.html`), and the dependency list stays `express`, `@anthropic-ai/sdk`, `dotenv`. Every phase below says explicitly what does NOT change. Where a phase genuinely can't be done without a new dependency, that's called out as the decision it is — not smuggled in.

---

## Phase 0 — Always-on hub (DONE)

**Goal:** turn KAEL from a localhost page into a supervised, multi-device hub that survives crashes, reboots, and its own bugs.

Everything below is shipped and running. Grounded in the code, this is what exists:

- [x] **24/7 watchdog supervision** — `scripts/watchdog.mjs` spawns `server.js`, restarts on exit with exponential backoff (`BACKOFF_MIN_MS` 1s → `BACKOFF_MAX_MS` 60s cap, forgiven after `HEALTHY_RESET_MS` = 5 min of clean uptime), and polls `GET /api/health` every 60s — 3 consecutive failures means a hung process, which gets `taskkill /PID … /T /F` and a relaunch. Server output goes to `data/logs/server.log` (rotated at 5 MB), watchdog events to `data/logs/watchdog.log` as JSONL. A single-instance lock (`data/watchdog.lock`, pid + 30s heartbeat) stops two watchdogs fighting. `scripts/KAEL.vbs` in the Startup folder is the outer belt: it starts Ollama, opens the Edge `--app=http://localhost:3000` window once, and relaunches the watchdog itself if it ever dies.
- [x] **Device pairing + token auth** — an `app.use('/api', …)` middleware lets localhost through untouched (`isLocalReq()` checks `127.0.0.1` / `::1`) and demands a token from everyone else: `X-KAEL-Token` header, `?token=` query, or the `kael_token` cookie. Comparison is constant-time (`crypto.timingSafeEqual` in `tokenOk()`). The token comes from `KAEL_TOKEN` in `.env` or is auto-generated once (24 random bytes, base64url) and persisted to `data/auth.token`. `GET /api/pair` is localhost-only and hands out ready-made pairing links (`http://<lan-ip>:3000/?token=…`) built from `os.networkInterfaces()`; opening one on the phone sets an `HttpOnly; SameSite=Lax` cookie good for a year. A `remote_access` permission kill-switch 403s all non-local traffic.
- [x] **Cross-device PWA over LAN** — `public/manifest.webmanifest` + `public/sw.js` make KAEL installable. The service worker caches the shell (`kael-shell-v2`) network-first with cache fallback, and explicitly never touches `/api/*` or non-GET requests. Set `KAEL_HOST=0.0.0.0` and any device on the LAN can pair and install.
- [x] **SSE event bus** — `GET /api/events` holds one long-lived stream per device (the `sseClients` Set); `broadcast(type, data)` pushes `{ type, at, ...payload }` to all of them. A 25s `health.heartbeat` keeps proxies from timing the stream out. Everything proactive rides this bus: `task.changed`, `schedule.changed` / `schedule.fired` / `schedule.skipped`, `permissions.changed`, `plan.started` / `plan.step` / `plan.done`, `coach.nudge`, `provider.changed`. The client reconnects itself with an 8s delay after a network flip, because mobile browsers don't always auto-reconnect EventSource.
- [x] **Scheduler** — reminders and routines in `data/schedules.json`, ticked every 30s (`scheduleTick()`). One-offs take an ISO `at`; recurrences are `daily` / `weekly` / `interval` computed by `computeNextAt()` in the server's local timezone. Due jobs broadcast `schedule.fired` and land in the transcript; jobs missed by more than `SCHEDULE_MISSED_GRACE` (6 h — KAEL was off) are skipped with a `schedule.skipped` note instead of being blurted hours late. CRUD via `GET/POST /api/schedules` and `POST/DELETE /api/schedules/:id`; chat extraction feeds `addSchedule()` too.
- [x] **Permissions switchboard** — ten boolean capability keys (`remote_access`, `web_search`, `paid_claude`, `paid_tts`, `awareness`, `webcam`, `screen`, `training`, `scheduler`, `planner`), all defaulting to ON, persisted in `data/permissions.json`, read/written via `GET/POST /api/permissions`. Enforcement lives where the capability lives: server-side for search, paid APIs, scheduler, planner, remote access; client-side for webcam/screen (where the browser capture happens). Changes broadcast `permissions.changed` so every open device's UI updates.
- [x] **Planner** — `POST /api/plan` streams SSE progress while decomposing a goal into ≤5 steps over a fixed tool set (`search` / `remember` / `task` / `remind` / `answer`), executes them sequentially via `runPlanStep()`, then synthesizes a spoken answer from what was gathered. One plan at a time (`activePlan` guard → 409). Every run is appended to `data/plans.jsonl`; `GET /api/plans` returns the last 20.
- [x] **Backups + crash recovery** — `backupDataStores()` copies the six small JSON stores (memory, config, tasks, awareness-learned, schedules, permissions) into `data/backups/YYYY-MM-DD/` daily, keeping `BACKUP_KEEP_DAYS` = 7. `initServerLock()` writes `data/server.lock` with a 30s heartbeat; if a fresh boot finds the lock still there, the previous run died unclean and `/api/health` reports `recoveredFromCrash: true`. Clean exits (`SIGINT`/`SIGTERM`) unlink the lock.
- [x] **Observability** — `GET /api/health` reports `supervised` (is the watchdog's lock heartbeat fresh), `recoveredFromCrash`, `devices` (live SSE connections), `scheduler.nextAt`, Ollama/model status, and `exposure.authRequired`.

**What did NOT change:** single-file server, single-file client, zero new dependencies. All five always-on subsystems reuse the same load-once / atomic temp-file-then-rename save pattern the memory system already used.

---

## Phase 1 — Off the LAN (near)

**Goal:** reach KAEL from anywhere — phone on mobile data, university WiFi — and have it tap you on the shoulder even when no tab is open.

### 1a. Remote access: Tailscale, not port-forwarding

Tailscale is the sane path: it builds a WireGuard mesh between your devices with zero open ports, so KAEL is reachable at a stable `100.x.y.z` address from anywhere without ever being exposed to the public internet. Port-forwarding, by contrast, would publish a plain-HTTP server — with the pairing token traveling in cleartext and every scanner on the internet free to probe it — and raw WireGuard, while equivalent on the wire, makes you hand-manage keys, IPs, and NAT traversal that Tailscale does for free. The kicker: `GET /api/pair` already enumerates non-internal IPv4 interfaces, and Tailscale presents itself as exactly that — the `100.x` pairing link shows up in Settings → Devices automatically, no code change.

- [ ] Install Tailscale on the PC and phone, same tailnet.
- [ ] Keep `KAEL_HOST=0.0.0.0` (or bind to the Tailscale IP specifically if you want LAN access off).
- [ ] Pair the phone using the `100.x` link from `/api/pair` — token auth applies to Tailscale traffic exactly as to LAN traffic, since only `127.0.0.1` bypasses the middleware.
- [ ] Optional hardening: turn `remote_access` off in the switchboard when traveling isn't happening.

**Prerequisites:** none — Phase 0 shipped everything this needs.

### 1b. Push notifications when no tab is open

Right now `schedule.fired` and `coach.nudge` only reach devices with a live `/api/events` stream — an open tab. Web Push fixes that, but the real constraints have to be spelled out honestly:

1. **HTTPS is mandatory.** Service workers and the Push API require a secure context. `http://192.168.x.x` and `http://100.x.y.z` are not secure contexts — which also means, today, the remote phone gets the page but not the full service-worker-backed PWA (the `navigator.serviceWorker` check in `index.html` silently no-ops). The clean fix is `tailscale cert`, which issues a real Let's Encrypt certificate for the machine's `*.ts.net` name — HTTPS without exposing anything publicly. This unlocks both push and proper PWA install on remote devices in one move.
2. **VAPID + the Web Push protocol.** The server needs a VAPID keypair, must store each device's push subscription (a new `data/push-subscriptions.json`, same save pattern), and must send RFC 8291-encrypted payloads (ECDH + HKDF + aes128gcm) with a VAPID JWT to the browser vendor's push service. Hand-rolling that with `node:crypto` is possible but genuinely fiddly; the `web-push` npm package is the pragmatic answer — and it would be the first new dependency since the project started. Take it as a deliberate exception or budget the crypto work.
3. **Push routes through Google/Mozilla/Apple servers.** Payloads are end-to-end encrypted, but the fact that a notification happened leaves the machine. For a local-first project that's a disclosed trade, same category as the cloud coach model.
4. **iOS is late to the party.** Web Push on iOS requires the PWA to be installed to the home screen (16.4+); a Safari tab won't get pushes.

- [ ] `tailscale cert` + serve HTTPS (Node `https.createServer` with the cert — small change, still one file).
- [ ] Add `POST /api/push/subscribe` + `data/push-subscriptions.json`.
- [ ] Wire `broadcast()` so bus events that matter (`schedule.fired`, `coach.nudge`) also fan out as push messages to subscribed devices with no live SSE stream.
- [ ] Add a `push` handler + `notificationclick` to `sw.js`.
- [ ] Decide: `web-push` dependency, or hand-rolled RFC 8291.

**Prerequisites:** 1a (HTTPS via Tailscale is the enabler).

### 1c. Wake word — research track

Today the mic modes are hold-to-talk and open-mic; the code comment in `index.html` says it plainly: "No wake word." Two credible on-device options:

- **openWakeWord** — open source (Apache-2.0), ONNX models, and a pre-trained community "hey jarvis" model that is almost comically on-brand. Python-first, though; running it in the browser means porting the melspectrogram + embedding pipeline to `onnxruntime-web`. Realistic as a small local sidecar process feeding the existing open-mic path, less realistic purely in-page.
- **Porcupine (Picovoice)** — commercial with a free tier, official WASM Web SDK that runs entirely in the browser, and custom keywords ("Hey KAEL") trainable in their console. Caveat: it needs an AccessKey that phones home for license validation — on-device inference, but not zero-network.

- [ ] Prototype Porcupine's web SDK inside the existing open-mic mode (client-only change).
- [ ] Benchmark openWakeWord's "hey jarvis" model as a sidecar on the PC.
- [ ] Decide based on false-accept rate at desk distance, not vendor preference.

**Prerequisites:** none; purely client-side (or a sidecar).

**What does NOT change in Phase 1:** `server.js` stays one file — HTTPS and push subscribe/send are additive routes and one listener change. The auth model is untouched: Tailscale is transport, the token is still the identity. No client rewrite; the wake word slots into the existing mic-mode switch.

---

## Phase 2 — Android native (when the PWA ceiling is hit)

**Goal:** KAEL on the phone that keeps listening and keeps notifying with the screen off.

### The PWA-first argument

Don't wrap anything until the PWA actually falls short. After Phase 1, the installed PWA over Tailscale+HTTPS gives: full-screen app, voice in/out (Web Speech API works in Chrome Android), live SSE sync, web push notifications, offline shell. That covers "check in with KAEL from the couch" completely. The PWA ceiling is specific and predictable:

- **Background audio/mic:** Android kills background tabs; continuous listening or wake-word detection with the screen off is not a thing a PWA gets to do.
- **Audio focus:** a PWA can't properly duck other audio or hold focus during long TTS.
- **Notification reliability:** web push is best-effort and OEM battery managers eat it; a native foreground service does not get eaten.

### The Capacitor wrap

When (not if) those bite, Capacitor is the honest wrapper: the same `public/index.html` runs in a WebView, and native plugins cover exactly the gaps.

- [ ] Capacitor shell project pointing its WebView at the KAEL origin (Tailscale HTTPS URL).
- [ ] Foreground service (persistent notification) for continuous mic / wake word with screen off.
- [ ] Audio-focus handling around TTS playback.
- [ ] Native notifications fed from the SSE bus (the app holds the `/api/events` stream open in the service).
- [ ] Keep using `?token=` for EventSource (it can't set headers anywhere, WebView included); `fetch` calls can use `X-KAEL-Token` from secure storage.

**What changes server-side: nothing.** The Capacitor app is just another paired device presenting the same token to the same routes. That was the whole point of Phase 0's auth design.

**What changes client-side:** audio focus, foreground service, notification plumbing — wrapper concerns. `index.html` itself needs at most feature-detection branches.

**Prerequisites:** Phase 1a (the app needs a stable URL from anywhere), ideally 1c (wake word is the main reason to want background mic).

---

## Phase 3 — AR glasses (a paired device, not a platform port)

**Goal:** KAEL's nudges and reminders in your field of view; push-to-talk chat without pulling out the phone.

### The realistic paths in 2026

- **Even Realities / Vuzix (Z100-class) — the practical HUD path.** These are BLE companion devices: a phone app pushes text (and simple bitmaps) to a monochrome HUD via the vendor SDK. No browser on the glasses, no app runtime — the phone is the bridge. This matches KAEL's needs almost exactly, because KAEL's proactive output is already short text on an event bus.
- **WebXR in-browser** — real for headsets (Quest-class passthrough), but that's a different product category; HUD smart glasses don't ship a WebXR browser. Worth a weekend demo on a headset, not the roadmap's main line.
- **Meta Ray-Ban — closed.** No third-party runtime on the glasses; Meta's wearable device-access toolkit preview may loosen this, but you don't control the runtime or the roadmap. Not a path to build on today.

### What KAEL's architecture already gives

This is the payoff of Phase 0: a glasses client is *just another paired device*. The bridge app authenticates with the same token (`?token=` on the EventSource, since EventSource can't set headers — the client already does exactly this), holds `GET /api/events` open, and forwards `schedule.fired` / `coach.nudge` / `task.changed` text to the HUD. Chat is `POST /api/chat` SSE, same as every other client. Zero server changes; the event catalogue was designed to be consumed by anything.

### Minimal glasses MVP spec

- [ ] Phone bridge app (or a mode inside the Phase 2 Capacitor app) that subscribes to `/api/events` and renders to the HUD via the vendor SDK:
  - `schedule.fired` → full text, held ~10s ("⏰ Reminder: …" exactly as the transcript records it).
  - `coach.nudge` → one line, dismiss on tap.
  - `schedule.skipped` → suppressed on the HUD (a missed-while-off note is desk information, not eyewear information).
- [ ] PTT chat: hardware button on the glasses (or phone) → phone does STT → `POST /api/chat` → first sentence of the streamed reply to the HUD, full reply optionally spoken through the phone.
- [ ] Nothing else. No task panel, no settings, no memory browser on a 640-pixel monochrome HUD.

**Prerequisites:** Phase 1a (the bridge needs KAEL reachable from the phone anywhere), Phase 2's bridge plumbing if the Capacitor app exists by then.

**What does NOT change:** `server.js` — genuinely zero lines. The glasses MVP is a pure consumer of existing routes and events.

---

## Phase 4 — Multi-machine (one brain, several PCs)

**Goal:** sit down at the desktop, the laptop, or any machine, and it's the same KAEL — same memory, same tasks, same schedules.

### The two tempting answers, and why they lose

**Data-dir sync (Syncthing on `data/`).** Looks free, breaks subtly. Two servers appending `transcript.jsonl` and rewriting `memory.json` concurrently produce sync conflicts the code has no merge logic for — the atomic temp-file-then-rename saves protect against crashes on ONE machine, not against two writers. `server.lock`, `watchdog.lock`, and `auth.token` are per-machine runtime state that must never sync. And two live schedulers both pass `scheduleTick()`, so every reminder fires twice, once per machine. Syncing the directory means running one server at a time and syncing between runs — at which point it's a worse version of the honest answer below.

**Primary/replica.** A real replication protocol — change feeds, conflict resolution, leader election — is hundreds of lines of distributed-systems code that would dominate the file it lives in. That's a different project wearing KAEL's name.

### The honest answer: primary with remote access

One machine is KAEL — the one with the GPU for Ollama, the watchdog, the autostart. Every other machine is a client: a browser tab or installed PWA pointed at the primary over Tailscale (Phase 1a). This is not a compromise; it's the architecture working as designed. The laptop gets the same memory, tasks, scheduler, and event stream because there is only one of each, and cross-device sync already works — it's the SSE bus.

- [ ] Declare the primary (the always-on PC) and keep the watchdog + autostart only there.
- [ ] Every other machine: pair via `/api/pair` link, install the PWA, done.
- [ ] Document the promotion procedure for when the primary changes machines: stop the watchdog, copy `data/` (excluding `server.lock`, `watchdog.lock`, `logs/`), set `KAEL_DATA_DIR` if the path differs — the env var already exists for exactly this — start the watchdog on the new machine.
- [ ] Optional quality-of-life: a localhost-only `GET /api/export` that zips the small stores + transcript for one-click migration and off-machine backup. One route, no dependencies (a plain tar-style concatenation or store-only zip is doable with `node:zlib`).

**Prerequisites:** Phase 1a. That's it — this phase is mostly a decision plus documentation.

**What does NOT change:** everything. No replication code, no second server, no new storage engine. The single-file philosophy is the *reason* this answer is available: one process owns the data dir, and every other machine talks to it.

---

## Order of operations

1. **Tailscale (1a)** — an afternoon, unlocks everything else.
2. **HTTPS + Web Push (1b)** — the first real decision point (the `web-push` dependency question).
3. **Wake-word prototype (1c)** — parallel research track, client-only.
4. **Capacitor (2)** — only when the PWA ceiling is actually hit in daily use.
5. **Glasses MVP (3)** — when hardware is in hand; the server is already ready.
6. **Multi-machine (4)** — a documentation task once 1a exists.

What this roadmap deliberately does not contain: user accounts (KAEL is single-user by design — the token authenticates *devices*, not people), a database (six JSON files and two JSONL logs are the right size for one human's life), horizontal scaling, or a plugin system. The moment any of those looks necessary, the question isn't "how" — it's "did KAEL stop being KAEL."
