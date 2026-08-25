import type { Bill, BillStage } from '../simulation/types';

interface BillFlowchartProps {
  bill: Bill;
  currentDay: number;
}

/*
  Layout (4 rows):
  Row 1: [Introduced] → [Majlis Voting] → [Senate Review] → [Crown Action]
                              ↓                  ↓                ↓        ↘
  Row 2:               [Rejected]       [Senate Objected] [Returned]  [Enacted]
                                              ↓                ↓
  Row 3:                                [Majlis Override]  [Referred]
                                                               ↓
  Row 4:                                                   [Vetoed]
*/

const mainPath: BillStage[] = ['Introduced', 'Majlis Voting', 'Senate Review', 'Crown Action', 'Enacted'];

function getNodeClass(nodeStage: BillStage, currentStage: BillStage): string {
  if (nodeStage === currentStage) {
    if (nodeStage === 'Enacted') return 'node terminal-enacted';
    if (nodeStage === 'Rejected' || nodeStage === 'Vetoed') return 'node terminal-rejected';
    return 'node current';
  }

  if (nodeStage === 'Enacted' && currentStage !== 'Enacted') return 'node future';
  if ((nodeStage === 'Rejected' || nodeStage === 'Vetoed') && nodeStage !== currentStage) return 'node future';

  const currentIdx = mainPath.indexOf(currentStage);
  const nodeIdx = mainPath.indexOf(nodeStage);
  if (currentIdx >= 0 && nodeIdx >= 0 && nodeIdx < currentIdx) return 'node completed';

  if (currentStage === 'Enacted') {
    if (mainPath.indexOf(nodeStage) >= 0 && mainPath.indexOf(nodeStage) < 4) return 'node completed';
  }
  if (currentStage === 'Rejected') {
    if (nodeStage === 'Introduced' || nodeStage === 'Majlis Voting') return 'node completed';
  }
  if (currentStage === 'Senate Objected') {
    if (['Introduced', 'Majlis Voting', 'Senate Review'].includes(nodeStage)) return 'node completed';
  }
  if (currentStage === 'Returned' || currentStage === 'Referred' || currentStage === 'Majlis Override') {
    if (['Introduced', 'Majlis Voting', 'Senate Review', 'Crown Action'].includes(nodeStage)) return 'node completed';
  }
  if (currentStage === 'Vetoed') {
    if (['Introduced', 'Majlis Voting', 'Senate Review', 'Crown Action', 'Returned', 'Referred'].includes(nodeStage)) return 'node completed';
  }

  return 'node future';
}

function isCompleted(fromStage: BillStage, current: BillStage): boolean {
  const cls = getNodeClass(fromStage, current);
  return cls.includes('completed') || cls.includes('terminal');
}

function getNodeSub(nodeStage: BillStage, bill: Bill, currentDay: number): string {
  switch (nodeStage) {
    case 'Introduced':
      return `Day ${bill.submittedDay}`;
    case 'Majlis Voting':
      if (bill.majlisYes > 0 || bill.majlisNo > 0) return `${bill.majlisYes} yes / ${bill.majlisNo} no`;
      return 'Pending votes';
    case 'Senate Review':
      if (bill.senateYes > 0 || bill.senateNo > 0) return `${bill.senateYes} yes / ${bill.senateNo} no`;
      return 'Pending votes';
    case 'Crown Action': {
      if (bill.stage === 'Crown Action') {
        const daysLeft = bill.deadline - currentDay;
        return daysLeft > 0 ? `\u23F1 ${daysLeft} days` : 'Overdue';
      }
      return '';
    }
    case 'Enacted':         return 'Becomes law';
    case 'Rejected':        return 'Majlis failed';
    case 'Senate Objected': return 'Returns to Majlis';
    case 'Returned':        return 'Crown returns bill';
    case 'Majlis Override':  return '2/3 supermajority';
    case 'Referred':        return 'Reconsidered';
    case 'Vetoed':          return 'Override failed';
    default:                return '';
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

function Node({ stage, bill, currentDay }: { stage: BillStage; bill: Bill; currentDay: number }) {
  const cls = getNodeClass(stage, bill.stage);
  const isCurrent = stage === bill.stage;
  const sub = getNodeSub(stage, bill, currentDay);
  return (
    <div className={cls}>
      {isCurrent && (
        <div className="node-ornament">
          <img src="/assets/rosette.svg" className="persian-art" alt="" />
        </div>
      )}
      <div className="node-label">{stage}</div>
      {sub && <div className="node-sub">{sub}</div>}
    </div>
  );
}

export default function BillFlowchart({ bill, currentDay }: BillFlowchartProps) {
  const row1Stages: BillStage[] = ['Introduced', 'Majlis Voting', 'Senate Review', 'Crown Action'];

  return (
    <div className="flow-chart">
      {/* Row 1: Main path */}
      <div className="flow-row">
        {row1Stages.map((stage, i) => (
          <div key={stage} className="flow-step">
            <Node stage={stage} bill={bill} currentDay={currentDay} />
            {i < row1Stages.length - 1 && (
              <div className={`flow-arrow-h ${isCompleted(stage, bill.stage) ? 'gold' : ''}`}>
                <HArrow />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Down arrows from Majlis, Senate, Crown + diagonal to Enacted */}
      <div className="flow-down-row">
        <div className="flow-down-cell" />
        <div className={`flow-down-cell ${bill.stage === 'Rejected' ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className={`flow-down-cell ${bill.stage === 'Senate Objected' ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className={`flow-down-cell ${['Returned', 'Enacted'].includes(bill.stage) ? 'gold' : ''}`}>
          <VArrow />
        </div>
      </div>

      {/* Row 2: Rejected, Senate Objected, Returned, Enacted */}
      <div className="flow-row">
        <div className="flow-spacer" />
        <div className="flow-step">
          <Node stage="Rejected" bill={bill} currentDay={currentDay} />
        </div>
        <div className="flow-arrow-h" style={{ visibility: 'hidden' }}><HArrow /></div>
        <div className="flow-step">
          <Node stage="Senate Objected" bill={bill} currentDay={currentDay} />
        </div>
        <div className="flow-arrow-h" style={{ visibility: 'hidden' }}><HArrow /></div>
        <div className="flow-step">
          <Node stage="Returned" bill={bill} currentDay={currentDay} />
        </div>
        <div className="flow-arrow-h" style={{ visibility: 'hidden' }}><HArrow /></div>
        <div className="flow-step">
          <Node stage="Enacted" bill={bill} currentDay={currentDay} />
        </div>
      </div>

      {/* Down arrows from Senate Objected and Returned */}
      <div className="flow-down-row">
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className={`flow-down-cell ${bill.stage === 'Senate Objected' || bill.stage === 'Majlis Override' ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className="flow-down-cell" style={{ visibility: 'hidden' }} />
        <div className={`flow-down-cell ${['Returned', 'Referred', 'Vetoed'].includes(bill.stage) ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className="flow-down-cell" style={{ visibility: 'hidden' }} />
        <div className="flow-down-cell" style={{ visibility: 'hidden' }} />
      </div>

      {/* Row 3: Majlis Override, Referred */}
      <div className="flow-row">
        <div className="flow-spacer" />
        <div className="flow-spacer" />
        <div className="flow-spacer" />
        <div className="flow-step">
          <Node stage="Majlis Override" bill={bill} currentDay={currentDay} />
        </div>
        <div className="flow-arrow-h" style={{ visibility: 'hidden' }}><HArrow /></div>
        <div className="flow-step">
          <Node stage="Referred" bill={bill} currentDay={currentDay} />
        </div>
        <div className="flow-spacer" />
        <div className="flow-spacer" />
      </div>

      {/* Down arrow from Referred */}
      <div className="flow-down-row">
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className="flow-down-cell" />
        <div className="flow-down-cell" style={{ visibility: 'hidden' }} />
        <div className={`flow-down-cell ${bill.stage === 'Vetoed' ? 'gold' : ''}`}>
          <VArrow />
        </div>
        <div className="flow-down-cell" style={{ visibility: 'hidden' }} />
        <div className="flow-down-cell" style={{ visibility: 'hidden' }} />
      </div>

      {/* Row 4: Vetoed */}
      <div className="flow-row">
        <div className="flow-spacer" />
        <div className="flow-spacer" />
        <div className="flow-spacer" />
        <div className="flow-spacer" />
        <div className="flow-spacer" />
        <div className="flow-step">
          <Node stage="Vetoed" bill={bill} currentDay={currentDay} />
        </div>
        <div className="flow-spacer" />
        <div className="flow-spacer" />
      </div>
    </div>
  );
}
