// boss.js —— BOSS「铁壁」重装机甲：三阶段战斗

import * as THREE from 'three';
import { clamp, damp, rand, chance } from './util.js';
import { makeMechBody, makeHoverTurret } from './models.js';
import { BULLET } from './bullets.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();
const _corePos = new THREE.Vector3();

export class Boss {
  constructor(scene, audio, effects, entryX = -26) {
    this.scene = scene;
    this.audio = audio;
    this.fx = effects;

    this.pos = new THREE.Vector3(entryX, 0, 0);
    this.hp = 260;
    this.maxHp = 260;
    this.dead = false;
    this.phase = 1;
    this.entered = false;
    this.state = 'enter';       // enter / fight / dying
    this.stateT = 0;
    this.fireTimer = 0;
    this.attackTimer = 2.0;
    this.hitRadius = 2.6;
    this.coreExposed = false;
    this.coreTimer = 0;
    this.turretTimer = 0;
    this.turrets = [];
    this.hitFlash = 0;

    this.mesh = makeMechBody();
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.mesh.position.set(entryX, 0, 0);
    this.scene.add(this.mesh);
    this.parts = this.mesh.userData.parts;
  }

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
      default: this.updateIdle(dt, player); break;
    }

    this.updateTurrets(dt, player, ctx);
    this.applyFlash();
  }

  updateIdle(dt, player) {
    this.pos.x = -26;
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
  }

  updateEnter(dt, player) {
    // 从远处驶入战场，停在玩家前方
    const targetX = player.pos.x + 16;
    this.pos.x = damp(this.pos.x, targetX, 1.2, dt);
    this.pos.z = damp(this.pos.z, 0, 1.2, dt);
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    // 履带动画
    this.parts.trackL.position.y = 0.4 + Math.sin(this.stateT * 22) * 0.06;
    this.parts.trackR.position.y = 0.4 + Math.sin(this.stateT * 22 + 1) * 0.06;
    if (Math.abs(this.pos.x - targetX) < 0.6) {
      this.state = 'fight';
      this.stateT = 0;
    }
  }

  updateFight(dt, player, ctx, dx, dz, dist) {
    // 阶段切换
    const ratio = this.hpRatio;
    if (ratio <= 0.34 && this.phase < 3) {
      this.phase = 3;
      this.fx.explosion(this.pos.clone().setY(2.4), 2.0, 0xffaa30);
      this.audio.bossAlert();
      this.coreExposed = true;
      this.coreTimer = 0;
    } else if (ratio <= 0.68 && this.phase < 2) {
      this.phase = 2;
      this.fx.explosion(this.pos.clone().setY(2.4), 1.5, 0xffaa30);
      this.audio.bossAlert();
    }

    // 炮塔跟随玩家
    const local = Math.atan2(dx, dz);
    this.parts.turret.rotation.y = damp(this.parts.turret.rotation.y, local, 2.2, dt);

    // 移动：横向游走 + 前后压迫（坐标基于玩家当前位置，保持相对阵位）
    const targetZ = clamp(player.pos.z + Math.sin(this.stateT * 0.55) * 5.0, -7.0, 7.0);
    const standoff = this.phase === 3 ? 8.5 : this.phase === 2 ? 9.8 : 11.2;   // 与玩家的理想距离
    const targetX = player.pos.x + standoff + Math.sin(this.stateT * 0.4) * 2.4;
    this.pos.x = damp(this.pos.x, targetX, 1.6, dt);
    this.pos.z = damp(this.pos.z, targetZ, 1.6, dt);
    this.mesh.position.set(this.pos.x, 0, this.pos.z);

    // 履带
    this.parts.trackL.position.y = 0.4 + Math.sin(this.stateT * 18) * 0.05;
    this.parts.trackR.position.y = 0.4 + Math.sin(this.stateT * 18 + 1) * 0.05;

    // 核心暴露（第三阶段弱点）
    if (this.coreExposed) {
      this.coreTimer -= dt;
      const pulse = 1 + Math.sin(this.stateT * 6) * 0.15;
      this.parts.core.scale.setScalar(pulse);
      if (this.coreTimer <= 0) {
        this.coreTimer = 5.5;
        this.coreExposed = false;
      }
    }

    // 攻击
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase === 1 ? 1.5 : this.phase === 2 ? 1.05 : 0.72;
      this.doAttack(player, ctx);
    }

    // 持续小火力
    if (this.fireTimer <= 0 && dist < 34) {
      this.fireTimer = this.phase === 1 ? 1.6 : 1.15;
      this.shootAt(player, 1, 46, 0.05, ctx);
    }
  }

  doAttack(player, ctx) {
    const phase = this.phase;
    if (phase === 1) {
      // 三连扇形弹
      this.shootAt(player, 3, 40, 0.13, ctx);
    } else if (phase === 2) {
      // 环形弹幕
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.stateT;
        _d.set(Math.cos(a), 0.02, Math.sin(a)).normalize();
        _v.set(this.pos.x, 1.9, this.pos.z);
        ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, 26, 1, { life: 5 });
      }
      this.audio.enemyShot();
    } else {
      // 三阶段：火箭 + 激光扫射
      this.shootRocket(player, ctx);
      setTimeout(() => {
        if (!this.dead) this.shootAt(player, 5, 52, 0.1, ctx);
      }, 320);
    }
  }

  shootAt(player, shots, speed, spread, ctx) {
    const muzzleY = 1.9;
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

  shootRocket(player, ctx) {
    _v.set(this.pos.x, 2.0, this.pos.z);
    _m.set(player.pos.x, player.pos.y + 0.9, player.pos.z);
    _d.copy(_m).sub(_v).normalize();
    ctx.bullets.spawn(BULLET.ENEMY, _v.clone(), _d, 22, 2, {
      life: 5, explode: true, explodeRadius: 3.4, trail: true,
    });
    this.audio.shotHeavy();
  }

  updateTurrets(dt, player, ctx) {
    if (this.state !== 'fight') return;
    if (this.turretTimer <= 0) {
      this.turretTimer = this.phase === 1 ? 7 : 4.5;
      // 召唤悬浮炮台
      const side = chance(0.5) ? 1 : -1;
      const grp = new THREE.Group();
      grp.add(makeHoverTurret());
      const spawnX = this.pos.x - 8 - rand(4);
      const spawnZ = side * rand(8, 4);
      grp.position.set(spawnX, 3.2, spawnZ);
      this.scene.add(grp);
      this.turrets.push({ mesh: grp, hp: 4, born: this.stateT, fireT: 1.2 });
    }
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.fireT -= dt;
      // 跟随玩家高度
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

  applyFlash() {
    const mats = [];
    this.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) mats.push(o.material); });
    if (this.hitFlash > 0) {
      for (const m of mats) { m.emissive.setHex(0xff3030); m.emissiveIntensity = this.hitFlash * 1.6; }
    } else {
      for (const m of mats) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
    }
    if (this.parts.core) {
      this.parts.core.material.emissive.setHex(0xff4400);
      this.parts.core.material.emissiveIntensity = this.coreExposed ? 3.2 : 1.2;
    }
  }

  /** 命中判定：机甲主体（长方体近似）+ 暴露的核心（核心伤害更高）
 *  判定框比视觉模型略大，避免高速子弹因帧间位移而「擦过」
 */
  hitTest(bulletPos) {
    const hx = 2.3, hy = 1.6, hz = 2.0;
    const dx = Math.abs(bulletPos.x - this.pos.x);
    const dy = Math.abs(bulletPos.y - 1.3);
    const dz = Math.abs(bulletPos.z - this.pos.z);
    if (dx <= hx && dy <= hy && dz <= hz) {
      // 核心优先判定
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
    // 连锁爆炸
    this.deathExplosions = [];
    for (let i = 0; i < 14; i++) {
      this.deathExplosions.push({
        t: i * 0.16,
        pos: new THREE.Vector3(
          this.pos.x + rand(2.4, -2.4),
          rand(3.2, 0.5),
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
    // 机体摇晃下沉
    this.mesh.rotation.z = Math.sin(this.stateT * 9) * 0.07;
    this.mesh.position.y = -Math.min(1.8, this.stateT * 0.75);
    this.parts.turret.rotation.y += dt * 1.5;
    if (this.stateT > 2.6 && !this.dead) {
      this.dead = true;
      this.fx.explosion(this.pos.clone().setY(2), 3.2, 0xffc030);
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
