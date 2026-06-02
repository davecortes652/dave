/* ============================================================
   Galactic Defender — game.js
   Features:
   · 6 enemy types: Basic, Fast, Tank, Healer, Bomber, Stealth
   · 3 boss variants that evolve every 5 waves
   · Per-wave speed scaling (enemies, bullets, spawn rate)
   · Combo system, power-ups, particle FX, screen shake
   ============================================================ */

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const W = 480, H = 640;

/* ── UI element refs ──────────────────────────────────────── */
const scoreValEl    = document.getElementById('scoreVal');
const waveValEl     = document.getElementById('waveVal');
const speedValEl    = document.getElementById('speedVal');
const powerFillEl   = document.getElementById('powerFill');
const bossBarEl     = document.getElementById('bossBar');
const bossHealthEl  = document.getElementById('bossHealth');
const bossNameEl    = document.getElementById('bossName');
const bossPhaseLbl  = document.getElementById('bossPhaseLabel');
const waveAnnounce  = document.getElementById('waveAnnounce');
const waveNumEl     = document.getElementById('waveNum');
const waveSpeedEl   = document.getElementById('waveSpeed');
const comboEl       = document.getElementById('comboDisplay');
const overlayEl     = document.getElementById('overlay');
const overlayTitle  = document.getElementById('overlayTitle');
const overlaySub    = document.getElementById('overlaySubtitle');
const startBtn      = document.getElementById('startBtn');
const finalScoreEl  = document.getElementById('finalScore');
const finalWaveEl   = document.getElementById('finalWave');
const highScoreEl   = document.getElementById('highScore');
const fsValEl       = document.getElementById('fsVal');
const fwValEl       = document.getElementById('fwVal');
const hsValEl       = document.getElementById('hsVal');
const scorePopupsEl = document.getElementById('scorePopups');

/* ── Global state ─────────────────────────────────────────── */
let gameState = 'menu';
let score = 0, wave = 1, lives = 3, power = 0, hiScore = 0;
let combo = 0, comboTimer = 0;
let keys = {}, mouse = { x: W / 2, y: H - 80 }, useMouseAim = false;
let shakeAmt = 0, shakeDur = 0;
let waveDelay = 0, announceTimer = 0;
let stars = [];

/* ── Wave speed scaling ───────────────────────────────────── */
// Every wave multiplies enemy speed, bullet speed, and shoot rate
function waveSpeedMult() {
  return 1 + (wave - 1) * 0.12;           // +12% per wave
}
function waveBulletMult() {
  return 1 + (wave - 1) * 0.08;           // +8% per wave
}
function waveShootMult() {
  return Math.max(0.4, 1 - (wave - 1) * 0.06); // shoots faster each wave (floor 40%)
}

/* ── Game object arrays ───────────────────────────────────── */
let player = {}, bullets = [], enemyBullets = [], enemies = [];
let particles = [], powerUps = [];
let boss = null;
let waveEnemies = 0, waveKilled = 0;

/* ═══════════════════════════════════════════════════════════
   STARS
═══════════════════════════════════════════════════════════ */
function initStars() {
  stars = Array.from({ length: 130 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: Math.random() * 1.8 + 0.3,
    sp: Math.random() * 1.2 + 0.3,
    b: Math.random()
  }));
}

/* ═══════════════════════════════════════════════════════════
   PLAYER
═══════════════════════════════════════════════════════════ */
function initPlayer() {
  player = {
    x: W / 2, y: H - 80,
    w: 36, h: 36,
    speed: 4.5,
    shootCooldown: 0,
    shootRate: 12,
    invincible: 0,
    thrusterPhase: 0,
    powerLevel: 0,
    alive: true
  };
}

function playerShoot() {
  const lvl = player.powerLevel;
  const sx = player.x, sy = player.y - player.h / 2;
  if (lvl === 0) {
    shoot(sx, sy, 0, -12, true, '#4af', 4);
  } else if (lvl === 1) {
    shoot(sx - 8, sy, -0.5, -12, true, '#4af', 4);
    shoot(sx + 8, sy,  0.5, -12, true, '#4af', 4);
  } else if (lvl === 2) {
    shoot(sx,      sy,    0, -13, true, '#0ff', 5);
    shoot(sx - 12, sy, -0.8, -12, true, '#4af', 4);
    shoot(sx + 12, sy,  0.8, -12, true, '#4af', 4);
  } else {
    shoot(sx,      sy,    0, -14, true, '#0ff', 6);
    shoot(sx - 14, sy,   -1, -12, true, '#4af', 5);
    shoot(sx + 14, sy,    1, -12, true, '#4af', 5);
    shoot(sx - 22, sy+4, -2, -11, true, '#08f', 4);
    shoot(sx + 22, sy+4,  2, -11, true, '#08f', 4);
  }
}

function firepower() {
  if (power < 100) return;
  power = 0;
  powerFillEl.style.width = '0%';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    shoot(player.x, player.y, Math.cos(a) * 9, Math.sin(a) * 9, true, '#ff0', 6);
  }
  spawnParticles(player.x, player.y, '#ff0', 30);
  screenShake(9, 22);
}

/* ═══════════════════════════════════════════════════════════
   BULLETS
═══════════════════════════════════════════════════════════ */
function shoot(x, y, vx, vy, fromPlayer, color = '#4af', size = 4) {
  (fromPlayer ? bullets : enemyBullets).push({ x, y, vx, vy, color, size });
}

/* ═══════════════════════════════════════════════════════════
   ENEMY DEFINITIONS
   Types: basic | fast | tank | healer | bomber | stealth
═══════════════════════════════════════════════════════════ */
const ENEMY_DEFS = {
  basic: {
    w: 28, h: 28, hp: 2,
    color: '#4af', eyeColor: '#0ff',
    scoreVal: 100,
    shootInterval: () => 90,
    bulletSpeed: 3, bulletColor: '#f44', bulletSize: 5
  },
  fast: {
    w: 24, h: 24, hp: 1,
    color: '#f84', eyeColor: '#ff0',
    scoreVal: 80,
    shootInterval: () => 55,
    bulletSpeed: 5, bulletColor: '#fa4', bulletSize: 4
  },
  tank: {
    w: 36, h: 36, hp: 5,
    color: '#a4f', eyeColor: '#fff',
    scoreVal: 200,
    shootInterval: () => 100,
    bulletSpeed: 2.5, bulletColor: '#f80', bulletSize: 7
  },
  healer: {
    // Heals nearby dead/damaged allies; low HP
    w: 26, h: 26, hp: 2,
    color: '#0f8', eyeColor: '#fff',
    scoreVal: 150,
    shootInterval: () => 120,
    bulletSpeed: 2, bulletColor: '#0f8', bulletSize: 4,
    healRadius: 80, healTimer: 180, healAmount: 1
  },
  bomber: {
    // On death explodes into 8 enemy bullets
    w: 30, h: 30, hp: 3,
    color: '#ff0', eyeColor: '#f80',
    scoreVal: 120,
    shootInterval: () => 110,
    bulletSpeed: 3, bulletColor: '#f80', bulletSize: 5,
    explodeOnDeath: true
  },
  stealth: {
    // Fades in/out; only visible in brief windows
    w: 26, h: 26, hp: 2,
    color: '#f0f', eyeColor: '#fff',
    scoreVal: 130,
    shootInterval: () => 80,
    bulletSpeed: 3.5, bulletColor: '#f0f', bulletSize: 4,
    stealthCycle: 120  // frames visible, then invisible alternating
  }
};

// Wave composition — which types appear and at what wave
function pickEnemyType() {
  const r = Math.random();
  if (wave >= 10) {
    if (r < 0.18) return 'stealth';
    if (r < 0.34) return 'bomber';
    if (r < 0.46) return 'healer';
    if (r < 0.60) return 'tank';
    if (r < 0.75) return 'fast';
    return 'basic';
  }
  if (wave >= 7) {
    if (r < 0.15) return 'stealth';
    if (r < 0.28) return 'bomber';
    if (r < 0.38) return 'healer';
    if (r < 0.52) return 'tank';
    if (r < 0.66) return 'fast';
    return 'basic';
  }
  if (wave >= 4) {
    if (r < 0.12) return 'healer';
    if (r < 0.22) return 'bomber';
    if (r < 0.38) return 'tank';
    if (r < 0.55) return 'fast';
    return 'basic';
  }
  if (wave >= 2) {
    if (r < 0.25) return 'fast';
    return 'basic';
  }
  return 'basic';
}

function makeEnemy(type, x, y) {
  const def = ENEMY_DEFS[type];
  const spd = waveSpeedMult();
  return {
    type,
    x, y,
    w: def.w, h: def.h,
    hp: def.hp + Math.floor(wave / 4),      // HP scales with wave
    maxHp: def.hp + Math.floor(wave / 4),
    vx: (Math.random() - 0.5) * (type === 'fast' ? 3.5 : 2) * spd,
    vy: (type === 'fast' ? 2.2 : type === 'tank' ? 0.9 : 1.3) * spd,
    phase: Math.random() * Math.PI * 2,
    driftTimer: 0,
    shootTimer: Math.random() * 80 + 20,
    // Healer
    healTimer: def.healTimer || 0,
    healCooldown: 0,
    // Stealth
    stealthTimer: Math.random() * (def.stealthCycle || 0),
    visible: true,
    alive: true
  };
}

/* ═══════════════════════════════════════════════════════════
   BOSS DEFINITIONS
   Boss variant cycles every 5 waves: Titan → Specter → Overlord → …
═══════════════════════════════════════════════════════════ */
const BOSS_VARIANTS = ['Titan', 'Specter', 'Overlord'];

function bossVariantIndex() {
  return Math.floor((wave / 5 - 1)) % BOSS_VARIANTS.length;
}

function spawnBoss() {
  const bossWave = Math.floor(wave / 5);           // 1st boss, 2nd boss, …
  const variant  = bossVariantIndex();
  const name     = BOSS_VARIANTS[variant];
  const spd      = waveSpeedMult();

  boss = {
    x: W / 2, y: -90,
    w: 80, h: 72,
    variant,
    name,
    hp: (30 + bossWave * 15),
    maxHp: (30 + bossWave * 15),
    phase: 0,
    shootTimer: 0,
    movePhase: 0,
    pattern: 0,
    patternTimer: 0,
    bossPhase: 1,           // 1 / 2 (enrages at 50% HP)
    vy: 0.7 * spd,
    entered: false,
    alive: true
  };

  bossBarEl.style.display = 'block';
  bossNameEl.textContent  = `⚠ ${name.toUpperCase()}`;
  bossPhaseLbl.textContent = 'PHASE 1';
}

/* ═══════════════════════════════════════════════════════════
   WAVE SPAWNING
═══════════════════════════════════════════════════════════ */
function spawnWave() {
  enemies = []; bullets = []; enemyBullets = []; powerUps = [];
  boss = null;
  bossBarEl.style.display = 'none';

  const isBossWave = wave % 5 === 0;

  if (isBossWave) {
    spawnBoss();
    waveEnemies = 1;
  } else {
    const count = 5 + wave * 2;
    waveEnemies = count;
    const cols  = Math.min(count, 6);
    const rows  = Math.ceil(count / cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r * cols + c >= count) break;
        const type = pickEnemyType();
        const x    = 60 + c * (W - 120) / Math.max(cols - 1, 1);
        const y    = -30 - r * 58;
        enemies.push(makeEnemy(type, x, y));
      }
    }
    // Always include one healer after wave 3 so the mechanic is visible
    if (wave >= 3 && !enemies.some(e => e.type === 'healer')) {
      enemies[0] = makeEnemy('healer', enemies[0].x, enemies[0].y);
    }
  }

  waveKilled = 0;
  speedValEl.textContent = waveSpeedMult().toFixed(1);
  showWaveAnnounce();
}

function showWaveAnnounce() {
  const isBoss = wave % 5 === 0;
  waveNumEl.textContent  = isBoss ? BOSS_VARIANTS[bossVariantIndex()].toUpperCase() : wave;
  waveSpeedEl.textContent = `SPEED ×${waveSpeedMult().toFixed(1)}`;
  waveAnnounce.classList.add('show');
  announceTimer = 130;
}

/* ═══════════════════════════════════════════════════════════
   ENEMY KILL / HIT
═══════════════════════════════════════════════════════════ */
function killEnemy(e) {
  e.hp--;
  spawnParticles(e.x, e.y, ENEMY_DEFS[e.type].color, e.hp <= 0 ? 16 : 5);

  if (e.hp <= 0) {
    e.alive = false;
    waveKilled++;

    // Bomber: explode into 8 bullets on death
    if (e.type === 'bomber') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        shoot(e.x, e.y, Math.cos(a) * 4 * waveBulletMult(), Math.sin(a) * 4 * waveBulletMult(), false, '#f80', 5);
      }
      spawnParticles(e.x, e.y, '#ff0', 24);
      screenShake(5, 10);
    }

    const pts = ENEMY_DEFS[e.type].scoreVal * (1 + Math.floor(combo / 3));
    addScore(pts, e.x, e.y);
    updateCombo();

    if (Math.random() < 0.18) spawnPowerUp(e.x, e.y);
    screenShake(3, 6);
  }
}

/* ═══════════════════════════════════════════════════════════
   PARTICLES / FX
═══════════════════════════════════════════════════════════ */
function spawnParticles(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 4 + 1;
    particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: Math.random() * 0.04 + 0.02,
      size: Math.random() * 3 + 1, color
    });
  }
}

function screenShake(amt, dur) { shakeAmt = amt; shakeDur = dur; }

/* ═══════════════════════════════════════════════════════════
   SCORE / COMBO / POWER-UPS
═══════════════════════════════════════════════════════════ */
function addScore(val, x, y) {
  score += val;
  scoreValEl.textContent = score;
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = '+' + val;
  el.style.left  = x + 'px';
  el.style.top   = y + 'px';
  el.style.color = combo > 3 ? '#ff0' : '#4af';
  scorePopupsEl.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function updateCombo() {
  combo++;
  comboTimer = 90;
  if (combo >= 3) {
    comboEl.textContent = 'x' + combo + ' COMBO!';
    comboEl.classList.add('show');
  }
}

function spawnPowerUp(x, y) {
  const types = ['gun', 'power', 'life'];
  const t = Math.random() < 0.55 ? 'gun' : (Math.random() < 0.5 ? 'power' : 'life');
  powerUps.push({ x, y, type: t, vy: 1.5, phase: 0, collected: false });
}

/* ═══════════════════════════════════════════════════════════
   PLAYER HIT / DEATH
═══════════════════════════════════════════════════════════ */
function hitPlayer() {
  if (player.invincible > 0) return;
  lives--;
  updateLivesUI();
  player.invincible = 120;
  spawnParticles(player.x, player.y, '#f44', 20);
  screenShake(10, 26);
  if (lives <= 0) endGame();
}

function updateLivesUI() {
  for (let i = 0; i < 3; i++)
    document.getElementById('l' + i).classList.toggle('dead', i >= lives);
}

/* ═══════════════════════════════════════════════════════════
   GAME OVER
═══════════════════════════════════════════════════════════ */
function endGame() {
  gameState = 'gameover';
  if (score > hiScore) hiScore = score;
  overlayEl.classList.remove('hidden');
  overlayTitle.innerHTML = 'GAME<br>OVER';
  overlaySub.textContent = 'DEFEATED';
  finalScoreEl.style.display = 'block';
  finalWaveEl.style.display  = 'block';
  highScoreEl.style.display  = 'block';
  fsValEl.textContent = score;
  fwValEl.textContent = wave;
  hsValEl.textContent = hiScore;
  startBtn.textContent = 'RETRY';
}

/* ═══════════════════════════════════════════════════════════
   COLLISION HELPER
═══════════════════════════════════════════════════════════ */
function rect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* ═══════════════════════════════════════════════════════════
   UPDATE LOOP
═══════════════════════════════════════════════════════════ */
function update() {
  if (gameState !== 'playing') return;

  // Screen shake decay
  if (shakeDur > 0) shakeDur--;
  else shakeAmt *= 0.82;

  // Stars
  for (const s of stars) {
    s.y += s.sp;
    if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
  }

  // Announce timer
  if (announceTimer > 0 && --announceTimer === 0)
    waveAnnounce.classList.remove('show');

  // Combo decay
  if (comboTimer > 0 && --comboTimer === 0) {
    combo = 0;
    comboEl.classList.remove('show');
  }

  /* ── Player movement ──────────────────────────────── */
  if (!useMouseAim) {
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x += player.speed;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) player.y -= player.speed;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) player.y += player.speed;
  } else {
    const dx = mouse.x - player.x, dy = mouse.y - player.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d > 4) { player.x += dx * 0.12; player.y += dy * 0.12; }
  }
  player.x = Math.max(20, Math.min(W - 20, player.x));
  player.y = Math.max(40, Math.min(H - 40, player.y));

  /* ── Player shoot ─────────────────────────────────── */
  if (player.shootCooldown > 0) player.shootCooldown--;
  const shooting = keys[' '] || keys['z'] || keys['Z'] || keys['mousedown'];
  if (shooting && player.shootCooldown === 0) {
    playerShoot();
    player.shootCooldown = Math.max(4, player.shootRate - player.powerLevel * 2);
  }
  if (player.invincible > 0) player.invincible--;
  if ((keys['p'] || keys['P']) && power >= 100) firepower();

  /* ── Player bullets ───────────────────────────────── */
  bullets = bullets.filter(b => {
    b.x += b.vx; b.y += b.vy;
    return b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20;
  });

  /* ── Enemy bullets ────────────────────────────────── */
  enemyBullets = enemyBullets.filter(b => {
    b.x += b.vx; b.y += b.vy;
    if (b.y > H + 20 || b.x < -20 || b.x > W + 20) return false;
    if (rect(b.x - b.size, b.y - b.size, b.size * 2, b.size * 2,
             player.x - 12, player.y - 12, 24, 24)) {
      hitPlayer();
      return false;
    }
    return true;
  });

  /* ── Enemies ──────────────────────────────────────── */
  const spd  = waveSpeedMult();
  const bspd = waveBulletMult();
  const srt  = waveShootMult();

  for (const e of enemies) {
    if (!e.alive) continue;

    e.phase += 0.03;
    e.driftTimer++;
    if (e.driftTimer > 80) {
      const factor = e.type === 'fast' ? 4 : 2.5;
      e.vx = (Math.random() - 0.5) * factor * spd;
      e.driftTimer = 0;
    }
    e.x += e.vx + Math.sin(e.phase) * 0.5;
    e.y += e.vy;
    e.x = Math.max(20, Math.min(W - 20, e.x));

    // ── Stealth toggle ──
    if (e.type === 'stealth') {
      e.stealthTimer++;
      const cycle = ENEMY_DEFS.stealth.stealthCycle;
      e.visible = Math.floor(e.stealthTimer / cycle) % 2 === 0;
    }

    // ── Healer: heal nearby hurt allies ──
    if (e.type === 'healer') {
      e.healCooldown--;
      if (e.healCooldown <= 0) {
        e.healCooldown = 180;
        for (const other of enemies) {
          if (!other.alive || other === e) continue;
          const dx = other.x - e.x, dy = other.y - e.y;
          if (Math.sqrt(dx * dx + dy * dy) < ENEMY_DEFS.healer.healRadius) {
            other.hp = Math.min(other.maxHp, other.hp + ENEMY_DEFS.healer.healAmount);
            spawnParticles(other.x, other.y, '#0f8', 5);
          }
        }
      }
    }

    // ── Shoot ──
    const def = ENEMY_DEFS[e.type];
    e.shootTimer -= srt;
    if (e.shootTimer <= 0) {
      e.shootTimer = def.shootInterval() + Math.random() * 50;
      if (e.type !== 'stealth' || e.visible) {
        const dx = player.x - e.x, dy = player.y - e.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        const bs = def.bulletSpeed * bspd;
        shoot(e.x, e.y, dx / d * bs, dy / d * bs, false, def.bulletColor, def.bulletSize);
      }
    }

    // ── Bullet hits enemy ──
    bullets = bullets.filter(b => {
      // Stealth: can only be hit during visible window
      if (e.type === 'stealth' && !e.visible) return true;
      if (rect(b.x - 2, b.y - 4, 4, 8, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)) {
        killEnemy(e);
        return false;
      }
      return true;
    });

    // ── Enemy body hits player ──
    if (rect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h,
             player.x - 10, player.y - 10, 20, 20)) {
      e.alive = false;
      waveKilled++;
      hitPlayer();
    }
  }
  enemies = enemies.filter(e => e.alive && e.y < H + 60);

  /* ── Boss ─────────────────────────────────────────── */
  if (boss && boss.alive) {
    updateBoss();
  }

  /* ── Power-ups ────────────────────────────────────── */
  for (const p of powerUps) {
    p.y += p.vy;
    p.phase += 0.08;
    if (rect(p.x - 10, p.y - 10, 20, 20, player.x - 14, player.y - 14, 28, 28)) {
      if      (p.type === 'gun')   player.powerLevel = Math.min(3, player.powerLevel + 1);
      else if (p.type === 'power') { power = Math.min(100, power + 40); powerFillEl.style.width = power + '%'; }
      else                         { lives = Math.min(3, lives + 1); updateLivesUI(); }
      p.collected = true;
      spawnParticles(p.x, p.y, p.type === 'gun' ? '#0f8' : p.type === 'power' ? '#ff0' : '#f55', 12);
    }
  }
  powerUps = powerUps.filter(p => !p.collected && p.y < H + 20);

  /* ── Particles ────────────────────────────────────── */
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.95; p.vy *= 0.95;
    p.life -= p.decay;
    p.size *= 0.97;
  }
  particles = particles.filter(p => p.life > 0 && p.size > 0.2);

  // Power charge
  power = Math.min(100, power + 0.09);
  powerFillEl.style.width = power + '%';

  /* ── Wave clear ───────────────────────────────────── */
  if (waveKilled >= waveEnemies && (!boss || !boss.alive)) {
    if (++waveDelay > 90) {
      wave++;
      waveValEl.textContent = wave;
      waveDelay = 0;
      spawnWave();
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   BOSS AI — 3 VARIANTS, 2 PHASES EACH
═══════════════════════════════════════════════════════════ */
function updateBoss() {
  const b    = boss;
  const spd  = waveSpeedMult();
  const bspd = waveBulletMult();

  // Entry swoop
  if (!b.entered) {
    b.y += b.vy;
    if (b.y >= 110) { b.entered = true; b.vy = 0; }
    return;
  }

  // Enrage at 50% HP
  if (b.hp <= b.maxHp / 2 && b.bossPhase === 1) {
    b.bossPhase = 2;
    bossPhaseLbl.textContent = 'PHASE 2 — ENRAGED';
    spawnParticles(b.x, b.y, '#f44', 30);
    screenShake(8, 18);
  }

  const enraged = b.bossPhase === 2;
  b.movePhase += (enraged ? 0.025 : 0.015) * spd;
  b.patternTimer++;

  const patternDur = enraged ? 140 : 180;
  if (b.patternTimer > patternDur) {
    b.pattern = (b.pattern + 1) % 3;
    b.patternTimer = 0;
  }

  // ── Titan: heavy tanker, sweeping horizontal ──
  if (b.variant === 0) {
    if (b.pattern === 0) b.x = W / 2 + Math.sin(b.movePhase) * 180;
    else if (b.pattern === 1) { b.x += Math.sin(b.movePhase * 3) * 3 * spd; b.y = 110 + Math.sin(b.movePhase) * 30; }
    else { b.x = W / 2 + Math.cos(b.movePhase) * 140; b.y = 110 + Math.sin(b.movePhase * 1.5) * 40; }
  }
  // ── Specter: fast, erratic figure-8 ──
  else if (b.variant === 1) {
    b.x = W / 2 + Math.sin(b.movePhase) * 170;
    b.y = 110 + Math.sin(b.movePhase * 2) * 50;
  }
  // ── Overlord: slow circles + minion spawns ──
  else {
    b.x = W / 2 + Math.cos(b.movePhase * 0.7) * 130;
    b.y = 130 + Math.sin(b.movePhase * 0.7) * 50;
    // Spawn mini enemies every 300 frames
    if (!b.minionTimer) b.minionTimer = 0;
    b.minionTimer++;
    if (b.minionTimer > 300) {
      b.minionTimer = 0;
      if (enemies.length < 6) {
        enemies.push(makeEnemy('fast', b.x - 30, b.y + 40));
        enemies.push(makeEnemy('fast', b.x + 30, b.y + 40));
        waveEnemies += 2;
      }
    }
  }

  b.x = Math.max(60, Math.min(W - 60, b.x));

  // ── Boss shooting ──
  b.shootTimer++;
  const baseRate  = Math.max(18, 40 - wave * 1.5);
  const shootRate = enraged ? baseRate * 0.6 : baseRate;

  if (b.shootTimer >= shootRate) {
    b.shootTimer = 0;
    b.phase++;
    const bs = bspd;

    if (b.variant === 0) {
      // Titan: 5-way spread + occasional spiral
      if (b.phase % 3 === 0) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + b.phase * 0.08;
          shoot(b.x, b.y, Math.cos(a) * 3 * bs, Math.sin(a) * 3 * bs, false, '#f08', 6);
        }
      } else {
        const dx = player.x - b.x, dy = player.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(dy, dx) + i * 0.2;
          shoot(b.x, b.y, Math.cos(a) * 4.5 * bs, Math.sin(a) * 4.5 * bs, false, '#f44', 5);
        }
        if (enraged) {
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(dy, dx) + i * 0.55;
            shoot(b.x, b.y, Math.cos(a) * 5 * bs, Math.sin(a) * 5 * bs, false, '#f80', 6);
          }
        }
      }
    } else if (b.variant === 1) {
      // Specter: aimed rapid-fire + phase rings
      const dx = player.x - b.x, dy = player.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
      const a  = Math.atan2(dy, dx);
      shoot(b.x, b.y, Math.cos(a) * 6 * bs, Math.sin(a) * 6 * bs, false, '#f0f', 5);
      if (enraged) {
        shoot(b.x, b.y, Math.cos(a + 0.3) * 5.5 * bs, Math.sin(a + 0.3) * 5.5 * bs, false, '#f0f', 4);
        shoot(b.x, b.y, Math.cos(a - 0.3) * 5.5 * bs, Math.sin(a - 0.3) * 5.5 * bs, false, '#f0f', 4);
      }
      if (b.phase % 4 === 0) {
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          shoot(b.x, b.y, Math.cos(ang) * 2.5 * bs, Math.sin(ang) * 2.5 * bs, false, '#80f', 5);
        }
      }
    } else {
      // Overlord: slower but large bullets + radial burst
      if (b.phase % 2 === 0) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + b.phase * 0.05;
          shoot(b.x, b.y, Math.cos(a) * 2.5 * bs, Math.sin(a) * 2.5 * bs, false, '#f80', 8);
        }
      }
      const dx = player.x - b.x, dy = player.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
      shoot(b.x, b.y, dx / d * 5 * bs, dy / d * 5 * bs, false, '#ff4', 6);
      if (enraged) {
        const a = Math.atan2(dy, dx);
        for (let i = -3; i <= 3; i++) {
          shoot(b.x, b.y, Math.cos(a + i * 0.22) * 4 * bs, Math.sin(a + i * 0.22) * 4 * bs, false, '#fa0', 5);
        }
      }
    }
  }

  // Bullet hits boss
  bullets = bullets.filter(bt => {
    if (rect(bt.x - 3, bt.y - 6, 6, 12, b.x - 42, b.y - 36, 84, 72)) {
      b.hp--;
      spawnParticles(bt.x, bt.y, '#f80', 5);
      bossHealthEl.style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
      if (b.hp <= 0) {
        b.alive = false;
        spawnParticles(b.x, b.y, '#f44', 50);
        spawnParticles(b.x, b.y, '#ff0', 30);
        screenShake(16, 45);
        addScore(1500 + wave * 300, b.x, b.y);
        updateCombo();
        waveKilled = waveEnemies;
        bossBarEl.style.display = 'none';
        for (let i = 0; i < 3; i++) spawnPowerUp(b.x + (i - 1) * 34, b.y);
      }
      return false;
    }
    return true;
  });

  // Boss body collides with player
  if (rect(b.x - 42, b.y - 36, 84, 72, player.x - 12, player.y - 12, 24, 24))
    hitPlayer();
}

/* ═══════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════ */
function render() {
  let sx = 0, sy = 0;
  if (shakeAmt > 0.5) {
    sx = (Math.random() - 0.5) * shakeAmt;
    sy = (Math.random() - 0.5) * shakeAmt;
  }
  ctx.save();
  ctx.translate(sx, sy);

  // Background
  ctx.fillStyle = '#00040c';
  ctx.fillRect(-10, -10, W + 20, H + 20);

  // Stars
  for (const s of stars) {
    ctx.globalAlpha = 0.3 + s.b * 0.7;
    ctx.fillStyle = '#adf';
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  if (gameState === 'playing') {
    drawParticles();
    powerUps.forEach(drawPowerUp);
    bullets.forEach(b => drawBullet(b, false));
    enemyBullets.forEach(b => drawBullet(b, true));
    enemies.forEach(e => { if (e.alive) drawEnemy(e); });
    if (boss && boss.alive) drawBoss(boss);
    if (player.alive) drawPlayer(player);
  }

  ctx.restore();
}

/* ── Draw helpers ─────────────────────────────────────────── */
function drawPlayer(p) {
  if (p.invincible > 0 && Math.floor(p.invincible / 6) % 2 === 0) return;
  p.thrusterPhase += 0.25;
  const x = p.x, y = p.y;

  // Thruster
  const tH = 14 + Math.sin(p.thrusterPhase) * 4;
  ctx.save();
  ctx.globalAlpha = 0.55 + Math.sin(p.thrusterPhase) * 0.2;
  const tg = ctx.createLinearGradient(x, y + 14, x, y + 14 + tH);
  tg.addColorStop(0, '#0ff');
  tg.addColorStop(1, 'rgba(0,255,255,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(x - 6, y + 14, 12, tH);
  ctx.restore();

  // Body
  ctx.fillStyle = '#9df';
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x - 14, y + 16); ctx.lineTo(x - 8, y + 10);
  ctx.lineTo(x, y + 14);
  ctx.lineTo(x + 8, y + 10); ctx.lineTo(x + 14, y + 16);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#0ff';
  ctx.beginPath();
  ctx.moveTo(x, y - 10); ctx.lineTo(x - 5, y + 6); ctx.lineTo(x + 5, y + 6);
  ctx.closePath(); ctx.fill();

  // Wings
  ctx.fillStyle = '#4af';
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 16); ctx.lineTo(x - 22, y + 16); ctx.lineTo(x - 8, y + 2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 16); ctx.lineTo(x + 22, y + 16); ctx.lineTo(x + 8, y + 2);
  ctx.closePath(); ctx.fill();
}

function drawEnemy(e) {
  const x = e.x, y = e.y;
  const def = ENEMY_DEFS[e.type];
  const hpR = e.hp / e.maxHp;

  // Stealth: flickering alpha
  if (e.type === 'stealth') {
    ctx.globalAlpha = e.visible ? (0.5 + Math.abs(Math.sin(e.stealthTimer * 0.1)) * 0.5) : 0.12;
  }

  if (e.type === 'basic') {
    ctx.fillStyle = `hsl(${200 - (1 - hpR) * 60}, 100%, 65%)`;
    ctx.beginPath();
    ctx.moveTo(x, y + 14); ctx.lineTo(x - 14, y - 8);
    ctx.lineTo(x - 6, y - 14); ctx.lineTo(x + 6, y - 14); ctx.lineTo(x + 14, y - 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,200,255,0.55)';
    ctx.beginPath(); ctx.arc(x, y - 2, 7, 0, Math.PI * 2); ctx.fill();

  } else if (e.type === 'fast') {
    ctx.fillStyle = '#f84';
    ctx.beginPath();
    ctx.moveTo(x, y + 14); ctx.lineTo(x - 10, y - 14); ctx.lineTo(x + 10, y - 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fa2';
    ctx.beginPath(); ctx.arc(x, y - 4, 6, 0, Math.PI * 2); ctx.fill();

  } else if (e.type === 'tank') {
    ctx.fillStyle = `hsl(270, 70%, ${50 + hpR * 20}%)`;
    ctx.fillRect(x - 18, y - 18, 36, 36);
    ctx.fillStyle = '#84d';
    ctx.fillRect(x - 10, y - 10, 20, 20);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 2, y - 15, 4, 9);
    // HP ticks
    for (let i = 0; i < e.maxHp; i++) {
      ctx.fillStyle = i < e.hp ? '#a4f' : '#333';
      ctx.fillRect(x - 18 + i * 8, y + 22, 6, 4);
    }

  } else if (e.type === 'healer') {
    ctx.fillStyle = '#0a6';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f8';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    // Cross symbol
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1, y - 7, 2, 14);
    ctx.fillRect(x - 7, y - 1, 14, 2);
    // Heal aura pulse
    ctx.save();
    ctx.globalAlpha = 0.1 + Math.abs(Math.sin(Date.now() / 400)) * 0.15;
    ctx.strokeStyle = '#0f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, ENEMY_DEFS.healer.healRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

  } else if (e.type === 'bomber') {
    ctx.fillStyle = `hsl(50, 100%, ${50 + hpR * 15}%)`;
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f80';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    // Danger stripes
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Date.now() / 800;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
      ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.restore();

  } else if (e.type === 'stealth') {
    ctx.fillStyle = '#c0c';
    ctx.beginPath();
    ctx.moveTo(x, y - 14); ctx.lineTo(x - 12, y + 12); ctx.lineTo(x + 12, y + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0f';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawBoss(b) {
  const x = b.x, y = b.y;
  const pulse = 0.85 + Math.sin(Date.now() / 220) * 0.15;

  if (b.variant === 0) {
    // Titan: heavy angular shape
    ctx.fillStyle = `hsl(${Date.now() / 25 % 360}, 75%, 50%)`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Date.now() / 2200); ctx.fillRect(-28, -28, 56, 56); ctx.restore();
    ctx.fillStyle = '#f44';
    ctx.beginPath();
    ctx.moveTo(x, y - 42); ctx.lineTo(x - 42, y + 12);
    ctx.lineTo(x - 20, y + 42); ctx.lineTo(x + 20, y + 42);
    ctx.lineTo(x + 42, y + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,60,60,0.4)';
    ctx.beginPath(); ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2); ctx.fill();

  } else if (b.variant === 1) {
    // Specter: ethereal ghost shape
    ctx.globalAlpha = 0.75 + Math.sin(Date.now() / 180) * 0.2;
    ctx.fillStyle = '#80f';
    ctx.beginPath(); ctx.arc(x, y, 36 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f';
    ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
    // Tentacles
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Date.now() / 1200;
      ctx.fillStyle = '#80f';
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 34, y + Math.sin(a) * 34, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

  } else {
    // Overlord: large, multi-layered
    ctx.fillStyle = '#480';
    ctx.fillRect(x - 40, y - 36, 80, 72);
    ctx.fillStyle = '#fa0';
    ctx.beginPath(); ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f80';
    ctx.fillRect(x - 28, y - 8, 56, 16);
  }

  // Eyes (all bosses)
  ctx.fillStyle = '#ff0';
  ctx.beginPath(); ctx.arc(x - 14, y - 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, y - 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(x - 14, y - 8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, y - 8, 3, 0, Math.PI * 2); ctx.fill();

  // Enraged glow
  if (b.bossPhase === 2) {
    ctx.save();
    ctx.globalAlpha = 0.2 + Math.abs(Math.sin(Date.now() / 100)) * 0.2;
    ctx.strokeStyle = '#f44';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawBullet(b, isEnemy) {
  ctx.save();
  ctx.shadowColor = b.color;
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = b.color;
  if (isEnemy) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillRect(b.x - b.size / 2, b.y - b.size * 2, b.size, b.size * 4);
  }
  ctx.restore();
}

function drawPowerUp(p) {
  ctx.save();
  ctx.globalAlpha = 0.7 + Math.sin(p.phase) * 0.3;
  const c = p.type === 'gun' ? '#0f8' : p.type === 'power' ? '#ff0' : '#f55';
  ctx.shadowColor = c; ctx.shadowBlur = 12;
  ctx.fillStyle   = c;
  ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#000';
  ctx.font        = 'bold 10px Share Tech Mono';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.type === 'gun' ? 'G' : p.type === 'power' ? 'P' : '♥', p.x, p.y);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/* ═══════════════════════════════════════════════════════════
   GAME LOOP
═══════════════════════════════════════════════════════════ */
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

/* ═══════════════════════════════════════════════════════════
   START / RESTART
═══════════════════════════════════════════════════════════ */
function startGame() {
  gameState = 'playing';
  score = 0; wave = 1; lives = 3; power = 0; combo = 0;
  scoreValEl.textContent = '0';
  waveValEl.textContent  = '1';
  speedValEl.textContent = '1.0';
  powerFillEl.style.width = '0%';
  overlayEl.classList.add('hidden');
  finalScoreEl.style.display = 'none';
  finalWaveEl.style.display  = 'none';
  highScoreEl.style.display  = 'none';
  overlayTitle.innerHTML = 'GALACTIC<br>DEFENDER';
  overlaySub.textContent = 'PROTECT THE GALAXY';
  startBtn.textContent   = 'LAUNCH';
  updateLivesUI();
  initPlayer();
  initStars();
  spawnWave();
}

/* ═══════════════════════════════════════════════════════════
   INPUT
═══════════════════════════════════════════════════════════ */
startBtn.addEventListener('click', startGame);

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if ((e.key === 'p' || e.key === 'P') && gameState === 'playing') firepower();
  // Prevent page scrolling in-game
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top)  * (H / r.height);
  useMouseAim = true;
});
canvas.addEventListener('mousedown', () => { useMouseAim = true; keys['mousedown'] = true; });
canvas.addEventListener('mouseup',   () => { keys['mousedown'] = false; });
canvas.addEventListener('mouseleave', () => { useMouseAim = false; });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0], r = canvas.getBoundingClientRect();
  mouse.x = (t.clientX - r.left) * (W / r.width);
  mouse.y = (t.clientY - r.top)  * (H / r.height);
  useMouseAim = true; keys['mousedown'] = true;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0], r = canvas.getBoundingClientRect();
  mouse.x = (t.clientX - r.left) * (W / r.width);
  mouse.y = (t.clientY - r.top)  * (H / r.height);
}, { passive: false });
canvas.addEventListener('touchend', () => { keys['mousedown'] = false; });

/* ── Boot ─────────────────────────────────────────────────── */
initStars();
loop();
