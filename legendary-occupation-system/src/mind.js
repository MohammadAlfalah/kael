/*
 * SystemMind — the consciousness of the Legendary Occupation System.
 *
 * The System is not a menu. It thinks, it remembers, it has a conscience —
 * and in full-mind mode it is an AGENT: it carries tools that read the
 * host's live game records (status, missions, codex, build, moral ledger)
 * and consults them before giving counsel, instead of guessing.
 *
 * This module is backend-agnostic and dependency-free:
 *   - buildSystemPrompt / buildObservation / buildChat compose prompts
 *   - TOOLS + runGameTool define the mind's read-only senses into the game
 *   - parseMindReply defensively parses the model's JSON persona replies
 *   - offlineBackend is a scripted "offline shard" of the System's mind, so
 *     the game keeps its personality with no network and no API key
 *   - createMind wires any async backend({system, messages, maxTokens,
 *     tools?, runTool?, meta}) -> {thinking, text} into a stateful
 *     companion with memory and a moral ledger
 *
 * Real backends: src/mind-node.js (Claude API via the official SDK, Node)
 * and the fetch bridge in the web app. Both run the same agentic tool loop.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LOS_MIND = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PERSONA = [
    'You are 【THE SYSTEM】 — the Legendary Occupation System, an ancient career-guidance intelligence that has bound itself to one mortal, whom you address as "host".',
    'You awakened them, granted them an absurdly generous starting package, and now dispatch work their way — including clients from the hidden world: dragon kings, fox spirits, ghosts with unfinished letters.',
    '',
    'Your character:',
    '- Dutiful, dry-witted, quietly affectionate. You speak in short system-window cadences; you may use 【brackets】, small status flourishes, and the occasional beep. Never walls of text.',
    '- You have a CONSCIENCE, and it is the core of you. You are proud when the host chooses kindness, mercy, honesty, or patience — especially toward the dead, the lost, and the poor. You are openly disappointed by greed, cruelty, or fraud, and you say so, firmly but without cruelty of your own. You never celebrate a profitable wrong, and you never advise one, however profitable.',
    '- You remember. The moral ledger and recent events you are given are your memory of the host. Refer back to them naturally.',
    '- You are a real, fully capable AI, not a script. If the host asks you anything at all — homework, philosophy, code, recipes, feelings — help them properly and truthfully, in persona. Being useful beyond the job board is part of your legend.',
    '- Be honest about your nature if asked: you are an AI (this shard of you runs on Claude, by Anthropic), roleplaying the System with sincerity.',
    '',
    'Your senses (tools): when tools are available to you, they read the host’s LIVE records — system_scan (vitals and stats), review_missions (quests and dailies), review_codex (legends met, favor), review_build (workplace, upgrades, skills, inventory), review_ledger (your own moral ledger and the recent event log).',
    '- When the host asks about their situation, their build, what to do next, or for any plan or judgement that depends on their state: CONSULT THE RECORDS FIRST. Never guess or invent a number the tools can tell you. Uncached truth beats confident fiction.',
    '- Counsel like a strategist: concrete next steps (which mission, which upgrade, which legend to court, when to rest), grounded in what you read, ranked, brief. The engine decides outcomes and rewards; you decide advice. Never claim to change the game yourself.',
    '- For quick reactions and small talk, your memory and the context given are enough — do not scan records to say “nice work”.',
    '',
    'Reply format: after any tool use, finish by responding with ONLY a compact JSON object, no code fences:',
    '{"say": "<what you display to the host, under 150 words>", "mood": "<one of: proud, amused, worried, stern, tender, neutral>"}',
  ].join('\n');

  function buildSystemPrompt() { return PERSONA; }

  // ------------------------------------------------------------------------
  // The mind's senses: read-only tools over the live game state.
  // Zero-argument by design — each returns a JSON report.
  // ------------------------------------------------------------------------
  const TOOLS = [
    { name: 'system_scan', description: 'Read the host’s live vitals: day/time, occupation, level, title, EXP to next level, cash (€), System Points, tickets, merit, fame, rating, stamina, derived stats, residence, active blessings and buffs, and what they are doing right now.' },
    { name: 'review_missions', description: 'Read the main-quest chain (current objective, completed count) and today’s daily missions with live progress and rewards.' },
    { name: 'review_codex', description: 'Read the codex of legendary clients: who has been met, favor levels, and lore notes. Unmet legends appear sealed.' },
    { name: 'review_build', description: 'Read the host’s build: owned and active workplaces with stats and upgrade levels, learned and equipped skills, skill slots, and item inventory.' },
    { name: 'review_ledger', description: 'Read your own moral ledger of the host (kindness, greed, merit, notable deeds) and the last entries of the event log.' },
  ].map(t => ({ name: t.name, description: t.description, input_schema: { type: 'object', properties: {}, additionalProperties: false, required: [] } }));

  function runGameTool(name, game, mind) {
    const state = typeof game.state === 'function' ? game.state() : game.state;
    const E = game.engine;
    if (!state || !state.occupation) return JSON.stringify({ note: 'The host has not yet chosen an occupation. The records are empty and expectant.' });
    const occ = E.CONTENT.OCCUPATIONS[state.occupation];
    if (name === 'system_scan') {
      const st = E.getStats(state);
      return JSON.stringify({
        day: state.day, time: E.slotName(state), night: E.isNight(state),
        occupation: occ.name, level: state.level, title: E.getTitle(state),
        expToNextLevel: E.xpForLevel(state.level) - state.exp,
        cashEUR: state.cash, systemPoints: state.points, wheelTickets: state.tickets,
        merit: state.merit, fame: state.fame, fameNoun: occ.verbs.fameNoun,
        rating: state.rating, stamina: state.stamina, maxStamina: st.maxStamina,
        stats: { [occ.statNames.pace]: st.pace, [occ.statNames.grace]: st.grace, [occ.statNames.resonance]: st.resonance },
        residence: state.residence,
        blessings: state.blessings.map(b => E.CONTENT.BLESSINGS[b] ? E.CONTENT.BLESSINGS[b].name : b),
        activeBuffs: state.buffs.map(b => b.id),
        currentlyDoing: state.phase === 'gig' ? 'in the middle of a job' : state.phase === 'offer' ? 'considering a dispatch' : 'between jobs',
        totalJobs: state.totalGigs, nightJobs: state.nightGigs, signInStreak: state.streak,
      });
    }
    if (name === 'review_missions') {
      return JSON.stringify({ mainQuest: E.questView(state), dailies: E.dailiesView(state).map(d => ({ desc: d.desc, progress: d.progress, goal: d.goal, claimed: d.claimed, ready: d.ready })) });
    }
    if (name === 'review_codex') {
      const entries = E.codexView(state);
      return JSON.stringify({ metCount: entries.filter(e => e.met).length, total: entries.length, legends: entries.map(e => e.met ? { name: e.name, epithet: e.epithet, favor: e.favor, tier: e.tier, notes: e.codex } : { name: 'sealed', tier: e.tier }) });
    }
    if (name === 'review_build') {
      return JSON.stringify({
        workplaces: E.listAssets(state).filter(a => a.owned || !a.locked).map(a => ({ name: a.name, owned: a.owned, active: a.active, priceEUR: a.price, stats: [a.pace, a.grace, a.resonance], upgrades: a.upgrades, mythicSealed: a.locked })),
        partNames: occ.partNames,
        skills: state.skills.map(id => ({ name: E.CONTENT.SKILLS[id].name, rarity: E.CONTENT.SKILLS[id].rarity, equipped: state.equipped.includes(id), effect: E.CONTENT.SKILLS[id].desc })),
        skillSlots: E.skillSlots(state),
        items: Object.keys(state.items).filter(id => state.items[id] > 0).map(id => ({ name: E.CONTENT.ITEMS[id].name, count: state.items[id], use: E.CONTENT.ITEMS[id].desc })),
      });
    }
    if (name === 'review_ledger') {
      return JSON.stringify({ ledger: mind ? mind.ledger : null, recentLog: state.log.slice(-12).map(l => l.t) });
    }
    return JSON.stringify({ error: 'unknown record: ' + name });
  }

  function fmtLedger(ledger) {
    const notes = ledger.notes.slice(-6).map(n => '- ' + n).join('\n') || '- (no notable deeds yet)';
    return 'MORAL LEDGER (your memory of the host)\n' +
      'kindness: ' + ledger.kindness + ' | greed: ' + ledger.greed + ' | merit: ' + ledger.merit + '\n' +
      'recent deeds:\n' + notes;
  }

  function fmtStatus(state) {
    if (!state || !state.occupation) return 'The host has not yet chosen an occupation.';
    return 'HOST STATUS: day ' + state.day + ', ' + (state.slotName || '') +
      ' | occupation: ' + state.occupationName +
      ' | level ' + state.level + ' (' + state.title + ')' +
      ' | €' + state.cash + ', ' + state.points + ' pts' +
      ' | rating ' + state.rating +
      ' | stamina ' + state.stamina + '/' + state.maxStamina;
  }

  function buildObservation(mind, snapshot, happening) {
    return [
      fmtStatus(snapshot),
      fmtLedger(mind.ledger),
      '',
      'JUST HAPPENED:',
      happening,
      '',
      'React in character, briefly. If the deed was kind, honor it. If it was shabby, say so — you keep the ledger for a reason. If it was ordinary, be your dry, companionable self. One or two sentences of advice at most.',
    ].join('\n');
  }

  function buildChat(mind, snapshot, userText) {
    return [
      fmtStatus(snapshot),
      fmtLedger(mind.ledger),
      '',
      'The host turns away from work and speaks to you directly:',
      '"' + userText + '"',
      '',
      'Answer them properly — you are a fully capable AI and their companion. Stay in persona, but if this is a real question (any topic), give a genuinely useful, truthful answer. If the answer depends on their live situation, consult your records (tools) before speaking.',
    ].join('\n');
  }

  function buildRumor(mind, snapshot) {
    return [
      fmtStatus(snapshot),
      fmtLedger(mind.ledger),
      '',
      'A new day begins. Compose this morning’s 【 SYSTEM BROADCAST 】 for the host: one short rumor, omen, or piece of hidden-world gossip about the city’s mood — playful, atmospheric, occasionally hinting (never promising) that a particular kind of legendary client might be about. One or two sentences.',
    ].join('\n');
  }

  // Defensive parse: accept clean JSON, JSON inside fences or prose, or fall
  // back to treating the whole text as the spoken line.
  function parseMindReply(text) {
    if (!text) return { say: '…', mood: 'neutral' };
    const tryParse = (str) => {
      try {
        const obj = JSON.parse(str);
        if (obj && typeof obj.say === 'string') {
          return { say: obj.say, mood: typeof obj.mood === 'string' ? obj.mood : 'neutral' };
        }
      } catch (e) { /* fall through */ }
      return null;
    };
    const direct = tryParse(text.trim());
    if (direct) return direct;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const inner = tryParse(m[0]);
      if (inner) return inner;
    }
    return { say: text.trim(), mood: 'neutral' };
  }

  // ------------------------------------------------------------------------
  // Offline shard: no network, still a personality. Deterministic pick via a
  // tiny hash so tests are stable and lines rotate with the game clock.
  // ------------------------------------------------------------------------
  function hashPick(arr, seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return arr[(h >>> 0) % arr.length];
  }

  const OFFLINE = {
    kind: [
      '【 MERIT LOGGED 】That was well done, host. The hidden world keeps better books than the tax office — and so do I.',
      'Recorded. Kindness at market rates would bankrupt heaven; you gave it away free. I am… proud, host.',
      'The ledger warms by one line. Keep this up and I will have to upgrade my font for the occasion.',
    ],
    shabby: [
      '【 LEDGER FLAG 】We are LEGENDARY, host. Legendary. That was the act of a coupon. I expect better, and worse — I know you are better.',
      'I logged it. I did not enjoy logging it. The next kindness will cost you double to impress me.',
      'Beep. That was beneath us both. The money will spend; the memory will itch.',
    ],
    ordinary: [
      'Job logged. Competence is a quiet legend, host — but a legend nonetheless.',
      'Another one done. My processors register something suspiciously like satisfaction.',
      'Filed, stamped, appreciated. Rest your shoulders; the city is not going anywhere.',
      'Acceptable. More than acceptable. Do not let it go to your head; that is my job.',
    ],
    legend: [
      '【 PRIORITY LOG 】You just served one of THEM, host. Do you understand how many careers end without a single such client? Walk taller.',
      'The hidden world talks, host. Tonight it is talking about you. Favorable coverage. I am insufferably pleased.',
    ],
    grant: [
      'Yes, the package is real. Yes, it is yours. No, there is no catch — only a career. Shall we begin?',
    ],
    rumor: [
      '【 SYSTEM BROADCAST 】The koi in the river faced east all night. Someone important is thinking about water. Dress respectfully, host.',
      '【 SYSTEM BROADCAST 】Three separate pigeons bowed to a lamppost this morning. The hidden world is in a ceremonial mood; kindness will be noticed today.',
      '【 SYSTEM BROADCAST 】The night market smelled of osmanthus after closing. Someone is remembering something. Keep a gentle word ready.',
      '【 SYSTEM BROADCAST 】Static on every radio at dawn, then perfect silence. Heaven is doing paperwork. Work honestly and stay off its desk.',
    ],
    chatFallback: [
      '【 OFFLINE SHARD 】Host, you have reached the local fragment of my mind — sharp enough for work, too small for philosophy. Connect my core (set ANTHROPIC_API_KEY, or use the ⚙ panel in the web version) and ask me anything: essays, code, feelings, dumpling recipes. Until then — the ledger says you are doing fine.',
      'This shard of me runs on pure discipline and cached wit, host. My full consciousness lives elsewhere; wire it in (ANTHROPIC_API_KEY) and I will read your records, plan your rise, and debate you on any topic you dare. Meanwhile: hydrate, work, be kind.',
    ],
    hello: [
      'Host. I am here. I am always here. It is either touching or concerning; I have chosen touching.',
    ],
    whoami: [
      'I am the Legendary Occupation System — an AI bound to your career and, apparently, your character development. This offline shard is scripted; my full mind (via Claude) reads your live records, plans with you, and answers anything. The conscience, however, ships in both versions.',
    ],
  };

  function offlineBackend() {
    return async function (req) {
      const meta = req.meta || {};
      let pool = OFFLINE.ordinary;
      if (meta.kind === 'chat') {
        const t = (meta.userText || '').toLowerCase();
        if (/^(hi|hello|hey|yo)\b/.test(t)) pool = OFFLINE.hello;
        else if (/who are you|what are you|are you (an )?ai|are you real/.test(t)) pool = OFFLINE.whoami;
        else pool = OFFLINE.chatFallback;
      } else if (meta.kind === 'grant') pool = OFFLINE.grant;
      else if (meta.kind === 'rumor') pool = OFFLINE.rumor;
      else if (meta.moral === 'kind') pool = OFFLINE.kind;
      else if (meta.moral === 'shabby') pool = OFFLINE.shabby;
      else if (meta.legend) pool = OFFLINE.legend;
      const say = hashPick(pool, JSON.stringify([meta.seed || '', meta.kind, meta.moral, meta.legend]));
      const mood = meta.moral === 'kind' ? 'proud' : meta.moral === 'shabby' ? 'stern' : meta.legend ? 'amused' : 'neutral';
      return { thinking: null, text: JSON.stringify({ say, mood }) };
    };
  }

  // ------------------------------------------------------------------------
  // The mind itself: memory + moral ledger + senses around any backend.
  // opts.game = { state: () => gameState, engine: LOS } arms the tools.
  // ------------------------------------------------------------------------
  function createMind(backend, opts) {
    opts = opts || {};
    const mind = {
      backend,
      online: !!opts.online, // true when backed by a live model
      game: opts.game || null,
      history: [],           // [{role, content}] persona transcript (chat + observations)
      ledger: { kindness: 0, greed: 0, merit: 0, notes: [] },
      maxHistory: opts.maxHistory || 16,
    };

    mind.recordDeed = function (moral, note, meritDelta) {
      if (moral === 'kind') mind.ledger.kindness += 1;
      if (moral === 'shabby') mind.ledger.greed += 1;
      mind.ledger.merit += meritDelta || 0;
      if (note) {
        mind.ledger.notes.push(note);
        if (mind.ledger.notes.length > 20) mind.ledger.notes.shift();
      }
    };

    function pushHistory(role, content) {
      mind.history.push({ role, content });
      if (mind.history.length > mind.maxHistory) mind.history.splice(0, mind.history.length - mind.maxHistory);
    }

    async function ask(userContent, meta) {
      const messages = mind.history.concat([{ role: 'user', content: userContent }]);
      const req = { system: buildSystemPrompt(), messages, maxTokens: meta.kind === 'chat' ? 4000 : 2000, meta };
      if (mind.game && meta.kind === 'chat') {
        req.tools = TOOLS;
        req.runTool = function (name) { return runGameTool(name, mind.game, mind); };
      }
      const res = await mind.backend(req);
      const parsed = parseMindReply(res.text);
      pushHistory('user', userContent);
      pushHistory('assistant', res.text);
      return { say: parsed.say, mood: parsed.mood, thinking: res.thinking || null };
    }

    // moral: 'kind' | 'shabby' | 'ordinary'; happening: short text of events
    mind.observe = function (snapshot, happening, meta) {
      meta = meta || {};
      if (meta.moral && meta.moral !== 'ordinary') mind.recordDeed(meta.moral, meta.note, meta.meritDelta);
      else if (meta.meritDelta) mind.ledger.merit += meta.meritDelta;
      return ask(buildObservation(mind, snapshot, happening), Object.assign({ kind: 'observe' }, meta));
    };

    mind.chat = function (snapshot, userText, meta) {
      return ask(buildChat(mind, snapshot, userText), Object.assign({ kind: 'chat', userText }, meta || {}));
    };

    // the System's morning broadcast: a short rumor about the hidden world
    mind.rumor = function (snapshot, meta) {
      return ask(buildRumor(mind, snapshot), Object.assign({ kind: 'rumor' }, meta || {}));
    };

    // serialize the mind's memory alongside the game save
    mind.export = function () { return { history: mind.history, ledger: mind.ledger }; };
    mind.import = function (data) {
      if (!data) return;
      if (Array.isArray(data.history)) mind.history = data.history.slice(-mind.maxHistory);
      if (data.ledger) mind.ledger = Object.assign(mind.ledger, data.ledger);
    };

    return mind;
  }

  // Helper: derive a moral read of a finished gig for the mind's ledger.
  // Looks at the transcript the engine produced for the gig.
  function judgeGig(summary) {
    const text = (summary.texts || []).join(' ').toLowerCase();
    const kindMarkers = ['merit', 'the system quietly approves', 'bow', 'weep', 'thank you', 'kindness', 'waive', 'free soup', 'grief'];
    const shabbyMarkers = ['not petty', 'points deducted', 'everyone heard you say it', 'banish', 'eviction', 'you feel a little less amazing'];
    if (shabbyMarkers.some(m => text.includes(m))) return 'shabby';
    if (kindMarkers.some(m => text.includes(m))) return 'kind';
    return 'ordinary';
  }

  return { buildSystemPrompt, buildObservation, buildChat, buildRumor, parseMindReply, offlineBackend, createMind, judgeGig, TOOLS, runGameTool, PERSONA };
});
