import type { Bill } from '../simulation/types';

interface StatusBarProps {
  bill: Bill;
  currentDay: number;
}

export default function StatusBar({ bill, currentDay }: StatusBarProps) {
  const daysLeft = bill.deadline - currentDay;
  const isTerminal = ['Enacted', 'Rejected', 'Vetoed'].includes(bill.stage);

  return (
    <div className="status-bar">
      <div className="status-group">
        <div className="status-item">
          <span className="status-label">Current stage:</span>
          <span className="status-badge">{bill.stage}</span>
        </div>
        {bill.majlisYes > 0 && (
          <div className="status-item">
            <span className="status-label">Majlis:</span>
            <span className="status-value">{bill.majlisYes} yes / {bill.majlisNo} no</span>
          </div>
        )}
        {bill.senateYes > 0 && (
          <div className="status-item">
            <span className="status-label">Senate:</span>
            <span className="status-value">{bill.senateYes} yes / {bill.senateNo} no</span>
          </div>
        )}
      </div>
      {!isTerminal && daysLeft > 0 && (
        <div className="status-countdown">
          {'\u23F1'} {bill.stage === 'Crown Action' ? 'Crown deadline' : 'Deadline'}: {daysLeft} days
        </div>
      )}
    </div>
  );
}
