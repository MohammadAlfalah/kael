/*
 * Legendary Occupation System — game engine.
 * Pure, deterministic (seeded RNG), UI-agnostic. Works under Node (require)
 * and in the browser (global LOS, expects LOS_CONTENT loaded first).
 *
 * All public functions mutate the passed state and return a result object:
 *   { ok: boolean, msg?: string, ...payload }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./content.js'));
  else root.LOS = factory(root.LOS_CONTENT);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  if (!C) throw new Error('LOS content pack not loaded');
  const CFG = C.CONFIG;

  // ------------------------------------------------------------------- rng --
  function rand(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(s, a, b) { return a + Math.floor(rand(s) * (b - a + 1)); }
  function chance(s, p) { return rand(s) < p; }
  function weighted(s, entries, getW) {
    let total = 0;
    for (const e of entries) total += getW(e);
    if (total <= 0) return entries[0];
    let roll = rand(s) * total;
    for (const e of entries) {
      roll -= getW(e);
      if (roll <= 0) return e;
    }
    return entries[entries.length - 1];
  }

  // ------------------------------------------------------------------- log --
  function addLog(s, text, cls) {
    s.log.push({ d: s.day, s: s.slot, t: text, c: cls || 'info' });
    if (s.log.length > CFG.logCap) s.log.splice(0, s.log.length - CFG.logCap);
  }

  // ------------------------------------------------------------------ state --
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed === undefined ? Math.floor(Math.random() * 0xffffffff) : opts.seed) >>> 0;
    const s = {
      v: 1,
      seed: seed,
      rng: seed,
      name: opts.name || 'Host',
      occupation: null,
      phase: 'choose', // choose | idle | offer | gig
      level: 1, exp: 0,
      cash: CFG.startCash, points: CFG.startPoints, tickets: CFG.startTickets,
      merit: 0, fame: 0, rating: 5.0,
      stamina: CFG.baseStamina,
      residence: 'A rented room with a view of a wall',
      skills: [], equipped: [], blessings: [], buffs: [],
      items: {},
      assets: { owned: [], active: null, upgrades: {} },
      day: 1, slot: CFG.slotStart,
      totalGigs: 0, nightGigs: 0, totalEarned: 0, spins: 0, pity: 0,
      lastSignInDay: 0, streak: 0, bestStreak: 0,
      questIdx: 0, specials: {}, mythicArmed: false, mythicUnlocked: false, mandateDone: false,
      dailies: [], today: blankToday(),
      codex: {}, favor: {}, favorClaimed: {},
      achievements: [],
      contracts: [],
      pendingWindfalls: [],
      offer: null, gig: null,
      log: [],
    };
    addLog(s, '⚡ A blue window unfolds in the air before you. 【 LEGENDARY OCCUPATION SYSTEM — ONLINE 】', 'system');
    addLog(s, 'System: “Host detected. Employment status: tragic. Please select your next occupation. Compensation will be… generous.”', 'system');
    return s;
  }

  function blankToday() {
    return { gigs: 0, night: 0, earned: 0, bonus: 0, itemsUsed: 0, legends: 0, units: 0, clean: 0, dashcamUsed: false };
  }

  function occ(s) { return C.OCCUPATIONS[s.occupation]; }
  function activeAsset(s) {
    const o = occ(s);
    return o.assets.find(a => a.id === s.assets.active);
  }
  function legendById(id) { return C.LEGENDS.find(l => l.id === id); }

  // ------------------------------------------------------------------ stats --
  function getStats(s) {
    const st = {
      pace: 0, grace: 0, resonance: 0,
      maxStamina: CFG.baseStamina + CFG.staminaPerLevel * (s.level - 1),
      payMult: 0, bonusMult: 0, bonusAdd: 0, staminaMult: 1,
      luck: 0, legendBonus: 0, meritMult: 0, shopMult: 0,
      expMult: 0, fameMult: 0, nightPayMult: 0, pointsMult: 0,
      ratingGuard: false, findCash: 0,
    };
    if (!s.occupation) return st;
    const a = activeAsset(s);
    if (a) {
      st.pace += a.pace; st.grace += a.grace; st.resonance += a.resonance;
      const up = s.assets.upgrades[a.id] || {};
      st.pace += up.partA || 0; st.grace += up.partB || 0; st.resonance += up.partC || 0;
    }
    const sources = [];
    for (const id of s.equipped) if (C.SKILLS[id]) sources.push(C.SKILLS[id].fx);
    for (const id of s.blessings) if (C.BLESSINGS[id]) sources.push(C.BLESSINGS[id].fx);
    for (const b of s.buffs) sources.push(b.fx);
    for (const fx of sources) {
      if (!fx) continue;
      for (const k of ['pace', 'grace', 'resonance', 'maxStamina', 'payMult', 'bonusMult', 'bonusAdd', 'luck', 'legendBonus', 'meritMult', 'shopMult', 'expMult', 'fameMult', 'nightPayMult', 'pointsMult', 'findCash']) {
        if (typeof fx[k] === 'number') st[k] += fx[k];
      }
      if (fx.staminaMult) st.staminaMult *= fx.staminaMult;
      if (fx.ratingGuard) st.ratingGuard = true;
      if (fx.allStats) { st.pace += fx.allStats; st.grace += fx.allStats; st.resonance += fx.allStats; }
    }
    return st;
  }

  function getTitle(s) {
    if (s.mandateDone) return C.MANDATE_TITLE;
    let t = C.TITLES[0][1];
    for (const [lvl, name] of C.TITLES) if (s.level >= lvl) t = name;
    return t;
  }

  function xpForLevel(level) { return Math.round(CFG.xpBase * Math.pow(level, CFG.xpPow)); }

  function skillSlots(s) {
    return Math.min(CFG.skillSlotMax, 1 + Math.floor(s.level / CFG.skillSlotEvery));
  }

  function isNight(s) { return s.slot >= CFG.nightSlot; }
  function slotName(s) { return C.SLOTS[s.slot]; }

  // ------------------------------------------------------------ apply fx ----
  function grantExp(s, amount, out) {
    const st = getStats(s);
    const gained = Math.round(amount * (1 + st.expMult));
    s.exp += gained;
    let levels = 0;
    while (s.exp >= xpForLevel(s.level)) {
      s.exp -= xpForLevel(s.level);
      s.level += 1;
      levels += 1;
      s.stamina = getStats(s).maxStamina; // level-up fully restores stamina
      addLog(s, '✨ LEVEL UP! You are now Level ' + s.level + ' — ' + getTitle(s) + '. Stamina fully restored.', 'system');
    }
    if (out) { out.exp = (out.exp || 0) + gained; out.levelUps = (out.levelUps || 0) + levels; }
    return gained;
  }

  function grantSkill(s, id) {
    if (!C.SKILLS[id]) return null;
    if (s.skills.includes(id)) {
      const refund = { starter: 100, common: 60, rare: 150, epic: 400, legendary: 800 }[C.SKILLS[id].rarity] || 60;
      s.points += refund;
      addLog(s, 'Duplicate skill ' + C.SKILLS[id].name + ' converted to ' + refund + ' System Points.', 'reward');
      return { dupe: true, refund: refund };
    }
    s.skills.push(id);
    if (s.equipped.length < skillSlots(s)) s.equipped.push(id);
    addLog(s, '📜 Skill acquired: ' + C.SKILLS[id].name + ' — ' + C.SKILLS[id].desc, 'reward');
    return { dupe: false };
  }

  function grantBlessing(s, id) {
    if (!C.BLESSINGS[id] || s.blessings.includes(id)) return false;
    s.blessings.push(id);
    addLog(s, '🕯️ Blessing received: ' + C.BLESSINGS[id].name + ' — ' + C.BLESSINGS[id].desc, 'reward');
    return true;
  }

  function grantItem(s, id, qty) {
    if (!C.ITEMS[id]) return;
    s.items[id] = (s.items[id] || 0) + (qty || 1);
  }

  function applyRating(s, delta) {
    if (delta < 0) {
      const st = getStats(s);
      if ((s.items.guardianCharm || 0) > 0 && !s.today.dashcamUsed) {
        s.today.dashcamUsed = true;
        addLog(s, 'Your Guardian Charm grows warm — the rating loss is negated.', 'system');
        return 0;
      }
      if (st.ratingGuard) delta = delta / 2;
      if (s.gig) s.gig.ratingLost = true;
    }
    s.rating = Math.min(5, Math.max(3, Math.round((s.rating + delta) * 100) / 100));
    return delta;
  }

  function applyFx(s, fx, out) {
    if (!fx) return;
    out = out || {};
    const st = getStats(s);
    if (fx.cash) { s.cash = Math.max(0, s.cash + fx.cash); out.cash = (out.cash || 0) + fx.cash; }
    if (fx.points) { s.points = Math.max(0, s.points + fx.points); out.points = (out.points || 0) + fx.points; }
    if (fx.tickets) { s.tickets = Math.max(0, s.tickets + fx.tickets); out.tickets = (out.tickets || 0) + fx.tickets; }
    if (fx.exp) grantExp(s, fx.exp, out);
    if (fx.merit) {
      const m = fx.merit > 0 ? Math.round(fx.merit * (1 + st.meritMult)) : fx.merit;
      s.merit += m; out.merit = (out.merit || 0) + m;
    }
    if (fx.fame) {
      const f = fx.fame > 0 ? Math.round(fx.fame * (1 + st.fameMult)) : fx.fame;
      s.fame = Math.max(0, s.fame + f); out.fame = (out.fame || 0) + f;
    }
    if (fx.stamina) s.stamina = Math.min(getStats(s).maxStamina, Math.max(0, s.stamina + fx.stamina));
    if (fx.rating) applyRating(s, fx.rating);
    if (fx.item) grantItem(s, fx.item[0], fx.item[1]);
    if (fx.skill) grantSkill(s, fx.skill);
    if (fx.blessing) grantBlessing(s, fx.blessing);
    if (fx.buff) s.buffs.push(JSON.parse(JSON.stringify(fx.buff)));
    if (fx.windfall) s.pendingWindfalls.push({ min: fx.windfall.min, max: fx.windfall.max });
    if (s.gig) {
      if (fx.payPct) s.gig.payPct += fx.payPct;
      if (fx.bonusAdd) s.gig.bonusAdd += fx.bonusAdd;
      if (fx.favor && s.gig.kind === 'legend') bumpFavor(s, s.gig.clientId, fx.favor);
    }
    return out;
  }

  function bumpFavor(s, legendId, delta) {
    const prev = s.favor[legendId] || 0;
    const next = Math.max(0, prev + delta);
    s.favor[legendId] = next;
    const leg = legendById(legendId);
    if (!leg) return;
    const claimed = s.favorClaimed[legendId] || (s.favorClaimed[legendId] = {});
    for (const th of [3, 5]) {
      if (next >= th && !claimed[th] && leg.favorRewards && leg.favorRewards[th]) {
        claimed[th] = true;
        addLog(s, '💗 ' + leg.name + ' now holds you in high regard (Favor ' + th + ')!', 'system');
        applyFx(s, leg.favorRewards[th]);
      }
    }
  }

  // ------------------------------------------------------------- occupation --
  function listOccupations() {
    return C.OCCUPATION_ORDER.map(id => {
      const o = C.OCCUPATIONS[id];
      return { id: o.id, name: o.name, icon: o.icon, tagline: o.tagline, blurb: o.blurb, grantPreview: o.grantPreview, grantLines: o.grant.lines };
    });
  }

  function chooseOccupation(s, occId) {
    if (s.phase !== 'choose') return { ok: false, msg: 'Occupation already chosen.' };
    const o = C.OCCUPATIONS[occId];
    if (!o) return { ok: false, msg: 'Unknown occupation.' };
    s.occupation = occId;
    const g = o.grant;
    addLog(s, 'System: “An excellent choice, host. Processing awakening package…”', 'system');
    for (const line of g.lines) addLog(s, line, 'grant');
    s.cash += g.cash; s.points += g.points; s.tickets += g.tickets;
    s.fame += g.fame;
    s.residence = g.residence;
    for (const [id, qty] of g.items) grantItem(s, id, qty);
    for (const id of g.skills) grantSkill(s, id);
    for (const id of g.blessings) grantBlessing(s, id);
    s.assets.owned = [o.assets[0].id];
    s.assets.active = o.assets[0].id;
    s.phase = 'idle';
    genDailies(s);
    checkQuestsAndAchievements(s);
    return { ok: true, grant: g, occupation: o.name };
  }

  // ---------------------------------------------------------------- sign-in --
  function signIn(s) {
    if (s.phase === 'choose') return { ok: false, msg: 'Choose an occupation first.' };
    if (s.lastSignInDay === s.day) return { ok: false, msg: 'Already signed in today.' };
    s.streak = (s.lastSignInDay === s.day - 1) ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastSignInDay = s.day;
    const reward = C.SIGNIN[(s.streak - 1) % C.SIGNIN.length];
    applyFx(s, reward);
    addLog(s, '📅 Sign-in day ' + s.streak + ' — reward: ' + describeFx(reward), 'reward');
    checkQuestsAndAchievements(s);
    return { ok: true, streak: s.streak, reward: reward };
  }

  // ----------------------------------------------------------------- offers --
  function currentQuest(s) { return C.MAIN_QUESTS[s.questIdx] || null; }

  function pickLegend(s, night) {
    const pool = C.LEGENDS.filter(l => l.weight > 0);
    return weighted(s, pool, l => l.weight * (l.night ? (night ? 2 : 0.35) : 1));
  }

  function pickCommon(s, o, night) {
    const rarePool = o.commons.filter(c => c.rare);
    if (rarePool.length && chance(s, CFG.rareChance)) return weighted(s, rarePool, c => c.weight);
    const pool = o.commons.filter(c => !c.rare && (night || !c.night));
    return weighted(s, pool, c => c.weight);
  }

  function goOnline(s) {
    if (s.phase === 'choose') return { ok: false, msg: 'Choose an occupation first.' };
    if (s.phase !== 'idle') return { ok: false, msg: 'You are already working.' };
    if (s.stamina < 12) return { ok: false, msg: 'The System locks the app: “Rest, host. Legends require sleep.”' };
    const o = occ(s);
    const st = getStats(s);
    const night = isNight(s);
    let clientKind = 'common';
    let clientId = null;
    let forced = null;

    const q = currentQuest(s);
    if (q && q.id === 'q_third' && s.totalGigs === 2 && !s.specials.ghostBride) {
      clientKind = 'legend'; clientId = 'ghostBride'; forced = 'ghostBride';
    } else if (s.mythicArmed && !s.specials.jadeEmperor) {
      clientKind = 'legend'; clientId = 'jadeEmperor'; forced = 'jadeEmperor';
    } else {
      const pct = Math.min(CFG.legendCap, CFG.legendBase + st.resonance * CFG.legendPerResonance + (night ? CFG.legendNight : 0) + st.legendBonus) / 100;
      if (chance(s, pct)) {
        clientKind = 'legend';
        clientId = pickLegend(s, night).id;
      } else {
        clientId = pickCommon(s, o, night).id;
      }
    }

    let size = randInt(s, o.sizeRange[0], o.sizeRange[1]);
    if (forced === 'jadeEmperor') size = o.sizeRange[1]; // a FULL inspection, naturally
    const gigNight = forced === 'ghostBride' ? true : night;
    const staminaCost = Math.max(5, Math.round((o.staminaBase + size * o.staminaPerUnit - st.pace) * st.staminaMult));
    s.offer = { clientKind, clientId, size, night: gigNight, forced, staminaCost };
    s.phase = 'offer';
    const label = clientKind === 'legend' ? legendById(clientId).name : o.commons.find(c => c.id === clientId).name;
    addLog(s, '📳 Dispatch: ' + label + ' — ' + o.verbs.sizeFmt.replace('{n}', size) + (gigNight ? ' (night)' : ''), 'info');
    return { ok: true, offer: offerView(s) };
  }

  function offerView(s) {
    if (!s.offer) return null;
    const o = occ(s);
    const of = s.offer;
    const view = { kind: of.clientKind, size: of.size, sizeText: o.verbs.sizeFmt.replace('{n}', of.size), night: of.night, forced: of.forced, staminaCost: of.staminaCost };
    if (of.clientKind === 'legend') {
      const l = legendById(of.clientId);
      const met = !!s.codex[of.clientId];
      view.clientId = l.id;
      view.name = met ? l.name : '??? (' + (l.tier === 'mythic' ? 'MYTHIC' : l.tier.toUpperCase()) + ' presence)';
      view.epithet = met ? l.epithet : 'The System is vibrating with excitement.';
      view.intro = l.intro;
      view.tier = l.tier;
    } else {
      const c = occ(s).commons.find(x => x.id === of.clientId);
      view.clientId = c.id;
      view.name = c.name;
      view.intro = c.line;
      view.tier = c.rare ? 'rare' : 'common';
    }
    return view;
  }

  function declineOffer(s) {
    if (s.phase !== 'offer') return { ok: false, msg: 'No offer to decline.' };
    if (s.offer.forced) return { ok: false, msg: 'The System refuses: “Host. HOST. You cannot decline THIS one.”' };
    s.offer = null;
    s.phase = 'idle';
    s.stamina = Math.max(0, s.stamina - 2);
    addLog(s, 'You decline the job. The System sighs in disappointed kilobytes.', 'info');
    return { ok: true };
  }

  function acceptOffer(s) {
    if (s.phase !== 'offer') return { ok: false, msg: 'No offer to accept.' };
    const of = s.offer;
    if (s.stamina < of.staminaCost) return { ok: false, msg: 'Not enough stamina for this job.' };
    const o = occ(s);
    s.stamina -= of.staminaCost;
    const events = [];
    if (of.clientKind === 'legend') {
      const l = legendById(of.clientId);
      const evId = (l.events.byOcc && l.events.byOcc[s.occupation]) || l.events.generic;
      events.push(evId);
    } else {
      const c = o.commons.find(x => x.id === of.clientId);
      if (chance(s, 0.65)) {
        let pool = [];
        if (c.events && c.events.length && chance(s, 0.5)) pool = c.events.slice();
        else pool = o.events.concat(['s_haggle', 's_lostItem']);
        pool = pool.filter(id => !(C.EVENTS[id].night && !of.night));
        if (pool.length) events.push(pool[randInt(s, 0, pool.length - 1)]);
      }
    }
    s.gig = {
      clientKind: of.clientKind, kind: of.clientKind, clientId: of.clientId,
      size: of.size, night: of.night, forced: of.forced,
      events: events, eventIdx: 0, payPct: 0, bonusAdd: 0, ratingLost: false, texts: [],
    };
    s.offer = null;
    s.phase = 'gig';
    if (events.length === 0) return finishGig(s);
    return { ok: true, event: getCurrentEvent(s) };
  }

  function getCurrentEvent(s) {
    if (s.phase !== 'gig' || !s.gig || s.gig.eventIdx >= s.gig.events.length) return null;
    const ev = C.EVENTS[s.gig.events[s.gig.eventIdx]];
    const st = getStats(s);
    return {
      id: s.gig.events[s.gig.eventIdx],
      prompt: ev.prompt,
      choices: ev.choices.map(ch => {
        let available = true, reason = '';
        if (ch.req) {
          if (ch.req.skill && !s.equipped.includes(ch.req.skill)) { available = false; reason = 'Requires skill: ' + (C.SKILLS[ch.req.skill] ? C.SKILLS[ch.req.skill].name : ch.req.skill); }
          if (ch.req.item && !(s.items[ch.req.item] > 0)) { available = false; reason = 'Requires item: ' + (C.ITEMS[ch.req.item] ? C.ITEMS[ch.req.item].name : ch.req.item); }
          if (ch.req.stat) {
            for (const k of Object.keys(ch.req.stat)) {
              if (st[k] < ch.req.stat[k]) { available = false; reason = 'Requires ' + occ(s).statNames[k] + ' ' + ch.req.stat[k] + '+'; }
            }
          }
        }
        return { id: ch.id, label: ch.label, available, reason };
      }),
    };
  }

  function choose(s, choiceId) {
    if (s.phase !== 'gig' || !s.gig) return { ok: false, msg: 'No active job.' };
    const evId = s.gig.events[s.gig.eventIdx];
    const ev = C.EVENTS[evId];
    const ch = ev.choices.find(c => c.id === choiceId);
    if (!ch) return { ok: false, msg: 'No such choice.' };
    const st = getStats(s);
    if (ch.req) {
      if (ch.req.skill && !s.equipped.includes(ch.req.skill)) return { ok: false, msg: 'Skill not equipped.' };
      if (ch.req.item && !(s.items[ch.req.item] > 0)) return { ok: false, msg: 'Item not owned.' };
      if (ch.req.stat) for (const k of Object.keys(ch.req.stat)) if (st[k] < ch.req.stat[k]) return { ok: false, msg: 'Stat too low.' };
      if (ch.req.item) { s.items[ch.req.item] -= 1; s.today.itemsUsed += 1; }
    }
    const outcome = weighted(s, ch.outcomes, oc => oc.w * (oc.good ? 1 + st.luck : 1));
    const fxOut = {};
    applyFx(s, outcome.fx, fxOut);
    s.gig.texts.push(outcome.text);
    addLog(s, outcome.text, 'event');
    s.gig.eventIdx += 1;
    if (s.gig.eventIdx >= s.gig.events.length) {
      const done = finishGig(s);
      done.eventText = outcome.text;
      done.eventFx = fxOut;
      return done;
    }
    return { ok: true, eventText: outcome.text, eventFx: fxOut, event: getCurrentEvent(s) };
  }

  const TIER_EXP = { common: 0, rare: 8, epic: 25, legendary: 45, mythic: 200 };
  const TIER_POINTS = { rare: 12, epic: 45, legendary: 120, mythic: 800 };
  const TIER_FAME = { common: 5, rare: 15, epic: 40, legendary: 80, mythic: 500 };
  const TIER_GENEROSITY = { common: 1, rare: 1.3, epic: 1.6, legendary: 2.2, mythic: 6 };

  function finishGig(s) {
    const g = s.gig;
    const o = occ(s);
    const st = getStats(s);
    const isLegend = g.kind === 'legend';
    const legend = isLegend ? legendById(g.clientId) : null;
    const commonDef = isLegend ? null : o.commons.find(c => c.id === g.clientId);
    const tier = isLegend ? legend.tier : (commonDef.rare ? 'rare' : 'common');

    let payMults = 1 + st.payMult + (g.night ? st.nightPayMult : 0);
    const clientMult = isLegend ? legend.payMult : (commonDef.payMult || 1);
    let pay = (o.payout.base + o.payout.perUnit * g.size) * (g.night ? CFG.surgeNight : 1) * clientMult * payMults * (1 + g.payPct);
    pay = Math.max(0, Math.round(pay));

    let bonusRate = 0.05 + st.grace * 0.035 + st.bonusAdd + g.bonusAdd + (s.rating >= 4.9 ? 0.05 : 0);
    bonusRate = Math.max(0, bonusRate);
    let bonus = Math.round(pay * bonusRate * (1 + st.bonusMult) * TIER_GENEROSITY[tier]);

    const points = Math.round((isLegend || tier === 'rare' ? TIER_POINTS[tier] : randInt(s, 2, 6)) * (1 + st.pointsMult));
    const fame = Math.round(TIER_FAME[tier] * (1 + st.fameMult));
    const expBase = 14 + g.size * 2 + TIER_EXP[tier];

    s.cash += pay + bonus;
    s.points += points;
    s.fame += fame;
    s.totalEarned += pay + bonus;
    const out = {};
    grantExp(s, expBase, out);

    // find-cash passive
    let found = 0;
    if (st.findCash > 0 && chance(s, st.findCash)) {
      found = randInt(s, 50, 200);
      s.cash += found;
      addLog(s, '👃 Golden Nose: you find €' + found + ' tucked where only you would look.', 'reward');
    }

    // bookkeeping
    s.totalGigs += 1;
    if (g.night) s.nightGigs += 1;
    s.today.gigs += 1;
    if (g.night) s.today.night += 1;
    s.today.earned += pay + bonus;
    s.today.bonus += bonus;
    s.today.units += g.size;
    if (!g.ratingLost) s.today.clean += 1;

    if (isLegend) {
      s.today.legends += 1;
      if (!s.codex[g.clientId]) {
        s.codex[g.clientId] = true;
        addLog(s, '📖 Codex updated: ' + legend.name + ', ' + legend.epithet + '.', 'system');
      }
      bumpFavor(s, g.clientId, 1);
      if (g.clientId === 'ghostBride') s.specials.ghostBride = true;
      if (g.clientId === 'jadeEmperor') { s.specials.jadeEmperor = true; s.mythicArmed = false; }
    }

    // contracts: progress first, so the job that spawns one never counts toward it
    progressContracts(s, g, pay + bonus);
    if (isLegend && (s.favor[g.clientId] || 0) >= 3) maybeOfferContract(s, g.clientId);

    // decay gig-scoped buffs
    s.buffs = s.buffs.filter(b => {
      if (b.kind === 'gigs') { b.left -= 1; return b.left > 0; }
      return true;
    });

    s.slot = Math.min(CFG.maxSlot, s.slot + 1);
    s.gig = null;
    s.phase = 'idle';

    const clientName = isLegend ? legend.name : commonDef.name;
    const bonusWord = o.verbs.bonusNoun;
    addLog(s, '✅ ' + o.verbs.gigNoun + ' complete — ' + clientName + '. €' + pay + ' + €' + bonus + ' ' + bonusWord + ', ' + points + ' pts, ' + (out.exp || 0) + ' EXP.', 'gig');

    checkQuestsAndAchievements(s);

    return {
      ok: true, done: true,
      summary: {
        client: clientName, tier, night: g.night, size: g.size,
        pay, bonus, points, fame, exp: out.exp || 0, levelUps: out.levelUps || 0,
        found, texts: g.texts.slice(),
        favor: isLegend ? s.favor[g.clientId] : null,
        legendId: isLegend ? g.clientId : null,
      },
    };
  }

  // -------------------------------------------------------------- day cycle --
  function endDay(s) {
    if (s.phase === 'choose') return { ok: false, msg: 'Choose an occupation first.' };
    if (s.phase !== 'idle') return { ok: false, msg: 'Finish the current job first.' };
    const paid = [];
    for (const w of s.pendingWindfalls) {
      const amt = randInt(s, w.min, w.max);
      s.cash += amt;
      paid.push(amt);
      addLog(s, '💰 Cai Shen’s tip pays off: +€' + amt + '. The napkin was real.', 'reward');
    }
    s.pendingWindfalls = [];
    s.day += 1;
    if (s.contracts && s.contracts.length) {
      s.contracts = s.contracts.filter(c => {
        if (s.day > c.deadline) {
          addLog(s, '🍂 The contract with ' + legendById(c.legendId).name + ' lapses quietly: ' + c.desc + '. Legends have long memories and longer patience.', 'info');
          return false;
        }
        return true;
      });
    }
    s.slot = CFG.slotStart;
    s.stamina = getStats(s).maxStamina;
    s.today = blankToday();
    s.buffs = s.buffs.filter(b => {
      if (b.kind === 'day') { b.left -= 1; return b.left > 0; }
      return true;
    });
    genDailies(s);
    addLog(s, '🌅 Day ' + s.day + ' begins. The System hums a small good-morning jingle.', 'system');
    checkQuestsAndAchievements(s);
    return { ok: true, day: s.day, windfalls: paid };
  }

  function genDailies(s) {
    const pool = C.DAILY_POOL.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const i = randInt(s, 0, pool.length - 1);
      picked.push(pool.splice(i, 1)[0]);
    }
    s.dailies = picked.map(d => ({ id: d.id, claimed: false }));
  }

  function dailiesView(s) {
    return s.dailies.map(entry => {
      const def = C.DAILY_POOL.find(d => d.id === entry.id);
      const progress = Math.min(def.goal, s.today[def.counter] || 0);
      return { id: def.id, desc: def.desc, progress, goal: def.goal, fx: def.fx, claimed: entry.claimed, ready: !entry.claimed && progress >= def.goal };
    });
  }

  // -------------------------------------------------------------- contracts --
  function maybeOfferContract(s, legendId) {
    if (!s.contracts) s.contracts = [];
    if (s.contracts.length >= C.CONTRACT_MAX_ACTIVE) return null;
    if (s.contracts.some(c => c.legendId === legendId)) return null;
    if (!chance(s, C.CONTRACT_CHANCE)) return null;
    return offerContract(s, legendId);
  }

  function offerContract(s, legendId) {
    if (!s.contracts) s.contracts = [];
    const legend = legendById(legendId);
    const tpl = C.CONTRACTS[randInt(s, 0, C.CONTRACTS.length - 1)];
    const goal = randInt(s, tpl.goal[0], tpl.goal[1]);
    const generous = legend.tier === 'legendary' ? 1.5 : 1;
    const fx = {};
    for (const k of Object.keys(tpl.fx)) fx[k] = Math.round(tpl.fx[k] * generous);
    const contract = {
      legendId, tplId: tpl.id, counter: tpl.counter,
      desc: tpl.desc.replace('{n}', goal).replace('{d}', tpl.days),
      goal, progress: 0, deadline: s.day + tpl.days, fx,
    };
    s.contracts.push(contract);
    addLog(s, '📜 ' + legend.name + ' extends a contract: ' + contract.desc + ' → ' + describeFx(fx) + '. The System files the paperwork instantly.', 'quest');
    return contract;
  }

  function progressContracts(s, gig, earned) {
    if (!s.contracts || !s.contracts.length) return;
    const fulfilled = [];
    for (const c of s.contracts) {
      if (c.counter === 'gigs') c.progress += 1;
      else if (c.counter === 'night' && gig.night) c.progress += 1;
      else if (c.counter === 'earned') c.progress += earned;
      else if (c.counter === 'clean' && !gig.ratingLost) c.progress += 1;
      if (c.progress >= c.goal) fulfilled.push(c);
    }
    for (const c of fulfilled) {
      s.contracts.splice(s.contracts.indexOf(c), 1);
      addLog(s, '🏵️ Contract fulfilled for ' + legendById(c.legendId).name + ': ' + c.desc + ' → ' + describeFx(c.fx), 'quest');
      applyFx(s, c.fx);
      bumpFavor(s, c.legendId, 1);
    }
  }

  function contractsView(s) {
    return (s.contracts || []).map(c => {
      const legend = legendById(c.legendId);
      return { legend: legend.name, legendId: c.legendId, desc: c.desc, progress: Math.min(c.goal, Math.round(c.progress)), goal: c.goal, daysLeft: c.deadline - s.day, fx: c.fx };
    });
  }

  // ---------------------------------------------------------------- records --
  function recordsView(s) {
    return {
      day: s.day, level: s.level, title: getTitle(s),
      totalGigs: s.totalGigs, nightGigs: s.nightGigs,
      totalEarned: s.totalEarned, spins: s.spins,
      bestStreak: s.bestStreak, merit: s.merit, fame: s.fame,
      legendsMet: Object.keys(s.codex).length, legendsTotal: C.LEGENDS.length,
      questsDone: s.questIdx, questsTotal: C.MAIN_QUESTS.length,
      achievements: C.ACHIEVEMENTS.map(a => ({ id: a.id, name: a.name, desc: a.desc, points: a.points, earned: s.achievements.includes(a.id) })),
    };
  }

  function claimDaily(s, id) {
    const entry = s.dailies.find(d => d.id === id);
    if (!entry) return { ok: false, msg: 'No such mission today.' };
    if (entry.claimed) return { ok: false, msg: 'Already claimed.' };
    const def = C.DAILY_POOL.find(d => d.id === id);
    if ((s.today[def.counter] || 0) < def.goal) return { ok: false, msg: 'Not complete yet.' };
    entry.claimed = true;
    applyFx(s, def.fx);
    addLog(s, '🎯 Daily mission complete: ' + def.desc + ' → ' + describeFx(def.fx), 'reward');
    checkQuestsAndAchievements(s);
    return { ok: true, reward: def.fx };
  }

  // ------------------------------------------------------------------ shop --
  function shopPrice(s, basePrice) {
    const st = getStats(s);
    return Math.max(1, Math.round(basePrice * (1 + st.shopMult)));
  }

  function listShop(s) {
    return Object.keys(C.ITEMS).map(id => ({ id, name: C.ITEMS[id].name, desc: C.ITEMS[id].desc, price: shopPrice(s, C.ITEMS[id].price), owned: s.items[id] || 0 }));
  }

  function buyItem(s, id) {
    const item = C.ITEMS[id];
    if (!item) return { ok: false, msg: 'No such item.' };
    const price = shopPrice(s, item.price);
    if (s.cash < price) return { ok: false, msg: 'Not enough cash.' };
    s.cash -= price;
    grantItem(s, id, 1);
    addLog(s, '🛍️ Bought ' + item.name + ' for €' + price + '.', 'info');
    return { ok: true, price };
  }

  function useItem(s, id) {
    const item = C.ITEMS[id];
    if (!item) return { ok: false, msg: 'No such item.' };
    if (!(s.items[id] > 0)) return { ok: false, msg: 'You do not own that.' };
    if (!item.use) return { ok: false, msg: item.name + ' is not used directly — keep it; the right moment will come.' };
    if (item.use.gift) {
      if (s.phase !== 'gig' || s.gig.kind !== 'legend') return { ok: false, msg: 'Gifts only land during a job with a legendary client.' };
      const gift = item.use.gift;
      if (gift.onlyTarget && s.gig.clientId !== gift.bonusTarget) return { ok: false, msg: 'This gift is meant for someone else. The System refuses to let you waste it.' };
      const amount = (s.gig.clientId === gift.bonusTarget) ? gift.bonusFavor : gift.favor;
      s.items[id] -= 1;
      s.today.itemsUsed += 1;
      bumpFavor(s, s.gig.clientId, amount);
      addLog(s, '🎁 You offer ' + item.name + '. Favor +' + amount + '.', 'reward');
      checkQuestsAndAchievements(s);
      return { ok: true, favor: amount };
    }
    s.items[id] -= 1;
    s.today.itemsUsed += 1;
    if (item.use.stamina) {
      s.stamina = Math.min(getStats(s).maxStamina, s.stamina + item.use.stamina);
      addLog(s, '🥤 ' + item.name + ': stamina +' + item.use.stamina + '.', 'info');
    }
    if (item.use.buff) {
      s.buffs.push(JSON.parse(JSON.stringify(item.use.buff)));
      addLog(s, '✨ ' + item.name + ' active: ' + item.desc, 'info');
    }
    checkQuestsAndAchievements(s);
    return { ok: true };
  }

  // ----------------------------------------------------------------- wheel --
  function buyTicket(s) {
    if (s.points < CFG.ticketPoints) return { ok: false, msg: 'Not enough System Points.' };
    s.points -= CFG.ticketPoints;
    s.tickets += 1;
    addLog(s, '🎟️ Exchanged ' + CFG.ticketPoints + ' Points for a Wheel ticket.', 'info');
    return { ok: true };
  }

  function spinWheel(s) {
    if (s.phase === 'choose') return { ok: false, msg: 'Choose an occupation first.' };
    if (s.tickets < 1) return { ok: false, msg: 'No Wheel tickets. Exchange Points or complete missions.' };
    s.tickets -= 1;
    s.spins += 1;
    let prize;
    if (s.pity >= CFG.pityLimit - 1) {
      const epics = C.WHEEL.filter(p => p.epicClass);
      prize = weighted(s, epics, p => p.w);
    } else {
      prize = weighted(s, C.WHEEL, p => p.w);
    }
    s.pity = prize.epicClass ? 0 : s.pity + 1;
    const result = { label: prize.label, kind: prize.kind, epicClass: !!prize.epicClass };
    if (prize.kind === 'cash') { s.cash += prize.amount; result.amount = prize.amount; }
    if (prize.kind === 'points') { s.points += prize.amount; result.amount = prize.amount; }
    if (prize.kind === 'ticket') { s.tickets += prize.amount; result.amount = prize.amount; }
    if (prize.kind === 'item') { grantItem(s, prize.id, 1); result.itemId = prize.id; }
    if (prize.kind === 'skill') {
      const pool = Object.keys(C.SKILLS).filter(id => {
        const sk = C.SKILLS[id];
        return sk.rarity === prize.rarity && !sk.questOnly && !sk.occ && !s.skills.includes(id);
      });
      if (pool.length) {
        const id = pool[randInt(s, 0, pool.length - 1)];
        grantSkill(s, id);
        result.skillId = id;
        result.skillName = C.SKILLS[id].name;
      } else {
        const refund = { common: 60, rare: 150, epic: 400 }[prize.rarity] || 60;
        s.points += refund;
        result.refund = refund;
      }
    }
    addLog(s, '🎡 Wheel of Destiny: ' + prize.label + (prize.epicClass ? ' — the wheel BLAZES!' : ''), prize.epicClass ? 'reward' : 'info');
    checkQuestsAndAchievements(s);
    return { ok: true, prize: result, pity: s.pity };
  }

  // ---------------------------------------------------------------- assets --
  function listAssets(s) {
    const o = occ(s);
    return o.assets.map((a, i) => {
      const up = s.assets.upgrades[a.id] || {};
      return {
        id: a.id, name: a.name, blurb: a.blurb, price: a.price, idx: i,
        pace: a.pace, grace: a.grace, resonance: a.resonance,
        mythic: !!a.mythic, locked: !!a.mythic && !s.mythicUnlocked,
        owned: s.assets.owned.includes(a.id), active: s.assets.active === a.id,
        upgrades: { partA: up.partA || 0, partB: up.partB || 0, partC: up.partC || 0 },
      };
    });
  }

  function buyAsset(s, id) {
    const o = occ(s);
    const idx = o.assets.findIndex(a => a.id === id);
    if (idx < 0) return { ok: false, msg: 'No such ' + o.verbs.workNoun + '.' };
    const a = o.assets[idx];
    if (s.assets.owned.includes(id)) return { ok: false, msg: 'Already owned.' };
    if (a.mythic && !s.mythicUnlocked) return { ok: false, msg: 'Locked. Heaven has not yet granted its mandate.' };
    if (s.cash < a.price) return { ok: false, msg: 'Not enough cash.' };
    s.cash -= a.price;
    s.assets.owned.push(id);
    s.assets.active = id;
    addLog(s, '🔑 Acquired: ' + a.name + '! ' + a.blurb, 'reward');
    checkQuestsAndAchievements(s);
    return { ok: true };
  }

  function selectAsset(s, id) {
    if (!s.assets.owned.includes(id)) return { ok: false, msg: 'Not owned.' };
    s.assets.active = id;
    return { ok: true };
  }

  function upgradeCost(s, assetId, part) {
    const o = occ(s);
    const idx = o.assets.findIndex(a => a.id === assetId);
    const lvl = (s.assets.upgrades[assetId] || {})[part] || 0;
    return CFG.upgradeCostBase * (idx + 1) * (lvl + 1);
  }

  function upgradeAsset(s, part) {
    if (!['partA', 'partB', 'partC'].includes(part)) return { ok: false, msg: 'Unknown part.' };
    const id = s.assets.active;
    const up = s.assets.upgrades[id] || (s.assets.upgrades[id] = {});
    const lvl = up[part] || 0;
    if (lvl >= CFG.upgradeMax) return { ok: false, msg: 'Already at maximum.' };
    const cost = upgradeCost(s, id, part);
    if (s.cash < cost) return { ok: false, msg: 'Not enough cash (need €' + cost + ').' };
    s.cash -= cost;
    up[part] = lvl + 1;
    const o = occ(s);
    addLog(s, '🔧 ' + o.partNames[part] + ' upgraded to Lv.' + up[part] + ' (−€' + cost + ').', 'info');
    checkQuestsAndAchievements(s);
    return { ok: true, level: up[part], cost };
  }

  // ---------------------------------------------------------------- skills --
  function equipSkill(s, id) {
    if (!s.skills.includes(id)) return { ok: false, msg: 'Skill not learned.' };
    if (s.equipped.includes(id)) return { ok: false, msg: 'Already equipped.' };
    if (s.equipped.length >= skillSlots(s)) return { ok: false, msg: 'All skill slots in use.' };
    s.equipped.push(id);
    return { ok: true };
  }

  function unequipSkill(s, id) {
    const i = s.equipped.indexOf(id);
    if (i < 0) return { ok: false, msg: 'Not equipped.' };
    s.equipped.splice(i, 1);
    return { ok: true };
  }

  // ---------------------------------------------------- quests/achievements --
  function checkCondition(s, check) {
    switch (check.type) {
      case 'gigs': return s.totalGigs >= check.n;
      case 'level': return s.level >= check.n;
      case 'assets': return s.assets.owned.length >= check.n;
      case 'favorAny': return Object.values(s.favor).some(v => v >= check.n);
      case 'legendsMet': return Object.keys(s.codex).length >= check.n;
      case 'nightGigs': return s.nightGigs >= check.n;
      case 'cashHeld': return s.cash >= check.n;
      case 'streak': return s.bestStreak >= check.n;
      case 'spins': return s.spins >= check.n;
      case 'merit': return s.merit >= check.n;
      case 'maxAsset': return Object.values(s.assets.upgrades).some(up => (up.partA || 0) >= CFG.upgradeMax && (up.partB || 0) >= CFG.upgradeMax && (up.partC || 0) >= CFG.upgradeMax);
      case 'codexAll': return C.LEGENDS.every(l => s.codex[l.id]);
      case 'ratingHigh': return s.rating >= check.min && s.totalGigs >= check.gigs;
      case 'special': return !!s.specials[check.id];
      case 'and': return check.of.every(c => checkCondition(s, c));
      default: return false;
    }
  }

  function checkQuestsAndAchievements(s) {
    let guard = 0;
    while (guard++ < 10) {
      const q = currentQuest(s);
      if (!q || !checkCondition(s, q.check)) break;
      s.questIdx += 1;
      addLog(s, '🏆 MAIN QUEST COMPLETE: ' + q.name + ' — ' + describeFx(q.fx), 'quest');
      applyFx(s, q.fx);
      if (q.special === 'armMythic') {
        s.mythicArmed = true;
        addLog(s, 'The System goes very quiet. “Host… the next dispatch comes from the top. Dress appropriately.”', 'system');
      }
      if (q.special === 'unlockMythicAsset') {
        s.mythicUnlocked = true;
        s.mandateDone = true;
        addLog(s, '🌟 Heaven’s Mandate obtained! The final tier of your trade is now purchasable, and your title ascends: ' + C.MANDATE_TITLE + '.', 'quest');
      }
    }
    for (const a of C.ACHIEVEMENTS) {
      if (!s.achievements.includes(a.id) && checkCondition(s, a.check)) {
        s.achievements.push(a.id);
        s.points += a.points;
        addLog(s, '🥇 Achievement: ' + a.name + ' (+' + a.points + ' pts) — ' + a.desc, 'quest');
      }
    }
  }

  function questView(s) {
    const q = currentQuest(s);
    return {
      current: q ? { id: q.id, name: q.name, desc: q.desc } : null,
      completed: C.MAIN_QUESTS.slice(0, s.questIdx).map(x => ({ id: x.id, name: x.name })),
      total: C.MAIN_QUESTS.length,
    };
  }

  function codexView(s) {
    return C.LEGENDS.map(l => {
      const met = !!s.codex[l.id];
      return {
        id: l.id, met, tier: l.tier,
        name: met ? l.name : '???',
        epithet: met ? l.epithet : 'Not yet encountered',
        codex: met ? l.codex : 'The System’s files on this being remain sealed.',
        favor: s.favor[l.id] || 0,
      };
    });
  }

  // ------------------------------------------------------------ save/load ---
  function save(s) { return JSON.stringify(s); }
  function load(str) {
    const s = JSON.parse(str);
    if (!s || s.v !== 1) throw new Error('Unsupported save version');
    if (!s.contracts) s.contracts = []; // saves from before contracts existed
    return s;
  }

  // ------------------------------------------------------------- describe ---
  function describeFx(fx) {
    if (!fx) return '';
    const parts = [];
    if (fx.cash) parts.push('€' + fx.cash);
    if (fx.points) parts.push(fx.points + ' pts');
    if (fx.tickets) parts.push(fx.tickets + ' ticket' + (fx.tickets > 1 ? 's' : ''));
    if (fx.exp) parts.push(fx.exp + ' EXP');
    if (fx.merit) parts.push(fx.merit + ' merit');
    if (fx.item) parts.push((C.ITEMS[fx.item[0]] ? C.ITEMS[fx.item[0]].name : fx.item[0]) + ' ×' + fx.item[1]);
    if (fx.skill) parts.push('skill: ' + (C.SKILLS[fx.skill] ? C.SKILLS[fx.skill].name : fx.skill));
    if (fx.blessing) parts.push('blessing: ' + (C.BLESSINGS[fx.blessing] ? C.BLESSINGS[fx.blessing].name : fx.blessing));
    return parts.join(', ');
  }

  return {
    CONTENT: C,
    newGame, listOccupations, chooseOccupation,
    signIn, goOnline, offerView, acceptOffer, declineOffer,
    getCurrentEvent, choose, endDay,
    buyItem, useItem, listShop, shopPrice,
    buyTicket, spinWheel,
    listAssets, buyAsset, selectAsset, upgradeAsset, upgradeCost,
    equipSkill, unequipSkill, skillSlots,
    claimDaily, dailiesView, questView, codexView, contractsView, recordsView,
    getStats, getTitle, xpForLevel, isNight, slotName, describeFx,
    save, load,
    _test: { rand, randInt, chance, weighted, applyFx, grantExp, checkCondition, bumpFavor, addLog, offerContract, progressContracts, maybeOfferContract },
  };
});
