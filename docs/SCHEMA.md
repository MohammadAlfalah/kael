# KAEL Data-Store Reference ("the database schema")

Everything KAEL knows lives in plain files under `data/` (gitignored — the whole
directory is personal data). There is no database. That is deliberate:

- **Single user.** One writer process, one owner. There is no concurrency problem
  a database would solve that a serialized promise chain doesn't already solve.
- **Atomic writes without a WAL.** Every JSON store is saved with the same
  tmp-file + `rename()` pattern, so a crash mid-write can never leave a
  half-written file. That's the one durability guarantee KAEL actually needs.
- **Greppable and hand-editable.** `data/memory.json` opens in any editor. You can
  `grep` the transcript, delete a bad fact with a text editor, or diff yesterday's
  backup — no client, no schema migration tooling.
- **Zero dependencies.** The whole server runs on `express`,
  `@anthropic-ai/sdk`, and `dotenv`. Adding a database driver for a few
  kilobyte-sized stores would be the heaviest dependency in the project.

The directory location is `data/` next to `server.js`, overridable with the
`KAEL_DATA_DIR` env var (`server.js` resolves it into `DATA_DIR`).

---

## Conventions

### Three file formats

| Format | Used for | Write style |
|---|---|---|
| **JSON object** (pretty-printed, `version: 1`) | current state (memory, config, tasks, schedules, permissions, learned profile) | full rewrite, atomic tmp + rename |
| **JSONL** (one JSON object per line) | append-only logs (transcript, awareness, listening, plans, training labels, watchdog log) | `appendFile` of one line |
| **Raw** | `auth.token` (a bare string), `server.log` (captured stdout/stderr), training images (JPEG) | plain write / append |

### The atomic-write pattern

Every JSON store has a dedicated `saveX()` in `server.js` built on the same
template (this is `saveMemory`, the others are copies):

```js
let saving = Promise.resolve();
function saveMemory() {
  const snapshot = JSON.stringify(memory, null, 2);
  saving = saving
    .then(async () => {
      const tmp = `${MEMORY_FILE}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, MEMORY_FILE);        // atomic on the same volume
    })
    .catch((err) => console.error('Failed to save memory:', err.message));
  return saving;
}
```

Two properties: the **snapshot** is taken synchronously (later mutations can't
bleed into an in-flight write), and the **promise chain** serializes writes so
two turns can never interleave. You may briefly see `*.tmp` files in `data/` —
that's this pattern mid-flight.

Each store also has a matching `loadX()` run once at boot (bottom of
`server.js`), before `app.listen`. Corrupt-file behavior varies per store and is
noted below; a quarantined file gets renamed to `<name>.corrupt` rather than
silently destroyed.

### Reading JSONL

`readJsonl(file)` in `server.js` reads a whole JSONL file, parses line by line,
**skips unparseable lines**, and returns `[]` for a missing file. All JSONL
consumers (`/api/transcript`, `/api/awareness/log`, `/api/listening`,
`/api/plans`, `loadRecentNotes`) go through it, so a single mangled line never
breaks a read.

---

## `data/memory.json` — tiered conversation memory

- **Format:** JSON object.
- **Writers:** `saveMemory()` (atomic pattern above). Mutated by the chat commit
  in `POST /api/chat`, `maybeSummarize()` / `foldIntoMemory()`, `POST /api/memory`
  (profile editor), `POST /api/reset`, and the planner's `remember` tool
  (`runPlanStep`).
- **Reader:** `loadMemory()` at boot. Corrupt file → renamed to
  `memory.json.corrupt`, starts fresh.

```ts
type Memory = {
  version: 1;
  profile: string[];        // durable facts about Varyn, ≤ MAX_PROFILE_FACTS (30)
  summary: string;          // rolling narrative of older conversation
  recent: ChatMessage[];    // verbatim recent window, sent to the model as real turns
};
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;          // original user text (never the search-augmented version)
};
```

- **Size/cap behavior:** `recent` is folded into `summary` once it passes
  `SUMMARIZE_TRIGGER` (24 messages), keeping the newest `RECENT_WINDOW` (16)
  verbatim. If summarization keeps failing, a failsafe trims `recent` to 32 once
  it exceeds 72 (the full text still exists in `transcript.jsonl`). `profile` is
  capped at 30 facts everywhere it's written.
- **Backup:** yes — daily copy in `data/backups/`.

## `data/config.json` — owner settings

- **Format:** JSON object.
- **Writers:** `saveConfig()`. Triggered by `POST /api/config` (persona /
  temperature / model), `POST /api/awareness`, `POST /api/coach`, and
  `extractFromChat` when it auto-captures a focus.
- **Reader:** `loadConfig()` at boot (restores `sessionPersona`,
  `sessionTemperature`, `OLLAMA_MODEL`, and the persisted halves of the
  `awareness` and `coaching` state objects). Corrupt file → logged, defaults used
  (no quarantine; the next save overwrites it).

```ts
type Config = {
  version: 1;
  persona: string | null;       // custom system prompt (≤ 8000 chars), null = built-in KAEL_SYSTEM_PROMPT
  temperature: number | null;   // 0–2, null = model default
  model: string;                // active Ollama chat model
  awareness: {
    enabled: boolean;
    intervalMs: number;         // clamped 60_000–1_800_000
    model: string;              // local vision model (cloud models refused)
    collectTraining: boolean;   // opt-in training-data capture
  };
  coaching: {
    enabled: boolean;
    goal: string;               // current focus (≤ 300 chars; auto-set from chat)
    intensity: 'chill' | 'balanced' | 'strict';
    model: string;              // coach/extraction model (may be an Ollama cloud model)
  };
};
```

- **Size:** trivially small; string fields are length-capped at write time.
- **Backup:** yes — daily.

## `data/tasks.json` — conversational task manager

- **Format:** JSON object.
- **Writers:** `saveTasks()` (atomic pattern; also fires
  `broadcast('task.changed', …)` on every save so all devices stay in sync).
  Mutated via `addTask()` from `POST /api/tasks`, chat extraction
  (`extractFromChat`), the planner's `task` tool, and the
  `POST /api/tasks/:id`, `/api/tasks/prioritize`, `/api/tasks/:id/breakdown`,
  `DELETE /api/tasks/:id` routes.
- **Reader:** `loadTasks()` at boot (also rebuilds `taskSeq` from the highest id
  suffix). Corrupt file → logged, starts fresh.

```ts
type TasksStore = {
  version: 1;
  tasks: Task[];
  updatedAt: string;            // ISO timestamp of the last save
};
type Task = {
  id: string;                   // `t${Date.now()}-${seq}` e.g. "t1782071784391-2"
  text: string;                 // ≤ 200 chars, deduped (loose match) against open tasks
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;      // free text as spoken ("Friday", "now"), ≤ 60 chars
  steps: { text: string; done: boolean }[];   // step text ≤ 200 chars; all done ⇒ task.done
  done: boolean;
  createdAt: string;            // ISO
};
```

- **Size/cap:** individual fields are capped; the task *count* is not — the only
  guard is dedup against open tasks. In practice done tasks accumulate until
  deleted.
- **Backup:** yes — daily.

## `data/schedules.json` — reminders + routines

- **Format:** JSON object.
- **Writers:** `saveSchedules()` (atomic pattern; also fires
  `broadcast('schedule.changed', …)`). Mutated via `addSchedule()` from
  `POST /api/schedules`, chat extraction (explicit "remind me…" requests), the
  planner's `remind` tool, the edit/delete routes
  (`POST /api/schedules/:id`, `DELETE /api/schedules/:id`), and `scheduleTick()`
  (the 30-second clock that fires due jobs and advances `nextAt`).
- **Reader:** `loadSchedules()` at boot (rebuilds `schedSeq`). Corrupt file →
  quarantined to `schedules.json.corrupt`.

```ts
type SchedulesStore = {
  version: 1;
  schedules: Schedule[];
};
type Schedule = {
  id: string;                   // `s${Date.now()}-${seq}`
  text: string;                 // what to say when it fires, ≤ 200 chars
  recur: Recurrence | null;     // null = one-off
  nextAt: string | null;        // ISO; null once a one-off has fired (enabled goes false too)
  lastFiredAt: string | null;   // ISO
  enabled: boolean;
  createdAt: string;            // ISO
};
type Recurrence =
  | { kind: 'interval'; everyMs: number }               // floored to ≥ 60_000 by computeNextAt
  | { kind: 'daily';    time?: string }                  // "HH:MM", default "09:00", server-local time
  | { kind: 'weekly';   time?: string; weekday?: number }; // 0 = Sunday, clamped 0–6
```

- **Behavior notes:** jobs due more than `SCHEDULE_MISSED_GRACE` (6 h) ago are
  *skipped* with a `schedule.skipped` broadcast and a transcript note instead of
  fired late. `computeNextAt` uses the server's local timezone.
- **Size/cap:** no count cap; each entry is tiny.
- **Backup:** yes — daily.

## `data/permissions.json` — capability switchboard

- **Format:** JSON object.
- **Writers:** `savePermissions()` (atomic pattern), from `POST /api/permissions`
  only. Fires `broadcast('permissions.changed', …)`.
- **Reader:** `loadPermissions()` at boot. Missing or corrupt → silently falls
  back to defaults (everything `true`).

```ts
type Permissions = {
  version: 1;
  remote_access: boolean;   // non-localhost requests allowed at all
  web_search: boolean;
  paid_claude: boolean;
  paid_tts: boolean;
  awareness: boolean;
  webcam: boolean;          // enforced client-side (capture happens in the browser)
  screen: boolean;          // enforced client-side
  training: boolean;
  scheduler: boolean;
  planner: boolean;
};
```

The key list is `PERMISSION_KEYS` in `server.js`; unknown keys in the file are
ignored on load, so the file can never widen what KAEL may do.

- **Backup:** yes — daily.

## `data/awareness.jsonl` — ambient activity log

- **Format:** JSONL, one line per vision-model glance.
- **Writer:** inline `appendFile(AWARENESS_FILE, …)` in the
  `POST /api/awareness/observe` handler (no named save function — it's a pure
  append). The same handler pushes the entry onto the in-memory `recentNotes`
  tail (max 12) that the coach reads.
- **Readers:** `loadRecentNotes()` at boot, `GET /api/awareness/log`.

Current line shape:

```ts
type AwarenessNote = {
  at: string;        // ISO
  note: string;      // one-line activity description, ≤ 300 chars
  mood: string;      // soft webcam mood read, ≤ 40 chars; "" when unreadable/no webcam
};
```

**Two historical line shapes still live in the file** (it's append-only, old
lines are never rewritten):

```ts
// oldest era — when sensitive-screen redaction existed:
{ at: string; note: string; sensitive: boolean }
// middle era — redaction removed, mood not yet added:
{ at: string; note: string }
```

Consumers only rely on `at` + `note`, so all three shapes parse fine through
`readJsonl`; treat `mood` and `sensitive` as optional when reading this file.

- **Rotation:** `rotateAwarenessLog()` — when the file exceeds
  `AWARENESS_LOG_MAX` (5000 lines) it is trimmed to the newest 2500 via the same
  atomic tmp + rename. Checked at boot and every 500 appends
  (`awarenessAppends % 500`).
- **Backup:** no. It's a rotating observation log, not part of KAEL's mind.

## `data/awareness-learned.json` — learned user profile for the vision model

- **Format:** JSON object.
- **Writers:** `saveLearned()` (atomic pattern), from
  `POST /api/awareness/learned` (full replace, used by the daily consolidation
  routine) and `POST /api/awareness/correct` (appends one correction, which also
  re-labels the latest training sample).
- **Reader:** `loadLearned()` at boot. Corrupt → logged, starts fresh.

```ts
type LearnedProfile = {
  version: 1;
  facts: string[];                               // durable truths, ≤ 60 via the replace endpoint
  corrections: { was: string; actually: string }[]; // raw fixes, each field ≤ 200 chars, last 100 kept
  updatedAt: string;                             // ISO, set by saveLearned()
};
```

Both arrays are injected into every awareness glance by `learnedProfileText()`
(facts all, corrections last 12) — in-context personalization of the frozen
local model.

- **Backup:** yes — daily.

## `data/transcript.jsonl` — the permanent conversation record

- **Format:** JSONL.
- **Writer:** `appendTranscript(role, content)` — a one-line append, best-effort.
  Called from `POST /api/chat` (both sides of every committed turn),
  `scheduleTick()` (fired reminders as `⏰ Reminder: …` assistant lines, and
  missed-while-offline notes), and the planner (`(plan) <goal>` user line + the
  final answer).
- **Readers:** `GET /api/transcript` (paged, substring-searchable via `?q=`).

```ts
type TranscriptLine = {
  at: string;                       // ISO
  role: 'user' | 'assistant';
  content: string;
};
```

- **Size/rotation:** **none, by design.** This is the never-trimmed full history;
  `memory.json` holds only the window the model sees. Expect it to grow forever.
- **Backup:** no (it's append-only and large; a bad write can only damage the
  last line).

## `data/listening.jsonl` — listening-mode capture

- **Format:** JSONL.
- **Writer:** inline `appendFile(LISTEN_FILE, …)` in `POST /api/listen`. Kept
  deliberately out of memory/transcript so passive recording never pollutes the
  model's context.
- **Reader:** `GET /api/listening`.

```ts
type ListeningLine = {
  at: string;     // ISO
  text: string;   // what was heard
};
```

- **Size/rotation:** none. **Backup:** no.

## `data/plans.jsonl` — planner run log

- **Format:** JSONL, one line per plan run.
- **Writer:** inline `appendFile(PLANS_FILE, …)` in the `finally` block of
  `POST /api/plan` — so every run is logged, including failures.
- **Reader:** `GET /api/plans` (last 20, newest first).

```ts
type PlanRun = {
  id: string;             // `p${Date.now()}`
  goal: string;           // ≤ 400 chars
  at: string;             // ISO, when the run started
  steps: {
    tool: 'search' | 'remember' | 'task' | 'remind';   // 'answer' runs last and isn't logged as a step
    input: string;        // ≤ 200 chars
    outcome: string;      // ≤ 200 chars, e.g. "3 results", "task added", "failed: …"
  }[];
  answer?: string;        // final synthesized answer, ≤ 2000 chars (absent on failure)
  error?: string;         // present when the run threw
};
```

- **Size/rotation:** none (bounded in practice: plans are manual, ≤ 5 steps, one
  at a time). **Backup:** no.

## `data/training/` — opt-in fine-tune dataset

- **Layout:** `training/images/<ISO-with-dashes>.jpg` + `training/labels.jsonl`.
- **Writers:** `saveTrainingSample(screenB64, caption)` — writes the JPEG (the
  raw base64 screen frame decoded) and appends one label line;
  `updateTrainingLabel(file, caption)` — rewrites `labels.jsonl` atomically
  (tmp + rename) to fix the caption when the user corrects a note, setting
  `corrected: true`.
- **Consumer:** `scripts/finetune/` and `trainingCount()` (line count, surfaced
  in `GET /api/awareness`).

```ts
type TrainingLabel = {
  file: string;        // image filename, e.g. "2026-06-20T12-40-03-006Z.jpg"
  caption: string;     // the vision model's note (or the user's correction)
  at: string;          // ISO
  corrected?: true;    // only present after updateTrainingLabel touched it
};
```

- **Cap:** `TRAINING_MAX_SAMPLES` (500 pairs, ~25–50 MB) — once full, new
  samples are silently dropped and `lastTrainingFile` is cleared so a correction
  can't re-label an older image. This is the **only** place KAEL ever writes
  screen images to disk, and only when `collectTraining` is on and the
  `training` permission isn't switched off.
- **Backup:** no.

## `data/auth.token` — device pairing token

- **Format:** raw string — 24 random bytes as base64url
  (`crypto.randomBytes(24).toString('base64url')`), no JSON, no newline
  guarantees beyond `trim()` on read.
- **Writer:** `loadAuthToken()` — written **once**, on the first boot where
  neither `KAEL_TOKEN` (env, which always wins) nor the file provides a token.
  Never rewritten after that.
- **Readers:** the `/api` auth middleware (`tokenOk()` constant-time compare)
  and `GET /api/pair` (localhost-only, hands the token out for pairing links).
- **Backup:** no. If the file is lost, a fresh token is generated on next boot
  and every paired phone/tablet must re-pair (their cookie stops matching).

## `data/server.lock` — unclean-shutdown detector + heartbeat

- **Format:** JSON object.
- **Writer:** `initServerLock()` — writes at boot, then re-writes ("beats")
  every 30 s. Deleted on clean exit (`SIGINT`/`SIGTERM` handlers `unlink` it).

```ts
type ServerLock = {
  pid: number;
  startedAt: string;   // ISO — when this server process booted
  heartbeat: number;   // Date.now() of the last beat
};
```

- **Semantics:** if the file *exists* at boot, the previous run didn't exit
  cleanly — `uncleanShutdown` is set and surfaced as `recoveredFromCrash` in
  `GET /api/health`. It is a flag file, not a mutex: the server never refuses to
  start because of it.
- **Backup:** no (meaningless to back up).

## `data/watchdog.lock` — watchdog single-instance lock

- **Format:** JSON object.
- **Writer:** `writeLock()` in `scripts/watchdog.mjs` — at start, then every
  30 s. Removed by the watchdog's `shutdown()`.

```ts
type WatchdogLock = {
  pid: number;
  heartbeat: number;   // Date.now()
};
```

- **Semantics:** a second watchdog exits if the lock is *fresh* (heartbeat
  < 90 s old) and the recorded pid is alive (`process.kill(pid, 0)`); a stale or
  dead lock is taken over. The server's `GET /api/health` reads the same file to
  report `supervised: true` when the heartbeat is < 90 s old.
- **Backup:** no.

## `data/logs/` — watchdog-managed logs

Created by `scripts/watchdog.mjs` (`fs.mkdirSync(LOG_DIR, { recursive: true })`).
These only exist when the server runs under the watchdog.

### `logs/server.log` — raw text

The supervised server's stdout **and** stderr, captured by piping the spawned
child's stdio into an appended file descriptor (`spawn(..., { stdio:
['ignore', out, out] })`). Not structured — it's whatever `console.log` /
`console.error` printed.

- **Rotation:** `rotate(SERVER_LOG, SERVER_LOG_CAP)` before each (re)start —
  when the file exceeds **5 MB** it's renamed to `server.log.1` (one old
  generation kept, previous `.1` overwritten).

### `logs/watchdog.log` — JSONL

Written by `wlog(event, detail)`:

```ts
type WatchdogEvent = {
  ts: string;      // ISO
  event: 'boot' | 'start' | 'exit' | 'kill' | 'health-fail'
       | 'duplicate-exit' | 'shutdown';
  detail: string;  // e.g. "pid 1234 (restart #2)", "code=1 signal=null up=3s — relaunch in 2s"
};
```

- **Rotation:** same `rotate()` at **1 MB** → `watchdog.log.1`, checked on every
  write.
- **Backup:** no, for both.

## `data/backups/` — daily safety copies

- **Layout:** one directory per day, plain copies inside:

```
data/backups/
  2026-07-02/
    memory.json
    config.json
    tasks.json
    awareness-learned.json
    schedules.json
    permissions.json
  2026-07-03/
    …
```

- **Writer:** `backupDataStores()` in `server.js` — runs at boot and every 24 h
  (`setInterval`). Copies exactly the six files above with `copyFile` (a missing
  store is fine), then prunes: directories matching `YYYY-MM-DD` are sorted and
  everything older than the newest `BACKUP_KEEP_DAYS` (**7**) is deleted.
- **What it protects:** the small JSON stores — "the whole of KAEL's mind." The
  append-only JSONL logs are excluded deliberately: they're large, and an append
  can at worst mangle its own last line, whereas a rewrite store can be lost
  wholesale by one bad write or disk hiccup.

---

## Backup coverage at a glance

| Store | Backed up daily | Rotation / cap |
|---|---|---|
| `memory.json` | yes | recent window folds at 24 msgs; 30 facts |
| `config.json` | yes | — |
| `tasks.json` | yes | field caps only, no count cap |
| `schedules.json` | yes | — |
| `permissions.json` | yes | fixed 10 keys |
| `awareness-learned.json` | yes | 60 facts / 100 corrections |
| `awareness.jsonl` | no | 5000 lines → trimmed to 2500 |
| `transcript.jsonl` | no | never — permanent by design |
| `listening.jsonl` | no | none |
| `plans.jsonl` | no | none (last 20 read) |
| `training/` | no | 500 samples hard cap |
| `auth.token` | no | written once |
| `server.lock` / `watchdog.lock` | no | ephemeral heartbeats |
| `logs/server.log` | no | 5 MB → `.1` |
| `logs/watchdog.log` | no | 1 MB → `.1` |

Housekeeping files you may also see in `data/`: `*.tmp` (an atomic write in
flight) and `*.corrupt` (a quarantined unreadable `memory.json` or
`schedules.json`).

---

## Migration note: if this ever moves to SQLite

Node 24 ships `node:sqlite` in core, so a move would still be zero-dependency.
The mapping is mechanical — **one table per store**:

- The five rewrite stores (`memory`, `config`, `tasks`, `schedules`,
  `permissions`, `awareness-learned`) become either single-row JSON-column
  tables (laziest, keeps the current shapes) or proper tables
  (`tasks(id TEXT PRIMARY KEY, text, priority, deadline, done, created_at)` with
  a `task_steps` child table; same idea for `schedules`). Each `saveX()` becomes
  an `UPDATE`/`UPSERT` inside a transaction — the tmp+rename dance and the
  serializing promise chains disappear, since SQLite's WAL gives the same
  crash-atomicity for free.
- The JSONL logs (`transcript`, `awareness`, `listening`, `plans`,
  `training labels`, `watchdog events`) become append-only tables with an
  autoincrement id and an index on `at`. `readJsonl` + the tail/paging logic in
  `/api/transcript` and `/api/awareness/log` become `SELECT … ORDER BY id DESC
  LIMIT ?`, and `?q=` substring search becomes `WHERE content LIKE ?` (or FTS5
  later). Log rotation is replaced by `DELETE WHERE id < ?`.
- `auth.token` and the two lock files should **stay as files**: the token is
  read by the auth middleware before anything else, and the locks exist
  precisely to work when the process (or the DB) is dead.

The main real win would be transcript search speed at scale; the main loss would
be greppability. Nothing in the current design blocks the move — every store
already has exactly one writer function to swap out.
