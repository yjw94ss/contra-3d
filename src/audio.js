// audio.js —— 纯 WebAudio 合成音效，零外部资源

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = false;
    this._musicTimer = null;
    this._step = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  _now() { return this.ctx.currentTime; }

  _noiseBuffer(dur = 0.4) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 噪声爆音（枪声/爆炸基底） */
  _noise({ dur = 0.12, gain = 0.5, type = 'lowpass', freq = 1800, q = 1, sweep = 0 }) {
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
    return g;
  }

  /** 方波/三角波音调（UI、拾取、警报） */
  _tone({ freq = 440, dur = 0.12, gain = 0.25, type = 'square', slide = 0, delay = 0 }) {
    const t = this._now() + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
    return g;
  }

  shot() {
    if (!this.ctx || this.muted) return;
    this._noise({ dur: 0.075, gain: 0.28, freq: 2600, sweep: -2200 });
    this._tone({ freq: 180, dur: 0.05, gain: 0.12, type: 'square', slide: -110 });
  }
  shotHeavy() {
    if (!this.ctx || this.muted) return;
    this._noise({ dur: 0.16, gain: 0.4, freq: 1500, sweep: -1200 });
    this._tone({ freq: 90, dur: 0.14, gain: 0.24, type: 'sawtooth', slide: -50 });
  }
  enemyShot() {
    if (!this.ctx || this.muted) return;
    this._noise({ dur: 0.08, gain: 0.16, freq: 1500, sweep: -1000 });
  }
  explosion(big = false) {
    if (!this.ctx || this.muted) return;
    this._noise({ dur: big ? 0.75 : 0.36, gain: big ? 0.55 : 0.34, freq: big ? 900 : 1400, sweep: -800 });
    this._tone({ freq: big ? 70 : 110, dur: big ? 0.5 : 0.26, gain: big ? 0.3 : 0.2, type: 'sine', slide: -45 });
  }
  hit() {
    if (!this.ctx || this.muted) return;
    this._noise({ dur: 0.07, gain: 0.2, freq: 3400, sweep: -2600 });
  }
  hurt() {
    if (!this.ctx || this.muted) return;
    this._tone({ freq: 320, dur: 0.22, gain: 0.3, type: 'sawtooth', slide: -190 });
    this._noise({ dur: 0.2, gain: 0.2, freq: 900, sweep: -600 });
  }
  jump() {
    if (!this.ctx || this.muted) return;
    this._tone({ freq: 320, dur: 0.13, gain: 0.14, type: 'triangle', slide: 300 });
  }
  land() {
    if (!this.ctx || this.muted) return;
    this._noise({ dur: 0.1, gain: 0.18, freq: 500, sweep: -300 });
  }
  pickup() {
    if (!this.ctx || this.muted) return;
    this._tone({ freq: 660, dur: 0.09, gain: 0.2, type: 'square' });
    this._tone({ freq: 990, dur: 0.11, gain: 0.2, type: 'square', delay: 0.08 });
    this._tone({ freq: 1320, dur: 0.14, gain: 0.18, type: 'square', delay: 0.17 });
  }
  death() {
    if (!this.ctx || this.muted) return;
    this._tone({ freq: 400, dur: 0.7, gain: 0.26, type: 'sawtooth', slide: -330 });
    this._noise({ dur: 0.6, gain: 0.26, freq: 1600, sweep: -1400 });
  }
  uiClick() {
    if (!this.ctx || this.muted) return;
    this._tone({ freq: 760, dur: 0.06, gain: 0.16, type: 'square' });
  }
  bossAlert() {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 3; i++) {
      this._tone({ freq: 440, dur: 0.18, gain: 0.2, type: 'sawtooth', delay: i * 0.34 });
      this._tone({ freq: 330, dur: 0.18, gain: 0.18, type: 'sawtooth', delay: i * 0.34 + 0.16 });
    }
  }
  stageClear() {
    if (!this.ctx || this.muted) return;
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => this._tone({ freq: f, dur: 0.26, gain: 0.2, type: 'triangle', delay: i * 0.13 }));
  }

  /** 简单循环 BGM：底鼓 + 贝斯 + 主旋律 */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicBus.gain.setTargetAtTime(0.34, this.ctx.currentTime, 0.4);
    const bpm = 138;
    const stepDur = 60 / bpm / 4;   // 16 分音
    const bass = [0, 0, 7, 0, 5, 0, 3, 0];
    const root = 55; // A1
    this._step = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const s = this._step % 16;
      // 底鼓
      if (s % 4 === 0) {
        this._tone({ freq: 130, dur: 0.14, gain: 0.3, type: 'sine', slide: -80 });
      }
      // 军鼓
      if (s === 4 || s === 12) {
        this._noise({ dur: 0.09, gain: 0.12, type: 'highpass', freq: 1500 });
      }
      // 贝斯
      if (s % 2 === 0) {
        const n = bass[(s / 2) % bass.length];
        const f = root * Math.pow(2, n / 12);
        this._tone({ freq: f, dur: 0.16, gain: 0.16, type: 'sawtooth' });
      }
      // 主旋律（每两拍换一次）
      if (s % 8 === 0) {
        const mel = [440, 523, 659, 587];
        this._tone({ freq: mel[(Math.floor(this._step / 8)) % mel.length], dur: 0.3, gain: 0.09, type: 'square' });
      }
      this._step++;
      this._musicTimer = setTimeout(tick, stepDur * 1000);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }
}
