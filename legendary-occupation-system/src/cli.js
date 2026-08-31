#!/usr/bin/env node
'use strict';
/*
 * Legendary Occupation System — terminal client.
 *
 *   npm start           (or: node src/cli.js)
 *
 * The System's full mind speaks through Claude when credentials are present
 * (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login`, after
 * `npm install`); otherwise its offline shard keeps you company.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const LOS = require('./engine.js');
const MIND = require('./mind.js');
const nodeMind = require('./mind-node.js');

const C = LOS.CONTENT;
const SAVE_FILE = path.join(process.cwd(), 'los-save.json');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (code, t) => (useColor ? '[' + code + 'm' + t + '[0m' : t);
const cyan = t => col(36, t), dim = t => col(2, t), bold = t => col(1, t);
const gold = t => col(33, t), green = t => col(32, t), red = t => col(31, t), mag = t => col(35, t);

let state;
let mind;

function snapshot() {
  if (!state.occupation) return null;
  const st = LOS.getStats(state);
  const fest = LOS.festivalToday(state);
  return {
    occupation: state.occupation,
    occupationName: C.OCCUPATIONS[state.occupation].name,
    day: state.day, slotName: LOS.slotName(state),
    level: state.level, title: LOS.getTitle(state),
    cash: state.cash, points: state.points, rating: state.rating.toFixed(2),
    stamina: state.stamina, maxStamina: st.maxStamina,
    festival: fest ? fest.name : null,
  };
}

async function systemSpeaks(promise) {
  try {
    const res = await promise;
    if (res.thinking) {
      console.log(dim('┈ SYSTEM CORE ┈ ' + res.thinking.trim().split('\n').join('\n┈             ┈ ')));
    }
    console.log(cyan(bold('SYSTEM ▸ ')) + res.say + dim('  (' + res.mood + ')'));
  } catch (e) {
    console.log(dim('SYSTEM ▸ …static… (mind unreachable: ' + (e.message || e) + ')'));
  }
}

function header() {
  const o = state.occupation ? C.OCCUPATIONS[state.occupation] : null;
  const st = LOS.getStats(state);
  console.log('');
  console.log(cyan('┌──────────────────────────────────────────────────────────────┐'));
  console.log(cyan('│ ') + bold('【 LEGENDARY OCCUPATION SYSTEM 】') + '  ' + dim(mind.online ? 'mind: Claude (' + nodeMind.MODEL + ')' : 'mind: offline shard'));
  if (o) {
    console.log(cyan('│ ') + state.name + ' — ' + o.icon + ' ' + o.name + ' · Lv.' + state.level + ' ' + gold(LOS.getTitle(state)) + '  ' + dim('EXP ' + state.exp + '/' + LOS.xpForLevel(state.level)));
    console.log(cyan('│ ') + 'Day ' + state.day + ', ' + LOS.slotName(state) + (LOS.isNight(state) ? ' 🌙' : '') +
      ' · ' + green('€' + state.cash) + ' · ' + mag(state.points + ' pts') + ' · 🎟️' + state.tickets +
      ' · ⭐' + state.rating.toFixed(2) + ' · ⚡' + state.stamina + '/' + st.maxStamina + ' · 🧧merit ' + state.merit);
    console.log(cyan('│ ') + dim('Residence: ' + state.residence));
    const fest = LOS.festivalToday(state);
    if (fest) console.log(cyan('│ ') + gold(fest.icon + ' ' + fest.name + ' — ' + fest.blurb));
  }
  console.log(cyan('└──────────────────────────────────────────────────────────────┘'));
}

function printRecentLog(n) {
  for (const entry of state.log.slice(-n)) {
    const tint = { system: cyan, reward: gold, quest: mag, grant: gold, event: (t) => t, gig: green }[entry.c] || dim;
    console.log('  ' + tint(entry.t));
  }
}

async function menu(title, options) {
  console.log(bold('\n' + title));
  options.forEach((o, i) => console.log('  ' + gold('[' + (o.key || i + 1) + ']') + ' ' + o.label + (o.note ? dim('  ' + o.note) : '')));
  const ans = (await rl.question(dim('choose ▸ '))).trim().toLowerCase();
  const found = options.find((o, i) => String(o.key || i + 1).toLowerCase() === ans);
  return found ? found.id : null;
}

async function chooseOccupation() {
  console.log(cyan('\n⚡ A blue window unfolds in the air. The SYSTEM is watching, politely.\n'));
  const occs = LOS.listOccupations();
  occs.forEach((o, i) => {
    console.log(gold('[' + (i + 1) + '] ') + bold(o.icon + ' ' + o.name));
    console.log('     ' + o.tagline);
    console.log('     ' + green('AWAKENING GRANT: ' + o.grantPreview) + '\n');
  });
  while (true) {
    const ans = (await rl.question(dim('Select your destiny [1-' + occs.length + '] ▸ '))).trim();
    const idx = parseInt(ans, 10) - 1;
    if (occs[idx]) {
      const r = LOS.chooseOccupation(state, occs[idx].id);
      if (r.ok) {
        console.log('');
        for (const line of r.grant.lines) console.log(gold('  ' + line));
        await systemSpeaks(mind.observe(snapshot(),
          'The host just chose the occupation ' + r.occupation + ' and received the full awakening grant (workplace, relics, cash, residence). Their old life ended thirty seconds ago.',
          { kind: 'grant', seed: state.seed }));
        return;
      }
    }
    console.log(red('The System pretends not to have heard that.'));
  }
}

async function runGig() {
  const r = LOS.goOnline(state);
  if (!r.ok) { console.log(red(r.msg)); return; }
  const o = C.OCCUPATIONS[state.occupation];
  const of = r.offer;
  console.log('\n📳 ' + bold('DISPATCH — ' + of.name) + (of.night ? ' 🌙' : ''));
  console.log('   ' + dim(of.epithet || ''));
  console.log('   “' + of.intro + '”');
  console.log('   ' + of.sizeText + ' · stamina cost ' + of.staminaCost + (of.forced ? red('  【 PRIORITY — CANNOT DECLINE 】') : ''));
  const act = await menu('Respond:', [
    { id: 'accept', label: 'Accept the ' + o.verbs.gigNoun },
    { id: 'decline', label: 'Decline' },
  ]);
  if (act !== 'accept') {
    const d = LOS.declineOffer(state);
    if (!d.ok) { console.log(red(d.msg)); return runGigAccepted(); }
    return;
  }
  return runGigAccepted();

  async function runGigAccepted() {
    let res = LOS.acceptOffer(state);
    if (!res.ok) { console.log(red(res.msg)); return; }
    while (!res.done) {
      const ev = LOS.getCurrentEvent(state);
      console.log('\n' + mag('❖ ') + ev.prompt);
      const opts = ev.choices.map(ch => ({ id: ch.id, label: ch.available ? ch.label : dim(ch.label + '  ✗ ' + ch.reason) }));
      opts.push({ id: '_item', key: 'i', label: dim('Use an item / gift') });
      const pick = await menu('Your move:', opts);
      if (pick === '_item') { await useItemFlow(); continue; }
      const chosen = ev.choices.find(c => c.id === pick);
      if (!chosen || !chosen.available) { console.log(red('The System coughs meaningfully. (Pick an available option.)')); continue; }
      res = LOS.choose(state, pick);
      if (res.eventText) console.log('   ' + res.eventText);
    }
    const s = res.summary;
    console.log('\n' + green('✅ Complete — ' + s.client) + '  ' + gold('€' + s.pay + ' + €' + s.bonus + ' ' + C.OCCUPATIONS[state.occupation].verbs.bonusNoun) +
      ' · ' + mag(s.points + ' pts') + ' · ' + s.exp + ' EXP' + (s.levelUps ? gold('  ⬆ LEVEL UP ×' + s.levelUps) : '') +
      (s.favor ? mag('  💗 favor ' + s.favor) : ''));
    const moral = MIND.judgeGig(s);
    const happening = 'The host completed a ' + s.tier + ' ' + C.OCCUPATIONS[state.occupation].verbs.gigNoun +
      ' for ' + s.client + (s.night ? ' at night' : '') + ', earning €' + (s.pay + s.bonus) + '. ' +
      (s.texts.length ? 'What happened: ' + s.texts.join(' ') : 'It was uneventful, honest work.');
    await systemSpeaks(mind.observe(snapshot(), happening, { moral, note: s.client + ': ' + (s.texts[0] || 'honest work'), legend: !!s.legendId, seed: state.seed + state.totalGigs }));
  }
}

async function useItemFlow() {
  const owned = Object.entries(state.items).filter(([, n]) => n > 0);
  if (!owned.length) { console.log(dim('Your pockets contain lint and ambition.')); return; }
  const opts = owned.map(([id, n]) => ({ id, label: C.ITEMS[id].name + ' ×' + n, note: C.ITEMS[id].desc }));
  opts.push({ id: '_back', key: 'b', label: 'Back' });
  const pick = await menu('Items:', opts);
  if (!pick || pick === '_back') return;
  const r = LOS.useItem(state, pick);
  console.log(r.ok ? green('Done.') : red(r.msg));
}

async function talk() {
  const q = (await rl.question(cyan('You ▸ '))).trim();
  if (!q) return;
  await systemSpeaks(mind.chat(snapshot(), q, { seed: state.seed + state.log.length }));
}

async function missions() {
  const qv = LOS.questView(state);
  console.log(bold('\n🏆 Main Quest ') + dim('(' + qv.completed.length + '/' + qv.total + ' complete)'));
  console.log(qv.current ? '  ▸ ' + qv.current.name + ' — ' + qv.current.desc : gold('  The chain is complete. Heaven files you under “legend”.'));
  console.log(bold('\n🎯 Daily Missions'));
  const dailies = LOS.dailiesView(state);
  dailies.forEach(d => console.log('  ' + (d.claimed ? dim('✔ ' + d.desc) : (d.ready ? green('★ ' + d.desc + ' — READY') : d.desc + dim(' (' + d.progress + '/' + d.goal + ')')))));
  const ready = dailies.filter(d => d.ready);
  for (const d of ready) {
    const r = LOS.claimDaily(state, d.id);
    if (r.ok) console.log(gold('  Claimed: ' + d.desc + ' → ' + LOS.describeFx(d.fx)));
  }
  const contracts = LOS.contractsView(state);
  if (contracts.length) {
    console.log(bold('\n📜 Legend Contracts'));
    contracts.forEach(c => console.log('  ' + mag(c.legend) + ' — ' + c.desc + dim(' (' + c.progress + '/' + c.goal + ', ' + c.daysLeft + ' day' + (c.daysLeft === 1 ? '' : 's') + ' left) → ' + LOS.describeFx(c.fx))));
  }
}

function records() {
  const r = LOS.recordsView(state);
  console.log(bold('\n🏅 System Records — ') + gold(r.title) + dim(' (Lv.' + r.level + ', day ' + r.day + ')'));
  console.log('  Jobs ' + r.totalGigs + ' (' + r.nightGigs + ' at night) · earned €' + r.totalEarned.toLocaleString() +
    ' · spins ' + r.spins + ' · best streak ' + r.bestStreak + ' · merit ' + r.merit);
  console.log('  Legends met ' + r.legendsMet + '/' + r.legendsTotal + ' · quests ' + r.questsDone + '/' + r.questsTotal);
  console.log(bold('\n  Achievements'));
  for (const a of r.achievements) {
    console.log('  ' + (a.earned ? gold('🥇 ' + a.name) : dim('○ ' + a.name)) + dim(' — ' + a.desc + ' (+' + a.points + ' pts)'));
  }
}

async function workplace() {
  const o = C.OCCUPATIONS[state.occupation];
  const assets = LOS.listAssets(state);
  console.log(bold('\n' + o.icon + ' ' + o.verbs.workNoun.toUpperCase() + 'S'));
  assets.forEach((a, i) => {
    const tag = a.active ? green(' [ACTIVE]') : a.owned ? gold(' [OWNED]') : a.locked ? red(' [SEALED BY HEAVEN]') : dim(' €' + a.price);
    console.log('  [' + (i + 1) + '] ' + a.name + tag + dim('  ' + o.statNames.pace + ' ' + a.pace + ' · ' + o.statNames.grace + ' ' + a.grace + ' · ' + o.statNames.resonance + ' ' + a.resonance));
    console.log('      ' + dim(a.blurb));
  });
  const act = await menu('Manage:', [
    { id: 'buy', label: 'Buy / switch (enter number next)' },
    { id: 'upA', label: 'Upgrade ' + o.partNames.partA, note: '€' + LOS.upgradeCost(state, state.assets.active, 'partA') },
    { id: 'upB', label: 'Upgrade ' + o.partNames.partB, note: '€' + LOS.upgradeCost(state, state.assets.active, 'partB') },
    { id: 'upC', label: 'Upgrade ' + o.partNames.partC, note: '€' + LOS.upgradeCost(state, state.assets.active, 'partC') },
    { id: 'back', key: 'b', label: 'Back' },
  ]);
  if (act === 'buy') {
    const n = parseInt((await rl.question(dim('which number ▸ '))).trim(), 10) - 1;
    if (assets[n]) {
      const a = assets[n];
      const r = a.owned ? LOS.selectAsset(state, a.id) : LOS.buyAsset(state, a.id);
      console.log(r.ok ? green('Done.') : red(r.msg));
    }
  } else if (act && act.startsWith('up')) {
    const r = LOS.upgradeAsset(state, 'part' + act[2]);
    console.log(r.ok ? green('Upgraded to Lv.' + r.level + '.') : red(r.msg));
  }
}

async function shop() {
  const goods = LOS.listShop(state);
  const opts = goods.map(g => ({ id: g.id, label: g.name + ' — €' + g.price + (g.owned ? dim(' (own ' + g.owned + ')') : ''), note: g.desc }));
  opts.push({ id: '_back', key: 'b', label: 'Back' });
  const pick = await menu('🛍️ System Shop:', opts);
  if (!pick || pick === '_back') return;
  const r = LOS.buyItem(state, pick);
  console.log(r.ok ? green('Purchased.') : red(r.msg));
}

async function wheel() {
  console.log(bold('\n🎡 Wheel of Destiny') + dim('  tickets: ' + state.tickets + ' · pity: ' + state.pity + '/' + C.CONFIG.pityLimit + ' · ' + C.CONFIG.ticketPoints + ' pts per ticket'));
  const act = await menu('Tempt fate:', [
    { id: 'spin', label: 'Spin (1 ticket)' },
    { id: 'buy', label: 'Exchange ' + C.CONFIG.ticketPoints + ' pts → 1 ticket' },
    { id: 'back', key: 'b', label: 'Back' },
  ]);
  if (act === 'spin') {
    const r = LOS.spinWheel(state);
    if (!r.ok) return console.log(red(r.msg));
    console.log((r.prize.epicClass ? gold : (t => t))('  The wheel spins… ' + bold(r.prize.label) + (r.prize.skillName ? ' — ' + r.prize.skillName : '') + (r.prize.epicClass ? '  ✨THE WHEEL BLAZES✨' : '')));
  } else if (act === 'buy') {
    const r = LOS.buyTicket(state);
    console.log(r.ok ? green('Ticket acquired.') : red(r.msg));
  }
}

async function skillsMenu() {
  console.log(bold('\n📜 Skills') + dim('  slots: ' + state.equipped.length + '/' + LOS.skillSlots(state)));
  const opts = state.skills.map(id => {
    const sk = C.SKILLS[id];
    const on = state.equipped.includes(id);
    return { id, label: (on ? green('● ') : dim('○ ')) + sk.name + dim(' [' + sk.rarity + '] ' + sk.desc) };
  });
  if (!opts.length) return console.log(dim('  None yet. The Wheel and the quests provide.'));
  opts.push({ id: '_back', key: 'b', label: 'Back' });
  const pick = await menu('Toggle equip:', opts);
  if (!pick || pick === '_back') return;
  const r = state.equipped.includes(pick) ? LOS.unequipSkill(state, pick) : LOS.equipSkill(state, pick);
  console.log(r.ok ? green('Done.') : red(r.msg));
}

function codex() {
  console.log(bold('\n📖 Codex of the Hidden World'));
  for (const entry of LOS.codexView(state)) {
    const favor = entry.met ? mag(' 💗' + entry.favor) : '';
    console.log('  ' + (entry.met ? gold(entry.name) : dim(entry.name)) + dim(' — ' + entry.epithet) + favor);
    if (entry.met) console.log('    ' + dim(entry.codex));
  }
}

function saveGame() {
  fs.writeFileSync(SAVE_FILE, JSON.stringify({ game: JSON.parse(LOS.save(state)), mind: mind.export() }));
  console.log(dim('Saved to ' + SAVE_FILE));
}

async function main() {
  console.log(cyan(bold('\n【 LEGENDARY OCCUPATION SYSTEM 】')) + dim('  v0.1 — a system-genre life sim\n'));
  const claudeBackend = nodeMind.sdkAvailable() ? nodeMind.createClaudeBackend() : null;
  mind = MIND.createMind(claudeBackend || MIND.offlineBackend(), {
    online: !!claudeBackend,
    game: { state: () => state, engine: LOS }, // arms the mind's record-reading tools
  });
  if (!claudeBackend) console.log(dim('(System mind: offline shard. `npm install` + ANTHROPIC_API_KEY awaken its full consciousness.)\n'));

  if (fs.existsSync(SAVE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    const resume = (await rl.question('Found a save (day ' + raw.game.day + ', ' + (raw.game.name || 'Host') + '). Resume? [Y/n] ▸ ')).trim().toLowerCase();
    if (resume !== 'n') { state = LOS.load(JSON.stringify(raw.game)); mind.import(raw.mind); }
  }
  if (!state) {
    const name = (await rl.question('Your name, host ▸ ')).trim() || 'Host';
    state = LOS.newGame({ name });
    await chooseOccupation();
  }

  while (true) {
    header();
    printRecentLog(3);
    const o = C.OCCUPATIONS[state.occupation];
    const act = await menu('What now?', [
      { id: 'work', label: bold(o.verbs.open) },
      { id: 'talk', label: 'Talk to the System 🗨️' },
      { id: 'signin', label: 'Daily sign-in 📅' },
      { id: 'missions', label: 'Missions 🎯' },
      { id: 'workplace', label: o.verbs.workNoun[0].toUpperCase() + o.verbs.workNoun.slice(1) + ' & upgrades' },
      { id: 'shop', label: 'Shop 🛍️' },
      { id: 'items', label: 'Use item 🎒' },
      { id: 'wheel', label: 'Wheel of Destiny 🎡' },
      { id: 'skills', label: 'Skills 📜' },
      { id: 'codex', key: 'c', label: 'Codex 📖' },
      { id: 'records', key: 'r', label: 'Records 🏅' },
      { id: 'endday', key: 'e', label: 'End the day 🌙' },
      { id: 'save', key: 's', label: 'Save' },
      { id: 'quit', key: 'q', label: 'Save & quit' },
    ]);
    if (act === 'work') await runGig();
    else if (act === 'talk') await talk();
    else if (act === 'signin') { const r = LOS.signIn(state); console.log(r.ok ? gold('Signed in — day ' + r.streak + ' streak: ' + LOS.describeFx(r.reward)) : red(r.msg)); }
    else if (act === 'missions') await missions();
    else if (act === 'workplace') await workplace();
    else if (act === 'shop') await shop();
    else if (act === 'items') await useItemFlow();
    else if (act === 'wheel') await wheel();
    else if (act === 'skills') await skillsMenu();
    else if (act === 'codex') codex();
    else if (act === 'records') records();
    else if (act === 'endday') {
      const r = LOS.endDay(state);
      if (r.ok) {
        console.log(cyan('🌅 Day ' + r.day + ' begins.'));
        await systemSpeaks(mind.rumor(snapshot(), { seed: state.seed + state.day }));
      } else console.log(red(r.msg));
    }
    else if (act === 'save') saveGame();
    else if (act === 'quit') { saveGame(); break; }
  }
  rl.close();
  console.log(cyan('\nSYSTEM ▸ Rest well, host. The ledger keeps itself warm.\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
