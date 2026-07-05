# Upgrade notes — 2026-07-05 (the 64GB brain upgrade)

RAM went 16GB → 64GB (2×32GB DDR4-3200). This upgrade makes KAEL actually use it.
Branch: `upgrade/64gb-brain`, built on top of `c0901c0` (Ascension OS bridge).

## What changed

**Model profile system** (`docs/MODELS.md`)
- Five profiles: fast / balanced / deep / coding / vision, each a best-first
  candidate list resolved against what's installed, with graceful fallback.
- Auto-routing per message (regex heuristics, transparent), or pin a profile.
- `GET/POST /api/profiles`, "Brain profiles" panel in Settings, "thinking with …"
  status line in chat, routing log.
- New models pulled: `huihui_ai/qwen3-abliterated:8b` (5.0GB), `qwen3:14b`
  (9.3GB), `qwen2.5-coder:7b` (4.7GB), `qwen2.5vl:7b` (6.0GB).
- Reasoning models run with `think:false` in chat (voice can't wait out a hidden
  thinking phase).
- `scripts/benchmark.mjs` measures cold load / TTFT / tok/s / GPU-vs-RAM split.

**Vision / awareness**
- The 7B vision model was pulled, benchmarked — and REJECTED for this GPU:
  measured >5 min per image glance (6.4GB VLM + pinned chat model can't share
  6GB VRAM; it thrashes). The 3B stays the default (0.5-2s warm, 100% GPU);
  the 7B remains in the picker for bigger GPUs. Boot now falls back down the
  vision candidate list if the configured model isn't installed.
- Every glance now self-rates a CONFIDENCE (high/medium/low): low-confidence
  notes are hedged in the system prompt ("might be"), marked "unsure" in the UI,
  and the coach is told to treat them skeptically.

**Memory**
- Facts are objects now: `{text, category, source, addedAt, lastConfirmed}`
  (categories: identity/preference/project/goal/habit/other). Old string facts
  migrate automatically on first load; metadata survives summarization passes.
- Caps raised for 64GB: recent window 16→24, summarize trigger 24→36, max facts
  30→48 (all env-tunable).
- `GET /api/memory/export` — one-click export of everything KAEL knows.

**Proactive nudges**
- The coach returns a structured verdict with a REASON; each nudge bubble shows
  "why:" plus snooze-1h and ✗ off-base buttons.
- Off-base feedback is stored and fed into the next coaching judgment.
- Quiet hours (Settings → Proactive), `POST /api/coach/snooze`,
  `GET /api/coach/nudges` (the log, in `data/nudges.jsonl`).

**Privacy**
- Local-only mode: blocks Claude, premium TTS, web search, and cloud coach
  models at the server. Persisted. `POST /api/config {localOnly:true}`.
- PANIC: `POST /api/panic` — stops all watching everywhere via the event bus,
  flips webcam/screen/awareness/training permissions off, turns local-only on.
- `docs/PRIVACY.md` — the complete egress contract.

**Testing**
- `node scripts/test.mjs` — 39 endpoint smoke tests against an isolated
  instance (own data dir + port; real `data/` untouched).

## Rollback

The pre-upgrade state is `main` at `c0901c0` (tagged `pre-64gb-upgrade`):

```bash
git checkout main            # old code back instantly
# then restart the server (kill node; the watchdog relaunches it)
```

Data is forward/back-compatible: v2 memory facts are objects, and the old server
would render them as `[object Object]` in the prompt — so if you roll back, also
restore `data/backups/<today>/memory.json` (taken daily) or strip the objects to
strings. Everything else (config extras, nudges.jsonl) is ignored by old code
harmlessly.

## New endpoints (also in API.md)

| Method | Path | What |
|---|---|---|
| GET/POST | `/api/profiles` | model profiles + routing; switch chatProfile, pin models |
| GET | `/api/memory/export` | download everything KAEL knows as one JSON |
| POST | `/api/panic` | emergency stop: all observation off, local-only on |
| POST | `/api/coach/snooze` | hush nudges for N minutes |
| POST | `/api/coach/feedback` | mark a nudge off-base (coach learns) |
| GET | `/api/coach/nudges` | the nudge log with reasons |

`POST /api/config` gains `localOnly`; `GET /api/health` gains `localOnly` +
`chatProfile`; awareness notes gain `confidence`; SSE gains `panic`,
`localonly.changed`, `coach.snoozed`, and `coach.nudge` now carries `reason`.

## Manual QA checklist (after Ctrl+R in the app window)

- [ ] Say something casual → instant reply, no "thinking with…" line (fast path untouched)
- [ ] Ask "explain the difference between X and Y" → status shows the 8B, reply streams
- [ ] Ask a code question → status shows qwen2.5-coder
- [ ] Settings → Brain profiles: five rows resolve to real models; recent routes listed
- [ ] Pin chatProfile to fast → code question stays on the 3B; back to auto
- [ ] Settings → Memory: facts show category chips; hover a chip → learned/confirmed dates; ✕ still deletes
- [ ] Settings → Privacy: Export downloads a JSON with your facts in it
- [ ] Local-only ON → header Claude toggle refuses; premium voice falls back to browser voice; "search the web for…" answers from knowledge instead
- [ ] PANIC (with awareness running) → capture badge disappears, permissions boxes untick, local-only flips on — on the phone too if paired
- [ ] Awareness on → notes show "· unsure" only on hard-to-read screens; ✎ correction still works
- [ ] Wait for a nudge → bubble shows "why: …" + 😴 1h + ✗ off-base; snooze silences it
- [ ] Quiet hours 23–08 → no nudges in that window
- [ ] Reminder from chat ("remind me in 2 minutes to stretch") still fires out loud
- [ ] Reboot → watchdog brings everything back; `/api/health` shows `supervised:true`
