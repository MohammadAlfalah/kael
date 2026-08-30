'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const LOS = require('../src/engine.js');
const C = LOS.CONTENT;

function freshGame(seed, occId) {
  const s = LOS.newGame({ name: 'Tester', seed });
  if (occId) {
    const r = LOS.chooseOccupation(s, occId);
    assert.equal(r.ok, true);
  }
  return s;
}

// Plays one full gig: dispatch, accept, resolve every event with the first
// available choice. Returns the completion summary.
function playGig(s) {
  let r = LOS.goOnline(s);
  assert.equal(r.ok, true, 'goOnline should succeed: ' + (r.msg || ''));
  r = LOS.acceptOffer(s);
  assert.equal(r.ok, true, 'acceptOffer should succeed: ' + (r.msg || ''));
  let guard = 0;
  while (!r.done && guard++ < 10) {
    const ev = LOS.getCurrentEvent(s);
    assert.ok(ev, 'expected an event while gig is unresolved');
    const choice = ev.choices.find(c => c.available);
    assert.ok(choice, 'expected at least one available choice');
    r = LOS.choose(s, choice.id);
    assert.equal(r.ok, true);
  }
  assert.equal(r.done, true, 'gig should complete');
  return r.summary;
}

test('new game starts in occupation-choice phase with system boot log', () => {
  const s = freshGame(42);
  assert.equal(s.phase, 'choose');
  assert.equal(s.occupation, null);
  assert.equal(s.cash, C.CONFIG.startCash);
  assert.ok(s.log.length >= 2);
  assert.match(s.log[0].t, /LEGENDARY OCCUPATION SYSTEM/);
});

test('all five occupations are offered, each with a grant preview', () => {
  const occs = LOS.listOccupations();
  assert.equal(occs.length, 5);
  for (const o of occs) {
    assert.ok(o.name && o.tagline && o.grantPreview, o.id + ' must advertise its grant');
    assert.ok(o.grantLines.length >= 5);
  }
  assert.deepEqual(occs.map(o => o.id), ['carHailer', 'streamer', 'chef', 'physician', 'landlord']);
});

test('choosing an occupation delivers the huge awakening grant', () => {
  const s = freshGame(7);
  const before = s.cash;
  const r = LOS.chooseOccupation(s, 'streamer');
  assert.equal(r.ok, true);
  assert.equal(s.phase, 'idle');
  assert.equal(s.cash, before + 6666, 'streamer signing cash lands');
  assert.equal(s.fame, 10000, 'streamer starts with 10k followers');
  assert.match(s.residence, /loft/i, 'streamer receives the loft (a whole house!)');
  assert.ok(s.skills.includes('goldenVoice'), 'starter skill granted');
  assert.ok(s.equipped.includes('goldenVoice'), 'starter skill auto-equipped');
  assert.ok(s.blessings.includes('verifiedBadge'));
  assert.equal(s.assets.owned.length, 1, 'tier-1 workplace granted');
  assert.equal(s.assets.active, 'starlightRig');
  assert.ok((s.items.herbalTea || 0) >= 2, 'grant items delivered');
  assert.equal(s.dailies.length, 3, 'daily missions issued');
  // choosing twice is refused
  assert.equal(LOS.chooseOccupation(s, 'chef').ok, false);
});

test('each occupation grant matches its advertised package', () => {
  const expectations = {
    carHailer: { cash: 8888, residence: /dorm/i, asset: 'whiteCloud' },
    streamer: { cash: 6666, residence: /loft/i, asset: 'starlightRig' },
    chef: { cash: 7777, residence: /stall/i, asset: 'wokStall' },
    physician: { cash: 9999, residence: /clinic/i, asset: 'communityClinic' },
    landlord: { cash: 5555, residence: /penthouse/i, asset: 'osmanthusCourt' },
  };
  for (const [id, exp] of Object.entries(expectations)) {
    const s = freshGame(1, id);
    assert.equal(s.cash, C.CONFIG.startCash + exp.cash, id + ' cash grant');
    assert.match(s.residence, exp.residence, id + ' residence grant');
    assert.equal(s.assets.active, exp.asset, id + ' workplace grant');
    assert.equal(s.skills.length, 1, id + ' starter skill');
  }
});

test('same seed and same actions produce identical states (determinism)', () => {
  const a = freshGame(1234, 'chef');
  const b = freshGame(1234, 'chef');
  playGig(a); playGig(b);
  assert.deepEqual(JSON.parse(LOS.save(a)), JSON.parse(LOS.save(b)));
});

test('completing a gig pays out, advances time, and grants exp/points', () => {
  const s = freshGame(99, 'carHailer');
  const cash = s.cash, slot = s.slot, exp = s.exp + s.level * 1000;
  const summary = playGig(s);
  assert.ok(summary.pay > 0, 'pay is positive');
  assert.ok(s.cash > cash, 'cash increased');
  assert.ok(s.log.some(l => l.t.includes('€')), 'the ledger speaks euros');
  assert.ok(s.slot > slot, 'time advanced');
  assert.equal(s.totalGigs, 1);
  assert.ok(s.exp + s.level * 1000 > exp, 'exp gained');
  assert.equal(s.phase, 'idle');
});

test('the third job is always the Ghost Bride, and completing it awakens Yin-Yang Eyes', () => {
  const s = freshGame(5, 'physician');
  playGig(s);
  playGig(s);
  assert.equal(s.totalGigs, 2);
  const r = LOS.goOnline(s);
  assert.equal(r.ok, true);
  assert.equal(s.offer.forced, 'ghostBride', 'third dispatch is the story beat');
  assert.equal(s.offer.night, true, 'she always arrives at night');
  // forced offers cannot be declined
  assert.equal(LOS.declineOffer(s).ok, false);
  let res = LOS.acceptOffer(s);
  assert.equal(res.ok, true);
  const ev = LOS.getCurrentEvent(s);
  assert.match(ev.prompt, /Willow Lane/, 'occupation-specific Ghost Bride scene');
  res = LOS.choose(s, 'help');
  assert.equal(res.done, true);
  assert.equal(s.specials.ghostBride, true);
  assert.ok(s.skills.includes('yinyangEyes'), 'quest reward: Yin-Yang Eyes');
  assert.ok(s.codex.ghostBride, 'codex records her');
  assert.ok((s.favor.ghostBride || 0) >= 3, 'kind choice plus completion favor');
});

test('every occupation has a bespoke Ghost Bride scene', () => {
  for (const occId of C.OCCUPATION_ORDER) {
    const legend = C.LEGENDS.find(l => l.id === 'ghostBride');
    const evId = legend.events.byOcc[occId];
    assert.ok(evId && C.EVENTS[evId], occId + ' has a Ghost Bride event');
    assert.match(C.EVENTS[evId].prompt, /Willow Lane|bride/i);
  }
});

test('declining a normal offer returns to idle at a small stamina cost', () => {
  const s = freshGame(11, 'landlord');
  const st = s.stamina;
  const r = LOS.goOnline(s);
  assert.equal(r.ok, true);
  if (s.offer.forced) return; // ultra-rare seed path; forced offers tested elsewhere
  assert.equal(LOS.declineOffer(s).ok, true);
  assert.equal(s.phase, 'idle');
  assert.equal(s.stamina, st - 2);
});

test('exhaustion locks the dispatch app', () => {
  const s = freshGame(2, 'chef');
  s.stamina = 11;
  const r = LOS.goOnline(s);
  assert.equal(r.ok, false);
  assert.match(r.msg, /Rest/);
});

test('sign-in rewards follow the streak and reset when a day is skipped', () => {
  const s = freshGame(3, 'carHailer');
  assert.equal(LOS.signIn(s).ok, true);
  assert.equal(s.streak, 1);
  assert.equal(LOS.signIn(s).ok, false, 'no double sign-in');
  LOS.endDay(s);
  assert.equal(LOS.signIn(s).streak, 2);
  LOS.endDay(s);
  LOS.endDay(s); // skipped day 3 sign-in
  assert.equal(LOS.signIn(s).streak, 1, 'streak resets after a missed day');
  assert.equal(s.bestStreak, 2);
});

test('end of day restores stamina, regenerates dailies, and pays windfalls', () => {
  const s = freshGame(8, 'caiShenFan' in {} ? 'chef' : 'chef');
  s.stamina = 20;
  LOS._test.applyFx(s, { windfall: { min: 100, max: 200 } });
  const cash = s.cash;
  const r = LOS.endDay(s);
  assert.equal(r.ok, true);
  assert.equal(s.day, 2);
  assert.equal(s.stamina, LOS.getStats(s).maxStamina);
  assert.equal(r.windfalls.length, 1);
  assert.ok(s.cash >= cash + 100 && s.cash <= cash + 200, 'windfall paid in range');
  assert.equal(s.dailies.length, 3);
});

test('shop: buying and using items works; relics refuse direct use', () => {
  const s = freshGame(21, 'physician');
  const price = LOS.shopPrice(s, C.ITEMS.energyDrink.price);
  const cash = s.cash;
  assert.equal(LOS.buyItem(s, 'energyDrink').ok, true);
  assert.equal(s.cash, cash - price);
  s.stamina = 40;
  assert.equal(LOS.useItem(s, 'energyDrink').ok, true);
  assert.equal(s.stamina, 70);
  assert.equal(LOS.useItem(s, 'peaceTalisman').ok, false, 'talismans are kept, not chugged');
  s.cash = 0;
  assert.equal(LOS.buyItem(s, 'jadePendant').ok, false, 'no funds, no jade');
});

test('gifts only land on legendary clients, and Erlang treats are Erlang-only', () => {
  const s = freshGame(31, 'carHailer');
  s.items.redEnvelope = 1;
  s.items.dogTreats = 1;
  assert.equal(LOS.useItem(s, 'redEnvelope').ok, false, 'no gig, no gift');
  // fabricate a legend gig to test gifting rules directly
  s.phase = 'gig';
  s.gig = { clientKind: 'legend', kind: 'legend', clientId: 'foxSpirit', size: 3, night: false, events: [], eventIdx: 0, payPct: 0, bonusAdd: 0, ratingLost: false, texts: [] };
  assert.equal(LOS.useItem(s, 'dogTreats').ok, false, 'the hound is elsewhere');
  const r = LOS.useItem(s, 'redEnvelope');
  assert.equal(r.ok, true);
  assert.equal(s.favor.foxSpirit, 1);
});

test('wheel: tickets are consumed and pity guarantees an epic-class prize within 10 spins', () => {
  const s = freshGame(13, 'landlord');
  s.tickets = 40;
  let sinceEpic = 0;
  let maxGap = 0;
  let guard = 0;
  while (s.tickets > 0 && guard++ < 200) { // wheel can award bonus tickets; drain them all
    const r = LOS.spinWheel(s);
    assert.equal(r.ok, true);
    if (r.prize.epicClass) sinceEpic = 0;
    else sinceEpic += 1;
    maxGap = Math.max(maxGap, sinceEpic);
  }
  assert.equal(s.tickets, 0);
  assert.ok(s.spins >= 40);
  assert.ok(maxGap < C.CONFIG.pityLimit, 'pity ceiling respected (max gap ' + maxGap + ')');
  assert.equal(LOS.spinWheel(s).ok, false, 'no ticket, no spin');
});

test('points convert to wheel tickets', () => {
  const s = freshGame(17, 'chef');
  s.points = C.CONFIG.ticketPoints;
  const t = s.tickets;
  assert.equal(LOS.buyTicket(s).ok, true);
  assert.equal(s.tickets, t + 1);
  assert.equal(s.points, 0);
  assert.equal(LOS.buyTicket(s).ok, false);
});

test('assets: buying, switching, upgrading; mythic tier stays sealed until the mandate', () => {
  const s = freshGame(23, 'carHailer');
  s.cash = 200000;
  assert.equal(LOS.buyAsset(s, 'thunderpeal').ok, true);
  assert.equal(s.assets.active, 'thunderpeal');
  const before = LOS.getStats(s).pace;
  const up = LOS.upgradeAsset(s, 'partA');
  assert.equal(up.ok, true);
  assert.equal(LOS.getStats(s).pace, before + 1, 'engine upgrade adds Speed');
  assert.equal(LOS.buyAsset(s, 'cloudChariot').ok, false, 'mythic locked before mandate');
  s.mythicUnlocked = true;
  assert.equal(LOS.buyAsset(s, 'cloudChariot').ok, true, 'mythic unlocked after mandate');
  assert.equal(LOS.selectAsset(s, 'whiteCloud').ok, true, 'can switch back to owned asset');
  assert.equal(LOS.buyAsset(s, 'thunderpeal').ok, false, 'no double purchase');
});

test('skill slots are limited by level', () => {
  const s = freshGame(29, 'streamer');
  assert.equal(LOS.skillSlots(s), 1);
  s.skills.push('ironBody');
  assert.equal(LOS.equipSkill(s, 'ironBody').ok, false, 'one slot, already used by starter');
  assert.equal(LOS.unequipSkill(s, 'goldenVoice').ok, true);
  assert.equal(LOS.equipSkill(s, 'ironBody').ok, true);
  s.level = 10;
  assert.equal(LOS.skillSlots(s), 3);
});

test('daily missions track progress and pay once', () => {
  const s = freshGame(37, 'physician');
  s.dailies = [{ id: 'd_gigs3', claimed: false }];
  playGig(s); playGig(s); playGig(s);
  const view = LOS.dailiesView(s);
  const mission = view.find(d => d.id === 'd_gigs3');
  assert.ok(mission.ready, 'mission ready after 3 gigs');
  const cash = s.cash;
  assert.equal(LOS.claimDaily(s, 'd_gigs3').ok, true);
  assert.equal(s.cash, cash + 250);
  assert.equal(LOS.claimDaily(s, 'd_gigs3').ok, false, 'no double claim');
});

test('first main quest completes after the first job', () => {
  const s = freshGame(41, 'landlord');
  const pts = s.points;
  playGig(s);
  assert.ok(s.questIdx >= 1, 'q_first cleared');
  assert.ok(s.points >= pts + 100 - 6, 'quest points granted (gig points also arrive)');
});

test('favor milestones grant their rewards exactly once', () => {
  const s = freshGame(43, 'carHailer');
  s.phase = 'gig';
  s.gig = { clientKind: 'legend', kind: 'legend', clientId: 'dragonKing', size: 3, night: false, events: [], eventIdx: 0, payPct: 0, bonusAdd: 0, ratingLost: false, texts: [] };
  LOS._test.bumpFavor(s, 'dragonKing', 3);
  assert.ok(s.blessings.includes('waterproofBlessing'), 'favor-3 blessing');
  const count = s.blessings.filter(b => b === 'waterproofBlessing').length;
  LOS._test.bumpFavor(s, 'dragonKing', -2);
  LOS._test.bumpFavor(s, 'dragonKing', 4);
  assert.equal(s.blessings.filter(b => b === 'waterproofBlessing').length, count, 'no duplicate reward');
  assert.ok(s.blessings.includes('dragonPearl'), 'favor-5 blessing');
});

test('rating stays clamped and guards halve the losses', () => {
  const s = freshGame(47, 'chef');
  LOS._test.applyFx(s, { rating: -5 });
  assert.equal(s.rating, 3, 'floor at 3');
  LOS._test.applyFx(s, { rating: 9 });
  assert.equal(s.rating, 5, 'ceiling at 5');
  s.skills.push('calmMind'); LOS.unequipSkill(s, 'wokHei'); LOS.equipSkill(s, 'calmMind');
  LOS._test.applyFx(s, { rating: -0.1 });
  assert.equal(s.rating, 4.95, 'Unshakable Calm halves the hit');
});

test('save/load round-trips the full state', () => {
  const s = freshGame(53, 'streamer');
  playGig(s);
  LOS.signIn(s);
  const restored = LOS.load(LOS.save(s));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(s)));
  // restored state keeps playing deterministically
  const a = LOS.load(LOS.save(s));
  playGig(a);
  assert.ok(a.totalGigs === s.totalGigs + 1);
  assert.throws(() => LOS.load('{"v":99}'), /Unsupported/);
});

test('the Jade Emperor arrives once armed, and his ride unlocks the mandate', () => {
  const s = freshGame(59, 'physician');
  // fast-forward: complete the quest chain up to q_audience by simulation
  s.questIdx = C.MAIN_QUESTS.findIndex(q => q.id === 'q_audience');
  s.level = 12;
  for (const id of ['ghostBride', 'dragonKing', 'foxSpirit', 'caiShen', 'yueLao', 'mengPo']) s.codex[id] = true;
  LOS._test.applyFx(s, {}); // no-op
  const before = s.questIdx;
  // trigger quest check
  LOS.signIn(s);
  assert.ok(s.questIdx > before, 'q_audience clears');
  assert.equal(s.mythicArmed, true);
  const r = LOS.goOnline(s);
  assert.equal(r.ok, true);
  assert.equal(s.offer.forced, 'jadeEmperor');
  LOS.acceptOffer(s);
  const ev = LOS.getCurrentEvent(s);
  assert.match(ev.prompt, /Jade Emperor/);
  const res = LOS.choose(s, 'honest');
  assert.equal(res.done, true);
  assert.equal(s.mandateDone, true);
  assert.equal(s.mythicUnlocked, true);
  assert.ok(s.skills.includes('heavenlyLicense'));
  assert.equal(LOS.getTitle(s), C.MANDATE_TITLE);
  assert.ok(res.summary.pay > 500, 'heaven pays like heaven');
});

test('content integrity: every referenced id resolves', () => {
  const eventIds = new Set(Object.keys(C.EVENTS));
  for (const legend of C.LEGENDS) {
    assert.ok(eventIds.has(legend.events.generic), legend.id + ' generic event exists');
    for (const [o, ev] of Object.entries(legend.events.byOcc || {})) {
      assert.ok(C.OCCUPATIONS[o], legend.id + ' byOcc occupation ' + o);
      assert.ok(eventIds.has(ev), legend.id + '/' + o + ' event exists');
    }
    for (const th of Object.keys(legend.favorRewards || {})) {
      const fx = legend.favorRewards[th];
      if (fx.blessing) assert.ok(C.BLESSINGS[fx.blessing], legend.id + ' favor blessing exists');
      if (fx.item) assert.ok(C.ITEMS[fx.item[0]], legend.id + ' favor item exists');
    }
  }
  for (const [occId, o] of Object.entries(C.OCCUPATIONS)) {
    for (const ev of o.events) assert.ok(eventIds.has(ev), occId + ' event ' + ev);
    for (const cli of o.commons) for (const ev of cli.events || []) assert.ok(eventIds.has(ev), occId + '/' + cli.id + ' event ' + ev);
    for (const [id, qty] of o.grant.items) { assert.ok(C.ITEMS[id], occId + ' grant item ' + id); assert.ok(qty > 0); }
    for (const id of o.grant.skills) assert.ok(C.SKILLS[id], occId + ' grant skill ' + id);
    for (const id of o.grant.blessings) assert.ok(C.BLESSINGS[id], occId + ' grant blessing ' + id);
    assert.equal(o.assets.filter(a => a.mythic).length, 1, occId + ' has exactly one mythic tier');
    assert.equal(o.assets[0].price, 0, occId + ' tier-1 asset is the free grant');
  }
  for (const [evId, ev] of Object.entries(C.EVENTS)) {
    assert.ok(ev.prompt && ev.choices.length >= 2, evId + ' shaped correctly');
    for (const ch of ev.choices) {
      assert.ok(ch.outcomes.length >= 1, evId + '/' + ch.id + ' outcomes');
      if (ch.req && ch.req.skill) assert.ok(C.SKILLS[ch.req.skill], evId + ' req skill ' + ch.req.skill);
      if (ch.req && ch.req.item) assert.ok(C.ITEMS[ch.req.item], evId + ' req item ' + ch.req.item);
      for (const oc of ch.outcomes) {
        if (oc.fx && oc.fx.skill) assert.ok(C.SKILLS[oc.fx.skill], evId + ' fx skill');
        if (oc.fx && oc.fx.item) assert.ok(C.ITEMS[oc.fx.item[0]], evId + ' fx item');
        if (oc.fx && oc.fx.blessing) assert.ok(C.BLESSINGS[oc.fx.blessing], evId + ' fx blessing');
      }
    }
  }
  for (const q of C.MAIN_QUESTS) {
    if (q.fx.skill) assert.ok(C.SKILLS[q.fx.skill]);
    if (q.fx.item) assert.ok(C.ITEMS[q.fx.item[0]]);
  }
});

test('a long honest grind stays stable (100 gigs, no crashes, sane economy)', () => {
  const s = freshGame(61, 'chef');
  let guard = 0;
  while (s.totalGigs < 100 && guard++ < 800) {
    if (s.stamina < 30) { if (s.phase === 'idle') LOS.endDay(s); continue; }
    if (s.lastSignInDay !== s.day) LOS.signIn(s);
    const r = LOS.goOnline(s);
    if (!r.ok) { LOS.endDay(s); continue; }
    LOS.acceptOffer(s);
    let done = s.phase === 'idle';
    let g2 = 0;
    while (!done && g2++ < 10) {
      const ev = LOS.getCurrentEvent(s);
      if (!ev) break;
      const choice = ev.choices.filter(c => c.available).pop();
      const res = LOS.choose(s, choice.id);
      done = !!res.done;
    }
  }
  assert.equal(s.totalGigs, 100);
  assert.ok(s.level >= 5, 'levels flow from honest work (got ' + s.level + ')');
  assert.ok(s.cash > 0 && Number.isFinite(s.cash));
  assert.ok(s.rating >= 3 && s.rating <= 5);
  assert.ok(Object.keys(s.codex).length >= 1, 'legends appear over 100 gigs');
  assert.ok(s.questIdx >= 3, 'quest chain advances (at ' + s.questIdx + ')');
  const reloaded = LOS.load(LOS.save(s));
  assert.equal(reloaded.totalGigs, 100);
});
