export type GameStatus = 'idle' | 'ready' | 'running' | 'paused' | 'over';

export interface LevelTheme {
  /** 1-based level index */
  index: number;
  /** Short arcade title shown in the cabinet */
  title: string;
  /** Real solar concept this level teaches */
  concept: string;
  /** One-line subtle explainer surfaced in the HUD */
  blurb: string;
  /** Distance (in metres) at which this level begins */
  startsAt: number;
  /** Horizontal scroll speed in logical px/sec */
  scrollSpeed: number;
  /** Smallest vertical opening (in logical px) the sun must fit through */
  minGap: number;
  /** Base number of free-floating cloud bands per column */
  clouds: number;
  /** Horizontal spacing between cloud columns, in logical px */
  spacing: number;
  /** Real-world power factor: kW the array produces in these conditions */
  powerKw: number;
  /** Canvas palette */
  sky: [string, string];
  cloud: string;
  cloudShade: string;
  /** Optional decorative flag: stars at night, dust haze, etc. */
  decor?: 'stars' | 'dust' | 'rain';
}

export interface LiveStats {
  energyKwh: number;
  distanceM: number;
  powerKw: number;
  level: LevelTheme;
  multiplier: number;
  /** Storage batteries captured this run */
  batteries: number;
  /** Bonus kWh banked from captured batteries */
  storageKwh: number;
}

export interface RunSummary {
  energyKwh: number;
  distanceM: number;
  topLevel: number;
  topLevelTitle: string;
  co2Kg: number;
  dollars: number;
  phoneCharges: number;
  homeHours: number;
  isHighScore: boolean;
  /** Storage batteries captured this run */
  batteries: number;
  /** Bonus kWh banked from captured batteries */
  storageKwh: number;
  /** Highest score multiplier reached via battery combos */
  maxMultiplier: number;
}

export interface EngineCallbacks {
  onStats: (stats: LiveStats) => void;
  onLevelUp: (level: LevelTheme) => void;
  onGameOver: (summary: RunSummary) => void;
}
