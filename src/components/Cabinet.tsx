import { forwardRef } from 'react';
import * as DS from '@aurorasolar/ds';
import { x } from '@xstyled/styled-components';
import type { GameStatus } from '../game/types';

interface CabinetProps {
  status: GameStatus;
  highScore: number;
  onStart: () => void;
  onResume: () => void;
}

export const Cabinet = forwardRef<HTMLCanvasElement, CabinetProps>(function Cabinet(
  { status, highScore, onStart, onResume },
  ref,
) {
  return (
    <div className="cabinet">
      <div className="cabinet__marquee">☀ SOLAR SURGE ☀</div>
      <div className="screen">
        <canvas ref={ref} aria-label="Solar Surge game screen" />

        {status === 'idle' && (
          <div className="overlay">
            <p className="overlay__title">SOLAR SURGE</p>
            <p className="overlay__sub">
              KEEP THE SUN ON THE PANELS
              <br />
              DODGE THE CLOUDS · BANK THE kWh
            </p>
            <button type="button" className="coin-btn" onClick={onStart}>
              ▶ INSERT COIN AND PLAY
            </button>
            <p className="controls-hint">
              HOLD/TAP THE SPACEBAR OR MOUSE
              <br />
              TO KEEP THE SUN FROM SETTING
            </p>
          </div>
        )}

        {status === 'ready' && (
          <div className="overlay overlay--clickable" onClick={onStart} role="button" tabIndex={0}>
            <p className="overlay__title">READY?</p>
            <p className="overlay__sub">
              PRESS SPACE OR CLICK
              <br />
              TO LAUNCH THE SUN
            </p>
          </div>
        )}

        {status === 'paused' && (
          <div className="overlay">
            <p className="overlay__title">PAUSED</p>
            <DS.Button variant="primary" icon={DS.IconPlay} action={onResume}>
              Resume
            </DS.Button>
          </div>
        )}

        {status === 'running' && highScore > 0 && (
          <x.div
            position="absolute"
            top={2}
            right={3}
            zIndex={2}
            color="white"
            fontFamily="var(--arcade)"
            fontSize="9px"
            opacity={0.7}
            style={{ pointerEvents: 'none' }}
          >
            BEST {highScore.toFixed(0)}
          </x.div>
        )}
      </div>
    </div>
  );
});
