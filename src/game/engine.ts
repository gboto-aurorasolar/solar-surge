import { LEVELS, levelForDistance, effectiveScrollSpeed } from './levels';
import { summarize } from './conversions';
import { SoundFx } from './audio';
import type { EngineCallbacks, GameStatus, LevelTheme, LiveStats, RunSummary } from './types';

// Fixed logical resolution; the canvas is scaled up with crisp pixels.
const W = 480;
const H = 360;
const SUN_X = 120;
const SUN_R = 13;
const GRAVITY = 430; // px/s^2, always pulling the sun down
const THRUST = 760; // px/s^2 applied upward while held
const MAX_VY = 300;
const GROUND_H = 48; // panel strip height at the bottom
const CLOUD_W = 54; // width of a free-floating cloud band
const MARGIN = 22; // keep openings reachable away from ceiling/ground
const MIN_CLOUD_H = 14; // thinnest a cloud band can shrink to
const MAX_CLOUD_H = 70; // keep clouds puffy rather than wall-like
const BATTERY_R = 9; // collision radius of a floating battery
const MULT_MAX = 5; // highest battery combo multiplier
const MULT_TIME = 6; // seconds a multiplier lasts before decaying to 1

// One game-second models a few real minutes of generation so the kWh
// figures feel rewarding while staying honestly labelled.
const TIME_SCALE = 150;

/** A vertical band of cloud within an obstacle column (open sky above/below). */
interface CloudBand {
  top: number;
  bot: number;
  /** Per-puff radius jitter so each band renders as a distinct fluffy blob. */
  seed: number;
}

/** One scrolling column holding 1+ free-floating clouds with navigable gaps. */
interface Obstacle {
  x: number;
  bands: CloudBand[];
  passed: boolean;
}

/** A collectible floating storage battery — fly into it to bank kWh. */
interface Battery {
  x: number;
  y: number;
  value: number; // kWh banked when captured
  bob: number; // animation phase
  collected: boolean;
}

/** Short-lived rising "+kWh" text shown when a battery is captured. */
interface Pop {
  x: number;
  y: number;
  life: number;
  text: string;
}

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;
  readonly sfx = new SoundFx();

  status: GameStatus = 'idle';
  highScore = 0;

  private raf = 0;
  private last = 0;
  private thrusting = false;

  private sunY = H / 2;
  private vy = 0;
  private bob = 0;
  private distance = 0;
  private energy = 0;
  private obstacles: Obstacle[] = [];
  private batteries: Battery[] = [];
  private pops: Pop[] = [];
  private batteriesCollected = 0;
  private storageKwh = 0;
  private sinceBattery = 0; // obstacles spawned since the last battery
  private comboMult = 1; // battery-fuelled score multiplier (1..MULT_MAX)
  private multTimer = 0; // seconds left before the multiplier decays to 1
  private maxMult = 1; // highest multiplier reached this run
  private level: LevelTheme = LEVELS[0];
  private statsAccum = 0;
  private grace = 0; // seconds the sun hovers before gravity kicks in
  private flash = 0; // seconds remaining on the "LEVEL UP" banner
  private flashLevel: LevelTheme = LEVELS[0];
  private stars: { x: number; y: number; r: number }[] = [];

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.cb = cb;
    for (let i = 0; i < 60; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * (H - GROUND_H), r: Math.random() < 0.3 ? 2 : 1 });
    }
    this.resetWorld();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setThrust(on: boolean) {
    if (on && this.status === 'running') this.sfx.thrust();
    this.thrusting = on;
  }

  start() {
    this.sfx.unlock();
    this.resetWorld();
    this.status = 'running';
    this.grace = 1.2;
    this.level = LEVELS[0];
    this.flash = 1.8;
    this.flashLevel = LEVELS[0];
    this.emitStats();
  }

  /** Arm a fresh run but hold in attract mode until the player gives input. */
  attract() {
    this.resetWorld();
    this.status = 'idle';
    this.level = LEVELS[0];
    this.flash = 0;
    this.grace = 0;
    this.emitStats();
  }

  pause() {
    if (this.status === 'running') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'running';
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private resetWorld() {
    this.sunY = H / 2;
    this.vy = 0;
    this.distance = 0;
    this.energy = 0;
    this.obstacles = [];
    this.batteries = [];
    this.pops = [];
    this.batteriesCollected = 0;
    this.storageKwh = 0;
    this.sinceBattery = 0;
    this.comboMult = 1;
    this.multTimer = 0;
    this.maxMult = 1;
    this.thrusting = false;
    this.level = LEVELS[0];
    let x = W + 80;
    for (let i = 0; i < 4; i++) {
      this.spawnObstacle(x);
      x += this.level.spacing;
    }
  }

  /** Number of cloud bands a column should hold, ramping with difficulty. */
  private cloudCountFor(): number {
    const last = LEVELS[LEVELS.length - 1];
    let n = this.level.clouds;
    // Keep ramping past the final authored level: one more band every ~700m.
    if (this.level.index === last.index) {
      n += Math.floor(Math.max(0, this.distance - last.startsAt) / 700);
    }
    n = Math.min(4, n);
    // Per-column variety: occasionally ease off by one for breathing room.
    if (n > 1 && Math.random() < 0.35) n -= 1;
    return n;
  }

  /** Build a column of free-floating clouds that always leaves passable gaps. */
  private buildBands(): CloudBand[] {
    const pTop = MARGIN;
    const pBot = H - GROUND_H - MARGIN;
    const playH = pBot - pTop;
    const minGap = this.level.minGap;

    // Clamp the band count so (n+1) minimum gaps + n thin clouds still fit.
    let n = this.cloudCountFor();
    while (n > 1 && (n + 1) * minGap + n * MIN_CLOUD_H > playH) n--;

    // Clouds grow chunkier in later levels; cap so they stay cloud-shaped.
    const grow = 16 + this.level.index * 6;
    let thick: number[] = [];
    for (let i = 0; i < n; i++) {
      thick.push(Math.min(MAX_CLOUD_H, MIN_CLOUD_H + Math.random() * grow));
    }
    // If the clouds leave too little room for gaps, shrink them to fit.
    const need = (n + 1) * minGap;
    let sumThick = thick.reduce((a, b) => a + b, 0);
    if (playH - sumThick < need) {
      const scale = Math.max(0, playH - need) / (sumThick || 1);
      thick = thick.map((t) => Math.max(8, t * scale));
      sumThick = thick.reduce((a, b) => a + b, 0);
    }

    // Distribute the leftover slack randomly across the n+1 gaps.
    const slack = Math.max(0, playH - sumThick - need);
    const w = Array.from({ length: n + 1 }, () => Math.random());
    const wsum = w.reduce((a, b) => a + b, 0) || 1;
    const gaps = w.map((x) => minGap + (x / wsum) * slack);

    const bands: CloudBand[] = [];
    let y = pTop;
    for (let i = 0; i < n; i++) {
      y += gaps[i];
      bands.push({ top: y, bot: y + thick[i], seed: Math.random() });
      y += thick[i];
    }
    return bands;
  }

  private spawnObstacle(x: number) {
    const bands = this.buildBands();
    this.obstacles.push({ x, bands, passed: false });
    this.sinceBattery++;
    this.maybeSpawnBattery(x, bands);
  }

  /**
   * Tuck a battery into the tightest navigable gap of a column — a deliberate
   * detour that rewards precise flying (think of a 1-up in a tricky nook).
   */
  private maybeSpawnBattery(x: number, bands: CloudBand[]) {
    if (this.sinceBattery < 2) return; // never back-to-back
    if (Math.random() > 0.45) return;

    const pTop = MARGIN;
    const pBot = H - GROUND_H - MARGIN;
    // Open spans = sky above the first band, between bands, below the last.
    const spans: [number, number][] = [];
    let prev = pTop;
    for (const b of bands) {
      spans.push([prev, b.top]);
      prev = b.bot;
    }
    spans.push([prev, pBot]);

    const clearance = BATTERY_R * 2 + 10;
    const reachable = spans.filter(([a, b]) => b - a >= clearance);
    if (!reachable.length) return;
    // Prefer the tightest reachable gap so the prize sits in a hard spot.
    reachable.sort((p, q) => p[1] - p[0] - (q[1] - q[0]));
    const [a, b] = reachable[0];

    this.batteries.push({
      x: x + CLOUD_W / 2,
      y: (a + b) / 2,
      value: 5 + this.level.index * 2,
      bob: Math.random() * Math.PI * 2,
      collected: false,
    });
    this.sinceBattery = 0;
  }

  private loop(t: number) {
    if (!this.last) this.last = t;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  private update(dt: number) {
    if (this.status === 'paused' || this.status === 'over') return;

    const speed =
      this.status === 'running'
        ? effectiveScrollSpeed(this.level, this.distance)
        : 60; // gentle drift in attract mode

    // Scroll the cloud field and the floating batteries together.
    const dx = speed * dt;
    for (const o of this.obstacles) o.x -= dx;
    for (const b of this.batteries) b.x -= dx;
    if (this.obstacles.length && this.obstacles[0].x < -CLOUD_W) this.obstacles.shift();
    this.batteries = this.batteries.filter((b) => b.x > -BATTERY_R * 2 && !b.collected);
    const last = this.obstacles[this.obstacles.length - 1];
    if (last && last.x < W - this.level.spacing) this.spawnObstacle(last.x + this.level.spacing);

    // Drift the captured-energy pops upward and fade them out.
    for (const p of this.pops) {
      p.y -= 22 * dt;
      p.life -= dt * 1.3;
    }
    this.pops = this.pops.filter((p) => p.life > 0);

    if (this.status === 'idle') {
      this.bob += dt;
      this.sunY = H / 2 + Math.sin(this.bob * 1.6) * 26;
      return;
    }

    // --- running ---
    // Grace window at the start of a run: hold the sun steady so the player
    // has a beat to get their hands on the controls before gravity engages.
    if (this.grace > 0) {
      this.grace = Math.max(0, this.grace - dt);
      this.bob += dt;
      this.vy = 0;
      this.sunY = H / 2 + Math.sin(this.bob * 1.6) * 6;
      this.statsAccum += dt;
      if (this.statsAccum >= 0.1) {
        this.statsAccum = 0;
        this.emitStats();
      }
      return;
    }

    // Battery combo multiplier decays back to 1 when its timer runs out.
    if (this.multTimer > 0) {
      this.multTimer = Math.max(0, this.multTimer - dt);
      if (this.multTimer === 0) this.comboMult = 1;
    }

    this.distance += (speed * dt) / 10; // ~metres
    // Stored battery charge amplifies output while the combo is live.
    this.energy += ((this.level.powerKw * dt * TIME_SCALE) / 3600) * this.comboMult;

    // Physics.
    this.vy += (GRAVITY - (this.thrusting ? THRUST : 0)) * dt;
    this.vy = Math.max(-MAX_VY, Math.min(MAX_VY, this.vy));
    this.sunY += this.vy * dt;

    // Level progression.
    const lvl = levelForDistance(this.distance);
    if (lvl.index !== this.level.index) {
      this.level = lvl;
      this.flash = 1.8;
      this.flashLevel = lvl;
      this.sfx.levelUp();
      this.cb.onLevelUp(lvl);
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);

    // Dodge scoring + bonus energy for threading each cloud column.
    for (const o of this.obstacles) {
      if (!o.passed && o.x + CLOUD_W < SUN_X) {
        o.passed = true;
        this.energy += 0.5 * this.level.index * this.comboMult;
        this.sfx.point();
      }
    }

    // Capture floating storage batteries.
    for (const b of this.batteries) {
      if (b.collected) continue;
      const by = b.y + Math.sin(this.bob * 3 + b.bob) * 4; // matches the render bob
      const dxb = SUN_X - b.x;
      const dyb = this.sunY - by;
      if (dxb * dxb + dyb * dyb <= (SUN_R + BATTERY_R) * (SUN_R + BATTERY_R)) {
        b.collected = true;
        this.energy += b.value;
        this.storageKwh += b.value;
        this.batteriesCollected++;
        // Each capture steps up the score multiplier and refreshes its timer.
        this.comboMult = Math.min(MULT_MAX, this.comboMult + 1);
        this.multTimer = MULT_TIME;
        this.maxMult = Math.max(this.maxMult, this.comboMult);
        this.sfx.battery();
        this.pops.push({
          x: b.x,
          y: by - BATTERY_R - 4,
          life: 1.3,
          text: `+${b.value.toFixed(0)} kWh  x${this.comboMult}`,
        });
      }
    }

    if (this.checkCollision()) {
      this.gameOver();
      return;
    }

    this.statsAccum += dt;
    if (this.statsAccum >= 0.1) {
      this.statsAccum = 0;
      this.emitStats();
    }
  }

  private checkCollision(): boolean {
    if (this.sunY - SUN_R <= 0) return true; // flew into the ceiling
    if (this.sunY + SUN_R >= H - GROUND_H) return true; // dove into the panels
    // Circle-vs-rounded-band test, inset slightly so the puffy edges feel fair.
    const pad = 3;
    for (const o of this.obstacles) {
      if (SUN_X + SUN_R < o.x + pad || SUN_X - SUN_R > o.x + CLOUD_W - pad) continue;
      for (const band of o.bands) {
        const cx = Math.max(o.x + pad, Math.min(SUN_X, o.x + CLOUD_W - pad));
        const cy = Math.max(band.top + pad, Math.min(this.sunY, band.bot - pad));
        const ddx = SUN_X - cx;
        const ddy = this.sunY - cy;
        if (ddx * ddx + ddy * ddy < SUN_R * SUN_R) return true;
      }
    }
    return false;
  }

  private gameOver() {
    this.status = 'over';
    this.thrusting = false;
    this.sfx.crash();
    const isHighScore = this.energy > this.highScore;
    if (isHighScore) this.highScore = this.energy;
    const conv = summarize(this.energy);
    const summary: RunSummary = {
      energyKwh: this.energy,
      distanceM: this.distance,
      topLevel: this.level.index,
      topLevelTitle: this.level.title,
      isHighScore,
      batteries: this.batteriesCollected,
      storageKwh: this.storageKwh,
      maxMultiplier: this.maxMult,
      ...conv,
    };
    this.emitStats();
    this.cb.onGameOver(summary);
  }

  private emitStats() {
    const stats: LiveStats = {
      energyKwh: this.energy,
      distanceM: this.distance,
      powerKw: this.level.powerKw,
      level: this.level,
      multiplier: this.comboMult,
      batteries: this.batteriesCollected,
      storageKwh: this.storageKwh,
    };
    this.cb.onStats(stats);
  }

  // ----------------------------- rendering -----------------------------

  private render() {
    const ctx = this.ctx;
    const lvl = this.level;

    // Sky gradient.
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, lvl.sky[0]);
    grad.addColorStop(1, lvl.sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    this.renderDecor(lvl);

    // Light beam from the sun down to the panels (brighter = more power).
    if (this.status !== 'over') {
      const intensity = Math.min(1, lvl.powerKw / 7.6);
      ctx.save();
      ctx.globalAlpha = 0.12 + intensity * 0.25;
      const beam = ctx.createLinearGradient(0, this.sunY, 0, H - GROUND_H);
      beam.addColorStop(0, '#FFF2B0');
      beam.addColorStop(1, 'rgba(255,242,176,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(SUN_X - SUN_R, this.sunY);
      ctx.lineTo(SUN_X + SUN_R, this.sunY);
      ctx.lineTo(SUN_X + SUN_R * 3.2, H - GROUND_H);
      ctx.lineTo(SUN_X - SUN_R * 3.2, H - GROUND_H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Free-floating clouds, then the batteries tucked between them.
    for (const o of this.obstacles) {
      for (const band of o.bands) this.renderCloud(o.x, band, lvl);
    }
    this.renderBatteries();

    this.renderPanels(lvl);
    this.renderSun();
    this.renderPops();

    // Arcade score chip + level banner.
    this.renderHud();
  }

  private renderDecor(lvl: LevelTheme) {
    const ctx = this.ctx;
    if (lvl.decor === 'stars') {
      ctx.fillStyle = '#FFFFFF';
      for (const s of this.stars) {
        ctx.globalAlpha = 0.5 + ((Math.sin(this.bob * 2 + s.x) + 1) / 2) * 0.5;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    } else if (lvl.decor === 'rain') {
      ctx.strokeStyle = 'rgba(200,220,235,0.35)';
      ctx.lineWidth = 1;
      const off = (this.distance * 6) % 24;
      for (let x = -24; x < W; x += 24) {
        for (let y = -24; y < H - GROUND_H; y += 24) {
          ctx.beginPath();
          ctx.moveTo(x + off, y + off);
          ctx.lineTo(x + off - 5, y + off + 10);
          ctx.stroke();
        }
      }
    } else if (lvl.decor === 'dust') {
      ctx.fillStyle = 'rgba(120,90,50,0.18)';
      const off = (this.distance * 4) % 18;
      for (let x = -18; x < W; x += 18) {
        for (let y = 0; y < H - GROUND_H; y += 18) {
          ctx.fillRect((x + off) % W, (y + off * 0.5) % (H - GROUND_H), 2, 2);
        }
      }
    }
  }

  /** Draw one free-floating cloud as a lumpy blob with open sky all around. */
  private renderCloud(x: number, band: CloudBand, lvl: LevelTheme) {
    const ctx = this.ctx;
    const h = band.bot - band.top;
    if (h <= 0) return;
    const cx = x + CLOUD_W / 2;
    const cy = (band.top + band.bot) / 2;
    const rx = CLOUD_W / 2;
    const ry = h / 2;

    // Shadowed underbelly: same blob nudged down, drawn first.
    ctx.fillStyle = lvl.cloudShade;
    this.blob(cx, cy + 3, rx, ry, band.seed);
    // Main puff.
    ctx.fillStyle = lvl.cloud;
    this.blob(cx, cy, rx, ry, band.seed);
    // Soft highlight near the top-left for a little volume.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - rx * 0.3, cy - ry * 0.35, Math.max(3, ry * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A cluster of overlapping circles filling an ellipse → a fluffy cloud. */
  private blob(cx: number, cy: number, rx: number, ry: number, seed: number) {
    const ctx = this.ctx;
    const lobes = 5;
    ctx.beginPath();
    // Central mass keeps thin bands from looking like a dotted line.
    ctx.ellipse(cx, cy, rx * 0.82, ry * 0.78, 0, 0, Math.PI * 2);
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + seed * 6;
      const px = cx + Math.cos(a) * rx * 0.55;
      const py = cy + Math.sin(a) * ry * 0.5;
      const r = (0.42 + ((Math.sin(seed * 12 + i) + 1) / 2) * 0.22) * Math.min(rx, ry + 6);
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private renderBatteries() {
    const ctx = this.ctx;
    for (const b of this.batteries) {
      if (b.collected) continue;
      const y = b.y + Math.sin(this.bob * 3 + b.bob) * 4;
      ctx.save();
      ctx.translate(b.x, y);
      // Enticing glow halo.
      const pulse = 0.55 + ((Math.sin(this.bob * 5 + b.bob) + 1) / 2) * 0.45;
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, BATTERY_R + 9);
      glow.addColorStop(0, `rgba(80,225,150,${0.45 * pulse})`);
      glow.addColorStop(1, 'rgba(80,225,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, BATTERY_R + 9, 0, Math.PI * 2);
      ctx.fill();
      // Battery body (rounded cell) with a positive terminal nub.
      const bw = 12;
      const bh = 16;
      ctx.fillStyle = '#0E3D2B';
      ctx.fillRect(-bw / 2 - 1, -bh / 2 - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#27E08A';
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = '#0E3D2B';
      ctx.fillRect(-3, -bh / 2 - 3, 6, 3);
      // Lightning bolt mark.
      ctx.fillStyle = '#0E3D2B';
      ctx.beginPath();
      ctx.moveTo(1, -5);
      ctx.lineTo(-3, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-1, 5);
      ctx.lineTo(3, -1);
      ctx.lineTo(0, -1);
      ctx.closePath();
      ctx.fill();
      // Twinkle.
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(BATTERY_R - 1, -BATTERY_R, 2, 2);
      ctx.restore();
    }
  }

  private renderPops() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    for (const p of this.pops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = '#27E08A';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  private renderPanels(lvl: LevelTheme) {
    const ctx = this.ctx;
    const y = H - GROUND_H;
    ctx.fillStyle = '#0E1B3A';
    ctx.fillRect(0, y, W, GROUND_H);
    // Charge glow proportional to current power.
    const intensity = Math.min(1, lvl.powerKw / 7.6);
    ctx.fillStyle = `rgba(255,210,80,${0.08 + intensity * 0.18})`;
    ctx.fillRect(0, y, W, 5);
    // Panel grid.
    ctx.strokeStyle = '#1E3A6E';
    ctx.lineWidth = 1;
    const cell = 16;
    for (let px = 0; px <= W; px += cell) {
      ctx.beginPath();
      ctx.moveTo(px, y + 6);
      ctx.lineTo(px, H);
      ctx.stroke();
    }
    for (let py = y + 6; py <= H; py += cell) {
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
      ctx.stroke();
    }
    // Lit cells sparkle with output.
    ctx.fillStyle = `rgba(120,180,255,${0.15 + intensity * 0.35})`;
    for (let px = 2; px < W; px += cell) {
      if ((Math.floor(px / cell) + Math.floor(this.distance / 6)) % 3 === 0) {
        ctx.fillRect(px, y + 8, cell - 4, cell - 4);
      }
    }
  }

  private renderSun() {
    const ctx = this.ctx;
    const x = SUN_X;
    const y = this.sunY;
    const tilt = this.status === 'running' ? Math.max(-0.5, Math.min(0.5, this.vy / 500)) : 0;
    // Rays.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.bob);
    ctx.strokeStyle = '#FFC83D';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (SUN_R + 3), Math.sin(a) * (SUN_R + 3));
      ctx.lineTo(Math.cos(a) * (SUN_R + 9), Math.sin(a) * (SUN_R + 9));
      ctx.stroke();
    }
    ctx.restore();
    // Body.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, SUN_R);
    g.addColorStop(0, '#FFF3B0');
    g.addColorStop(1, '#FDB813');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E1402';
    ctx.fillRect(-5, -3, 2, 3);
    ctx.fillRect(3, -3, 2, 3);
    ctx.beginPath();
    ctx.arc(0, 3, 4, 0, Math.PI);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1E1402';
    ctx.stroke();
    ctx.restore();
  }

  private renderHud() {
    const ctx = this.ctx;
    if (this.status !== 'idle') {
      ctx.font = '700 12px "Press Start 2P", monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(8, 8, 150, 22);
      ctx.fillStyle = '#FFE9A8';
      ctx.font = '10px monospace';
      ctx.fillText(`${this.energy.toFixed(1)} kWh`, 14, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(W - 120, 8, 112, 22);
      ctx.fillStyle = '#CFE8FF';
      ctx.fillText(`${Math.floor(this.distance)} m`, W - 114, 14);

      // Banked-storage tally (only once a battery has been captured).
      if (this.batteriesCollected > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(8, 34, 150, 20);
        // Mini battery glyph.
        ctx.fillStyle = '#27E08A';
        ctx.fillRect(14, 39, 9, 10);
        ctx.fillRect(23, 41, 2, 6);
        ctx.fillStyle = '#9CF5C9';
        ctx.font = '9px monospace';
        ctx.fillText(`x${this.batteriesCollected}  +${this.storageKwh.toFixed(0)} kWh`, 30, 41);
      }

      // Active battery combo multiplier: bold badge + draining timer bar.
      if (this.comboMult > 1) {
        const bw = 96;
        const bx = (W - bw) / 2;
        const pulse = 0.7 + ((Math.sin(this.bob * 10) + 1) / 2) * 0.3;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = 'rgba(14,61,43,0.85)';
        ctx.fillRect(bx, 8, bw, 24);
        ctx.fillStyle = '#27E08A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '14px monospace';
        ctx.fillText(`x${this.comboMult} OUTPUT`, W / 2, 12);
        // Timer bar drains left→right as the combo expires.
        const frac = Math.max(0, this.multTimer / MULT_TIME);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(bx, 28, bw, 3);
        ctx.fillStyle = '#9CF5C9';
        ctx.fillRect(bx, 28, bw * frac, 3);
        ctx.restore();
        ctx.textAlign = 'left';
      }
    }
    if (this.flash > 0) {
      const a = Math.min(1, this.flash);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = '#FFD23F';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`LEVEL ${this.flashLevel.index}  ·  ${this.flashLevel.title}`, W / 2, H / 2 - 14);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '11px monospace';
      ctx.fillText(this.flashLevel.concept.toUpperCase(), W / 2, H / 2 + 6);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    if (this.grace > 0 && this.status === 'running') {
      ctx.save();
      ctx.globalAlpha = 0.6 + ((Math.sin(this.bob * 8) + 1) / 2) * 0.4;
      ctx.fillStyle = '#FFD23F';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GET READY!', SUN_X, this.sunY - SUN_R - 12);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }
}

export { W as GAME_W, H as GAME_H };
