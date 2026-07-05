# KAEL's brains — the model profile system

Since the 64GB RAM upgrade (2026-07), KAEL doesn't use one model for everything —
it has **one brain per job**, picked automatically per message (or pinned by you).

## The profiles

| Profile | Default model | Size | Context | Speed on this PC* | Used for |
|---|---|---|---|---|---|
| **fast** | whatever the Brain picker says (`huihui_ai/llama3.2-abliterate`) | 2.2GB | 8k | ~80 tok/s, fully on GPU | everyday voice chat, nudges, memory upkeep |
| **balanced** | `huihui_ai/qwen3-abliterated:8b` | 5.0GB | 16k | ~15-30 tok/s | "explain / compare / help me decide", planner |
| **deep** | `qwen3:14b` | 9.3GB | 24k | ~5-10 tok/s (GPU+RAM split) | architecture, strategy, hard reasoning |
| **coding** | `qwen2.5-coder:7b` | 4.7GB | 16k | ~15-30 tok/s | code questions, debugging, review |
| **vision** | `qwen2.5vl:7b` (falls back to `:3b`) | 6.0GB | 8k | one glance ≈ 1-3s warm | screen + webcam awareness |

\* RTX 3060 Laptop 6GB VRAM + i7-11800H + 64GB DDR4-3200. Run
`node scripts/benchmark.mjs` for live numbers on your box.

## Why these sizes (the honest hardware math)

The RAM upgrade (16 → 64GB) did **not** make the GPU bigger. The 6GB of VRAM is
still the speed ceiling:

- **≤3B (Q4)** fits entirely in VRAM → very fast. This stays the daily driver
  because KAEL is a *voice* assistant and latency is the product.
- **7-8B (Q4)** mostly fits in VRAM; the spillover lives in RAM. Noticeably
  smarter, still conversational speed.
- **14B (Q4)** splits roughly half GPU / half RAM → single-digit tok/s. Worth it
  only when quality matters more than waiting; that's exactly what routing is for.
- Bigger than ~14B is possible RAM-wise (up to ~30GB models load fine) but drops
  to CPU-bound ~2-3 tok/s — unusable for voice. Don't bother unless it's a
  background job.

What 64GB actually buys: the bigger tiers can **load at all**, several models can
stay **warm simultaneously** (vision + chat + coder swap without disk churn,
thanks to the OS file cache), and context windows can grow (8k → 16-24k) since KV
cache spills to RAM instead of crashing.

## Routing (chatProfile = `auto`, the default)

Per message, cheap transparent regexes — never a model call:

1. Code words (`bug`, `function`, `stack trace`, a language name, backticks…) → **coding**
2. Deep words (`architecture`, `strategy`, `trade-offs`, `think it through`…) or >500 chars → **deep**
3. Explain words (`explain`, `compare`, `why does`, `walk me through`…) or >200 chars → **balanced**
4. Everything else → **fast** (instant, like before)

Every decision is visible: Settings → Brain profiles shows what each profile
resolves to right now and which brain answered your recent messages; the chat
shows a "thinking with …" status line whenever a turn upshifts.

Pin instead of route: set `chatProfile` to a fixed profile in Settings, or
`POST /api/profiles {"chatProfile":"deep"}`.

## Fallbacks

A profile is a *candidate list*, best-first. If a model isn't installed the
profile silently falls down its list and ultimately lands on the fast model —
a missing pull can never break a turn. `GET /api/profiles` shows `fellBack: true`
plus what to `ollama pull` to light the tier up properly.

Other jobs and their brains:

- **Memory summarization** (fold-into-summary) → fast model, always local, free.
- **Planner** (`plan: …`) → balanced.
- **Proactive coach / task extraction** → `gpt-oss:120b-cloud` by default (text
  timeline only, disclosed in Settings) — switchable to any local model, and
  forced local by local-only mode.
- **Vision glances** → the awareness model (Settings → Awareness).

## Thinking models

qwen3-family models are "thinking" models. KAEL disables thinking for chat
(`think:false`) — a voice assistant can't sit silent through a hidden reasoning
phase. Even without it the 8B/14B beat the 3B clearly. If you want maximum
reasoning with visible effort, that's what the Claude header toggle is for.

## Changing the lineup

- Swap a tier: `POST /api/profiles {"profile":"deep","model":"<installed-model>"}`
  (or clear with `"model":null`). Persists in `data/config.json`.
- Edit defaults: the `MODEL_PROFILES` table at the top of `server.js`.
- Benchmark a candidate first: `node scripts/benchmark.mjs --models <name>`.
- Keep-alives: the fast model stays pinned (`OLLAMA_KEEP_ALIVE`, `-1` = forever);
  routed brains use `PROFILE_KEEP_ALIVE` (default 15m) so they don't squat on
  VRAM all day; vision uses `AWARENESS_KEEP_ALIVE` (default 10m).

## Env knobs (all optional)

```
KAEL_CTX=8192                # fast-profile context window
KAEL_RECENT_WINDOW=24        # verbatim messages kept in context
KAEL_SUMMARIZE_TRIGGER=36    # fold into summary past this
KAEL_MAX_FACTS=48            # durable memory facts cap
PROFILE_KEEP_ALIVE=15m       # how long routed brains stay warm
AWARENESS_MODEL=qwen2.5vl:7b # vision default
```
