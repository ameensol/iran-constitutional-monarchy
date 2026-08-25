import type { FormationStage } from '../simulation/types';

interface Props {
  currentStage: FormationStage;
  deadline: number | null;
  currentDay: number;
  nomineeName: string | null;
}

/*
  Layout:
  Row 1: [CrownNom1] → [Confidence1] → [CrownNom2] → [Confidence2]
         ↓ connector from col 4 down
  Row 2: [Idle]        [MajlisList]  → [CrownPick]  → [Dissolved]
*/

interface FlowNode {
  stage: FormationStage;
  label: string;
  sub: string;
}

const row1: FlowNode[] = [
  { stage: 'CrownNom1',  label: 'Crown Nom. 1',   sub: 'Monarch nominates' },
  { stage: 'Confidence1', label: 'Confidence Vote', sub: 'Majlis votes' },
  { stage: 'CrownNom2',  label: 'Crown Nom. 2',   sub: 'Second attempt' },
  { stage: 'Confidence2', label: 'Confidence Vote', sub: 'Majlis votes again' },
];

const row2: FlowNode[] = [
  { stage: 'MajlisList', label: 'Majlis List',  sub: 'Majlis presents 3 names' },
  { stage: 'CrownPick',  label: 'Crown Pick',   sub: 'Monarch chooses from 3' },
  { stage: 'Dissolved',  label: 'Dissolved',     sub: 'New elections called' },
];

const mainPath: FormationStage[] = ['CrownNom1', 'Confidence1', 'CrownNom2', 'Confidence2'];
const fallbackPath: FormationStage[] = ['MajlisList', 'CrownPick', 'Dissolved'];

function getNodeClass(nodeStage: FormationStage, current: FormationStage): string {
  if (nodeStage === current) {
    if (nodeStage === 'Idle') return 'node terminal-enacted';
    if (nodeStage === 'Dissolved') return 'node terminal-rejected';
    return 'node current';
  }

  const ci = mainPath.indexOf(current);
  const ni = mainPath.indexOf(nodeStage);
  if (ci >= 0 && ni >= 0 && ni < ci) return 'node completed';

  if (fallbackPath.includes(current)) {
    if (mainPath.includes(nodeStage)) return 'node completed';
    const fci = fallbackPath.indexOf(current);
    const fni = fallbackPath.indexOf(nodeStage);
    if (fci >= 0 && fni >= 0 && fni < fci) return 'node completed';
  }

  return 'node future';
}

function isCompleted(fromStage: FormationStage, current: FormationStage): boolean {
  const cls = getNodeClass(fromStage, current);
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

export default function FormationFlowchart({ currentStage, deadline, currentDay, nomineeName }: Props) {
  const daysLeft = deadline ? deadline - currentDay : null;
  const inFallback = fallbackPath.includes(currentStage);
  const showIdle = currentStage === 'Idle';

  return (
    <div className="flow-chart">
      {/* Row 1: Main path */}
      <div className="flow-row">
        {row1.map((node, i) => {
          const cls = getNodeClass(node.stage, currentStage);
          const isCurrent = node.stage === currentStage;
          return (
            <div key={node.stage} className="flow-step">
              <div className={cls}>
                {isCurrent && (
                  <div className="node-ornament">
                    <img src="/assets/rosette.svg" className="persian-art" alt="" />
                  </div>
                )}
                <div className="node-label">{node.label}</div>
                <div className="node-sub">
                  {isCurrent && nomineeName ? nomineeName : node.sub}
                  {isCurrent && daysLeft !== null && daysLeft > 0 && ` · ${daysLeft}d`}
                </div>
              </div>
              {i < row1.length - 1 && (
                <div className={`flow-arrow-h ${isCompleted(node.stage, currentStage) ? 'gold' : ''}`}>
                  <HArrow />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Connector: down from Confidence2 area */}
      <div className="flow-down-row">
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className={`flow-down-cell ${inFallback ? 'gold' : ''}`}>
          <VArrow />
        </div>
      </div>

      {/* Row 2: Fallback path */}
      <div className="flow-row">
        {showIdle ? (
          <div className="flow-step">
            <div className="node terminal-enacted">
              <div className="node-label">PM Seated</div>
              <div className="node-sub">No formation needed</div>
            </div>
          </div>
        ) : (
          <div className="flow-spacer" />
        )}
        {!showIdle && row2.map((node, i) => {
          const cls = getNodeClass(node.stage, currentStage);
          const isCurrent = node.stage === currentStage;
          return (
            <div key={node.stage} className="flow-step">
              <div className={cls}>
                {isCurrent && node.stage !== 'Dissolved' && (
                  <div className="node-ornament">
                    <img src="/assets/rosette.svg" className="persian-art" alt="" />
                  </div>
                )}
                <div className="node-label">{node.label}</div>
                <div className="node-sub">
                  {isCurrent && nomineeName ? nomineeName : node.sub}
                  {isCurrent && daysLeft !== null && daysLeft > 0 && ` · ${daysLeft}d`}
                </div>
              </div>
              {i < row2.length - 1 && (
                <div className={`flow-arrow-h ${isCompleted(node.stage, currentStage) ? 'gold' : ''}`}>
                  <HArrow />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
