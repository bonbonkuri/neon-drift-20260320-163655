(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const waveEl = document.getElementById("wave");
  const chainEl = document.getElementById("chain");
  const bombsEl = document.getElementById("bombs");
  const hiScoreEl = document.getElementById("hiscore");
  const muteBtn = document.getElementById("muteBtn");

  let dpr = 1;
  let W = 0;
  let H = 0;

  const keys = Object.create(null);

  const state = {
    mode: "menu",
    score: 0,
    lives: 3,
    wave: 1,
    shake: 0,
    spawnAcc: 0,
    waveTimer: 0,
    powerTimer: 0,
    rapidTimer: 0,
    paused: false,
    bombs: 2,
    comboChain: 0,
    comboTime: 0,
    barrierHits: 0,
    waveBanner: 0,
    bombFlash: 0,
    fever: 0,
    hitStop: 0,
    slowMo: 0,
    callout: 0,
    calloutText: "",
    grazeCd: 0,
    dangerPulse: 0,
    charge: 0,
    swarmWarn: 0,
    zoomPulse: 0,
    rageAnnounced: false,
    bossIntro: 0,
    bossName: "",
    bossFlash: 0,
  };

  const player = {
    x: 0,
    y: 0,
    w: 28,
    h: 36,
    speed: 420,
    shootCd: 0,
    inv: 0,
  };

  const pointer = { active: false, x: 0, y: 0 };

  const stars = [[], []];
  let bullets = [];
  let enemies = [];
  let enemyBullets = [];
  let particles = [];
  let pickups = [];
  let floatTexts = [];
  let gems = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let highScore = (() => {
    try { return parseInt(localStorage.getItem("neonDrift_hi") || "0", 10) || 0; }
    catch (_) { return 0; }
  })();

  const sfx = (() => {
    let ac = null;
    let dest = null;

    function setup() {
      if (ac) return true;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor();
        comp.connect(ac.destination);
        dest = comp;
        return true;
      } catch (_) { return false; }
    }

    function resume() {
      if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    }

    function tone(freq, type, t0, dur, vol, freqEnd) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(dest);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    }

    function noise(t0, dur, vol, decay) {
      const sr = ac.sampleRate;
      const n = Math.ceil(sr * dur);
      const buf = ac.createBuffer(1, n, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vol, t0);
      src.connect(gain);
      gain.connect(dest);
      src.start(t0);
    }

    function go(fn) {
      if (!setup()) return;
      resume();
      try { fn(ac.currentTime); } catch (_) {}
    }

    return {
      shoot()    { go(t => tone(820, "square",   t, 0.035, 0.048, 360)); },
      hit()      { go(t => tone(160, "sawtooth", t, 0.18, 0.28,  55)); },
      pickup()   { go(t => [660, 880, 1100].forEach((f, i) => tone(f, "sine", t + i * 0.07, 0.08, 0.14))); },
      wave()     { go(t => [440, 550, 660].forEach((f, i) => tone(f, "sine", t + i * 0.1, 0.1, 0.14))); },
      gameOver() { go(t => [440, 330, 220].forEach((f, i) => tone(f, "sawtooth", t + i * 0.15, 0.18, 0.18))); },
      graze()    { go(t => tone(1400, "sine", t, 0.05, 0.09, 2200)); },
      fever()    { go(t => [523, 659, 784, 1046].forEach((f, i) => tone(f, "square", t + i * 0.06, 0.1, 0.12))); },
      callout()  { go(t => [880, 1175].forEach((f, i) => tone(f, "triangle", t + i * 0.08, 0.12, 0.16))); },
      combo(n) {
        const f = Math.min(1600, 480 + n * 55);
        go(t => tone(f, "square", t, 0.06, 0.1, f * 1.4));
      },
      charge() {
        go(t => {
          tone(220, "sawtooth", t, 0.08, 0.12, 520);
          noise(t, 0.12, 0.2, 2.2);
        });
      },
      gem() { go(t => tone(990, "sine", t, 0.04, 0.08, 1400)); },
      warning() {
        go(t => {
          tone(180, "square", t, 0.12, 0.2, 120);
          tone(160, "square", t + 0.18, 0.12, 0.2, 100);
        });
      },
      bossIntro() {
        go(t => {
          noise(t, 0.35, 0.4, 1.6);
          [110, 147, 185, 220].forEach((f, i) => tone(f, "sawtooth", t + i * 0.12, 0.2, 0.22, f * 0.7));
        });
      },
      bossPhase() {
        go(t => {
          noise(t, 0.28, 0.5, 1.4);
          tone(80, "sine", t, 0.35, 0.4, 40);
          [400, 600, 900].forEach((f, i) => tone(f, "square", t + 0.1 + i * 0.07, 0.1, 0.14));
        });
      },
      explode(big) {
        go(t => {
          noise(t, big ? 0.5 : 0.22, big ? 0.55 : 0.32, big ? 1.8 : 2.5);
          if (big) tone(90, "sine", t, 0.45, 0.45, 28);
        });
      },
      bomb() {
        go(t => {
          noise(t, 0.6, 0.65, 1.5);
          tone(90, "sine", t, 0.5, 0.45, 28);
        });
      },
      unlock() { setup(); resume(); },
    };
  })();

  const bgm = (() => {
    let ac = null;
    let master = null;
    let track = "menu";
    let step = 0;
    let nextTime = 0;
    let timer = null;
    let muted = false;
    let running = false;
    let volume = 0.2;

    const TRACKS = {
      menu: {
        bpm: 92,
        bass: [55, 0, 55, 0, 62, 0, 55, 0, 49, 0, 55, 0, 62, 0, 82, 0],
        lead: [0, 0, 220, 0, 0, 247, 0, 0, 196, 0, 220, 0, 0, 165, 0, 0],
        hat:  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0],
        kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
      },
      play: {
        bpm: 128,
        bass: [55, 0, 55, 55, 41, 0, 55, 0, 62, 0, 55, 0, 73, 0, 55, 55],
        lead: [110, 0, 165, 0, 147, 0, 110, 0, 123, 0, 165, 0, 185, 0, 147, 0],
        hat:  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0],
      },
      fever: {
        bpm: 152,
        bass: [73, 73, 0, 73, 82, 0, 73, 73, 98, 0, 82, 0, 73, 73, 110, 0],
        lead: [294, 330, 349, 392, 440, 392, 349, 330, 294, 330, 392, 440, 523, 440, 392, 349],
        hat:  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        kick: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
      },
      boss: {
        bpm: 136,
        bass: [41, 0, 41, 41, 37, 0, 41, 0, 46, 0, 41, 41, 55, 0, 41, 37],
        lead: [82, 0, 0, 98, 0, 0, 110, 0, 98, 0, 82, 0, 123, 0, 110, 0],
        hat:  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0],
        kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1],
      },
      over: {
        bpm: 72,
        bass: [55, 0, 0, 0, 49, 0, 0, 0, 41, 0, 0, 0, 37, 0, 0, 0],
        lead: [165, 0, 0, 147, 0, 0, 123, 0, 110, 0, 0, 98, 0, 0, 82, 0],
        hat:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      },
    };

    function ensure() {
      if (ac) return true;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = muted ? 0 : volume;
        master.connect(ac.destination);
        return true;
      } catch (_) {
        return false;
      }
    }

    function resume() {
      if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    }

    function envTone(freq, type, t0, dur, vol) {
      if (!freq) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = type === "square" ? 1800 : 900;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function kick(t0) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, t0);
      osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
      gain.gain.setValueAtTime(0.45, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }

    function hat(t0, open) {
      const sr = ac.sampleRate;
      const n = Math.ceil(sr * (open ? 0.08 : 0.03));
      const buf = ac.createBuffer(1, n, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, open ? 1.2 : 3);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 6000;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(open ? 0.08 : 0.045, t0);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    }

    function scheduleBeat(t0, s) {
      const p = TRACKS[track] || TRACKS.play;
      const i = s % 16;
      if (p.kick[i]) kick(t0);
      if (p.hat[i]) hat(t0, i % 4 === 2);
      if (p.bass[i]) envTone(p.bass[i], "triangle", t0, 0.16, track === "fever" ? 0.16 : 0.13);
      if (p.lead[i]) envTone(p.lead[i], track === "boss" ? "sawtooth" : "square", t0, 0.11, track === "fever" ? 0.09 : 0.06);
    }

    function loop() {
      if (!running || !ac) return;
      resume();
      if (!muted) {
        const horizon = 0.15;
        const p = TRACKS[track] || TRACKS.play;
        const stepDur = 60 / p.bpm / 4;
        while (nextTime < ac.currentTime + horizon) {
          scheduleBeat(nextTime, step);
          nextTime += stepDur;
          step += 1;
        }
      }
      timer = setTimeout(loop, 25);
    }

    return {
      unlock() {
        if (!ensure()) return;
        resume();
        if (!running) {
          running = true;
          nextTime = ac.currentTime + 0.08;
          step = 0;
          loop();
        }
      },
      setTrack(name) {
        if (!TRACKS[name] || track === name) return;
        track = name;
        step = 0;
        if (ac) nextTime = Math.max(nextTime, ac.currentTime + 0.05);
      },
      sync(mode, fever, boss, paused) {
        if (muted || !running) return;
        if (mode === "menu") this.setTrack("menu");
        else if (mode === "over") this.setTrack("over");
        else if (mode === "play" && paused) this.setTrack("menu");
        else if (boss) this.setTrack("boss");
        else if (fever) this.setTrack("fever");
        else this.setTrack("play");
      },
      toggleMute() {
        muted = !muted;
        if (master) {
          master.gain.cancelScheduledValues(ac ? ac.currentTime : 0);
          master.gain.setValueAtTime(muted ? 0 : volume, ac ? ac.currentTime : 0);
        }
        return muted;
      },
      isMuted() { return muted; },
      stop() {
        running = false;
        if (timer) clearTimeout(timer);
        timer = null;
      },
    };
  })();

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth || document.documentElement.clientWidth || 800;
    H = window.innerHeight || document.documentElement.clientHeight || 600;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.mode === "menu") {
      player.x = W / 2;
      player.y = H - H * 0.15;
    } else {
      player.x = clamp(player.x, player.w, W - player.w);
      player.y = clamp(player.y, H * 0.35, H - player.h);
    }
    initStarsIfNeeded();
  }

  function initStarsIfNeeded() {
    const target = [80, 140];
    for (let layer = 0; layer < 2; layer++) {
      while (stars[layer].length < target[layer]) {
        stars[layer].push({
          x: Math.random() * W,
          y: Math.random() * H,
          s: rand(0.6, layer === 0 ? 2.2 : 1.4),
          sp: rand(20, 40) * (layer + 1),
        });
      }
    }
  }

  function resetGame() {
    state.score = 0;
    state.lives = 3;
    state.wave = 1;
    state.shake = 0;
    state.spawnAcc = 0;
    state.waveTimer = 0;
    state.powerTimer = 0;
    state.rapidTimer = 0;
    state.paused = false;
    state.bombs = 2;
    state.comboChain = 0;
    state.comboTime = 0;
    state.barrierHits = 0;
    state.waveBanner = 0;
    state.bombFlash = 0;
    state.fever = 0;
    state.hitStop = 0;
    state.slowMo = 0;
    state.callout = 0;
    state.calloutText = "";
    state.grazeCd = 0;
    state.dangerPulse = 0;
    state.charge = 0;
    state.swarmWarn = 0;
    state.zoomPulse = 0;
    state.rageAnnounced = false;
    state.bossIntro = 0;
    state.bossName = "";
    state.bossFlash = 0;
    player.x = W / 2;
    player.y = H - H * 0.15;
    player.shootCd = 0;
    player.inv = 120;
    bullets = [];
    enemies = [];
    enemyBullets = [];
    particles = [];
    pickups = [];
    floatTexts = [];
    gems = [];
    updateHud();
  }

  function comboMultiplier() {
    if (state.comboChain <= 0) return 1;
    return Math.min(5, 1 + Math.floor((state.comboChain - 1) / 2));
  }

  function updateHud() {
    scoreEl.textContent = `SCORE ${state.score.toLocaleString("ja-JP")}`;
    waveEl.textContent = `WAVE ${state.wave}`;
    const h = Math.max(0, state.lives);
    livesEl.textContent = "\u2665".repeat(h) || "\u2014";
    const m = comboMultiplier();
    if (state.comboChain <= 0) chainEl.textContent = "CHAIN \u2014";
    else if (m <= 1) chainEl.textContent = `CHAIN ${state.comboChain}`;
    else chainEl.textContent = `CHAIN ${state.comboChain} (x${m})`;
    bombsEl.textContent = `BOMB ${state.bombs}`;
    if (state.fever > 0) {
      chainEl.textContent = `FEVER ${state.fever.toFixed(1)}s · CHAIN ${state.comboChain}`;
    }
    if (state.score > highScore) {
      highScore = state.score;
      try { localStorage.setItem("neonDrift_hi", String(highScore)); } catch (_) {}
    }
    hiScoreEl.textContent = `HI ${highScore.toLocaleString("ja-JP")}`;
  }

  function spawnPickupAt(x, y) {
    const r = Math.random();
    let kind = "spread";
    if (r < 0.26) kind = "rapid";
    else if (r < 0.52) kind = "spread";
    else if (r < 0.74) kind = "barrier";
    else if (r < 0.9) kind = "bomb";
    else kind = "spread";
    pickups.push({ x, y, vy: 55, kind, t: 0 });
  }

  function triggerCallout(text) {
    state.callout = 1.15;
    state.calloutText = text;
    sfx.callout();
  }

  function maybeFeverOrCallout() {
    const c = state.comboChain;
    if (c === 5) triggerCallout("NICE!");
    else if (c === 10) triggerCallout("GREAT!");
    else if (c === 15) triggerCallout("AMAZING!");
    else if (c === 20) triggerCallout("UNSTOPPABLE!");
    else if (c === 30) triggerCallout("LEGENDARY!");

    if (c >= 8 && state.fever <= 0) {
      state.fever = 6.5;
      sfx.fever();
      triggerCallout("FEVER TIME!");
      addShake(8);
    } else if (c >= 8 && state.fever > 0) {
      state.fever = Math.min(8.5, state.fever + 0.55);
    }
  }

  function spawnGems(x, y, n, value) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 180);
      gems.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        value,
        life: 4.5,
        magnet: false,
      });
    }
  }

  function isRage() {
    return state.mode === "play" && state.lives === 1;
  }

  function registerKill(e, fromBomb) {
    if (!fromBomb) {
      state.comboTime = 1.65;
      state.comboChain += 1;
      sfx.combo(state.comboChain);
      maybeFeverOrCallout();
    } else {
      state.comboChain = 0;
      state.comboTime = 0;
    }
    let mult = fromBomb ? 1 : comboMultiplier();
    if (!fromBomb && state.fever > 0) mult += 1;
    if (!fromBomb && isRage()) mult += 1;
    const dist = Math.hypot(e.x - player.x, e.y - player.y);
    const pointBlank = !fromBomb && dist < 90;
    if (pointBlank) mult += 1;
    let base = 100 + state.wave * 15;
    if (e.type === "tank") base += 80;
    else if (e.type === "shooter") base += 50;
    else if (e.type === "dive") base += 70;
    else if (e.type === "boss") base += 420 + state.wave * 45;
    const pts = Math.floor(base * mult);
    state.score += pts;
    const isBoss = e.type === "boss";
    spawnParticles(e.x, e.y, isBoss ? 56 : e.type === "tank" ? 36 : 26, isBoss ? "#ffcc66" : "#ffb4d4", isBoss ? 1.4 : 1.15);
    spawnGems(e.x, e.y, isBoss ? 8 : pointBlank ? 4 : 2, isBoss ? 40 : pointBlank ? 25 : 12);
    if (isBoss) {
      const bx = e.x;
      const by = e.y;
      state.slowMo = 1.15;
      state.hitStop = 0.28;
      state.zoomPulse = 0.28;
      state.bombFlash = 0.55;
      enemyBullets.length = 0;
      triggerCallout("BOSS DOWN!");
      addShake(22);
      sfx.explode(true);
      for (let n = 0; n < 5; n++) {
        setTimeout(() => {
          spawnParticles(bx + rand(-40, 40), by + rand(-30, 30), 28, n % 2 ? "#ffcc66" : "#ff6688", 1.3);
          addShake(6);
          sfx.explode(true);
        }, n * 120);
      }
      spawnGems(bx, by, 16, 55);
      state.fever = Math.max(state.fever, 4);
    } else if (!fromBomb) {
      sfx.explode(false);
      state.hitStop = pointBlank ? 0.07 : 0.045;
      state.zoomPulse = Math.max(state.zoomPulse, pointBlank ? 0.1 : 0.05);
      if (pointBlank) {
        enemyBullets = enemyBullets.filter((b) => Math.hypot(b.x - e.x, b.y - e.y) > 70);
        floatTexts.push({ x: e.x, y: e.y - 48, life: 0.7, t: 0, text: "POINT BLANK!", sub: "", big: true });
      }
      if (state.comboChain >= 5) {
        addShake(3 + Math.min(6, state.comboChain * 0.25));
      }
    }
    const pickupChance = fromBomb ? 0.055 : 0.1 + state.wave * 0.006;
    if (Math.random() < pickupChance) spawnPickupAt(e.x, e.y);
    const sub = !fromBomb && mult > 1 ? `x${mult}` : "";
    floatTexts.push({
      x: e.x,
      y: e.y - 28,
      life: 0.9,
      t: 0,
      text: `+${pts}`,
      sub,
      big: state.fever > 0 || mult >= 3 || pointBlank,
    });
    updateHud();
  }

  function fireChargeShot() {
    const power = clamp(state.charge, 0, 1);
    if (power < 0.35) {
      state.charge = 0;
      return;
    }
    sfx.charge();
    const dmg = 3 + power * 7 + (isRage() ? 2 : 0);
    bullets.push({
      x: player.x,
      y: player.y - 24,
      vy: -1100,
      dmg,
      trail: true,
      charge: true,
      r: 6 + power * 10,
    });
    for (let i = -1; i <= 1; i += 2) {
      bullets.push({
        x: player.x + i * 16,
        y: player.y - 18,
        vy: -950,
        vx: i * 70,
        dmg: dmg * 0.45,
        trail: true,
      });
    }
    addShake(6 + power * 8);
    state.zoomPulse = Math.max(state.zoomPulse, 0.08 + power * 0.1);
    spawnParticles(player.x, player.y - 20, 18, "#ffe08a", 1.1);
    state.charge = 0;
    player.shootCd = 0.18;
  }

  function useBomb() {
    if (state.bombs <= 0 || state.mode !== "play" || state.paused) return;
    state.bombs -= 1;
    enemyBullets.length = 0;
    state.bombFlash = 0.42;
    state.slowMo = 0.45;
    player.inv = Math.max(player.inv, 70);
    addShake(22);
    sfx.bomb();
    spawnParticles(player.x, player.y - 30, 55, "#fdf8ff", 1.7);
    triggerCallout("BOMB!");
    state.comboChain = 0;
    state.comboTime = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.type === "boss") {
        e.hp -= 18 + Math.floor(state.wave / 2);
        spawnParticles(e.x, e.y, 26, "#ffe8aa", 1.05);
        if (e.hp <= 0) {
          registerKill(e, true);
          enemies.splice(i, 1);
        }
      } else {
        registerKill(e, true);
        enemies.splice(i, 1);
      }
    }
    updateHud();
  }

  function addShake(n) {
    state.shake = Math.min(18, state.shake + n);
  }

  function spawnParticles(x, y, n, color, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(80, 320) * speed;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.55),
        max: rand(0.25, 0.55),
        color,
        s: rand(1.5, 3.5),
      });
    }
  }

  function firePlayer() {
    sfx.shoot();
    const feverBoost = state.fever > 0;
    const spread = state.powerTimer > 0 || feverBoost ? 3 : 1;
    const baseDamage = state.powerTimer > 0 ? 1.25 : feverBoost ? 1.15 : 1;
    const speed = feverBoost ? -980 : -820;
    if (spread === 1) {
      bullets.push({ x: player.x, y: player.y - 20, vy: speed, dmg: baseDamage, trail: feverBoost });
    } else {
      for (let i = -1; i <= 1; i++) {
        bullets.push({
          x: player.x + i * (feverBoost ? 12 : 10),
          y: player.y - 18,
          vy: speed + 20,
          vx: i * (feverBoost ? 55 : 42),
          dmg: baseDamage * 0.88,
          trail: feverBoost,
        });
      }
    }
  }

  function spawnEnemy(forcedType, ox, oy) {
    const margin = 40;
    const x = ox !== undefined ? ox : rand(margin, W - margin);
    const roll = Math.random();
    const w = state.wave;

    let type = forcedType || "grunt";
    if (!forcedType) {
      if (roll < 0.16 + w * 0.008) type = "dive";
      else if (roll < 0.34 + w * 0.01) type = "zigzag";
      else if (roll < 0.48 + w * 0.015) type = "tank";
      else if (roll < 0.62 + w * 0.02) type = "shooter";
    }

    const baseHp =
      1 +
      (type === "tank" ? 3 + Math.floor(w / 3) : 0) +
      (type === "shooter" ? 1 : 0) +
      (type === "dive" ? 1 : 0);
    enemies.push({
      type,
      x,
      y: oy !== undefined ? oy : -40,
      hp: baseHp,
      maxHp: baseHp,
      t: 0,
      shootCd: rand(0.4, 1.2),
      phase: rand(0, Math.PI * 2),
      diving: false,
    });
  }

  function spawnFormation() {
    const cx = rand(W * 0.25, W * 0.75);
    const offsets = [
      [0, -50],
      [-50, -20],
      [50, -20],
      [-95, 15],
      [95, 15],
    ];
    for (const [dx, dy] of offsets) {
      spawnEnemy("grunt", clamp(cx + dx, 40, W - 40), dy);
    }
    floatTexts.push({ x: cx, y: 60, life: 1.1, t: 0, text: "FORMATION!", sub: "×5", big: true });
  }

  function spawnBoss() {
    if (enemies.some((e) => e.type === "boss")) return;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      spawnParticles(e.x, e.y, 10, "#ffb4d4", 0.7);
      enemies.splice(i, 1);
    }
    enemyBullets.length = 0;
    const w = state.wave;
    const hp = 60 + w * 16;
    const names = ["NEON TITAN", "VOID REAPER", "SOLAR WRAITH", "PULSE HYDRA", "AURORA FANG"];
    state.bossName = names[Math.max(0, Math.floor(w / 5) - 1) % names.length];
    state.bossIntro = 3.4;
    state.bossFlash = 0.5;
    state.slowMo = 0.55;
    state.zoomPulse = 0.2;
    addShake(14);
    sfx.bossIntro();
    triggerCallout("BOSS APPROACHING");
    enemies.push({
      type: "boss",
      name: state.bossName,
      x: W * 0.5,
      y: -160,
      hp,
      maxHp: hp,
      t: 0,
      shootCd: 1.4,
      phase: 1,
      homeY: Math.min(H * 0.2, 150),
      pattern: 0,
      patternT: 0,
      laserWarn: 0,
      laserX: W * 0.5,
      flash: 0,
      entered: false,
      spin: 0,
    });
  }

  function bossPhaseOf(e) {
    const r = e.hp / e.maxHp;
    if (r > 0.66) return 1;
    if (r > 0.33) return 2;
    return 3;
  }

  function pushBossBullet(x, y, vx, vy, opts) {
    enemyBullets.push({
      x,
      y,
      vx,
      vy,
      r: (opts && opts.r) || 5,
      col: (opts && opts.col) || "#ffcad8",
      glow: (opts && opts.glow) || "#ff6b9d",
      boss: true,
    });
  }

  function fireBossPattern(e) {
    const ph = e.phase;
    const angToPlayer = Math.atan2(player.y - e.y, player.x - e.x);

    if (e.pattern === 0) {
      const n = ph === 3 ? 20 : ph === 2 ? 16 : 12;
      const base = e.spin;
      for (let k = 0; k < n; k++) {
        const a = base + (k / n) * Math.PI * 2;
        const sp = 150 + ph * 35;
        pushBossBullet(e.x, e.y + 20, Math.cos(a) * sp, Math.sin(a) * sp + 40, {
          r: 5 + ph,
          col: ph === 3 ? "#ffdd88" : "#ffcad8",
          glow: ph === 3 ? "#ffaa44" : "#ff6b9d",
        });
      }
      e.spin += 0.35;
      e.shootCd = ph === 3 ? 0.55 : ph === 2 ? 0.75 : 1.0;
    } else if (e.pattern === 1) {
      const count = 5 + ph * 2;
      for (let k = -Math.floor(count / 2); k <= Math.floor(count / 2); k++) {
        const a = angToPlayer + k * 0.14;
        const sp = 230 + ph * 25;
        pushBossBullet(e.x, e.y + 24, Math.cos(a) * sp, Math.sin(a) * sp, {
          r: 6,
          col: "#ff9ec8",
          glow: "#ff4488",
        });
      }
      for (const side of [-1, 1]) {
        pushBossBullet(e.x + side * 48, e.y + 10, side * 40, 260, { r: 7, col: "#c4a8ff", glow: "#9f8cff" });
      }
      e.shootCd = ph === 3 ? 0.7 : 1.05;
    } else {
      if (e.laserWarn <= 0) {
        e.laserWarn = 0.85;
        e.laserX = player.x;
        e.shootCd = 0.9;
        sfx.warning();
      }
    }
    e.pattern = (e.pattern + 1) % (ph >= 2 ? 3 : 2);
  }

  function updateBoss(e, dt) {
    e.t += dt;
    e.spin += dt * (1.2 + e.phase * 0.4);
    if (e.flash > 0) e.flash -= dt;

    if (!e.entered) {
      e.y += 140 * dt;
      if (e.y >= e.homeY) {
        e.y = e.homeY;
        e.entered = true;
        triggerCallout(e.name || "BOSS");
        addShake(10);
        state.bossFlash = 0.35;
      }
      return;
    }

    const targetX = W * 0.5 + Math.sin(e.t * (0.7 + e.phase * 0.15)) * (W * 0.28);
    e.x += (targetX - e.x) * Math.min(1, 2.4 * dt);
    e.x = clamp(e.x, 80, W - 80);
    e.y += (e.homeY + Math.sin(e.t * 1.6) * 10 - e.y) * Math.min(1, 3 * dt);

    const nextPhase = bossPhaseOf(e);
    if (nextPhase > e.phase) {
      e.phase = nextPhase;
      e.flash = 0.6;
      state.bossFlash = 0.45;
      state.hitStop = 0.12;
      state.zoomPulse = 0.16;
      enemyBullets.length = 0;
      spawnParticles(e.x, e.y, 48, "#ff8866", 1.5);
      addShake(16);
      sfx.bossPhase();
      triggerCallout(e.phase === 2 ? "PHASE 2" : "FINAL PHASE");
    }

    if (e.laserWarn > 0) {
      e.laserWarn -= dt;
      e.laserX += (player.x - e.laserX) * Math.min(1, 1.8 * dt);
      if (e.laserWarn <= 0) {
        for (let i = 0; i < 18; i++) {
          pushBossBullet(e.laserX + rand(-8, 8), e.y + 30 + i * 18, rand(-20, 20), 420 + i * 8, {
            r: 8,
            col: "#fff0a8",
            glow: "#ffcc44",
          });
        }
        addShake(10);
        sfx.charge();
        spawnParticles(e.laserX, e.y + 80, 20, "#ffe08a", 1);
      }
    }

    e.shootCd -= dt;
    if (e.shootCd <= 0 && e.laserWarn <= 0) fireBossPattern(e);

    if (Math.random() < 0.35 + e.phase * 0.1) {
      spawnParticles(e.x + rand(-40, 40), e.y + rand(10, 40), 1, e.phase === 3 ? "#ffaa44" : "#ff6688", 0.4);
    }
  }

  function hurtPlayer() {
    if (player.inv > 0 || state.mode !== "play") return;
    if (state.barrierHits > 0) {
      state.barrierHits -= 1;
      player.inv = 48;
      addShake(6);
      spawnParticles(player.x, player.y, 18, "#88ddff", 0.9);
      state.comboChain = 0;
      state.comboTime = 0;
      sfx.hit();
      updateHud();
      return;
    }
    state.comboChain = 0;
    state.comboTime = 0;
    state.fever = 0;
    state.charge = 0;
    state.lives -= 1;
    player.inv = 120;
    addShake(10);
    spawnParticles(player.x, player.y, 28, "#ff6b9d", 1.2);
    sfx.hit();
    const prevHigh = highScore;
    updateHud();
    if (state.lives <= 0) {
      state.mode = "over";
      sfx.gameOver();
      const newRecord = state.score > 0 && highScore > prevHigh;
      titleEl.textContent = newRecord ? "NEW RECORD!" : "GAME OVER";
      subtitleEl.textContent = `スコア ${state.score.toLocaleString("ja-JP")} · R でリトライ`;
      overlay.classList.remove("hidden");
    }
  }

  function circlesOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy < (ar + br) * (ar + br);
  }

  /** 描画は細い菱形だが円判定を大きく取っていたため、弾が見た目より手前でヒットしていた */
  function enemyBulletHitRadius(e) {
    switch (e.type) {
      case "boss":
        return 22;
      case "tank":
        return 14;
      case "shooter":
        return 9;
      case "dive":
        return 8;
      default:
        return 7;
    }
  }

  function rectCircle(rx, ry, rw, rh, cx, cy, cr) {
    const nx = clamp(cx, rx - rw / 2, rx + rw / 2);
    const ny = clamp(cy, ry - rh / 2, ry + rh / 2);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  }

  function updateStars(dt) {
    const boost = 1 + state.wave * 0.04 + (state.fever > 0 ? 2.2 : 0) + state.comboChain * 0.02;
    for (let layer = 0; layer < 2; layer++) {
      const list = stars[layer];
      for (const s of list) {
        s.y += s.sp * dt * boost;
        if (s.y > H + 5) {
          s.y = -5;
          s.x = Math.random() * W;
        }
      }
    }
  }

  function updatePlayer(dt) {
    let mx = 0;
    let my = 0;
    if (keys.ArrowLeft || keys.a || keys.A) mx -= 1;
    if (keys.ArrowRight || keys.d || keys.D) mx += 1;
    if (keys.ArrowUp || keys.w || keys.W) my -= 1;
    if (keys.ArrowDown || keys.s || keys.S) my += 1;

    if (pointer.active && state.mode === "play") {
      const dx = pointer.x - player.x;
      const dy = pointer.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        mx = dx / dist;
        my = dy / dist;
      }
    } else if (mx || my) {
      const len = Math.hypot(mx, my) || 1;
      mx /= len;
      my /= len;
    }

    const charging = keys.Shift || keys.z || keys.Z;
    const rage = isRage();
    if (rage && !state.rageAnnounced) {
      state.rageAnnounced = true;
      triggerCallout("RAGE MODE!");
      state.fever = Math.max(state.fever, 3.5);
      addShake(10);
    }

    let spdMul = state.fever > 0 ? 1.18 : 1;
    if (rage) spdMul *= 1.12;
    if (charging && state.mode === "play") spdMul *= 0.55;
    const spd = player.speed * spdMul;
    player.x = clamp(player.x + mx * spd * dt, player.w, W - player.w);
    player.y = clamp(player.y + my * spd * dt, H * 0.35, H - player.h);

    if (player.inv > 0) player.inv -= 1;

    if (state.mode === "play") {
      if (charging) {
        const prev = state.charge;
        state.charge = Math.min(1, state.charge + dt / 0.85);
        if (prev < 0.35 && state.charge >= 0.35) sfx.graze();
        if (state.charge >= 1 && Math.random() < 0.4) {
          spawnParticles(player.x + rand(-10, 10), player.y - 8, 1, "#ffe08a", 0.5);
        }
      } else if (state.charge > 0) {
        fireChargeShot();
      } else {
        player.shootCd -= dt;
        if (player.shootCd <= 0) {
          firePlayer();
          let cd = state.powerTimer > 0 ? 0.085 : 0.1;
          if (state.rapidTimer > 0) cd *= 0.5;
          if (state.fever > 0) cd *= 0.62;
          if (rage) cd *= 0.85;
          player.shootCd = cd;
        }
      }

      if (Math.random() < (state.fever > 0 || rage ? 0.5 : 0.2)) {
        spawnParticles(
          player.x + rand(-4, 4),
          player.y + 14,
          1,
          rage ? "#ff6688" : state.fever > 0 ? "#ffcc66" : "#4ec8ff",
          state.fever > 0 || rage ? 0.55 : 0.35
        );
      }
    }

    if (state.powerTimer > 0) state.powerTimer -= dt;
    if (state.rapidTimer > 0) state.rapidTimer -= dt;
    if (state.fever > 0) {
      state.fever -= dt;
      chainEl.textContent = `FEVER ${Math.max(0, state.fever).toFixed(1)}s · CHAIN ${state.comboChain}`;
      if (state.fever <= 0) {
        state.fever = 0;
        updateHud();
      }
    }
    if (state.grazeCd > 0) state.grazeCd -= dt;
    if (state.callout > 0) state.callout -= dt;
    if (state.dangerPulse > 0) state.dangerPulse *= Math.pow(0.15, dt);
    if (state.swarmWarn > 0) state.swarmWarn -= dt;
    if (state.zoomPulse > 0) state.zoomPulse = Math.max(0, state.zoomPulse - dt * 1.8);

    if (state.comboTime > 0) {
      state.comboTime -= dt;
      if (state.comboTime <= 0) {
        state.comboChain = 0;
        updateHud();
      }
    }
  }

  function enemySpeed(type) {
    const w = state.wave;
    switch (type) {
      case "boss":
        return 38 + w * 2;
      case "tank":
        return 55 + w * 4;
      case "shooter":
        return 85 + w * 6;
      case "zigzag":
        return 100 + w * 8;
      case "dive":
        return 95 + w * 7;
      default:
        return 110 + w * 10;
    }
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += dt;
      const sp = enemySpeed(e.type) * dt;
      if (e.type === "boss") {
        updateBoss(e, dt);
      } else if (e.type === "dive") {
        if (!e.diving && e.y > H * 0.18) e.diving = true;
        if (e.diving) {
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          const diveSp = (220 + state.wave * 12) * dt;
          e.x += Math.cos(ang) * diveSp;
          e.y += Math.sin(ang) * diveSp + sp * 0.35;
          e.x = clamp(e.x, 20, W - 20);
        } else {
          e.y += sp;
        }
      } else if (e.type === "zigzag") {
        e.x += Math.sin(e.t * 2.4 + e.phase) * 120 * dt;
        e.x = clamp(e.x, 28, W - 28);
        e.y += sp;
      } else {
        e.y += sp;
      }

      if (e.type === "shooter") {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          enemyBullets.push({
            x: e.x,
            y: e.y + 10,
            vx: Math.cos(ang) * 220,
            vy: Math.sin(ang) * 220,
          });
          e.shootCd = clamp(1.1 - state.wave * 0.04, 0.35, 1.4);
        }
      }
    }
  }

  /** 移動の直後に消すと、そのフレームの collide より先に消えて弾が辻褄が合わなくなるため、衝突の後にまとめて捨てる */
  function cullEnemiesBelowScreen() {
    if (H < 48) return;
    const pad = 280;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].type === "boss") continue;
      if (enemies[i].y > H + pad) enemies.splice(i, 1);
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y += b.vy * dt;
      if (b.vx) b.x += b.vx * dt;
      if (b.y < 0 || b.x < -20 || b.x > W + 20) bullets.splice(i, 1);
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > H + 40 || b.x < -40 || b.x > W + 40) enemyBullets.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.y += p.vy * dt;
      p.t += dt;
      if (p.y > H + 30) {
        pickups.splice(i, 1);
        continue;
      }
      if (rectCircle(player.x, player.y, player.w, player.h, p.x, p.y, 14)) {
        const spark = { spread: "#c4a8ff", rapid: "#ffe066", barrier: "#66d4ff", bomb: "#ff8ec8" };
        const col = spark[p.kind] || "#9f8cff";
        if (p.kind === "spread") state.powerTimer = Math.max(state.powerTimer, 8);
        else if (p.kind === "rapid") state.rapidTimer = Math.max(state.rapidTimer, 10);
        else if (p.kind === "barrier") state.barrierHits = Math.min(3, state.barrierHits + 1);
        else if (p.kind === "bomb") state.bombs = Math.min(5, state.bombs + 1);
        pickups.splice(i, 1);
        sfx.pickup();
        spawnParticles(p.x, p.y, 14, col, 0.85);
        updateHud();
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function collide() {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.y < 0) continue;
        const er = enemyBulletHitRadius(e);
        if (circlesOverlap(b.x, b.y, b.r || (b.charge ? 8 : 3), e.x, e.y, er)) {
          e.hp -= b.dmg || 1;
          hit = true;
          if (e.type === "boss") e.flash = Math.max(e.flash || 0, 0.15);
          spawnParticles(b.x, b.y, b.charge ? 10 : 4, b.charge ? "#ffe08a" : "#7ecbff", b.charge ? 0.9 : 0.5);
          if (e.hp <= 0) {
            registerKill(e, false);
            enemies.splice(j, 1);
          }
          break;
        }
      }
      if (hit) bullets.splice(i, 1);
    }

    for (const e of enemies) {
      const er = e.type === "boss" ? 42 : e.type === "tank" ? 24 : 18;
      if (player.inv <= 0 && rectCircle(player.x, player.y, player.w * 0.7, player.h * 0.7, e.x, e.y, er)) {
        hurtPlayer();
        break;
      }
    }

    let nearBullets = 0;
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 52) nearBullets += 1;
      if (player.inv <= 0 && rectCircle(player.x, player.y, player.w * 0.65, player.h * 0.65, b.x, b.y, b.r || 6)) {
        enemyBullets.splice(i, 1);
        hurtPlayer();
        continue;
      }
      if (
        state.grazeCd <= 0 &&
        player.inv <= 0 &&
        dist > 14 &&
        dist < 38 &&
        state.mode === "play"
      ) {
        state.grazeCd = 0.08;
        const gPts = Math.floor(18 * comboMultiplier() * (state.fever > 0 ? 1.5 : 1));
        state.score += gPts;
        state.comboTime = Math.max(state.comboTime, 0.95);
        sfx.graze();
        floatTexts.push({ x: player.x + rand(-20, 20), y: player.y - 24, life: 0.55, t: 0, text: `GRAZE +${gPts}`, sub: "", big: false });
        spawnParticles(b.x, b.y, 3, "#fff6aa", 0.6);
        updateHud();
      }
    }
    state.dangerPulse = Math.max(state.dangerPulse, Math.min(1, nearBullets * 0.12));
  }

  function bossAlive() {
    return enemies.some((e) => e.type === "boss");
  }

  function updateGems(dt) {
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.life -= dt;
      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 120 || g.magnet) {
        g.magnet = true;
        const pull = 520 * dt;
        g.vx += (dx / (dist || 1)) * pull;
        g.vy += (dy / (dist || 1)) * pull;
      } else {
        g.vy += 40 * dt;
        g.vx *= 0.98;
        g.vy *= 0.98;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (dist < 18) {
        state.score += g.value;
        sfx.gem();
        spawnParticles(g.x, g.y, 4, "#ffe66a", 0.45);
        gems.splice(i, 1);
        updateHud();
        continue;
      }
      if (g.life <= 0 || g.y > H + 40) gems.splice(i, 1);
    }
  }

  function spawnWarningSwarm() {
    state.swarmWarn = 1.8;
    sfx.warning();
    triggerCallout("INCOMING!");
    addShake(6);
    const rows = 2 + Math.floor(state.wave / 4);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 6; c++) {
        const x = ((c + 0.5) / 6) * W;
        spawnEnemy(Math.random() < 0.25 ? "dive" : "grunt", x, -40 - r * 55 - rand(0, 20));
      }
    }
  }

  function spawnLogic(dt) {
    state.waveTimer += dt;
    const feverSpawn = state.fever > 0 ? 0.72 : 1;
    const interval = clamp((0.9 - state.wave * 0.04) * feverSpawn, 0.22, 0.9);
    state.spawnAcc += dt;
    if (!bossAlive() && state.swarmWarn <= 0) {
      while (state.spawnAcc >= interval) {
        state.spawnAcc -= interval;
        if (Math.random() < 0.045 + state.wave * 0.003) spawnWarningSwarm();
        else if (Math.random() < 0.09 + state.wave * 0.004) spawnFormation();
        else spawnEnemy();
      }
    }
    if (state.waveTimer > 20 + state.wave * 1.6) {
      state.waveTimer = 0;
      state.wave += 1;
      state.spawnAcc = 0;
      state.waveBanner = 2.6;
      if (state.wave % 5 === 0 && state.wave > 0) spawnBoss();
      else if (state.wave % 3 === 0) spawnWarningSwarm();
      sfx.wave();
      updateHud();
    }
  }

  function drawBg() {
    const fever = state.fever > 0;
    const boss = bossAlive();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (boss) {
      g.addColorStop(0, "#1a0810");
      g.addColorStop(0.4, "#2a0c18");
      g.addColorStop(1, "#120818");
    } else if (fever) {
      g.addColorStop(0, "#1a0a18");
      g.addColorStop(0.45, "#2a1030");
      g.addColorStop(1, "#301018");
    } else {
      g.addColorStop(0, "#07071c");
      g.addColorStop(0.45, "#0a1430");
      g.addColorStop(1, "#12081c");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (state.bossFlash > 0) {
      ctx.fillStyle = `rgba(255, 120, 80, ${state.bossFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      const alpha = layer === 0 ? 0.55 : 0.35;
      for (const s of stars[layer]) {
        ctx.fillStyle = boss
          ? `rgba(255, 160, 140, ${alpha + 0.1})`
          : fever
            ? `rgba(255, 210, 140, ${alpha + 0.15})`
            : `rgba(200, 235, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.s * (fever || boss ? 0.7 : 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPlayer() {
    const blink = player.inv > 0 && Math.floor(player.inv / 4) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(player.x, player.y);
    if (state.barrierHits > 0 && state.mode === "play") {
      const ring = 28 + Math.sin(performance.now() / 100) * 1.5;
      ctx.strokeStyle = "rgba(110, 210, 255, 0.82)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(80, 180, 255, 0.6)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 3, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (state.charge > 0.05) {
      const cr = 20 + state.charge * 18;
      ctx.strokeStyle = `rgba(255, 200, 80, ${0.35 + state.charge * 0.5})`;
      ctx.lineWidth = 2 + state.charge * 2;
      ctx.beginPath();
      ctx.arc(0, -6, cr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowColor = isRage()
      ? "rgba(255, 80, 120, 0.95)"
      : "rgba(100, 220, 255, 0.9)";
    ctx.shadowBlur = 18;

    const wing =
      state.fever > 0
        ? "#ffcc66"
        : isRage()
          ? "#ff7799"
          : state.powerTimer > 0
            ? "#c4a8ff"
            : state.rapidTimer > 0
              ? "#ffe08a"
              : "#7ecbff";
    if (state.fever > 0) {
      ctx.shadowColor = "rgba(255, 180, 60, 0.95)";
      ctx.shadowBlur = 28;
    }
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(18, 16);
    ctx.lineTo(0, 10);
    ctx.lineTo(-18, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = state.fever > 0 ? "#fff8e0" : "#e8f8ff";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(6, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      let col = "#ff6b9d";
      let r = 14;
      if (e.type === "boss") {
        const ph = e.phase || 1;
        const pulse = 1 + Math.sin(e.t * 6) * 0.04;
        const flash = e.flash > 0 ? 0.55 : 0;
        ctx.scale(pulse, pulse);
        ctx.shadowColor = ph === 3 ? "#ffcc66" : "#ff6688";
        ctx.shadowBlur = 34 + ph * 6;

        ctx.strokeStyle = `rgba(255, 200, 120, ${0.35 + flash})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 52 + Math.sin(e.spin * 2) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 68, e.spin, e.spin + Math.PI * 1.2);
        ctx.stroke();

        ctx.fillStyle = ph === 3 ? "#3a1808" : "#2a1018";
        ctx.strokeStyle = ph === 3 ? "#ffcc66" : "#ff8866";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 42);
        ctx.lineTo(38, -8);
        ctx.lineTo(22, -40);
        ctx.lineTo(0, -52);
        ctx.lineTo(-22, -40);
        ctx.lineTo(-38, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = ph === 3 ? "#ffe08a" : "#ff6688";
        ctx.beginPath();
        ctx.arc(0, -6, 10 + Math.sin(e.t * 8) * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#ffccaa";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-48, 8);
        ctx.lineTo(-22, 0);
        ctx.moveTo(48, 8);
        ctx.lineTo(22, 0);
        ctx.stroke();

        if (e.laserWarn > 0) {
          const a = Math.min(1, e.laserWarn * 1.4);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = 0.25 + a * 0.45;
          ctx.fillStyle = "#ffe08a";
          ctx.fillRect(e.laserX - 14, e.y + 20, 28, H);
          ctx.globalAlpha = 0.7 * a;
          ctx.strokeStyle = "#fff6c8";
          ctx.lineWidth = 2;
          ctx.strokeRect(e.laserX - 14, e.y + 20, 28, H);
          ctx.restore();
          ctx.save();
          ctx.translate(e.x, e.y);
        }

        ctx.restore();
        continue;
      }
      if (e.type === "tank") {
        col = "#ff9f43";
        r = 22;
      } else if (e.type === "shooter") {
        col = "#9f8cff";
        r = 16;
      } else if (e.type === "zigzag") {
        col = "#5ce1b8";
      } else if (e.type === "dive") {
        col = e.diving ? "#ff4466" : "#ff88aa";
        r = 13;
      }
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(r * 0.9, -r * 0.4);
      ctx.lineTo(0, -r * 0.9);
      ctx.lineTo(-r * 0.9, -r * 0.4);
      ctx.closePath();
      ctx.fill();

      if (e.maxHp > 1) {
        const ratio = e.hp / e.maxHp;
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(-20, -r - 14, 40, 5);
        ctx.fillStyle = "#7efe9a";
        ctx.fillRect(-20, -r - 14, 40 * ratio, 5);
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.shadowBlur = 8;
    for (const b of bullets) {
      const rad = b.r || (b.charge ? 8 : 3.5);
      ctx.shadowColor = b.trail || b.charge ? "#ffcc66" : "#7ecbff";
      ctx.fillStyle = b.charge ? "#fff0b0" : b.trail ? "#ffe8a8" : "#d8f8ff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (b.trail || b.charge) {
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(b.x, b.y + 10 + (b.charge ? 6 : 0), rad * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const b of enemyBullets) {
      const rad = b.r || 5;
      ctx.shadowColor = b.glow || "#ff6b9d";
      ctx.fillStyle = b.col || "#ffcad8";
      ctx.beginPath();
      ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (b.boss) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rad * 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.shadowBlur = 0;
  }

  function drawGems() {
    for (const g of gems) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.shadowColor = "#ffd76a";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#ffe66a";
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawChargeBar() {
    if (state.mode !== "play" || state.charge <= 0) return;
    const w = 70;
    const x = player.x - w / 2;
    const y = player.y + 28;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = state.charge >= 1 ? "#fff0a0" : "#ffaa55";
    ctx.fillRect(x, y, w * state.charge, 5);
    if (state.charge >= 0.35) {
      ctx.fillStyle = "#ffe8b0";
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.charge >= 1 ? "MAX" : "CHARGE", player.x, y - 3);
    }
  }

  function drawPickups() {
    for (const p of pickups) {
      const pulse = 1 + Math.sin(p.t * 6) * 0.12;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pulse, pulse);
      const st =
        p.kind === "rapid"
          ? { glow: "#d4a800", stroke: "#fff3a0" }
          : p.kind === "barrier"
            ? { glow: "#3399ff", stroke: "#c4ecff" }
            : p.kind === "bomb"
              ? { glow: "#ff5588", stroke: "#ffe0ee" }
              : { glow: "#c4a8ff", stroke: "#e8d8ff" };
      ctx.shadowColor = st.glow;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (p.kind === "rapid") {
        ctx.moveTo(0, -12);
        ctx.lineTo(11, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-11, 0);
        ctx.closePath();
      } else if (p.kind === "barrier") {
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
      } else if (p.kind === "bomb") {
        ctx.moveTo(0, -11);
        ctx.lineTo(10, 5);
        ctx.lineTo(-10, 5);
        ctx.closePath();
      } else {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const x = Math.cos(a) * 12;
          const y = Math.sin(a) * 12;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function updateFloatTexts(dt) {
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i];
      f.t += dt;
      f.y -= 30 * dt;
      if (f.t >= f.life) floatTexts.splice(i, 1);
    }
  }

  function drawFloatTexts() {
    ctx.textAlign = "center";
    for (const f of floatTexts) {
      const a = 1 - f.t / f.life;
      ctx.globalAlpha = clamp(a, 0, 1) * 0.95;
      ctx.font = f.big
        ? '800 18px system-ui, "Segoe UI", sans-serif'
        : '700 14px system-ui, "Segoe UI", sans-serif';
      ctx.fillStyle = f.big ? "#ffe08a" : "#f8fcff";
      ctx.fillText(f.text, f.x, f.y);
      if (f.sub) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = "#7ecbff";
        ctx.fillText(f.sub, f.x, f.y + 15);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCallout() {
    if (state.callout <= 0 || !state.calloutText) return;
    const t = state.callout;
    const fade = Math.min(1, t * 4) * Math.min(1, t / 0.25);
    const scale = 1 + (1 - fade) * 0.15;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(W / 2, H * 0.28);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.font = '900 42px system-ui, "Segoe UI", sans-serif';
    if (W < 520) ctx.font = '900 30px system-ui, sans-serif';
    ctx.shadowColor = "rgba(255, 200, 80, 0.85)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#fff6d8";
    ctx.fillText(state.calloutText, 0, 0);
    ctx.restore();
  }

  function drawDangerVignette() {
    if (state.dangerPulse < 0.08) return;
    const a = state.dangerPulse * 0.45;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(180, 20, 50, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBossHud() {
    const boss = enemies.find((e) => e.type === "boss");
    if (!boss || state.mode !== "play") return;
    const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
    const barW = Math.min(W - 80, 520);
    const x = (W - barW) / 2;
    const y = 64;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 4, y - 18, barW + 8, 30);
    ctx.fillStyle = "#ffccaa";
    ctx.font = '700 12px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(boss.name || "BOSS", x, y - 4);
    ctx.textAlign = "right";
    ctx.fillStyle = boss.phase === 3 ? "#ffe08a" : "#ff9aa8";
    ctx.fillText(`PHASE ${boss.phase}`, x + barW, y - 4);
    ctx.fillStyle = "rgba(40,10,10,0.9)";
    ctx.fillRect(x, y, barW, 10);
    const g = ctx.createLinearGradient(x, y, x + barW, y);
    if (boss.phase === 3) {
      g.addColorStop(0, "#ff6644");
      g.addColorStop(1, "#ffe066");
    } else if (boss.phase === 2) {
      g.addColorStop(0, "#ff3366");
      g.addColorStop(1, "#ff9944");
    } else {
      g.addColorStop(0, "#cc2244");
      g.addColorStop(1, "#ff6688");
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, barW * ratio, 10);
    if (boss.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${boss.flash * 0.5})`;
      ctx.fillRect(x, y, barW * ratio, 10);
    }
  }

  function drawBossIntro() {
    if (state.bossIntro <= 0 || state.mode !== "play") return;
    const t = state.bossIntro;
    const fade = Math.min(1, t * 2) * Math.min(1, (3.4 - t) * 1.5);
    ctx.save();
    ctx.globalAlpha = 0.4 * fade;
    ctx.fillStyle = "#200810";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff8866";
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText("WARNING", W / 2, H * 0.3);
    ctx.fillStyle = "#fff0d8";
    ctx.font = W < 520 ? '900 28px system-ui, sans-serif' : '900 44px system-ui, sans-serif';
    ctx.shadowColor = "rgba(255,120,60,0.9)";
    ctx.shadowBlur = 24;
    ctx.fillText(state.bossName || "BOSS", W / 2, H * 0.3 + 48);
    ctx.shadowBlur = 0;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = "#ffccaa";
    ctx.fillText("DESTROY THE CORE", W / 2, H * 0.3 + 78);
    ctx.restore();
  }

  function drawFeverBar() {
    if (state.fever <= 0 || state.mode !== "play") return;
    const w = Math.min(220, W * 0.4);
    const x = (W - w) / 2;
    const y = 52;
    const ratio = clamp(state.fever / 8.5, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x, y, w, 8);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, "#ff8866");
    g.addColorStop(1, "#ffe066");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * ratio, 8);
    ctx.fillStyle = "#ffe8a8";
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("FEVER", W / 2, y - 4);
  }

  function drawWaveBanner() {
    if (state.waveBanner <= 0 || state.mode !== "play") return;
    const t = state.waveBanner;
    const fade = Math.min(1, t * 1.8) * Math.min(1, (2.6 - t) * 1.2);
    ctx.save();
    ctx.globalAlpha = 0.32 * fade;
    ctx.fillStyle = "#050814";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#e8f8ff";
    ctx.font = "800 44px system-ui, sans-serif";
    if (W < 520) ctx.font = "800 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(120,200,255,0.75)";
    ctx.shadowBlur = 18;
    ctx.fillText(`WAVE ${state.wave}`, W / 2, H * 0.36);
    ctx.shadowBlur = 0;
    if (state.wave % 5 === 0) {
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "#ffcc88";
      ctx.fillText("大型敵接近 — LARGE TARGET", W / 2, H * 0.36 + 40);
    }
    ctx.restore();
  }

  function drawBombFlash() {
    if (state.bombFlash <= 0) return;
    ctx.fillStyle = `rgba(255, 248, 255, ${state.bombFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPause() {
    if (!state.paused || state.mode !== "play") return;
    ctx.fillStyle = "rgba(5, 8, 20, 0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#a8f0ff";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSE", W / 2, H / 2);
  }

  let last = performance.now();
  function frame(now) {
    let dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;

    if (state.hitStop > 0) {
      state.hitStop -= dt;
      dt = 0;
    } else if (state.slowMo > 0) {
      state.slowMo -= dt;
      dt *= 0.38;
    }

    let sx = 0;
    let sy = 0;
    if (state.shake > 0.5) {
      sx = (Math.random() - 0.5) * state.shake;
      sy = (Math.random() - 0.5) * state.shake;
      state.shake *= 0.88;
    }

    updateStars(dt || 0.016 * 0.2);

    if (state.mode === "play" && !state.paused && dt > 0) {
      updatePlayer(dt);
      spawnLogic(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updatePickups(dt);
      updateGems(dt);
      collide();
      cullEnemiesBelowScreen();
      updateParticles(dt);
      updateFloatTexts(dt);
      if (state.waveBanner > 0) state.waveBanner -= dt;
      if (state.bombFlash > 0) state.bombFlash -= dt;
      if (state.bossIntro > 0) state.bossIntro -= dt;
      if (state.bossFlash > 0) state.bossFlash -= dt;
    } else if (state.mode === "menu") {
      updatePlayer(dt || 0.016);
    } else if (state.mode === "play" && !state.paused && dt === 0) {
      if (state.callout > 0) state.callout -= 0.016;
    }

    const zoom = 1 + state.zoomPulse * 0.12;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    drawBg();
    drawEnemies();
    drawBullets();
    drawGems();
    drawPickups();
    drawParticles();
    drawPlayer();
    drawChargeBar();
    drawFloatTexts();
    ctx.restore();

    drawDangerVignette();
    drawFeverBar();
    drawBossHud();
    drawCallout();
    drawBossIntro();
    drawWaveBanner();
    drawBombFlash();
    drawPause();

    bgm.sync(state.mode, state.fever > 0, bossAlive(), state.paused);

    requestAnimationFrame(frame);
  }

  function setPointer(clientX, clientY, active) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * W;
    pointer.y = ((clientY - rect.top) / rect.height) * H;
    pointer.active = active;
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (state.mode !== "play") return;
    canvas.setPointerCapture(ev.pointerId);
    setPointer(ev.clientX, ev.clientY, true);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!pointer.active) return;
    setPointer(ev.clientX, ev.clientY, true);
  });
  canvas.addEventListener("pointerup", () => {
    pointer.active = false;
  });
  canvas.addEventListener("pointercancel", () => {
    pointer.active = false;
  });

  window.addEventListener("keydown", (ev) => {
    keys[ev.key] = true;
    if (ev.key === "Shift") ev.preventDefault();
    if ((ev.key === "m" || ev.key === "M") && !ev.repeat) {
      unlockAudio();
      const muted = bgm.toggleMute();
      if (muteBtn) muteBtn.textContent = muted ? "BGM: OFF" : "BGM: ON";
    }
    if ((ev.key === "b" || ev.key === "B") && !ev.repeat) {
      if (state.mode === "play" && !state.paused) useBomb();
    }
    if (ev.key === "p" || ev.key === "P") {
      if (state.mode === "play") {
        state.paused = !state.paused;
      }
    }
    if (ev.key === "r" || ev.key === "R") {
      if (state.mode === "over") {
        unlockAudio();
        overlay.classList.add("hidden");
        resetGame();
        state.mode = "play";
        bgm.setTrack("play");
        titleEl.textContent = "NEON DRIFT";
        subtitleEl.textContent = "WASD / タッチ移動 · Shift長押しでチャージ · B ボム";
      }
    }
  });

  window.addEventListener("keyup", (ev) => {
    keys[ev.key] = false;
  });

  function unlockAudio() {
    sfx.unlock();
    bgm.unlock();
  }

  function startGame(ev) {
    if (ev) ev.preventDefault();
    unlockAudio();
    overlay.classList.add("hidden");
    resetGame();
    state.mode = "play";
    bgm.setTrack("play");
  }

  function updateMuteLabel() {
    if (muteBtn) muteBtn.textContent = bgm.isMuted() ? "BGM: OFF" : "BGM: ON";
  }

  if (muteBtn) {
    muteBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      unlockAudio();
      bgm.toggleMute();
      updateMuteLabel();
    });
  }

  startBtn.addEventListener("click", startGame);
  startBtn.addEventListener(
    "touchend",
    (ev) => {
      startGame(ev);
    },
    { passive: false }
  );

  window.addEventListener(
    "pointerdown",
    () => {
      unlockAudio();
      if (state.mode === "menu") bgm.setTrack("menu");
    },
    { once: true }
  );

  window.addEventListener("resize", resize);
  resize();
  hiScoreEl.textContent = `HI ${highScore.toLocaleString("ja-JP")}`;
  updateMuteLabel();
  requestAnimationFrame(frame);
})();
