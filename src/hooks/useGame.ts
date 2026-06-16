import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/engine';
import { LEVELS } from '../game/levels';
import type { GameStatus, LiveStats, RunSummary } from '../game/types';

const HS_KEY = 'solar-surge:highscore';
const HD_KEY = 'solar-surge:bestdistance';

const INITIAL_STATS: LiveStats = {
  energyKwh: 0,
  distanceM: 0,
  powerKw: LEVELS[0].powerKw,
  level: LEVELS[0],
  multiplier: 1,
  batteries: 0,
  storageKwh: 0,
};

export function useGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [status, setStatus] = useState<GameStatus>('idle');
  const statusRef = useRef<GameStatus>('idle');
  statusRef.current = status;
  const [stats, setStats] = useState<LiveStats>(INITIAL_STATS);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [highScore, setHighScore] = useState<number>(() => Number(localStorage.getItem(HS_KEY)) || 0);
  const [bestDistance, setBestDistance] = useState<number>(() => Number(localStorage.getItem(HD_KEY)) || 0);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas, {
      onStats: setStats,
      onLevelUp: () => undefined,
      onGameOver: (s) => {
        setStatus('over');
        setSummary(s);
        if (s.isHighScore) {
          setHighScore(s.energyKwh);
          localStorage.setItem(HS_KEY, String(s.energyKwh));
        }
        setBestDistance((prev) => {
          if (s.distanceM <= prev) return prev;
          localStorage.setItem(HD_KEY, String(s.distanceM));
          return s.distanceM;
        });
      },
    });
    engine.highScore = Number(localStorage.getItem(HS_KEY)) || 0;
    engineRef.current = engine;
    if (import.meta.env.DEV) (window as unknown as { __engine: GameEngine }).__engine = engine;

    const down = () => {
      if (statusRef.current === 'ready') {
        start();
        return;
      }
      engine.setThrust(true);
    };
    const up = () => engine.setThrust(false);
    const key = (e: KeyboardEvent, on: boolean) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (on && statusRef.current === 'ready') {
          start();
          return;
        }
        engine.setThrust(on);
      }
    };
    const keyDown = (e: KeyboardEvent) => key(e, true);
    const keyUp = (e: KeyboardEvent) => key(e, false);

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      engine.destroy();
      canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      canvas.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, []);

  const start = useCallback(() => {
    setSummary(null);
    setStatus('running');
    engineRef.current?.start();
  }, []);

  // Arm a fresh run but wait in attract mode for the player's first input.
  const arm = useCallback(() => {
    setSummary(null);
    setStatus('ready');
    engineRef.current?.attract();
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
    setStatus('running');
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      if (engineRef.current) engineRef.current.sfx.enabled = next;
      return next;
    });
  }, []);

  return { canvasRef, status, stats, summary, highScore, bestDistance, soundOn, start, arm, resume, toggleSound };
}
