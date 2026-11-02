// boss.js —— BOSS 战斗框架 + 各关 BOSS 实现
//
// 结构：BossBase 负责通用逻辑（状态机、血量、受击、死亡、命中判定）；
// 各关 BOSS 继承并覆写 buildModel()（外观）与 doAttack()（攻击行为）。

import * as THREE from 'three';
import { clamp, damp, rand, chance } from './util.js';
import { makeHoverTurret } from './models.js';
import { buildMech, buildFortress, buildHive, buildEagleEye, buildInferno, buildCommander } from './bossModels.js';
import { BULLET } from './bullets.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();
const _corePos = new THREE.Vector3();

// ============================================================
// 基类
// ============================================================
export class BossBase {
  constructor(scene, audio, effects, opts = {}) {
    this.scene = scene;
    this.audio = audio;
    this.fx = effects;

    this.name = opts.name || 'BOSS';
    this.hp = opts.hp ?? 260;
    this.maxHp = this.hp;
    this.hitRadius = opts.hitRadius ?? 2.6;
    this.hitY = opts.hitY ?? 1.3;          // 判定盒中心高度（相对 pos.y）
    this.hitH = opts.hitH ?? 1.6;          // 判定盒半高
    this.standoff = opts.standoff ?? 11.2;      // 与玩家的理想距离
    this.entryOffset = opts.entryOffset ?? 42;  // 入场时在玩家前方的距离
    this.hover = opts.hover ?? false;           // 是否悬空
    this.baseY = opts.baseY ?? 0;

    this.pos = new THREE.Vector3(opts.entryX ?? 0, this.baseY, 0);
    this.dead = false;
    this.phase = 1;
    this.state = 'enter';
    this.stateT = 0;
    this.fireTimer = 0;
    this.attackTimer = 2.0;
    this.coreExposed = false;
    this.coreTimer = 0;
    this.turretTimer = 0;
    this.turrets = [];
    this.hitFlash = 0;
    this.phaseThresholds = opts.phaseThresholds ?? [0.68, 0.34];

    this.mesh = this.buildModel();
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
    this.parts = this.mesh.userData.parts || {};
  }

  /** 子类覆写：构建外观 */
  buildModel() { return buildMech(); }

  get hpRatio() { return clamp(this.hp / this.maxHp, 0, 1); }

  update(dt, player, ctx) {
    if (this.dead) return;
    this.stateT += dt;
    this.fireTimer -= dt;
    this.attackTimer -= dt;
    this.turretTimer -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    switch (this.state) {
      case 'enter': this.updateEnter(dt, player); break;
      case 'fight': this.updateFight(dt, player, ctx, dx, dz, dist); break;
      case 'dying': this.updateDying(dt); break;
    }

    this.updateTurrets(dt, player, ctx);
    this.updateVisual(dt, player);
    this.applyFlash();
  }

  // ---------- 可覆写的行为 ----------
  updateEnter(dt, player) {
    const targetX = player.pos.x + this.entryOffset;
    this.pos.x = damp(this.pos.x, targetX, 1.2, dt);
    this.pos.z = damp(this.pos.z, 0, 1.2, dt);
    this.pos.y = this.baseY;
    this.mesh.position.copy(this.pos);

    // 入场结束 → 进入战斗状态
    // （到位或超时都要切换，否则 BOSS 永远停在 enter，既不攻击也不进入射程）
    const arrived = Math.abs(this.pos.x - targetX) < 2.5;
    if (arrived || this.stateT > 3.0) {
      this.state = 'fight';
      this.stateT = 0;
      this.attackTimer = 0.8;      // 给玩家一点反应时间
      this.fireTimer = 1.2;
    }
  }

  updateFight(dt, player, ctx, dx, dz, dist) {
    this.checkPhase(ctx);

    // 炮塔/头部跟踪玩家
    const head = this.parts.turret;
    if (head) {
      const local = Math.atan2(dx, dz);
      head.rotation.y = damp(head.rotation.y, local, 2.2, dt);
    }

    // 站位：保持相对距离 + 横向游走
    const targetZ = clamp(player.pos.z + Math.sin(this.stateT * 0.55) * 5.0, -7.0, 7.0);
    const st = this.standoff * (this.phase >= 3 ? 0.82 : this.phase === 2 ? 0.92 : 1);
    const targetX = player.pos.x + st + Math.sin(this.stateT * 0.4) * 2.4;
    this.pos.x = damp(this.pos.x, targetX, 1.6, dt);
    this.pos.z = damp(this.pos.z, targetZ, 1.6, dt);
    this.pos.y = this.baseY + (this.hover ? Math.sin(this.stateT * 1.6) * 0.5 : 0);
    this.mesh.position.copy(this.pos);

    // 核心暴露逻辑
    if (this.coreExposed) {
      this.coreTimer -= dt;
      const pulse = 1 + Math.sin(this.stateT * 6) * 0.15;
      if (this.parts.core) this.parts.core.scale.setScalar(pulse);
      if (this.coreTimer <= 0) this.coreExposed = false;
    }

    // 攻击
    if (this.attackTimer <= 0) {
      this.attackTimer = this.attackInterval();
      this.doAttack(player, ctx);
    }
    // 持续火力（节奏放缓，给玩家走位/喘息空间）
    if (this.fireTimer <= 0 && dist < 34) {
      this.fireTimer = this.phase === 1 ? 3.0 : this.phase === 2 ? 2.4 : 1.9;
      this.shootAt(player, 1, 46, 0.05, ctx);
    }
  }

  attackInterval() {
    return this.phase === 1 ? 2.1 : this.phase === 2 ? 1.5 : 1.05;
  }

  doAttack(player, ctx) {
    // 默认：三连扇形弹
    this.shootAt(player, 3, 40, 0.13, ctx);
  }

  updateVisual(dt, player) {
    // 子类可覆写：履带、旋翼等动画
  }

  // ---------- 射击工具 ----------
  shootAt(player, shots, speed, spread, ctx) {
    const muzzleY = this.pos.y + 1.9;
    _m.set(player.pos.x, player.pos.y + 1.0, player.pos.z);
    const travel = _m.distanceTo(this.pos) / speed;
    _m.x += player.vel.x * travel * 0.5;
    _m.z += player.vel.z * travel * 0.5;
    _v.set(this.pos.x, muzzleY, this.pos.z);
    _d.copy(_m).sub(_v).normalize();
    for (let i = 0; i < shots; i++) {
      const dd = _d.clone();
      const a = (i - (shots - 1) / 2) * spread;
      const cs = Math.cos(a), sn = Math.sin(a);
      dd.x = _d.x * cs - _d.z * sn;
      dd.z = _d.x * sn + _d.z * cs;
      dd.y += rand(0.03, -0.03);
      ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), dd.normalize(), speed, 1, { life: 4.5 });
    }
    this.fx.muzzleFlash(_v, _d, 1.1);
    this.audio.enemyShot();
  }

  shootRocket(player, ctx, speed = 22, dmg = 2) {
    _v.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
    _m.set(player.pos.x, player.pos.y + 0.9, player.pos.z);
    _d.copy(_m).sub(_v).normalize();
    ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, speed, dmg, {
      life: 5, explode: true, explodeRadius: 3.4, trail: true,
    });
    this.audio.shotHeavy();
  }

  /** 环形弹幕 */
  ringShot(ctx, count, speed, yOffset = 1.9) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.stateT;
      _d.set(Math.cos(a), 0.02, Math.sin(a)).normalize();
      _v.set(this.pos.x, this.pos.y + yOffset, this.pos.z);
      ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, speed, 1, { life: 5 });
    }
    this.audio.enemyShot();
  }

  // ---------- 悬浮炮台支援 ----------
  updateTurrets(dt, player, ctx) {
    if (this.state !== 'fight') return;
    if (this.turretTimer <= 0) {
      this.turretTimer = this.phase === 1 ? 7 : 4.5;
      const side = chance(0.5) ? 1 : -1;
      const grp = new THREE.Group();
      grp.add(makeHoverTurret());
      grp.position.set(this.pos.x - 8 - rand(4), 3.2, side * rand(8, 4));
      this.scene.add(grp);
      this.turrets.push({ mesh: grp, hp: 4, born: this.stateT, fireT: 1.2 });
    }
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.fireT -= dt;
      t.mesh.position.y = 3.0 + Math.sin(this.stateT * 2 + i) * 0.4;
      t.mesh.position.x = damp(t.mesh.position.x, player.pos.x - 14, 0.7, dt);
      t.mesh.position.z = damp(t.mesh.position.z, clamp(player.pos.z, -8, 8), 0.7, dt);
      const ddx = player.pos.x - t.mesh.position.x;
      const ddz = player.pos.z - t.mesh.position.z;
      const dd = Math.hypot(ddx, ddz);
      if (t.fireT <= 0 && dd < 30) {
        t.fireT = 1.5;
        _m.set(player.pos.x, player.pos.y + 1, player.pos.z);
        _v.copy(t.mesh.position);
        _d.copy(_m).sub(_v).normalize();
        ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, 40, 1, { life: 3.5 });
        this.fx.muzzleFlash(_v, _d, 0.7);
        this.audio.enemyShot();
      }
    }
  }

  // ---------- 阶段与受击 ----------
  checkPhase(ctx) {
    const ratio = this.hpRatio;
    if (ratio <= this.phaseThresholds[1] && this.phase < 3) {
      this.phase = 3;
      this.fx.explosion(this.pos.clone().setY(this.pos.y + 2.4), 2.0, 0xffaa30);
      this.audio.bossAlert();
      this.coreExposed = true;
      this.coreTimer = 5.5;
      if (this.onPhase) this.onPhase(3);
    } else if (ratio <= this.phaseThresholds[0] && this.phase < 2) {
      this.phase = 2;
      this.fx.explosion(this.pos.clone().setY(this.pos.y + 2.4), 1.5, 0xffaa30);
      this.audio.bossAlert();
      if (this.onPhase) this.onPhase(2);
    }
  }

  applyFlash() {
    const mats = [];
    this.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) mats.push(o.material); });
    if (this.hitFlash > 0) {
      for (const m of mats) { m.emissive.setHex(0xff3030); m.emissiveIntensity = this.hitFlash * 1.6; }
    } else {
      for (const m of mats) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
    }
    if (this.parts.core) {
      this.parts.core.material.emissive.setHex(this.coreColor ?? 0xff4400);
      this.parts.core.material.emissiveIntensity = this.coreExposed ? 3.2 : 1.2;
    }
  }

  /** 命中判定：长方体近似（判定框比视觉模型略大，避免高速子弹「擦过」） */
  hitTest(bulletPos) {
    const hx = this.hitRadius, hy = this.hitH, hz = this.hitRadius * 0.82;
    const dx = Math.abs(bulletPos.x - this.pos.x);
    const dy = Math.abs(bulletPos.y - (this.pos.y + this.hitY));
    const dz = Math.abs(bulletPos.z - this.pos.z);
    if (dx <= hx && dy <= hy && dz <= hz) {
      if (this.coreExposed && this.parts.core) {
        const cp = this.parts.core.getWorldPosition(_corePos);
        const cx = bulletPos.x - cp.x, cy = bulletPos.y - cp.y, cz = bulletPos.z - cp.z;
        if (cx * cx + cy * cy + cz * cz < 0.65 * 0.65) return { hit: true, crit: true };
      }
      return { hit: true, crit: false };
    }
    return { hit: false };
  }

  hurt(amount, ctx) {
    if (this.dead || this.state === 'dying') return;
    this.hp -= amount;
    this.hitFlash = 0.2;
    this.audio.hit();
    this.fx.hitBurst(
      new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z),
      this.coreColor ?? 0xff5522, 4
    );
    // 命中 BOSS 也得分（按伤害折算），否则打 BOSS 全程 0 分
    if (ctx && ctx.addScore) {
      ctx.addScore(Math.round(amount * 8), this.pos);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.startDeath(ctx);
    }
  }

  startDeath(ctx) {
    if (this.state === 'dying' || this.dead) return;   // 防重入
    this.state = 'dying';
    this.stateT = 0;
    this.audio.bossAlert();
    // 击毁 BOSS 的大额奖励
    if (ctx && ctx.addScore) {
      ctx.addScore(this.maxHp * 12, this.pos, { kill: true });
    }
    this.deathExplosions = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      this.deathExplosions.push({
        t: i * 0.16,
        pos: new THREE.Vector3(
          this.pos.x + rand(2.4, -2.4),
          this.pos.y + rand(3.2, 0.5),
          this.pos.z + rand(2.0, -2.0)
        ),
      });
    }
  }

  updateDying(dt) {
    const next = this.deathExplosions.find((e) => this.stateT >= e.t && !e.done);
    if (next) {
      next.done = true;
      this.fx.explosion(next.pos, rand(1.6, 0.9), 0xffa030);
      this.audio.explosion(true);
    }
    this.mesh.rotation.z = Math.sin(this.stateT * 9) * 0.07;
    this.mesh.position.y = this.baseY - Math.min(1.8, this.stateT * 0.75);
    if (this.parts.turret) this.parts.turret.rotation.y += dt * 1.5;
    if (this.stateT > 2.6 && !this.dead) {
      this.dead = true;
      this.fx.explosion(this.pos.clone().setY(this.pos.y + 2), 3.2, 0xffc030);
      this.audio.explosion(true);
      this.fx.addShake(1.4);
      for (const t of this.turrets) this.scene.remove(t.mesh);
      this.turrets.length = 0;
      this.scene.remove(this.mesh);
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    for (const t of this.turrets) this.scene.remove(t.mesh);
    this.turrets.length = 0;
  }
}

// ============================================================
// 关卡 1：铁壁 · 重装机甲
// ============================================================
export class MechBoss extends BossBase {
  constructor(scene, audio, effects, entryX) {
    super(scene, audio, effects, {
      name: '铁壁 · 重装机甲', hp: 105, hitRadius: 2.3, hitY: 1.15, hitH: 1.75,
      standoff: 14.0, entryOffset: 42, entryX,
    });
    this.coreColor = 0xff4400;
  }
  buildModel() { return buildMech(); }
  updateVisual(dt) {
    if (this.parts.trackL) {
      this.parts.trackL.position.y = 0.4 + Math.sin(this.stateT * 18) * 0.05;
      this.parts.trackR.position.y = 0.4 + Math.sin(this.stateT * 18 + 1) * 0.05;
    }
  }
  doAttack(player, ctx) {
    if (this.phase === 1) {
      this.shootAt(player, 3, 40, 0.13, ctx);
    } else if (this.phase === 2) {
      this.ringShot(ctx, 8, 26);
    } else {
      this.shootRocket(player, ctx);
      setTimeout(() => { if (!this.dead) this.shootAt(player, 5, 52, 0.1, ctx); }, 320);
    }
  }
}

// ============================================================
// 关卡 2：重炮堡垒 —— 双管直射 + 散射
// ============================================================
export class FortressBoss extends BossBase {
  constructor(scene, audio, effects, entryX) {
    super(scene, audio, effects, {
      name: '重炮堡垒', hp: 135, hitRadius: 2.9, hitY: 2.5, hitH: 3.1,
      standoff: 16.5, entryOffset: 44, entryX,
    });
    this.coreColor = 0xffaa22;
  }
  buildModel() { return buildFortress(); }

  doAttack(player, ctx) {
    if (this.phase === 1) {
      this.shootAt(player, 2, 34, 0.09, ctx);      // 双管齐射
    } else if (this.phase === 2) {
      // 高抛射的散射弹
      for (let i = 0; i < 5; i++) {
        _v.set(this.pos.x, this.pos.y + 4.4, this.pos.z);
        const a = (i - 2) * 0.16;
        _d.set(Math.sin(a), 0.42, Math.cos(a)).normalize();
        ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, 26, 1, { life: 5 });
      }
      this.audio.enemyShot();
    } else {
      this.shootRocket(player, ctx, 20, 2);
      setTimeout(() => { if (!this.dead) this.shootAt(player, 4, 38, 0.12, ctx); }, 300);
    }
  }
}

// ============================================================
// 关卡 3：蜂巢母舰 —— 蜂群战术，召唤小型无人机
// ============================================================
export class HiveBoss extends BossBase {
  constructor(scene, audio, effects, entryX) {
    super(scene, audio, effects, {
      name: '蜂巢母舰', hp: 155, hitRadius: 2.7, hitY: 1.55, hitH: 2.15,
      standoff: 15.0, entryOffset: 40, entryX,
      hover: true, baseY: 0.4,
    });
    this.coreColor = 0xff66aa;
    this.swarmTimer = 0;
  }
  buildModel() { return buildHive(); }

  updateVisual(dt) {
    // 机翼旋转
    const wings = this.parts.wings;
    if (wings) {
      for (let i = 0; i < wings.length; i++) {
        wings[i].rotation.y = -((i / wings.length) * Math.PI * 2) + this.stateT * 1.1;
        wings[i].rotation.z = Math.sin(this.stateT * 3 + i) * 0.16;
      }
    }
    // 召唤蜂群
    this.swarmTimer -= dt;
    if (this.swarmTimer <= 0 && this.state === 'fight') {
      this.swarmTimer = this.phase >= 3 ? 2.6 : 4.2;
      this.spawnSwarm();
    }
  }

  spawnSwarm() {
    const n = this.phase >= 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a3a6a, metalness: 0.5, roughness: 0.4 })
      );
      g.add(body);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xff66aa, emissive: 0xff2288, emissiveIntensity: 2.4 })
      );
      eye.position.z = 0.24;
      g.add(eye);
      g.position.set(this.pos.x - rand(3, -3), this.pos.y + rand(1.5, -1.5), this.pos.z + rand(3, -3));
      this.scene.add(g);
      this.turrets.push({ mesh: g, hp: 2, born: this.stateT, fireT: rand(2.4, 0.6), swarm: true });
    }
  }

  updateTurrets(dt, player, ctx) {
    // 母舰不召唤炮台，改为管理蜂群
    if (this.state !== 'fight') return;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.fireT -= dt;
      // 蜂群绕玩家盘旋
      const ang = this.stateT * 1.5 + i * 1.1;
      const tx = player.pos.x - 8 + Math.cos(ang) * 4.5;
      const tz = player.pos.z + Math.sin(ang) * 3.5;
      t.mesh.position.x = damp(t.mesh.position.x, tx, 2.2, dt);
      t.mesh.position.z = damp(t.mesh.position.z, tz, 2.2, dt);
      t.mesh.position.y = damp(t.mesh.position.y, player.pos.y + 1.8, 2.0, dt);
      t.mesh.lookAt(player.pos.x, t.mesh.position.y, player.pos.z);
      if (t.fireT <= 0) {
        t.fireT = 2.8;
        _m.set(player.pos.x, player.pos.y + 1, player.pos.z);
        _v.copy(t.mesh.position);
        _d.copy(_m).sub(_v).normalize();
        ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, 38, 1, { life: 3.2 });
        this.fx.muzzleFlash(_v, _d, 0.5);
      }
    }
  }

  doAttack(player, ctx) {
    if (this.phase === 1) {
      this.shootAt(player, 3, 42, 0.14, ctx);
    } else if (this.phase === 2) {
      this.ringShot(ctx, 8, 24);
    } else {
      this.shootAt(player, 4, 50, 0.11, ctx);
      setTimeout(() => { if (!this.dead) this.ringShot(ctx, 6, 30); }, 280);
    }
  }
}

// ============================================================
// 关卡 4：鹰眼 · 狙击要塞 —— 高伤精准狙击 + 护盾
// ============================================================
export class EagleEyeBoss extends BossBase {
  constructor(scene, audio, effects, entryX) {
    super(scene, audio, effects, {
      name: '鹰眼 · 狙击要塞', hp: 170, hitRadius: 2.5, hitY: 2.6, hitH: 3.2,
      standoff: 20.0, entryOffset: 52, entryX,
      phaseThresholds: [0.7, 0.38],
    });
    this.coreColor = 0x66ddff;
    this.shieldUp = false;
  }
  buildModel() { return buildEagleEye(); }

  updateVisual(dt) {
    // 护盾片旋转
    const sh = this.parts.shields;
    if (sh) {
      for (let i = 0; i < sh.length; i++) {
        const a = (i / sh.length) * Math.PI * 2 + this.stateT * 0.5;
        sh[i].position.set(Math.cos(a) * 1.9, 3.4, Math.sin(a) * 1.9);
        sh[i].rotation.y = -a;
        sh[i].material.opacity = this.shieldUp ? 0.34 : 0.13;
      }
    }
  }

  doAttack(player, ctx) {
    if (this.phase === 1) {
      this.sniperShot(player, ctx, 1);
    } else if (this.phase === 2) {
      this.sniperShot(player, ctx, 2);
      this.shieldUp = true;
      setTimeout(() => { this.shieldUp = false; }, 2200);
    } else {
      this.sniperShot(player, ctx, 3);
      this.shieldUp = true;
      setTimeout(() => { this.shieldUp = false; }, 3000);
    }
  }

  sniperShot(player, ctx, count) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (this.dead) return;
        _m.set(player.pos.x, player.pos.y + 1.0, player.pos.z);
        _v.set(this.pos.x, this.pos.y + 4.2, this.pos.z);
        _d.copy(_m).sub(_v).normalize();
        ctx.bullets.spawn(BULLET.SNIPER, _v.clone(), _d, 78, 1, { life: 3 });
        this.fx.muzzleFlash(_v, _d, 1.3);
        this.audio.shotHeavy();
      }, i * 260);
    }
  }
}

// ============================================================
// 关卡 5：炽炎 · 战争堡垒 —— 熔岩弹幕 + 侧翼火箭
// ============================================================
export class InfernoBoss extends BossBase {
  constructor(scene, audio, effects, entryX) {
    super(scene, audio, effects, {
      name: '炽炎 · 战争堡垒', hp: 195, hitRadius: 3.1, hitY: 2.55, hitH: 3.15,
      standoff: 15.5, entryOffset: 44, entryX,
    });
    this.coreColor = 0xff3300;
  }
  buildModel() { return buildInferno(); }

  updateVisual(dt) {
    // 熔岩环脉动
    if (this.parts.ring) {
      const p = 1 + Math.sin(this.stateT * 3) * 0.06;
      this.parts.ring.scale.setScalar(p);
      this.parts.ring.material.emissiveIntensity = 2.0 + Math.sin(this.stateT * 5) * 0.8;
    }
  }

  doAttack(player, ctx) {
    if (this.phase === 1) {
      this.shootAt(player, 3, 44, 0.12, ctx);
    } else if (this.phase === 2) {
      this.ringShot(ctx, 10, 28);
    } else {
      this.shootRocket(player, ctx, 24, 2);
      setTimeout(() => { if (!this.dead) this.ringShot(ctx, 7, 32); }, 300);
    }
  }
}

// ============================================================
// 关卡 6：终焉 · 指挥官 —— 终局：光束横扫 + 追踪弹
// ============================================================
export class CommanderBoss extends BossBase {
  constructor(scene, audio, effects, entryX) {
    super(scene, audio, effects, {
      name: '终焉 · 指挥官', hp: 215, hitRadius: 2.9, hitY: 3.3, hitH: 3.9,
      standoff: 13.5, entryOffset: 40, entryX,
      phaseThresholds: [0.72, 0.4],
    });
    this.coreColor = 0x9933ff;
  }
  buildModel() { return buildCommander(); }

  updateVisual(dt) {
    // 腿部摆动（走路感）
    const legs = this.parts.legs;
    if (legs) {
      legs[0].rotation.x = Math.sin(this.stateT * 2.2) * 0.16;
      legs[1].rotation.x = -Math.sin(this.stateT * 2.2) * 0.16;
    }
    // 右臂炮跟随
    if (this.parts.armR) {
      const p = this.playerRef;
      if (p) {
        const ang = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        this.parts.armR.rotation.y = damp(this.parts.armR.rotation.y, ang, 3, dt);
      }
    }
  }

  doAttack(player, ctx) {
    this.playerRef = player;
    if (this.phase === 1) {
      this.shootAt(player, 3, 48, 0.12, ctx);
    } else if (this.phase === 2) {
      // 追踪弹
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (this.dead) return;
          _v.set(this.pos.x + rand(2, -2), this.pos.y + 4.5, this.pos.z);
          _m.set(player.pos.x, player.pos.y + 1, player.pos.z);
          _d.copy(_m).sub(_v).normalize();
          ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, 30, 1, {
            life: 5, explode: true, explodeRadius: 2.6, trail: true,
          });
          this.audio.shotHeavy();
        }, i * 220);
      }
    } else {
      // 终局：环形弹幕 + 密集光束
      this.ringShot(ctx, 9, 30);
      setTimeout(() => { if (!this.dead) this.shootAt(player, 4, 56, 0.09, ctx); }, 300);
      setTimeout(() => { if (!this.dead) this.ringShot(ctx, 6, 34); }, 620);
    }
  }
}

// ============================================================
// 工厂
// ============================================================
const BOSS_CLASSES = {
  mech: MechBoss,
  turret: FortressBoss,
  drone: HiveBoss,
  sniper: EagleEyeBoss,
  heavy: InfernoBoss,
  commander: CommanderBoss,
};

/** 按关卡配置创建 BOSS */
export function createBoss(scene, audio, effects, kind, entryX, name) {
  const C = BOSS_CLASSES[kind] || MechBoss;
  const b = new C(scene, audio, effects, entryX);
  if (name) b.name = name;
  return b;
}
