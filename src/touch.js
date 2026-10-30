// touch.js —— 移动端触控层
//
// 设计：
//   左半屏  = 虚拟摇杆（推动移动，兼顾纵深轴）
//   右半屏  = 点哪打哪（按住即持续射击，触点即准星）
//   右下角  = 跳跃 / 卧倒 两个功能键
//
// 键鼠与触控可共存：桌面端不显示任何触控 UI。

const STICK_RADIUS = 62;      // 摇杆最大半径（CSS px）
const DEAD_ZONE = 0.18;       // 摇杆死区

export class TouchControls {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.enabled = false;

    // 摇杆状态
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
    // 瞄准状态
    this.aim = { id: null, x: 0, y: 0, active: false };
    // 功能键状态
    this.btnJump = false;
    this.btnProne = false;
    this.jumpEdge = false;

    this.root = document.getElementById('touch-ui');
    this.stickEl = document.getElementById('tc-stick');
    this.stickKnob = document.getElementById('tc-knob');
    this.btnJumpEl = document.getElementById('tc-jump');
    this.btnProneEl = document.getElementById('tc-prone');
    this.aimDot = document.getElementById('tc-aimdot');

    this._bind();
  }

  /** 是否应该显示触控 UI（触屏设备 + 横屏） */
  static shouldEnable() {
    const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // 触屏设备默认开；混合设备（带触摸屏的笔记本）也开
    return touchCapable && (coarse || navigator.maxTouchPoints > 0);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root.classList.remove('hidden');
    document.body.classList.add('touch-mode');
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.root.classList.add('hidden');
    document.body.classList.remove('touch-mode');
  }

  _bind() {
    const c = this.canvas;

    const isLeft = (x) => x < window.innerWidth * 0.5;
    // 功能键区域不参与摇杆/瞄准（Touch 对象没有 getBoundingClientRect，
    // 用 elementFromPoint 反查命中的元素）
    const onButton = (t) => {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      return !!(el && el.closest && el.closest('#tc-buttons'));
    };

    c.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (onButton(t)) continue;
        if (isLeft(t.clientX) && this.stick.id === null) {
          this.stick.id = t.identifier;
          this.stick.ox = t.clientX;
          this.stick.oy = t.clientY;
          this.stick.x = t.clientX;
          this.stick.y = t.clientY;
          this.stick.active = true;
          this._showStick(true);
        } else if (!isLeft(t.clientX) && this.aim.id === null) {
          this.aim.id = t.identifier;
          this.aim.x = t.clientX;
          this.aim.y = t.clientY;
          this.aim.active = true;
          this._showAim(true);
        }
      }
    }, { passive: false });

    c.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.x = t.clientX;
          this.stick.y = t.clientY;
          this._updateStick();
        } else if (t.identifier === this.aim.id) {
          this.aim.x = t.clientX;
          this.aim.y = t.clientY;
          this._showAim(true);
        }
      }
    }, { passive: false });

    const end = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.id = null;
          this.stick.active = false;
          this.stick.x = this.stick.y = 0;
          this._showStick(false);
        } else if (t.identifier === this.aim.id) {
          this.aim.id = null;
          this.aim.active = false;
          this._showAim(false);
        }
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);

    // 功能键
    const bindBtn = (el, onDown, onUp) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        onDown();
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (onUp) onUp();
      }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); onDown(); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); e.stopPropagation(); if (onUp) onUp(); });
    };
    // 跳跃：点一下触发一次
    bindBtn(this.btnJumpEl,
      () => { this.btnJump = true; this.jumpEdge = true; },
      () => { this.btnJump = false; });
    // 卧倒：切换式 —— 点一下保持卧倒，再点恢复（比按住好用得多）
    bindBtn(this.btnProneEl,
      () => {
        this.btnProne = !this.btnProne;
        this.btnProneEl.classList.toggle('active', this.btnProne);
      });
  }

  _updateStick() {
    let dx = this.stick.x - this.stick.ox;
    let dy = this.stick.y - this.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    this.stickKnob.style.transform =
      `translate(${this.stick.ox + dx}px, ${this.stick.oy + dy}px) translate(-50%, -50%)`;
  }

  _showStick(on) {
    if (on) {
      this.stickEl.style.left = this.stick.ox + 'px';
      this.stickEl.style.top = this.stick.oy + 'px';
      this.stickEl.style.opacity = '1';
      this.stickKnob.style.transform =
        `translate(${this.stick.ox}px, ${this.stick.oy}px) translate(-50%, -50%)`;
    } else {
      this.stickEl.style.opacity = '0';
    }
  }

  _showAim(on) {
    if (on) {
      this.aimDot.style.left = this.aim.x + 'px';
      this.aimDot.style.top = this.aim.y + 'px';
      this.aimDot.style.opacity = '1';
    } else {
      this.aimDot.style.opacity = '0';
    }
  }

  /**
   * 把触控状态写回 input，供游戏逻辑读取。
   * @param {Input} input
   */
  applyTo(input) {
    if (!this.enabled) return;

    // 移动：摇杆向量映射到 x(左右) / z(纵深)
    if (this.stick.active) {
      let dx = this.stick.x - this.stick.ox;
      let dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        dx = (dx / d) * STICK_RADIUS;
        dy = (dy / d) * STICK_RADIUS;
      }
      const nx = dx / STICK_RADIUS;
      const ny = dy / STICK_RADIUS;
      if (Math.hypot(nx, ny) > DEAD_ZONE) {
        input.touchMove.x = nx;
        input.touchMove.z = ny;
      } else {
        input.touchMove.x = 0;
        input.touchMove.z = 0;
      }
    } else {
      input.touchMove.x = 0;
      input.touchMove.z = 0;
    }

    // 射击：右半屏按住
    input.touchFiring = this.aim.active;

    // 瞄准：把触点转成 NDC 坐标，供鼠标瞄准逻辑复用
    if (this.aim.active) {
      input.touchNdcX = (this.aim.x / window.innerWidth) * 2 - 1;
      input.touchNdcY = -(this.aim.y / window.innerHeight) * 2 + 1;
      input.touchAimActive = true;
    } else {
      input.touchAimActive = false;
    }

    // 功能键
    input.touchJump = this.btnJump;
    input.touchJumpEdge = this.jumpEdge;
    this.jumpEdge = false;
    input.touchProne = this.btnProne;
  }
}
