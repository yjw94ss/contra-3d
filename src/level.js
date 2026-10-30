// level.js —— 关卡：地形布置、刷怪节奏、场景装饰

import * as THREE from 'three';
import { rand, randInt, chance, pick, clamp } from './util.js';
import { makeTerrain, makeCrate, makeBarrier, makeBush } from './models.js';

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.length = 620;
    this.obstacles = [];       // 阻挡子弹的盒体
    this.props = [];
    this.spawnPoints = [];
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.built = false;
  }

  build() {
    if (this.built) return;
    // 地面以关卡中点为中心，确保全长覆盖
    const terrain = makeTerrain(this.length + 120, this.length / 2);
    this.scene.add(terrain);
    this.terrain = terrain;
    this.built = true;

    // 沿路布置掩体与装饰（BOSS 战区留空，保证有机甲展开空间）
    const bossZoneStart = this.length - 95;
    for (let x = 6; x < this.length - 40; x += rand(5, 9)) {
      if (x > bossZoneStart) continue;
      const roll = Math.random();
      if (roll < 0.42) {
        // 木箱堆
        const z = rand(8.5, -8.5);
        const crate = makeCrate();
        crate.position.set(x, 0, z);
        this.decor.add(crate);
        this.props.push(crate);
        this.addObstacle(x, 1.5, z, 1.5, 1.4);
        if (chance(0.35)) {
          const c2 = makeCrate();
          c2.position.set(x + rand(1.9, -1.9), 1.4, z);
          c2.rotation.y = rand(1, -1);
          this.decor.add(c2);
          this.props.push(c2);
        }
      } else if (roll < 0.66) {
        // 路障
        const z = rand(9, -9);
        const b = makeBarrier();
        b.position.set(x, 0, z);
        b.rotation.y = rand(0.5, -0.5);
        this.decor.add(b);
        this.props.push(b);
        this.addObstacle(x, 1.7, z, 1.5, 1.1);
      } else if (roll < 0.85) {
        // 灌木（不阻挡子弹，纯装饰）
        const n = randInt(2, 4);
        for (let i = 0; i < n; i++) {
          const bush = makeBush();
          bush.position.set(x + rand(6, -6), 0, rand(11, -11));
          this.decor.add(bush);
        }
      } else {
        // 货箱堆
        const z = rand(9.5, -9.5);
        const c = makeCrate();
        c.scale.setScalar(rand(1.4, 0.9));
        c.position.set(x, 0, z);
        this.decor.add(c);
        this.props.push(c);
        this.addObstacle(x, 1.5 * c.scale.x, z, 1.5 * c.scale.x, 1.4 * c.scale.y);
      }
    }

    // BOSS 竞技场：加装货箱与残骸作视觉参照（不阻挡子弹）
    const arenaStart = this.length - 92;
    for (let x = arenaStart; x < this.length - 25; x += rand(9, 6)) {
      const n = randInt(2, 3);
      for (let i = 0; i < n; i++) {
        const z = rand(10.5, -10.5);
        // 贴着边放，留出中央交战区
        if (Math.abs(z) < 5.5) continue;
        const c = makeCrate();
        c.scale.setScalar(rand(1.5, 1.0));
        c.position.set(x + rand(3, -3), 0, z);
        c.rotation.y = rand(1.2, -1.2);
        this.decor.add(c);
        this.props.push(c);
      }
      // 边缘灌木
      if (chance(0.6)) {
        const bush = makeBush();
        bush.position.set(x + rand(5, -5), 0, rand(12, 8) * (chance(0.5) ? 1 : -1));
        this.decor.add(bush);
      }
    }

    // 刷怪点（BOSS 战区不刷普通兵）
    for (let x = 22; x < this.length - 95; x += rand(7, 4)) {
      this.spawnPoints.push({
        x,
        z: rand(9.5, -9.5),
        type: this.rollType(x),
      });
    }
  }

  rollType(x) {
    const r = Math.random();
    // 越靠后越强
    const prog = clamp(x / this.length, 0, 1);
    if (prog < 0.2) {
      return r < 0.7 ? 'soldier' : 'runner';
    }
    if (prog < 0.45) {
      if (r < 0.45) return 'soldier';
      if (r < 0.72) return 'runner';
      if (r < 0.88) return 'drone';
      return 'turret';
    }
    if (prog < 0.72) {
      if (r < 0.3) return 'soldier';
      if (r < 0.5) return 'runner';
      if (r < 0.68) return 'sniper';
      if (r < 0.85) return 'drone';
      return 'turret';
    }
    if (r < 0.24) return 'soldier';
    if (r < 0.44) return 'runner';
    if (r < 0.6) return 'sniper';
    if (r < 0.76) return 'drone';
    if (r < 0.9) return 'turret';
    return 'heavy';
  }

  addObstacle(x, w, z, d, h) {
    this.obstacles.push({
      x0: x - w / 2, x1: x + w / 2,
      z0: z - d / 2, z1: z + d / 2,
      y0: 0, y1: h,
    });
  }

  /** 取得该 x 附近应刷的敌人配置 */
  spawnsNear(x, ahead = 34, behind = 8) {
    const out = [];
    for (const sp of this.spawnPoints) {
      if (sp.x > x - behind && sp.x < x + ahead) out.push(sp);
    }
    return out;
  }

  /** 清场后是否到 BOSS 点 */
  bossTrigger() {
    return this.length - 78;
  }

  clear() {
    // 清空装饰组与地形，避免重开游戏时叠加
    while (this.decor.children.length) this.decor.remove(this.decor.children[0]);
    if (this.terrain) {
      this.scene.remove(this.terrain);
      this.terrain.traverse((o) => {
        if (o.isMesh || o.isPoints) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        }
      });
      this.terrain = null;
    }
    this.props.length = 0;
    this.obstacles.length = 0;
    this.spawnPoints.length = 0;
    this.built = false;
  }
}
