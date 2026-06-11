/** Tiny Web Audio bleeper — no assets, pure retro square/triangle blips. */
export class SoundFx {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ac(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain = 0.06) {
    const ctx = this.ac();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  thrust() {
    this.blip(220, 0.05, 'square', 0.025);
  }

  point() {
    this.blip(880, 0.06, 'triangle', 0.05);
  }

  levelUp() {
    const ctx = this.ac();
    if (!ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      window.setTimeout(() => this.blip(f, 0.12, 'square', 0.05), i * 80);
    });
  }

  crash() {
    const ctx = this.ac();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
    g.gain.setValueAtTime(0.09, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  }

  /** Browsers require a user gesture before audio can start. */
  unlock() {
    this.ac();
  }
}
