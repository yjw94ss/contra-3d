// level.js —— 关卡：按配置生成地形、刷怪节奏、场景装饰

import * as THREE from 'three';
import { rand, randInt, chance, pick, clamp } from './util.js';
import { makeTerrain, makeCrate, makeBarrier, makeBush, makePylon, makePipe } from './models.js';
import { rollFromPool } from './stages.js';

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
    this.config = null;
  }

  /** 按关卡配置重建 */
  build(config) {
    this.clear();
    this.config = config;
    this.length = config.length;

    const theme = config;
    const terrain = makeTerrain(this.length + 140, this.length / 2, theme);
    this.scene.add(terrain);
    this.terrain = terrain;
    this.built = true;

    const density = config.propDensity ?? 1;
    const bossZoneStart = this.length - 95;

    // 沿路布置掩体与装饰
    for (let x = 6; x < bossZoneStart; x += rand(5, 9) / density) {
      const roll = Math.random();
      if (roll < 0.42) {
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
        const z = rand(9, -9);
        const b = makeBarrier();
        b.position.set(x, 0, z);
        b.rotation.y = rand(0.5, -0.5);
        this.decor.add(b);
        this.props.push(b);
        this.addObstacle(x, 1.7, z, 1.5, 1.1);
      } else if (roll < 0.85) {
        const n = randInt(2, 4);
        for (let i = 0; i < n; i++) {
          const bush = makeBush();
          bush.position.set(x + rand(6, -6), 0, rand(11, -11));
          this.decor.add(bush);
        }
      } else {
        const z = rand(9.5, -9.5);
        const c = makeCrate();
        c.scale.setScalar(rand(1.4, 0.9));
        c.position.set(x, 0, z);
        this.decor.add(c);
        this.props.push(c);
        this.addObstacle(x, 1.5 * c.scale.x, z, 1.5 * c.scale.x, 1.4 * c.scale.y);
      }

      // 主题专属装饰
      this.themeDecor(x, theme.theme);
    }

    // BOSS 竞技场：加装货箱作视觉参照（不阻挡子弹）
    const arenaStart = bossZoneStart + 3;
    for (let x = arenaStart; x < this.length - 25; x += rand(9, 6)) {
      const n = randInt(2, 3);
      for (let i = 0; i < n; i++) {
        const z = rand(10.5, -10.5);
        if (Math.abs(z) < 5.5) continue;
        const c = makeCrate();
        c.scale.setScalar(rand(1.5, 1.0));
        c.position.set(x + rand(3, -3), 0, z);
        c.rotation.y = rand(1.2, -1.2);
        this.decor.add(c);
        this.props.push(c);
      }
      if (chance(0.6)) {
        const bush = makeBush();
        bush.position.set(x + rand(5, -5), 0, rand(12, 8) * (chance(0.5) ? 1 : -1));
        this.decor.add(bush);
      }
    }

    // 刷怪点
    for (let x = 22; x < bossZoneStart; x += rand(7, 4) / density) {
      this.spawnPoints.push({
        x,
        z: rand(9.5, -9.5),
        type: this.rollType(x),
      });
    }
  }

  /** 按主题添加环境装饰 */
  themeDecor(x, kind) {
    if (kind === 'industrial') {
      if (chance(0.45)) {
        const p = makePylon();
        p.position.set(x + rand(6, -6), 0, rand(11, -11));
        this.decor.add(p);
      }
      if (chance(0.3)) {
        const pipe = makePipe();
        pipe.position.set(x + rand(8, -8), 0, rand(12, -12));
        pipe.rotation.y = rand(3, -3);
        this.decor.add(pipe);
      }
    } else if (kind === 'lava') {
      if (chance(0.5)) {
        const p = makePylon();
        p.position.set(x + rand(7, -7), 0, rand(11, -11));
        p.scale.setScalar(rand(1.3, 0.8));
        this.decor.add(p);
      }
    } else if (kind === 'snow') {
      if (chance(0.4)) {
        const p = makePipe();
        p.position.set(x + rand(8, -8), 0, rand(12, -12));
        p.rotation.y = rand(3, -3);
        this.decor.add(p);
      }
    } else if (kind === 'final') {
      if (chance(0.55)) {
        const p = makePylon();
        p.position.set(x + rand(7, -7), 0, rand(11, -11));
        p.scale.setScalar(rand(1.4, 0.9));
        this.decor.add(p);
      }
    }
  }

  rollType(x) {
    const cfg = this.config;
    if (!cfg) return 'soldier';
    const prog = clamp(x / this.length, 0, 1);
    // 后 35% 启用强化配比
    const pool = prog > 0.65 && cfg.latePool ? cfg.latePool : cfg.enemyPool;
    return rollFromPool(pool);
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

  /** BOSS 触发点 */
  bossTrigger() {
    return this.length - 78;
  }

  /** 每帧更新环境粒子（雪/火星/沙尘） */
  update(dt) {
    if (!this.terrain || !this.terrain.userData.weather) return;
    const pts = this.terrain.userData.weather;
    const pos = pts.geometry.attributes.position;
    const vel = pts.userData.vel;
    const kind = pts.userData.kind;
    const arr = pos.array;
    const drift = kind === 'lava' ? 1.6 : 0.5;
    for (let i = 0; i < vel.length; i++) {
      const iy = i * 3 + 1;
      arr[iy] -= vel[i] * dt;
      arr[i * 3] += Math.sin(arr[iy] * 0.3 + i) * drift * dt;
      if (arr[iy] < 0) {
        arr[iy] = kind === 'lava' ? 40 : 38;
        arr[i * 3] = (Math.random() - 0.5) * 160;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
    }
    pos.needsUpdate = true;
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
