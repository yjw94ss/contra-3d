// effects.js —— 粒子、爆炸、枪口火光、冲击波

import * as THREE from 'three';
import { rand, randInt } from './util.js';

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.shake = 0;
    this.shakeDecay = 3.2;
    this._light = null;
  }

  _add(obj, life, update, opts = {}) {
    obj.userData.life = life;
    obj.userData.maxLife = life;
    this.scene.add(obj);
    this.items.push({ obj, life, maxLife: life, update, ...opts });
    return obj;
  }

  /** 爆炸：核心火球 + 碎片 + 烟 + 冲击波环 */
  explosion(pos, scale = 1, color = 0xffa030) {
    const S = scale;

    // 火球
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42 * S, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 1, depthWrite: false })
    );
    core.position.copy(pos);
    this._add(core, 0.26 * S, (o, t) => {
      const k = 1 - t;
      o.scale.setScalar(1 + (1 - k) * 3.0 * S);
      o.material.opacity = k;
      o.material.color.setHSL(0.09 * k + 0.0, 1, 0.55 + 0.45 * k);
    });

    // 碎片
    const n = Math.min(16, Math.round(9 * S));
    const fragGeo = new THREE.BoxGeometry(0.15 * S, 0.15 * S, 0.15 * S);
    const fragMat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(fragGeo, fragMat);
      f.position.copy(pos);
      const v = new THREE.Vector3(rand(1, -1), rand(1.2, 0.2), rand(1, -1)).normalize().multiplyScalar(rand(7, 2.5) * S);
      const spin = new THREE.Vector3(rand(9, -9), rand(9, -9), rand(9, -9));
      this._add(f, rand(0.85, 0.45), (o, t, dt) => {
        o.position.addScaledVector(v, dt);
        v.y -= 22 * dt;
        o.rotation.x += spin.x * dt; o.rotation.y += spin.y * dt; o.rotation.z += spin.z * dt;
        o.material.opacity = 1; // 共享材质，单独不透明
        if (o.position.y < 0.05) { o.position.y = 0.05; v.y *= -0.35; v.multiplyScalar(0.72); }
        o.scale.setScalar(Math.max(0.05, 1 - t * 0.9));
      });
    }

    // 烟（半透明要克制，多个球叠加会糊住画面）
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x4a4a52, transparent: true, opacity: 0.26, depthWrite: false,
    });
    for (let i = 0; i < Math.round(3 * S); i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.26 * S, 8, 6), smokeMat.clone());
      s.position.copy(pos).add(new THREE.Vector3(rand(0.6, -0.6) * S, rand(0.4, -0.2), rand(0.6, -0.6) * S));
      const vy = rand(2.2, 1.2) * S;
      this._add(s, rand(0.75, 0.45), (o, t, dt) => {
        o.position.y += vy * dt;
        o.scale.setScalar(1 + t * 2.2);
        o.material.opacity = 0.24 * (1 - t);
      });
    }

    // 冲击波
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3 * S, 0.44 * S, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this._add(ring, 0.42, (o, t) => {
      o.scale.setScalar(1 + t * 6);
      o.material.opacity = 0.85 * (1 - t);
    });

    this.addShake(0.5 * S);
  }

  /** 枪口火光 */
  muzzleFlash(pos, dir, scale = 1) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.13 * scale, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1 })
    );
    flash.position.copy(pos).addScaledVector(dir, 0.18);
    this._add(flash, 0.07, (o, t) => {
      o.scale.setScalar(1 + t * 2.2);
      o.material.opacity = 1 - t;
    });

    // 点光
    const light = new THREE.PointLight(0xffc060, 2.4 * scale, 5.5, 2);
    light.position.copy(pos).addScaledVector(dir, 0.3);
    this.scene.add(light);
    this._add(light, 0.09, (o, t) => { o.intensity = 2.4 * scale * (1 - t); });
  }

  /** 命中火花 */
  spark(pos, color = 0xffd060, count = 6) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      s.position.copy(pos);
      const v = new THREE.Vector3(rand(5, -5), rand(5, -1), rand(5, -5));
      this._add(s, rand(0.4, 0.22), (o, t, dt) => {
        o.position.addScaledVector(v, dt);
        v.y -= 16 * dt;
        o.scale.setScalar(1 - t);
      });
    }
  }

  /** 弹壳落地 */
  shell(pos, dir) {
    const sh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.09, 5),
      new THREE.MeshBasicMaterial({ color: 0xd8b25a })
    );
    sh.position.copy(pos);
    const v = new THREE.Vector3(rand(2, 0.5), rand(3, 1.6), rand(2, 0.5)).addScaledVector(dir, 1.2);
    this._add(sh, 0.7, (o, t, dt) => {
      o.position.addScaledVector(v, dt);
      v.y -= 18 * dt;
      o.rotation.x += 14 * dt; o.rotation.z += 9 * dt;
      if (o.position.y < 0.03) { o.position.y = 0.03; v.set(0, 0, 0); o.scale.setScalar(1 - t); }
    });
  }

  /** 血/能量爆散（敌人受击） */
  hitBurst(pos, color = 0xff4040) {
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      s.position.copy(pos);
      const v = new THREE.Vector3(rand(4, -4), rand(4, 0), rand(4, -4));
      this._add(s, rand(0.32, 0.16), (o, t, dt) => {
        o.position.addScaledVector(v, dt);
        v.y -= 14 * dt;
        o.scale.setScalar(1 - t * 0.8);
      });
    }
  }

  /** 冲击/落地尘 */
  dust(pos, count = 6, scale = 1) {
    for (let i = 0; i < count; i++) {
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(0.16 * scale, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xa89a80, transparent: true, opacity: 0.55, depthWrite: false })
      );
      d.position.copy(pos).add(new THREE.Vector3(rand(0.4, -0.4), 0.05, rand(0.4, -0.4)));
      const v = new THREE.Vector3(rand(2, -2), rand(1.2, 0.2), rand(2, -2));
      this._add(d, rand(0.6, 0.35), (o, t, dt) => {
        o.position.addScaledVector(v, dt);
        v.y -= 4 * dt;
        o.scale.setScalar(1 + t * 1.8);
        o.material.opacity = 0.5 * (1 - t);
      });
    }
  }

  addShake(amount) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const t = 1 - Math.max(0, it.life) / it.maxLife;
      if (it.update) it.update(it.obj, t, dt);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.geometry && it.obj.geometry.dispose && !it.obj.userData.shared) it.obj.geometry.dispose();
        if (it.obj.material && it.obj.material.dispose) it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - this.shakeDecay * dt);
  }

  /** 取当前抖动偏移 */
  shakeOffset(out) {
    if (this.shake <= 0.001) { out.set(0, 0, 0); return out; }
    const s = this.shake * this.shake;
    out.set(rand(1, -1) * s * 0.5, rand(1, -1) * s * 0.4, rand(1, -1) * s * 0.3);
    return out;
  }
}
