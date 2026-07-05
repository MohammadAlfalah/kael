# KAEL privacy model — what leaves this machine, and when

KAEL is local-first by design: the chat model, the vision model, all memory,
logs, and configuration live on this PC. **No account, no cloud backend, no
telemetry.** This document is the complete list of everything that CAN leave the
machine, what controls it, and how to shut all of it off at once.

## The four (and only four) egress paths

| # | What leaves | Where to | When | Off switch |
|---|---|---|---|---|
| 1 | Chat messages + system prompt (incl. memory facts and the latest activity note) | Anthropic (Claude) | Only while the header toggle is on **claude** | header toggle · `paid_claude` permission · local-only mode |
| 2 | Each spoken sentence (text) | OpenAI (premium TTS) | Only when premium voice is enabled in Settings | premium voice toggle · `paid_tts` permission · local-only mode |
| 3 | Your search query text | Brave or DuckDuckGo | Only when a message asks for live info (or the planner searches) | `web_search` permission · local-only mode |
| 4 | Activity **text timeline** (one-line notes; NEVER images) + chat text for task extraction | Ollama cloud (`gpt-oss:120b-cloud` coach) | Only while Proactive is ON with the cloud coach selected | pick a local coach model · Proactive off · local-only mode |

**Screen and webcam frames never leave the machine, period.** The server refuses
to send frames to any non-local vision model (`OLLAMA_IS_LOCAL` check + cloud-model
block on `/api/awareness/observe`) unless you explicitly set
`AWARENESS_ALLOW_REMOTE=1` in `.env`.

## Local-only mode (Settings → Privacy)

One switch that blocks all four paths **at the server** (not just the UI):

- Claude switch → refused (and the provider is forced back to ollama)
- Premium TTS → refused (browser voice takes over automatically)
- Web search → skipped (KAEL answers from knowledge)
- Any `*-cloud` model in coach/extraction → silently swapped for the local model

Persists across restarts (`data/config.json`). With it on, KAEL is fully
offline-capable: everything runs against `localhost:11434`.

## PANIC (Settings → Privacy)

The red button. Instantly, on every connected device:

- screen + webcam capture stops (clients drop their streams via the event bus)
- proactive voice off, training-data capture off
- permissions `screen`, `webcam`, `awareness`, `training` → OFF (they stay off)
- local-only mode → ON

Nothing is deleted. Re-enable pieces one by one when you're ready.

## Your data on disk (all under `data/`, all gitignored)

| File | What | Inspect | Delete |
|---|---|---|---|
| `memory.json` | durable facts (with category/source/date), rolling summary, recent window | Settings → Memory, `GET /api/memory` | per-fact ✕, "Forget everything", `POST /api/reset {all:true}` |
| `transcript.jsonl` | full chat history, append-only | `GET /api/transcript?q=…` | delete the file |
| `awareness.jsonl` | one-line activity notes (+mood, confidence) | Settings → Awareness, `GET /api/awareness/log` | delete the file |
| `awareness-learned.json` | facts/corrections the vision system learned | `GET /api/awareness/learned` | `POST` an empty list |
| `nudges.jsonl` | every proactive remark + why | `GET /api/coach/nudges` | delete the file |
| `tasks.json`, `schedules.json` | tasks, reminders | Settings panels | per-item ✕ |
| `training/` | opt-in screenshots+captions for fine-tuning (OFF by default) | Settings → Awareness | delete the folder |
| `listening.jsonl` | listening-mode capture | `GET /api/listening` | delete the file |
| `config.json`, `permissions.json`, `auth.token` | your settings, the switchboard, device token | Settings | edit/delete freely |

**Export everything** in one click: Settings → Privacy → "Export my data"
(`GET /api/memory/export`).

## Network exposure

- Default bind is `127.0.0.1` — nothing on the network can reach KAEL at all.
- With `KAEL_HOST=0.0.0.0` (for the phone PWA): every non-localhost request must
  present the device token (constant-time compared); a Host-header allowlist
  blocks DNS-rebinding; `remote_access` permission kills remote access entirely.
- Keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) live only in `.env` (gitignored)
  and are only ever used server-side; the browser never sees them.

## What "not under anyone else's control" means here

Local weights (abliterated — no vendor refusal layer), local memory, local
logs, local config, no required account, no forced cloud, user-owned system
prompt and personality, every observation system with a visible off switch, and
this document as the contract. The one honest caveat: the open-weights models
were still pretrained by their vendors — see `kael-model-lab` (separate project)
for the realistic path toward a personally fine-tuned brain.
