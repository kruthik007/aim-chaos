/* AIM CHAOS - shared core
   Runs in Node (server.js) and in the browser (index.html).
   Everything here is deterministic from a seed so client and server
   generate the exact same round and the server can validate every hit. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AimChaosCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const W = 1000, H = 600;           // virtual play area
  const ROUNDS = 5;

  const MINIGAMES = [
    { id: 'quickdraw', name: 'Quick Draw',    tag: 'Shoot targets fast. Small ones pay more. Never shoot the red X.',   duration: 40, weight: 3 },
    { id: 'rush',      name: 'Target Rush',   tag: 'Destroy everything. Every hit in a row multiplies your score.',      duration: 45, weight: 3 },
    { id: 'moving',    name: 'Moving Target', tag: 'They move. Fast ones pay more. Gold ones pay a fortune.',            duration: 45, weight: 3 },
    { id: 'dontshoot', name: "Don't Shoot",   tag: 'Read the clue. Only one target matches. Wrong shot costs big.',      duration: 40, weight: 2 },
    { id: 'friendfoe', name: 'Friend or Foe', tag: 'One face is the enemy. It has evil eyebrows. Never shoot a friend.', duration: 40, weight: 2 },
    { id: 'reaction',  name: 'Reaction Test', tag: 'Wait for GREEN, then shoot. First shooter wins. Jump the gun and pay.', duration: 40, weight: 2 },
    { id: 'bullseye',   name: 'Bullseye',     tag: 'Concentric rings. Dead center pays huge. Precision beats speed.',    duration: 40, weight: 2 },
    { id: 'colormatch', name: 'Color Match',  tag: 'Shoot only the called color. Any other color costs big.',           duration: 40, weight: 2 },
    { id: 'decoydash',  name: 'Decoy Dash',   tag: 'Fast targets. Bombs cost big and kill your combo — and get more common as time runs out.', duration: 40, weight: 3 },
    { id: 'chaos',     name: 'CHAOS ROUND',   tag: 'Everything is wrong. The screen tilts, controls flip, targets explode.', duration: 45, weight: 1, rare: true },
  ];

  const COLORS = ['#ff2d95', '#2df0ff', '#b6ff2d', '#ffd02d', '#ff6a2d', '#8a3dff', '#2dff9a', '#ff2d4b'];
  const NICK_A = ['Spicy', 'Sleepy', 'Turbo', 'Wobbly', 'Crispy', 'Feral', 'Sneaky', 'Angry', 'Tiny', 'Mega', 'Salty', 'Cosmic'];
  const NICK_B = ['Noodle', 'Goblin', 'Pixel', 'Waffle', 'Potato', 'Rocket', 'Biscuit', 'Mango', 'Ferret', 'Pickle', 'Laser', 'Muffin'];

  const POWERUPS = {
    emp:    { name: 'EMP',          icon: '⚡', target: 'enemy', dur: 1500, desc: 'Jams a rival for 1.5s' },
    shake:  { name: 'Screen Shake', icon: '🌀', target: 'enemy', dur: 2000, desc: 'Shakes a rival for 2s' },
    fake:   { name: 'Fake Targets', icon: '🎭', target: 'enemy', dur: 3000, desc: 'Plants fakes on a rival' },
    steal:  { name: 'Steal Combo',  icon: '🧲', target: 'enemy', dur: 0,    desc: 'Takes half a rival combo' },
    slow:   { name: 'Slow Time',    icon: '🐌', target: 'self',  dur: 4000, desc: 'Your targets slow for 4s' },
    x2:     { name: 'Double Points',icon: '✖2', target: 'self',  dur: 5000, desc: 'Double score for 5s' },
    shield: { name: 'Shield',       icon: '🛡', target: 'self',  dur: 0,    desc: 'Blocks the next attack' },
  };
  const PU_IDS = Object.keys(POWERUPS);

  // ---------- deterministic random ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rand = (r, a, b) => a + r() * (b - a);
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const randomNick = () => NICK_A[Math.floor(Math.random() * NICK_A.length)] + ' ' + NICK_B[Math.floor(Math.random() * NICK_B.length)];

  // ---------- round generation ----------
  function generateRound(seed, gameId, opts) {
    opts = opts || {};
    const r = rng(seed);
    const g = MINIGAMES.find(m => m.id === gameId) || MINIGAMES[0];
    const dur = g.duration * 1000;
    const R = { seed, game: g.id, name: g.name, tag: g.tag, duration: dur, targets: [], events: [], waves: [], signals: [] };
    let id = 0;
    const T = o => { o.id = 't' + (id++); if (!o.motion) o.motion = 'static'; R.targets.push(o); return o; };
    const inside = rad => ({ x: rand(r, rad + 12, W - rad - 12), y: rand(r, rad + 50, H - rad - 12) });
    const vel = speed => { const a = rand(r, 0, Math.PI * 2); return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed }; };
    const spread = (n, rad, minGap) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        let p = inside(rad);
        for (let tries = 0; tries < 40; tries++) {
          p = inside(rad);
          if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) > rad * 2 + minGap)) break;
        }
        pts.push(p);
      }
      return pts;
    };
    const chaosMode = !!opts.chaosMode;
    const speedUp = chaosMode ? 1.35 : 1;

    if (g.id === 'quickdraw') {
      let t = 900;
      while (t < dur - 1500) {
        const fake = r() < 0.15;
        const rad = fake ? 28 : rand(r, 15, 44);
        const o = fake ? { kind: 'fake', value: -150 } : { kind: rad < 24 ? 'small' : 'normal', value: Math.round(110 + (46 - rad) * 12) };
        T(Object.assign(o, { t0: t, life: 1500, r: rad }, inside(rad)));
        t += rand(r, 560, 860) / speedUp;
      }
    }

    if (g.id === 'rush') {
      let t = 600;
      while (t < dur - 1200) {
        const rad = rand(r, 22, 34);
        T(Object.assign({ t0: t, life: 1150, r: rad, kind: 'normal', value: 90 }, inside(rad)));
        t += rand(r, 240, 400) / speedUp;
      }
    }

    if (g.id === 'moving' || g.id === 'chaos') {
      const chaos = g.id === 'chaos';
      let t = 900;
      while (t < dur - 2000) {
        const roll = r();
        const spd = (chaos ? rand(r, 200, 380) : rand(r, 110, 260)) * speedUp;
        if (roll < 0.11) {
          T(Object.assign({ t0: t, life: 2300, r: 20, kind: 'gold', value: 600, motion: 'linear' }, inside(20), vel(spd * 1.3)));
        } else if (roll < 0.23) {
          T(Object.assign({ t0: t, life: 2600, r: 27, kind: 'fake', value: -150, motion: 'linear' }, inside(27), vel(spd * 0.8)));
        } else if (chaos && roll < 0.38) {
          T(Object.assign({ t0: t, life: 2600, r: 34, kind: 'bomb', value: 150, motion: 'linear' }, inside(34), vel(spd * 0.6)));
        } else {
          const rad = rand(r, 25, 34);
          const sine = r() < 0.35;
          T(Object.assign({ t0: t, life: 2800, r: rad, kind: 'normal', value: Math.round(70 + spd * 0.7), motion: sine ? 'sine' : 'linear', amp: rand(r, 40, 120), freq: rand(r, 2, 5) }, inside(rad), vel(spd)));
        }
        t += (chaos ? rand(r, 430, 650) : rand(r, 650, 950)) / speedUp;
      }
    }

    if (g.id === 'dontshoot') {
      const COL = ['red', 'blue', 'green', 'yellow'];
      const SHP = ['circle', 'square', 'triangle'];
      let t = 1200, w = 0;
      while (t < dur - 3500) {
        const n = 5 + (r() < 0.4 ? 1 : 0);
        const combos = [];
        while (combos.length < n) {
          const c = pick(r, COL), s = pick(r, SHP);
          if (!combos.some(x => x.c === c && x.s === s)) combos.push({ c, s });
        }
        const pts = spread(n, 34, 30);
        const ci = Math.floor(r() * n);
        const wave = 'w' + (w++);
        const life = 3400;
        const ids = [];
        let clue;
        const mode = r();
        const target = combos[ci];
        const onlyColor = combos.filter(x => x.c === target.c).length === 1;
        const onlyShape = combos.filter(x => x.s === target.s).length === 1;
        if (mode < 0.3 && onlyColor) clue = 'Shoot the only ' + target.c.toUpperCase() + ' one';
        else if (mode < 0.5 && onlyShape) clue = 'Shoot the only ' + target.s.toUpperCase();
        else clue = 'Shoot the ' + target.c.toUpperCase() + ' ' + target.s.toUpperCase();
        combos.forEach((cb, i) => {
          const o = T({ t0: t, life, r: 34, kind: i === ci ? 'correct' : 'decoy', value: i === ci ? 450 : -300, color: cb.c, shape: cb.s, wave, x: pts[i].x, y: pts[i].y });
          ids.push(o.id);
        });
        R.waves.push({ id: wave, t0: t, life, clue, ids });
        t += 3900 / speedUp;
      }
    }

    if (g.id === 'friendfoe') {
      let t = 1200, w = 0;
      while (t < dur - 3200) {
        const n = 5 + Math.floor(r() * 3);
        const pts = spread(n, 30, 24);
        const ei = Math.floor(r() * n);
        const wave = 'w' + (w++);
        const life = 3000;
        const ids = [];
        for (let i = 0; i < n; i++) {
          const o = T(Object.assign({ t0: t, life, r: 30, kind: i === ei ? 'enemy' : 'friend', value: i === ei ? 400 : -250, face: i, wave, x: pts[i].x, y: pts[i].y, motion: 'linear' }, vel(rand(r, 50, 120) * speedUp)));
          ids.push(o.id);
        }
        R.waves.push({ id: wave, t0: t, life, clue: 'Shoot the enemy. Evil eyebrows.', ids });
        t += 3500 / speedUp;
      }
    }

    if (g.id === 'reaction') {
      let t = 1500, i = 0;
      while (t < dur - 5000) {
        const wait = rand(r, 2000, 4800);
        const tGreen = t + wait;
        const fakeAt = r() < 0.45 ? t + rand(r, 700, wait - 600) : null;
        R.signals.push({ id: 's' + (i++), tWait: t, fakeAt, tGreen, tEnd: tGreen + 1800 });
        t = tGreen + 1800 + 1000;
      }
    }

    if (g.id === 'bullseye') {
      let t = 900;
      while (t < dur - 2200) {
        const rad = rand(r, 46, 66);
        const rings = [
          { r: rad * 0.22, value: 650 },
          { r: rad * 0.46, value: 320 },
          { r: rad * 0.74, value: 150 },
          { r: rad, value: 60 },
        ];
        T(Object.assign({ t0: t, life: 2000, r: rad, kind: 'ring', value: rings[rings.length - 1].value, rings }, inside(rad)));
        t += rand(r, 950, 1350) / speedUp;
      }
    }

    if (g.id === 'colormatch') {
      const COL = ['red', 'blue', 'green', 'yellow'];
      let t = 1200, w = 0;
      while (t < dur - 3000) {
        const n = 5 + (r() < 0.5 ? 1 : 0);
        const target = pick(r, COL);
        const pts = spread(n, 28, 26);
        const wave = 'w' + (w++);
        const life = 2600;
        const ids = [];
        for (let i = 0; i < n; i++) {
          const others = COL.filter(c => c !== target);
          const c = i === 0 ? target : (r() < 0.35 ? target : pick(r, others));
          const o = T({ t0: t, life, r: 28, kind: c === target ? 'ccorrect' : 'cwrong', value: c === target ? 260 : -220, color: c, wave, x: pts[i].x, y: pts[i].y });
          ids.push(o.id);
        }
        R.waves.push({ id: wave, t0: t, life, clue: 'Shoot only ' + target.toUpperCase(), ids });
        t += 3100 / speedUp;
      }
    }

    if (g.id === 'decoydash') {
      let t = 600;
      while (t < dur - 1200) {
        const progress = t / dur;
        const bombChance = 0.08 + progress * 0.35; // starts easy, ramps up as the round goes on
        const rad = rand(r, 22, 34);
        const isBomb = r() < bombChance;
        T(Object.assign({ t0: t, life: 1150, r: rad, kind: isBomb ? 'mine' : 'normal', value: isBomb ? -200 : 90 }, inside(rad)));
        t += rand(r, 240, 400) / speedUp;
      }
    }

    // special events
    if (g.id !== 'reaction') {
      const n = chaosMode || g.id === 'chaos' ? 3 : 2;
      let t = rand(r, 6000, 10000);
      for (let i = 0; i < n && t < dur - 7000; i++) {
        const type = pick(r, ['frenzy', 'x2', 'tiny']);
        R.events.push({ t, type, dur: type === 'frenzy' ? 1600 : type === 'x2' ? 6000 : 5000 });
        if (type === 'frenzy') {
          for (let k = 0; k < 10; k++) {
            const rad = rand(r, 20, 32);
            T(Object.assign({ t0: t + k * 150, life: 1700, r: rad, kind: 'normal', value: 140, event: true }, inside(rad)));
          }
        }
        t += rand(r, 9000, 13000);
      }
    }
    if (g.id === 'chaos' || chaosMode) {
      const nR = g.id === 'chaos' ? 3 : 1, nF = g.id === 'chaos' ? 2 : 1;
      for (let i = 0; i < nR; i++) R.events.push({ t: rand(r, 5000, dur - 6000), type: 'rotate', dur: 4000, angle: pick(r, [-30, 30, -45, 45, 180]) });
      for (let i = 0; i < nF; i++) R.events.push({ t: rand(r, 5000, dur - 6000), type: 'reverse', dur: 3500 });
    }

    R.targets.sort((a, b) => a.t0 - b.t0);
    R.events.sort((a, b) => a.t - b.t);
    return R;
  }

  function reflect(p, lo, hi) {
    const range = hi - lo; if (range <= 0) return lo;
    p = (p - lo) % (2 * range); if (p < 0) p += 2 * range;
    if (p > range) p = 2 * range - p;
    return lo + p;
  }
  function posAt(tg, rt, slow) {
    if (tg.motion === 'static') return { x: tg.x, y: tg.y };
    const dt = Math.max(0, (rt - tg.t0) / 1000) * (slow ? 0.45 : 1);
    let x = tg.x + tg.vx * dt, y = tg.y + tg.vy * dt;
    if (tg.motion === 'sine') y = tg.y + tg.amp * Math.sin(dt * tg.freq);
    return { x: reflect(x, tg.r, W - tg.r), y: reflect(y, tg.r, H - tg.r) };
  }
  function activeEvents(round, rt) {
    return round.events.filter(e => rt >= e.t && rt < e.t + e.dur);
  }
  function eventMult(round, rt) {
    let m = 1;
    for (const e of activeEvents(round, rt)) { if (e.type === 'x2') m *= 2; if (e.type === 'tiny') m *= 1.5; }
    return m;
  }
  function hitPoints(round, tg, rt, combo, x2, valueOverride) {
    const val = valueOverride === undefined ? tg.value : valueOverride;
    if (val < 0) return val;
    const speed = 1 + 0.5 * Math.max(0, 1 - (rt - tg.t0) / tg.life);
    const comboMult = 1 + Math.min(combo, 10) * 0.1;
    return Math.round(val * speed * comboMult * eventMult(round, rt) * (x2 ? 2 : 1));
  }

  function pickGame(roundNo, chaosMode, used) {
    used = used || new Set();
    let pool = MINIGAMES.filter(m => !used.has(m.id));
    if (roundNo <= 2 && !chaosMode) {
      const noRare = pool.filter(m => !m.rare);
      if (noRare.length) pool = noRare;
    }
    const weights = pool.map(m => m.rare ? (chaosMode ? 6 : 1) : m.weight);
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i].id; }
    return pool[0].id;
  }

  // ---------- Room: authoritative game state ----------
  class Room {
    constructor(code, io) {
      this.code = code;
      this.io = io;               // { send(pid, msg), onEmpty() }
      this.players = new Map();
      this.state = 'lobby';
      this.host = null;
      this.roundNo = 0;
      this.round = null;
      this.chaosMode = false;
      this.timers = [];
      this.usedGames = new Set();
      this.totalRounds = ROUNDS;
      this.forcedGame = null;
      this.roundWins = {};
      this.feed = [];
    }
    now() { return Date.now(); }
    send(pid, msg) { this.io.send(pid, msg); }
    broadcast(msg) { for (const pid of this.players.keys()) this.send(pid, msg); }
    later(ms, fn) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    publicPlayers() {
      return [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, ready: p.ready, bot: !!p.bot, score: p.score, combo: p.combo, host: p.id === this.host }));
    }
    lobbyState() { return { type: 'lobby', code: this.code, players: this.publicPlayers(), host: this.host, state: this.state, chaosMode: this.chaosMode }; }

    addPlayer(id, name, bot) {
      if (this.players.size >= 8) return null;
      const color = COLORS.find(c => ![...this.players.values()].some(p => p.color === c)) || COLORS[this.players.size % 8];
      const p = {
        id, name: (name || '').trim().slice(0, 14) || randomNick(), color, bot: !!bot, ready: !!bot,
        score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, fakes: 0, wrong: 0, jumps: 0, puUsed: 0,
        reactions: [], claimed: new Set(), solvedWaves: new Set(), extra: new Map(), clicks: [],
        powerups: [], effects: {}, shield: false, roundScores: [], rankHistory: [], signalState: {},
        skill: bot ? 0.3 + Math.random() * 0.4 : 1,
      };
      this.players.set(id, p);
      if (!this.host || (this.players.get(this.host) || {}).bot) this.host = id;
      this.send(id, { type: 'joined', code: this.code, you: id, now: this.now() });
      this.broadcast(this.lobbyState());
      return p;
    }
    addBot() { return this.addPlayer('bot' + Math.random().toString(36).slice(2, 7), randomNick(), true); }
    removePlayer(id) {
      this.players.delete(id);
      if (this.host === id) {
        const human = [...this.players.values()].find(p => !p.bot);
        this.host = human ? human.id : null;
      }
      if (![...this.players.values()].some(p => !p.bot)) { this.clearTimers(); this.io.onEmpty && this.io.onEmpty(); return; }
      this.broadcast(this.lobbyState());
    }

    handle(pid, msg) {
      const p = this.players.get(pid);
      if (!p || !msg || typeof msg.type !== 'string') return;
      switch (msg.type) {
        case 'ready': if (this.state === 'lobby') { p.ready = !!msg.ready; this.broadcast(this.lobbyState()); } break;
        case 'name': if (this.state === 'lobby') { p.name = String(msg.name || '').trim().slice(0, 14) || p.name; this.broadcast(this.lobbyState()); } break;
        case 'addbot': if (pid === this.host && this.state === 'lobby') this.addBot(); break;
        case 'start': if (pid === this.host && this.state === 'lobby') this.startMatch(!!msg.chaosMode); break;
        case 'startsingle': if (pid === this.host && this.state === 'lobby') this.startSingle(msg.game); break;
        case 'again': if (pid === this.host && this.state === 'final') this.startMatch(false); break;
        case 'chaosmode': if (pid === this.host && this.state === 'final') this.startMatch(true); break;
        case 'hit': this.onHit(p, msg); break;
        case 'miss': this.onMiss(p, msg); break;
        case 'react': this.onReact(p, msg); break;
        case 'use': this.onUse(p, msg); break;
        case 'ping': this.send(pid, { type: 'pong', t: msg.t, now: this.now() }); break;
      }
    }

    beginMatch(chaosMode, totalRounds, forcedGame) {
      this.chaosMode = chaosMode;
      this.roundNo = 0;
      this.roundWins = {};
      this.usedGames = new Set();
      this.totalRounds = totalRounds;
      this.forcedGame = forcedGame || null;
      for (const p of this.players.values()) {
        Object.assign(p, { score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, fakes: 0, wrong: 0, jumps: 0, puUsed: 0, reactions: [], powerups: [], shield: false, roundScores: [], rankHistory: [] });
      }
      this.startRound();
    }
    startMatch(chaosMode) { this.beginMatch(!!chaosMode, ROUNDS, null); }
    startSingle(gameId) {
      const valid = MINIGAMES.some(m => m.id === gameId);
      this.beginMatch(false, 1, valid ? gameId : null);
    }

    startRound() {
      this.clearTimers();
      this.roundNo++;
      const gid = this.forcedGame || pickGame(this.roundNo, this.chaosMode, this.usedGames);
      this.usedGames.add(gid);
      const seed = (Math.random() * 0xffffffff) >>> 0;
      this.round = generateRound(seed, gid, { chaosMode: this.chaosMode });
      this.targetMap = new Map(this.round.targets.map(t => [t.id, t]));
      this.signalOrder = {};
      for (const p of this.players.values()) {
        p.combo = 0; p.claimed = new Set(); p.solvedWaves = new Set(); p.extra = new Map(); p.clicks = [];
        p.effects = {}; p.signalState = {}; p.roundStart = p.score;
      }
      this.startAt = this.now() + 3500;
      this.state = 'countdown';
      this.broadcast({ type: 'round', n: this.roundNo, of: this.totalRounds, game: gid, seed, startAt: this.startAt, duration: this.round.duration, chaosMode: this.chaosMode, now: this.now(), players: this.publicPlayers() });
      this.later(3500, () => { this.state = 'playing'; this.scoreTick(); });
      this.later(3500 + this.round.duration + 400, () => this.endRound());
      for (const p of this.players.values()) if (p.bot) this.runBot(p);
    }

    scoreTick() {
      if (this.state !== 'playing') return;
      this.broadcast({ type: 'scores', list: [...this.players.values()].map(p => ({ id: p.id, score: p.score, combo: p.combo })) });
      this.later(300, () => this.scoreTick());
    }

    rt(p, msg) {
      const srt = this.now() - this.startAt;
      let rt = typeof msg.t === 'number' ? msg.t : srt;
      if (Math.abs(rt - srt) > 900) rt = srt;
      return rt;
    }
    rateLimited(p) {
      const now = this.now();
      p.clicks = p.clicks.filter(c => now - c < 1000);
      if (p.clicks.length >= 14) return true;
      p.clicks.push(now);
      return false;
    }

    onHit(p, msg) {
      if (this.state !== 'playing' || this.rateLimited(p)) return;
      const now = this.now();
      if (p.effects.empUntil > now) return;
      const rt = this.rt(p, msg);
      const tg = this.targetMap.get(msg.tid) || p.extra.get(msg.tid);
      if (!tg) return this.onMiss(p, msg, true);
      if (p.claimed.has(tg.id)) return;
      if (tg.wave && p.solvedWaves.has(tg.wave)) return;
      const lifeMult = p.effects.slowUntil > now - 2500 ? 2.2 : 1;
      if (rt < tg.t0 - 150 || rt > tg.t0 + tg.life * lifeMult + 250) return;
      p.claimed.add(tg.id);
      if (tg.value < 0) {
        p.score += tg.value; p.combo = 0;
        if (tg.kind === 'fake' || tg.kind === 'pfake') p.fakes++; else p.wrong++;
        const msgs = { fake: 'FAKE!', pfake: 'FAKE!', decoy: 'WRONG ONE!', friend: 'THAT WAS A FRIEND!', cwrong: 'WRONG COLOR!', mine: 'BOOM!' };
        this.send(p.id, { type: 'fb', kind: 'bad', tid: tg.id, pts: tg.value, combo: 0, msg: msgs[tg.kind] || 'NO!' });
        return;
      }
      let ringValue;
      if (tg.kind === 'ring' && tg.rings) {
        const cx = typeof msg.x === 'number' ? msg.x : tg.x, cy = typeof msg.y === 'number' ? msg.y : tg.y;
        const dist = Math.hypot(cx - tg.x, cy - tg.y);
        ringValue = (tg.rings.find(b => dist <= b.r) || tg.rings[tg.rings.length - 1]).value;
      }
      const pts = hitPoints(this.round, tg, rt, p.combo, p.effects.x2Until > now, ringValue);
      p.score += pts; p.combo++; p.hits++;
      p.maxCombo = Math.max(p.maxCombo, p.combo);
      const reaction = rt - tg.t0;
      if (!tg.event && reaction >= 0) p.reactions.push(Math.round(reaction));
      if (tg.wave) p.solvedWaves.add(tg.wave);
      const ringCrit = tg.kind === 'ring' && ringValue === tg.rings[0].value;
      this.send(p.id, { type: 'fb', kind: tg.kind === 'gold' || tg.kind === 'correct' || tg.kind === 'ccorrect' || tg.kind === 'enemy' || ringCrit ? 'crit' : 'good', tid: tg.id, pts, combo: p.combo, wave: tg.wave });
      if (tg.kind === 'bomb') {
        const kids = [];
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          const kid = { id: tg.id + ':' + k, t0: rt, life: 1400, r: 16, kind: 'normal', value: 130, motion: 'linear', x: msg.x || tg.x, y: msg.y || tg.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 };
          p.extra.set(kid.id, kid); kids.push(kid);
        }
        this.send(p.id, { type: 'spawn', targets: kids });
      }
      if (p.combo > 0 && p.combo % 6 === 0 && p.powerups.length < 3) this.grantPowerup(p);
    }
    onMiss(p, msg, fromHit) {
      if (this.state !== 'playing') return;
      if (!fromHit && this.rateLimited(p)) return;
      if (p.effects.empUntil > this.now()) return;
      p.misses++; p.combo = 0; p.score = Math.max(0, p.score - 20) ;
      this.send(p.id, { type: 'fb', kind: 'miss', pts: -20, combo: 0 });
    }
    onReact(p, msg) {
      if (this.state !== 'playing' || this.round.game !== 'reaction' || this.rateLimited(p)) return;
      const rt = this.rt(p, msg);
      const s = this.round.signals.find(s => rt >= s.tWait && rt < s.tEnd + 600);
      if (!s) return;
      const st = p.signalState[s.id] || (p.signalState[s.id] = {});
      if (st.done) return;
      st.done = true;
      if (rt < s.tGreen) {
        p.jumps++; p.combo = 0; p.score -= 200;
        this.send(p.id, { type: 'fb', kind: 'bad', pts: -200, combo: 0, msg: 'JUMPED THE GUN!' });
        return;
      }
      const reaction = Math.round(rt - s.tGreen);
      const order = this.signalOrder[s.id] = (this.signalOrder[s.id] || 0) + 1;
      const bonus = order === 1 ? 300 : order === 2 ? 120 : 0;
      const pts = Math.round(Math.max(0, 600 * (1 - reaction / 1000))) + bonus;
      p.score += pts; p.combo++; p.hits++; p.reactions.push(Math.round(reaction));
      this.send(p.id, { type: 'fb', kind: order === 1 ? 'crit' : 'good', pts, combo: p.combo, msg: (order === 1 ? 'FIRST! ' : order === 2 ? 'SECOND ' : '') + reaction + 'ms', signal: s.id });
      this.broadcast({ type: 'feed', text: p.name + ' reacted in ' + reaction + 'ms' + (order === 1 ? ' (first!)' : ''), color: p.color });
    }
    grantPowerup(p) {
      const pu = PU_IDS[Math.floor(Math.random() * PU_IDS.length)];
      p.powerups.push(pu);
      this.send(p.id, { type: 'powerup', pu, list: p.powerups.slice() });
      if (p.bot) this.later(800 + Math.random() * 2500, () => this.onUse(p, { pu, to: this.botTarget(p) }));
    }
    botTarget(bot) {
      const others = [...this.players.values()].filter(q => q.id !== bot.id).sort((a, b) => b.score - a.score);
      return others.length ? (Math.random() < 0.7 ? others[0].id : pick(Math.random, others)) : null;
    }
    onUse(p, msg) {
      if (this.state !== 'playing') return;
      const pu = POWERUPS[msg.pu];
      const idx = p.powerups.indexOf(msg.pu);
      if (!pu || idx < 0) return;
      const now = this.now();
      let target = p;
      if (pu.target === 'enemy') {
        target = this.players.get(msg.to);
        if (!target || target.id === p.id) {
          const others = [...this.players.values()].filter(q => q.id !== p.id).sort((a, b) => b.score - a.score);
          target = others[0];
        }
        if (!target) return;
      }
      p.powerups.splice(idx, 1); p.puUsed++;
      this.send(p.id, { type: 'powerup', list: p.powerups.slice() });
      if (pu.target === 'enemy' && target.shield) {
        target.shield = false;
        this.send(target.id, { type: 'effect', kind: 'blocked', from: p.name, color: p.color, dur: 1200 });
        this.broadcast({ type: 'feed', text: target.name + ' blocked ' + p.name + "'s " + pu.name, color: target.color });
        return;
      }
      switch (msg.pu) {
        case 'emp': target.effects.empUntil = now + pu.dur; break;
        case 'shake': break;
        case 'fake': {
          const rt = now - this.startAt; const kids = [];
          for (let k = 0; k < 4; k++) {
            const kid = { id: 'pf' + Math.random().toString(36).slice(2, 7), t0: rt, life: pu.dur, r: 28, kind: 'pfake', value: -120, motion: 'static', x: 40 + Math.random() * (W - 80), y: 80 + Math.random() * (H - 120) };
            target.extra.set(kid.id, kid); kids.push(kid);
          }
          this.send(target.id, { type: 'spawn', targets: kids });
          break;
        }
        case 'steal': { const amt = Math.floor(target.combo / 2); target.combo -= amt; p.combo += amt; p.maxCombo = Math.max(p.maxCombo, p.combo); break; }
        case 'slow': p.effects.slowUntil = now + pu.dur; break;
        case 'x2': p.effects.x2Until = now + pu.dur; break;
        case 'shield': p.shield = true; break;
      }
      this.send(target.id, { type: 'effect', kind: msg.pu, from: p.name, color: p.color, dur: pu.dur, self: target.id === p.id });
      const text = pu.target === 'enemy' ? p.name + ' hit ' + target.name + ' with ' + pu.name : p.name + ' used ' + pu.name;
      this.broadcast({ type: 'feed', text, color: p.color });
    }

    ranked() { return [...this.players.values()].sort((a, b) => b.score - a.score); }
    endRound() {
      this.clearTimers();
      this.state = 'roundend';
      const ranked = this.ranked();
      ranked.forEach((p, i) => { p.rankHistory.push(i + 1); p.roundScores.push(p.score - p.roundStart); });
      const best = [...this.players.values()].sort((a, b) => (b.score - b.roundStart) - (a.score - a.roundStart))[0];
      if (best) this.roundWins[best.id] = (this.roundWins[best.id] || 0) + 1;
      const board = ranked.map((p, i) => ({ id: p.id, name: p.name, color: p.color, score: p.score, roundScore: p.score - p.roundStart, rank: i + 1, prevRank: p.rankHistory.length > 1 ? p.rankHistory[p.rankHistory.length - 2] : i + 1, maxCombo: p.maxCombo }));
      const last = this.roundNo >= this.totalRounds;
      this.broadcast({ type: 'roundend', n: this.roundNo, of: this.totalRounds, game: this.round.game, board, roundWinner: best ? best.id : null, next: last ? 'final' : 'round', in: last ? 2500 : 5000 });
      this.later(last ? 2500 : 5000, () => last ? this.finish() : this.startRound());
    }
    finish() {
      this.state = 'final';
      const ps = [...this.players.values()];
      const ranked = this.ranked();
      const acc = p => { const n = p.hits + p.misses + p.fakes + p.wrong; return n >= 5 ? p.hits / n : 0; };
      const minR = p => p.reactions.length ? Math.min(...p.reactions) : Infinity;
      const chaos = p => p.puUsed * 2 + p.fakes + p.wrong + p.jumps;
      const comeback = p => p.rankHistory.length ? Math.max(...p.rankHistory) - p.rankHistory[p.rankHistory.length - 1] : 0;
      const top = (fn, cmp) => ps.slice().sort((a, b) => cmp ? cmp(fn(a), fn(b)) : fn(b) - fn(a))[0];
      const A = [];
      const push = (title, p, value) => { if (p) A.push({ title, id: p.id, name: p.name, color: p.color, value }); };
      const bestAim = top(acc); push('Best Aim', bestAim, Math.round(acc(bestAim) * 100) + '% accuracy');
      const fast = ps.filter(p => isFinite(minR(p))).sort((a, b) => minR(a) - minR(b))[0]; push('Fastest Reaction', fast, fast ? minR(fast) + 'ms' : '');
      const missy = top(p => p.misses + p.wrong + p.fakes); push('Most Misses', missy, (missy.misses + missy.wrong + missy.fakes) + ' whiffs');
      const cb = top(comeback); if (comeback(cb) > 0) push('Biggest Comeback', cb, 'climbed ' + comeback(cb) + ' place' + (comeback(cb) > 1 ? 's' : ''));
      const ch = top(chaos); push('Most Chaotic', ch, ch.puUsed + ' power-ups, ' + (ch.fakes + ch.wrong) + ' bad shots');
      const mvpId = Object.entries(this.roundWins).sort((a, b) => b[1] - a[1])[0]; const mvp = mvpId ? this.players.get(mvpId[0]) : ranked[0]; push('MVP', mvp, (mvpId ? mvpId[1] : 0) + ' round wins');
      const combo = top(p => p.maxCombo); push('Combo King', combo, combo.maxCombo + 'x streak');
      const funny = [
        ps.map(p => [p.wrong, p.name + ' shot their friends ' + p.wrong + ' times']).sort((a, b) => b[0] - a[0])[0],
        ps.map(p => [p.misses, p.name + ' clicked nothing ' + p.misses + ' times']).sort((a, b) => b[0] - a[0])[0],
        ps.map(p => [p.fakes, p.name + ' fell for ' + p.fakes + ' fake targets']).sort((a, b) => b[0] - a[0])[0],
        ps.map(p => [p.jumps, p.name + ' jumped the gun ' + p.jumps + ' times']).sort((a, b) => b[0] - a[0])[0],
      ].sort((a, b) => b[0] - a[0])[0];
      const board = ranked.map((p, i) => ({
        id: p.id, name: p.name, color: p.color, score: p.score, rank: i + 1,
        accuracy: Math.round(acc(p) * 100), hits: p.hits, misses: p.misses + p.wrong + p.fakes, maxCombo: p.maxCombo,
        fastest: isFinite(minR(p)) ? Math.round(minR(p)) : null, roundScores: p.roundScores,
      }));
      this.broadcast({ type: 'final', board, winner: ranked[0] ? ranked[0].id : null, awards: A, funny: funny && funny[0] > 0 ? funny[1] : ranked[0].name + ' won without breaking a sweat', chaosMode: this.chaosMode, single: this.totalRounds === 1 });
    }

    // ---------- bots ----------
    runBot(bot) {
      const R = this.round, base = this.startAt;
      const at = (t, fn) => this.later(Math.max(0, base + t - this.now()), fn);
      const sk = bot.skill;
      if (R.game === 'reaction') {
        for (const s of R.signals) {
          if (Math.random() < 0.15 * (1.2 - sk)) at(s.tWait + (s.tGreen - s.tWait) * Math.random(), () => this.handle(bot.id, { type: 'react', t: this.now() - base }));
          else at(s.tGreen + 160 + Math.random() * 420 * (1.4 - sk), () => this.handle(bot.id, { type: 'react', t: this.now() - base }));
        }
        return;
      }
      for (const w of R.waves) {
        const right = Math.random() < sk * 0.85;
        const ids = w.ids.slice();
        const correct = ids.find(id => { const k = this.targetMap.get(id).kind; return k === 'correct' || k === 'enemy' || k === 'ccorrect'; });
        const wrongs = ids.filter(id => id !== correct);
        const delay = 500 + Math.random() * 1600 * (1.4 - sk);
        if (right) at(w.t0 + delay, () => this.handle(bot.id, { type: 'hit', tid: correct, t: this.now() - base }));
        else if (Math.random() < 0.6) at(w.t0 + delay, () => this.handle(bot.id, { type: 'hit', tid: pick(Math.random, wrongs), t: this.now() - base }));
      }
      for (const tg of R.targets) {
        if (tg.wave || tg.kind === 'ring') continue;
        const bad = tg.value < 0;
        const shoot = bad ? Math.random() < 0.18 * (1.3 - sk) : Math.random() < sk * 1.1 * (tg.kind === 'gold' ? 0.9 : 1);
        if (!shoot) continue;
        const delay = Math.min(tg.life * 0.9, (220 + Math.random() * 650) * (1.5 - sk) + (tg.r < 22 ? 150 : 0));
        at(tg.t0 + delay, () => this.handle(bot.id, { type: 'hit', tid: tg.id, t: this.now() - base }));
      }
      for (const tg of R.targets) {
        if (tg.kind !== 'ring') continue;
        if (Math.random() > sk * 0.9 + 0.05) continue;
        const delay = Math.min(tg.life * 0.85, (300 + Math.random() * 700) * (1.4 - sk));
        const off = (1.05 - sk) * tg.r * 0.9;
        const ang = Math.random() * Math.PI * 2, dist = Math.random() * off;
        const x = Math.round(tg.x + Math.cos(ang) * dist), y = Math.round(tg.y + Math.sin(ang) * dist);
        at(tg.t0 + delay, () => this.handle(bot.id, { type: 'hit', tid: tg.id, t: this.now() - base, x, y }));
      }
      for (let t = 1500; t < R.duration; t += 1200 + Math.random() * 2200) {
        if (Math.random() < (1.15 - sk) * 0.7) at(t, () => this.handle(bot.id, { type: 'miss', t: this.now() - base }));
      }
    }
  }

  return { W, H, ROUNDS, MINIGAMES, COLORS, POWERUPS, PU_IDS, rng, generateRound, posAt, activeEvents, eventMult, hitPoints, Room, randomNick, pickGame };
});
