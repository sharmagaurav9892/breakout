/* =====================================================================
 * Breakout
 * ←→ / A D moves paddle, SPACE launches / pauses, R restarts.
 * ===================================================================== */

(() => {
  "use strict";

  // -------------------- Config --------------------
  const LOGICAL_W = 600;
  const LOGICAL_H = 720;

  const PADDLE_W = 90;
  const PADDLE_H = 14;
  const PADDLE_Y = LOGICAL_H - 46;
  const PADDLE_SPEED = 520;  // px/sec

  const BALL_R = 10;
  const BALL_BASE_SPEED = 320;     // px/sec at level 1
  const BALL_SPEED_PER_LEVEL = 30; // px/sec added per level

  const BRICK_ROWS = 6;
  const BRICK_COLS = 9;
  const BRICK_TOP = 64;
  const BRICK_GAP = 4;
  const BRICK_H = 22;
  const BRICK_SIDE_PAD = 32;
  const BRICK_W = (LOGICAL_W - BRICK_SIDE_PAD * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;

  const ROW_INFO = [
    { color: "#e5484d", soft: "rgba(229, 72, 77, 0.35)",   points: 7, pitch: 880 },
    { color: "#ff9f43", soft: "rgba(255, 159, 67, 0.35)",  points: 6, pitch: 784 },
    { color: "#f0b429", soft: "rgba(240, 180, 41, 0.35)",  points: 5, pitch: 698 },
    { color: "#22c997", soft: "rgba(34, 201, 151, 0.35)",  points: 4, pitch: 622 },
    { color: "#22c1c9", soft: "rgba(34, 193, 201, 0.35)",  points: 3, pitch: 554 },
    { color: "#4cb1ff", soft: "rgba(76, 177, 255, 0.35)",  points: 2, pitch: 494 },
  ];

  const MAX_LEADERS = 3;

  const LS_KEYS = {
    name: "breakout.player",
    leaderboard: "breakout.leaderboard",
  };

  // -------------------- DOM --------------------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const els = {
    scoreValue: document.getElementById("scoreValue"),
    livesValue: document.getElementById("livesValue"),
    levelValue: document.getElementById("levelValue"),
    playerName: document.getElementById("playerName"),
    changePlayerBtn: document.getElementById("changePlayerBtn"),

    overlayStart:  document.getElementById("overlayStart"),
    overlayPaused: document.getElementById("overlayPaused"),
    overlayOver:   document.getElementById("overlayOver"),
    overScore: document.getElementById("overScore"),
    overBest:  document.getElementById("overBest"),
    overTitle: document.getElementById("overTitle"),
    overMsg:   document.getElementById("overMsg"),
    playAgainBtn: document.getElementById("playAgainBtn"),

    leaderboardList: document.getElementById("leaderboardList"),
    resetScoresBtn: document.getElementById("resetScoresBtn"),

    nameModal: document.getElementById("nameModal"),
    nameForm:  document.getElementById("nameForm"),
    nameInput: document.getElementById("nameInput"),
    nameCancelBtn: document.getElementById("nameCancelBtn"),

    touchPause: document.getElementById("touchPause"),
    touchLeft:  document.getElementById("touchLeft"),
    touchRight: document.getElementById("touchRight"),
  };

  const PLAY_ICON  = "\u25B6";
  const PAUSE_ICON = "\u275A\u275A";

  // -------------------- State --------------------
  /** @typedef {"idle"|"playing"|"paused"|"over"} GameState */

  const state = {
    /** @type {GameState} */
    status: "idle",
    paddle: { x: LOGICAL_W / 2 - PADDLE_W / 2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H },
    ball: { x: LOGICAL_W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true },
    bricks: /** @type {{x:number,y:number,row:number,col:number,alive:boolean}[]} */ ([]),
    bricksLeft: 0,
    score: 0,
    lives: 3,
    level: 1,
    keysHeld: new Set(),
    touchDir: 0,
    lastFrame: 0,
    particles: /** @type {Particle[]} */ ([]),
    shake: 0,
    player: "",
    leaders: /** @type {{name:string, score:number, at:number}[]} */ ([]),
  };

  /** @typedef {{x:number,y:number,vx:number,vy:number,life:number,maxLife:number,size:number,color:string}} Particle */

  // -------------------- Audio --------------------
  /** @type {AudioContext|null} */
  let audio = null;
  function ensureAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audio = null; }
    }
    if (audio && audio.state === "suspended") audio.resume();
  }
  function beep(freq = 660, dur = 0.08, type = "triangle", gain = 0.04) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const sfx = {
    paddleHit() { beep(420, 0.06, "square", 0.05); },
    brickHit(row) {
      const pitch = ROW_INFO[row] ? ROW_INFO[row].pitch : 660;
      beep(pitch, 0.07, "triangle", 0.05);
    },
    wallHit()   { beep(220, 0.04, "square", 0.035); },
    lifeLost()  { beep(330, 0.16, "sawtooth", 0.06); setTimeout(() => beep(180, 0.2, "sawtooth", 0.06), 100); },
    levelClear(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.1), i * 90)); },
    pause()     { beep(440, 0.05); },
    resume()    { beep(660, 0.05); },
    launch()    { beep(523, 0.07); setTimeout(() => beep(784, 0.09), 70); },
    gameOver()  {
      beep(330, 0.18, "sawtooth", 0.06);
      setTimeout(() => beep(247, 0.2, "sawtooth", 0.06), 140);
      setTimeout(() => beep(165, 0.28, "sawtooth", 0.06), 300);
    },
  };

  // -------------------- Storage --------------------
  function loadPlayer() {
    try { return localStorage.getItem(LS_KEYS.name) || ""; }
    catch (_) { return ""; }
  }
  function savePlayer(name) {
    try { localStorage.setItem(LS_KEYS.name, name); } catch (_) {}
  }
  function loadLeadersLocal() {
    try {
      const raw = localStorage.getItem(LS_KEYS.leaderboard);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(e => e && typeof e.score === "number" && typeof e.name === "string")
        .slice(0, MAX_LEADERS);
    } catch (_) { return []; }
  }
  function saveLeadersLocal(list) {
    try { localStorage.setItem(LS_KEYS.leaderboard, JSON.stringify(list.slice(0, MAX_LEADERS))); }
    catch (_) {}
  }
  function setLeaders(list) {
    state.leaders = (list || []).slice(0, MAX_LEADERS);
    saveLeadersLocal(state.leaders);
    renderLeaderboard();
    updateHud();
  }

  // -------------------- Bricks --------------------
  function buildBricks() {
    const bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        bricks.push({
          x: BRICK_SIDE_PAD + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          row: r,
          col: c,
          alive: true,
        });
      }
    }
    state.bricks = bricks;
    state.bricksLeft = bricks.length;
  }

  // -------------------- Lifecycle --------------------
  function ballSpeedForLevel(level) {
    return BALL_BASE_SPEED + (level - 1) * BALL_SPEED_PER_LEVEL;
  }

  function resetBallOnPaddle() {
    state.ball.stuck = true;
    state.ball.x = state.paddle.x + state.paddle.w / 2;
    state.ball.y = state.paddle.y - BALL_R - 1;
    state.ball.vx = 0;
    state.ball.vy = 0;
    updateTouchPauseIcon();
  }

  function launchBall() {
    const speed = ballSpeedForLevel(state.level);
    const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3); // mostly upward, slight angle
    state.ball.vx = Math.cos(angle) * speed;
    state.ball.vy = Math.sin(angle) * speed;
    state.ball.stuck = false;
    sfx.launch();
    updateTouchPauseIcon();
  }

  function resetGame() {
    state.paddle.x = LOGICAL_W / 2 - PADDLE_W / 2;
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.particles.length = 0;
    state.shake = 0;
    buildBricks();
    resetBallOnPaddle();
    updateHud();
  }

  function nextLevel() {
    state.level += 1;
    state.paddle.x = LOGICAL_W / 2 - PADDLE_W / 2;
    state.particles.length = 0;
    buildBricks();
    resetBallOnPaddle();
    sfx.levelClear();
    updateHud();
  }

  function startGame() {
    if (state.status === "playing") return;
    if (state.status === "over" || state.status === "idle") resetGame();
    state.status = "playing";
    hideAllOverlays();
    updateTouchPauseIcon();
  }

  function pauseGame() {
    if (state.status !== "playing") return;
    state.status = "paused";
    showOverlay("paused");
    sfx.pause();
    updateTouchPauseIcon();
  }

  function resumeGame() {
    if (state.status !== "paused") return;
    state.status = "playing";
    hideOverlay("paused");
    sfx.resume();
    updateTouchPauseIcon();
  }

  function endGame() {
    state.status = "over";
    state.shake = 360;
    sfx.gameOver();
    updateTouchPauseIcon();

    const topBefore = getTopScore();
    submitToLeaderboard(state.player, state.score);
    const topAfter = getTopScore();
    const isHigh = state.score > 0 && topAfter > topBefore && topAfter === state.score;

    els.overScore.textContent = String(state.score);
    els.overBest.textContent  = String(topAfter);
    els.overTitle.textContent = pickGameOverTitle(state.score, isHigh);
    els.overMsg.innerHTML = isHigh
      ? `New high score! Press <span class="kbd">Space</span> or <span class="kbd">R</span> to play again.`
      : `Press <span class="kbd">Space</span> or <span class="kbd">R</span> to play again.`;
    showOverlay("over");
    updateHud();
    renderLeaderboard();
  }

  function pickGameOverTitle(score, isHigh) {
    if (isHigh)        return "New high score!";
    if (score === 0)   return "Out before launch.";
    if (score < 30)    return "Just warming up.";
    if (score < 100)   return "Nice volley.";
    if (score < 250)   return "Brick crusher!";
    if (score < 500)   return "Wall demolisher.";
    return "Legendary breaker.";
  }

  function togglePause() {
    if (state.status === "idle" || state.status === "over") {
      startGame();
    } else if (state.status === "playing") {
      // Special case: if ball is stuck, Space should launch instead of pause
      if (state.ball.stuck) {
        launchBall();
      } else {
        pauseGame();
      }
    } else if (state.status === "paused") {
      resumeGame();
    }
  }

  // -------------------- Update --------------------
  function update(dt) {
    if (state.status !== "playing") return;

    // Paddle movement
    let dir = 0;
    if (state.keysHeld.has("left"))  dir -= 1;
    if (state.keysHeld.has("right")) dir += 1;
    dir += state.touchDir;
    if (dir < -1) dir = -1; else if (dir > 1) dir = 1;

    state.paddle.x += dir * PADDLE_SPEED * dt;
    if (state.paddle.x < 0) state.paddle.x = 0;
    if (state.paddle.x + state.paddle.w > LOGICAL_W) {
      state.paddle.x = LOGICAL_W - state.paddle.w;
    }

    // Ball motion
    if (state.ball.stuck) {
      state.ball.x = state.paddle.x + state.paddle.w / 2;
      state.ball.y = state.paddle.y - BALL_R - 1;
      return;
    }

    state.ball.x += state.ball.vx * dt;
    state.ball.y += state.ball.vy * dt;

    // Wall collisions
    if (state.ball.x - BALL_R < 0) {
      state.ball.x = BALL_R;
      state.ball.vx = Math.abs(state.ball.vx);
      sfx.wallHit();
    } else if (state.ball.x + BALL_R > LOGICAL_W) {
      state.ball.x = LOGICAL_W - BALL_R;
      state.ball.vx = -Math.abs(state.ball.vx);
      sfx.wallHit();
    }
    if (state.ball.y - BALL_R < 0) {
      state.ball.y = BALL_R;
      state.ball.vy = Math.abs(state.ball.vy);
      sfx.wallHit();
    }

    // Paddle collision
    const p = state.paddle;
    if (
      state.ball.vy > 0 &&
      state.ball.y + BALL_R >= p.y &&
      state.ball.y - BALL_R <= p.y + p.h &&
      state.ball.x >= p.x - BALL_R &&
      state.ball.x <= p.x + p.w + BALL_R
    ) {
      state.ball.y = p.y - BALL_R;
      const hit = (state.ball.x - (p.x + p.w / 2)) / (p.w / 2); // -1..1
      const clamped = Math.max(-1, Math.min(1, hit));
      const angle = clamped * (Math.PI / 3); // up to ±60°
      const speed = Math.hypot(state.ball.vx, state.ball.vy);
      state.ball.vx = Math.sin(angle) * speed;
      state.ball.vy = -Math.cos(angle) * speed;
      sfx.paddleHit();
    }

    // Brick collisions
    for (const b of state.bricks) {
      if (!b.alive) continue;
      const closestX = Math.max(b.x, Math.min(state.ball.x, b.x + BRICK_W));
      const closestY = Math.max(b.y, Math.min(state.ball.y, b.y + BRICK_H));
      const dx = state.ball.x - closestX;
      const dy = state.ball.y - closestY;
      if (dx * dx + dy * dy <= BALL_R * BALL_R) {
        b.alive = false;
        state.bricksLeft -= 1;
        state.score += ROW_INFO[b.row].points;
        sfx.brickHit(b.row);
        spawnParticles(b.x + BRICK_W / 2, b.y + BRICK_H / 2, ROW_INFO[b.row].color);
        bumpStat(els.scoreValue.parentElement);
        updateHud();

        // Resolve bounce: decide axis to reflect based on overlap geometry
        const overlapLeft   = (b.x + BRICK_W) - (state.ball.x - BALL_R);
        const overlapRight  = (state.ball.x + BALL_R) - b.x;
        const overlapTop    = (b.y + BRICK_H) - (state.ball.y - BALL_R);
        const overlapBottom = (state.ball.y + BALL_R) - b.y;
        const minX = Math.min(overlapLeft, overlapRight);
        const minY = Math.min(overlapTop, overlapBottom);
        if (minX < minY) {
          state.ball.vx = -state.ball.vx;
        } else {
          state.ball.vy = -state.ball.vy;
        }
        break; // resolve one brick per frame
      }
    }

    // Ball off bottom
    if (state.ball.y - BALL_R > LOGICAL_H) {
      state.lives -= 1;
      sfx.lifeLost();
      state.shake = 200;
      updateHud();
      if (state.lives <= 0) {
        endGame();
        return;
      }
      resetBallOnPaddle();
    }

    // Cleared all bricks?
    if (state.bricksLeft <= 0) {
      nextLevel();
    }
  }

  function bumpStat(node) {
    if (!node) return;
    node.classList.remove("stat--bump");
    void node.offsetWidth;
    node.classList.add("stat--bump");
  }

  // -------------------- Particles --------------------
  function spawnParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 120; // px/sec
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: 360 + Math.random() * 220,
        size: 2 + Math.random() * 2,
        color,
      });
    }
  }
  function updateParticles(dt) {
    const dtSec = dt / 1000;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life += dt;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.vy += 90 * dtSec; // gravity
      if (p.life >= p.maxLife) state.particles.splice(i, 1);
    }
  }

  // -------------------- Render --------------------
  function draw() {
    const sx = canvas.width / LOGICAL_W;
    ctx.setTransform(sx, 0, 0, sx, 0, 0);

    let ox = 0, oy = 0;
    if (state.shake > 0) {
      const mag = Math.min(6, state.shake / 60);
      ox = (Math.random() - 0.5) * mag;
      oy = (Math.random() - 0.5) * mag;
    }
    ctx.save();
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.translate(ox, oy);

    // Background
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Subtle starfield
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < 30; i++) {
      const x = (i * 137 + 23) % LOGICAL_W;
      const y = (i * 89 + 47) % LOGICAL_H;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    drawBricks();
    drawParticles();
    drawPaddle();
    drawBall();

    ctx.restore();
  }

  function drawBricks() {
    for (const b of state.bricks) {
      if (!b.alive) continue;
      const info = ROW_INFO[b.row];
      ctx.fillStyle = info.color;
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
      // Top highlight
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(b.x, b.y, BRICK_W, 2);
      // Bottom shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(b.x, b.y + BRICK_H - 2, BRICK_W, 2);
    }
  }

  function drawPaddle() {
    const p = state.paddle;
    // Soft glow
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    grad.addColorStop(0, "#54e6b8");
    grad.addColorStop(1, "#10805f");
    ctx.fillStyle = grad;
    roundRect(p.x, p.y, p.w, p.h, 6);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(p.x + 2, p.y + 2, p.w - 4, 3, 3);
    ctx.fill();
  }

  function drawBall() {
    const b = state.ball;
    // Glow
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, BALL_R * 2.2);
    grad.addColorStop(0, "rgba(34, 201, 151, 0.45)");
    grad.addColorStop(1, "rgba(34, 201, 151, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2bd9a6";
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(b.x - BALL_R * 0.35, b.y - BALL_R * 0.35, BALL_R * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const k = 1 - p.life / p.maxLife;
      if (k <= 0) continue;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  // -------------------- Loop --------------------
  function loop(now) {
    let dt = now - state.lastFrame;
    state.lastFrame = now;
    if (dt > 100) dt = 100; // clamp on tab return

    update(dt / 1000);
    updateParticles(dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    draw();
    requestAnimationFrame(loop);
  }

  // -------------------- HUD --------------------
  function updateHud() {
    els.scoreValue.textContent = String(state.score);
    els.livesValue.textContent = String(state.lives);
    els.levelValue.textContent = String(state.level);
    els.playerName.textContent = state.player || "Guest";
  }
  function getTopScore() {
    return state.leaders.length ? state.leaders[0].score : 0;
  }
  function showOverlay(which) {
    if (which === "start")  els.overlayStart.classList.remove("hidden");
    if (which === "paused") els.overlayPaused.classList.remove("hidden");
    if (which === "over")   els.overlayOver.classList.remove("hidden");
  }
  function hideOverlay(which) {
    if (which === "start")  els.overlayStart.classList.add("hidden");
    if (which === "paused") els.overlayPaused.classList.add("hidden");
    if (which === "over")   els.overlayOver.classList.add("hidden");
  }
  function hideAllOverlays() {
    hideOverlay("start"); hideOverlay("paused"); hideOverlay("over");
  }

  function updateTouchPauseIcon() {
    if (!els.touchPause) return;
    const launching = state.status === "playing" && state.ball.stuck;
    const playing   = state.status === "playing" && !state.ball.stuck;
    els.touchPause.textContent = playing ? PAUSE_ICON : PLAY_ICON;
    els.touchPause.setAttribute("aria-label", launching ? "Launch" : (playing ? "Pause" : "Play"));
  }

  // -------------------- Touch --------------------
  function bindTouchControls() {
    const setDir = (dir) => { state.touchDir = dir; };
    const bindHold = (btn, dir) => {
      if (!btn) return;
      const start = (e) => {
        e.preventDefault();
        ensureAudio();
        setDir(dir);
        if (state.status === "idle" || state.status === "over") startGame();
      };
      const end = (e) => {
        e.preventDefault();
        if (state.touchDir === dir) setDir(0);
      };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", end);
      btn.addEventListener("pointercancel", end);
      btn.addEventListener("pointerleave", end);
      btn.addEventListener("click", e => e.preventDefault());
    };
    bindHold(els.touchLeft, -1);
    bindHold(els.touchRight, 1);

    if (els.touchPause) {
      els.touchPause.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        togglePause();
        updateTouchPauseIcon();
      });
      els.touchPause.addEventListener("click", e => e.preventDefault());
    }
  }

  // -------------------- Leaderboard --------------------
  function submitToLeaderboard(name, score) {
    if (!name || score <= 0) return;
    const merged = state.leaders.concat([{ name, score, at: Date.now() }]);
    merged.sort((a, b) => b.score - a.score || a.at - b.at);
    setLeaders(merged);
  }
  function renderLeaderboard() {
    const list = state.leaders;
    els.leaderboardList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "leaderboard__empty";
      li.textContent = "No scores yet.";
      els.leaderboardList.appendChild(li);
      return;
    }
    list.forEach((entry, idx) => {
      const li = document.createElement("li");
      if (entry.name === state.player) li.classList.add("you");
      li.innerHTML = `
        <span class="lb-rank">${idx + 1}</span>
        <span class="lb-name">${escapeHtml(entry.name)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      els.leaderboardList.appendChild(li);
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // -------------------- Keyboard --------------------
  function onKeyDown(e) {
    if (document.activeElement === els.nameInput) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") {
      e.preventDefault(); ensureAudio();
      state.keysHeld.add("left");
      if (state.status === "idle" || state.status === "over") startGame();
    } else if (k === "ArrowRight" || k === "d" || k === "D") {
      e.preventDefault(); ensureAudio();
      state.keysHeld.add("right");
      if (state.status === "idle" || state.status === "over") startGame();
    } else if (k === " " || k === "Spacebar") {
      e.preventDefault(); ensureAudio();
      togglePause();
      updateTouchPauseIcon();
    } else if (k === "r" || k === "R") {
      e.preventDefault(); ensureAudio();
      resetGame();
      state.status = "playing";
      hideAllOverlays();
      updateTouchPauseIcon();
    }
  }
  function onKeyUp(e) {
    const k = e.key;
    if (k === "ArrowLeft"  || k === "a" || k === "A") state.keysHeld.delete("left");
    if (k === "ArrowRight" || k === "d" || k === "D") state.keysHeld.delete("right");
  }

  // -------------------- Name modal --------------------
  let wasPlayingBeforeModal = false;
  function openNameModal(canCancel) {
    els.nameModal.classList.remove("hidden");
    els.nameModal.setAttribute("aria-hidden", "false");
    els.nameInput.value = state.player || "";
    wasPlayingBeforeModal = state.status === "playing";
    if (wasPlayingBeforeModal) pauseGame();
    if (canCancel) els.nameCancelBtn.classList.remove("hidden");
    else els.nameCancelBtn.classList.add("hidden");
    setTimeout(() => { els.nameInput.focus(); els.nameInput.select(); }, 30);
  }
  function closeNameModal() {
    els.nameModal.classList.add("hidden");
    els.nameModal.setAttribute("aria-hidden", "true");
  }

  els.nameForm.addEventListener("submit", e => {
    e.preventDefault();
    const clean = els.nameInput.value.trim().replace(/\s+/g, " ").slice(0, 14);
    if (!clean) return;
    state.player = clean;
    savePlayer(clean);
    updateHud();
    renderLeaderboard();
    closeNameModal();
  });
  els.nameCancelBtn.addEventListener("click", () => {
    if (!state.player) return;
    closeNameModal();
  });
  els.changePlayerBtn.addEventListener("click", e => {
    e.stopPropagation();
    openNameModal(true);
  });
  els.playAgainBtn.addEventListener("click", () => startGame());
  els.resetScoresBtn.addEventListener("click", () => {
    if (confirm("Clear the Top 3 leaderboard?")) setLeaders([]);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.nameModal.classList.contains("hidden") && state.player) {
      closeNameModal();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status === "playing") pauseGame();
  });

  // -------------------- DPI / resize --------------------
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.max(LOGICAL_W, Math.round(rect.width * dpr));
    const targetH = Math.round(targetW * (LOGICAL_H / LOGICAL_W));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }
  window.addEventListener("resize", fitCanvas);

  // -------------------- Init --------------------
  function init() {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    bindTouchControls();

    state.player = loadPlayer();
    state.leaders = loadLeadersLocal();

    fitCanvas();
    resetGame();
    renderLeaderboard();
    updateHud();
    updateTouchPauseIcon();
    showOverlay("start");

    if (!state.player) openNameModal(false);

    requestAnimationFrame(t => {
      state.lastFrame = t;
      loop(t);
    });
  }

  init();
})();
