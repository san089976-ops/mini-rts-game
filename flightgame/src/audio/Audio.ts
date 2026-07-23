/** Lightweight Web Audio SFX (no external files). */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineNoise: AudioBufferSourceNode | null = null;
  private engineNoiseGain: GainNode | null = null;
  private started = false;
  private muted = false;
  private lastThreatBeep = 0;
  private threatWasFull = false;

  /** Call from a user gesture (start / resume). */
  resume() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    this.startEngineGraph();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  updateEngine(throttle: number, speed: number, airborne: boolean) {
    if (!this.started || !this.engineGain || !this.engineOsc || !this.engineFilter || !this.engineNoiseGain) return;
    const t = Math.max(0, Math.min(1, throttle));
    const s = Math.max(0, speed);
    // Slightly louder engine bed (still quieter than combat SFX)
    const base = airborne ? 0.05 : 0.028;
    const vol = base + t * 0.12 + Math.min(0.055, s / 1800);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : vol, this.ctx!.currentTime, 0.05);
    this.engineNoiseGain.gain.setTargetAtTime(this.muted ? 0 : vol * 0.32, this.ctx!.currentTime, 0.05);
    const freq = 55 + t * 90 + s * 0.35;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx!.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(400 + t * 1800 + s * 4, this.ctx!.currentTime, 0.08);
  }

  stopEngine() {
    if (!this.engineGain || !this.ctx) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (this.engineNoiseGain) this.engineNoiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  playCannon() {
    this.noiseBurst(0.05, 0.28, 2000, 450, 'sawtooth');
    this.beep(190, 0.035, 0.18, 'square');
  }

  playMg() {
    this.noiseBurst(0.028, 0.16, 3200, 900, 'square');
    this.beep(320, 0.02, 0.1, 'square');
  }

  playRocket() {
    // whoosh + soft thump (less harsh than old sawtooth scream)
    this.noiseBurst(0.12, 0.2, 900, 160, 'triangle');
    this.sweep(160, 70, 0.28, 0.18, 'triangle');
    this.beep(95, 0.08, 0.14, 'sine');
  }

  playMissile() {
    // clean launch ping + airy whoosh
    this.beep(620, 0.05, 0.14, 'sine');
    this.beep(930, 0.07, 0.1, 'triangle');
    this.noiseBurst(0.18, 0.16, 1100, 180, 'triangle');
    this.sweep(280, 110, 0.32, 0.14, 'sine');
  }

  playFlare() {
    this.noiseBurst(0.22, 0.35, 1800, 300, 'sawtooth');
    this.sweep(520, 180, 0.25, 0.2, 'triangle');
  }

  playBombDrop() {
    this.sweep(190, 55, 0.3, 0.24, 'triangle');
  }

  playExplosion(size = 1) {
    const s = Math.max(0.5, Math.min(2.2, size));
    this.noiseBurst(0.32 * s, 0.72 * s, 1000, 70, 'sawtooth');
    this.beep(85 / s, 0.22 * s, 0.4, 'sine');
  }

  playHit() {
    this.beep(540, 0.06, 0.16, 'square');
  }

  playCrash() {
    this.noiseBurst(0.6, 0.85, 750, 40, 'sawtooth');
    this.sweep(210, 40, 0.65, 0.5, 'sawtooth');
  }

  /** Short lock acquisition tick; pitch optional. */
  playLockTick(pitchScale = 1) {
    this.beep(900 * pitchScale, 0.045, 0.16, 'sine');
  }

  /** Final solid lock tone (long beep). */
  playLockTone() {
    this.beep(1250, 0.28, 0.28, 'sine');
    this.beep(980, 0.18, 0.12, 'triangle');
  }

  /**
   * Progressive threat beeps when AA is locking the player.
   * Interval shortens with progress; full lock tone once.
   * While a missile is actively tracking the player: continuous rapid beeps.
   */
  updateThreatLockAudio(progress: number, now: number, missileIncoming = false) {
    // Inbound missile tracking: keep rapid di-di alarm
    if (missileIncoming) {
      this.threatWasFull = true;
      const interval = 0.11;
      if (now - this.lastThreatBeep >= interval) {
        this.lastThreatBeep = now;
        this.beep(1180, 0.07, 0.26, 'sine');
        this.beep(880, 0.05, 0.12, 'triangle');
      }
      return;
    }

    if (progress <= 0.02) {
      this.threatWasFull = false;
      return;
    }
    if (progress >= 1) {
      // locked but no missile in air yet: solid repeating short long-beeps
      if (!this.threatWasFull) {
        this.threatWasFull = true;
        this.playLockTone();
        this.lastThreatBeep = now;
      } else if (now - this.lastThreatBeep >= 0.45) {
        this.lastThreatBeep = now;
        this.beep(1100, 0.16, 0.22, 'sine');
      }
      return;
    }
    this.threatWasFull = false;
    const interval = 0.55 - progress * 0.47;
    if (now - this.lastThreatBeep >= interval) {
      this.lastThreatBeep = now;
      this.beep(720 + progress * 280, 0.05, 0.18, 'sine');
    }
  }

  playUi() {
    this.beep(660, 0.055, 0.12, 'sine');
  }

  private ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      this.engineBus = this.ctx.createGain();
      this.engineBus.gain.value = 0.48;
      this.engineBus.connect(this.master);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 1.55;
      this.sfx.connect(this.master);
    }
    return this.ctx;
  }

  private startEngineGraph() {
    const ctx = this.ensure();
    if (this.started) return;
    this.started = true;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.engineBus!);

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 70;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.28;
    this.engineOsc.connect(oscGain);
    oscGain.connect(this.engineFilter);
    this.engineOsc.start();

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    this.engineNoise = ctx.createBufferSource();
    this.engineNoise.buffer = buffer;
    this.engineNoise.loop = true;
    this.engineNoiseGain = ctx.createGain();
    this.engineNoiseGain.gain.value = 0;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.7;
    this.engineNoise.connect(noiseFilter);
    noiseFilter.connect(this.engineNoiseGain);
    this.engineNoiseGain.connect(this.engineBus!);
    this.engineNoise.start();
  }

  private beep(freq: number, dur: number, vol: number, type: OscillatorType) {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfx!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private sweep(f0: number, f1: number, dur: number, vol: number, type: OscillatorType) {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfx!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number, startHz: number, endHz: number, _shape: OscillatorType) {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * Math.max(0.05, dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = 1 - i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(startHz, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}
