# KAEL API Specification

The complete HTTP interface of `server.js` — every route, every payload, every event. All 40 routes live in the single Express app; there is no versioned URL prefix. The wire protocol for the three Server-Sent-Events streams (`/api/events`, `/api/chat`, `/api/plan`) is specified at the bottom as **KAEL Protocol v1**.

**Base URL:** `http://127.0.0.1:3000` (port from `PORT`, host from `KAEL_HOST` — default `127.0.0.1`). When `KAEL_HOST=0.0.0.0`, other devices reach it at `http://<lan-ip>:3000` and must be paired (see Authentication).

**Conventions**

- All request bodies are JSON (`Content-Type: application/json`). The body parser accepts up to **12 MB** (sized for the base64 frames `/api/awareness/observe` receives).
- All non-streaming responses are JSON. Errors are always `{ "error": "<human-readable message>" }` with an appropriate status code.
- Streaming endpoints (`/api/chat`, `/api/plan`, `/api/events`) speak data-only SSE: each frame is one `data: <json>\n\n` line. `/api/tts` streams raw `audio/mpeg` bytes.
- Everything outside `/api/*` is static file serving from `public/` (the PWA shell). **Static files are not behind auth** — the middleware mounts only at `/api`.

---

## Authentication

One middleware guards every `/api/*` route (`app.use('/api', …)`, server.js ~line 599):

1. **Localhost is trusted.** `isLocalReq()` checks `req.socket.remoteAddress` against `127.0.0.1`, `::1`, `::ffff:127.0.0.1`. Local requests pass with zero configuration — the desktop never sees a token.
2. **Remote requests need the device token**, presented as any of:
   - `X-KAEL-Token` request header
   - `?token=<token>` query parameter (what the pairing link uses; also how `EventSource` authenticates, since it can't set headers)
   - `kael_token` cookie (set automatically on any successful token auth: `HttpOnly; SameSite=Lax; Max-Age=31536000; Path=/`)

   Comparison is constant-time (`crypto.timingSafeEqual` in `tokenOk()`).
3. **Kill switch:** if `permissions.remote_access` is `false`, every non-local request gets `403` regardless of token.

The token itself comes from `KAEL_TOKEN` in `.env`, or is auto-generated once (24 random bytes, base64url) and persisted to `data/auth.token` by `loadAuthToken()`.

**Auth error responses**

| Status | When | Body |
|---|---|---|
| `401` | Remote request, no/wrong token | `{"error":"This device isn't paired with KAEL yet. Open Settings → Devices on the PC for the pairing link."}` |
| `403` | Remote request while `remote_access` is off | `{"error":"Remote access is switched off in KAEL's permissions."}` |

In the per-route tables below, **auth: standard** means exactly this middleware (localhost free, remote needs token). Only `/api/pair` is stricter.

---

## Chat

### POST `/api/chat` — SSE

Send one user message; the reply streams back token-by-token. Auth: standard.

**Interrupt semantics:** at most one turn streams at a time, but a new request *interrupts* the in-flight one instead of being refused — the server aborts the active turn's `AbortController` and waits up to 2.5 s for it to release. Newest request always wins. An interrupted turn commits nothing.

**Request body**

| Field | Type | Notes |
|---|---|---|
| `message` | string, required | The user's utterance. `400` if empty. |

**Behavior on the way in:** if `permissions.web_search !== false` and the message matches `wantsWebSearch()` (explicit "search"/"look up" or live-info wording like "latest", "weather", "who won"), the server runs `webSearch()` (Brave if `BRAVE_API_KEY` is set, else the free DuckDuckGo scrape) and appends the results as an untrusted `<web_search_results>` block for *this call only* — it is never persisted. A follow-up matching `wantsUrl()` within 30 minutes of the last search re-surfaces the exact URLs instead of re-searching.

**Behavior on the way out (success only):** the original message and the reply are pushed into `memory.recent`, appended to `transcript.jsonl`, and saved. An empty model reply is committed as `(no response)` so it can't poison later Claude turns. Afterwards, detached: `maybeSummarize()` (memory folding) and `extractFromChat()` (auto-capture of focus / tasks / reminders from what you said — this is why saying "remind me at 5 to email my prof" just works).

**Stream events** (full schemas in Protocol v1):

```
data: {"type":"status","text":"Searching the web for \"gemini 3 release date\"…"}
data: {"type":"delta","text":"It"}
data: {"type":"delta","text":" launched"}
...
data: {"type":"done"}
```

**Errors:** `400 {"error":"Message is required."}` before the stream starts; after it starts, failures arrive in-stream as `{"type":"error","text":"Cannot reach Ollama — make sure the Ollama app is running."}` (`friendlyError()` output).

### POST `/api/reset`

Start a fresh conversation. Clears the recent window; long-term memory (profile + summary) survives unless you ask for the full wipe. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `all` | boolean, optional | `true` also wipes `profile` and `summary` — a full forget. |

**Response:** `{"ok":true,"clearedLongTerm":false}`

### POST `/api/listen`

"Listening mode" capture — log a heard line *without* replying. Goes to `data/listening.jsonl`, deliberately outside the model's memory/transcript. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `text` | string, required | `400` if empty. |

**Response:** `{"ok":true}`

---

## Provider

### GET `/api/provider`

Which backend answers chat right now. Auth: standard.

```json
{
  "provider": "ollama",
  "claudeAvailable": false,
  "ollamaModel": "llama3.2",
  "claudeModel": "claude-sonnet-4-6"
}
```

### POST `/api/provider`

Switch the chat backend. Takes effect on the *next* turn (an in-flight turn keeps the backend it started with). Broadcasts `provider.changed`. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `provider` | `"ollama"` \| `"claude"`, required | |

**Response:** `{"provider":"claude"}`

**Errors:** `400` unknown provider; `400` `claude` without `ANTHROPIC_API_KEY`; `403` `claude` while `permissions.paid_claude` is off.

---

## Memory & history

### GET `/api/memory`

What KAEL durably remembers (transparency/debugging). Auth: standard.

```json
{
  "profile": ["His name is Varyn.", "Studying CS; hunting a Pflichtpraktikum."],
  "summary": "Varyn has been building KAEL's scheduler and asked about SSE reconnection…",
  "recentCount": 14
}
```

### POST `/api/memory`

Replace the durable profile facts (the memory editor's save). Deduped case-insensitively, capped at 30 (`MAX_PROFILE_FACTS`). Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `profile` | string[], required | `400 {"error":"Expected { profile: string[] }."}` otherwise. |

**Response:** `{"profile":["His name is Varyn."]}`

### GET `/api/history`

The recent verbatim window — exactly what the model sees and what the UI restores on page load. Auth: standard.

```json
{ "messages": [ {"role":"user","content":"hey"}, {"role":"assistant","content":"Hey. What's up?"} ] }
```

### GET `/api/transcript`

Page/search the *full* permanent transcript (`transcript.jsonl`, never trimmed). Auth: standard.

| Query param | Type | Notes |
|---|---|---|
| `q` | string, optional | Case-insensitive substring filter on message content. |
| `limit` | int, optional | 1–500, default 60. |
| `offset` | int, optional | Counts **back from the newest** message, default 0. |

```json
{
  "total": 4211,
  "messages": [ {"at":"2026-07-02T21:14:03.512Z","role":"user","content":"remind me tomorrow at 9 to call the prof"} ]
}
```

`500 {"error":"Could not read the transcript."}` on a read failure.

### GET `/api/listening`

The listening-mode capture log. Auth: standard.

```json
{ "lines": [ {"at":"2026-07-01T18:02:11.930Z","text":"okay so the deadline moved to august second"} ] }
```

---

## Config

### GET `/api/config`

Owner-tunable settings: persona, sampling temperature, active local model. `null` means "using the built-in default". Auth: standard.

```json
{
  "persona": null,
  "defaultPersona": "You are KAEL, the always-on personal AI assistant for Varyn…",
  "temperature": null,
  "model": "llama3.2",
  "models": ["llama3.2:latest", "qwen2.5vl:3b", "gpt-oss:120b-cloud"],
  "provider": "ollama"
}
```

### POST `/api/config`

Change any subset; persisted to `data/config.json` so it survives relaunches. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `persona` | string \| null, optional | `""` or `null` resets to the built-in prompt; capped at 8000 chars. `400` if some other type. |
| `temperature` | number \| null, optional | 0–2, else `400`. `null`/`""` resets to model default. |
| `model` | string, optional | Must be installed in Ollama (exact or `name:` prefix match), else `400` with a `ollama pull` hint. Warms the model unless a chat turn is live. |

**Response:** `{"persona":null,"temperature":0.7,"model":"llama3.2"}`

---

## Awareness

Ambient awareness: the browser captures screen (+ optional webcam) frames on a timer and posts them; a **local** vision model writes a one-line activity note that feeds KAEL's context. Frames are never written to disk (except the opt-in training set) and are blocked from leaving the machine.

### GET `/api/awareness`

Current awareness state + the vision-model picker. Auth: standard.

```json
{
  "enabled": true,
  "intervalMs": 300000,
  "model": "qwen2.5vl:3b",
  "models": ["qwen2.5vl:3b", "llava:7b"],
  "latestNote": "Coding in VS Code, editing server.js, focused at the desk.",
  "latestAt": 1751558402113,
  "collectTraining": false,
  "trainingCount": 137
}
```

### POST `/api/awareness`

Change awareness settings. Turning it off clears `latestNote`/`latestMood`/`latestAt` so KAEL stops referencing stale activity. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `enabled` | boolean, optional | |
| `intervalMs` | number, optional | Clamped to 60 000–1 800 000 (1 min–30 min). The *browser* drives the actual glance cadence. |
| `model` | string, optional | `403` if it's an Ollama `*-cloud` model (frames would leave the machine) unless `AWARENESS_ALLOW_REMOTE=1`; `400` if not installed. |
| `collectTraining` | boolean, optional | Opt-in (image, caption) dataset for a future fine-tune. |

**Response:** `{"enabled":true,"intervalMs":300000,"model":"qwen2.5vl:3b","collectTraining":false}`

### POST `/api/awareness/observe`

The browser posts a fresh frame; the vision model turns it into a note. Also the ride-along trigger for proactive coaching (`coachCheck()`). Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `screen` | string, optional* | Base64 JPEG (a `data:` URL prefix is stripped). |
| `webcam` | string, optional* | Base64 JPEG. *At least one of the two is required (`400`).* |
| `screenText` | string, optional | OCR text from the screen — grounds the model so it names apps/titles exactly (capped at 2000 chars in the prompt). |

**Success response:**

```json
{
  "note": "Watching a lecture on YouTube in Edge, present and attentive.",
  "mood": "focused and calm",
  "at": 1751558402113,
  "coach": null
}
```

`coach` is a string only when the coach decided to speak this glance (the same text is also broadcast as `coach.nudge`).

**Non-success responses**

| Status | Body | Meaning |
|---|---|---|
| `409` | `{"error":"Awareness is off."}` | Toggle it on first. |
| `403` | `{"error":"Awareness is blocked: the vision model is not local…"}` | Remote Ollama URL or `*-cloud` model without the override. |
| `202` | `{"skipped":"busy"}` | A glance is already in flight. |
| `202` | `{"skipped":"throttled"}` | Under the 60 s minimum between glances. |
| `202` | `{"skipped":"chat-busy"}` | A chat turn is streaming — the GPU is not yanked away from a live reply. |
| `400` | `{"error":"Need a screen or webcam frame."}` | No image supplied. |
| `502` | `{"error":"Vision model failed: …"}` | Upstream Ollama error. |

### GET `/api/awareness/log`

Recent activity notes from `awareness.jsonl`, newest last. Auth: standard.

| Query param | Type | Notes |
|---|---|---|
| `limit` | int, optional | 1–500, default 50. |

```json
{ "total": 812, "notes": [ {"at":"2026-07-03T14:20:11.402Z","note":"Reading email in Gmail.","mood":""} ] }
```

### GET `/api/awareness/learned`

The learned profile injected into every glance (facts + past corrections). Auth: standard.

```json
{
  "facts": ["This user's dark-purple editor is VS Code, not Discord."],
  "corrections": [ {"was":"messaging on Discord","actually":"coding in VS Code"} ]
}
```

### POST `/api/awareness/learned`

Replace the learned profile — the daily consolidation routine's write path. `facts` capped at 60; `corrections` keeps the last 100. Auth: standard.

| Field | Type |
|---|---|
| `facts` | string[], optional |
| `corrections` | `{was: string, actually: string}[]`, optional |

**Response:** the updated `{ facts, corrections }`.

### POST `/api/awareness/correct`

Record one user correction of a wrong note. Applied immediately (replaces `latestNote`, drops the now-untrusted mood) and, if this glance was saved as a training sample, re-labels it. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `was` | string, optional | What the note wrongly said. |
| `actually` | string, required | The truth. `400` if missing. |

**Response:** `{"ok":true,"corrections":13}`

---

## Coaching

### GET `/api/coach`

Proactive-coaching settings. Auth: standard.

```json
{
  "enabled": true,
  "goal": "finish the internship cover letter",
  "intensity": "balanced",
  "model": "gpt-oss:120b-cloud",
  "models": ["llama3.2:latest", "gpt-oss:120b-cloud"],
  "lastNudge": "You said cover letter — Edge has been on YouTube for twenty minutes."
}
```

### POST `/api/coach`

Change coaching settings. Setting a new `goal` resets the nudge cooldown so the coach may speak again soon. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `enabled` | boolean, optional | |
| `goal` | string, optional | Capped at 300 chars. Also set automatically by chat extraction. |
| `intensity` | `"chill"` \| `"balanced"` \| `"strict"`, optional | Cooldowns: 20 min / 10 min / 4 min. |
| `model` | string, optional | Must be installed, else `400`. Note: a cloud coach model sends the activity *timeline text* (never frames) to that model — the disclosed trade. |

**Response:** `{"enabled":true,"goal":"…","intensity":"balanced","model":"gpt-oss:120b-cloud"}`

---

## Tasks

Task object shape (everywhere below):

```json
{
  "id": "t1751558402113-7",
  "text": "Email Prof. Weber about the deadline",
  "priority": "high",
  "deadline": "Friday",
  "steps": [ {"text": "Draft the email", "done": true}, {"text": "Send it", "done": false} ],
  "done": false,
  "createdAt": "2026-07-03T09:12:44.201Z"
}
```

Every mutation funnels through `saveTasks()`, which broadcasts `task.changed` — so all open devices stay in sync. Tasks are also created from plain chat (`extractFromChat`) and by the planner's `task` tool.

### GET `/api/tasks`

All tasks in display order: open before done, then priority high→low, then newest first (`sortedTasks()`). Auth: standard.

**Response:** `{"tasks":[ … ]}`

### POST `/api/tasks`

Add a task. Deduped against open tasks by a loose text match. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `text` | string, required | Capped at 200 chars. |
| `priority` | `"high"`\|`"medium"`\|`"low"`, optional | Defaults `medium`. |
| `deadline` | string, optional | Free-form, capped at 60 chars. |

**Response:** `{"task":{…},"tasks":[…]}`. `400 {"error":"Need task text (or it already exists)."}` on empty/duplicate.

### POST `/api/tasks/prioritize`

Re-prioritize all open tasks via the coach model (urgency/importance/deadline). Registered *before* `/api/tasks/:id` so Express doesn't eat "prioritize" as an id. Auth: standard.

**Response:** `{"tasks":[…]}`. `502 {"error":"Prioritize failed: …"}` if the model call fails.

### POST `/api/tasks/:id`

Update a task. Any subset of fields; toggling the last open step auto-completes the task. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `text` | string, optional | |
| `priority` | `"high"`\|`"medium"`\|`"low"`, optional | |
| `deadline` | string \| null, optional | |
| `done` | boolean, optional | |
| `steps` | `{text, done}[]`, optional | Replaces the whole list. |
| `stepIndex` + `stepDone` | number + boolean, optional | Toggle one step. |

**Response:** `{"task":{…},"tasks":[…]}`. `404 {"error":"No such task."}`.

### DELETE `/api/tasks/:id`

Remove a task. Idempotent — deleting a missing id still returns `200` with the current list (no 404 here, unlike schedules). Auth: standard.

**Response:** `{"tasks":[…]}`

### POST `/api/tasks/:id/breakdown`

Ask the model to break the task into 3–6 concrete steps (replaces `steps`). Auth: standard.

**Response:** `{"task":{…},"tasks":[…]}`. `404` no such task; `502 {"error":"Breakdown failed: …"}`.

---

## Schedules

Reminders (one-off) and routines (recurring). A 30-second tick (`scheduleTick`) fires due jobs: they broadcast `schedule.fired` on the event bus — every connected device speaks them — and land in the transcript as `⏰ Reminder: …`. Jobs missed by more than **6 hours** (`SCHEDULE_MISSED_GRACE`) are skipped with a `schedule.skipped` broadcast and a transcript note instead of being blurted late. The tick is a no-op while `permissions.scheduler` is off. Schedules are also created from chat ("remind me at 5 to…") and by the planner's `remind` tool.

Schedule object shape:

```json
{
  "id": "s1751558402113-3",
  "text": "Stand up and stretch",
  "recur": { "kind": "daily", "time": "14:00" },
  "nextAt": "2026-07-04T12:00:00.000Z",
  "lastFiredAt": "2026-07-03T12:00:00.318Z",
  "enabled": true,
  "createdAt": "2026-06-28T10:02:19.771Z"
}
```

Recurrence rules (`computeNextAt`, evaluated in the **server's local timezone**):

| `recur.kind` | Fields | Meaning |
|---|---|---|
| `"interval"` | `everyMs` (number) | Every N ms, floored at 60 000. |
| `"daily"` | `time` (`"HH:MM"`, default `"09:00"`) | Every day at that local time. |
| `"weekly"` | `weekday` (0–6, 0 = Sunday), `time` | Once a week. |

### GET `/api/schedules`

All schedules, sorted by `nextAt` ascending (disarmed ones last). Auth: standard.

**Response:** `{"schedules":[…]}`

### POST `/api/schedules`

Create a reminder or routine. Give **either** `at` (one-off) **or** `recur`. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `text` | string, required | Capped at 200 chars. |
| `at` | ISO 8601 string, optional | One-off fire time. |
| `recur` | object, optional | See table above. `400` if `recur.kind` isn't `daily`/`weekly`/`interval`. |

**Response:** `{"schedule":{…}}`. `400 {"error":"Need text plus a valid future \"at\" (ISO 8601) or a \"recur\" rule."}`.

### POST `/api/schedules/:id`

Update a schedule. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `enabled` | boolean, optional | Re-enabling a recurrence recomputes `nextAt`; a fired one-off needs a new `at`. |
| `text` | string, optional | |
| `at` | ISO 8601 string, optional | Converts to a one-off: clears `recur`, sets `nextAt`, re-enables. |

**Response:** `{"schedule":{…}}`. `404 {"error":"No such schedule."}`.

### DELETE `/api/schedules/:id`

**Response:** `{"ok":true}`. `404` if the id doesn't exist.

---

## Permissions

One switchboard for what KAEL may do, persisted to `data/permissions.json`. Every key defaults to **true** (the behavior before the switchboard existed); it exists to turn things *off* and have that stick.

| Key | Enforced where |
|---|---|
| `remote_access` | Server — auth middleware rejects all non-local requests with `403`. |
| `web_search` | Server — chat search augmentation and the planner's `search` tool. |
| `paid_claude` | Server — `POST /api/provider` refuses the switch. |
| `paid_tts` | Server — `POST /api/tts` returns `403`. |
| `scheduler` | Server — `scheduleTick()` stops firing. |
| `planner` | Server — `POST /api/plan` returns `403`. |
| `training` | Server — glance training-sample saving is skipped. |
| `awareness`, `webcam`, `screen` | **Client** — the browser owns the capture, so the gate lives where the frames are taken (`/api/awareness/observe` itself gates on the `enabled` config flag, not these keys). |

### GET `/api/permissions`

```json
{ "permissions": { "remote_access": true, "web_search": true, "paid_claude": true, "paid_tts": true, "awareness": true, "webcam": true, "screen": true, "training": true, "scheduler": true, "planner": true } }
```

Auth: standard.

### POST `/api/permissions`

Flip any subset of the ten keys (booleans only; unknown keys ignored). If anything actually changed, saves and broadcasts `permissions.changed`. Auth: standard.

**Request:** `{"web_search":false}` → **Response:** the full updated `{ permissions }` object.

---

## Planner

### POST `/api/plan` — SSE

KAEL's small orchestration engine: a goal in, the local model decomposes it into ≤5 steps over a fixed tool set, the steps run sequentially with progress streamed to the caller *and* broadcast to every device, then a final answer is synthesized. One plan at a time. Every run is appended to `data/plans.jsonl`. Auth: standard.

**Request body**

| Field | Type | Notes |
|---|---|---|
| `goal` | string, required | Capped at 400 chars. |

**Pre-stream errors:** `400 {"error":"Give the planner a goal."}` · `403 {"error":"The planner is switched off in KAEL's permissions."}` · `409 {"error":"A plan is already running — let it finish first."}`

**Tools** (`runPlanStep`):

| Tool | What it does | Step fields |
|---|---|---|
| `search` | Web search (respects `permissions.web_search`); results go into the gathered context. | `input` = query |
| `remember` | Append one durable fact to `memory.profile`. | `input` = the fact |
| `task` | Add a to-do via `addTask()` (deduped). | `input` = task text |
| `remind` | Create a one-off schedule via `addSchedule()`. | `input` = what to say, `when` = ISO 8601 |
| `answer` | Synthesize the final spoken answer. Exactly one, always last (appended if the model forgot it). | `input` = guidance |

**Stream events** (full schemas in Protocol v1): `status` → `plan` → per-step `step` (running/done) pairs → `status` → one `delta` carrying the whole answer → `done`; or `error`. Each step is best-effort — a failed step records its error in `outcome` and the plan continues.

### GET `/api/plans`

The last 20 plan runs from `plans.jsonl`, newest first. Auth: standard.

```json
{
  "plans": [
    {
      "id": "p1751558402113",
      "goal": "add buy flour to my list and find a good croissant oven temp",
      "at": "2026-07-03T10:15:02.113Z",
      "steps": [
        {"tool":"task","input":"Buy flour","outcome":"task added"},
        {"tool":"search","input":"best oven temperature for baking croissants","outcome":"5 results"}
      ],
      "answer": "Flour's on your list. Bake croissants at about 200 degrees Celsius…"
    }
  ]
}
```

Failed runs carry `"error": "<message>"` instead of (or alongside a partial) `answer`.

---

## Devices / Pairing

### GET `/api/pair`

Pairing info for other devices. **Localhost only** — it hands out the token, so a remote request gets `403 {"error":"Pairing info is only available on the PC itself."}` *even with a valid token*.

```json
{
  "exposed": true,
  "host": "0.0.0.0",
  "port": 3000,
  "token": "Nk3q8vX1jw2ZC9pR5tYb7Lm0AhVd4KfS",
  "urls": ["http://192.168.178.42:3000/?token=Nk3q8vX1jw2ZC9pR5tYb7Lm0AhVd4KfS"],
  "hint": "Open one of these links on a device on the same network, then \"Install app\" / \"Add to Home Screen\" for the full-screen PWA."
}
```

`urls` lists one pairing link per non-internal IPv4 interface. Opening one on the phone authenticates via `?token=`, the server sets the `kael_token` cookie, and the client strips the token from the URL bar. When bound to localhost, `exposed` is `false` and `hint` explains the `KAEL_HOST=0.0.0.0` step.

---

## Voice / TTS

### GET `/api/voice`

Whether premium (OpenAI) TTS is available and its options — the UI shows the toggle only when it'll work. Auth: standard.

```json
{
  "premiumAvailable": true,
  "model": "tts-1-hd",
  "defaultVoice": "shimmer",
  "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
}
```

### POST `/api/tts`

Synthesize one sentence and stream the audio back. The OpenAI key never reaches the browser — this proxy is the whole point. A browser disconnect (barge-in/stop) aborts the upstream request. Auth: standard.

| Field | Type | Notes |
|---|---|---|
| `text` | string, required | Max **1500** chars (`TTS_MAX_CHARS`). |
| `voice` | string, optional | One of the six voices; anything else falls back to the default. |

**Success:** raw MP3 bytes, `Content-Type: audio/mpeg`, `Cache-Control: no-store`.

**Errors**

| Status | Body |
|---|---|
| `503` | `{"error":"Premium voice is not configured (no OPENAI_API_KEY)."}` |
| `403` | `{"error":"Premium voice is switched off in KAEL's permissions."}` |
| `400` | `{"error":"Text is required."}` / `{"error":"Text too long (max 1500 chars)."}` |
| `502` | `{"error":"Premium voice rejected the OpenAI key."}` (upstream 401) / `{"error":"Premium voice hit a rate/quota limit."}` (upstream 429) / `{"error":"Premium voice failed."}` |

---

## Health

### GET `/api/health`

Health + readiness in one shot: pings Ollama (1.5 s timeout), checks whether the chat and vision models are actually installed, reads the watchdog's lock heartbeat, and reports the next scheduled job. Auth: standard.

```json
{
  "status": "ok",
  "uptimeSec": 86211,
  "supervised": true,
  "recoveredFromCrash": false,
  "provider": "ollama",
  "ollama": { "url": "http://localhost:11434", "model": "llama3.2", "up": true, "modelInstalled": true },
  "claude": { "model": "claude-sonnet-4-6", "hasApiKey": false },
  "awareness": { "enabled": true, "model": "qwen2.5vl:3b", "modelInstalled": true, "lastGlanceAt": 1751558402113 },
  "devices": 2,
  "scheduler": { "count": 4, "nextAt": "2026-07-03T16:00:00.000Z", "nextText": "Stand up and stretch" },
  "exposure": { "host": "0.0.0.0", "authRequired": true }
}
```

Field notes:

- `supervised` — `true` when `scripts/watchdog.mjs` is alive (its `data/watchdog.lock` heartbeat is younger than 90 s).
- `recoveredFromCrash` — the previous run left `data/server.lock` behind (SIGINT/SIGTERM remove it on clean exit).
- `awareness.lastGlanceAt` — distinguishes "awareness silently died" from "awareness is off".
- `devices` — live `/api/events` connections.

---

## Events

### GET `/api/events` — SSE

The event bus: one long-lived stream per connected device. Everything proactive rides on it — task/schedule changes made anywhere show up everywhere, reminders fire out loud on whichever device is listening, coach nudges reach the phone too. Auth: standard (remote devices authenticate via the `kael_token` cookie or `?token=`). Full protocol below.

---

# KAEL Protocol v1

The wire protocol for KAEL's three SSE surfaces. All three are **data-only SSE**: every frame is a single `data: <json>\n\n` line — no `event:` names, no `id:` fields, no retry hints. A client parses `ev.data` as JSON and switches on the `type` field.

## 1. The event bus — `GET /api/events`

### Connection semantics

- **Client:** a plain `EventSource`. The PWA opens it as:

  ```js
  es = new EventSource('/api/events' + (deviceToken ? '?token=' + encodeURIComponent(deviceToken) : ''));
  es.onmessage = (ev) => { const msg = JSON.parse(ev.data); switch (msg.type) { /* … */ } };
  ```

- **Auth:** `EventSource` can't set headers, so remote devices authenticate with `?token=` on the URL or (after any prior authenticated request) the `kael_token` cookie. Localhost connects bare.
- **Headers:** the server responds `200` with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`.
- **Hello frame:** immediately on connect, the *new client only* receives:

  ```json
  {"type":"hello","at":"2026-07-03T14:00:00.000Z","devices":2}
  ```

  `devices` counts connections *including this one* (`sseClients.size + 1`).
- **Broadcast envelope:** every subsequent frame comes from `broadcast(type, data)` and has the shape `{ "type": "<name>", "at": "<ISO 8601>", ...payload }`. `broadcast()` is a no-op when no clients are connected.
- **Heartbeat:** `health.heartbeat` is broadcast every **25 seconds**. It keeps proxies/browsers from idling the socket out and doubles as a liveness signal — a client that has seen nothing for ~60 s should treat the pipe as dead.
- **Reconnection:** there are no `id:` fields, so there is **no `Last-Event-ID` replay — events missed while disconnected are gone**. That's fine by design: every event is a "go refetch" hint or an ephemeral utterance, not state. Browsers auto-reconnect `EventSource`, but not reliably after a mobile network flip, so the KAEL client also recycles the connection itself: on `error` it closes the source and reopens after 8 s. On reconnect, panels refresh from the REST endpoints (`/api/tasks`, `/api/schedules`, …).
- **Cleanup:** the server drops a client from the set on the request's `close` event; writes to a dead pipe are try/caught in `broadcast()`.

### Event catalogue

Every event type `broadcast()` is ever called with, verified against the source:

| Type | Payload (beyond `type`, `at`) | Fires when |
|---|---|---|
| `hello` | `devices: number` | On connect — sent only to the newly connected client. |
| `health.heartbeat` | `uptimeSec: number` | Every 25 s, to everyone. |
| `provider.changed` | `provider: "ollama"\|"claude"` | `POST /api/provider` switched the backend. |
| `permissions.changed` | `permissions: {…}` (the full switchboard) | `POST /api/permissions` changed at least one key. |
| `task.changed` | `open: number` (count of open tasks) | Every `saveTasks()` — any task mutation from REST, chat extraction, or the planner's `task` tool. A refetch hint, not a diff. |
| `schedule.changed` | `count: number` (total schedules) | Every `saveSchedules()` — create, update, delete, or a tick that fired/skipped/re-armed something. |
| `schedule.fired` | `id: string, text: string` | The 30 s tick found a job due within the 6 h grace window. **Every listening device speaks `text` out loud.** |
| `schedule.skipped` | `id: string, text: string, missedAt: string` | A due job was missed by more than 6 h (KAEL was off) — noted, not blurted. |
| `plan.started` | `planId: string, goal: string, steps: number` | `/api/plan` parsed its steps and is about to execute. |
| `plan.step` | `planId: string, index: number, tool: string, status: "running"\|"done"` | Twice per non-`answer` step: before and after it runs. |
| `plan.done` | `planId: string, goal: string, error?: string` | The plan finished; `error` present only on failure. |
| `awareness.note` | `note: string, mood: string` | A glance produced an activity note — other devices see what KAEL noticed. |
| `coach.nudge` | `text: string` | `coachCheck()` decided to speak. Spoken on every device; the observing device dedupes it against the copy it already got in its `/api/awareness/observe` response (same text within 20 s). |

## 2. The chat stream — `POST /api/chat`

Per-request SSE. `EventSource` only does GET, so the client consumes this with `fetch()` + a `ReadableStream` reader, splitting frames on blank lines; aborting the fetch (`AbortController`) is the barge-in signal. Frames, in order of possible appearance:

| Type | Shape | Meaning |
|---|---|---|
| `status` | `{"type":"status","text":"Searching the web for \"…\"…"}` | Progress before tokens flow (search running / search empty / search failed). Zero or more. |
| `delta` | `{"type":"delta","text":"tok"}` | One token/chunk of the reply. Concatenate in order. |
| `done` | `{"type":"done"}` | The turn committed (memory + transcript saved). Terminal. |
| `error` | `{"type":"error","text":"Cannot reach Ollama — make sure the Ollama app is running."}` | The turn failed after streaming started; `text` is the spoken-friendly `friendlyError()`. Terminal. |

A turn interrupted by a newer `/api/chat` request just stops — no `done`, nothing committed. A `400 {"error":"Message is required."}` JSON response (not SSE) is returned if the message was empty.

## 3. The planner stream — `POST /api/plan`

Same transport as chat (POST + fetch-streamed SSE). Pre-flight failures are plain JSON (`400`/`403`/`409`, see the Planner section). Once streaming:

| Type | Shape | Meaning |
|---|---|---|
| `status` | `{"type":"status","text":"planning…"}` then later `{"type":"status","text":"writing the answer…"}` | Phase markers. |
| `plan` | `{"type":"plan","steps":[{"tool":"task","input":"Buy flour"},{"tool":"answer","input":"confirm the task"}]}` | The parsed plan (inputs truncated to 160 chars). |
| `step` | `{"type":"step","index":1,"tool":"search","input":"…","status":"running"}` then `{"type":"step","index":1,"tool":"search","status":"done","outcome":"5 results"}` | Around each non-`answer` step. A failed step reports `outcome:"failed: <message>"` and the plan continues. |
| `delta` | `{"type":"delta","text":"Flour's on your list. …"}` | **One event carrying the entire final answer** — not token-by-token like chat. |
| `done` | `{"type":"done"}` | Run complete and logged to `plans.jsonl`. Terminal. |
| `error` | `{"type":"error","text":"Planning failed: chat 500"}` | The run failed; also logged. Terminal. |

Mirrored on the event bus: `plan.started` / `plan.step` / `plan.done` carry the same run to *other* devices, so a plan kicked off on the PC shows progress on the phone.
