// bullets.js —— 子弹 / 火箭 池与碰撞

import * as THREE from 'three';
import { rand } from './util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _segLen = new THREE.Vector3();

/** 点到线段的最短距离平方（连续碰撞检测） */
function pointSegDistSq(px, py, pz, ax, ay, az, bx, by, bz) {
  _seg.set(bx - ax, by - ay, bz - az);
  const l2 = _seg.lengthSq();
  if (l2 < 1e-8) {
    const dx = px - ax, dy = py - ay, dz = pz - az;
    return dx * dx + dy * dy + dz * dz;
  }
  let t = ((px - ax) * _seg.x + (py - ay) * _seg.y + (pz - az) * _seg.z) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + _seg.x * t - px;
  const cy = ay + _seg.y * t - py;
  const cz = az + _seg.z * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

export const BULLET = {
  PLAYER: 0,
  ENEMY: 1,
  ROCKET: 2,
  SNIPER: 3,
};

export class Bullets {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.fx = effects;
    this.audio = audio;
    this.list = [];

    // 玩家子弹：黄色曳光条
    this.geoPlayer = new THREE.CapsuleGeometry(0.055, 0.34, 3, 6);
    this.geoPlayer.rotateX(Math.PI / 2);
    this.matPlayer = new THREE.MeshBasicMaterial({ color: 0xffe27a });

    // 敌方子弹：红色小球
    this.geoEnemy = new THREE.SphereGeometry(0.11, 8, 6);
    this.matEnemy = new THREE.MeshBasicMaterial({ color: 0xff5030 });

    // 狙击弹：细长白蓝
    this.geoSniper = new THREE.CapsuleGeometry(0.045, 0.6, 3, 6);
    this.geoSniper.rotateX(Math.PI / 2);
    this.matSniper = new THREE.MeshBasicMaterial({ color: 0xaee8ff });

    // 火箭
    this.geoRocket = new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6);
    this.geoRocket.rotateX(Math.PI / 2);
    this.matRocket = new THREE.MeshStandardMaterial({
      color: 0xff7a30, emissive: 0xff4400, emissiveIntensity: 1.6, roughness: 0.5,
    });
  }

  spawn(type, pos, dir, speed, damage, opts = {}) {
    let mesh;
    if (type === BULLET.PLAYER) mesh = new THREE.Mesh(this.geoPlayer, this.matPlayer);
    else if (type === BULLET.ENEMY) mesh = new THREE.Mesh(this.geoEnemy, this.matEnemy);
    else if (type === BULLET.SNIPER) mesh = new THREE.Mesh(this.geoSniper, this.matSniper);
    else mesh = new THREE.Mesh(this.geoRocket, this.matRocket);

    mesh.position.copy(pos);
    this.scene.add(mesh);

    const b = {
      type, mesh,
      vel: dir.clone().multiplyScalar(speed),
      damage,
      life: opts.life ?? 2.4,
      fromPlayer: type === BULLET.PLAYER || type === BULLET.ROCKET,
      radius: type === BULLET.PLAYER ? 0.26 : type === BULLET.ROCKET ? 0.34 : 0.3,
      explode: opts.explode ?? (type === BULLET.ROCKET),
      explodeRadius: opts.explodeRadius ?? 2.6,
      pierce: opts.pierce ?? 0,
      trail: opts.trail ?? (type === BULLET.ROCKET),
      spin: opts.spin ?? 0,
      dead: false,
    };
    this.list.push(b);
    return b;
  }

  /**
   * @param {number} dt
   * @param {Array} enemies  敌人列表
   * @param {object} player   玩家（用于敌方子弹判定）
   * @param {Array} obstacles 障碍盒（阻挡子弹）
   * @param {object} boss     BOSS（单独判定，不在 enemies 数组里）
   */
  update(dt, enemies, player, obstacles, onEnemyHit, onPlayerHit, boss = null) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      // 记录上一帧位置，用于连续碰撞检测（防止高速子弹穿过目标）
      _prev.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.spin) b.mesh.rotation.z += b.spin * dt;

      // 朝向速度方向
      _w.copy(b.vel).normalize();
      b.mesh.lookAt(b.mesh.position.x + _w.x, b.mesh.position.y + _w.y, b.mesh.position.z + _w.z);
      // 尾焰
      if (b.trail && Math.random() < 0.6) {
        this.fx.spark(b.mesh.position, 0xffa040, 1);
      }

      let hit = false;

      // 与 BOSS 碰撞（连续检测：防止高速子弹穿过目标）
      if (b.fromPlayer && boss && !boss.dead && boss.hitTest) {
        let r = { hit: false, crit: false };
        // 沿上一帧→当前位置的线段采样 4 个点
        for (let s = 1; s <= 4; s++) {
          const t = s / 4;
          _v.lerpVectors(_prev, b.mesh.position, t);
          r = boss.hitTest(_v);
          if (r.hit) break;
        }
        if (r.hit) {
          hit = true;
          if (onEnemyHit) onEnemyHit(boss, b, false, r.crit);
          if (b.pierce > 0) { b.pierce--; hit = false; }
        }
      }

      // 与障碍碰撞（连续检测：防止子弹穿过掩体）
      if (!hit && obstacles) {
        for (const o of obstacles) {
          // 采样线段上的点，判断是否进入盒体
          let blocked = false;
          for (let s = 1; s <= 3; s++) {
            const t = s / 3;
            _v.lerpVectors(_prev, b.mesh.position, t);
            if (_v.x > o.x0 && _v.x < o.x1 &&
                _v.z > o.z0 && _v.z < o.z1 &&
                _v.y > o.y0 && _v.y < o.y1) { blocked = true; break; }
          }
          if (blocked) {
            hit = true;
            this.fx.spark(b.mesh.position, 0xffd060, 3);
            break;
          }
        }
      }

      // 与敌人碰撞（连续检测）
      if (!hit && b.fromPlayer && enemies) {
        for (const e of enemies) {
          if (e.dead) continue;
          const rr = (e.hitRadius ?? 0.7) + b.radius;
          const d2 = pointSegDistSq(
            e.pos.x, e.pos.y + 0.9, e.pos.z,
            _prev.x, _prev.y, _prev.z,
            b.mesh.position.x, b.mesh.position.y, b.mesh.position.z
          );
          if (d2 < rr * rr) {
            hit = true;
            if (onEnemyHit) onEnemyHit(e, b);
            if (b.pierce > 0) { b.pierce--; hit = false; }
            break;
          }
        }
      }

      // 与玩家碰撞
      if (!b.fromPlayer && player && !player.dead) {
        const dx = b.mesh.position.x - player.pos.x;
        const dy = b.mesh.position.y - (player.pos.y + player.centerY);
        const dz = b.mesh.position.z - player.pos.z;
        const rr = player.hitRadius + b.radius;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          hit = true;
          if (onPlayerHit) onPlayerHit(b);
        }
      }

      // 地面
      if (!hit && b.mesh.position.y <= 0.06) {
        hit = true;
        this.fx.spark(b.mesh.position, 0x9a8a70, 3);
      }

      if (hit || b.life <= 0) {
        if (b.explode) {
          this.fx.explosion(b.mesh.position, 1.1, 0xff8030);
          this.audio.explosion(false);
          // 范围伤害：普通敌人
          if (b.fromPlayer && enemies && onEnemyHit) {
            for (const e of enemies) {
              if (e.dead) continue;
              const d = e.pos.distanceTo(b.mesh.position);
              if (d < b.explodeRadius) {
                onEnemyHit(e, { ...b, damage: b.damage * (1 - d / b.explodeRadius) }, true);
              }
            }
          }
          // 范围伤害：BOSS
          if (b.fromPlayer && boss && !boss.dead && onEnemyHit) {
            const d = Math.hypot(
              boss.pos.x - b.mesh.position.x,
              boss.pos.z - b.mesh.position.z
            );
            if (d < b.explodeRadius + boss.hitRadius) {
              onEnemyHit(boss, { ...b, damage: b.damage * (1 - d / (b.explodeRadius + boss.hitRadius)) }, true);
            }
          }
        }
        this.scene.remove(b.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.mesh);
    this.list.length = 0;
  }
}
