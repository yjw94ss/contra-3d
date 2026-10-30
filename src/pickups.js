// pickups.js —— 可拾取道具：医疗包 / 散弹 / 速射 / 火焰 / 激光

import * as THREE from 'three';
import { rand, chance } from './util.js';
import { makePickup } from './models.js';

const KIND_WEIGHT = [
  ['health', 0.30],
  ['spread', 0.22],
  ['rapid', 0.22],
  ['flame', 0.14],
  ['laser', 0.12],
];

export class Pickups {
  constructor(scene, audio, effects) {
    this.scene = scene;
    this.audio = audio;
    this.fx = effects;
    this.list = [];
  }

  randomKind() {
    const r = Math.random();
    let acc = 0;
    for (const [k, w] of KIND_WEIGHT) {
      acc += w;
      if (r <= acc) return k;
    }
    return 'health';
  }

  spawn(x, z, kind = null) {
    const k = kind || this.randomKind();
    const mesh = makePickup(k);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.list.push({
      kind: k, mesh, pos: new THREE.Vector3(x, 0, z),
      t: rand(10), life: 14, bob: rand(6.28),
    });
  }

  update(dt, player, onCollect) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.life -= dt;

      // 浮动 + 自转
      p.bob += dt * 2.4;
      p.mesh.position.y = 0.42 + Math.sin(p.bob) * 0.16;
      p.mesh.rotation.y += dt * 1.6;

      // 即将消失时闪烁
      if (p.life < 3) {
        p.mesh.visible = Math.floor(p.life * 8) % 2 === 0;
      }

      // 拾取判定
      const dx = player.pos.x - p.pos.x;
      const dz = player.pos.z - p.pos.z;
      const dy = player.pos.y - p.mesh.position.y;
      if (dx * dx + dz * dz < 1.1 * 1.1 && Math.abs(dy) < 1.6) {
        this.audio.pickup();
        this.fx.spark(p.mesh.position, 0xffee88, 8);
        if (onCollect) onCollect(p.kind);
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
        continue;
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list.length = 0;
  }
}
