// bossModels.js —— 各关 BOSS 的外观模型

import * as THREE from 'three';

const mat = (c, m = 0.55, r = 0.46, e = 0) => new THREE.MeshStandardMaterial({
  color: c, metalness: m, roughness: r,
  emissive: e ? c : 0x000000, emissiveIntensity: e,
});

/** 共用：核心（弱点），带脉动发光 */
function makeCore(radius = 0.34, color = 0xff5522) {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8 })
  );
  return core;
}

/** 共用：外壳装甲罩 */
function makeArmorShell(color = 0x4a5568) {
  const g = new THREE.Group();
  const m = mat(color, 0.6, 0.42);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 1.9), m);
    side.position.set(s * 1.35, 0, 0);
    g.add(side);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.26, 1.9), m);
  top.position.y = 0.85;
  g.add(top);
  return g;
}

// ============================================================
// BOSS 1：铁壁 · 重装机甲（已有，保留原实现）
// ============================================================
export function buildMech() {
  const g = new THREE.Group();
  const m = mat(0x4a5568, 0.55, 0.46);
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 2.4), m);
  chassis.position.y = 0.95;
  g.add(chassis);

  // 侧装甲板（让轮廓更厚重，不像一块光板）
  const shell = makeArmorShell(0x39414f);
  shell.position.y = 1.0;
  g.add(shell);

  // 尾部配重 + 排气管
  const pack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 2.0), mat(0x323a46, 0.5));
  pack.position.set(-1.5, 1.35, 0);
  g.add(pack);
  for (const s of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 8), mat(0x1b1f26, 0.8));
    pipe.position.set(-2.0, 1.9, s * 0.55);
    g.add(pipe);
  }

  const trackL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.72, 0.5), mat(0x23272f, 0.4));
  trackL.position.set(0, 0.4, 1.02);
  const trackR = trackL.clone();
  trackR.position.z = -1.02;
  g.add(trackL, trackR);

  // 履带轮
  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.56, 10), mat(0x181b20, 0.7));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-1.35 + i * 0.9, 0.38, 1.02);
    g.add(wheel);
  }

  const turret = new THREE.Group();
  turret.position.y = 1.5;
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.5, 10), mat(0x59657a)));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x64718a));
  dome.position.y = 0.24;
  turret.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 2.4, 10), mat(0x2b3039, 0.75));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.1, 1.4);
  turret.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.34, 10), mat(0x1c1f26, 0.8));
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.1, 2.5);
  turret.add(muzzle);
  const core = makeCore(0.34, 0xff5522);
  core.position.set(0, 0.42, 0.5);
  turret.add(core);
  turret.userData.core = core;
  g.add(turret);
  g.userData.parts = { turret, barrel, core, chassis, trackL, trackR };
  return g;
}

// ============================================================
// BOSS 2：重炮堡垒 —— 巨型固定炮台，双管 + 装甲基座
// ============================================================
export function buildFortress() {
  const g = new THREE.Group();
  const stone = mat(0x5a5148, 0.35, 0.7);
  const dark = mat(0x2c2a26, 0.5, 0.5);

  // 砖石基座
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 1.6, 8), stone);
  base.position.y = 0.8;
  g.add(base);
  // 塔身
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 2.2, 8), stone);
  tower.position.y = 2.7;
  g.add(tower);
  // 垛口
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.5), stone);
    merlon.position.set(Math.cos(a) * 2.0, 4.0, Math.sin(a) * 2.0);
    merlon.rotation.y = -a;
    g.add(merlon);
  }

  // 炮台头部
  const head = new THREE.Group();
  head.position.y = 4.1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a5f52));
  head.add(dome);
  // 双炮管
  const barrels = [];
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.0, 10), dark);
    b.rotation.x = Math.PI / 2;
    b.position.set(s * 0.55, 0.1, 1.6);
    head.add(b);
    barrels.push(b);
  }
  // 核心（塔顶弱点）
  const core = makeCore(0.42, 0xffaa22);
  core.position.set(0, 0.5, 0.4);
  head.add(core);
  g.add(head);

  // 侧翼炮台
  const wingL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.9, 8), dark);
  wingL.position.set(-2.5, 1.9, 0);
  const wingR = wingL.clone();
  wingR.position.x = 2.5;
  g.add(wingL, wingR);

  g.userData.parts = { turret: head, barrel: barrels[0], barrels, core, tower };
  return g;
}

// ============================================================
// BOSS 3：蜂巢母舰 —— 巨型浮空母舰 + 环绕无人机
// ============================================================
export function buildHive() {
  const g = new THREE.Group();
  const hull = mat(0x4a3a56, 0.55, 0.5);
  const glow = mat(0xff66aa, 0.3, 0.4, 1.6);

  // 母舰主体（倒锥形）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 0.9, 2.2, 8), hull);
  body.position.y = 2.6;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hull);
  cap.position.y = 3.7;
  g.add(cap);
  // 腹部发射舱
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 0.9, 8), mat(0x2c2236));
  belly.position.y = 1.2;
  g.add(belly);

  // 核心
  const core = makeCore(0.5, 0xff66aa);
  core.position.set(0, 2.7, 1.1);
  g.add(core);

  // 环绕机翼（4 片，可动）
  const wings = [];
  const wingMat = mat(0x5e4a6e);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const w = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.75), wingMat);
    blade.position.x = 1.5;
    w.add(blade);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), glow);
    tip.position.x = 2.8;
    w.add(tip);
    w.position.set(Math.cos(a) * 1.2, 2.6, Math.sin(a) * 1.2);
    w.rotation.y = -a;
    g.add(w);
    wings.push(w);
  }

  // 悬浮灯
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow);
    l.position.set((i - 1) * 1.1, 1.0, 0);
    g.add(l);
    lights.push(l);
  }

  g.userData.parts = { core, wings, lights, body, cap, belly };
  return g;
}

// ============================================================
// BOSS 4：鹰眼 · 狙击要塞 —— 巨型狙击炮台 + 护盾
// ============================================================
export function buildEagleEye() {
  const g = new THREE.Group();
  const cold = mat(0x516878, 0.62, 0.4);
  const ice = mat(0x9fe4ff, 0.2, 0.3, 1.4);

  // 三脚底座
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.0, 0.32), cold);
    leg.position.set(Math.cos(a) * 1.3, 1.5, Math.sin(a) * 1.3);
    leg.rotation.z = -Math.cos(a) * 0.32;
    leg.rotation.x = Math.sin(a) * 0.32;
    g.add(leg);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.8, 8), cold);
  hub.position.y = 3.1;
  g.add(hub);

  // 头部
  const head = new THREE.Group();
  head.position.y = 3.6;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), cold);
  head.add(dome);
  // 巨型狙击炮管
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 4.2, 10), mat(0x2a3238, 0.8, 0.3));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 2.3;
  head.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.4, 10), mat(0x1a2028, 0.85));
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = 4.4;
  head.add(muzzle);
  // 瞄准镜
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 10), mat(0x1e262e, 0.75));
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0, 0.55, 0.6);
  head.add(scope);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), ice);
  lens.position.set(0, 0.55, 0.62);
  head.add(lens);
  // 核心（眼部）
  const core = makeCore(0.36, 0x66ddff);
  core.position.set(0, 0.15, 0.95);
  head.add(core);
  g.add(head);

  // 护盾片
  const shields = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    sh.position.set(Math.cos(a) * 1.9, 3.4, Math.sin(a) * 1.9);
    sh.rotation.y = -a;
    g.add(sh);
    shields.push(sh);
  }

  g.userData.parts = { turret: head, barrel, core, shields, hub, lens };
  return g;
}

// ============================================================
// BOSS 5：炽炎 · 战争堡垒 —— 熔岩重炮，双层结构 + 熔核
// ============================================================
export function buildInferno() {
  const g = new THREE.Group();
  const iron = mat(0x3a2420, 0.6, 0.55);
  const lava = mat(0xff5510, 0.2, 0.4, 2.2);
  const obsidian = mat(0x1e1412, 0.4, 0.7);

  // 熔岩底座
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 1.2, 10), obsidian);
  base.position.y = 0.6;
  g.add(base);
  // 熔岩环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.16, 8, 24), lava);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.15;
  g.add(ring);

  // 主体
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 2.6), iron);
  body.position.y = 2.2;
  g.add(body);
  // 装甲鳍
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 1.8), obsidian);
    fin.position.set(s * 1.75, 2.4, 0);
    g.add(fin);
  }
  // 熔核裂缝
  for (let i = 0; i < 4; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.09, 0.22), lava);
    crack.position.set(0, 1.5 + i * 0.42, 1.32);
    g.add(crack);
  }

  // 主炮（仰角可调）
  const turret = new THREE.Group();
  turret.position.y = 3.3;
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.55, 8), iron);
  turret.add(mount);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.4, 10), mat(0x241a18, 0.75, 0.4));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 1.9;
  turret.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.5, 10), lava);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = 3.6;
  turret.add(muzzle);
  // 核心
  const core = makeCore(0.46, 0xff3300);
  core.position.set(0, 0.55, 0.6);
  turret.add(core);
  g.add(turret);

  // 侧翼发射器
  const launchers = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 6), mat(0x1a1210));
      tube.rotation.x = Math.PI / 2;
      tube.position.set((i - 1) * 0.32, 0, 0.5);
      lg.add(tube);
    }
    lg.position.set(s * 1.9, 1.9, 0.6);
    g.add(lg);
    launchers.push(lg);
  }

  g.userData.parts = { turret, barrel, core, launchers, body, base, ring };
  return g;
}

// ============================================================
// BOSS 6：终焉 · 指挥官 —— 巨型人形机甲（终局压迫感）
// ============================================================
export function buildCommander() {
  const g = new THREE.Group();
  const dark = mat(0x2a2440, 0.72, 0.34);
  const gold = mat(0xc8a04a, 0.85, 0.28);
  const energy = mat(0x8833ff, 0.3, 0.4, 2.0);

  // 腿
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.7), dark);
    thigh.position.y = -0.75;
    leg.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.3, 0.6), dark);
    shin.position.y = -2.1;
    leg.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.1), gold);
    foot.position.set(0, -2.9, 0.2);
    leg.add(foot);
    leg.position.set(s * 0.75, 4.4, 0);
    g.add(leg);
    legs.push(leg);
  }

  // 躯干
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.4), dark);
  torso.position.y = 4.6;
  g.add(torso);
  // 胸甲
  const chest = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.4), gold);
  chest.position.set(0, 4.9, 0.85);
  g.add(chest);
  // 核心（胸口）
  const core = makeCore(0.5, 0x9933ff);
  core.position.set(0, 4.9, 1.05);
  g.add(core);

  // 肩甲
  const shoulders = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.2), gold);
    sh.position.set(s * 1.65, 5.4, 0);
    g.add(sh);
    shoulders.push(sh);
  }

  // 头
  const head = new THREE.Group();
  head.position.y = 6.1;
  const helm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.9), dark);
  head.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.08), energy);
  visor.position.set(0, 0.1, 0.48);
  head.add(visor);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.8), gold);
  crest.position.set(0, 0.6, 0);
  head.add(crest);
  g.add(head);

  // 右臂巨炮
  const armR = new THREE.Group();
  armR.position.set(1.65, 5.3, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.6), dark);
  upper.position.y = -0.8;
  armR.add(upper);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 3.0, 10), mat(0x1c1830, 0.8, 0.32));
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -1.3, 1.6);
  armR.add(gun);
  const gm = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.5, 10), energy);
  gm.rotation.x = Math.PI / 2;
  gm.position.set(0, -1.3, 3.2);
  armR.add(gm);
  g.add(armR);

  // 左臂（近战能量刃）
  const armL = new THREE.Group();
  armL.position.set(-1.65, 5.3, 0);
  const lUpper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.6), dark);
  lUpper.position.y = -0.8;
  armL.add(lUpper);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.6), energy);
  blade.position.set(0, -1.6, 1.4);
  armL.add(blade);
  g.add(armL);

  g.userData.parts = { core, head, armR, armL, shoulders, legs, torso, blade, gun };
  return g;
}
