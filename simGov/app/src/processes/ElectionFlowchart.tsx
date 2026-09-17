import type { ElectionPhase } from '../simulation/types';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber } from '../i18n/simulatorFormat';

interface Props {
  currentPhase: ElectionPhase;
  seatsContested: number;
  deadline: number;
  currentDay: number;
}

interface FlowNode {
  phase: ElectionPhase;
  label: string;
  sub: string;
}

const phaseOrder: ElectionPhase[] = ['registration', 'voting', 'tallied', 'seated'];

function getNodeClass(nodePhase: ElectionPhase, current: ElectionPhase): string {
  const ni = phaseOrder.indexOf(nodePhase);
  const ci = phaseOrder.indexOf(current);
  if (nodePhase === current) return 'node current';
  if (nodePhase === 'seated' && current === 'seated') return 'node terminal-enacted';
  if (ni < ci) return 'node completed';
  return 'node future';
}

function arrowClass(fromIndex: number, currentPhase: ElectionPhase): string {
  const ci = phaseOrder.indexOf(currentPhase);
  return fromIndex < ci ? 'flow-arrow-h gold' : 'flow-arrow-h';
}

function HArrow() {
  return (
    <svg viewBox="0 0 40 12" preserveAspectRatio="xMidYMid meet">
      <line x1="0" y1="6" x2="32" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="32 2, 40 6, 32 10" fill="currentColor" />
    </svg>
  );
}

export default function ElectionFlowchart({ currentPhase, seatsContested, deadline, currentDay }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const nodes: FlowNode[] = [
    { phase: 'registration', label: t('process.registration'), sub: t('process.candidatesFile') },
    { phase: 'voting', label: t('process.voting'), sub: t('process.ballotsCast') },
    { phase: 'tallied', label: t('process.tallied'), sub: t('process.resultsAnnounced') },
    { phase: 'seated', label: t('process.seated'), sub: t('process.membersTakeOffice') },
  ];
  const daysLeft = deadline - currentDay;

  return (
    <div className="flow-chart">
      <div className="flow-row">
        {nodes.map((node, i) => {
          const cls = getNodeClass(node.phase, currentPhase);
          const isCurrent = node.phase === currentPhase;
          const sub = isCurrent && daysLeft > 0
            ? `${node.sub} · ${t('process.daysLeft', { days: formatNumber(daysLeft, locale) })}`
            : node.sub;
          return (
            <div key={node.phase} className="flow-step">
              <div className={cls}>
                {isCurrent && (
                  <div className="node-ornament">
                    <img src="/assets/rosette.svg" className="persian-art" alt="" />
                  </div>
                )}
                <div className="node-label">{node.label}</div>
                <div className="node-sub">{sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <div className={arrowClass(i, currentPhase)}>
                  <HArrow />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="process-info">
        <span className="process-info-label">{t('process.seatsContested')}</span>
        <span className="process-info-value">{formatNumber(seatsContested, locale)}</span>
      </div>
    </div>
  );
}
