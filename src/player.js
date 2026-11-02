// player.js —— 玩家角色：移动 / 跳跃 / 卧倒 / 8向射击 / 受击

import * as THREE from 'three';
import { clamp, damp, snapTo8, rand } from './util.js';
import { makeHumanoid } from './models.js';
import { BULLET } from './bullets.js';

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export const WEAPONS = {
  M:    { name: 'M 机枪',  cls: 'm', dmg: 1,   rate: 0.115, speed: 46, spread: 0.02, shots: 1, range: 55 },
  S:    { name: 'S 散弹',  cls: 's', dmg: 2.2, rate: 0.52,  speed: 34, spread: 0.13, shots: 5, range: 26 },
  F:    { name: 'F 火焰',  cls: 'f', dmg: 1.3, rate: 0.085, speed: 30, spread: 0.075, shots: 1, range: 20, flame: true },
  R:    { name: 'R 速射',  cls: 'r', dmg: 1,   rate: 0.055, speed: 52, spread: 0.035, shots: 1, range: 60 },
  L:    { name: 'L 激光',  cls: 'l', dmg: 3,   rate: 0.34,  speed: 78, spread: 0, shots: 1, range: 90, pierce: 2 },
};

export class Player {
  constructor(scene, audio, effects) {
    this.scene = scene;
    this.audio = audio;
    this.fx = effects;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.facing = 0;          // 朝向（yaw，弧度）
    this.aimDir = new THREE.Vector3(1, 0, 0);
    this.grounded = true;
    this.dead = false;

    this.hp = 3;
    this.maxHp = 8;
    this.lives = 3;
    this.invuln = 0;
    this.prone = false;

    this.weapon = 'M';
    this.weaponTimer = 0;
    this.spreadTimer = 0;
    this.comboTimer = 0;
    this.combo = 0;

    this.hitRadius = 0.42;
    this.centerY = 1.0;

    this.speed = 7.6;
    this.jumpVel = 10.2;
    this.gravity = 26;

    this.mesh = makeHumanoid({
      torso: 0x2f6fd0, pants: 0x22304a, skin: 0xe8b98c,
      accent: 0xffcc33, scale: 1,
    });
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
    this.parts = this.mesh.userData.parts;

    // 枪口位置（局部）
    this.muzzleLocal = new THREE.Vector3(0, 1.1, 0.7);

    this.animT = 0;
    this.walkPhase = 0;
    this.fireAnim = 0;
    this.hurtFlash = 0;

    this.onDeath = null;
    this.onScore = null;
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.dead = false;
    this.invuln = 2.0;
    this.prone = false;
    this.weapon = 'M';
    this.combo = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.visible = true;
  }

  get isFiring() { return this.weaponTimer > 0; }

  /** 计算鼠标/触点指向的世界 XZ 方向 */
  computeAim(camera, input) {
    const n = input.aimNdc();
    const ndc = new THREE.Vector2(n.x, n.y);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    // 射线与 y=1.1 平面求交
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      _aim.copy(hit).sub(this.pos);
      _aim.y = 0;
      if (_aim.lengthSq() > 0.04) _aim.normalize();
      else _aim.set(Math.cos(this.facing), 0, Math.sin(this.facing));
    } else {
      _aim.set(Math.cos(this.facing), 0, Math.sin(this.facing));
    }
    return _aim;
  }

  /**
   * @param {number} dt
   * @param {object} input
   * @param {THREE.Camera} camera
   * @param {object} ctx  { bullets, enemies, obstacles, autoAim }
   */
  update(dt, input, camera, ctx) {
    if (this.dead) return;

    this.invuln = Math.max(0, this.invuln - dt);
    this.weaponTimer = Math.max(0, this.weaponTimer - dt);
    this.fireAnim = Math.max(0, this.fireAnim - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;

    // ---------- 移动 ----------
    const ax = input.moveAxis();
    const wantProne = input.proneDown() && this.grounded;
    this.prone = wantProne;

    // 镜头基向量（用于把输入转成世界方向）
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 0.001) _fwd.set(1, 0, 0);
    _fwd.normalize();
    _right.set(_fwd.z, 0, -_fwd.x);   // 叉乘

    // 移动：左右沿走廊 X，纵深沿 Z
    let mx = 0, mz = 0;
    const len = Math.hypot(ax.x, ax.z);
    if (len > 0) {
      mx = ax.x / len; mz = ax.z / len;
    }

    const speedNow = this.prone ? this.speed * 0.42 : this.speed;
    const targetVx = mx * speedNow;
    const targetVz = mz * speedNow;
    const accel = this.grounded ? 13 : 5;
    this.vel.x = damp(this.vel.x, targetVx, accel, dt);
    this.vel.z = damp(this.vel.z, targetVz, accel, dt);

    // 跳跃
    if (input.jumpPressed() && this.grounded) {
      this.vel.y = this.jumpVel;
      this.grounded = false;
      this.audio.jump();
      this.fx.dust(this.pos, 5, 0.9);
    }
    this.vel.y -= this.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // 地面
    if (this.pos.y <= 0) {
      if (!this.grounded && this.vel.y < -4) {
        this.audio.land();
        this.fx.dust(this.pos, 5, 1);
      }
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    // 边界
    this.pos.x = clamp(this.pos.x, ctx.minX ?? -10, ctx.maxX ?? 10000);
    this.pos.z = clamp(this.pos.z, -10.2, 10.2);

    // ---------- 瞄准与朝向 ----------
    const aim = this.computeAim(camera, input);
    this.aimDir.copy(aim);

    // 面朝瞄准方向（跳跃时朝向前进方向更自然）
    let facingTarget;
    if (this.grounded) {
      facingTarget = Math.atan2(aim.x, aim.z);
    } else {
      const mv = Math.hypot(this.vel.x, this.vel.z);
      facingTarget = mv > 0.5
        ? Math.atan2(this.vel.x, this.vel.z)
        : Math.atan2(aim.x, aim.z);
    }
    // 8向吸附（仅对静态站立时的朝向做量化，避免抖动）
    if (this.grounded && (ax.x !== 0 || ax.z !== 0)) {
      _dir.set(this.vel.x, 0, this.vel.z);
      if (_dir.lengthSq() > 0.02) {
        snapTo8(_dir, _right, _fwd, _dir);
        facingTarget = Math.atan2(_dir.x, _dir.z);
      }
    }
    let diff = facingTarget - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, dt * 18);

    // ---------- 射击 ----------
    if (input.firing() && this.weaponTimer <= 0) {
      this.fire(ctx);
    }

    // ---------- 姿势与动画 ----------
    this.updateAnim(dt, len);

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;

    // 受击闪红
    const m = this.parts.torsoM.material;
    if (this.hurtFlash > 0) {
      m.emissive.setHex(0xff2020);
      m.emissiveIntensity = this.hurtFlash * 2.2;
    } else if (m.emissiveIntensity !== 0) {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
    // 无敌状态：半透明残影（比闪烁友好，不会让人误以为角色消失）
    if (this.invuln > 0) {
      const a = 0.35 + 0.35 * Math.abs(Math.sin(this.invuln * 22));
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.transparent = true;
          o.material.opacity = a;
          o.material.depthWrite = false;
        }
      });
    } else if (this._wasGhost) {
      this._wasGhost = false;
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.transparent = false;
          o.material.opacity = 1;
          o.material.depthWrite = true;
        }
      });
    }
    this._wasGhost = this.invuln > 0;
  }

  updateAnim(dt, moveLen) {
    const p = this.parts;
    if (this.prone) {
      // 卧倒：身体压低前倾
      this.mesh.rotation.x = -Math.PI / 2.15;
      p.armR.rotation.x = -1.5;
      p.armL.rotation.x = -1.5;
      p.legL.rotation.x = 0.25; p.legR.rotation.x = 0.25;
      p.legL.rotation.z = 0.2; p.legR.rotation.z = -0.2;
      p.armR.rotation.z = -0.25; p.armL.rotation.z = 0.25;
      this.centerY = 0.45;
    } else {
      this.mesh.rotation.x = 0;
      p.armR.rotation.z = 0; p.armL.rotation.z = 0;
      p.legL.rotation.z = 0; p.legR.rotation.z = 0;
      this.centerY = 1.0;
      if (this.grounded) {
        if (moveLen > 0.01) {
          this.walkPhase += dt * (this.speed * 1.55);
          const s = Math.sin(this.walkPhase);
          p.legL.rotation.x = s * 0.75;
          p.legR.rotation.x = -s * 0.75;
          p.armL.rotation.x = -s * 0.55;
          p.armR.rotation.x = -1.15 + s * 0.16;   // 持枪手保持端枪
          this.mesh.position.y = this.pos.y + Math.abs(Math.cos(this.walkPhase)) * 0.045;
        } else {
          this.walkPhase = 0;
          p.legL.rotation.x = damp(p.legL.rotation.x, 0, 10, dt);
          p.legR.rotation.x = damp(p.legR.rotation.x, 0, 10, dt);
          p.armL.rotation.x = damp(p.armL.rotation.x, -0.15, 10, dt);
          p.armR.rotation.x = damp(p.armR.rotation.x, -1.15, 12, dt);
        }
      } else {
        // 空中：收腿
        p.legL.rotation.x = damp(p.legL.rotation.x, -0.5, 10, dt);
        p.legR.rotation.x = damp(p.legR.rotation.x, 0.35, 10, dt);
        p.armL.rotation.x = damp(p.armL.rotation.x, -0.9, 10, dt);
        p.armR.rotation.x = damp(p.armR.rotation.x, -1.15, 12, dt);
      }
    }

    // 射击后坐：手臂后踢
    if (this.fireAnim > 0) {
      const k = this.fireAnim / 0.1;
      p.armR.rotation.x -= 0.35 * k;
      p.gun.position.z = 0.1 - 0.16 * k;
    } else {
      p.gun.position.z = damp(p.gun.position.z, 0.1, 14, dt);
    }
  }

  fire(ctx) {
    const w = WEAPONS[this.weapon];
    this.weaponTimer = w.rate;
    this.fireAnim = 0.1;

    // 枪口世界坐标
    this.muzzleLocal.set(0, this.prone ? 0.55 : 1.1, 0.7);
    _v.copy(this.muzzleLocal);
    if (this.prone) _v.y = 0.5;
    this.mesh.updateMatrixWorld();
    _v.applyMatrix4(this.parts.gun.matrixWorld);

    // 射击方向：瞄准方向 8向吸附
    camera_basis(ctx.camera, _right, _fwd);
    _dir.copy(this.aimDir);
    if (ctx.autoAim !== false) {
      snapTo8(_dir, _right, _fwd, _dir);
    }
    _dir.y = 0;
    _dir.normalize();

    // 瞄准辅助：准星指向 BOSS 时锁定精确方向（大型目标需要精确瞄准）
    const tgt = ctx.boss && !ctx.boss.dead ? ctx.boss : null;
    if (tgt && ctx.autoAim !== false) {
      _aim.set(tgt.pos.x, 1.3, tgt.pos.z).sub(this.pos);
      _aim.y = 0;
      const tl = _aim.length();
      if (tl > 0.5) {
        _aim.divideScalar(tl);
        // 玩家原始瞄准方向与 BOSS 方向夹角 < 55° 才锁定，避免误锁
        const dot = this.aimDir.dot(_aim);
        if (dot > 0.57) {
          _dir.copy(_aim);
        }
      }
    }

    const bullets = ctx.bullets;
    if (ctx.countShot) ctx.countShot(w.shots);
    for (let i = 0; i < w.shots; i++) {
      const d = _dir.clone();
      if (w.spread > 0) {
        d.x += rand(w.spread, -w.spread);
        d.z += rand(w.spread, -w.spread);
        d.y = rand(w.spread * 0.5, -w.spread * 0.5);
        d.normalize();
      }
      // 高度：跳跃时打更高
      const origin = _v.clone();
      if (w.shots > 1) {
        const fan = (i - (w.shots - 1) / 2) * 0.075;
        const cs = Math.cos(fan), sn = Math.sin(fan);
        d.x = _dir.x * cs - _dir.z * sn;
        d.z = _dir.x * sn + _dir.z * cs;
      }
      bullets.spawn(BULLET.PLAYER, origin, d, w.speed, w.dmg, {
        life: w.range / w.speed,
        pierce: w.pierce ?? 0,
        trail: w.flame,
        spin: w.flame ? 9 : 0,
      });
    }

    this.fx.muzzleFlash(_v, _dir, this.weapon === 'L' ? 1.3 : 1);
    this.fx.shell(_v, _dir);
    if (this.weapon === 'F') {
      // 火焰弹尾迹
      this.fx.spark(_v, 0xff8830, 4);
    }
    if (this.weapon === 'L') this.audio.shotHeavy();
    else this.audio.shot();
  }

  /** 玩家受伤 */
  hurt(amount = 1) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= amount;
    this.invuln = 1.15;
    this.hurtFlash = 0.35;
    this.combo = 0;
    this.comboTimer = 0;
    this.audio.hurt();
    this.fx.addShake(0.55);
    if (this.hp <= 0) {
      this.hp = 0;
      this.lives = Math.max(0, this.lives - 1);
      if (this.lives <= 0) {
        this.die();
      } else {
        // 复活：原地重置 + 短暂无敌
        this.pos.y = 0;
        this.vel.set(0, 0, 0);
        this.hp = this.maxHp;
        this.invuln = 2.4;
        this.fx.explosion(this.pos.clone().setY(1), 0.9, 0xff4040);
      }
    }
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.mesh.visible = false;
    this.fx.explosion(this.pos.clone().setY(1), 1.4, 0xff3020);
    this.audio.death();
    if (this.onDeath) this.onDeath();
  }

  addCombo() {
    this.combo++;
    this.comboTimer = 3.2;
    return this.combo;
  }
}

const _camR = new THREE.Vector3();
const _camF = new THREE.Vector3();
function camera_basis(camera, outR, outF) {
  camera.getWorldDirection(_camF);
  _camF.y = 0;
  if (_camF.lengthSq() < 0.001) _camF.set(1, 0, 0);
  _camF.normalize();
  outF.copy(_camF);
  outR.set(_camF.z, 0, -_camF.x);
}
