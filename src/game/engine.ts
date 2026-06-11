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
const COL_W = 46;
const MARGIN = 26; // keep gaps reachable away from ceiling/ground

// One game-second models a few real minutes of generation so the kWh
// figures feel rewarding while staying honestly labelled.
const TIME_SCALE = 150;

interface Column {
  x: number;
  gapY: number;
  gap: number;
  passed: boolean;
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
  private columns: Column[] = [];
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
    this.columns = [];
    this.thrusting = false;
    this.level = LEVELS[0];
    let x = W + 80;
    for (let i = 0; i < 4; i++) {
      this.columns.push(this.makeColumn(x));
      x += this.level.spacing;
    }
  }

  private makeColumn(x: number): Column {
    const gap = this.level.gap;
    const min = MARGIN + gap / 2;
    const max = H - GROUND_H - MARGIN - gap / 2;
    return { x, gap, gapY: min + Math.random() * (max - min), passed: false };
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

    // Scroll the cloud field.
    for (const c of this.columns) c.x -= speed * dt;
    if (this.columns.length && this.columns[0].x < -COL_W) this.columns.shift();
    const last = this.columns[this.columns.length - 1];
    if (last && last.x < W - this.level.spacing) this.columns.push(this.makeColumn(last.x + this.level.spacing));

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

    this.distance += (speed * dt) / 10; // ~metres
    this.energy += (this.level.powerKw * dt * TIME_SCALE) / 3600;

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

    // Dodge scoring + bonus energy for keeping the sun on the panels.
    for (const c of this.columns) {
      if (!c.passed && c.x + COL_W < SUN_X) {
        c.passed = true;
        this.energy += 0.5 * this.level.index;
        this.sfx.point();
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
    for (const c of this.columns) {
      if (SUN_X + SUN_R < c.x || SUN_X - SUN_R > c.x + COL_W) continue;
      const top = c.gapY - c.gap / 2;
      const bot = c.gapY + c.gap / 2;
      if (this.sunY - SUN_R < top || this.sunY + SUN_R > bot) return true;
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
      multiplier: this.level.index,
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

    // Cloud columns.
    for (const c of this.columns) this.renderColumn(c, lvl);

    this.renderPanels(lvl);
    this.renderSun();

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

  private renderColumn(c: Column, lvl: LevelTheme) {
    const top = c.gapY - c.gap / 2;
    const bot = c.gapY + c.gap / 2;
    this.cloudBank(c.x, 0, top, lvl, true);
    this.cloudBank(c.x, bot, H - GROUND_H - bot, lvl, false);
  }

  private cloudBank(x: number, y: number, h: number, lvl: LevelTheme, fromTop: boolean) {
    if (h <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = lvl.cloud;
    ctx.fillRect(x, y, COL_W, h);
    // Puffy edge facing the gap.
    const edge = fromTop ? y + h : y;
    ctx.fillStyle = lvl.cloud;
    for (let i = 0; i <= COL_W; i += 14) {
      ctx.beginPath();
      ctx.arc(x + i, edge, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shaded underside.
    ctx.fillStyle = lvl.cloudShade;
    ctx.fillRect(x, fromTop ? edge - 4 : edge, COL_W, 4);
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
