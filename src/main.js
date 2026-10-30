// main.js —— 主循环、场景、镜头、HUD、状态机

import * as THREE from 'three';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Effects } from './effects.js';
import { Bullets, BULLET } from './bullets.js';
import { Player, WEAPONS } from './player.js';
import { Enemy } from './enemies.js';
import { Boss } from './boss.js';
import { Pickups } from './pickups.js';
import { Level } from './level.js';
import { clamp, damp, rand, chance } from './util.js';

const _v = new THREE.Vector3();
const _shake = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

// ------------------------------------------------------------------
// DOM
// ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const elScore = $('hud-score');
const elRemaining = $('hud-remaining');
const elLives = $('hud-lives');
const elStage = $('hud-stage');
const elCombo = $('hud-combo');
const elWeapon = $('hud-weapon');
const elHpFill = $('hud-hp-fill');
const elHpText = $('hud-hp-text');
const elBossBar = $('boss-bar');
const elBossFill = $('boss-fill');
const elToast = $('toast');
const screenStart = $('screen-start');
const screenPause = $('screen-pause');
const screenOver = $('screen-over');
const elOverTitle = $('over-title');
const elOverSub = $('over-sub');
const elOverStats = $('over-stats');

// ------------------------------------------------------------------
// 基础场景
// ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121b2c);
scene.fog = new THREE.Fog(0x16243a, 55, 210);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
camera.position.set(-6, 6.2, 9.5);
camera.lookAt(4, 1.2, 0);

// 灯光
const hemi = new THREE.HemisphereLight(0xa8c4ff, 0x3a3a30, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.55);
sun.position.set(18, 26, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0012;
scene.add(sun);
scene.add(sun.target);
const rim = new THREE.DirectionalLight(0x6a9fff, 0.62);
rim.position.set(-20, 12, -18);
scene.add(rim);

// 环境的暖色补光
const fill = new THREE.PointLight(0xffa860, 0.85, 70, 2);
fill.position.set(0, 4, 0);
scene.add(fill);

// ------------------------------------------------------------------
// 系统实例
// ------------------------------------------------------------------
const input = new Input(canvas);
const audio = new Audio();
const effects = new Effects(scene);
const bullets = new Bullets(scene, effects, audio);
const level = new Level(scene);
const player = new Player(scene, audio, effects);
const pickups = new Pickups(scene, audio, effects);

let enemies = [];
let boss = null;
let bossActive = false;

// ------------------------------------------------------------------
// 游戏状态
// ------------------------------------------------------------------
const G = {
  state: 'menu',        // menu / playing / paused / over
  score: 0,
  stage: 1,
  time: 0,
  spawnTimer: 0,
  clearedSpawns: new Set(),
  autoAim: true,
  musicWanted: false,
  kills: 0,
  shotsFired: 0,
  shotsHit: 0,
  startedAt: 0,
  bossSpawned: false,
};

function resetGame() {
  // 清场
  for (const e of enemies) scene.remove(e.mesh);
  enemies = [];
  bullets.clear();
  pickups.clear();
  for (const it of effects.items) scene.remove(it.obj);
  effects.items.length = 0;
  if (boss) { boss.dispose(); boss = null; }
  bossActive = false;

  level.clear();
  level.build();

  player.reset(0, 0);
  player.lives = 3;

  G.score = 0;
  G.stage = 1;
  G.time = 0;
  G.spawnTimer = 1.2;
  G.clearedSpawns.clear();
  G.kills = 0;
  G.shotsFired = 0;
  G.shotsHit = 0;
  G.startedAt = performance.now();
  G.bossSpawned = false;

  camera.position.set(-6, 6.2, 9.5);
  elBossBar.classList.add('hidden');
  updateHud();
}

function startGame() {
  audio.init();
  audio.resume();
  resetGame();
  G.state = 'playing';
  screenStart.classList.add('hidden');
  screenOver.classList.add('hidden');
  screenPause.classList.add('hidden');
  hud.classList.remove('hidden');
  if (G.musicWanted) audio.startMusic();
  toast('任务开始', 'warn');
}

function endGame(win) {
  G.state = 'over';
  audio.stopMusic();
  elOverTitle.textContent = win ? '任务完成' : '任务失败';
  elOverSub.textContent = win
    ? '铁壁机甲已被摧毁，防线守住了'
    : '防线失守，再来一次';
  const secs = (performance.now() - G.startedAt) / 1000;
  const acc = G.shotsFired > 0 ? Math.round((G.shotsHit / G.shotsFired) * 100) : 0;
  elOverStats.innerHTML = `
    <div><span>总得分</span><span>${G.score.toLocaleString()}</span></div>
    <div><span>击毁敌人</span><span>${G.kills}</span></div>
    <div><span>命中率</span><span>${acc}%</span></div>
    <div><span>用时</span><span>${secs.toFixed(0)} 秒</span></div>
    <div><span>剩余生命</span><span>${player.lives}</span></div>
    <div><span>到达进度</span><span>${Math.round((player.pos.x / level.length) * 100)}%</span></div>
  `;
  screenOver.classList.remove('hidden');
}

function togglePause(force) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  const wantPause = force !== undefined ? force : G.state === 'playing';
  if (wantPause) {
    G.state = 'paused';
    screenPause.classList.remove('hidden');
    audio.stopMusic();
  } else {
    G.state = 'playing';
    screenPause.classList.add('hidden');
    audio.resume();
    if (G.musicWanted) audio.startMusic();
  }
}

let toastTimer = 0;
function toast(text, cls = '') {
  elToast.textContent = text;
  elToast.className = 'show ' + cls;
  toastTimer = 1.6;
}

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------
function updateHud() {
  elScore.textContent = G.score.toLocaleString();
  const remaining = enemies.length + (boss && !boss.dead ? 1 : 0);
  elRemaining.textContent = remaining;
  elStage.textContent = G.stage;

  const w = WEAPONS[player.weapon];
  elWeapon.textContent = w.name;
  elWeapon.className = 'weapon-tag ' + (w.cls === 'l' ? '' : w.cls);

  const hpRatio = player.hp / player.maxHp;
  elHpFill.style.width = (hpRatio * 100) + '%';
  elHpFill.classList.toggle('low', hpRatio <= 0.5);
  elHpText.textContent = `${player.hp} / ${player.maxHp}`;

  // 生命图标
  if (elLives.childElementCount !== player.lives) {
    elLives.innerHTML = '';
    for (let i = 0; i < player.lives; i++) {
      const d = document.createElement('div');
      d.className = 'life-dot';
      elLives.appendChild(d);
    }
  }

  // 连击倍率
  const mult = Math.min(9, player.combo);
  elCombo.textContent = 'x' + (mult > 0 ? mult : 1);
  elCombo.style.color = mult >= 5 ? '#ff8a4a' : mult >= 3 ? '#ffcc33' : '#ffcc33';
}

// ------------------------------------------------------------------
// 刷怪
// ------------------------------------------------------------------
function updateSpawning(dt) {
  const px = player.pos.x;

  // 已在玩家身后的刷怪点不再生成
  for (const sp of level.spawnPoints) {
    if (sp.x < px - 14) G.clearedSpawns.add(sp);
  }

  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    G.spawnTimer = rand(1.5, 0.7);
    const candidates = level.spawnPoints.filter(
      (sp) => !G.clearedSpawns.has(sp) && sp.x > px + 4 && sp.x < px + 40
    );
    if (candidates.length) {
      const n = chance(0.22) ? 2 : 1;
      for (let i = 0; i < n && candidates.length; i++) {
        const sp = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
        // 炮台固定在掩体附近
        let z = sp.z;
        if (sp.type === 'turret') z = rand(9, -9);
        const e = new Enemy(sp.type, sp.x, z, scene, audio, effects);
        enemies.push(e);
      }
    }
  }

  // 清理死亡敌人
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead) enemies.splice(i, 1);
  }
}

// ------------------------------------------------------------------
// BOSS 触发
// ------------------------------------------------------------------
function checkBoss() {
  if (G.bossSpawned) return;
  const trigger = level.bossTrigger();
  if (player.pos.x >= trigger) {
    G.bossSpawned = true;
    bossActive = true;
    boss = new Boss(scene, audio, effects, trigger + 42);
    // BOSS 战场：把玩家推进到机甲正前方，避免隔着几百米对射
    player.pos.x = trigger - 16;
    player.pos.z = 0;
    player.vel.set(0, 0, 0);
    elBossBar.classList.remove('hidden');
    elBossFill.style.width = '100%';
    audio.bossAlert();
    toast('警告：敌方重装机甲接近', 'danger');
    effects.addShake(0.8);
  }
}

function updateBoss(dt) {
  if (!boss) return;
  boss.update(dt, player, ctx);
  if (boss.state === 'fight') {
    elBossFill.style.width = (boss.hpRatio * 100) + '%';
  }
  if (boss.dead) {
    elBossBar.classList.add('hidden');
    boss.dispose();
    boss = null;
    bossActive = false;
    G.stage = 2;
    toast('铁壁已摧毁！', 'warn');
    audio.stageClear();
    setTimeout(() => endGame(true), 2200);
  }
}

// ------------------------------------------------------------------
// 战斗上下文
// ------------------------------------------------------------------
const ctx = {
  bullets, effects, camera,
  autoAim: true,
  player,
  enemies: () => enemies,
  obstacles: level.obstacles,
  get boss() { return boss; },
  countShot: (n) => { G.shotsFired += n; },
  spawnDrop: (x, z) => pickups.spawn(x, z),
  addScore: (amount, pos) => {
    G.score += amount;
    G.kills++;
    const c = player.addCombo();
    if (c > 0 && c % 10 === 0) {
      toast(`${c} 连击！`, 'warn');
    }
  },
};

// 玩家阵亡 → 结束本局
player.onDeath = () => {
  if (G.state === 'playing') {
    setTimeout(() => endGame(false), 900);
  }
};

function onEnemyHit(e, bullet, isExplosion = false, crit = false) {
  if (e === boss) {
    // BOSS 受击：暴击（核心）伤害翻倍
    const dmg = bullet.damage * (crit ? 2.5 : 1);
    e.hurt(dmg, ctx);
    return;
  }
  if (!isExplosion) {
    G.shotsHit++;
    const isRocket = bullet.type === BULLET.ROCKET;
    const dmg = bullet.damage * (isRocket ? 2 : 1);
    e.hurt(dmg, ctx);
  } else {
    e.hurt(bullet.damage, ctx);
  }
}

function onPlayerHit(bullet) {
  if (player.hurt(bullet.damage)) {
    effects.spark(_v.copy(player.pos).setY(player.pos.y + 1), 0xff4030, 6);
  }
}

// ------------------------------------------------------------------
// 镜头
// ------------------------------------------------------------------
function updateCamera(dt) {
  const p = player.pos;
  // 镜头跟随：玩家落在画面左三分之一，前方留出视野
  const lookAhead = 6.5;
  const camOffsetZ = 9.6;

  _camTarget.set(p.x + lookAhead * 0.16, 6.3 + p.y * 0.28, p.z * 0.42 + camOffsetZ);
  camera.position.x = damp(camera.position.x, _camTarget.x, 6.5, dt);
  camera.position.y = damp(camera.position.y, _camTarget.y, 6.0, dt);
  camera.position.z = damp(camera.position.z, _camTarget.z, 6.0, dt);

  // 抖动
  effects.shakeOffset(_shake);
  camera.position.add(_shake);

  // 注视点：略偏前方，抬高一点看地面
  _v.set(p.x + lookAhead * 0.72, 1.5 + p.y * 0.4, p.z * 0.5);
  camera.lookAt(_v);

  // 太阳光跟随，保证阴影贴图精度
  sun.position.set(p.x + 16, 26, p.z + 14);
  sun.target.position.set(p.x + 4, 0, p.z);
  sun.target.updateMatrixWorld();

  fill.position.set(p.x + 4, 4, p.z + 2);
}

// ------------------------------------------------------------------
// 主循环
// ------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 全局快捷键
  if (input.justPressed('KeyP') || input.justPressed('Escape')) {
    if (G.state === 'playing' || G.state === 'paused') togglePause();
  }
  if (input.justPressed('KeyM')) {
    audio.setMuted(!audio.muted);
    toast(audio.muted ? '静音' : '恢复音效');
  }

  if (G.state === 'playing') {
    G.time += dt;
    ctx.autoAim = G.autoAim;

    player.update(dt, input, camera, ctx);

    // BOSS 战期间锁定竞技场范围
    if (bossActive && boss) {
      const backLimit = boss.pos.x - 30;
      if (player.pos.x < backLimit) {
        player.pos.x = backLimit;
        player.vel.x = Math.max(0, player.vel.x);
      }
    }

    updateSpawning(dt);
    for (const e of enemies) {
      e.update(dt, player, { ...ctx, enemies });
    }

    checkBoss();
    updateBoss(dt);

    pickups.update(dt, player, onCollectPickup);

    bullets.update(dt, enemies, player, level.obstacles, onEnemyHit, onPlayerHit, boss);

    effects.update(dt);
    updateCamera(dt);
    updateHud();

    // 通关判定
    if (!G.bossSpawned && player.pos.x >= level.bossTrigger() - 4) {
      // 由 checkBoss 处理
    }
  } else if (G.state === 'menu') {
    // 菜单：镜头缓慢环绕展示
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.12) * 14, 6.4, Math.cos(t * 0.12) * 12);
    camera.lookAt(0, 1.4, 0);
    sun.position.set(Math.sin(t * 0.12) * 18, 26, Math.cos(t * 0.12) * 16);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    effects.update(dt);
  }

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) elToast.className = '';
  }

  input.endFrame();
  renderer.render(scene, camera);
}

function onCollectPickup(kind) {
  if (kind === 'health') {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    toast('医疗包 +1', '');
  } else if (kind === 'spread') {
    player.weapon = 'S';
    toast('获得散弹枪', '');
  } else if (kind === 'rapid') {
    player.weapon = 'R';
    toast('获得速射枪', '');
  } else if (kind === 'flame') {
    player.weapon = 'F';
    toast('获得火焰喷射器', '');
  } else if (kind === 'laser') {
    player.weapon = 'L';
    toast('获得激光枪', '');
  }
}

// ------------------------------------------------------------------
// UI 绑定
// ------------------------------------------------------------------
$('btn-start').addEventListener('click', () => { audio.uiClick(); startGame(); });
$('btn-resume').addEventListener('click', () => { audio.uiClick(); togglePause(false); });
$('btn-restart').addEventListener('click', () => { audio.uiClick(); startGame(); });
$('btn-again').addEventListener('click', () => { audio.uiClick(); startGame(); });
$('opt-autoaim').addEventListener('change', (e) => { G.autoAim = e.target.checked; });
$('opt-music').addEventListener('change', (e) => {
  G.musicWanted = e.target.checked;
  if (G.musicWanted && G.state === 'playing') audio.startMusic();
  else audio.stopMusic();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && G.state === 'menu') startGame();
});

// ------------------------------------------------------------------
// 尺寸
// ------------------------------------------------------------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// 首屏展示地形
level.build();
updateHud();
requestAnimationFrame(frame);

// 暴露调试接口（用 getter，避免 enemies 数组重建后引用过期）
window.__game = {
  G, player, level, scene, renderer, camera, effects, bullets, pickups,
  get enemies() { return enemies; },
  get boss() { return boss; },
  startGame, endGame, resetGame,
};
