// input.js —— 键盘 / 鼠标输入

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // 本帧新按下
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, clicked: false };
    this.anyKeyFlag = false;

    this._onKeyDown = (e) => {
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      // 阻止方向键/空格滚动页面
      if ([
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'
      ].includes(code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this._onBlur = () => { this.keys.clear(); this.mouse.down = false; };

    this._onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
      this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
    };
    this._onDown = (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    };
    this._onUp = (e) => { if (e.button === 0) this.mouse.down = false; };
    this._onCtx = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    canvas.addEventListener('contextmenu', this._onCtx);
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }

  /** 每帧末尾清理 */
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }

  /** 读取移动轴：x = 左右(沿走廊)，z = 纵深 */
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    return { x, z };
  }

  firing() {
    return this.mouse.down || this.down('KeyJ');
  }
  jumpPressed() {
    return this.justPressed('Space') || this.justPressed('KeyK');
  }
  proneDown() {
    return this.down('ShiftLeft') || this.down('ShiftRight') || this.down('KeyL');
  }
}
