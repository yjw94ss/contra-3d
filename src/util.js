// util.js —— 数学工具、随机、8向吸附

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(rand(b, a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

/** 帧率无关的指数插值，lambda 越大跟得越紧 */
export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

export function dampVec(v, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  v.x = lerp(v.x, target.x, t);
  v.y = lerp(v.y, target.y, t);
  v.z = lerp(v.z, target.z, t);
  return v;
}

/** 角度归一到 (-PI, PI] */
export function wrapAngle(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/**
 * 8 向吸附（魂斗罗式）：输入方向单位向量，按 45° 栅格吸附。
 * 关键：先转到「屏幕坐标系」再吸附，否则在斜俯视镜头下斜射方向会歪。
 * @param {THREE.Vector3} rightXZ  镜头右向量（XZ 平面）
 * @param {THREE.Vector3} fwdXZ     镜头前向量（XZ 平面，已归一）
 */
export function snapTo8(dir, rightXZ, fwdXZ, out) {
  const sx = dir.x * rightXZ.x + dir.z * rightXZ.z;
  const sy = dir.x * -fwdXZ.x + dir.z * -fwdXZ.z;
  const len = Math.hypot(sx, sy) || 1;
  const ang = Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  // 屏幕方向 (cs, sn) 转回世界 XZ
  out.x = rightXZ.x * cs + -fwdXZ.x * sn;
  out.z = rightXZ.z * cs + -fwdXZ.z * sn;
  const l = Math.hypot(out.x, out.z) || 1;
  out.x /= l; out.z /= l;
  return out;
}

/** 简易对象池 */
export class Pool {
  constructor(factory, reset, size = 32) {
    this.factory = factory;
    this.reset = reset;
    this.items = [];
    this.free = [];
    for (let i = 0; i < size; i++) {
      const it = factory();
      it._alive = false;
      this.items.push(it);
      this.free.push(it);
    }
  }
  get() {
    const it = this.free.pop();
    if (!it) {
      const n = this.factory();
      n._alive = false;
      this.items.push(n);
      return n;
    }
    return it;
  }
  release(it) {
    if (it._alive) {
      it._alive = false;
      this.free.push(it);
      this.reset(it);
    }
  }
}

/** 简易 2D AABB（XZ 平面）相交测试 */
export function aabbOverlapXZ(ax0, ax1, az0, az1, bx0, bx1, bz0, bz1) {
  return ax0 <= bx1 && ax1 >= bx0 && az0 <= bz1 && az1 >= bz0;
}
