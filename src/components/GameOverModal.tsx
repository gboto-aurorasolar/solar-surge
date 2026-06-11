import * as DS from '@aurorasolar/ds';
import { x } from '@xstyled/styled-components';
import type { RunSummary } from '../game/types';
import { titleCase } from '../format';

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const ESTIMATE_URL = 'https://quote.aurorasolar.com/';

export function GameOverModal({
  summary,
  onPlayAgain,
}: {
  summary: RunSummary | null;
  onPlayAgain: () => void;
}) {
  const open = summary !== null;
  return (
    <DS.Modal open={open} size="md">
      <DS.ModalHeader>
        <x.div display="flex" alignItems="center" gap={2}>
          <DS.IconSunFill size={6} />
          <x.span text="h2">{summary?.isHighScore ? 'New best run!' : 'A cloud got you'}</x.span>
        </x.div>
      </DS.ModalHeader>
      <DS.ModalBody>
        {summary && (
          <x.div display="flex" flexDirection="column" gap={5}>
            {summary.isHighScore && (
              <DS.Banner variant="success" icon={DS.IconStarFill}>
                You set a personal best of {fmt(summary.energyKwh, 1)} kWh.
              </DS.Banner>
            )}

            <x.div>
              <x.p m={0} color="uiHelperCopy" text="body12">
                THIS RUN
              </x.p>
              <DS.StatisticGroup aria-label="Run results">
                <x.div display="grid" gridTemplateColumns="1fr 1fr" gap={4} mt={2}>
                  <DS.Statistic label="Energy banked" value={fmt(summary.energyKwh, 1)} unit="kWh" size="xl" />
                  <DS.Statistic label="Distance flown" value={fmt(summary.distanceM)} unit="m" size="xl" />
                </x.div>
              </DS.StatisticGroup>
              <x.p mt={2} mb={0} color="uiHelperCopy" text="body12">
                Reached Level {summary.topLevel} · {titleCase(summary.topLevelTitle)}
              </x.p>
            </x.div>

            <DS.Divider />

            <x.div>
              <x.p m={0} mb={3} color="uiBodyCopy" text="body14">
                In the real world, generating <b>{fmt(summary.energyKwh, 1)} kWh</b> of solar means roughly:
              </x.p>
              <x.div display="grid" gridTemplateColumns={{ _: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                <Impact icon={DS.IconLeafFill} value={`${fmt(summary.co2Kg, 1)} kg`} label="CO₂ kept out of the air" />
                <Impact icon={DS.IconMoneyFill} value={`$${fmt(summary.dollars, 2)}`} label="off a typical power bill" />
                <Impact icon={DS.IconLightningFill} value={fmt(summary.phoneCharges)} label="phone charges" />
                <Impact
                  icon={DS.IconHouseFill}
                  value={`${fmt(summary.homeHours, 1)} hrs`}
                  label="of an average home's power"
                />
              </x.div>
              <x.p mt={3} mb={0} color="uiHelperCopy" text="body9">
                Figures are illustrative, based on US grid averages (~0.39 kg CO₂ and ~$0.16 per kWh).
              </x.p>
            </x.div>
          </x.div>
        )}
      </DS.ModalBody>
      <DS.ModalFooter>
        <x.div display="flex" flexWrap="wrap" alignItems="center" justifyContent="flex-start" gap={5} w="100%">
          <DS.Button variant="cta" icon={DS.IconRefresh} action={onPlayAgain} size="md">
            Play again
          </DS.Button>
          <a
            className="yellow-btn"
            href={ESTIMATE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <DS.IconSunFill size={4} />
            Get a free solar estimate
          </a>
        </x.div>
      </DS.ModalFooter>
    </DS.Modal>
  );
}

function Impact({
  icon: Icon,
  value,
  label,
}: {
  icon: DS.IIconComponent;
  value: string;
  label: string;
}) {
  return (
    <DS.Card variant="secondary">
      <x.div p={3} display="flex" alignItems="flex-start" gap={3}>
        <x.div mt="18px" flexShrink={0}>
          <DS.Status icon={Icon} bg="uiStatus.done" color="white" size="sm" />
        </x.div>
        <x.div>
          <x.div text="h1" lineHeight={1}>
            {value}
          </x.div>
          <x.div color="uiHelperCopy" text="body12" mt={1}>
            {label}
          </x.div>
        </x.div>
      </x.div>
    </DS.Card>
  );
}
