# KAEL — a local-first voice assistant I actually talk to

A JARVIS-style, always-on AI hub that runs on a free local model by default. Hold a key, talk, let go — it thinks and answers out loud.

I wanted a "second brain" I could just *speak* to, without piping my screen and my life through someone else's API. So KAEL runs on a free local model via [Ollama](https://ollama.com) out of the box — no key, no tokens, nothing leaves the machine — and I can flip it to Claude with one click when I want sharper answers. It's a normal conversational assistant first: it answers what I ask, remembers what matters, and speaks back. This is my ongoing personal project, and I keep adding to it.

The whole front end is one `public/index.html` — plain HTML/CSS/vanilla JS, no framework, no build step. The back end is a single `server.js` (Node + Express). I kept it deliberately small so I'd actually understand every line of it.

## What it does

- **One brain per job (model profiles).** KAEL routes each message to the right local model: a snappy 3B for everyday voice chat, an 8B for "explain / compare", a coder 7B for code questions, a 14B for hard reasoning — picked automatically per message (or pinned), with a visible "thinking with …" status and a routing log so you always know which brain answered. Missing models fall back gracefully; nothing breaks if a tier isn't pulled. See [`docs/MODELS.md`](docs/MODELS.md).
- **Push-to-talk or open mic.** Default is hold-Space-to-talk, so the mic is only ever live while I'm holding a key — no wake word, no always-listening. Rebind it to any key or mouse button in Settings, or switch to hands-free open mic where it sends after you pause and re-arms after it replies.
- **Speaks its replies, and starts speaking early.** Answers are tuned short (one to three sentences, since they're read aloud) and stream sentence-by-sentence so there's no dead pause. It picks the best neural browser voice by default; drop in an OpenAI key and Settings unlocks `tts-1-hd` neural TTS (the key stays server-side — the browser only gets audio).
- **Web search with no setup.** When a question needs current info it searches on its own. It falls back to a free DuckDuckGo scrape so search works with zero config; add a Brave Search API key for sharper results and higher limits.
- **Persistent memory.** It remembers across restarts and reboots — durable facts (each with a category, source, and learned/confirmed dates), plus a rolling summary of older chats, written to disk under `data/` (gitignored). The summarizing runs on the free local model, so it costs no tokens and stays private. Only a bounded window + the summary ever goes to the model, so context never overflows. Review, edit, delete, or **export everything** from Settings.
- **Ambient awareness (off by default).** It can glance at a screen I share plus a quick webcam frame every few minutes, run them through a **local** vision model (`qwen2.5vl:3b`), and keep a one-line note of what I'm doing — so it has real context. Frames go only to the local model and are never saved (unless you explicitly opt in to training-data collection, which stores screenshots locally under `data/training/`), and it flat-out refuses to send frames anywhere remote — both non-local Ollama URLs and Ollama's `*-cloud` models are blocked. I removed the sensitive-screen auto-skip on purpose: it describes whatever is on my screen, my choice.
- **Proactive coaching.** Tell it what I'm focusing on and it watches my activity against that, speaking up *sparingly* when I drift or grind too long. Every nudge shows **why** it spoke, with snooze and "off-base" buttons (the coach learns from those); cooldowns, quiet hours, and a nudge log keep it a presence, not a nag.
- **Conversational task manager.** Mention a task in chat ("finish X by Friday, email my prof tonight") and it captures both with deadlines, prioritizes them, breaks them into steps, and answers "what should I work on?" from the list.
- **Reminders & routines.** "Remind me at 5pm to email my prof" just works — chat extraction turns it into a schedule that fires *out loud* on every connected device. One-offs and daily/weekly routines, managed in Settings or by voice. Reminders missed while KAEL was off are skipped with a note, not blurted hours late.
- **A planner.** Say "plan: …" and KAEL decomposes the goal into tool steps (web search / remember / add task / set reminder), runs them one by one with live progress, and speaks a synthesized answer. Bounded on purpose: ≤5 steps, one plan at a time, every run logged.
- **Use it from your phone.** Set `KAEL_HOST=0.0.0.0`, open the pairing link from Settings → Devices on your phone (same Wi-Fi), and Add to Home Screen — the PWA installs full-screen and stays paired via a device token. Everything syncs live over one event stream (SSE): tasks, reminders, nudges, provider flips.
- **Permissions switchboard.** One place in Settings to switch capabilities off — web search, the paid backends, webcam, screen, training collection, remote access — enforced server-side, so "off" means off everywhere.
- **Privacy controls with teeth.** A **local-only mode** that blocks every cloud path at the server (Claude, OpenAI voice, web search, the cloud coach) and a **PANIC button** that instantly stops all screen/webcam watching on every device and flips local-only on. Exactly what can ever leave the machine is documented in [`docs/PRIVACY.md`](docs/PRIVACY.md).
- **Runs 24/7.** A watchdog (`scripts/watchdog.mjs`) supervises the server: restart on crash with backoff, restart when hung (health checks), logs under `data/logs/`, daily backups of every store under `data/backups/`, and unclean-shutdown detection so a crash is visible, not silent.
- **A 3D orb.** The status indicator is a WebGL energy core (Three.js) that reacts to listening / thinking / speaking, with a 2D fallback when WebGL isn't available.
- **Installable as a PWA** — manifest + service worker, so it runs in its own window with the orb icon.

Full design docs live in [`docs/`](docs/) — architecture (with diagrams), the complete API + event protocol, every data-store schema, and the roadmap (native Android, AR glasses).

## Tech

- **Backend:** Node 18+ / Express (`server.js`) — streams the chosen model over SSE and proxies search.
- **Frontend:** one `public/index.html`, vanilla JS, no framework/build.
- **AI:** local model via Ollama by default; one-click switch to Claude (`@anthropic-ai/sdk`). Both stream token-by-token, so the UI is identical either way.
- **Voice:** browser-native Web Speech API for speech-to-text, with optional OpenAI TTS for output.

Dependencies are just `express`, `@anthropic-ai/sdk`, and `dotenv`.

## Running it

You need [Ollama](https://ollama.com) and a model — that's the free brain:

```bash
ollama pull llama3.2          # small, fast, runs on a modest laptop GPU
```

That's enough. With more RAM, pull the full profile lineup so KAEL can route
each message to the right brain (all optional — see [`docs/MODELS.md`](docs/MODELS.md)):

```bash
ollama pull huihui_ai/qwen3-abliterated:8b   # balanced reasoning
ollama pull qwen3:14b                        # deep reasoning
ollama pull qwen2.5-coder:7b                 # coding
ollama pull qwen2.5vl:7b                     # ambient awareness (vision)
node scripts/benchmark.mjs                   # see what your hardware actually does
```

Then:

```bash
npm install
npm start
```

Open <http://localhost:3000> in **Chrome or Edge** (live mic input uses the Web Speech API, which only those support — elsewhere it still speaks and you can type).

It runs with zero config. If you want to change anything, copy the example env and edit it:

```bash
cp .env.example .env
```

Everything is optional:

| Key | What it does |
|---|---|
| `OLLAMA_MODEL` | Local model (default `llama3.2`). Point it at a bigger one for sharper answers. |
| `OLLAMA_URL` | Where Ollama listens (default `http://localhost:11434`). |
| `KAEL_PROVIDER` | Startup backend: `ollama` (default) or `claude`. |
| `ANTHROPIC_API_KEY` | Enables the Claude switch. Without it, KAEL stays local. |
| `OPENAI_API_KEY` | Enables the premium neural voice. Omit for the free browser voice. |
| `BRAVE_API_KEY` | Sharper web search. Omit and it uses the free DuckDuckGo fallback. |
| `AWARENESS_MODEL` | Local vision model for ambient awareness (default `qwen2.5vl:7b`, auto-falls back to `:3b`). |
| `KAEL_TIMEZONE` | IANA zone it's time-aware of (default `Europe/Berlin`). |
| `PORT` | Default `3000`. |
| `KAEL_HOST` | Bind address (default `127.0.0.1` — localhost only). Set `0.0.0.0` to reach KAEL from your phone/tablet; non-local devices must then pair with the device token. |
| `KAEL_TOKEN` | Device token for non-local access. Auto-generated + persisted on first boot if unset — you normally never touch this. |

The top-right pill (⚡ local / ✦ claude) flips backends live — no restart.

## A note on the fine-tuning track

There's a full vision fine-tuning pipeline in [`scripts/finetune/`](scripts/finetune/) for training the local vision model on my own screenshots, plus an opt-in mode that collects `(screenshot, caption)` pairs into `data/training/`. I wrote it with an honest verdict up top: for a one-line activity caption, the in-context "learned profile" KAEL already has gets ~80–90% of the benefit for free, so fine-tuning usually isn't worth it until you've got a few hundred labeled screens and hit a real ceiling. It's there for when that day comes.

## Honest limitations

- Single-user by design. It binds to `127.0.0.1` by default; opening it up with `KAEL_HOST=0.0.0.0` puts every `/api/*` route behind a device token (pairing link in Settings → Devices) — but it's still one user's brain, not a multi-tenant system, and the pairing link itself is a secret: anyone you give it to *is* you.
- Live mic input needs a Chromium browser (Web Speech API). Other browsers get spoken replies + the text box only.
- The local 3B model is great for chat but the coaching *judgment* really wants a stronger model to tell drift from focus; you can point that at a cloud model in Settings (which then sees activity *summaries*, never screenshots) or keep it fully local.

## License

MIT