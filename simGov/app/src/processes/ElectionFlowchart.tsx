import type { ElectionPhase } from '../simulation/types';

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

const nodes: FlowNode[] = [
  { phase: 'registration', label: 'Registration', sub: 'Candidates file' },
  { phase: 'voting',       label: 'Voting',       sub: 'Ballots cast' },
  { phase: 'tallied',      label: 'Tallied',      sub: 'Results announced' },
  { phase: 'seated',       label: 'Seated',       sub: 'Members take office' },
];

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
  const daysLeft = deadline - currentDay;

  return (
    <div className="flow-chart">
      <div className="flow-row">
        {nodes.map((node, i) => {
          const cls = getNodeClass(node.phase, currentPhase);
          const isCurrent = node.phase === currentPhase;
          const sub = isCurrent && daysLeft > 0
            ? `${node.sub} · ${daysLeft}d left`
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
        <span className="process-info-label">Seats contested:</span>
        <span className="process-info-value">{seatsContested}</span>
      </div>
    </div>
  );
}
