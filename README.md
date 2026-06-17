# KAEL — Personal AI Voice Command Hub

KAEL is a sleek, single-user AI assistant you **talk to** — a JARVIS-style,
always-on voice command hub. You speak; KAEL listens, thinks, and answers out
loud, then keeps listening. It doesn't do the task for you, it **routes you
correctly** through the AI ecosystem (Claude, GPT‑4, Gemini, Cursor, Lovable,
Midjourney, Runway, ElevenLabs, Perplexity, and more) — telling you the exact
tool or workflow to use, and why.

It's intentionally minimal: a glowing voice orb, hands-free continuous
listening, spoken replies, and optional live web search — nothing else. A text
box is there as a fallback when you'd rather type.

## Features

- **Voice-first, hands-free** — talk to KAEL and it talks back. Continuous,
  always-on listening (it re-arms after every reply), with a reactive orb that
  shows when it's listening, thinking, or speaking.
- **Spoken, concise answers** — replies are tuned to be short and conversational
  (one to three sentences), since they're read aloud — no walls of text or URLs.
- **Streaming + sentence-chunked speech** — KAEL starts speaking as soon as the
  first sentence streams in, so there's no long pause.
- **Optional web search** via the Brave Search API — triggered when you say
  "search …" or ask for current info. No Brave key? KAEL just answers from
  knowledge.
- **Persistent conversation** within the session (in memory, no database).
- **Single-user, no auth** — it's your personal hub.
- **Text fallback** — a slim input is always there for quiet rooms or when voice
  isn't available.

> **Browser:** voice input uses the Web Speech API, which works in **Chrome or
> Edge** (desktop). In other browsers KAEL still speaks its replies and you can
> type — only the live mic input is unavailable.

## Tech stack

- **Frontend:** a single `public/index.html` — plain HTML + CSS + vanilla JS, no framework.
- **Backend:** Node.js + Express (`server.js`) — proxies the Claude API and Brave search.
- **AI:** the official `@anthropic-ai/sdk`, streaming via Server-Sent Events.
- **Voice:** the browser-native **Web Speech API** — `SpeechRecognition` for
  speech-to-text and `SpeechSynthesis` for KAEL's voice. No extra service or key.

## Project structure

```
kael/
├── server.js          # Express server: Claude streaming + optional web search
├── package.json
├── public/
│   └── index.html     # the entire UI (HTML + CSS + JS)
└── .env.example       # required/optional keys
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Add your API keys

```bash
cp .env.example .env
```

Then edit `.env`:

| Key | Required? | What it's for |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Talking to Claude. Get one at <https://console.anthropic.com/>. |
| `BRAVE_API_KEY` | No | Live web search. Free tier at <https://brave.com/search/api/>. Omit to disable search. |
| `PORT` | No | Port to run on (default `3000`). |

### 3. Run it

```bash
npm start
```

Open **<http://localhost:3000>** in Chrome or Edge.

## Talking to KAEL

1. **Tap the orb** (or the 🎙️ button) once to wake KAEL and allow microphone access.
   It then listens continuously, hands-free, indefinitely.
2. **Say its name to address it.** KAEL only answers when you say **"kael" at the
   start or end** of what you say — e.g. *"Kael, what's the best tool for a logo?"*
   or *"…what's the best tool for a logo, Kael?"*. Anything without the wake word is
   ignored, so it won't react to background chatter or you talking to someone else.
   A short **earcon** confirms the moment it accepts your wake word, so you always
   know whether it heard you. (Say just "Kael" on its own and it waits for your
   command.) The recognizer also accepts close-sounding variants, since "KAEL" is an
   uncommon name to transcribe.
3. **Nothing leaves the browser unless you address it.** Un-addressed speech is
   transcribed locally and discarded — only a command with the wake word is ever
   sent to the AI.
4. **Put it to sleep with your voice.** Say *"Kael, stop"* / *"go to sleep"* /
   *"that's all"* / *"mute"* and it replies "Going quiet" and stops listening until
   you tap the orb again.
5. After it answers out loud, it automatically starts listening again.
6. **🎙️ toggles** listening on/off. **⏹ stops** KAEL mid-sentence. **new chat**
   clears the conversation.
7. Prefer to type? Use the text box at the bottom anytime — typing never needs the
   wake word, and KAEL still speaks its reply.

The orb tells you the state at a glance: gently breathing = idle, teal sonar pulses =
listening, amber spin = thinking, fast bright pulse = speaking.

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

- Conversation history is kept **in memory** and resets when the server restarts
  or when you click **"new chat"**. There is no database by design.
- This is a single-user app with no authentication — run it locally or behind your
  own access control; don't expose it publicly with your API keys.

## License

MIT
