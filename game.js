(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const learnBtn = document.getElementById("learnBtn");
  const learnBanner = document.getElementById("learnBanner");
  const learnTextEl = document.getElementById("learnText");
  const learnExitBtn = document.getElementById("learnExitBtn");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const waveEl = document.getElementById("wave");
  const chainEl = document.getElementById("chain");
  const bombsEl = document.getElementById("bombs");
  const hiScoreEl = document.getElementById("hiscore");

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
    learnStep: 0,
    learnFree: false,
    learnMoveHeld: 0,
    learnShots: 0,
    learnBombDone: false,
    learnPauseArmed: false,
    learnPauseDone: false,
  };

  const learnSteps = [
    { text: "矢印キー / WASD で自機を動かしてみよう", check: () => state.learnMoveHeld > 1.1 },
    { text: "Space (または Z) でショットを撃ってみよう", check: () => state.learnShots >= 6 },
    { text: "B でボムを発動してみよう", check: () => state.learnBombDone },
    { text: "P でポーズ / 再開してみよう", check: () => state.learnPauseDone },
    { text: "よくできた! ここからは自由に練習しよう — 敵が出現するよ", enterFree: true },
  ];

  const player = {
    x: 0,
    y: 0,
    w: 28,
    h: 36,
    speed: 420,
    shootCd: 0,
    inv: 0,
  };

  const stars = [[], []];
  let bullets = [];
  let enemies = [];
  let enemyBullets = [];
  let particles = [];
  let pickups = [];
  let floatTexts = [];

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
      shoot()    { go(t => tone(820, "square",   t, 0.04, 0.055, 360)); },
      hit()      { go(t => tone(160, "sawtooth", t, 0.18, 0.28,  55)); },
      pickup()   { go(t => [660, 880, 1100].forEach((f, i) => tone(f, "sine", t + i * 0.07, 0.08, 0.14))); },
      wave()     { go(t => [440, 550, 660].forEach((f, i) => tone(f, "sine", t + i * 0.1, 0.1, 0.14))); },
      gameOver() { go(t => [440, 330, 220].forEach((f, i) => tone(f, "sawtooth", t + i * 0.15, 0.18, 0.18))); },
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
    updateHud();
  }

  function checkLearnStep() {
    if (state.learnFree) return;
    const step = learnSteps[state.learnStep];
    if (step && step.check && step.check()) learnAdvance();
  }

  function learnAdvance() {
    state.learnStep += 1;
    const step = learnSteps[state.learnStep];
    if (!step) return;
    if (step.enterFree) {
      state.learnFree = true;
      state.spawnAcc = 0;
    }
    learnTextEl.textContent = step.text;
  }

  function learnSpawnLogic(dt) {
    state.spawnAcc += dt;
    const interval = 1.1;
    while (state.spawnAcc >= interval) {
      state.spawnAcc -= interval;
      spawnEnemy();
    }
  }

  function startLearn(ev) {
    if (ev) ev.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    overlay.classList.add("hidden");
    resetGame();
    state.mode = "learn";
    state.learnStep = 0;
    state.learnFree = false;
    state.learnMoveHeld = 0;
    state.learnShots = 0;
    state.learnBombDone = false;
    state.learnPauseArmed = false;
    state.learnPauseDone = false;
    learnBanner.classList.remove("hidden");
    learnTextEl.textContent = learnSteps[0].text;
  }

  function returnToMenu() {
    state.mode = "menu";
    state.learnFree = false;
    learnBanner.classList.add("hidden");
    bullets = [];
    enemies = [];
    enemyBullets = [];
    particles = [];
    pickups = [];
    floatTexts = [];
    titleEl.textContent = "NEON DRIFT";
    subtitleEl.textContent = "矢印 / WASD で移動 · Space でショット · B でボム";
    overlay.classList.remove("hidden");
    resize();
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

  function registerKill(e, fromBomb) {
    if (!fromBomb) {
      state.comboTime = 1.45;
      state.comboChain += 1;
    } else {
      state.comboChain = 0;
      state.comboTime = 0;
    }
    const mult = fromBomb ? 1 : comboMultiplier();
    let base = 100 + state.wave * 15;
    if (e.type === "tank") base += 80;
    else if (e.type === "shooter") base += 50;
    else if (e.type === "boss") base += 420 + state.wave * 45;
    const pts = Math.floor(base * mult);
    state.score += pts;
    const isBoss = e.type === "boss";
    spawnParticles(e.x, e.y, isBoss ? 42 : e.type === "tank" ? 32 : 22, isBoss ? "#ffcc66" : "#ffb4d4", 1);
    if (!fromBomb) sfx.explode(isBoss);
    const pickupChance = fromBomb ? 0.055 : 0.085 + state.wave * 0.005;
    if (Math.random() < pickupChance) spawnPickupAt(e.x, e.y);
    const sub = !fromBomb && mult > 1 ? `x${mult}` : "";
    floatTexts.push({ x: e.x, y: e.y - 28, life: 0.85, t: 0, text: `+${pts}`, sub });
    updateHud();
  }

  function useBomb() {
    if (state.bombs <= 0 || (state.mode !== "play" && state.mode !== "learn") || state.paused) return;
    state.bombs -= 1;
    enemyBullets.length = 0;
    state.bombFlash = 0.34;
    player.inv = Math.max(player.inv, 55);
    addShake(18);
    sfx.bomb();
    spawnParticles(player.x, player.y - 30, 36, "#fdf8ff", 1.4);
    state.comboChain = 0;
    state.comboTime = 0;
    if (state.mode === "learn") state.learnBombDone = true;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.type === "boss") {
        e.hp -= 12 + Math.floor(state.wave / 2);
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
    if (state.mode === "learn") state.learnShots += 1;
    const spread = state.powerTimer > 0 ? 3 : 1;
    const baseDamage = state.powerTimer > 0 ? 1.2 : 1;
    if (spread === 1) {
      bullets.push({ x: player.x, y: player.y - 20, vy: -460, dmg: baseDamage });
    } else {
      for (let i = -1; i <= 1; i++) {
        bullets.push({
          x: player.x + i * 10,
          y: player.y - 18,
          vy: -440,
          vx: i * 38,
          dmg: baseDamage * 0.85,
        });
      }
    }
  }

  function spawnEnemy() {
    const margin = 40;
    const x = rand(margin, W - margin);
    const roll = Math.random();
    const w = state.wave;

    let type = "grunt";
    if (roll < 0.22 + w * 0.01) type = "zigzag";
    else if (roll < 0.38 + w * 0.015) type = "tank";
    else if (roll < 0.52 + w * 0.02) type = "shooter";

    const baseHp = 1 + (type === "tank" ? 3 + Math.floor(w / 3) : 0) + (type === "shooter" ? 1 : 0);
    enemies.push({
      type,
      x,
      y: -40,
      hp: baseHp,
      maxHp: baseHp,
      t: 0,
      shootCd: rand(0.4, 1.2),
      phase: rand(0, Math.PI * 2),
    });
  }

  function spawnBoss() {
    if (enemies.some((e) => e.type === "boss")) return;
    const w = state.wave;
    const hp = 30 + w * 9;
    enemies.push({
      type: "boss",
      x: W * 0.5,
      y: -120,
      hp,
      maxHp: hp,
      t: 0,
      shootCd: 1.6,
      phase: 0,
    });
  }

  function hurtPlayer() {
    if (player.inv > 0 || (state.mode !== "play" && state.mode !== "learn")) return;
    if (state.mode === "learn") {
      player.inv = 60;
      addShake(6);
      spawnParticles(player.x, player.y, 14, "#88ddff", 0.8);
      sfx.hit();
      return;
    }
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
        return 17;
      case "tank":
        return 14;
      case "shooter":
        return 9;
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
    for (let layer = 0; layer < 2; layer++) {
      const list = stars[layer];
      for (const s of list) {
        s.y += s.sp * dt;
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
    if (mx || my) {
      const len = Math.hypot(mx, my) || 1;
      mx /= len;
      my /= len;
    }
    player.x = clamp(player.x + mx * player.speed * dt, player.w, W - player.w);
    player.y = clamp(player.y + my * player.speed * dt, H * 0.35, H - player.h);

    if (player.inv > 0) player.inv -= 1;

    if (state.mode === "learn" && (mx || my)) state.learnMoveHeld += dt;

    const wantShoot = keys[" "] || keys.Space || keys.z || keys.Z;
    if ((state.mode === "play" || state.mode === "learn") && wantShoot) {
      player.shootCd -= dt;
      if (player.shootCd <= 0) {
        firePlayer();
        let cd = state.powerTimer > 0 ? 0.09 : 0.11;
        if (state.rapidTimer > 0) cd *= 0.5;
        player.shootCd = cd;
      }
    } else {
      player.shootCd = 0;
    }

    if (state.powerTimer > 0) state.powerTimer -= dt;
    if (state.rapidTimer > 0) state.rapidTimer -= dt;

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
        e.x += Math.sin(e.t * 1.05 + e.phase) * 95 * dt;
        e.x = clamp(e.x, 70, W - 70);
        e.y += sp;
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          const n = 15;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + e.t * 0.35;
            enemyBullets.push({
              x: e.x,
              y: e.y + 28,
              vx: Math.cos(a) * 175,
              vy: Math.sin(a) * 175 + 95,
            });
          }
          e.shootCd = clamp(2.35 - state.wave * 0.055, 1.15, 2.35);
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
        if (circlesOverlap(b.x, b.y, 3, e.x, e.y, er)) {
          e.hp -= b.dmg || 1;
          hit = true;
          spawnParticles(b.x, b.y, 4, "#7ecbff", 0.5);
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
      const er = e.type === "boss" ? 38 : e.type === "tank" ? 24 : 18;
      if (player.inv <= 0 && rectCircle(player.x, player.y, player.w * 0.7, player.h * 0.7, e.x, e.y, er)) {
        hurtPlayer();
        break;
      }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (player.inv <= 0 && rectCircle(player.x, player.y, player.w * 0.65, player.h * 0.65, b.x, b.y, 6)) {
        enemyBullets.splice(i, 1);
        hurtPlayer();
      }
    }
  }

  function bossAlive() {
    return enemies.some((e) => e.type === "boss");
  }

  function spawnLogic(dt) {
    state.waveTimer += dt;
    const interval = clamp(0.95 - state.wave * 0.04, 0.28, 0.95);
    state.spawnAcc += dt;
    if (!bossAlive()) {
      while (state.spawnAcc >= interval) {
        state.spawnAcc -= interval;
        spawnEnemy();
      }
    }
    if (state.waveTimer > 24 + state.wave * 2) {
      state.waveTimer = 0;
      state.wave += 1;
      state.spawnAcc = 0;
      state.waveBanner = 2.6;
      if (state.wave % 5 === 0 && state.wave > 0) spawnBoss();
      sfx.wave();
      updateHud();
    }
  }

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07071c");
    g.addColorStop(0.45, "#0a1430");
    g.addColorStop(1, "#12081c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      const alpha = layer === 0 ? 0.55 : 0.35;
      for (const s of stars[layer]) {
        ctx.fillStyle = `rgba(200, 235, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.s * 0.5, 0, Math.PI * 2);
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
    ctx.shadowColor = "rgba(100, 220, 255, 0.9)";
    ctx.shadowBlur = 18;

    const wing =
      state.powerTimer > 0 ? "#c4a8ff" : state.rapidTimer > 0 ? "#ffe08a" : "#7ecbff";
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(18, 16);
    ctx.lineTo(0, 10);
    ctx.lineTo(-18, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e8f8ff";
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
        col = "#ffaa44";
        r = 36;
        ctx.shadowColor = "#ffdd99";
        ctx.shadowBlur = 26;
        ctx.fillStyle = "#2a1018";
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, r);
        ctx.lineTo(r * 0.88, -r * 0.42);
        ctx.lineTo(0, -r * 0.92);
        ctx.lineTo(-r * 0.88, -r * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const ratio = e.hp / e.maxHp;
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(-48, -r - 22, 96, 7);
        ctx.fillStyle = "#ff9966";
        ctx.fillRect(-48, -r - 22, 96 * ratio, 7);
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
      ctx.shadowColor = "#7ecbff";
      ctx.fillStyle = "#d8f8ff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of enemyBullets) {
      ctx.shadowColor = "#ff6b9d";
      ctx.fillStyle = "#ffcad8";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
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
      ctx.font = '700 14px system-ui, "Segoe UI", sans-serif';
      ctx.fillStyle = "#f8fcff";
      ctx.fillText(f.text, f.x, f.y);
      if (f.sub) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = "#7ecbff";
        ctx.fillText(f.sub, f.x, f.y + 15);
      }
    }
    ctx.globalAlpha = 1;
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
    if (!state.paused || (state.mode !== "play" && state.mode !== "learn")) return;
    ctx.fillStyle = "rgba(5, 8, 20, 0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#a8f0ff";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSE", W / 2, H / 2);
  }

  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;

    let sx = 0;
    let sy = 0;
    if (state.shake > 0.5) {
      sx = (Math.random() - 0.5) * state.shake;
      sy = (Math.random() - 0.5) * state.shake;
      state.shake *= 0.88;
    }

    updateStars(dt);

    if (state.mode === "play" && !state.paused) {
      updatePlayer(dt);
      spawnLogic(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updatePickups(dt);
      collide();
      cullEnemiesBelowScreen();
      updateParticles(dt);
      updateFloatTexts(dt);
      if (state.waveBanner > 0) state.waveBanner -= dt;
      if (state.bombFlash > 0) state.bombFlash -= dt;
    } else if (state.mode === "learn" && !state.paused) {
      updatePlayer(dt);
      if (state.learnFree) learnSpawnLogic(dt);
      updateEnemies(dt);
      updateBullets(dt);
      collide();
      cullEnemiesBelowScreen();
      updateParticles(dt);
      updateFloatTexts(dt);
      if (state.bombFlash > 0) state.bombFlash -= dt;
      checkLearnStep();
    } else if (state.mode === "menu") {
      updatePlayer(dt);
    }

    ctx.save();
    ctx.translate(sx, sy);
    drawBg();
    drawEnemies();
    drawBullets();
    drawPickups();
    drawParticles();
    drawPlayer();
    drawFloatTexts();
    ctx.restore();

    drawWaveBanner();
    drawBombFlash();
    drawPause();

    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (ev) => {
    keys[ev.key] = true;
    if ((ev.key === "b" || ev.key === "B") && !ev.repeat) {
      if ((state.mode === "play" || state.mode === "learn") && !state.paused) useBomb();
    }
    if (ev.key === "p" || ev.key === "P") {
      if (state.mode === "play" || state.mode === "learn") {
        state.paused = !state.paused;
        if (state.mode === "learn") {
          if (state.paused) state.learnPauseArmed = true;
          else if (state.learnPauseArmed) state.learnPauseDone = true;
        }
      }
    }
    if (ev.key === "Escape") {
      if (state.mode === "learn") returnToMenu();
    }
    if (ev.key === "r" || ev.key === "R") {
      if (state.mode === "over") {
        overlay.classList.add("hidden");
        resetGame();
        state.mode = "play";
        titleEl.textContent = "NEON DRIFT";
        subtitleEl.textContent = "矢印 / WASD · Space · B ボム";
      }
    }
  });

  window.addEventListener("keyup", (ev) => {
    keys[ev.key] = false;
  });

  function startGame(ev) {
    if (ev) ev.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    overlay.classList.add("hidden");
    resetGame();
    state.mode = "play";
  }

  startBtn.addEventListener("click", startGame);
  startBtn.addEventListener(
    "touchend",
    (ev) => {
      startGame(ev);
    },
    { passive: false }
  );

  learnBtn.addEventListener("click", startLearn);
  learnBtn.addEventListener(
    "touchend",
    (ev) => {
      startLearn(ev);
    },
    { passive: false }
  );

  learnExitBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    returnToMenu();
  });

  window.addEventListener("resize", resize);
  resize();
  hiScoreEl.textContent = `HI ${highScore.toLocaleString("ja-JP")}`;
  requestAnimationFrame(frame);
})();
