import type { LevelTheme } from './types';

/**
 * Each level maps to a real solar concept. Difficulty (speed, gap, spacing)
 * ramps up while the `powerKw` figure teaches how real conditions change an
 * array's output: a clear noon sky out-produces dawn, haze, and storms.
 */
export const LEVELS: LevelTheme[] = [
  {
    index: 1,
    title: 'FIRST LIGHT',
    concept: 'Irradiance',
    blurb: 'At sunrise the sun is low, so irradiance — the energy hitting your panels — is weak.',
    startsAt: 0,
    scrollSpeed: 95,
    minGap: 54,
    clouds: 1,
    spacing: 300,
    powerKw: 2.4,
    sky: ['#FFD9A0', '#FF9E6D'],
    cloud: '#FFE7D2',
    cloudShade: '#F4C29A',
  },
  {
    index: 2,
    title: 'SOLAR NOON',
    concept: 'Peak Sun Hours',
    blurb: 'Midday delivers peak sun hours — the array hits its highest, most efficient output.',
    startsAt: 320,
    scrollSpeed: 120,
    minGap: 50,
    clouds: 1,
    spacing: 272,
    powerKw: 7.6,
    sky: ['#8FD3FF', '#3FA9F5'],
    cloud: '#FFFFFF',
    cloudShade: '#CFE6FA',
  },
  {
    index: 3,
    title: 'DIFFUSE LIGHT',
    concept: 'Diffuse vs. Direct',
    blurb: 'Clouds scatter sunlight — panels still produce from this diffuse light, just less of it.',
    startsAt: 760,
    scrollSpeed: 145,
    minGap: 46,
    clouds: 2,
    spacing: 250,
    powerKw: 5.1,
    sky: ['#C7D2DA', '#8FA3B0'],
    cloud: '#EDEFF1',
    cloudShade: '#B7C0C7',
  },
  {
    index: 4,
    title: 'STORM FRONT',
    concept: 'Intermittency',
    blurb: 'Storms cut output hard — this is why solar pairs with battery storage and the grid.',
    startsAt: 1280,
    scrollSpeed: 172,
    minGap: 43,
    clouds: 2,
    spacing: 226,
    powerKw: 2.9,
    sky: ['#5A6B7A', '#33414E'],
    cloud: '#7C8A98',
    cloudShade: '#4C5763',
    decor: 'rain',
  },
  {
    index: 5,
    title: 'DUSTY SKIES',
    concept: 'Soiling Losses',
    blurb: 'Dust and grime ("soiling") shade the glass — periodic cleaning recovers lost energy.',
    startsAt: 1920,
    scrollSpeed: 198,
    minGap: 41,
    clouds: 3,
    spacing: 206,
    powerKw: 4.3,
    sky: ['#E3C79A', '#C99A5B'],
    cloud: '#E8D8BE',
    cloudShade: '#C2A271',
    decor: 'dust',
  },
  {
    index: 6,
    title: 'GRID AT NIGHT',
    concept: 'Net Metering',
    blurb: 'After dark you draw banked credits — daytime surplus you exported now powers the night.',
    startsAt: 2700,
    scrollSpeed: 224,
    minGap: 39,
    clouds: 3,
    spacing: 196,
    powerKw: 1.6,
    sky: ['#1B2A4A', '#0A1228'],
    cloud: '#27406B',
    cloudShade: '#162647',
    decor: 'stars',
  },
];

export function levelForDistance(distanceM: number): LevelTheme {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (distanceM >= lvl.startsAt) current = lvl;
    else break;
  }
  return current;
}

/** Difficulty keeps creeping up past the final authored level. */
export function effectiveScrollSpeed(level: LevelTheme, distanceM: number): number {
  const last = LEVELS[LEVELS.length - 1];
  if (level.index < last.index) return level.scrollSpeed;
  const overshoot = Math.max(0, distanceM - last.startsAt);
  return last.scrollSpeed + Math.min(120, overshoot * 0.03);
}
