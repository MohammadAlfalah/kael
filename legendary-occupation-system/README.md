# 🧧 Legendary Occupation System

> ⚡ *A blue window unfolds in the air before you, politely ignoring the laws of physics.*
> **【 LEGENDARY OCCUPATION SYSTEM — ONLINE 】**
> *“Host detected. Employment status: tragic. Please select your next occupation. Compensation will be… generous.”*

A playable **system-genre life sim** in the spirit of manhua like *Legendary Car-Hailing System*: the System asks you to choose a career, instantly showers you with an absurd signing package — choose Streamer and receive **a riverside loft with a full studio rig and 10,000 followers**; choose Driver and receive **a new car and a Platinum License** — and then starts dispatching clients your way. Most are ordinary. Some are **dragon kings, fox spirits, gods of wealth, and one ghost bride with an undelivered letter**.

Zero-dependency game core (plain JavaScript, seeded and deterministic), playable in the terminal **and** the browser, with an AI companion that actually thinks.

## Choose your destiny

| | Occupation | Awakening Grant |
|---|---|---|
| 🚖 | **Ride-Hailing Driver** | White Cloud Sedan · Platinum License · €8,888 signing bonus |
| 🎙️ | **Streamer** | Riverside loft (deed included!) · full studio rig · 10,000 followers |
| 🥡 | **Night-Market Chef** | Famous wok stall · hundred-year wok · secret sauce · €7,777 |
| 🩺 | **Clinic Physician** | Your own clinic · the Nine Golden Needles · €9,999 |
| 🏮 | **Landlord** | An entire six-floor building · master keys · €5,555 renovation fund |

Every path shares one city and one hidden world: the same 13 legendary clients visit each career differently. The Dragon King inspects a chef's seafood menu *personally*; Meng Po challenges you to a soup-off; the Great Sage breaks speedrun world records on your stream; Nezha skateboards your corridors at 2 a.m.

## The System has a mind — a real one

The System isn't a message log. It is an **agentic AI companion with a conscience**:

- **It thinks.** Its reasoning is visible in-game as a dimmed *SYSTEM CORE · reasoning* trace before it speaks — chat runs at high reasoning effort, quick banter stays snappy.
- **It reads your records.** In full-mind mode it carries five read-only tools into the live game state — `system_scan`, `review_missions`, `review_codex`, `review_build`, `review_ledger` — and consults them before advising. Ask "what should I focus on next?" and it checks your actual quests, stamina, favor levels, and savings before answering; it is instructed never to invent a number the records can tell it.
- **It judges.** A moral ledger tracks your kindness and your greed. Return a lost phone and it is proud of you; pawn one and it will bring it up later. It never celebrates a profitable wrong — and never advises one.
- **It remembers.** The ledger and conversation memory persist with your save.
- **It talks about anything.** Ask it for dumpling recipes, JavaScript closures, or life advice — it is a fully capable assistant playing the System with total sincerity.

Two modes:

| Mode | What it is | How |
|---|---|---|
| **Offline shard** | Scripted personality + real conscience ledger. No network, no key. | Default, always works |
| **Full mind** | A live Claude model running the agentic tool loop, adaptive thinking (summarized display), refusal fallbacks enabled | CLI: `npm install` + `ANTHROPIC_API_KEY` env var. Web: paste a key under **⚙ Mind & Save** |

Models: `claude-opus-5` by default; set `LOS_MODEL=claude-fable-5` (CLI) or pick it in the web selector for Anthropic's most advanced model (premium pricing), or drop to `claude-sonnet-5` / `claude-haiku-4-5` for speed. `LOS_EFFORT` tunes chat reasoning depth (`high` default). Keys pasted in the web version stay in your browser's local storage and are sent only to `api.anthropic.com`.

## Play

```bash
npm install        # only needed for the AI mind; the game itself has zero deps
npm start          # terminal game
```

Or open **`web/index.html`** in a browser — same engine, neon System-window UI, autosaves to localStorage.

```bash
npm test           # 45 deterministic tests (engine, content integrity, mind, build)
npm run build      # dist/artifact.html — single self-contained file, publishable as a claude.ai Artifact
```

## What's in the box

- **Story spine** — an 8-quest main chain: your first job, the Ghost Bride on job three (every occupation gets its own scene of her), rising fame, and finally a personal inspection by the **Jade Emperor**, whose mandate unlocks each career's mythic tier (yes, the flying car).
- **Living clientele** — 30 mortal regulars and 13 legends with favor tracks, gifts (the celestial hound insists on treats), and permanent blessings at favor milestones.
- **Choice-driven events** — 50+ scenes with skill-, item-, and stat-gated options. Yin-Yang Eyes changes what you can see; a Peace Talisman changes what you can survive; kindness changes what the System thinks of you.
- **Progression** — levels and titles (System Rookie → Living Legend), EXP, stamina, a day/night cycle where legends walk at night, workplace tiers and part upgrades, equippable skills, daily missions, sign-in streaks, achievements.
- **Wheel of Destiny** — gacha with a pity counter (epic-class guaranteed within 10 spins; the System is generous, not cruel).
- **Legend Contracts** — patrons at Favor 3+ extend multi-day contracts (complete N jobs, earn €N, spotless streaks…) with rich rewards, 1.5× from legendary-tier patrons, and deeper favor on fulfillment.
- **Records & broadcasts** — a lifetime-stats and achievements panel, and a 【 SYSTEM BROADCAST 】 rumor about the hidden world each morning (AI-composed in full-mind mode).
- **Deterministic core** — one seed, one story: the engine is pure and fully replayable, which is how it's tested.

## Architecture

```
src/content.js   game data: occupations, grants, clients, legends, events, items…
src/engine.js    pure deterministic engine (UMD: Node + browser), save/load
src/mind.js      SystemMind: persona, game-record tools, moral ledger, offline shard
src/mind-node.js agentic Claude backend for the CLI (official @anthropic-ai/sdk)
src/cli.js       terminal client
web/index.html   browser client (single-theme System-window UI)
scripts/build-artifact.js  → dist/artifact.html (single file, no skeleton)
test/            node --test suites: engine, content integrity, mind, build
```

The engine mutates a plain-JSON state and returns `{ok, …}` results; every random draw goes through one seeded RNG stored in the state, so identical seeds and choices replay identical lives.

## Credits

An original fan homage to the system/golden-finger genre of Chinese webcomics and web novels — no affiliation with any specific title. Legendary passengers are drawn from public-domain Chinese mythology and folklore. MIT licensed.
