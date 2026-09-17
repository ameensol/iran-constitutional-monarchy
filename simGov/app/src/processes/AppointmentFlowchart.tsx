import type { AppointmentPhase } from '../simulation/types';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber } from '../i18n/simulatorFormat';

interface Props {
  currentPhase: AppointmentPhase;
  seatNumber: number;
  deadline: number | null;
  currentDay: number;
}

/*
  Layout:
  Row 1: [CrownNom1] → [SenateVote1] → [CrownNom2] → [SenateVote2]
         ↓ connector from col 4 down to col 2
  Row 2: [spacer]      [SenateList]  → [CrownPick]  → [Seated]
*/

interface FlowNode {
  phase: AppointmentPhase;
  label: string;
  sub: string;
}

const row1: FlowNode[] = [
  { phase: 'CrownNom1', label: 'flow.crownNom1', sub: 'flow.monarchNominates' },
  { phase: 'SenateVote1', label: 'flow.senateVote', sub: 'flow.senateDecides' },
  { phase: 'CrownNom2', label: 'flow.crownNom2', sub: 'flow.secondNomination' },
  { phase: 'SenateVote2', label: 'flow.senateVote', sub: 'flow.senateDecides' },
];

const row2: FlowNode[] = [
  { phase: 'SenateList', label: 'flow.senateList', sub: 'flow.senateThree' },
  { phase: 'CrownPick', label: 'flow.crownPick', sub: 'flow.choosesThree' },
  { phase: 'Seated', label: 'flow.seated', sub: 'flow.oath' },
];

const mainPath: AppointmentPhase[] = ['CrownNom1', 'SenateVote1', 'CrownNom2', 'SenateVote2'];
const fallbackPath: AppointmentPhase[] = ['SenateList', 'CrownPick', 'Seated'];

function getNodeClass(nodePhase: AppointmentPhase, current: AppointmentPhase): string {
  if (nodePhase === current) {
    if (nodePhase === 'Seated') return 'node terminal-enacted';
    return 'node current';
  }

  const ci = mainPath.indexOf(current);
  const ni = mainPath.indexOf(nodePhase);
  if (ci >= 0 && ni >= 0 && ni < ci) return 'node completed';

  if (fallbackPath.includes(current)) {
    if (mainPath.includes(nodePhase)) return 'node completed';
    const fci = fallbackPath.indexOf(current);
    const fni = fallbackPath.indexOf(nodePhase);
    if (fci >= 0 && fni >= 0 && fni < fci) return 'node completed';
  }

  return 'node future';
}

function isCompleted(fromPhase: AppointmentPhase, current: AppointmentPhase): boolean {
  const cls = getNodeClass(fromPhase, current);
  return cls.includes('completed') || cls.includes('terminal');
}

function HArrow() {
  return (
    <svg viewBox="0 0 40 12" preserveAspectRatio="xMidYMid meet">
      <line x1="0" y1="6" x2="32" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="32 2, 40 6, 32 10" fill="currentColor" />
    </svg>
  );
}

function VArrow() {
  return (
    <svg viewBox="0 0 12 32" preserveAspectRatio="xMidYMid meet">
      <line x1="6" y1="0" x2="6" y2="24" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="2 24, 6 32, 10 24" fill="currentColor" />
    </svg>
  );
}

export default function AppointmentFlowchart({ currentPhase, seatNumber, deadline, currentDay }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const daysLeft = deadline ? deadline - currentDay : null;
  const inFallback = fallbackPath.includes(currentPhase);

  return (
    <div className="flow-chart">
      {/* Row 1: Main path */}
      <div className="flow-row">
        {row1.map((node, i) => {
          const cls = getNodeClass(node.phase, currentPhase);
          const isCurrent = node.phase === currentPhase;
          return (
            <div key={node.phase} className="flow-step">
              <div className={cls}>
                {isCurrent && (
                  <div className="node-ornament">
                    <img src="/assets/rosette.svg" className="persian-art" alt="" />
                  </div>
                )}
                <div className="node-label">{t(node.label)}</div>
                <div className="node-sub">
                  {t(node.sub)}
                  {isCurrent && daysLeft !== null && daysLeft > 0 && ` · ${t('process.daysLeft', { days: formatNumber(daysLeft, locale) })}`}
                </div>
              </div>
              {i < row1.length - 1 && (
                <div className={`flow-arrow-h ${isCompleted(node.phase, currentPhase) ? 'gold' : ''}`}>
                  <HArrow />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Connector: down from SenateVote2 area to SenateList area */}
      <div className="flow-down-row">
        {/* 3 empty spacers for cols 1-3, arrow in col 4 area dropping to col 2 */}
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className={`flow-down-cell ${inFallback ? 'gold' : ''}`}>
          <VArrow />
        </div>
      </div>

      {/* Row 2: Fallback path (starts at col 2) */}
      <div className="flow-row">
        <div className="flow-spacer" />
        {row2.map((node, i) => {
          const cls = getNodeClass(node.phase, currentPhase);
          const isCurrent = node.phase === currentPhase;
          return (
            <div key={node.phase} className="flow-step">
              <div className={cls}>
                {isCurrent && node.phase !== 'Seated' && (
                  <div className="node-ornament">
                    <img src="/assets/rosette.svg" className="persian-art" alt="" />
                  </div>
                )}
                <div className="node-label">{t(node.label)}</div>
                <div className="node-sub">
                  {t(node.sub)}
                  {isCurrent && daysLeft !== null && daysLeft > 0 && ` · ${t('process.daysLeft', { days: formatNumber(daysLeft, locale) })}`}
                </div>
              </div>
              {i < row2.length - 1 && (
                <div className={`flow-arrow-h ${isCompleted(node.phase, currentPhase) ? 'gold' : ''}`}>
                  <HArrow />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="process-info">
        <span className="process-info-label">{t('flow.seat')}:</span>
        <span className="process-info-value">#{formatNumber(seatNumber, locale)}</span>
      </div>
    </div>
  );
}
