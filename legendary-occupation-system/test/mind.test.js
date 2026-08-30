'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const MIND = require('../src/mind.js');
const nodeMind = require('../src/mind-node.js');
const LOS = require('../src/engine.js');

function armedGame() {
  const s = LOS.newGame({ name: 'Tester', seed: 77 });
  LOS.chooseOccupation(s, 'chef');
  return s;
}

test('parseMindReply handles clean JSON, embedded JSON, and prose', () => {
  assert.deepEqual(MIND.parseMindReply('{"say":"Well done, host.","mood":"proud"}'),
    { say: 'Well done, host.', mood: 'proud' });
  const embedded = MIND.parseMindReply('Sure thing:\n```json\n{"say":"Noted.","mood":"stern"}\n```');
  assert.equal(embedded.say, 'Noted.');
  assert.equal(embedded.mood, 'stern');
  const prose = MIND.parseMindReply('The System stares at you in plain text.');
  assert.equal(prose.say, 'The System stares at you in plain text.');
  assert.equal(prose.mood, 'neutral');
  assert.equal(MIND.parseMindReply('').mood, 'neutral');
});

test('offline shard reacts to kindness, shabbiness, legends, and chat — deterministically', async () => {
  const backend = MIND.offlineBackend();
  const kind = MIND.parseMindReply((await backend({ meta: { kind: 'observe', moral: 'kind', seed: 1 } })).text);
  assert.equal(kind.mood, 'proud');
  const shabby = MIND.parseMindReply((await backend({ meta: { kind: 'observe', moral: 'shabby', seed: 1 } })).text);
  assert.equal(shabby.mood, 'stern');
  const legend = MIND.parseMindReply((await backend({ meta: { kind: 'observe', legend: true, seed: 1 } })).text);
  assert.equal(legend.mood, 'amused');
  const chat = MIND.parseMindReply((await backend({ meta: { kind: 'chat', userText: 'are you an AI?', seed: 1 } })).text);
  assert.match(chat.say, /AI/i);
  const again = await backend({ meta: { kind: 'observe', moral: 'kind', seed: 1 } });
  const first = await backend({ meta: { kind: 'observe', moral: 'kind', seed: 1 } });
  assert.equal(again.text, first.text, 'same meta, same line');
});

test('the mind keeps a moral ledger and bounded memory', async () => {
  const mind = MIND.createMind(MIND.offlineBackend());
  const snap = { occupation: 'chef', occupationName: 'Chef', day: 1, slotName: 'Noon', level: 1, title: 'System Rookie', cash: 100, points: 10, rating: '5.00', stamina: 90, maxStamina: 100 };
  const res = await mind.observe(snap, 'The host returned a lost phone.', { moral: 'kind', note: 'returned a phone', meritDelta: 8 });
  assert.ok(res.say.length > 0);
  assert.equal(mind.ledger.kindness, 1);
  assert.equal(mind.ledger.merit, 8);
  await mind.observe(snap, 'The host pawned a lost phone.', { moral: 'shabby', note: 'pawned a phone', meritDelta: -15 });
  assert.equal(mind.ledger.greed, 1);
  assert.equal(mind.ledger.merit, -7);
  assert.ok(mind.ledger.notes.includes('pawned a phone'));
  for (let i = 0; i < 30; i++) await mind.chat(snap, 'ping ' + i);
  assert.ok(mind.history.length <= mind.maxHistory, 'history stays bounded');
  // memory survives save/load
  const clone = MIND.createMind(MIND.offlineBackend());
  clone.import(JSON.parse(JSON.stringify(mind.export())));
  assert.equal(clone.ledger.greed, 1);
  assert.equal(clone.ledger.merit, -7);
});

test('prompts carry the conscience: status, ledger, and the deed', () => {
  const mind = MIND.createMind(MIND.offlineBackend());
  mind.recordDeed('kind', 'helped the Ghost Bride', 12);
  const snap = { occupation: 'carHailer', occupationName: 'Ride-Hailing Driver', day: 3, slotName: 'Night', level: 2, title: 'System Rookie', cash: 500, points: 50, rating: '4.90', stamina: 40, maxStamina: 100 };
  const obs = MIND.buildObservation(mind, snap, 'Delivered a letter for the Ghost Bride.');
  assert.match(obs, /MORAL LEDGER/);
  assert.match(obs, /helped the Ghost Bride/);
  assert.match(obs, /kindness: 1/);
  assert.match(obs, /Ghost Bride\./);
  const chat = MIND.buildChat(mind, snap, 'What is a closure in JavaScript?');
  assert.match(chat, /closure in JavaScript/);
  assert.match(chat, /fully capable AI/);
  assert.match(MIND.buildSystemPrompt(), /CONSCIENCE/);
  assert.match(MIND.buildSystemPrompt(), /Claude/);
});

test('judgeGig reads the transcript morally', () => {
  assert.equal(MIND.judgeGig({ texts: ['They bow three times. The System quietly approves.'] }), 'kind');
  assert.equal(MIND.judgeGig({ texts: ['The System’s voice turns icy: “We are LEGENDARY, host. Not petty.” Points deducted.'] }), 'shabby');
  assert.equal(MIND.judgeGig({ texts: ['Steady and boring, like a good pension plan.'] }), 'ordinary');
  assert.equal(MIND.judgeGig({ texts: [] }), 'ordinary');
});

test('the mind carries five read-only senses with strict zero-arg schemas', () => {
  assert.equal(MIND.TOOLS.length, 5);
  const names = MIND.TOOLS.map(t => t.name);
  assert.deepEqual(names, ['system_scan', 'review_missions', 'review_codex', 'review_build', 'review_ledger']);
  for (const t of MIND.TOOLS) {
    assert.ok(t.description.length > 20, t.name + ' described');
    assert.equal(t.input_schema.type, 'object');
    assert.equal(t.input_schema.additionalProperties, false);
    assert.deepEqual(t.input_schema.required, []);
  }
});

test('every sense reads real live game records as JSON', () => {
  const s = armedGame();
  const mind = MIND.createMind(MIND.offlineBackend(), { game: { state: () => s, engine: LOS } });
  mind.recordDeed('kind', 'fed a hungry ghost', 5);
  const game = { state: () => s, engine: LOS };
  const scan = JSON.parse(MIND.runGameTool('system_scan', game, mind));
  assert.equal(scan.occupation, 'Night-Market Chef');
  assert.equal(scan.cashEUR, s.cash);
  assert.equal(scan.level, 1);
  assert.ok(scan.stats['Kitchen Pace'] >= 2, 'occupation-named stats');
  const missions = JSON.parse(MIND.runGameTool('review_missions', game, mind));
  assert.equal(missions.dailies.length, 3);
  assert.ok(missions.mainQuest.current, 'main quest visible');
  const codex = JSON.parse(MIND.runGameTool('review_codex', game, mind));
  assert.equal(codex.total, 13);
  assert.equal(codex.metCount, 0);
  assert.equal(codex.legends[0].name, 'sealed', 'unmet legends stay sealed');
  const build = JSON.parse(MIND.runGameTool('review_build', game, mind));
  assert.ok(build.workplaces.some(w => w.active));
  assert.ok(build.skills.some(sk => sk.name === 'Wok Hei' && sk.equipped));
  const ledger = JSON.parse(MIND.runGameTool('review_ledger', game, mind));
  assert.equal(ledger.ledger.kindness, 1);
  assert.ok(Array.isArray(ledger.recentLog));
  const unknown = JSON.parse(MIND.runGameTool('nonsense', game, mind));
  assert.match(unknown.error, /unknown record/);
  const empty = JSON.parse(MIND.runGameTool('system_scan', { state: () => null, engine: LOS }, mind));
  assert.match(empty.note, /not yet chosen/);
});

test('chat turns arm the backend with tools; observations stay lean', async () => {
  const s = armedGame();
  const captured = [];
  const spyBackend = async (req) => {
    captured.push(req);
    return { thinking: null, text: JSON.stringify({ say: 'ok', mood: 'neutral' }) };
  };
  const mind = MIND.createMind(spyBackend, { game: { state: () => s, engine: LOS } });
  const snap = { occupation: 'chef', occupationName: 'Chef', day: 1, slotName: 'Noon', level: 1, title: 'System Rookie', cash: s.cash, points: s.points, rating: '5.00', stamina: 90, maxStamina: 100 };
  await mind.chat(snap, 'what should I focus on next?');
  const chatReq = captured[0];
  assert.equal(chatReq.tools, MIND.TOOLS, 'chat carries the senses');
  assert.equal(typeof chatReq.runTool, 'function');
  assert.match(chatReq.runTool('system_scan'), /cashEUR/, 'runTool reaches the live state');
  await mind.observe(snap, 'A quiet job.', { moral: 'ordinary' });
  const obsReq = captured[1];
  assert.equal(obsReq.tools, undefined, 'observations stay single-shot');
  // an unarmed mind never passes tools
  const bare = MIND.createMind(spyBackend);
  await bare.chat(snap, 'hello');
  assert.equal(captured[2].tools, undefined);
});

test('the persona teaches the tools and forbids invented numbers', () => {
  const p = MIND.buildSystemPrompt();
  assert.match(p, /system_scan/);
  assert.match(p, /CONSULT THE RECORDS FIRST/);
  assert.match(p, /Never guess or invent a number/);
});

test('the economy speaks euros, with no yen leftovers', () => {
  const s = armedGame();
  const blob = JSON.stringify(LOS.CONTENT);
  assert.ok(!blob.includes('¥'), 'no yen in content');
  assert.ok(blob.includes('€'), 'grants quote euros');
  assert.ok(!JSON.stringify(s.log).includes('¥'), 'no yen in the boot log');
});

test('node Claude backend degrades gracefully without network use', () => {
  assert.equal(typeof nodeMind.sdkAvailable(), 'boolean');
  assert.equal(typeof nodeMind.MODEL, 'string');
  if (nodeMind.sdkAvailable()) {
    const backend = nodeMind.createClaudeBackend();
    assert.ok(backend === null || typeof backend === 'function');
  } else {
    assert.equal(nodeMind.createClaudeBackend(), null);
  }
});
