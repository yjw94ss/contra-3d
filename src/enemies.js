// enemies.js —— 敌人 AI：步兵 / 冲锋兵 / 狙击手 / 炮台 / 无人机

import * as THREE from 'three';
import { clamp, damp, rand, randInt, chance, pick } from './util.js';
import { makeSoldier, makeDrone, makeTurret, makeSniper } from './models.js';
import { BULLET } from './bullets.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();

export const ENEMY_TYPES = {
  soldier: {
    hp: 3, speed: 3.0, score: 100, fireRate: 1.5, range: 22, damage: 1,
    radius: 0.62, hitRadius: 0.68, color: 0x8c2b2b,
  },
  runner: {
    hp: 2, speed: 6.4, score: 160, fireRate: 0.85, range: 18, damage: 1,
    radius: 0.55, hitRadius: 0.6, color: 0xc2622b,
  },
  sniper: {
    hp: 2, speed: 2.0, score: 260, fireRate: 2.4, range: 42, damage: 2,
    radius: 0.6, hitRadius: 0.66, color: 0x2b6b8c, sniper: true,
  },
  turret: {
    hp: 8, speed: 0, score: 320, fireRate: 1.15, range: 30, damage: 1,
    radius: 0.75, hitRadius: 0.85, color: 0x445066, static: true,
  },
  drone: {
    hp: 2, speed: 4.6, score: 220, fireRate: 1.05, range: 20, damage: 1,
    radius: 0.42, hitRadius: 0.5, color: 0x3a3f4a, flying: true,
  },
  heavy: {
    hp: 14, speed: 1.7, score: 700, fireRate: 0.62, range: 26, damage: 2,
    radius: 0.9, hitRadius: 1.0, color: 0x4a2b6b, heavy: true,
  },
};

export class Enemy {
  constructor(type, x, z, scene, audio, effects) {
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.scene = scene;
    this.audio = audio;
    this.fx = effects;

    this.pos = new THREE.Vector3(x, this.def.flying ? rand(2.6, 1.8) : 0, z);
    this.vel = new THREE.Vector3();
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.dead = false;
    this.fireTimer = rand(1.2, 0.3);
    this.facing = Math.PI;         // 默认朝 -X（面向玩家推进方向）
    this.hitRadius = this.def.hitRadius;
    this.hitFlash = 0;
    this.animT = rand(10);
    this.strafeDir = chance(0.5) ? 1 : -1;
    this.strafeTimer = rand(2.5, 1);
    this.aggro = false;
    this.spawnT = 0;
    this.dropChance = type === 'heavy' ? 1 : type === 'runner' ? 0.22 : 0.14;

    this.mesh = this.buildMesh(type);
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
  }

  buildMesh(type) {
    let m;
    if (type === 'drone') m = makeDrone();
    else if (type === 'turret') m = makeTurret();
    else if (type === 'sniper') m = makeSniper();
    else if (type === 'heavy') {
      m = makeSoldier();
      m.scale.setScalar(1.35);
      // 重装兵加装甲板
      const armorMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, metalness: 0.7, roughness: 0.4 });
      const pa = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), armorMat);
      pa.position.set(0, 1.08, 0.14);
      m.add(pa);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 0.5), armorMat);
      sh.position.set(0, 1.42, 0);
      m.add(sh);
    } else if (type === 'runner') {
      m = makeSoldier();
      m.scale.setScalar(0.88);
    } else {
      m = makeSoldier();
    }
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return m;
  }

  update(dt, player, ctx) {
    if (this.dead) return;
    this.spawnT += dt;
    this.fireTimer -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.animT += dt;

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // 面朝玩家
    const faceTarget = Math.atan2(dx, dz);
    let diff = faceTarget - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, dt * 6);
    this.mesh.rotation.y = this.facing;

    switch (this.type) {
      case 'soldier': this.aiSoldier(dt, player, ctx, dx, dz, dist); break;
      case 'runner': this.aiRunner(dt, player, ctx, dx, dz, dist); break;
      case 'sniper': this.aiSniper(dt, player, ctx, dx, dz, dist); break;
      case 'turret': this.aiTurret(dt, player, ctx, dx, dz, dist); break;
      case 'drone': this.aiDrone(dt, player, ctx, dx, dz, dist); break;
      case 'heavy': this.aiHeavy(dt, player, ctx, dx, dz, dist); break;
    }

    // 受击闪白
    this.applyFlash();

    // 出场动画：前 0.35s 从地下/远处升起
    if (this.spawnT < 0.35) {
      const k = this.spawnT / 0.35;
      this.mesh.scale.setScalar((this.type === 'heavy' ? 1.35 : 1) * (0.6 + 0.4 * k));
      this.mesh.position.y = this.pos.y - (1 - k) * 1.4;
    } else {
      this.mesh.scale.setScalar(this.type === 'heavy' ? 1.35 : this.type === 'runner' ? 0.88 : 1);
      this.mesh.position.y = this.pos.y;
    }
  }

  // ---------- 各类 AI ----------
  aiSoldier(dt, player, ctx, dx, dz, dist) {
    // 缓慢推进，接近到一定距离后停下开火
    const ideal = 9;
    if (dist > ideal + 2) {
      this.vel.x = damp(this.vel.x, (dx / dist) * this.def.speed, 6, dt);
      this.vel.z = damp(this.vel.z, (dz / dist) * this.def.speed, 6, dt);
    } else if (dist < ideal - 3) {
      this.vel.x = damp(this.vel.x, -(dx / dist) * this.def.speed * 0.6, 6, dt);
      this.vel.z = damp(this.vel.z, -(dz / dist) * this.def.speed * 0.6, 6, dt);
    } else {
      // 侧移躲避
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = rand(2.2, 1.1); }
      this.vel.x = damp(this.vel.x, (-dz / dist) * this.def.speed * 0.7 * this.strafeDir, 6, dt);
      this.vel.z = damp(this.vel.z, (dx / dist) * this.def.speed * 0.7 * this.strafeDir, 6, dt);
    }
    this.applyMove(dt, ctx);
    this.tryFire(player, ctx, dist, 1, 30);
    this.walkAnim(dt);
  }

  aiRunner(dt, player, ctx, dx, dz, dist) {
    // 冲锋兵：直冲 + 冲接近战
    if (dist > 1.6) {
      this.vel.x = damp(this.vel.x, (dx / dist) * this.def.speed, 9, dt);
      this.vel.z = damp(this.vel.z, (dz / dist) * this.def.speed, 9, dt);
    }
    this.applyMove(dt, ctx);
    this.tryFire(player, ctx, dist, 1, 32);
    this.walkAnim(dt, 1.4);
  }

  aiSniper(dt, player, ctx, dx, dz, dist) {
    // 狙击手：保持距离，超出则靠近，太近则后撤
    const ideal = 20;
    if (dist > ideal + 5) {
      this.vel.x = damp(this.vel.x, (dx / dist) * this.def.speed * 1.4, 5, dt);
      this.vel.z = damp(this.vel.z, (dz / dist) * this.def.speed * 1.4, 5, dt);
    } else if (dist < ideal - 6) {
      this.vel.x = damp(this.vel.x, -(dx / dist) * this.def.speed * 1.4, 5, dt);
      this.vel.z = damp(this.vel.z, -(dz / dist) * this.def.speed * 1.4, 5, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 5, dt);
      this.vel.z = damp(this.vel.z, 0, 5, dt);
    }
    this.applyMove(dt, ctx);
    this.tryFire(player, ctx, dist, 1, 70, BULLET.SNIPER);
    this.walkAnim(dt);
  }

  aiTurret(dt, player, ctx, dx, dz, dist) {
    this.vel.set(0, 0, 0);
    this.applyMove(dt, ctx);
    // 炮管跟随玩家
    const head = this.mesh.userData.parts.head;
    if (head) {
      const local = Math.atan2(dx, dz) - this.facing;
      head.rotation.y = damp(head.rotation.y, local, 8, dt);
    }
    this.tryFire(player, ctx, dist, 1, 42, BULLET.ENEMY, 0.09);
  }

  aiDrone(dt, player, ctx, dx, dz, dist) {
    // 无人机：悬停 + 绕圈 + 俯冲射击
    const t = this.animT;
    const orbitR = 6;
    const tx = player.pos.x - Math.cos(t * 0.9) * orbitR;
    const tz = player.pos.z - Math.sin(t * 0.9) * orbitR * 0.5;
    this.vel.x = damp(this.vel.x, (tx - this.pos.x) * 1.6, 4, dt);
    this.vel.z = damp(this.vel.z, (tz - this.pos.z) * 1.6, 4, dt);
    this.pos.y = damp(this.pos.y, 2.2 + Math.sin(t * 2.2) * 0.4, 4, dt);
    this.applyMove(dt, ctx, true);
    // 旋翼转动
    const rotors = this.mesh.userData.rotors;
    if (rotors) for (const r of rotors) r.rotation.y += 30 * dt;
    this.tryFire(player, ctx, dist, 1, 34);
  }

  aiHeavy(dt, player, ctx, dx, dz, dist) {
    // 重装兵：慢速推进，密集弹雨
    const ideal = 8;
    if (dist > ideal + 1) {
      this.vel.x = damp(this.vel.x, (dx / dist) * this.def.speed, 3, dt);
      this.vel.z = damp(this.vel.z, (dz / dist) * this.def.speed, 3, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 3, dt);
      this.vel.z = damp(this.vel.z, 0, 3, dt);
    }
    this.applyMove(dt, ctx);
    this.tryFire(player, ctx, dist, 3, 30, BULLET.ENEMY, 0.16);
    this.walkAnim(dt, 0.7);
  }

  applyMove(dt, ctx, flying = false) {
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (!flying) this.pos.y = 0;
    // 限制在走廊内
    this.pos.z = clamp(this.pos.z, -10, 10);
    // 与玩家不重叠
    if (ctx.player) {
      const dx = this.pos.x - ctx.player.pos.x;
      const dz = this.pos.z - ctx.player.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = this.def.radius + 0.45;
      if (d < minD && d > 0.001) {
        this.pos.x += (dx / d) * (minD - d);
        this.pos.z += (dz / d) * (minD - d);
      }
    }
    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
  }

  walkAnim(dt, rate = 1) {
    const p = this.mesh.userData.parts;
    if (!p) return;
    this.walkPhase = (this.walkPhase || 0) + dt * 7 * rate;
    const s = Math.sin(this.walkPhase);
    p.legL.rotation.x = s * 0.7;
    p.legR.rotation.x = -s * 0.7;
    p.armL.rotation.x = -s * 0.5;
    p.armR.rotation.x = -1.2 + s * 0.2;
  }

  tryFire(player, ctx, dist, shots, speed, bulletType = BULLET.ENEMY, spread = 0.045) {
    if (this.fireTimer > 0) return;
    if (dist > this.def.range) return;
    if (this.spawnT < 0.5) return;
    this.fireTimer = this.def.fireRate * rand(1.25, 0.8);

    // 瞄准玩家胸口，带一点提前量（飞行时间补偿）
    const muzzleY = this.def.flying ? this.pos.y : 1.15;
    _m.set(player.pos.x, player.pos.y + player.centerY * 0.75, player.pos.z);
    const travel = _m.distanceTo(this.pos) / speed;
    _m.x += player.vel.x * travel * 0.55;
    _m.z += player.vel.z * travel * 0.55;

    _v.set(this.pos.x, muzzleY, this.pos.z);
    _d.copy(_m).sub(_v).normalize();

    for (let i = 0; i < shots; i++) {
      const dd = _d.clone();
      dd.x += rand(spread, -spread);
      dd.y += rand(spread, -spread);
      dd.z += rand(spread, -spread);
      dd.normalize();
      ctx.bullets.spawn(bulletType, _v.clone(), dd, speed, this.def.damage, {
        life: 4,
      });
    }
    this.fx.muzzleFlash(_v, _d, 0.7);
    this.audio.enemyShot();
  }

  applyFlash() {
    if (!this.mesh.userData.parts) return;
    const p = this.mesh.userData.parts;
    const mats = [];
    this.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) mats.push(o.material); });
    if (this.hitFlash > 0) {
      for (const m of mats) { m.emissive.setHex(0xff3030); m.emissiveIntensity = this.hitFlash * 3; }
    } else {
      for (const m of mats) {
        if (m.userData.__baseEmissive === undefined) m.userData.__baseEmissive = m.emissiveIntensity;
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
  }

  /** 受到伤害 */
  hurt(amount, ctx) {
    if (this.dead) return false;
    this.hp -= amount;
    this.hitFlash = 0.22;
    this.audio.hit();
    this.fx.hitBurst(
      new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z),
      this.type === 'drone' ? 0x66ddff : 0xff5040
    );
    if (this.hp <= 0) {
      this.kill(ctx);
      return true;
    }
    return false;
  }

  kill(ctx) {
    this.dead = true;
    const big = this.type === 'heavy';
    this.fx.explosion(
      new THREE.Vector3(this.pos.x, this.pos.y + (this.def.flying ? 0 : 0.9), this.pos.z),
      big ? 1.7 : this.type === 'turret' ? 1.3 : 0.9,
      this.type === 'drone' ? 0x66ccff : 0xff7030
    );
    this.audio.explosion(big);
    this.scene.remove(this.mesh);

    // 掉落
    if (ctx && ctx.spawnDrop && chance(this.dropChance)) {
      ctx.spawnDrop(this.pos.x, this.pos.z);
    }
    // 得分
    if (ctx && ctx.addScore) {
      ctx.addScore(this.def.score, this.pos);
    }
  }
}
