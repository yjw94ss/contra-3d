// main.js —— 主循环、场景、镜头、HUD、状态机

import * as THREE from 'three';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { Audio } from './audio.js';
import { Effects } from './effects.js';
import { Bullets, BULLET } from './bullets.js';
import { Player, WEAPONS } from './player.js';
import { Enemy } from './enemies.js';
import { createBoss } from './boss.js';
import { Pickups } from './pickups.js';
import { Level } from './level.js';
import { STAGES, getStage } from './stages.js';
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
const elStageName = $('hud-stage-name');
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
const elStageIntro = $('stage-intro');
const elSiNum = $('si-num');
const elSiName = $('si-name');
const elSiSub = $('si-sub');
const elSiBoss = $('si-boss');
const screenClear = $('screen-clear');
const elClearTitle = $('clear-title');
const elClearSub = $('clear-sub');
const elClearStats = $('clear-stats');

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
const touch = new TouchControls(canvas, input);
// 触屏设备启用触控层，并切换开始界面的键位说明
if (TouchControls.shouldEnable()) {
  touch.enable();
  document.getElementById('keys-desktop').classList.add('hidden');
  document.getElementById('keys-touch').classList.remove('hidden');
}
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
  state: 'menu',        // menu / playing / paused / over / clear / intro
  score: 0,
  stage: 1,
  stageConfig: STAGES[0],
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
  stageKills: 0,        // 当前关卡击破数
  stageScore: 0,        // 当前关卡得分
  stageStartedAt: 0,
  totalTime: 0,         // 累计游戏时间
  arenaMinX: null,     // BOSS 竞技场后界（固定，不跟 BOSS 走）
};

/** 应用关卡主题到场景与灯光 */
function applyTheme(cfg) {
  scene.background = new THREE.Color(cfg.sky);
  // 必须是 THREE.Fog 实例，不能直接赋 Color（否则 .near/.far 无效且渲染异常）
  if (!(scene.fog instanceof THREE.Fog)) scene.fog = new THREE.Fog(cfg.fog, cfg.fogNear, cfg.fogFar);
  else scene.fog.color.setHex(cfg.fog);
  scene.fog.near = cfg.fogNear;
  scene.fog.far = cfg.fogFar;
  hemi.color.setHex(cfg.hemiSky);
  hemi.groundColor.setHex(cfg.hemiGround);
  hemi.intensity = 0.95;
  sun.color.setHex(cfg.sunColor);
  sun.intensity = cfg.sunIntensity;
  rim.color.setHex(cfg.hemiSky);
  fill.color.setHex(cfg.sunColor);
  fill.intensity = 0.7;
}

/** 清理当前关卡的所有实体（保留玩家与场景） */
function clearStageEntities() {
  for (const e of enemies) scene.remove(e.mesh);
  enemies = [];
  bullets.clear();
  pickups.clear();
  for (const it of effects.items) scene.remove(it.obj);
  effects.items.length = 0;
  if (boss) { boss.dispose(); boss = null; }
  bossActive = false;
}

/** 载入指定关卡（不含过场动画） */
function loadStage(id) {
  clearStageEntities();

  const cfg = getStage(id);
  G.stage = id;
  G.stageConfig = cfg;
  applyTheme(cfg);

  level.build(cfg);

  player.reset(0, 0);
  player.weapon = 'M';

  G.time = 0;
  G.spawnTimer = 1.2;
  G.clearedSpawns.clear();
  G.stageKills = 0;
  G.stageScore = 0;
  G.stageStartedAt = performance.now();
  G.bossSpawned = false;
  G.arenaMinX = null;

  camera.position.set(-6, 6.2, 9.5);
  elBossBar.classList.add('hidden');
  updateHud();
}

/** 重开整局（从第一关开始） */
function resetGame() {
  G.score = 0;
  G.kills = 0;
  G.shotsFired = 0;
  G.shotsHit = 0;
  G.startedAt = performance.now();
  G.totalTime = 0;
  player.lives = 3;
  loadStage(1);
}

function startGame() {
  audio.init();
  audio.resume();
  resetGame();
  G.state = 'playing';
  screenStart.classList.add('hidden');
  screenOver.classList.add('hidden');
  screenPause.classList.add('hidden');
  screenClear.classList.add('hidden');
  hud.classList.remove('hidden');
  if (G.musicWanted) audio.startMusic();
  showStageIntro(1, () => {
    toast('任务开始', 'warn');
  });
}

/** 关卡过场动画 */
function showStageIntro(id, onDone) {
  const cfg = getStage(id);
  G.state = 'intro';

  elSiNum.textContent = id;
  elSiName.textContent = cfg.name;
  elSiSub.textContent = cfg.subtitle;
  elSiBoss.textContent = `敌方 BOSS · ${cfg.bossName}`;
  elStageIntro.classList.remove('hidden');

  // 强制回流，确保过渡动画触发
  void elStageIntro.offsetWidth;
  requestAnimationFrame(() => elStageIntro.classList.add('show'));

  setTimeout(() => {
    elStageIntro.classList.remove('show');
    setTimeout(() => {
      elStageIntro.classList.add('hidden');
      G.state = 'playing';
      // 过场期间音乐被停掉，这里恢复（否则第一关之后就没 BGM 了）
      if (G.musicWanted) audio.startMusic();
      if (onDone) onDone();
    }, 550);
  }, 1900);
}

/** 关卡完成 → 结算界面 */
function stageCleared() {
  G.state = 'clear';
  audio.stopMusic();
  const cfg = G.stageConfig;
  const secs = (performance.now() - G.stageStartedAt) / 1000;
  const isLast = G.stage >= STAGES.length;

  elClearTitle.textContent = isLast ? '全面胜利' : '区域肃清';
  elClearSub.textContent = isLast
    ? '敌方指挥官已被击毁，战争结束'
    : `${cfg.name} 已肃清`;

  const acc = G.shotsFired > 0 ? Math.round((G.shotsHit / G.shotsFired) * 100) : 0;
  elClearStats.innerHTML = `
    <div><span>本关得分</span><span>${G.stageScore.toLocaleString()}</span></div>
    <div><span>本关击破</span><span>${G.stageKills}</span></div>
    <div><span>用时</span><span>${secs.toFixed(0)} 秒</span></div>
    <div><span>命中率</span><span>${acc}%</span></div>
    <div><span>剩余生命</span><span>${player.lives}</span></div>
    <div><span>累计总分</span><span>${G.score.toLocaleString()}</span></div>
  `;
  $('btn-next').textContent = isLast ? '查看总成绩' : '进入下一关';
  screenClear.classList.remove('hidden');
}

/** 进入下一关 */
function nextStage() {
  screenClear.classList.add('hidden');
  if (G.stage >= STAGES.length) {
    endGame(true);
    return;
  }
  const next = G.stage + 1;
  // 过关奖励：补一条命（最多 5 条），并回满血
  player.lives = Math.min(5, player.lives + 1);
  loadStage(next);
  showStageIntro(next, () => {
    toast(`第 ${next} 关 · ${getStage(next).name}`, 'warn');
  });
}

function endGame(win) {
  G.state = 'over';
  audio.stopMusic();
  elOverTitle.textContent = win ? '任务完成' : '任务失败';
  elOverSub.textContent = win
    ? '全部六个区域已肃清，防线守住了'
    : `第 ${G.stage} 关 · ${G.stageConfig.name} 防线失守`;
  const secs = (performance.now() - G.startedAt) / 1000;
  const acc = G.shotsFired > 0 ? Math.round((G.shotsHit / G.shotsFired) * 100) : 0;
  elOverStats.innerHTML = `
    <div><span>总得分</span><span>${G.score.toLocaleString()}</span></div>
    <div><span>击毁敌人</span><span>${G.kills}</span></div>
    <div><span>命中率</span><span>${acc}%</span></div>
    <div><span>总用时</span><span>${secs.toFixed(0)} 秒</span></div>
    <div><span>剩余生命</span><span>${player.lives}</span></div>
    <div><span>到达关卡</span><span>${G.stage} / ${STAGES.length}</span></div>
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
  if (G.stageConfig) elStageName.textContent = G.stageConfig.name;

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
    const cfg = G.stageConfig;
    boss = createBoss(scene, audio, effects, cfg.boss, trigger + 42, cfg.bossName);
    // BOSS 战场：把玩家推进到 BOSS 正前方，避免隔着几百米对射
    player.pos.x = trigger - 16;
    player.pos.z = 0;
    player.vel.set(0, 0, 0);
    // 竞技场后界固定在触发点后方（不能跟着 BOSS 走，否则会把玩家一路往前拖）
    G.arenaMinX = trigger - 26;
    elBossBar.classList.remove('hidden');
    elBossFill.style.width = '100%';
    document.querySelector('.boss-name').textContent = cfg.bossName;
    audio.bossAlert();
    toast(`警告：${cfg.bossName} 接近`, 'danger');
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
    toast(`${G.stageConfig.bossName} 已摧毁！`, 'warn');
    audio.stageClear();
    // 结算本关（带状态守卫，避免在重开/死亡后误触发）
    const deadStage = G.stage;
    setTimeout(() => {
      if (G.stage === deadStage && (G.state === 'playing' || G.state === 'clear')) stageCleared();
    }, 2200);
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
  /** 加分。opts.kill=true 时同时计入击破数（普通敌人死亡时传 true） */
  addScore: (amount, pos, opts = {}) => {
    G.score += amount;
    G.stageScore += amount;
    if (opts.kill) {
      G.kills++;
      G.stageKills++;
    }
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
    // 注意：命中也要计入 shotsHit，否则打 BOSS 时命中率一直是 0
    if (!isExplosion) G.shotsHit++;
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
  let camOffsetZ = 9.6;
  let focusX = p.x + lookAhead * 0.72;   // 注视点
  let camShiftX = lookAhead * 0.16;      // 镜头自身偏移

  // ---------- BOSS 战：自适应取景，把玩家和 BOSS 一起框进画面 ----------
  if (bossActive && boss) {
    const b = boss.pos;
    const midX = (p.x + b.x) * 0.5;
    const midZ = (p.z + b.z) * 0.5;
    const span = Math.abs(b.x - p.x);
    const spanZ = Math.abs(b.z - p.z);

    // 需要框下的横向/纵深跨度（留出余量）
    const halfSpan = span * 0.5 + 5.5;
    const halfSpanZ = spanZ * 0.5 + 4.5;

    // 水平半视角的正切
    const hHalf = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    // 垂直半视角的正切（纵深靠镜头抬高来覆盖）
    const vHalf = Math.tan((camera.fov * Math.PI) / 360);

    // 由跨度反推需要的相机距离
    const needDist = Math.max(halfSpan / hHalf, halfSpanZ / vHalf);
    // 视线轴长度 = sqrt(水平距离² + 高度差²)
    const heightDrop = 4.8;
    const zNeeded = Math.sqrt(Math.max(9, needDist * needDist - heightDrop * heightDrop));
    camOffsetZ = clamp(zNeeded, 9.6, 22);

    focusX = midX;
    camShiftX = 0;                 // BOSS 战时镜头对准中点
    _camTarget.set(focusX, 6.3 + p.y * 0.28, midZ * 0.42 + camOffsetZ);
  } else {
    _camTarget.set(p.x + camShiftX, 6.3 + p.y * 0.28, p.z * 0.42 + camOffsetZ);
  }

  camera.position.x = damp(camera.position.x, _camTarget.x, 6.5, dt);
  camera.position.y = damp(camera.position.y, _camTarget.y, 6.0, dt);
  camera.position.z = damp(camera.position.z, _camTarget.z, 6.0, dt);

  // 抖动
  effects.shakeOffset(_shake);
  camera.position.add(_shake);

  // 注视点：略偏前方，抬高一点看地面
  _v.set(focusX, 1.5 + p.y * 0.4, p.z * 0.5);
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

  // 触控状态每帧同步（菜单态也要更新，进去才不丢坐标）
  touch.applyTo(input);

  if (G.state === 'playing') {
    G.time += dt;
    ctx.autoAim = G.autoAim;

    player.update(dt, input, camera, ctx);

    // BOSS 战期间锁定竞技场范围
    if (bossActive && boss) {
      // 后界固定，不随 BOSS 位移（否则玩家会被一路拖走）
      const backLimit = G.arenaMinX ?? (boss.pos.x - 30);
      if (player.pos.x < backLimit) {
        player.pos.x = backLimit;
        player.vel.x = Math.max(0, player.vel.x);
      }
      // 前界：不让玩家跑到 BOSS 身后去
      const frontLimit = boss.pos.x - 6;
      if (player.pos.x > frontLimit) {
        player.pos.x = frontLimit;
        player.vel.x = Math.min(0, player.vel.x);
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
    level.update(dt);
    updateCamera(dt);
    updateHud();
  } else if (G.state === 'menu') {
    // 菜单：镜头缓慢环绕展示
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.12) * 14, 6.4, Math.cos(t * 0.12) * 12);
    camera.lookAt(0, 1.4, 0);
    sun.position.set(Math.sin(t * 0.12) * 18, 26, Math.cos(t * 0.12) * 16);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    effects.update(dt);
    level.update(dt);
  } else if (G.state === 'intro') {
    // 过场：镜头固定在起点缓缓平移
    const t = performance.now() / 1000;
    camera.position.set(-4 + t * 0.8, 6.2, 9.6);
    camera.lookAt(6, 1.4, 0);
    effects.update(dt);
    level.update(dt);
  } else if (G.state === 'clear') {
    // 关卡结算：镜头停留在战场
    effects.update(dt);
    level.update(dt);
    updateCamera(dt);
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
$('btn-next').addEventListener('click', () => { audio.uiClick(); nextStage(); });
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
level.build(STAGES[0]);
updateHud();
requestAnimationFrame(frame);

// 暴露调试接口（用 getter，避免 enemies 数组重建后引用过期）
window.__game = {
  G, player, level, scene, renderer, camera, effects, bullets, pickups,
  get enemies() { return enemies; },
  get boss() { return boss; },
  startGame, endGame, resetGame,
  // 调试用：直接跳到指定关卡
  __jumpStage(id) {
    loadStage(id);
    G.state = 'playing';
  },
};
