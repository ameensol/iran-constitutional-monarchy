import type { AmendmentPhase } from '../simulation/types';

interface Props {
  currentPhase: AmendmentPhase;
  title: string;
  deadline: number;
  currentDay: number;
  parlYes: number;
  parlNo: number;
  refYes: number;
  refNo: number;
  emergency: boolean;
}

/*
  Layout:
  Row 1: [Proposed] → [ParliamentVote] → [Referendum] → [Enacted]
                           ↓                  ↓
  Row 2:  [empty]     [Rejected]          [Expired]     [empty]
*/

interface FlowNode {
  phase: AmendmentPhase;
  label: string;
}

const row1: FlowNode[] = [
  { phase: 'Proposed',       label: 'Proposed' },
  { phase: 'ParliamentVote', label: 'Parliament Vote' },
  { phase: 'Referendum',     label: 'Referendum' },
  { phase: 'Enacted',        label: 'Enacted' },
];

const mainPath: AmendmentPhase[] = ['Proposed', 'ParliamentVote', 'Referendum', 'Enacted'];

function getNodeClass(nodePhase: AmendmentPhase, current: AmendmentPhase): string {
  if (nodePhase === current) {
    if (nodePhase === 'Enacted') return 'node terminal-enacted';
    if (nodePhase === 'Rejected' || nodePhase === 'Expired') return 'node terminal-rejected';
    return 'node current';
  }

  const ci = mainPath.indexOf(current);
  const ni = mainPath.indexOf(nodePhase);
  if (ci >= 0 && ni >= 0 && ni < ci) return 'node completed';
  if (current === 'Enacted' && mainPath.includes(nodePhase)) return 'node completed';

  return 'node future';
}

function isCompleted(fromPhase: AmendmentPhase, current: AmendmentPhase): boolean {
  const cls = getNodeClass(fromPhase, current);
  return cls.includes('completed') || cls.includes('terminal');
}

function getNodeSub(phase: AmendmentPhase, props: Props): string {
  switch (phase) {
    case 'Proposed':
      return props.emergency ? 'Emergency amendment' : 'Standard amendment';
    case 'ParliamentVote':
      if (props.parlYes > 0 || props.parlNo > 0) return `${props.parlYes} yes / ${props.parlNo} no`;
      return '2/3 supermajority needed';
    case 'Referendum':
      if (props.refYes > 0 || props.refNo > 0) return `${props.refYes} yes / ${props.refNo} no`;
      return props.emergency ? 'Skipped (emergency)' : 'Popular vote';
    case 'Enacted':
      return 'Constitution amended';
    case 'Rejected':
      return 'Parliament failed';
    case 'Expired':
      return 'Deadline passed';
    default:
      return '';
  }
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

export default function AmendmentFlowchart(props: Props) {
  const { currentPhase, deadline, currentDay } = props;
  const daysLeft = deadline - currentDay;

  return (
    <div className="flow-chart">
      {/* Row 1: Main path */}
      <div className="flow-row">
        {row1.map((node, i) => {
          const cls = getNodeClass(node.phase, currentPhase);
          const isCurrent = node.phase === currentPhase;
          const sub = getNodeSub(node.phase, props);
          return (
            <div key={node.phase} className="flow-step">
              <div className={cls}>
                {isCurrent && !['Enacted', 'Rejected', 'Expired'].includes(node.phase) && (
                  <div className="node-ornament">
                    <img src="/assets/rosette.svg" className="persian-art" alt="" />
                  </div>
                )}
                <div className="node-label">{node.label}</div>
                <div className="node-sub">
                  {sub}
                  {isCurrent && daysLeft > 0 && ` · ${daysLeft}d`}
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

      {/* Down arrows: from ParliamentVote and Referendum */}
      <div className="flow-down-row">
        <div className="flow-down-cell" />
        <div className={`flow-down-cell ${currentPhase === 'Rejected' ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className={`flow-down-cell ${currentPhase === 'Expired' ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className="flow-down-cell" />
      </div>

      {/* Row 2: Terminal states */}
      <div className="flow-row">
        <div className="flow-spacer" />
        <div className="flow-step">
          <div className={getNodeClass('Rejected', currentPhase)}>
            <div className="node-label">Rejected</div>
            <div className="node-sub">{getNodeSub('Rejected', props)}</div>
          </div>
        </div>
        <div className="flow-arrow-h" style={{ visibility: 'hidden' }}><HArrow /></div>
        <div className="flow-step">
          <div className={getNodeClass('Expired', currentPhase)}>
            <div className="node-label">Expired</div>
            <div className="node-sub">{getNodeSub('Expired', props)}</div>
          </div>
        </div>
        <div className="flow-spacer" />
      </div>
    </div>
  );
}
