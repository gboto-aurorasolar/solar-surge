import * as DS from '@aurorasolar/ds';
import { x } from '@xstyled/styled-components';
import type { LiveStats } from '../game/types';
import { titleCase } from '../format';

const fmt = (n: number, d = 1) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function Hud({
  stats,
  highScore,
  bestDistance,
}: {
  stats: LiveStats;
  highScore: number;
  bestDistance: number;
}) {
  return (
    <DS.Card variant="secondary">
      <x.div p={4} display="flex" flexDirection="column" gap={3}>
        <x.div display="flex" alignItems="center" justifyContent="space-between" gap={3}>
          <DS.Chip size="sm">
            <x.span display="inline-flex" alignItems="center" gap={1}>
              <DS.IconSunFill size={4} />
              Level {stats.level.index} · {titleCase(stats.level.title)}
            </x.span>
          </DS.Chip>
          <DS.Status
            icon={DS.IconLightningFill}
            bg="uiStatus.pending"
            color="white"
            size="sm"
            tooltip={{ children: 'Current array output in these sky conditions' }}
          />
        </x.div>

        <DS.StatisticGroup aria-label="Live solar generation">
          <x.div display="grid" gridTemplateColumns={{ _: '1fr 1fr', md: 'repeat(4, 1fr)' }} gap={4}>
            <DS.Statistic label="Energy generated" value={fmt(stats.energyKwh)} unit="kWh" size="md" />
            <DS.Statistic label="Distance" value={fmt(stats.distanceM, 0)} unit="m" size="md" />
            <DS.Statistic label="Best energy" value={fmt(highScore)} unit="kWh" size="md" />
            <DS.Statistic label="Best distance" value={fmt(bestDistance, 0)} unit="m" size="md" />
          </x.div>
        </DS.StatisticGroup>

        <x.p m={0} color="black" text="body14">
          {stats.level.concept}: {stats.level.blurb}
        </x.p>
      </x.div>
    </DS.Card>
  );
}
