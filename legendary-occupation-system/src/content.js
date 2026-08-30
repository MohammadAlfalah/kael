/*
 * Legendary Occupation System — content pack.
 * Pure data: occupations, awakening grants, assets, clients, legends, events,
 * skills, items, blessings, wheel prizes, quests, dailies, achievements.
 * Loaded by src/engine.js (Node require or browser global LOS_CONTENT).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LOS_CONTENT = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONFIG = {
    startCash: 888,
    startPoints: 100,
    startTickets: 1,
    baseStamina: 100,
    staminaPerLevel: 4,
    surgeNight: 1.35,
    legendBase: 7,          // % chance of a legendary client per dispatch
    legendPerResonance: 1.2,
    legendNight: 8,
    legendCap: 60,
    rareChance: 0.16,       // chance a mortal client is the rare one
    ticketPoints: 120,      // buy a Wheel ticket with System Points
    pityLimit: 10,          // spins without epic-class prize before a guarantee
    xpBase: 90,
    xpPow: 1.55,
    logCap: 250,
    slotStart: 1,
    nightSlot: 5,
    maxSlot: 6,
    upgradeMax: 5,
    upgradeCostBase: 260,
    skillSlotEvery: 5,      // +1 equip slot every N levels
    skillSlotMax: 5,
  };

  const SLOTS = ['Dawn', 'Morning', 'Noon', 'Afternoon', 'Dusk', 'Night', 'Late Night'];

  const TITLES = [
    [1, 'System Rookie'],
    [3, 'Diligent Worker'],
    [5, 'Neighborhood Name'],
    [8, 'Night-Shift Veteran'],
    [10, 'Five-Star Professional'],
    [12, 'Spirit-Touched'],
    [16, 'Walker Between Worlds'],
    [20, 'Saint of the Trade'],
    [25, 'Half-Step Legend'],
    [30, 'Living Legend'],
  ];
  const MANDATE_TITLE = 'Heaven-Certified Professional';

  const SIGNIN = [
    { cash: 188 },
    { points: 40 },
    { tickets: 1 },
    { cash: 388 },
    { item: ['energyDrink', 2] },
    { points: 88 },
    { tickets: 2, cash: 888 },
  ];

  // ---------------------------------------------------------------- skills --
  // Passive fx keys: pace, grace, resonance, maxStamina, payMult, bonusMult,
  // staminaMult, luck, legendBonus, meritMult, shopMult, expMult, fameMult,
  // nightPayMult, pointsMult, ratingGuard, findCash, allStats.
  const SKILLS = {
    // occupation starters (granted at awakening, never in the wheel)
    smoothOperator: { name: 'Smooth Operator', rarity: 'starter', occ: 'carHailer', desc: 'Traffic parts before you. Jobs tire you less.', fx: { staminaMult: 0.9, pace: 1 } },
    goldenVoice: { name: 'Golden Voice', rarity: 'starter', occ: 'streamer', desc: 'A voice made for donations. Bonuses +15%.', fx: { bonusMult: 0.15 } },
    wokHei: { name: 'Wok Hei', rarity: 'starter', occ: 'chef', desc: 'The breath of the wok lives in your wrists. Pay +10%.', fx: { payMult: 0.1 } },
    steadyHands: { name: 'Steady Hands', rarity: 'starter', occ: 'physician', desc: 'Your hands never tremble. Rating losses are halved.', fx: { ratingGuard: true } },
    amiableFace: { name: 'Amiable Face', rarity: 'starter', occ: 'landlord', desc: 'Everyone owes you a smile. Bonuses +10%, shop prices −5%.', fx: { bonusMult: 0.1, shopMult: -0.05 } },
    // common
    ironBody: { name: 'Iron Constitution', rarity: 'common', desc: 'Max stamina +20.', fx: { maxStamina: 20 } },
    calmMind: { name: 'Unshakable Calm', rarity: 'common', desc: 'Rating losses are halved.', fx: { ratingGuard: true } },
    haggler: { name: 'Born Haggler', rarity: 'common', desc: 'Shop prices −10%.', fx: { shopMult: -0.1 } },
    // rare
    silverTongue: { name: 'Silver Tongue', rarity: 'rare', desc: 'Bonuses +15%. Unlocks smooth-talking choices.', fx: { bonusMult: 0.15 } },
    fleetFoot: { name: 'Featherstep', rarity: 'rare', desc: 'Jobs cost 15% less stamina.', fx: { staminaMult: 0.85 } },
    nightOwl: { name: 'Night Owl', rarity: 'rare', desc: 'Night pay +20%.', fx: { nightPayMult: 0.2 } },
    keenNose: { name: 'Golden Nose', rarity: 'rare', desc: '12% chance to find cash after a job.', fx: { findCash: 0.12 } },
    scholarMind: { name: 'Quick Study', rarity: 'rare', desc: 'EXP gains +15%.', fx: { expMult: 0.15 } },
    // epic
    yinyangEyes: { name: 'Yin-Yang Eyes', rarity: 'epic', desc: 'See the hidden world. Unlocks spirit choices; legends +2%.', fx: { legendBonus: 2 } },
    luckyStar: { name: 'Lucky Star', rarity: 'epic', desc: 'Fortunate outcomes come 30% more often.', fx: { luck: 0.3 } },
    spiritAntenna: { name: 'Spirit Antenna', rarity: 'epic', desc: 'The hidden world finds you. Legends +4%.', fx: { legendBonus: 4 } },
    sutraHeart: { name: 'Sutra-Chanting Heart', rarity: 'epic', desc: 'Merit gains doubled.', fx: { meritMult: 1 } },
    // legendary (quest reward only)
    heavenlyLicense: { name: 'Heavenly Business License', rarity: 'legendary', questOnly: true, desc: 'Stamped by the Jade Emperor himself. All stats +1, EXP +20%.', fx: { allStats: 1, expMult: 0.2 } },
  };

  // ----------------------------------------------------------------- items --
  const ITEMS = {
    energyDrink: { name: 'Roaring Ox Energy Drink', price: 90, desc: 'Restores 30 stamina.', use: { stamina: 30 } },
    herbalTea: { name: 'Chrysanthemum Tea', price: 45, desc: 'Restores 12 stamina.', use: { stamina: 12 } },
    peaceTalisman: { name: 'Peace Talisman', price: 260, desc: 'A yellow paper charm. Some encounters go better with one in hand.', use: null },
    incenseStick: { name: 'Calming Incense', price: 120, desc: 'Bonuses +10% for your next 3 jobs.', use: { buff: { id: 'incense', kind: 'gigs', left: 3, fx: { bonusAdd: 0.1 } } } },
    redEnvelope: { name: 'Red Envelope', price: 188, desc: 'Gift it to a legendary client during a job: favor +1.', use: { gift: { favor: 1 } } },
    jadePendant: { name: 'Jade Pendant', price: 640, desc: 'Wear it today: legendary encounters +6%.', use: { buff: { id: 'jadeAura', kind: 'day', left: 1, fx: { legendBonus: 6 } } } },
    guardianCharm: { name: 'Guardian Charm', price: 480, desc: 'While owned: once per day, your first rating loss is negated.', use: null },
    mooncake: { name: 'Osmanthus Mooncake', price: 128, desc: 'Gift during a job: favor +1 (+2 with Chang’e).', use: { gift: { favor: 1, bonusTarget: 'changE', bonusFavor: 2 } } },
    dogTreats: { name: 'Celestial Dog Treats', price: 60, desc: 'Gift during a job with Erlang Shen: favor +2. His hound insists.', use: { gift: { favor: 0, bonusTarget: 'erlangShen', bonusFavor: 2, onlyTarget: true } } },
    paperUmbrella: { name: 'Oil-Paper Umbrella', price: 150, desc: 'Elegant, waterproof, faintly nostalgic. Someone will want it.', use: null },
  };

  // ------------------------------------------------------------- blessings --
  const BLESSINGS = {
    platinumLicense: { name: 'Platinum Ride-Hailing License', desc: 'Surge fees waived forever. Pay +5%.', fx: { payMult: 0.05 } },
    verifiedBadge: { name: 'Verified Star Badge', desc: 'The algorithm loves you. Fame gains +25%.', fx: { fameMult: 0.25 } },
    hundredFlavorWok: { name: 'Hundred-Flavor Wok', desc: 'Seasoned by a century of breakfasts. Bonuses +10%.', fx: { bonusMult: 0.1 } },
    goldenNeedles: { name: 'Nine Golden Needles', desc: 'Heirloom of a nameless grandmaster. Merit gains +50%.', fx: { meritMult: 0.5 } },
    masterKeys: { name: 'Master Keys', desc: 'A shortcut through every corridor. Jobs cost 10% less stamina.', fx: { staminaMult: 0.9 } },
    paleLantern: { name: 'Pale Lantern', desc: 'A soft light only the lost can see. Legends +1%, night pay +10%.', fx: { legendBonus: 1, nightPayMult: 0.1 } },
    waterproofBlessing: { name: 'Waterproof Blessing', desc: 'Rain politely goes around you. Resonance +1.', fx: { resonance: 1 } },
    dragonPearl: { name: 'Dragon Pearl', desc: 'Warm to the touch. Pay +8%.', fx: { payMult: 0.08 } },
    foxCharm: { name: 'Nine-Tail Charm', desc: 'Unfairly charming. Bonuses +10%.', fx: { bonusMult: 0.1 } },
    wealthBlessing: { name: 'Blessing of Small Change', desc: 'Prices round down for you. Shop −10%.', fx: { shopMult: -0.1 } },
    goldenAbacus: { name: 'Golden Abacus', desc: 'It counts in your favor. System Points from jobs +50%.', fx: { pointsMult: 0.5 } },
    redThread: { name: 'Red Thread Bracelet', desc: 'People warm to you at once. Grace +1.', fx: { grace: 1 } },
    thirdEye: { name: 'Third-Eye Dot', desc: 'A cinnabar dot that itches near demons. Legends +2%.', fx: { legendBonus: 2 } },
    calmBrew: { name: 'Meng Po’s Mild Brew', desc: 'Forget your worries, keep your memories. Rating losses halved.', fx: { ratingGuard: true } },
    cloudStep: { name: 'Cloud-Step Insole', desc: 'A gift from the Great Sage. Pace +1.', fx: { pace: 1 } },
    lotusGuard: { name: 'Lotus-Root Vigor', desc: 'Nezha’s remedy. Max stamina +15.', fx: { maxStamina: 15 } },
    moonlightGrace: { name: 'Moonlight Grace', desc: 'Night work pays +15%.', fx: { nightPayMult: 0.15 } },
    demonWard: { name: 'Zhong Kui’s Ward', desc: 'Painted above your door. Resonance +1.', fx: { resonance: 1 } },
    rainSense: { name: 'Rain Sense', desc: 'You feel luck the way snakes feel storms. Luck +15%.', fx: { luck: 0.15 } },
  };

  // ---------------------------------------------------------------- events --
  // Choice req keys: skill, item (consumed), stat: {pace|grace|resonance: n}.
  // Outcome fx keys (in addition to passives): cash, points, tickets, exp,
  // merit, stamina, rating, favor, fame, bonusAdd, payPct, item, skill,
  // blessing, buff, windfall {min,max}.
  const EVENTS = {
    // shared
    s_haggle: {
      prompt: 'The client squints at the price. “Surely… a small discount, between friends?”',
      choices: [
        { id: 'hold', label: 'Hold firm, politely', outcomes: [
          { w: 3, text: 'They sigh and pay up. Fair is fair.' },
          { w: 2, text: 'They pay, but the review is going to mention “attitude”.', fx: { rating: -0.05 } },
        ] },
        { id: 'discount', label: 'Give a small discount', outcomes: [
          { w: 1, text: 'They beam. “I’m telling everyone about this place.”', fx: { payPct: -0.15, rating: 0.05, fame: 20 } },
        ] },
        { id: 'charm', label: '[Silver Tongue] Talk them into the deluxe option', req: { skill: 'silverTongue' }, outcomes: [
          { w: 1, good: true, text: 'Somehow they end up paying MORE, and thanking you for it.', fx: { bonusAdd: 0.18 } },
        ] },
      ],
    },
    s_lostItem: {
      prompt: 'The client leaves — and a phone is left behind, still warm, lock screen full of family photos.',
      choices: [
        { id: 'return', label: 'Chase them down and return it', outcomes: [
          { w: 2, good: true, text: 'They nearly cry with relief and press a reward into your hands.', fx: { merit: 8, fame: 25, cash: 88 } },
          { w: 1, good: true, text: 'They bow three times. The System quietly approves.', fx: { merit: 10, points: 20 } },
        ] },
        { id: 'keep', label: 'Finders keepers…', outcomes: [
          { w: 1, text: 'The System’s voice turns icy: “We are LEGENDARY, host. Not petty.” Points deducted.', fx: { cash: 200, merit: -15, points: -50 } },
        ] },
      ],
    },

    // car hailer
    e_car_traffic: {
      prompt: 'Gridlock. A sea of brake lights stretches to the horizon.',
      choices: [
        { id: 'wait', label: 'Wait it out with good podcasts', outcomes: [
          { w: 1, text: 'Slow, but civilized. The passenger naps.', fx: { stamina: -4, rating: 0.02 } },
        ] },
        { id: 'weave', label: '[Speed 3+] Thread the side streets', req: { stat: { pace: 3 } }, outcomes: [
          { w: 2, good: true, text: 'You surf green lights like a legend. The meter smiles.', fx: { payPct: 0.12 } },
          { w: 1, text: 'A wrong turn adds ten minutes. Oops.', fx: { rating: -0.06 } },
        ] },
        { id: 'chat', label: 'Charm the passenger meanwhile', outcomes: [
          { w: 1, text: 'By the time traffic moves, you know their whole life story.', fx: { bonusAdd: 0.08 } },
        ] },
      ],
    },
    e_car_shortcut: {
      prompt: 'The nav offers a suspiciously narrow alley. It would save eight minutes.',
      choices: [
        { id: 'take', label: 'Take the alley', outcomes: [
          { w: 1, good: true, text: 'Tight, thrilling, triumphant. The passenger applauds.', fx: { payPct: 0.15 } },
          { w: 1, text: 'A scooter, a fruit cart, a very slow goose. You scrape a mirror.', fx: { cash: -60, rating: -0.06 } },
        ] },
        { id: 'stay', label: 'Stay on the main road', outcomes: [
          { w: 1, text: 'Steady and boring, like a good pension plan.' },
        ] },
        { id: 'spirit', label: '[Yin-Yang Eyes] Follow the faint lantern light', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'A path that isn’t on any map. You arrive early, and something unseen waves goodbye.', fx: { payPct: 0.2, merit: 3 } },
        ] },
      ],
    },
    e_car_fog: {
      night: true,
      prompt: 'A wall of white fog swallows the road. Your GPS shows you driving through a lake.',
      choices: [
        { id: 'press', label: 'Slow down and press on', outcomes: [
          { w: 2, text: 'You emerge three streets from where you should be. Close enough.', fx: { stamina: -8 } },
          { w: 1, text: 'Something knocks twice on the roof. You do not check.', fx: { stamina: -8, rating: -0.08 } },
        ] },
        { id: 'talisman', label: '[Peace Talisman] Press it to the dashboard', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, good: true, text: 'The fog parts like a curtain. Somewhere, someone clicks their tongue in disappointment.', fx: { merit: 10, points: 30 } },
        ] },
        { id: 'eyes', label: '[Yin-Yang Eyes] Read the fog', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'It’s just old Mr. Fog Spirit doing his rounds. You exchange nods.', fx: { merit: 5, points: 20 } },
        ] },
      ],
    },
    e_car_hurry: {
      prompt: '“Faster, please, I BEG you — my flight, my interview, my LIFE!”',
      choices: [
        { id: 'floor', label: '[Speed 4+] Floor it (legally-ish)', req: { stat: { pace: 4 } }, outcomes: [
          { w: 3, good: true, text: 'You arrive with four minutes to spare. They tip like royalty.', fx: { bonusAdd: 0.25 } },
          { w: 1, text: 'A camera flashes. That fine is coming out of the tip.', fx: { cash: -200, rating: -0.05 } },
        ] },
        { id: 'steady', label: 'Drive smooth and talk them down', outcomes: [
          { w: 1, text: 'You arrive barely late, but they leave calmer than they boarded.', fx: { rating: 0.04 } },
        ] },
      ],
    },

    // streamer
    e_str_troll: {
      prompt: 'A troll raid floods your chat with keyboard-smash and clown emojis.',
      choices: [
        { id: 'roast', label: 'Roast them live', outcomes: [
          { w: 2, good: true, text: 'Your roast clips instantly. Even the trolls subscribe.', fx: { fame: 80, bonusAdd: 0.1 } },
          { w: 1, text: 'One comeback lands badly. Clipped, out of context, of course.', fx: { rating: -0.08 } },
        ] },
        { id: 'ignore', label: 'Ignore and carry on', outcomes: [
          { w: 1, text: 'Starved of attention, they drift off to bother someone else.' },
        ] },
        { id: 'sing', label: '[Golden Voice] Answer with an unplanned ballad', req: { skill: 'goldenVoice' }, outcomes: [
          { w: 1, good: true, text: 'The raid goes silent, then the donations start. One troll writes: “ok that was beautiful”.', fx: { fame: 150, bonusAdd: 0.15 } },
        ] },
      ],
    },
    e_str_glitch: {
      prompt: 'Your encoder dies mid-sentence. The stream freezes on your least flattering frame.',
      choices: [
        { id: 'restart', label: 'Restart everything, apologize', outcomes: [
          { w: 1, text: 'Five awkward minutes. Chat forgives, mostly.', fx: { payPct: -0.08 } },
        ] },
        { id: 'improvise', label: 'Go audio-only and improvise radio hour', outcomes: [
          { w: 2, good: true, text: '“Late Night Frequency” is born. Chat demands it become a weekly show.', fx: { fame: 60 } },
          { w: 1, text: 'Dead air. So much dead air.', fx: { rating: -0.05 } },
        ] },
        { id: 'fix', label: '[Production 3+] Hot-swap the rig without dropping a frame', req: { stat: { pace: 3 } }, outcomes: [
          { w: 1, good: true, text: 'Chat never even notices. A fellow streamer DMs: “HOW”.', fx: { fame: 40 } },
        ] },
      ],
    },
    e_str_superchat: {
      prompt: 'A ¥888 superchat from a user with no avatar: “Do you believe in spirits, host?”',
      choices: [
        { id: 'yes', label: 'Answer sincerely: yes', outcomes: [
          { w: 1, good: true, text: 'The chat goes quiet for one heartbeat. Somewhere, a door you can’t see opens a crack.', fx: { merit: 5, fame: 40, buff: { id: 'openDoor', kind: 'day', left: 1, fx: { legendBonus: 4 } } } },
        ] },
        { id: 'joke', label: 'Deflect with a joke', outcomes: [
          { w: 1, text: '“Only when my rent is due.” Chat laughs. The user logs off.', fx: { bonusAdd: 0.05 } },
        ] },
        { id: 'greet', label: '[Yin-Yang Eyes] Greet the pale usernames directly', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'Half your lurkers, it turns out, are not strictly alive. They are extremely loyal viewers.', fx: { merit: 10, points: 40 } },
        ] },
      ],
    },
    e_str_marathon: {
      night: true,
      prompt: 'Chat is chanting: “ONE MORE HOUR! ONE MORE HOUR!”',
      choices: [
        { id: 'extend', label: 'Give the people what they want', outcomes: [
          { w: 1, good: true, text: 'The extra hour prints. Your eyes have opinions about this.', fx: { stamina: -12, payPct: 0.25 } },
        ] },
        { id: 'end', label: 'End on a high note', outcomes: [
          { w: 1, text: '“Sleep is content too.” Chat posts hearts.', fx: { rating: 0.03 } },
        ] },
      ],
    },

    // chef
    e_chef_rush: {
      prompt: 'The dinner rush hits like a tide. Twelve orders bloom on the rail at once.',
      choices: [
        { id: 'push', label: '[Pace 3+] Become the storm', req: { stat: { pace: 3 } }, outcomes: [
          { w: 1, good: true, text: 'Wok, flame, plate, repeat. The queue applauds between bites.', fx: { payPct: 0.2, stamina: -6 } },
        ] },
        { id: 'steady', label: 'Cook in honest order, no shortcuts', outcomes: [
          { w: 2, text: 'Slower, but every plate lands right.', fx: { stamina: -10, rating: 0.03 } },
          { w: 1, text: 'Table five gets loud about the wait.', fx: { stamina: -10, rating: -0.05 } },
        ] },
        { id: 'regulars', label: 'Feed the regulars first', outcomes: [
          { w: 1, text: 'The regulars defend you like family when anyone complains.', fx: { fame: 40 } },
        ] },
      ],
    },
    e_chef_critic: {
      prompt: 'That quiet diner ordering one of everything? Definitely a food critic in a fake mustache.',
      choices: [
        { id: 'signature', label: 'Serve your signature, no nerves', outcomes: [
          { w: 2, good: true, text: 'They stop taking notes and just… eat. The review will be embarrassing (positively).', fx: { fame: 120, bonusAdd: 0.2 } },
          { w: 1, text: 'You over-season exactly once. They notice exactly once.', fx: { rating: -0.08 } },
        ] },
        { id: 'comp', label: 'Comp the meal, play humble', outcomes: [
          { w: 1, text: '“Integrity,” they write, “tastes like free soup.”', fx: { payPct: -0.2, fame: 60, rating: 0.05 } },
        ] },
        { id: 'wokhei', label: '[Wok Hei] Let the wok speak', req: { skill: 'wokHei' }, outcomes: [
          { w: 1, good: true, text: 'The mustache falls off. Nobody cares. The wok has said everything.', fx: { fame: 200, bonusAdd: 0.3 } },
        ] },
      ],
    },
    e_chef_ingredient: {
      prompt: 'A market uncle offers a basket of faintly glowing mushrooms. “Special price. Very special mushrooms.”',
      choices: [
        { id: 'buy', label: 'Buy the mystery mushrooms', outcomes: [
          { w: 1, good: true, text: 'They taste like a childhood you never had. The special sells out in an hour.', fx: { payPct: 0.2 } },
          { w: 1, text: 'Three customers report dreaming of the same mountain. One-star review from a fourth.', fx: { rating: -0.08 } },
        ] },
        { id: 'refuse', label: 'Politely decline', outcomes: [
          { w: 1, text: 'The uncle shrugs and vanishes behind a fish stall. Possibly literally.' },
        ] },
        { id: 'identify', label: '[Yin-Yang Eyes] Look at what they really are', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'Moon-veil caps — spirit delicacy! You buy the lot and word spreads below.', fx: { points: 50, buff: { id: 'spiritAroma', kind: 'day', left: 2, fx: { resonance: 2 } } } },
        ] },
      ],
    },
    e_chef_drunk: {
      night: true,
      prompt: 'A table of happy drunks has been “leaving in five minutes” for two hours.',
      choices: [
        { id: 'tea', label: 'Bring sobering tea, on the house', outcomes: [
          { w: 1, good: true, text: 'They sober enough to tip properly and swear eternal loyalty to your stall.', fx: { merit: 5, bonusAdd: 0.08 } },
        ] },
        { id: 'families', label: 'Call their families', outcomes: [
          { w: 1, text: 'Three scoldings arrive by scooter. The neighborhood approves of you immensely.', fx: { fame: 30 } },
        ] },
        { id: 'kickout', label: 'Usher them out firmly', outcomes: [
          { w: 1, text: 'They leave singing. The song is about you. It is not flattering.', fx: { rating: -0.06 } },
          { w: 1, text: 'They leave peacefully, mid-chorus.' },
        ] },
      ],
    },

    // physician
    e_doc_chaos: {
      prompt: 'Flu season. The waiting room is a symphony of sneezes and impatience.',
      choices: [
        { id: 'triage', label: '[Bedside 3+] Triage with a calm voice', req: { stat: { grace: 3 } }, outcomes: [
          { w: 1, good: true, text: 'The room settles like a pond after rain. Even the toddler stops screaming.', fx: { fame: 40, rating: 0.03 } },
        ] },
        { id: 'faster', label: 'Just work faster', outcomes: [
          { w: 1, text: 'You see everyone, and your feet file a complaint.', fx: { stamina: -10, payPct: 0.1 } },
        ] },
        { id: 'flawless', label: '[Steady Hands] Run the room like a tea ceremony', req: { skill: 'steadyHands' }, outcomes: [
          { w: 1, good: true, text: 'Unhurried, unmissable, exact. An old doctor in the queue quietly bows.', fx: { fame: 60, merit: 5 } },
        ] },
      ],
    },
    e_doc_pulse: {
      night: true,
      prompt: 'The night patient’s pulse is… absent. He notices you noticing, and smiles apologetically.',
      choices: [
        { id: 'treat', label: 'Treat him exactly like any patient', outcomes: [
          { w: 1, good: true, text: '“Cold constitution,” you write. He laughs until the candles flicker, and pays in antique coins.', fx: { merit: 15, points: 40, cash: 120 } },
        ] },
        { id: 'eyes', label: '[Yin-Yang Eyes] Prescribe incense and moonlight', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'Exactly what a gentleman of his condition needs. He promises to send his friends.', fx: { merit: 20, points: 60 } },
        ] },
        { id: 'excuse', label: 'Suddenly remember an urgent errand', outcomes: [
          { w: 1, text: 'He sighs, leaves a coin anyway, and walks out through the wall — sorry, the door.', fx: { rating: -0.05 } },
        ] },
      ],
    },
    e_doc_herb: {
      prompt: 'Your key herb is out of stock citywide. The patient needs it today.',
      choices: [
        { id: 'premium', label: 'Pay a premium to a rival supplier', outcomes: [
          { w: 1, text: 'Costly, but the patient never knows how close it was.', fx: { cash: -150, rating: 0.04, fame: 30 } },
        ] },
        { id: 'substitute', label: 'Reformulate with what you have', outcomes: [
          { w: 2, good: true, text: 'Your substitution works — arguably better. You write it down for the textbooks.', fx: { fame: 40, exp: 15 } },
          { w: 1, text: 'It works, but tastes so vile the patient reviews the FLAVOR.', fx: { rating: -0.05 } },
        ] },
        { id: 'garden', label: '[Insight 3+] Ask the weeds behind the clinic', req: { stat: { resonance: 3 } }, outcomes: [
          { w: 1, good: true, text: 'Turns out the “weeds” are the herb’s wild cousin, and they volunteer.', fx: { merit: 5, points: 30 } },
        ] },
      ],
    },
    e_doc_vip: {
      prompt: 'A wealthy hypochondriac demands a miracle cure for a disease he does not have.',
      choices: [
        { id: 'honest', label: 'Tell him the truth kindly', outcomes: [
          { w: 2, good: true, text: '“You are the first doctor brave enough to prescribe me a hobby.” He funds a new ward.', fx: { bonusAdd: 0.2, fame: 30 } },
          { w: 1, text: 'He storms out to find a doctor with better diseases.', fx: { rating: -0.05 } },
        ] },
        { id: 'tonic', label: 'Sell him a very expensive vitamin tonic', outcomes: [
          { w: 1, text: 'He feels amazing. You feel a little less amazing.', fx: { payPct: 0.2, merit: -5 } },
        ] },
        { id: 'needle', label: '[Steady Hands] One theatrical acupuncture session', req: { skill: 'steadyHands' }, outcomes: [
          { w: 1, good: true, text: 'Nine needles, zero pain, total conversion. He books every Tuesday forever.', fx: { bonusAdd: 0.25 } },
        ] },
      ],
    },

    // landlord
    e_ll_pipe: {
      prompt: 'A pipe bursts on the third floor. Water is exploring the building’s feng shui.',
      choices: [
        { id: 'diy', label: '[Upkeep 3+] Fix it yourself, sleeves up', req: { stat: { pace: 3 } }, outcomes: [
          { w: 1, good: true, text: 'Twenty minutes, one wrench, zero invoices. Tenants film it admiringly.', fx: { fame: 40 } },
        ] },
        { id: 'plumber', label: 'Call the emergency plumber', outcomes: [
          { w: 1, text: 'Expensive, fast, dry.', fx: { cash: -200 } },
        ] },
        { id: 'rally', label: '[Amiable Face] Turn it into a hallway team event', req: { skill: 'amiableFace' }, outcomes: [
          { w: 1, good: true, text: 'Buckets, laughter, victory noodles afterward. The building group chat is thriving.', fx: { fame: 60, merit: 5 } },
        ] },
      ],
    },
    e_ll_noise: {
      prompt: 'Unit 502 says 501 stomps at midnight. Unit 501 says 502 practices opera at dawn.',
      choices: [
        { id: 'mediate', label: '[Hospitality 3+] Host a peace summit', req: { stat: { grace: 3 } }, outcomes: [
          { w: 1, good: true, text: 'By the second pot of tea, they discover a shared hatred of the elevator music. Peace.', fx: { fame: 50, rating: 0.04 } },
        ] },
        { id: 'schedule', label: 'Draft an official Noise Treaty', outcomes: [
          { w: 2, text: 'Stomping hours and opera hours are now constitutionally separated.', fx: { merit: 5 } },
          { w: 1, text: 'Both parties reject the treaty and unite against the document.', fx: { rating: -0.05 } },
        ] },
        { id: 'side', label: 'Side with whoever pays rent earlier', outcomes: [
          { w: 1, text: 'Efficient. Also, everyone heard you say it.', fx: { rating: -0.06 } },
        ] },
      ],
    },
    e_ll_rent: {
      prompt: 'Rent day. The corridor smells of cooking, excuses, and one genuine hardship.',
      choices: [
        { id: 'collect', label: 'Collect promptly, professionally', outcomes: [
          { w: 1, text: 'Envelopes, receipts, nods. Business is business.', fx: { payPct: 0.15 } },
        ] },
        { id: 'grace', label: 'Quietly extend the hardship case', outcomes: [
          { w: 1, good: true, text: 'Nothing is said. Everything is understood. The building feels warmer.', fx: { payPct: -0.1, merit: 10, fame: 40 } },
        ] },
        { id: 'chat', label: '[Amiable Face] Doorstep chats with every unit', req: { skill: 'amiableFace' }, outcomes: [
          { w: 1, good: true, text: 'You collect rent, three dinner invitations, and a jar of pickles.', fx: { bonusAdd: 0.15 } },
        ] },
      ],
    },
    e_ll_knock: {
      night: true,
      prompt: 'Knocking, from inside long-empty unit 404. Polite, patient knocking.',
      choices: [
        { id: 'open', label: 'Open the door like a professional', outcomes: [
          { w: 1, text: 'Empty. Cold. On the floor: rent, in old paper bills, counted exactly.', fx: { cash: 90, stamina: -8 } },
          { w: 1, good: true, text: 'Empty — but swept clean, and someone has fixed the window you kept postponing.', fx: { points: 40, merit: 5 } },
        ] },
        { id: 'greet', label: '[Yin-Yang Eyes] Greet the tenant properly', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'A faded gentleman explains he’s stayed since 1962 and considers you the best landlord yet.', fx: { merit: 15, points: 60 } },
        ] },
        { id: 'seal', label: '[Peace Talisman] Seal the door', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, text: 'The knocking stops. The building feels a little lonelier.', fx: { points: 30, merit: -5 } },
        ] },
      ],
    },

    // ---- Ghost Bride (first-contact story beat, one per occupation) ----
    ev_gb_car: {
      night: true,
      prompt: 'Your midnight fare wears a red wedding dress twenty years out of fashion. “Willow Lane,” she says softly. “There is a letter that never arrived.”',
      choices: [
        { id: 'help', label: 'Drive her, and deliver the letter yourself', outcomes: [
          { w: 1, good: true, text: 'An old man reads the letter twice, then a third time, weeping and laughing. In the mirror, the bride finally smiles — and the back seat is empty, save for the scent of osmanthus.', fx: { favor: 2, merit: 12, points: 150 } },
        ] },
        { id: 'polite', label: 'Just drive, eyes forward, radio low', outcomes: [
          { w: 1, text: 'She hums a wedding tune the whole way. At Willow Lane she bows and dissolves into moonlight. The meter shows the fare was paid in 1998.', fx: { favor: 1, merit: 3, points: 60 } },
        ] },
        { id: 'banish', label: '[Peace Talisman] Banish her from the car', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, text: 'The talisman flares. She looks at you — not angry, only tired — and is gone. The System says nothing, which is worse.', fx: { points: 100, merit: -8 } },
        ] },
      ],
    },
    ev_gb_str: {
      night: true,
      prompt: 'A viewer named “Lian_1998”, avatar a red veil, donates everything her account holds: “Host. Please walk past Willow Lane tonight, and read my letter out loud.”',
      choices: [
        { id: 'help', label: 'Take the stream to Willow Lane and read it', outcomes: [
          { w: 1, good: true, text: 'You read to an empty street. At the last line, every streetlight blooms warm, and chat fills with one repeated word: “thank you thank you thank you”. Lian_1998’s account no longer exists.', fx: { favor: 2, merit: 12, points: 150, fame: 300 } },
        ] },
        { id: 'polite', label: 'Read the letter quietly on stream', outcomes: [
          { w: 1, text: 'Your voice shakes only once. A single pale username replies “it is enough”, and logs off forever.', fx: { favor: 1, merit: 3, points: 60 } },
        ] },
        { id: 'banish', label: '[Peace Talisman] Block the account, burn the charm', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, text: 'The stream stabilizes. Your room is very quiet. The donation remains, exact to the cent.', fx: { points: 100, merit: -8 } },
        ] },
      ],
    },
    ev_gb_chef: {
      night: true,
      prompt: 'At closing, one last order: sweet osmanthus soup, delivered to Willow Lane. The customer note reads: “I will meet you at the gate. I have waited a long time for this taste.”',
      choices: [
        { id: 'help', label: 'Cook it the old way, deliver it yourself', outcomes: [
          { w: 1, good: true, text: 'A bride in red receives the bowl with both hands and drinks it under the willow. “Exactly like my mother’s,” she whispers, and the night grows kind.', fx: { favor: 2, merit: 12, points: 150 } },
        ] },
        { id: 'polite', label: 'Send it with your careful, ordinary best', outcomes: [
          { w: 1, text: 'The bowl comes back at dawn, washed, with an antique coin inside.', fx: { favor: 1, merit: 3, points: 60, cash: 88 } },
        ] },
        { id: 'banish', label: '[Peace Talisman] Tape a talisman under the lid', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, text: 'The order is never picked up. The soup stays warm until morning, which should not be possible.', fx: { points: 100, merit: -8 } },
        ] },
      ],
    },
    ev_gb_doc: {
      night: true,
      prompt: 'A house call to Willow Lane. The patient chart is dated 1998. The bride in red sits very straight and says: “Doctor, my heart hurts. It has hurt for a long time.”',
      choices: [
        { id: 'help', label: 'Listen fully, then treat the grief, not the chart', outcomes: [
          { w: 1, good: true, text: 'You prescribe the saying of a goodbye that was never said, and stay while she says it. The room warms. The chart is suddenly blank.', fx: { favor: 2, merit: 12, points: 150 } },
        ] },
        { id: 'polite', label: 'Standard exam, gentle words, no questions', outcomes: [
          { w: 1, text: '“Cold hands,” you note. “Warm intent,” she answers, and pays in paper money that turns real at sunrise.', fx: { favor: 1, merit: 3, points: 60, cash: 88 } },
        ] },
        { id: 'banish', label: '[Peace Talisman] Prescribe a talisman, leave quickly', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, text: 'She takes it politely, the way one accepts a pamphlet. The door closes itself behind you.', fx: { points: 100, merit: -8 } },
        ] },
      ],
    },
    ev_gb_ll: {
      night: true,
      prompt: 'The door of long-empty unit 404 stands open. A bride in red bows: “Landlord. My lease on this world is ending. Might my deposit cover one more month? There is a letter I must see delivered.”',
      choices: [
        { id: 'help', label: 'Waive the rent, deliver the letter yourself', outcomes: [
          { w: 1, good: true, text: 'The letter finds a white-haired man who has kept a wedding gift wrapped for decades. Unit 404 airs itself out and smells, ever after, faintly of osmanthus.', fx: { favor: 2, merit: 12, points: 150 } },
        ] },
        { id: 'polite', label: 'Accept the old coins, ask no questions', outcomes: [
          { w: 1, text: 'Rent is rent. Each coin is from 1998, mint condition. She thanks you for your professionalism.', fx: { favor: 1, merit: 3, points: 60, cash: 88 } },
        ] },
        { id: 'banish', label: '[Peace Talisman] End the tenancy formally', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, text: 'You post the talisman like an eviction notice. The unit goes truly empty, and somehow smaller.', fx: { points: 100, merit: -8 } },
        ] },
      ],
    },

    // ---- Legendary client events ----
    ev_dk_gen: {
      prompt: 'The old gentleman’s beard moves without wind. “I must reach running water before the hour turns,” says Ao Guang, Dragon King of the East Sea. “The rain schedule depends on it.”',
      choices: [
        { id: 'hurry', label: '[Pace 3+] Get him there with time to spare', req: { stat: { pace: 3 } }, outcomes: [
          { w: 1, good: true, text: 'He steps into the river like a commuter boarding a train. Rain begins precisely on schedule, avoiding only you.', fx: { favor: 2, bonusAdd: 0.3, merit: 5 } },
        ] },
        { id: 'steady', label: 'Proceed respectfully, chat about the weather', outcomes: [
          { w: 1, text: '“The weather,” he says, delighted, “is my favorite subject.” You learn tomorrow’s forecast from the source.', fx: { favor: 1, merit: 5 } },
        ] },
        { id: 'greet', label: '[Yin-Yang Eyes] Offer the formal greeting of the East Sea', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'His eyebrows rise like tides. “A mortal with manners! The sea remembers courtesy.”', fx: { favor: 2, merit: 8, points: 50 } },
        ] },
      ],
    },
    ev_dk_car: {
      prompt: 'Halfway there, Ao Guang taps the window. “Might we detour along the river? My subjects wish to pay respects. Briefly. A few thousand of them.”',
      choices: [
        { id: 'detour', label: 'Take the river road', outcomes: [
          { w: 1, good: true, text: 'The river runs silver alongside the car for three kilometers, fish leaping in salute. He tips like the tide coming in.', fx: { favor: 2, payPct: 0.3, merit: 8 } },
        ] },
        { id: 'decline', label: 'Apologize — schedule is schedule', outcomes: [
          { w: 1, text: '“Professional,” he concedes. The rain waits until you have parked, which you only later realize was a gift.', fx: { favor: 1 } },
        ] },
      ],
    },
    ev_dk_chef: {
      prompt: 'Ao Guang studies your menu with ancient, unreadable eyes. “Chef. The seafood section. Are my subjects being prepared… respectfully?”',
      choices: [
        { id: 'pivot', label: 'Quietly compose a vegetarian feast instead', outcomes: [
          { w: 1, good: true, text: 'Tofu carved like koi, mushrooms braised like abalone. He eats in reverent silence, then declares your stall a protectorate of the East Sea.', fx: { favor: 2, merit: 10, fame: 100 } },
        ] },
        { id: 'honest', label: 'Serve the day’s catch with full honors', outcomes: [
          { w: 1, text: 'Distant thunder. One very long pause. “…At least it is seasoned properly. My condolences to the mackerel, who died a five-star death.”', fx: { favor: 1, bonusAdd: 0.4 } },
        ] },
        { id: 'wokhei', label: '[Wok Hei] Offer your river-moss congee, off menu', req: { skill: 'wokHei' }, outcomes: [
          { w: 1, good: true, text: 'He tastes his own river in it, four dynasties back. A single tear. A very large tip.', fx: { favor: 3, fame: 150, bonusAdd: 0.3 } },
        ] },
      ],
    },
    ev_fox_gen: {
      prompt: 'Su Jiu, effortlessly the most beautiful being you have ever seen, fans herself and asks lightly: “Be honest. Do I look better with nine tails, or eight?”',
      choices: [
        { id: 'flatter', label: 'Compliment bravely', outcomes: [
          { w: 2, good: true, text: '“Any number of tails would envy your grace.” She laughs like temple bells and decides you may live — lavishly.', fx: { favor: 1, bonusAdd: 0.3 } },
          { w: 1, text: 'She sees through the flattery instantly, and is bored by it.', fx: { favor: 0, rating: -0.04 } },
        ] },
        { id: 'count', label: '[Yin-Yang Eyes] Actually count, then answer', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: '“Nine — though the ninth is still growing in, and it suits you.” Her fan stops. “You can SEE? Oh, I LIKE you.”', fx: { favor: 2, points: 60 } },
        ] },
        { id: 'poem', label: '[Silver Tongue] Answer in verse', req: { skill: 'silverTongue' }, outcomes: [
          { w: 1, good: true, text: 'Four lines, perfectly improvised. She fans herself faster. Payment arrives with a perfume-scented bonus.', fx: { favor: 2, bonusAdd: 0.4 } },
        ] },
      ],
    },
    ev_fox_str: {
      prompt: 'Su Jiu appears in your chat with a verified badge older than the platform: “Host. Duet stream. Now. I shall allow you to become famous.”',
      choices: [
        { id: 'accept', label: 'Accept the collab of a lifetime', outcomes: [
          { w: 1, good: true, text: 'The stream peaks at numbers your dashboard renders in scientific notation. She takes none of the revenue: “Consider it a tip.”', fx: { favor: 2, fame: 800, bonusAdd: 0.3 } },
        ] },
        { id: 'duet', label: '[Golden Voice] Counter-offer: a duet, equals only', req: { skill: 'goldenVoice' }, outcomes: [
          { w: 1, good: true, text: 'Two voices, one legend clipped forever. She follows your channel — her first follow in three hundred years.', fx: { favor: 3, fame: 1500 } },
        ] },
        { id: 'decline', label: 'Decline politely (schedule integrity)', outcomes: [
          { w: 1, text: '“Refused? REFUSED?” A pause. “…How refreshing.” She subscribes at the highest tier out of spite.', fx: { favor: 1, bonusAdd: 0.2 } },
        ] },
      ],
    },
    ev_cs_gen: {
      prompt: 'The gentleman in the gold-embroidered suit pats his pockets theatrically. Cai Shen, God of Wealth, has — of course — no small change. “Might I interest you in… alternative compensation?”',
      choices: [
        { id: 'stock', label: 'Accept the “sure thing” investment tip', outcomes: [
          { w: 1, good: true, text: 'He writes a company name on a napkin. You will check it tomorrow, hands shaking.', fx: { favor: 1, windfall: { min: 300, max: 1200 } } },
        ] },
        { id: 'insist', label: 'Respectfully insist on the listed price', outcomes: [
          { w: 1, text: 'He produces exact change from behind your ear, mildly offended by the professionalism he pretends not to admire.', fx: { favor: 0, payPct: 0.1 } },
        ] },
        { id: 'waive', label: 'Waive the fee for an elder', outcomes: [
          { w: 1, good: true, text: 'His smile could mint currency. “Generosity, extended to Wealth itself? Oh, we will remember you at every register.”', fx: { favor: 2, merit: 10, windfall: { min: 800, max: 2000 } } },
        ] },
      ],
    },
    ev_yl_gen: {
      prompt: 'The moonlit old man, Yue Lao, unspools red thread across your workplace, squinting. “Hold still. No — everyone hold still. I am MATCHMAKING.”',
      choices: [
        { id: 'indulge', label: 'Give him all the time he needs', outcomes: [
          { w: 1, good: true, text: 'He ties three knots and beams. Somewhere in the city, three phones buzz with the right message at last.', fx: { favor: 2, merit: 8, stamina: -6 } },
        ] },
        { id: 'ask', label: 'Ask, casually, about your own thread', outcomes: [
          { w: 1, text: 'He looks at your wrist, then at his ledger, then MAKES A NOTE. “In processing,” he says, infuriatingly.', fx: { favor: 1 } },
        ] },
        { id: 'hurry', label: 'Hurry him along gently', outcomes: [
          { w: 1, text: '“Romance,” he grumbles, “used to respect queues.” He finishes anyway.', fx: { favor: 0, merit: 3 } },
        ] },
      ],
    },
    ev_yl_ll: {
      prompt: 'Yue Lao points his pipe at your building. “Unit 302 and Unit 303 have matching threads and have not spoken in two years of shared corridors. This is a MAINTENANCE issue, landlord.”',
      choices: [
        { id: 'dumpling', label: 'Announce a building dumpling night', outcomes: [
          { w: 1, good: true, text: '302 folds terribly. 303 teaches, laughing. Yue Lao ties the knot under the table and winks at you.', fx: { favor: 2, merit: 10, fame: 80 } },
        ] },
        { id: 'rooftop', label: '[Amiable Face] Engineer a rooftop tea “accident”', req: { skill: 'amiableFace' }, outcomes: [
          { w: 1, good: true, text: 'One sunset, two teacups, zero escape routes. Yue Lao applauds your technique and requests you freelance.', fx: { favor: 3, merit: 15 } },
        ] },
        { id: 'privacy', label: 'Respect their privacy on principle', outcomes: [
          { w: 1, text: 'Yue Lao respects your ethics and despairs of your romance. He does it himself with a fire drill.', fx: { favor: 1 } },
        ] },
      ],
    },
    ev_es_gen: {
      prompt: 'The tall client’s third eye opens slightly. Erlang Shen’s celestial hound growls at a perfectly ordinary corner of your workplace. “Something is hiding there,” he says. “Minor. Annoying. Assist me?”',
      choices: [
        { id: 'assist', label: 'Assist the hunt', outcomes: [
          { w: 1, good: true, text: 'It was a sock-gremlin. A SOCK-GREMLIN. Decades of missing left socks, avenged in one afternoon.', fx: { favor: 2, merit: 10, stamina: -6 } },
        ] },
        { id: 'treats', label: '[Celestial Dog Treats] Negotiate via the hound', req: { item: 'dogTreats' }, outcomes: [
          { w: 1, good: true, text: 'The hound accepts your tribute, flushes the gremlin out in four seconds, and adopts you as auxiliary staff.', fx: { favor: 2, points: 60 } },
        ] },
        { id: 'clear', label: 'Stand well clear, professionally', outcomes: [
          { w: 1, text: 'Reasonable. There is a small flash, a smaller shriek, and then a receipt for “pest control: gratis”.', fx: { favor: 1 } },
        ] },
      ],
    },
    ev_es_car: {
      prompt: 'Erlang Shen slaps the dashboard, third eye blazing at the road ahead: “Driver. FOLLOW THAT BLACK MIST.”',
      choices: [
        { id: 'floor', label: '[Speed 4+] Punch it', req: { stat: { pace: 4 } }, outcomes: [
          { w: 1, good: true, text: 'Three districts, one river, zero red lights (they change for HIM). The mist is apprehended at a toll booth. Best fare of your life.', fx: { favor: 3, points: 120, merit: 8 } },
        ] },
        { id: 'safe', label: 'Pursue at the legal limit', outcomes: [
          { w: 1, text: 'The hound runs ahead and does the actual catching. Erlang Shen respects your adherence to mortal law. Mostly.', fx: { favor: 1, merit: 3 } },
        ] },
        { id: 'refuse', label: 'Decline the high-speed demon chase', outcomes: [
          { w: 1, text: 'He nods, leaps out the window at 40 km/h, and settles the matter on foot. Your insurance remains blissfully ignorant.', fx: { favor: 0, rating: 0.02 } },
        ] },
      ],
    },
    ev_mp_gen: {
      prompt: 'The kindly old woman opens a thermos, and the steam draws shapes of things you have almost forgotten. Meng Po offers you a cup of her soup, smiling. “Quality check. Humor an old professional.”',
      choices: [
        { id: 'drink', label: 'Drink the Soup of Forgetting', outcomes: [
          { w: 1, text: 'You forget this entire morning, which — on reflection — you are told was mediocre anyway. Refreshing, honestly.', fx: { favor: 1, stamina: 10 } },
          { w: 1, good: true, text: 'You drink… and remember everything. Meng Po leans in, fascinated. “Strong-souled. The bridge could use someone like you.”', fx: { favor: 2, points: 60 } },
        ] },
        { id: 'decline', label: 'Decline with a compliment to the aroma', outcomes: [
          { w: 1, text: '“Smart,” she cackles, delighted. “The aroma is the free sample.”', fx: { favor: 1, merit: 3 } },
        ] },
        { id: 'mist', label: '[Yin-Yang Eyes] Read the shapes in the steam', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'In the steam: every goodbye said too late, gently dissolving. You understand her work now, and bow.', fx: { favor: 2, merit: 10 } },
        ] },
      ],
    },
    ev_mp_chef: {
      prompt: 'Meng Po sets her ancient ladle on your counter with a CLACK. “Chef. Your broth has been making people remember their grandmothers. MY broth makes people forget. Cook-off. Now.”',
      choices: [
        { id: 'accept', label: 'Accept the soup duel', outcomes: [
          { w: 2, good: true, text: 'Her soup erases the afternoon. Yours brings back a summer from 1987, cicadas included. The judges (three drunk uncles) weep and declare a tie in your favor.', fx: { favor: 2, fame: 200, points: 100 } },
          { w: 1, text: 'A noble defeat. You briefly forget which wok is yours, which she insists counts as a compliment.', fx: { favor: 1 } },
        ] },
        { id: 'concede', label: 'Concede to the eternal master, ask for a lesson', outcomes: [
          { w: 1, text: 'She teaches you exactly one stir. It improves everything you will ever cook by four percent.', fx: { favor: 1, merit: 5, exp: 20 } },
        ] },
        { id: 'memory', label: '[Wok Hei] Serve a broth of living memory', req: { skill: 'wokHei' }, outcomes: [
          { w: 1, good: true, text: 'She tastes it and remembers being young — a thing she had filed away as impossible. She washes her ladle in your sink, which you slowly realize is a knighthood.', fx: { favor: 3, fame: 400 } },
        ] },
      ],
    },
    ev_gs_gen: {
      prompt: 'The wiry gentleman in sunglasses turns a distinct shade of green. The Great Sage, conqueror of Heaven, is — there is no diplomatic way to say this — motion sick. “Clouds,” he mutters, “never had SUSPENSION.”',
      choices: [
        { id: 'smooth', label: '[Grace 4+] Give him the smoothest service of his life', req: { stat: { grace: 4 } }, outcomes: [
          { w: 1, good: true, text: 'Not one jolt. He removes the sunglasses, awed. “Five hundred years under a mountain, and THIS is the comfort mortals invented meanwhile?”', fx: { favor: 2, bonusAdd: 0.5 } },
        ] },
        { id: 'stories', label: 'Distract him with questions about the old days', outcomes: [
          { w: 1, text: 'You get the Heavenly Peach Banquet story with sound effects and a live demonstration of a somersault you have to beg him not to complete indoors.', fx: { favor: 1, fame: 50 } },
        ] },
        { id: 'tea', label: '[Chrysanthemum Tea] Offer settling tea', req: { item: 'herbalTea' }, outcomes: [
          { w: 1, good: true, text: 'He drains it, sighs, and stops being green. “You’d have done well on the Journey. We only had one guy with snacks.”', fx: { favor: 2 } },
        ] },
      ],
    },
    ev_gs_str: {
      prompt: 'The Great Sage picks up your spare controller, squints at the screen, and cracks his knuckles with a sound like fireworks. “Explain the rules,” he grins. “Once.”',
      choices: [
        { id: 'letplay', label: 'Hand him the stream', outcomes: [
          { w: 1, good: true, text: 'He breaks the world record for a game he learned nine minutes ago, using movement tech the developers deny is possible. Chat ascends.', fx: { favor: 2, fame: 2000 } },
        ] },
        { id: 'challenge', label: 'Challenge him yourself, on camera', outcomes: [
          { w: 1, good: true, text: 'You lose 0–17, but land ONE hit. He replays that hit frame by frame, cackling with delight, and follows the channel.', fx: { favor: 2, points: 150, fame: 500 } },
          { w: 2, text: 'You are obliterated so thoroughly the game requests maintenance. Great content, though.', fx: { favor: 1, fame: 200 } },
        ] },
      ],
    },
    ev_nz_gen: {
      prompt: 'The kid with the red sashes has already challenged your kettle, a pigeon, and the concept of waiting to three separate races. Nezha bounces on his wheels: “YOU. Race me. Anything counts.”',
      choices: [
        { id: 'race', label: '[Pace 4+] Accept — dignity is for the slow', req: { stat: { pace: 4 } }, outcomes: [
          { w: 1, good: true, text: 'You lose by a scorch mark, but he crosses the line BACKWARD to make it close. “Rematch next week,” he declares. It’s in your calendar now. Forever.', fx: { favor: 2, points: 80 } },
        ] },
        { id: 'humor', label: 'Race him at walking pace, very seriously', outcomes: [
          { w: 1, text: 'He orbits you eleven times, narrating both your positions like a sportscaster. Everyone wins, especially the audience.', fx: { favor: 1, fame: 60 } },
        ] },
        { id: 'scold', label: 'Gently invoke his father', outcomes: [
          { w: 1, text: '“You wouldn’t.” You would. He behaves for one entire hour, glaring in respectful betrayal.', fx: { favor: 1, merit: 5 } },
        ] },
      ],
    },
    ev_nz_car: {
      prompt: 'At the red light, wheels of fire pull up beside you. Nezha revs them — somehow — and points two fingers from his eyes to yours. The light is about to turn green.',
      choices: [
        { id: 'race', label: '[Speed 4+] Send it', req: { stat: { pace: 4 } }, outcomes: [
          { w: 1, good: true, text: 'Neck and neck for six glorious blocks until he cheats via rooftop. He pays your fare AND the loser’s tribute anyway. “Best mortal yet.”', fx: { favor: 2, points: 100, bonusAdd: 0.3 } },
        ] },
        { id: 'decline', label: 'Point at the speed limit sign', outcomes: [
          { w: 1, text: 'He reads it upside down from a hover. “Fifty? I have SOCKS faster than—” The light changes. He vanishes with a pop.', fx: { favor: 1 } },
        ] },
      ],
    },
    ev_nz_ll: {
      prompt: 'It is 2 a.m., and someone is absolutely shredding the seventh-floor corridor on flaming wheels. Unit 502 is already drafting a petition.',
      choices: [
        { id: 'ramp', label: 'Build him a proper ramp on the roof', outcomes: [
          { w: 1, good: true, text: 'Materials: one weekend, ¥150, three tenants who “used to skate”. The roof becomes legendary. The corridor survives.', fx: { favor: 3, fame: 100, cash: -150, merit: 5 } },
        ] },
        { id: 'hours', label: '[Amiable Face] Negotiate official Wheel Hours', req: { skill: 'amiableFace' }, outcomes: [
          { w: 1, good: true, text: 'Weekdays 4–6 p.m., festival exemptions, noise treaty annex C. He signs in flame. Unit 502 frames the treaty.', fx: { favor: 2, merit: 5 } },
        ] },
        { id: 'confiscate', label: 'Confiscate the wheels', outcomes: [
          { w: 1, text: 'You are now holding two idling wheels of divine fire, and a small god is doing Tragic Eyes at you. This is not the victory it appeared to be.', fx: { favor: 0, rating: -0.03 } },
        ] },
      ],
    },
    ev_ce_gen: {
      night: true,
      prompt: 'The pale lady checks the sky between buildings, unhappy with every angle. Chang’e sighs: “One clear look at the moon. Is that so much to ask of a skyline?”',
      choices: [
        { id: 'detour', label: 'Find her an open view, whatever it takes', outcomes: [
          { w: 1, good: true, text: 'A hill, a rooftop, a gap between towers — moonlight lands on her like a homecoming. She stands there one full minute, and pays for ten.', fx: { favor: 2, merit: 5 } },
        ] },
        { id: 'mooncake', label: '[Osmanthus Mooncake] Offer mooncakes, shamelessly', req: { item: 'mooncake' }, outcomes: [
          { w: 1, good: true, text: '“These are made WRONG,” she says, taking three. “The palace recipe uses— I will simply write it down for you.” It becomes your bestseller.', fx: { favor: 3, points: 80 } },
        ] },
        { id: 'hurry', label: 'Press on — clouds are coming anyway', outcomes: [
          { w: 1, text: 'She watches the clouded sky the whole way, composing, you suspect, a poem with you in the disappointing stanza.', fx: { favor: 0 } },
        ] },
      ],
    },
    ev_ce_doc: {
      prompt: 'Chang’e sets a plump white rabbit on your examination table. The Jade Rabbit glares at you with the authority of a senior colleague. “He has been… stress-shedding,” she confides. “The elixir deadlines.”',
      choices: [
        { id: 'gentle', label: 'A gentle, thorough checkup', outcomes: [
          { w: 1, good: true, text: 'Diagnosis: burnout, four thousand years untreated. Prescription: two weeks off mortar duty. The rabbit stamps your form APPROVED with his paw.', fx: { favor: 2, merit: 8 } },
        ] },
        { id: 'carrots', label: 'Prescribe premium carrots, twice daily', outcomes: [
          { w: 1, text: 'Medically questionable. Diplomatically flawless. The rabbit revises his opinion of mortal medicine sharply upward.', fx: { favor: 1, fame: 40 } },
        ] },
        { id: 'needle', label: '[Steady Hands] Acupuncture for the Jade Rabbit', req: { skill: 'steadyHands' }, outcomes: [
          { w: 1, good: true, text: 'Nine needles into meridians no mortal chart records. The rabbit goes boneless with relief. Chang’e takes a photo for the palace group chat.', fx: { favor: 3, fame: 200 } },
        ] },
      ],
    },
    ev_zk_gen: {
      night: true,
      prompt: 'The huge bearded client drops into a seat like a felled tree. Zhong Kui, Queller of Demons, has clearly worked a triple shift. Faint claw marks steam on his coat.',
      choices: [
        { id: 'kindness', label: 'Quiet service, no questions, extra warmth', outcomes: [
          { w: 1, good: true, text: 'He is asleep in seconds, one hand on his sword. When he wakes he looks ten years younger and calls you “comrade”.', fx: { favor: 2, merit: 10 } },
        ] },
        { id: 'stories', label: 'Ask for one work story', outcomes: [
          { w: 1, text: 'The tale involves three demons, a bureaucratic error, and a haunted vending machine. You will retell it forever.', fx: { favor: 1, fame: 60 } },
        ] },
        { id: 'talisman', label: '[Peace Talisman] Offer one, professional to professional', req: { item: 'peaceTalisman' }, outcomes: [
          { w: 1, good: true, text: 'He inspects your mass-market talisman, chuckles, corrects two brushstrokes — and now it is a REAL one. “Trade secret,” he winks.', fx: { favor: 2, points: 60 } },
        ] },
      ],
    },
    ev_zk_doc: {
      prompt: 'Zhong Kui rolls up a sleeve. The sword arm of the Demon Queller is one enormous knot of ancient overwork. “Fix it,” he says, then adds, with visible effort: “…Please.”',
      choices: [
        { id: 'needle', label: '[Steady Hands] Full acupuncture, warrior grade', req: { skill: 'steadyHands' }, outcomes: [
          { w: 1, good: true, text: 'When the last needle lifts, he draws his sword in a blur, stares at his own hand, and laughs like a landslide. Demons citywide feel a chill.', fx: { favor: 3, merit: 15 } },
        ] },
        { id: 'poultice', label: 'Herbal poultice and honest advice about rest', outcomes: [
          { w: 1, good: true, text: '“Rest,” he repeats, like a foreign word. But he takes the poultice, and the advice, and — reportedly — one entire nap.', fx: { favor: 2, merit: 8 } },
        ] },
        { id: 'standard', label: 'Standard treatment, by the book', outcomes: [
          { w: 1, text: 'The book was not written for six-hundred-year-old sword injuries, but it holds up respectably.', fx: { favor: 1 } },
        ] },
      ],
    },
    ev_bs_gen: {
      prompt: 'Rain arrives from nowhere. The elegant lady in white — Bai Suzhen — eyes the downpour with an old, complicated fondness, and no umbrella.',
      choices: [
        { id: 'umbrella', label: '[Oil-Paper Umbrella] Offer it, handle first', req: { item: 'paperUmbrella' }, outcomes: [
          { w: 1, good: true, text: 'She looks at the umbrella, then at you, across a distance of about eight hundred years. “You have no idea what you have just reenacted,” she says, taking it. “Or perhaps you do.”', fx: { favor: 3, merit: 5 } },
        ] },
        { id: 'shelter', label: 'Wait out the rain together, unhurried', outcomes: [
          { w: 1, text: 'She tells you rain sounded different on West Lake. You believe her completely.', fx: { favor: 1, stamina: -4 } },
        ] },
        { id: 'lake', label: 'Mention you have always wanted to see West Lake', outcomes: [
          { w: 1, good: true, text: 'She describes it so precisely you can smell the lotus. “Go in autumn,” she says. “Tell the water Suzhen sent you.”', fx: { favor: 2, merit: 5 } },
        ] },
      ],
    },
    ev_bs_doc: {
      prompt: 'Her pulse, under your fingers, is slow, cool, and distinctly… serpentine. Bai Suzhen watches your face with calm, ancient amusement, waiting.',
      choices: [
        { id: 'discreet', label: '[Yin-Yang Eyes] Note “cold constitution”, say nothing', req: { skill: 'yinyangEyes' }, outcomes: [
          { w: 1, good: true, text: 'You prescribe warming herbs suitable for, hypothetically, a thousand-year snake spirit. Her eyes soften. “A doctor with discretion. Xu Xian would have liked you.”', fx: { favor: 3, merit: 15 } },
        ] },
        { id: 'professional', label: 'Treat what you find, comment on nothing', outcomes: [
          { w: 1, good: true, text: 'Professionalism is its own kind of kindness. She leaves a jar of genuine West Lake tea on your desk.', fx: { favor: 2, merit: 8 } },
        ] },
        { id: 'startle', label: 'Visibly double-check your instruments', outcomes: [
          { w: 1, text: 'She waits, patient as deep water, while you recalibrate everything twice. “Finished?” she asks kindly. You were not subtle.', fx: { favor: -1, rating: -0.05 } },
        ] },
      ],
    },
    ev_je_gen: {
      prompt: 'The old man in the plain grey suit has been watching you work for some time. His paper fan is old. His eyes are older. “I conduct inspections,” says the Jade Emperor mildly. “Of roads. Of trades. Of people. Tell me about your work.”',
      choices: [
        { id: 'honest', label: 'Tell the whole truth — the hard days included', outcomes: [
          { w: 1, good: true, text: 'He listens without blinking to all of it: the grind, the strange clients, the nights you nearly quit. At the end he nods once, and the nod lands somewhere behind your ribs. “Heaven has audited your ledger,” he says. “It balances.”', fx: { merit: 20, points: 300 } },
        ] },
        { id: 'humble', label: 'Speak simply: the work is the work', outcomes: [
          { w: 1, good: true, text: '“The work is the work,” he repeats, tasting it. “Twelve immortals owe me essays on that sentence.” The fan taps your counter — a blessing, you realize much later.', fx: { merit: 10, points: 200 } },
        ] },
        { id: 'boast', label: 'Present your five-star metrics with pride', outcomes: [
          { w: 1, text: 'He hears out every statistic with the patience of a sky. “Numbers,” he says, not unkindly. “The bride you helped was not a number.” The fan taps once anyway.', fx: { points: 100 } },
        ] },
      ],
    },
  };

  // --------------------------------------------------------------- legends --
  const LEGENDS = [
    { id: 'ghostBride', name: 'The Ghost Bride', epithet: 'Lian of Willow Lane', tier: 'epic', weight: 16, night: true, payMult: 1.4,
      intro: 'The air goes still, and the scent of osmanthus arrives before she does.',
      events: { generic: 'ev_gb_car', byOcc: { carHailer: 'ev_gb_car', streamer: 'ev_gb_str', chef: 'ev_gb_chef', physician: 'ev_gb_doc', landlord: 'ev_gb_ll' } },
      favorRewards: { 3: { points: 150, merit: 10 }, 5: { blessing: 'paleLantern' } },
      codex: 'A bride from 1998 with one letter left undelivered. Kindness reaches her where talismans cannot.' },
    { id: 'dragonKing', name: 'Ao Guang', epithet: 'Dragon King of the East Sea', tier: 'legendary', weight: 9, payMult: 2.4,
      intro: 'An old gentleman whose beard stirs without wind, smelling faintly of deep water and heavy weather.',
      events: { generic: 'ev_dk_gen', byOcc: { carHailer: 'ev_dk_car', chef: 'ev_dk_chef' } },
      favorRewards: { 3: { blessing: 'waterproofBlessing' }, 5: { blessing: 'dragonPearl' } },
      codex: 'Administrator of rain, tides, and an enormous extended family of fish. Values punctuality and courtesy.' },
    { id: 'foxSpirit', name: 'Su Jiu', epithet: 'Nine-Tailed Fox', tier: 'epic', weight: 14, payMult: 1.8,
      intro: 'Heads turn down the whole street. She notices, obviously. She always notices.',
      events: { generic: 'ev_fox_gen', byOcc: { streamer: 'ev_fox_str' } },
      favorRewards: { 3: { points: 200 }, 5: { blessing: 'foxCharm' } },
      codex: 'Nine hundred years old, bored by flattery, collects interesting mortals the way others collect teacups.' },
    { id: 'caiShen', name: 'Cai Shen', epithet: 'God of Wealth', tier: 'legendary', weight: 9, payMult: 3.0,
      intro: 'Gold-embroidered suit, abacus cufflinks, and the unhurried ease of someone who has never once checked a price tag.',
      events: { generic: 'ev_cs_gen' },
      favorRewards: { 3: { blessing: 'wealthBlessing' }, 5: { blessing: 'goldenAbacus' } },
      codex: 'Wealth itself, doing his rounds. Never carries small change. Remembers every act of generosity, with interest.' },
    { id: 'yueLao', name: 'Yue Lao', epithet: 'The Old Man Under the Moon', tier: 'epic', weight: 12, payMult: 1.5,
      intro: 'A cheerful elder trailing red thread from one pocket, consulting a ledger written in wedding invitations.',
      events: { generic: 'ev_yl_gen', byOcc: { landlord: 'ev_yl_ll' } },
      favorRewards: { 3: { blessing: 'redThread' }, 5: { cash: 3000, points: 200 } },
      codex: 'Heaven’s matchmaker. Perpetually behind schedule, because mortals keep NOT TALKING to each other.' },
    { id: 'erlangShen', name: 'Erlang Shen', epithet: 'The True Lord', tier: 'legendary', weight: 8, payMult: 2.0,
      intro: 'A tall figure with a faint vertical scar on his brow that is not a scar, and a dog that judges you instantly.',
      events: { generic: 'ev_es_gen', byOcc: { carHailer: 'ev_es_car' } },
      favorRewards: { 3: { points: 200, merit: 10 }, 5: { blessing: 'thirdEye' } },
      codex: 'Heaven’s enforcer, permanently on call. The hound accepts treats. The third eye accepts nothing but truth.' },
    { id: 'mengPo', name: 'Meng Po', epithet: 'Lady of Forgetfulness', tier: 'epic', weight: 12, payMult: 1.5,
      intro: 'A kindly grandmother with a thermos that steams in shapes of things you almost remember.',
      events: { generic: 'ev_mp_gen', byOcc: { chef: 'ev_mp_chef' } },
      favorRewards: { 3: { blessing: 'calmBrew' }, 5: { points: 400 } },
      codex: 'Serves the soup of forgetting at the bridge between lives. Considers herself, correctly, a fellow professional.' },
    { id: 'greatSage', name: 'The Great Sage', epithet: 'Equal of Heaven', tier: 'legendary', weight: 8, payMult: 2.2,
      intro: 'A wiry man in sunglasses who moves like the laws of physics are a polite suggestion he mostly honors.',
      events: { generic: 'ev_gs_gen', byOcc: { streamer: 'ev_gs_str' } },
      favorRewards: { 3: { cash: 2000 }, 5: { blessing: 'cloudStep' } },
      codex: 'Five hundred years under a mountain left him with deep opinions about patience and a fresh delight in mortal inventions.' },
    { id: 'nezha', name: 'Nezha', epithet: 'The Third Lotus Prince', tier: 'epic', weight: 12, payMult: 1.5,
      intro: 'A kid with red sashes and wheels that are, on closer inspection, on fire. He has already challenged something to a race.',
      events: { generic: 'ev_nz_gen', byOcc: { carHailer: 'ev_nz_car', landlord: 'ev_nz_ll' } },
      favorRewards: { 3: { points: 200 }, 5: { blessing: 'lotusGuard' } },
      codex: 'Reborn from lotus root, allergic to boredom. Rematches are eternal and non-negotiable.' },
    { id: 'changE', name: 'Chang’e', epithet: 'Goddess of the Moon', tier: 'legendary', weight: 8, night: true, payMult: 2.4,
      intro: 'A pale, graceful lady who keeps checking the sky between the buildings, homesick for something overhead.',
      events: { generic: 'ev_ce_gen', byOcc: { physician: 'ev_ce_doc' } },
      favorRewards: { 3: { item: ['mooncake', 3] }, 5: { blessing: 'moonlightGrace' } },
      codex: 'Resident of the moon, down for errands. Travels with a rabbit who holds strong opinions on elixir deadlines.' },
    { id: 'zhongKui', name: 'Zhong Kui', epithet: 'Queller of Demons', tier: 'epic', weight: 10, night: true, payMult: 1.6,
      intro: 'A mountain of a man with a magnificent beard, a tired sword, and the posture of a triple shift.',
      events: { generic: 'ev_zk_gen', byOcc: { physician: 'ev_zk_doc' } },
      favorRewards: { 3: { item: ['peaceTalisman', 2] }, 5: { blessing: 'demonWard' } },
      codex: 'Heaven’s exorcist-in-chief. Overworked, underthanked, fiercely loyal to anyone who lets him nap.' },
    { id: 'baiSuzhen', name: 'Bai Suzhen', epithet: 'The White Snake', tier: 'epic', weight: 12, payMult: 1.7,
      intro: 'An elegant lady in white who always knows, to the minute, when it will rain.',
      events: { generic: 'ev_bs_gen', byOcc: { physician: 'ev_bs_doc' } },
      favorRewards: { 3: { merit: 20, points: 150 }, 5: { blessing: 'rainSense' } },
      codex: 'A thousand-year snake spirit with a physician’s heart and an umbrella-shaped history. Discretion earns everything.' },
    { id: 'jadeEmperor', name: 'The Jade Emperor', epithet: 'Lord of Heaven', tier: 'mythic', weight: 0, payMult: 8,
      intro: 'An unremarkable old man in a plain grey suit. Every hair on your arms disagrees with the word “unremarkable”.',
      events: { generic: 'ev_je_gen' },
      favorRewards: {},
      codex: 'Heaven’s highest office, conducting a personal inspection of one (1) remarkable mortal professional. You.' },
  ];

  // ----------------------------------------------------------- occupations --
  const OCCUPATIONS = {
    carHailer: {
      id: 'carHailer', name: 'Ride-Hailing Driver', icon: '🚖',
      tagline: 'The classic. The original. Some passengers tip in more than money.',
      blurb: 'A car, a city, a night full of strange destinations. The System’s oldest and proudest career track.',
      verbs: { open: 'Go online', gigNoun: 'fare', clientNoun: 'passenger', bonusNoun: 'tip', workNoun: 'car', fameNoun: '5-star reviews', sizeFmt: '{n} km trip' },
      statNames: { pace: 'Speed', grace: 'Comfort', resonance: 'Resonance' },
      partNames: { partA: 'Engine', partB: 'Interior', partC: 'Charms' },
      sizeRange: [2, 16], payout: { base: 12, perUnit: 3.2 }, staminaBase: 16, staminaPerUnit: 0.5,
      grantPreview: 'A brand-new sedan, a Platinum License, ¥8,888 signing bonus.',
      grant: {
        lines: [
          '【 OCCUPATION CONFIRMED: RIDE-HAILING DRIVER 】',
          'Delivery complete. Please check the parking lot downstairs:',
          '· White Cloud Sedan — brand new, still smells like destiny',
          '· Platinum Ride-Hailing License — surge fees waived, forever',
          '· ¥8,888 signing bonus, already in your account',
          '· Skill installed: Smooth Operator',
          'System note: “Drive well, host. Some passengers tip in more than money.”',
        ],
        cash: 8888, points: 200, tickets: 2, fame: 50,
        items: [['energyDrink', 2], ['incenseStick', 1]],
        skills: ['smoothOperator'], blessings: ['platinumLicense'],
        residence: 'Company dorm, room 302 (the car is nicer)',
      },
      assets: [
        { id: 'whiteCloud', name: 'White Cloud Sedan', price: 0, pace: 2, grace: 2, resonance: 0, blurb: 'Brand new, faintly lucky, suspiciously good mileage.' },
        { id: 'thunderpeal', name: 'Thunderpeal EV', price: 4800, pace: 4, grace: 3, resonance: 1, blurb: 'Silent as a held breath, quick as a rumor.' },
        { id: 'phantomLimo', name: 'Phantom Limousine', price: 13800, pace: 4, grace: 6, resonance: 3, blurb: 'The back seat has hosted three kinds of royalty. At least one was alive.' },
        { id: 'dragonscale', name: 'Dragonscale Roadster', price: 38800, pace: 7, grace: 6, resonance: 5, blurb: 'The paint shimmers like river water. Fish salute it.' },
        { id: 'cloudChariot', name: 'Cloud-Skimming Chariot', price: 118888, pace: 9, grace: 9, resonance: 9, mythic: true, blurb: 'Technically road-legal. The road in question is the Milky Way.' },
      ],
      commons: [
        { id: 'sleepyCoder', name: 'Sleepy Programmer', weight: 12, line: 'Just deployed at 3 a.m. If I snore, bill me extra.' },
        { id: 'bubbleTeaTeen', name: 'Bubble Tea Teen', weight: 12, line: 'Can you NOT brake? The pearls have trauma.' },
        { id: 'marketAuntie', name: 'Market Auntie', weight: 12, line: 'Small detour past the fish stall. Thirty seconds. Family price?', events: ['s_haggle'] },
        { id: 'drunkUncle', name: 'Cheerful Drunk Uncle', weight: 10, night: true, line: 'You… are my BEST friend. What is your name.' },
        { id: 'chattyGrandpa', name: 'Chatty Grandpa', weight: 12, line: 'This street? I planted that tree. And THAT one…' },
        { id: 'ceoHurry', name: 'CEO in a Hurry', weight: 4, rare: true, payMult: 2.0, line: 'Airport. My IPO waits for no traffic.', events: ['e_car_hurry'] },
      ],
      events: ['e_car_traffic', 'e_car_shortcut', 'e_car_fog', 'e_car_hurry'],
    },

    streamer: {
      id: 'streamer', name: 'Streamer', icon: '🎙️',
      tagline: 'A loft, a rig, ten thousand followers on day one. Some lurkers are older than the internet.',
      blurb: 'Go live from a riverside loft the System simply hands you. Chat is lively. Some of chat is not strictly alive.',
      verbs: { open: 'Go live', gigNoun: 'stream', clientNoun: 'viewer', bonusNoun: 'donation', workNoun: 'studio', fameNoun: 'followers', sizeFmt: '{n}-hour stream' },
      statNames: { pace: 'Production', grace: 'Charisma', resonance: 'Mystique' },
      partNames: { partA: 'Camera & Encoder', partB: 'Set & Lighting', partC: 'Lucky Altar' },
      sizeRange: [1, 4], payout: { base: 25, perUnit: 24 }, staminaBase: 14, staminaPerUnit: 3,
      grantPreview: 'A riverside loft (deed included), a full studio rig, 10,000 followers.',
      grant: {
        lines: [
          '【 OCCUPATION CONFIRMED: STREAMER 】',
          'Keys delivered. Please proceed to your new address:',
          '· Riverside loft, 14th floor — deed already in your name',
          '· “Starlight” studio rig: camera, mic, lights, silent PC',
          '· 10,000 starter followers (organic*, do not ask)',
          '· ¥6,666 creator fund + Verified Star Badge',
          '· Skill installed: Golden Voice',
          'System note: “Speak well, host. You never know who is lurking.”',
        ],
        cash: 6666, points: 200, tickets: 2, fame: 10000,
        items: [['herbalTea', 2], ['energyDrink', 1]],
        skills: ['goldenVoice'], blessings: ['verifiedBadge'],
        residence: 'Riverside loft, 14th floor (yours, actually yours)',
      },
      assets: [
        { id: 'starlightRig', name: 'Starlight Loft Studio', price: 0, pace: 2, grace: 2, resonance: 0, blurb: 'The System’s starter rig. “Starter.” It hums like a contented cat.' },
        { id: 'auroraStudio', name: 'Aurora Studio', price: 4800, pace: 3, grace: 4, resonance: 1, blurb: 'Lighting so good it apologizes for your sleep schedule.' },
        { id: 'celestialSuite', name: 'Celestial Broadcast Suite', price: 13800, pace: 5, grace: 5, resonance: 3, blurb: 'Soundproofed against everything except destiny.' },
        { id: 'starfallStage', name: 'Starfall Stage', price: 38800, pace: 7, grace: 6, resonance: 5, blurb: 'The green screen occasionally shows places that do not exist yet.' },
        { id: 'ninthRelay', name: 'Ninth-Heaven Relay', price: 118888, pace: 9, grace: 9, resonance: 9, mythic: true, blurb: 'Broadcasts to all realms. The celestial court has a subscription.' },
      ],
      commons: [
        { id: 'loyalFan', name: 'Loyal Viewer “Noodles_88”', weight: 12, line: 'First!! (I set an alarm.)' },
        { id: 'sleeplessStudent', name: 'Sleepless Student', weight: 10, night: true, line: 'Your voice is the only thing keeping me from this thesis.' },
        { id: 'gymBro', name: 'Encouraging Gym Bro', weight: 12, line: 'LET’S GOOO. What are we, uh… what is this stream about.' },
        { id: 'cozyMom', name: 'Cozy Craft Mom', weight: 12, line: 'Knitting along. Language, please, there are yarn children present.' },
        { id: 'quietLurker', name: 'Quiet Lurker', weight: 12, line: '…', events: ['e_str_superchat'] },
        { id: 'whaleDonor', name: 'Mysterious Whale Donor', weight: 4, rare: true, payMult: 2.2, line: '¥2,000 — “keep going.”' },
      ],
      events: ['e_str_troll', 'e_str_glitch', 'e_str_superchat', 'e_str_marathon'],
    },

    chef: {
      id: 'chef', name: 'Night-Market Chef', icon: '🥡',
      tagline: 'A stall, a wok, a secret sauce. The aroma crosses three streets and one veil.',
      blurb: 'The System grants you a night-market stall and a wok with history. Cook honestly; the hidden world has a sensitive nose.',
      verbs: { open: 'Fire the wok', gigNoun: 'order', clientNoun: 'diner', bonusNoun: 'tip', workNoun: 'kitchen', fameNoun: 'regulars', sizeFmt: 'table of {n}' },
      statNames: { pace: 'Kitchen Pace', grace: 'Flavor', resonance: 'Aroma' },
      partNames: { partA: 'Burner', partB: 'Seating', partC: 'Incense Shelf' },
      sizeRange: [1, 6], payout: { base: 20, perUnit: 16 }, staminaBase: 15, staminaPerUnit: 2,
      grantPreview: 'A famous night-market stall, a hundred-year wok, ¥7,777 pantry fund.',
      grant: {
        lines: [
          '【 OCCUPATION CONFIRMED: NIGHT-MARKET CHEF 】',
          'Stall no. 1 of Old Osmanthus Market is now yours:',
          '· “Wok of Ten Thousand Flavors” — seasoned for a century',
          '· Master knife set + the previous owner’s SECRET SAUCE recipe',
          '· ¥7,777 pantry fund',
          '· Skill installed: Wok Hei',
          'System note: “Cook well, host. The aroma travels further than you think.”',
        ],
        cash: 7777, points: 200, tickets: 2, fame: 200,
        items: [['peaceTalisman', 1], ['energyDrink', 1]],
        skills: ['wokHei'], blessings: ['hundredFlavorWok'],
        residence: 'The room above the stall (rent: one breakfast, payable to yourself)',
      },
      assets: [
        { id: 'wokStall', name: 'Night-Market Wok Stall', price: 0, pace: 2, grace: 2, resonance: 0, blurb: 'Stall no. 1, Old Osmanthus Market. The queue starts before you do.' },
        { id: 'cornerBistro', name: 'Corner Bistro', price: 4800, pace: 3, grace: 4, resonance: 1, blurb: 'Twelve seats, one legend-in-progress.' },
        { id: 'cloudKitchen', name: 'Cloud Kitchen Pavilion', price: 13800, pace: 5, grace: 5, resonance: 3, blurb: 'The delivery riders speak of it in hushed, hungry tones.' },
        { id: 'jadeBanquet', name: 'Jade Banquet House', price: 38800, pace: 7, grace: 6, resonance: 5, blurb: 'Private rooms. Some guests request the one with no windows and extra incense.' },
        { id: 'immortalHall', name: 'Banquet Hall of the Immortals', price: 118888, pace: 9, grace: 9, resonance: 9, mythic: true, blurb: 'The Peach Banquet has a competitor now. Heaven is bitter about the reviews.' },
      ],
      commons: [
        { id: 'nightMarketKid', name: 'Night-Market Kid', weight: 12, line: 'Extra sauce. EXTRA extra. I have allowance.' },
        { id: 'officeCrowd', name: 'Overtime Office Crowd', weight: 12, line: 'Six of everything. We have earned this. We have SUFFERED.' },
        { id: 'deliveryRider', name: 'Delivery Rider on Break', weight: 12, line: 'Ten minutes. Feed me like you love me.' },
        { id: 'oldGourmet', name: 'Old Gourmet', weight: 10, line: 'I ate here when the wok was young. Impress me again.', events: ['e_chef_critic'] },
        { id: 'heartbrokenSoul', name: 'Heartbroken Soul', weight: 10, night: true, line: 'One portion of whatever fixes people.' },
        { id: 'michelinScout', name: 'Incognito Food Scout', weight: 4, rare: true, payMult: 2.0, line: '(orders one of everything, takes zero photos)', events: ['e_chef_critic'] },
      ],
      events: ['e_chef_rush', 'e_chef_critic', 'e_chef_ingredient', 'e_chef_drunk'],
    },

    physician: {
      id: 'physician', name: 'Clinic Physician', icon: '🩺',
      tagline: 'A clinic of your own and nine golden needles. Some patients have no pulse. Treat them anyway.',
      blurb: 'The System hands you a clinic and a grandmaster’s needle case. Mortal ailments by day; politely impossible ones by night.',
      verbs: { open: 'Open the clinic', gigNoun: 'consultation', clientNoun: 'patient', bonusNoun: 'thank-you envelope', workNoun: 'clinic', fameNoun: 'reputation', sizeFmt: 'severity-{n} case' },
      statNames: { pace: 'Efficiency', grace: 'Bedside Manner', resonance: 'Insight' },
      partNames: { partA: 'Equipment', partB: 'Ward', partC: 'Talisman Cabinet' },
      sizeRange: [1, 5], payout: { base: 30, perUnit: 18 }, staminaBase: 15, staminaPerUnit: 2.5,
      grantPreview: 'Your own clinic, the Nine Golden Needles, ¥9,999 founding fund.',
      grant: {
        lines: [
          '【 OCCUPATION CONFIRMED: CLINIC PHYSICIAN 】',
          'The Riverside Community Clinic has a new name on the door. Yours:',
          '· Full clinic — examination room, ward, herb wall, stubborn kettle',
          '· The Nine Golden Needles of a nameless grandmaster',
          '· ¥9,999 founding fund',
          '· Skill installed: Steady Hands',
          'System note: “Heal well, host. Not every pulse you take will be beating.”',
        ],
        cash: 9999, points: 200, tickets: 2, fame: 300,
        items: [['herbalTea', 2], ['peaceTalisman', 1]],
        skills: ['steadyHands'], blessings: ['goldenNeedles'],
        residence: 'The clinic back room (surprisingly cozy, smells of chrysanthemum)',
      },
      assets: [
        { id: 'communityClinic', name: 'Riverside Community Clinic', price: 0, pace: 2, grace: 2, resonance: 0, blurb: 'Small, spotless, and yours. The kettle came with opinions.' },
        { id: 'serenityPractice', name: 'Serenity Practice', price: 4800, pace: 3, grace: 4, resonance: 1, blurb: 'The waiting room plants are suspiciously thriving.' },
        { id: 'jadeHall', name: 'Jade Hall Clinic', price: 13800, pace: 5, grace: 5, resonance: 3, blurb: 'Patients leave calmer than the tea alone explains.' },
        { id: 'tenSprings', name: 'Ten-Springs Pavilion', price: 38800, pace: 7, grace: 6, resonance: 5, blurb: 'Built over a spring the maps forgot. The water remembers.' },
        { id: 'templeRestoration', name: 'Temple of Restoration', price: 118888, pace: 9, grace: 9, resonance: 9, mythic: true, blurb: 'Immortals book appointments here. There is a waiting list. It is long.' },
      ],
      commons: [
        { id: 'snifflingClerk', name: 'Sniffling Clerk', weight: 12, line: 'It’s dot as bad as it souds.' },
        { id: 'stiffGamer', name: 'Stiff-Necked Gamer', weight: 12, line: 'I looked left for the first time in three days and heard a SOUND.' },
        { id: 'insomniac', name: 'Polite Insomniac', weight: 10, night: true, line: 'I saw your light on. We appear to keep the same hours.' },
        { id: 'worriedGrandma', name: 'Worried Grandma', weight: 12, line: 'It is probably nothing. I brought you tangerines in case it is something.' },
        { id: 'sportsKid', name: 'Sprained Sports Kid', weight: 12, line: 'Coach says walk it off. My ankle says otherwise.' },
        { id: 'panickedTycoon', name: 'Panicked Tycoon', weight: 4, rare: true, payMult: 2.2, line: 'Money is no object. My LEFT EYELID has been twitching since Tuesday.', events: ['e_doc_vip'] },
      ],
      events: ['e_doc_chaos', 'e_doc_pulse', 'e_doc_herb', 'e_doc_vip'],
    },

    landlord: {
      id: 'landlord', name: 'Landlord', icon: '🏮',
      tagline: 'The System hands you a six-floor building. Some tenants have been dead for decades. They pay on time.',
      blurb: 'Golden Osmanthus Court: six floors, twenty units, one landlord (you). Collect rent, fix pipes, keep the peace between worlds.',
      verbs: { open: 'Make the rounds', gigNoun: 'matter', clientNoun: 'tenant', bonusNoun: 'gift', workNoun: 'building', fameNoun: 'goodwill', sizeFmt: 'floor-{n} matter' },
      statNames: { pace: 'Upkeep', grace: 'Hospitality', resonance: 'Feng Shui' },
      partNames: { partA: 'Facilities', partB: 'Lobby & Garden', partC: 'Feng Shui Array' },
      sizeRange: [1, 5], payout: { base: 28, perUnit: 15 }, staminaBase: 14, staminaPerUnit: 2,
      grantPreview: 'An entire six-floor building, master keys, ¥5,555 renovation fund.',
      grant: {
        lines: [
          '【 OCCUPATION CONFIRMED: LANDLORD 】',
          'Property transfer complete. Congratulations on your BUILDING:',
          '· Golden Osmanthus Court — six floors, twenty units, one ancient tree',
          '· Master keys (the ring is heavier than it looks; so is the trust)',
          '· ¥5,555 renovation fund',
          '· Skill installed: Amiable Face',
          'System note: “Manage well, host. Unit 404 has been empty a long time. Officially.”',
        ],
        cash: 5555, points: 200, tickets: 2, fame: 500,
        items: [['energyDrink', 1], ['redEnvelope', 1]],
        skills: ['amiableFace'], blessings: ['masterKeys'],
        residence: 'Penthouse of Golden Osmanthus Court (the tree taps your window, politely)',
      },
      assets: [
        { id: 'osmanthusCourt', name: 'Golden Osmanthus Court', price: 0, pace: 2, grace: 2, resonance: 0, blurb: 'Six floors of stories. The osmanthus tree predates the district.' },
        { id: 'jadeAnnex', name: 'Jade Terrace Annex', price: 4800, pace: 3, grace: 4, resonance: 1, blurb: 'A garden wing. The koi recognize faces and hold grudges.' },
        { id: 'skyGarden', name: 'Sky Garden Tower', price: 13800, pace: 5, grace: 5, resonance: 3, blurb: 'The rooftop garden blooms out of season, out of spite, out of joy.' },
        { id: 'lanternEstate', name: 'Thousand-Lantern Estate', price: 38800, pace: 7, grace: 6, resonance: 5, blurb: 'At dusk, the lanterns light themselves. The electric bill disagrees politely.' },
        { id: 'celestialEstate', name: 'Celestial Estate', price: 118888, pace: 9, grace: 9, resonance: 9, mythic: true, blurb: 'Zoning: mortal AND celestial. The homeowners’ association includes two constellations.' },
      ],
      commons: [
        { id: 'studentTenant', name: 'Exam-Season Student', weight: 12, line: 'If I pass, I owe the building tree a hug. Don’t ask.' },
        { id: 'newlyweds', name: 'The Newlyweds (501)', weight: 12, line: 'We fixed the sink ourselves! …You should probably look at the sink.' },
        { id: 'nightNurse', name: 'Night-Shift Nurse (203)', weight: 10, night: true, line: 'Home at dawn again. The corridor light was out — thanks for fixing it.' },
        { id: 'grumpyPainter', name: 'Grumpy Old Painter (601)', weight: 12, line: 'The light on floor six is WRONG for painting. It has always been wrong. Tea?' },
        { id: 'startupTrio', name: 'Startup Trio (302)', weight: 12, line: 'Quick question: does the lease say anything about 3D printers. Asking calmly.', events: ['e_ll_noise'] },
        { id: 'mysteryBuyer', name: 'Mysterious Buyer', weight: 4, rare: true, payMult: 2.0, line: 'Name a price for the building. Any price. …Why are you smiling like that.' },
      ],
      events: ['e_ll_pipe', 'e_ll_noise', 'e_ll_rent', 'e_ll_knock'],
    },
  };
  const OCCUPATION_ORDER = ['carHailer', 'streamer', 'chef', 'physician', 'landlord'];

  // ----------------------------------------------------------------- wheel --
  const WHEEL = [
    { w: 20, kind: 'cash', amount: 150, label: '¥150' },
    { w: 10, kind: 'cash', amount: 400, label: '¥400' },
    { w: 4, kind: 'cash', amount: 1000, label: '¥1,000' },
    { w: 18, kind: 'points', amount: 60, label: '60 Points' },
    { w: 6, kind: 'points', amount: 200, label: '200 Points' },
    { w: 8, kind: 'ticket', amount: 1, label: 'Bonus Ticket' },
    { w: 8, kind: 'item', id: 'energyDrink', label: 'Energy Drink' },
    { w: 7, kind: 'item', id: 'peaceTalisman', label: 'Peace Talisman' },
    { w: 7, kind: 'item', id: 'incenseStick', label: 'Calming Incense' },
    { w: 4, kind: 'item', id: 'jadePendant', label: 'Jade Pendant' },
    { w: 5, kind: 'skill', rarity: 'common', label: 'Common Skill' },
    { w: 4, kind: 'skill', rarity: 'rare', label: 'Rare Skill' },
    { w: 2, kind: 'skill', rarity: 'epic', epicClass: true, label: 'EPIC Skill' },
    { w: 1, kind: 'cash', amount: 8888, epicClass: true, label: 'JACKPOT ¥8,888' },
  ];

  // --------------------------------------------------------------- dailies --
  const DAILY_POOL = [
    { id: 'd_gigs3', desc: 'Complete 3 jobs', counter: 'gigs', goal: 3, fx: { cash: 250 } },
    { id: 'd_night1', desc: 'Work 1 night job', counter: 'night', goal: 1, fx: { points: 40 } },
    { id: 'd_earn600', desc: 'Earn ¥600 today', counter: 'earned', goal: 600, fx: { tickets: 1 } },
    { id: 'd_item1', desc: 'Use 1 item', counter: 'itemsUsed', goal: 1, fx: { cash: 120 } },
    { id: 'd_legend1', desc: 'Serve a legendary client', counter: 'legends', goal: 1, fx: { points: 60 } },
    { id: 'd_bonus200', desc: 'Collect ¥200 in bonuses today', counter: 'bonus', goal: 200, fx: { cash: 180 } },
    { id: 'd_units20', desc: 'Cover 20 units of work today', counter: 'units', goal: 20, fx: { points: 30 } },
    { id: 'd_clean2', desc: 'Finish 2 jobs without losing rating', counter: 'clean', goal: 2, fx: { points: 25 } },
  ];

  // ----------------------------------------------------------- main quests --
  const MAIN_QUESTS = [
    { id: 'q_first', name: 'System Boot: First Job', desc: 'Complete your first job.', check: { type: 'gigs', n: 1 }, fx: { points: 100 } },
    { id: 'q_third', name: 'The Third Job', desc: 'The System predicts your third job will be… unusual. Complete it kindly.', check: { type: 'special', id: 'ghostBride' }, fx: { skill: 'yinyangEyes', item: ['peaceTalisman', 2], points: 200 } },
    { id: 'q_level5', name: 'Word Spreads', desc: 'Reach Level 5.', check: { type: 'level', n: 5 }, fx: { cash: 2000 } },
    { id: 'q_asset2', name: 'Upgrade Your Life', desc: 'Own your second workplace tier.', check: { type: 'assets', n: 2 }, fx: { points: 300, tickets: 2 } },
    { id: 'q_favor3', name: 'Friend of the Hidden World', desc: 'Reach Favor 3 with any legendary client.', check: { type: 'favorAny', n: 3 }, fx: { skill: 'spiritAntenna' } },
    { id: 'q_gigs50', name: 'The Fiftieth Job', desc: 'Complete 50 jobs.', check: { type: 'gigs', n: 50 }, fx: { cash: 8888 } },
    { id: 'q_audience', name: 'An Inspection From Above', desc: 'Reach Level 12 and meet 6 different legends. Heaven is watching.', check: { type: 'and', of: [{ type: 'level', n: 12 }, { type: 'legendsMet', n: 6 }] }, fx: { points: 500 }, special: 'armMythic' },
    { id: 'q_mandate', name: 'Heaven’s Mandate', desc: 'Serve the Inspector himself.', check: { type: 'special', id: 'jadeEmperor' }, fx: { skill: 'heavenlyLicense', points: 2000 }, special: 'unlockMythicAsset' },
  ];

  // ---------------------------------------------------------- achievements --
  const ACHIEVEMENTS = [
    { id: 'a_firstLegend', name: 'First Contact', desc: 'Serve your first legendary client.', check: { type: 'legendsMet', n: 1 }, points: 50 },
    { id: 'a_night10', name: 'Creature of the Night', desc: 'Complete 10 night jobs.', check: { type: 'nightGigs', n: 10 }, points: 80 },
    { id: 'a_cash10k', name: 'Comfortably Liquid', desc: 'Hold ¥10,000 at once.', check: { type: 'cashHeld', n: 10000 }, points: 100 },
    { id: 'a_streak7', name: 'Habit of Legends', desc: 'Sign in 7 days in a row.', check: { type: 'streak', n: 7 }, points: 120 },
    { id: 'a_gigs100', name: 'Hundred Roads', desc: 'Complete 100 jobs.', check: { type: 'gigs', n: 100 }, points: 200 },
    { id: 'a_maxAsset', name: 'Pride of the Trade', desc: 'Fully upgrade any workplace.', check: { type: 'maxAsset' }, points: 150 },
    { id: 'a_spins20', name: 'Wheel Devotee', desc: 'Spin the Wheel of Destiny 20 times.', check: { type: 'spins', n: 20 }, points: 60 },
    { id: 'a_merit100', name: 'Quiet Virtue', desc: 'Accumulate 100 Merit.', check: { type: 'merit', n: 100 }, points: 150 },
    { id: 'a_codex', name: 'Friend to All Realms', desc: 'Meet every legendary client.', check: { type: 'codexAll' }, points: 300 },
    { id: 'a_rating', name: 'Untouchable Stars', desc: 'Hold a 4.95+ rating after 20 jobs.', check: { type: 'ratingHigh', min: 4.95, gigs: 20 }, points: 100 },
  ];

  return {
    CONFIG, SLOTS, TITLES, MANDATE_TITLE, SIGNIN, SKILLS, ITEMS, BLESSINGS,
    EVENTS, LEGENDS, OCCUPATIONS, OCCUPATION_ORDER, WHEEL, DAILY_POOL,
    MAIN_QUESTS, ACHIEVEMENTS,
  };
});
