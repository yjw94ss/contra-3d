// models.js —— 纯几何体搭建场景与角色（无外部资源）

import * as THREE from 'three';
import { rand } from './util.js';

const _v = new THREE.Vector3();

/** 盒体人偶：躯干 + 头 + 四肢，可做行走/射击/跳跃姿态 */
export function makeHumanoid({
  torso = 0x2f6fd0, pants = 0x22304a, skin = 0xe8b98c,
  accent = 0xffcc33, scale = 1, helmet = 0x1e2a3d,
} = {}) {
  const g = new THREE.Group();
  const mat = (c, opts = {}) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.72, metalness: 0.08, ...opts,
  });

  const mTorso = mat(torso);
  const mPants = mat(pants);
  const mSkin = mat(skin);
  const mAccent = mat(accent, { roughness: 0.5, emissive: 0x331100, emissiveIntensity: 0.35 });
  const mHelmet = mat(helmet, { roughness: 0.55, metalness: 0.25 });

  // 躯干
  const torsoM = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.36), mTorso);
  torsoM.position.y = 1.06;
  g.add(torsoM);

  // 头 + 头盔
  const head = new THREE.Group();
  const headM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), mSkin);
  head.add(headM);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), mHelmet);
  helm.position.y = 0.19;
  head.add(helm);
  // 头盔帽檐（朝前）
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.16), mHelmet);
  brim.position.set(0, 0.13, 0.2);
  head.add(brim);
  head.position.y = 1.56;
  g.add(head);

  // 肩甲
  const shoulderGeo = new THREE.BoxGeometry(0.2, 0.18, 0.34);
  const shL = new THREE.Mesh(shoulderGeo, mAccent);
  shL.position.set(0.36, 1.3, 0);
  const shR = new THREE.Mesh(shoulderGeo, mAccent);
  shR.position.set(-0.36, 1.3, 0);
  g.add(shL, shR);

  // 手臂（枢轴在肩）
  const armGeo = new THREE.BoxGeometry(0.17, 0.5, 0.17);
  const armL = new THREE.Group();
  const aL = new THREE.Mesh(armGeo, mTorso);
  aL.position.y = -0.25;
  armL.add(aL);
  armL.position.set(0.38, 1.31, 0);
  const armR = new THREE.Group();
  const aR = new Mesh2(armGeo, mTorso);
  aR.position.y = -0.25;
  armR.add(aR);
  armR.position.set(-0.38, 1.31, 0);
  g.add(armL, armR);

  // 腿（枢轴在髋）
  const legGeo = new THREE.BoxGeometry(0.22, 0.62, 0.24);
  const legL = new THREE.Group();
  const lL = new THREE.Mesh(legGeo, mPants);
  lL.position.y = -0.31;
  legL.add(lL);
  legL.position.set(0.17, 0.72, 0);
  const legR = new THREE.Group();
  const lR = new THREE.Mesh(legGeo, mPants);
  lR.position.y = -0.31;
  legR.add(lR);
  legR.position.set(-0.17, 0.72, 0);
  g.add(legL, legR);

  // 枪（右手）
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), mat(0x2a2f38, { metalness: 0.5 }));
  gun.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.14), mat(0x181c22));
  grip.position.set(0, -0.14, -0.12);
  gun.add(grip);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.22), mat(0x3a4250));
  stock.position.set(0, -0.02, -0.34);
  gun.add(stock);
  gun.position.set(0, -0.42, 0.1);
  gun.rotation.x = -Math.PI / 2;   // 指向 +Z（面朝方向）
  armR.add(gun);

  // 背包
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.2), mat(0x2c3a2e, { roughness: 0.85 }));
  pack.position.set(0, 1.1, -0.26);
  g.add(pack);

  g.userData.parts = { torsoM, head, armL, armR, legL, legR, gun, shL, shR };
  g.scale.setScalar(scale);
  return g;
}

// 小工具：避免变量名与 THREE.Mesh 混淆
function Mesh2(geo, mat) { return new THREE.Mesh(geo, mat); }

/** 敌人：士兵（红黑配色，红色眼睛发光） */
export function makeSoldier() {
  const g = makeHumanoid({
    torso: 0x8c2b2b, pants: 0x2a2028, skin: 0xd8a878,
    accent: 0x3a3a44, helmet: 0x24242e, scale: 0.95,
  });
  // 发光眼睛
  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.05, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2000, emissiveIntensity: 2.4 })
  );
  eye.position.set(0, 1.56, 0.17);
  g.add(eye);
  return g;
}

/** 无人机：小四旋翼 */
export function makeDrone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.4 })
  );
  g.add(body);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2000, emissiveIntensity: 2.6 })
  );
  eye.position.set(0, 0, 0.25);
  g.add(eye);
  const rotorGeo = new THREE.BoxGeometry(0.62, 0.02, 0.1);
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2, transparent: true, opacity: 0.42, roughness: 0.3, metalness: 0.5,
  });
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(rotorGeo, rotorMat);
    const a = (i / 4) * Math.PI * 2;
    r.position.set(Math.cos(a) * 0.36, 0.13, Math.sin(a) * 0.36);
    r.rotation.y = a;
    g.add(r);
    rotors.push(r);
  }
  g.userData.rotors = rotors;
  return g;
}

/** 炮台：底座 + 炮管 */
export function makeTurret() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 0.42, 10),
    new THREE.MeshStandardMaterial({ color: 0x445066, metalness: 0.55, roughness: 0.5 })
  );
  base.position.y = 0.21;
  g.add(base);
  const head = new THREE.Group();
  head.position.y = 0.42;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x556175, metalness: 0.6, roughness: 0.42 })
  );
  head.add(dome);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 1.05, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b313c, metalness: 0.72, roughness: 0.35 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.55;
  head.add(barrel);
  g.add(head);
  g.userData.parts = { head, barrel };
  return g;
}

/** 狙击手：加装瞄准镜与长管 */
export function makeSniper() {
  const g = makeSoldier();
  const scope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1e25, metalness: 0.7, roughness: 0.3 })
  );
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.38, 1.16, 0.2);
  g.add(scope);
  return g;
}

/** 敌方坦克/BOSS 底盘 */
export function makeMechBody() {
  const g = new THREE.Group();
  const mat = (c, m = 0.55) => new THREE.MeshStandardMaterial({
    color: c, metalness: m, roughness: 0.46,
  });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 2.4), mat(0x4a5568));
  chassis.position.y = 0.95;
  g.add(chassis);
  const trackL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.72, 0.5), mat(0x23272f, 0.4));
  trackL.position.set(0, 0.4, 1.02);
  const trackR = trackL.clone();
  trackR.position.z = -1.02;
  g.add(trackL, trackR);
  const turret = new THREE.Group();
  turret.position.y = 1.5;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.5, 10), mat(0x59657a));
  turret.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x64718a));
  dome.position.y = 0.24;
  turret.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 2.4, 10), mat(0x2b3039, 0.75));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.1, 1.4);
  turret.add(barrel);
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.22, 0.34, 10),
    mat(0x1c1f26, 0.8)
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.1, 2.5);
  turret.add(muzzle);
  // 核心（弱点）
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff4400, emissiveIntensity: 1.8 })
  );
  core.position.set(0, 0.42, 0.5);
  turret.add(core);
  turret.userData.core = core;
  g.add(turret);
  g.userData.parts = { turret, barrel, core, chassis, trackL, trackR };
  return g;
}

/** 悬浮炮台（BOSS 附属） */
export function makeHoverTurret() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 2),
    new THREE.MeshStandardMaterial({ color: 0x3d4759, metalness: 0.7, roughness: 0.35 })
  );
  g.add(dome);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.85, 8),
    new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.8, roughness: 0.3 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.52;
  g.add(barrel);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffaa00, emissiveIntensity: 2 })
  );
  light.position.set(0, 0.42, 0.2);
  g.add(light);
  g.userData.parts = { barrel };
  return g;
}

/** 工业支架 / 电线杆（工业、熔岩、终焉主题用） */
export function makePylon() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a6472, metalness: 0.68, roughness: 0.45 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 5.2, 7), metal);
  pole.position.y = 2.6;
  g.add(pole);
  const armGeo = new THREE.BoxGeometry(2.6, 0.14, 0.14);
  for (const y of [4.3, 3.6]) {
    const arm = new THREE.Mesh(armGeo, metal);
    arm.position.y = y;
    g.add(arm);
  }
  // 顶部警示灯
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff5030, emissive: 0xff2200, emissiveIntensity: 2.2 })
  );
  lamp.position.y = 5.25;
  g.add(lamp);
  // 底座
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.4, 8), metal);
  base.position.y = 0.2;
  g.add(base);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 横躺的管道（工业、雪地主题用） */
export function makePipe() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6e7684, metalness: 0.6, roughness: 0.5 });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 4.2, 10), mat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.y = 0.42;
  g.add(pipe);
  // 法兰
  const flangeGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.16, 10);
  for (const x of [-1.6, 1.6]) {
    const f = new THREE.Mesh(flangeGeo, mat);
    f.rotation.z = Math.PI / 2;
    f.position.set(x, 0.42, 0);
    g.add(f);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 木箱掩体 */
export function makeCrate() {  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.4, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x8a6134, roughness: 0.9 })
  );
  body.position.y = 0.7;
  g.add(body);
  const edgeGeo = new THREE.BoxGeometry(1.56, 0.12, 1.56);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x5e4225, roughness: 0.85 });
  for (const y of [0.18, 1.22]) {
    const e = new THREE.Mesh(edgeGeo, edgeMat);
    e.position.y = y;
    g.add(e);
  }
  return g;
}

/** 金属路障 */
export function makeBarrier() {
  const g = new THREE.Group();
  const legMat = new THREE.MeshStandardMaterial({ color: 0x6c7688, metalness: 0.6, roughness: 0.5 });
  const legGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
  for (const z of [-0.55, 0.55]) {
    for (const x of [-0.62, 0.62]) {
      const l = new THREE.Mesh(legGeo, legMat);
      l.position.set(x, 0.52, z);
      g.add(l);
    }
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 0.14), legMat);
  bar.position.y = 1.0;
  g.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 0.14), legMat);
  bar2.position.y = 0.62;
  g.add(bar2);
  return g;
}

/** 灌木/装饰 */
export function makeBush() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 1.0, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + Math.random() * 0.22, 0), m);
    b.position.set((Math.random() - 0.5) * 0.7, 0.36 + Math.random() * 0.2, (Math.random() - 0.5) * 0.7);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

/** 补给箱（可拾取物） */
export function makePickup(kind) {
  const g = new THREE.Group();
  if (kind === 'health') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 })
    );
    box.position.y = 0.22;
    g.add(box);
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.47), new THREE.MeshStandardMaterial({ color: 0xe03030, emissive: 0x880000, emissiveIntensity: 0.6 }));
    cross1.position.y = 0.22;
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.47), new THREE.MeshStandardMaterial({ color: 0xe03030, emissive: 0x880000, emissiveIntensity: 0.6 }));
    cross2.position.y = 0.22;
    g.add(cross1, cross2);
  } else if (kind === 'spread') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x5a4bd8, roughness: 0.7 })
    );
    box.position.y = 0.22;
    g.add(box);
    const spr = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffaa00, emissiveIntensity: 1.2 }));
    spr.position.y = 0.26;
    g.add(spr);
  } else if (kind === 'rapid') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x2aa86a, roughness: 0.7 })
    );
    box.position.y = 0.22;
    g.add(box);
    const spr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x9effc0, emissive: 0x33ff88, emissiveIntensity: 1.4 }));
    spr.position.y = 0.24;
    g.add(spr);
  } else if (kind === 'flame') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xe06020, roughness: 0.7 })
    );
    box.position.y = 0.22;
    g.add(box);
    const spr = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xff6600, emissiveIntensity: 2.2 }));
    spr.position.y = 0.24;
    g.add(spr);
  } else { // laser
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x2a8fd8, roughness: 0.7 })
    );
    box.position.y = 0.22;
    g.add(box);
    const spr = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0xaef0ff, emissive: 0x22ccff, emissiveIntensity: 2.4 }));
    spr.position.y = 0.24;
    g.add(spr);
  }
  g.userData.kind = kind;
  return g;
}

/** 地形：主地面 + 侧墙 + 远景山丘
 *  @param {number} length  地面长度
 *  @param {number} centerX 地面中心 X（保证关卡全长都在地面上）
 *  @param {object} theme  主题配色（来自 stages.js）
 */
export function makeTerrain(length = 400, centerX = 0, theme = null) {
  const g = new THREE.Group();
  const T = theme || {};
  const groundMat = new THREE.MeshStandardMaterial({ color: T.ground ?? 0x4a5a46, roughness: 0.96 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(length, 52), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = centerX;
  ground.receiveShadow = true;
  g.add(ground);

  // 车道（略高一层，颜色不同，走起来有层次）
  const roadMat = new THREE.MeshStandardMaterial({ color: T.road ?? 0x5a5a64, roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(length, 15), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(centerX, 0.02, 0);
  road.receiveShadow = true;
  g.add(road);

  // 侧墙
  const wallMat = new THREE.MeshStandardMaterial({ color: T.wall ?? 0x39424e, roughness: 0.9 });
  for (const z of [-11.6, 11.6]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 2.6, 1.2), wallMat);
    wall.position.set(centerX, 1.3, z);
    g.add(wall);
  }

  // 远景山丘（视差背景）
  const x0 = centerX - length / 2;
  const hillMat = new THREE.MeshStandardMaterial({ color: T.hill ?? 0x33424f, roughness: 1, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(6 + Math.random() * 9, 7 + Math.random() * 13, 5), hillMat);
    h.position.set(x0 + Math.random() * length, 2 + Math.random() * 3, -34 - Math.random() * 46);
    g.add(h);
  }
  const hillMat2 = new THREE.MeshStandardMaterial({ color: T.hillFar ?? 0x2a3742, roughness: 1, flatShading: true });
  for (let i = 0; i < 32; i++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(8 + Math.random() * 11, 9 + Math.random() * 15, 6), hillMat2);
    h.position.set(x0 + Math.random() * length, 2 + Math.random() * 4, 36 + Math.random() * 44);
    g.add(h);
  }

  // 星空（仅夜景主题）
  if (!theme || theme.theme !== 'lava') {
    const starGeo = new THREE.BufferGeometry();
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 900;
      pos[i * 3 + 1] = 40 + Math.random() * 190;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 900;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85,
    }));
    g.add(stars);
  }

  // 主题化环境粒子（雪/火星/沙尘）
  const weather = T.theme;
  if (weather === 'snow' || weather === 'lava' || weather === 'desert') {
    const count = weather === 'snow' ? 1400 : 900;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(count * 3);
    const pVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 160;
      pPos[i * 3 + 1] = Math.random() * 40;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      pVel[i] = weather === 'snow' ? rand(1.4, 0.4) : weather === 'lava' ? rand(4.5, 1.5) : rand(0.7, 0.1);
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pColor = weather === 'snow' ? 0xffffff : weather === 'lava' ? 0xff7020 : 0xd8c090;
    const pSize = weather === 'snow' ? 1.4 : weather === 'lava' ? 2.2 : 1.0;
    const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: pColor, size: pSize, sizeAttenuation: false,
      transparent: true, opacity: weather === 'snow' ? 0.7 : 0.55,
      blending: weather === 'lava' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    }));
    pts.userData.vel = pVel;
    pts.userData.kind = weather;
    g.add(pts);
    g.userData.weather = pts;
  }

  return g;
}
