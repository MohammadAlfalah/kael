# KAEL — Personal AI Voice Command Hub

KAEL is a sleek, single-user AI assistant you **talk to** — a JARVIS-style
voice command hub. Hold your push-to-talk key, speak, and release; KAEL thinks
and answers out loud. It's a normal conversational assistant first — it answers
what you ask and remembers what matters, and only points you to a specific tool
or app when you explicitly ask for one.

It's intentionally minimal: a glowing voice orb, push-to-talk input, spoken
replies, and optional live web search — nothing else. A text box is there as a
fallback when you'd rather type.

## Features

- **Push-to-talk _or_ open mic** — pick your input style in ⚙ Settings.
  **Push-to-talk** (default): hold a key (or mouse button) you choose, speak, and
  release to send — the mic is only ever live while you hold it. **Open mic**
  (hands-free): KAEL listens continuously and sends automatically when you pause,
  then re-arms after it replies; tap the orb to pause/resume or to interrupt it
  mid-sentence. A reactive orb shows when it's listening, thinking, or speaking.
- **Natural voice** — KAEL prefers the highest-quality neural / "natural" voice
  your browser offers (smoothest in Microsoft Edge) instead of the robotic system
  default, and you can pick the exact voice in ⚙ Settings.
- **Premium voice (optional)** — set an OpenAI key and ⚙ Settings gains a toggle
  for OpenAI's neural TTS (`tts-1-hd`) — dramatically smoother than any browser
  voice. The key stays server-side (the browser only ever receives audio), and
  KAEL falls back to the free voice automatically if it's off or unavailable.
  Costs roughly a dollar a month at single-user volume.
- **Spoken, concise answers** — replies are tuned to be short and conversational
  (one to three sentences), since they're read aloud — no walls of text or URLs.
- **Streaming + sentence-chunked speech** — KAEL starts speaking as soon as the
  first sentence streams in, so there's no long pause.
- **Optional web search** via the Brave Search API — triggered when you say
  "search …" or ask for current info. No Brave key? KAEL just answers from
  knowledge.
- **Always knows the time** — the current German (`Europe/Berlin`) date and time is
  injected into KAEL's context on every turn, so it's time-aware without you asking
  (greetings, "today/tonight", scheduling) — it just won't recite the clock unless
  it's relevant. Change the zone with `KAEL_TIMEZONE` in `.env`.
- **Listening mode** — say "switch to listening mode" and KAEL goes quiet and simply
  records everything it hears (shown on screen + saved to `data/listening.jsonl`,
  gitignored) without replying. Say "normal mode" to switch back. Great for dictation
  or capturing a conversation hands-free.
- **Persistent long-term memory** — KAEL remembers across restarts and reboots.
  It keeps a rolling summary of older chats plus a profile of durable facts about
  you, saved to disk (`data/`, gitignored). The summarizing is done by the free
  local model, so nothing leaves your machine and it costs no API tokens.
- **Ambient awareness (optional, off by default)** — KAEL can glance at a screen
  you share plus a quick webcam frame every few minutes, run them through a **local
  vision model** (Ollama, default `qwen2.5vl:3b`), and remember a one-line note of
  what you're doing — so it has real context (_"you've been heads-down a while —
  want a break?"_). Fully private: frames go only to the local model, **no images are
  ever saved**, and nothing leaves your machine (it _refuses_ a non-local Ollama). You
  choose the screen to share, the webcam light blinks on each glance, an on-screen badge
  shows when it's watching, sensitive screens (banking/passwords) are auto-skipped, and
  you can pause anytime. Turn it on in ⚙ Settings → **Awareness**.
- **Proactive coaching (your second brain)** — tell KAEL what you're focusing on
  (type it, or just say _"I'm working on …"_) and it watches your activity against
  that focus, speaking up **sparingly** when you drift off, grind too long, or get
  stuck — and acknowledging real focus. Built on awareness; a cooldown keeps it from
  nagging. The coaching _judgment_ needs a capable model (a 3B can't tell drift from
  focus reliably), so it defaults to a stronger model — note that a cloud coach model
  sees your activity **summaries** (text lines, never screenshots); switch it to a
  local model in Settings for full privacy.
- **Sharper eyes & a path to real fine-tuning (optional)** — an opt-in **OCR**
  toggle feeds the exact on-screen text to the vision model for small-text-heavy
  screens, and an opt-in **"collect training data"** mode saves `(screenshot, caption)`
  pairs (your ✎ corrections re-label them) into `data/training/` to build a dataset
  for an eventual fine-tune. The full, researched fine-tuning pipeline + scripts live
  in [`scripts/finetune/`](scripts/finetune/) — with an honest "is it even worth it
  yet?" guide (usually: the in-context learned profile beats fine-tuning until you
  have 300+ labeled screens).
- **Control panel** — ⚙ Settings also lets you switch the local model, tune the
  reply temperature, edit KAEL's persona, and view/edit what it remembers about you.
- **On-screen extras** — replies render markdown, each message has Copy / Replay /
  Regenerate actions, and the conversation survives a reload.
- **Single-user, no auth** — it's your personal hub.
- **Text fallback** — a slim input is always there for quiet rooms or when voice
  isn't available.

> **Browser:** voice input uses the Web Speech API, which works in **Chrome or
> Edge** (desktop). In other browsers KAEL still speaks its replies and you can
> type — only the live mic input is unavailable.

## Tech stack

- **Frontend:** a single `public/index.html` — plain HTML + CSS + vanilla JS, no framework.
- **Backend:** Node.js + Express (`server.js`) — streams from the chosen model and proxies Brave search.
- **AI:** a **free local model via [Ollama](https://ollama.com)** by default (no key, no tokens,
  private), with a one-click switch to **Claude** (`@anthropic-ai/sdk`). Both stream
  token-by-token via Server-Sent Events, so the UI is identical either way.
- **Voice:** the browser-native **Web Speech API** — `SpeechRecognition` for
  speech-to-text and `SpeechSynthesis` for KAEL's voice. No extra service or key.

## Project structure

```
kael/
├── server.js          # Express server: local/Claude streaming + optional web search
├── package.json
├── public/
│   ├── index.html            # the entire UI (HTML + CSS + JS)
│   ├── manifest.webmanifest  # PWA manifest (installable app)
│   ├── sw.js                 # service worker (installability + offline shell)
│   └── icons/                # app icons (orb) + .ico for the desktop shortcut
├── data/              # persistent long-term memory (gitignored, created at runtime)
└── .env.example       # required/optional keys
```

## Getting started

### 1. Install Ollama and pull a model (the free brain)

KAEL runs on a **free, local model** by default — no API key, no tokens, fully
private. Install [Ollama](https://ollama.com), then pull a model:

```bash
ollama pull llama3.2
```

`llama3.2` (3B) is small, fast, and runs comfortably on a modest GPU/laptop.
Want sharper answers and have the hardware? Pull a bigger one (`ollama pull
qwen2.5` or `ollama pull llama3.1`) and set `OLLAMA_MODEL` in `.env`.

Want the optional **ambient awareness** feature? Also pull a vision model — it
stays warm and glances in well under a second once loaded:

```bash
ollama pull qwen2.5vl:3b
```

Make sure Ollama is running (`ollama serve`, or just launch the Ollama app).

### 2. Install dependencies

```bash
npm install
```

### 3. Configure (optional)

KAEL works with **zero configuration** — skip this step to just run it. Create a
`.env` only if you want to change the model, enable web search, or use Claude:

```bash
cp .env.example .env
```

| Key | Required? | What it's for |
|---|---|---|
| `OLLAMA_MODEL` | No | Local model to use (default `llama3.2`). |
| `OLLAMA_URL` | No | Where Ollama is listening (default `http://localhost:11434`). |
| `KAEL_TIMEZONE` | No | IANA timezone KAEL is "aware" of (default `Europe/Berlin`). |
| `ANTHROPIC_API_KEY` | No | Only to enable the **Claude** backend. Get one at <https://console.anthropic.com/>. |
| `OPENAI_API_KEY` | No | Enables the **premium voice** (OpenAI neural TTS). Get one at <https://platform.openai.com/api-keys>. Omit to use the free browser voice. |
| `OPENAI_TTS_MODEL` | No | Premium voice model: `tts-1-hd` (default, best) or `tts-1` (cheaper). |
| `OPENAI_TTS_VOICE` | No | Default premium voice: `alloy`, `echo`, `fable`, `onyx`, `nova`, or `shimmer` (default — softest). |
| `BRAVE_API_KEY` | No | Live web search. Free tier at <https://brave.com/search/api/>. Omit to disable search. |
| `PORT` | No | Port to run on (default `3000`). |

### 4. Run it

```bash
npm start
```

Open **<http://localhost:3000>** in Chrome or Edge.

## Install as an app

KAEL is a **PWA**, so you can run it as a real app with its own window and icon —
no browser tabs, no address bar — while keeping all the voice features (which need
a Chrome/Edge engine to work).

- **Install it:** open KAEL in **Edge or Chrome**, then use the **install icon** in
  the address bar (or **⋯ menu → Apps → Install this site as an app**). It gets a
  Start-menu / taskbar entry with the KAEL orb icon and launches in its own window.
- **Or just an app window:** the included **Desktop shortcut** (and the autostart at
  login) open KAEL with `msedge --app=http://localhost:3000` — a standalone window
  without installing anything.

Either way the server still runs locally (`npm start` / the autostart task); the app
window is just a clean front-end onto `http://localhost:3000`.

## Switching backends (free local ⇄ Claude)

KAEL starts on the **free local model**. The pill in the top-right of the header
shows the active backend — **⚡ local** or **✦ claude** — and clicking it flips
between them instantly. No restart, no code change; every following turn uses
whichever is selected.

- **⚡ local** — your machine answers. Free, private, offline, no tokens.
- **✦ claude** — Anthropic's Claude answers. Sharper on hard questions, but uses
  your API tokens. Only available when `ANTHROPIC_API_KEY` is set; otherwise the
  switch is politely refused and KAEL stays local.

You can also set the startup default with `KAEL_PROVIDER=ollama` (or `claude`) in `.env`.

## Talking to KAEL

1. **Hold your push-to-talk key and speak.** By default it's the **Space bar** —
   hold it, talk, and release to send. The mic is only live while you hold, so KAEL
   never listens to the room and there's no wake word to remember. The first time,
   your browser asks for microphone access. A short **earcon** confirms the mic
   opening and closing.
2. **Don't like Space?** Open **⚙ Settings → Push-to-talk key**, click **Rebind**,
   and press whatever you want — any keyboard key, or a mouse button (middle, right,
   back, or forward). Press Esc to cancel. Your choice is saved across restarts.
3. **No hands on the keyboard?** Press **and hold the orb** (or the 🎤 button) to
   talk instead — release to send. Works with touch, too.
4. **Prefer fully hands-free?** Open **⚙ Settings → Input mode → Open mic**. Now
   KAEL listens all the time and sends automatically a moment after you stop
   talking — no key to hold. Tap the orb to pause/resume listening, or to cut KAEL
   off while it's speaking. (It briefly stops listening while it talks so it never
   hears its own voice — best in a reasonably quiet room.)
5. **Barge in anytime.** In push-to-talk, start holding to talk while KAEL is
   mid-reply and it stops and listens immediately. In open mic, tap the orb.
5. **⏹ stops** KAEL mid-sentence without sending anything. **new chat** clears the
   on-screen conversation (long-term memory is kept).
6. **Just want it to take notes?** Say **"switch to listening mode"** (or type it).
   KAEL stops replying and records everything it hears — each line is shown on screen
   and appended to `data/listening.jsonl`. A red **● REC** badge stays up the whole
   time. Say **"normal mode"** (or "switch back to normal mode") to resume. Pairs
   naturally with open mic for fully hands-free capture.
7. Prefer to type? Use the text box at the bottom anytime — KAEL still speaks its reply.

The orb tells you the state at a glance: gently breathing = idle/ready, teal sonar
pulses = listening (key held), amber spin = thinking, fast bright pulse = speaking.

> Keep the server running (just leave `npm start` going) and KAEL stays available
> all the time. To have it launch automatically when your machine boots, run it
> under a process manager or a startup task.

## How web search works

KAEL searches the web when your message contains the word **"search"** or asks for
current/live information (e.g. "latest", "today", "news", "price"). The server
queries Brave, injects the top results into the conversation as context, and KAEL
summarizes them concisely with sources. Everything else is answered directly from
the model — no unnecessary searches.

## Customizing KAEL

KAEL's persona lives in the `KAEL_SYSTEM_PROMPT` constant at the top of
[`server.js`](server.js). Edit it to change its name, tone, or expertise.

## Notes

- KAEL's memory is **persisted to disk** under `data/` (gitignored) so it survives
  restarts and reboots: a profile of durable facts about you, a rolling summary of
  older conversations, and the most recent turns verbatim. The full raw transcript
  is also appended to `data/transcript.jsonl`. Only a bounded window plus the
  summary is fed to the model, so the context never overflows no matter how long
  the history grows. Clicking **"new chat"** starts a fresh conversation but KEEPS
  long-term memory; a complete wipe is `POST /api/reset` with body `{"all":true}`.
  Inspect what KAEL remembers anytime at `GET /api/memory`.
- This is a single-user app with no authentication — run it locally or behind your
  own access control; don't expose it publicly with your API keys.

## License

MIT
