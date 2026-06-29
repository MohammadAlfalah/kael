# KAEL — a local-first voice assistant I actually talk to

A JARVIS-style, always-on AI hub that runs on a free local model by default. Hold a key, talk, let go — it thinks and answers out loud.

I wanted a "second brain" I could just *speak* to, without piping my screen and my life through someone else's API. So KAEL runs on a free local model via [Ollama](https://ollama.com) out of the box — no key, no tokens, nothing leaves the machine — and I can flip it to Claude with one click when I want sharper answers. It's a normal conversational assistant first: it answers what I ask, remembers what matters, and speaks back. This is my ongoing personal project, and I keep adding to it.

The whole front end is one `public/index.html` — plain HTML/CSS/vanilla JS, no framework, no build step. The back end is a single `server.js` (Node + Express). I kept it deliberately small so I'd actually understand every line of it.

## What it does

- **Push-to-talk or open mic.** Default is hold-Space-to-talk, so the mic is only ever live while I'm holding a key — no wake word, no always-listening. Rebind it to any key or mouse button in Settings, or switch to hands-free open mic where it sends after you pause and re-arms after it replies.
- **Speaks its replies, and starts speaking early.** Answers are tuned short (one to three sentences, since they're read aloud) and stream sentence-by-sentence so there's no dead pause. It picks the best neural browser voice by default; drop in an OpenAI key and Settings unlocks `tts-1-hd` neural TTS (the key stays server-side — the browser only gets audio).
- **Web search with no setup.** When a question needs current info it searches on its own. It falls back to a free DuckDuckGo scrape so search works with zero config; add a Brave Search API key for sharper results and higher limits.
- **Persistent memory.** It remembers across restarts and reboots — a profile of durable facts plus a rolling summary of older chats, written to disk under `data/` (gitignored). The summarizing runs on the free local model, so it costs no tokens and stays private. Only a bounded window + the summary ever goes to the model, so context never overflows.
- **Ambient awareness (off by default).** It can glance at a screen I share plus a quick webcam frame every few minutes, run them through a **local** vision model (`qwen2.5vl:3b`), and keep a one-line note of what I'm doing — so it has real context. Frames go only to the local model, no images are ever saved, sensitive screens get auto-skipped, and it flat-out refuses a non-local Ollama URL.
- **Proactive coaching.** Tell it what I'm focusing on and it watches my activity against that, speaking up *sparingly* when I drift or grind too long. A cooldown keeps it from nagging.
- **Conversational task manager.** Mention a task in chat ("finish X by Friday, email my prof tonight") and it captures both with deadlines, prioritizes them, breaks them into steps, and answers "what should I work on?" from the list.
- **A 3D orb.** The status indicator is a WebGL energy core (Three.js) that reacts to listening / thinking / speaking, with a 2D fallback when WebGL isn't available.
- **Installable as a PWA** — manifest + service worker, so it runs in its own window with the orb icon.

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
ollama pull qwen2.5vl:3b      # only if you want the ambient-awareness feature
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
| `AWARENESS_MODEL` | Local vision model for ambient awareness (default `qwen2.5vl:3b`). |
| `KAEL_TIMEZONE` | IANA zone it's time-aware of (default `Europe/Berlin`). |
| `PORT` | Default `3000`. |

The top-right pill (⚡ local / ✦ claude) flips backends live — no restart.

## A note on the fine-tuning track

There's a full vision fine-tuning pipeline in [`scripts/finetune/`](scripts/finetune/) for training the local vision model on my own screenshots, plus an opt-in mode that collects `(screenshot, caption)` pairs into `data/training/`. I wrote it with an honest verdict up top: for a one-line activity caption, the in-context "learned profile" KAEL already has gets ~80–90% of the benefit for free, so fine-tuning usually isn't worth it until you've got a few hundred labeled screens and hit a real ceiling. It's there for when that day comes.

## Honest limitations

- Single-user, no auth — run it locally or behind your own access control, don't expose it publicly with your keys.
- Live mic input needs a Chromium browser (Web Speech API). Other browsers get spoken replies + the text box only.
- The local 3B model is great for chat but the coaching *judgment* really wants a stronger model to tell drift from focus; you can point that at a cloud model in Settings (which then sees activity *summaries*, never screenshots) or keep it fully local.

## License

MIT