import { useState } from 'react';
import * as DS from '@aurorasolar/ds';
import { x } from '@xstyled/styled-components';
import { useGame } from './hooks/useGame';
import { useAccount } from './hooks/useAccount';
import { Cabinet } from './components/Cabinet';
import { Hud } from './components/Hud';
import { GameOverModal } from './components/GameOverModal';
import { AccountModal } from './components/AccountModal';

export function App() {
  const { canvasRef, status, stats, summary, highScore, bestDistance, soundOn, start, arm, resume, toggleSound } =
    useGame();
  const { account, signUp, logIn, logOut } = useAccount();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <x.main display="flex" flexDirection="column" alignItems="center" gap={6} py={8} px={4}>
      <x.header w="100%" maxWidth="720px" display="flex" flexDirection="column" gap={1}>
        <x.div display="flex" alignItems="center" justifyContent="space-between" gap={4}>
          <x.h1 text="h1" m={0}>
            Solar Surge
          </x.h1>
          <x.div display="flex" alignItems="center" gap={3} flexShrink={0}>
            <x.div display="flex" alignItems="center" gap={2}>
              <x.span color="uiHelperCopy" text="body12">
                Sound
              </x.span>
              <DS.Toggle
                toggled={soundOn}
                handleToggle={toggleSound}
                size="sm"
                toggledStateOnHint="Sound on"
                toggledStateOffHint="Sound off"
              />
            </x.div>
            {account ? (
              <x.div display="flex" alignItems="center" gap={2}>
                <DS.Chip size="sm">
                  <x.span display="inline-flex" alignItems="center" gap={1}>
                    <DS.IconUserFill size={3} />
                    {account.email}
                  </x.span>
                </DS.Chip>
                <DS.Button variant="text" action={logOut}>
                  Sign out
                </DS.Button>
              </x.div>
            ) : (
              <DS.Button variant="secondary" icon={DS.IconUser} action={() => setAccountOpen(true)}>
                Create account
              </DS.Button>
            )}
          </x.div>
        </x.div>
        <x.p m={0} color="uiHelperCopy" text="body14">
          Fly the sun, dodge the clouds, and learn how real conditions change a solar array's output.
        </x.p>
      </x.header>

      <Cabinet ref={canvasRef} status={status} highScore={highScore} onStart={start} onResume={resume} />

      <x.div w="100%" maxWidth="720px" display="flex" flexDirection="column" gap={4}>
        <Hud stats={stats} highScore={highScore} bestDistance={bestDistance} />
      </x.div>

      <GameOverModal summary={status === 'over' ? summary : null} onPlayAgain={arm} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} onSignUp={signUp} onLogIn={logIn} />
    </x.main>
  );
}
