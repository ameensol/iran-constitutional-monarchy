import type { Bill, BillStage } from '../simulation/types';
import Badge from '../shared/Badge';

interface BillsTableProps {
  bills: Bill[];
  currentDay: number;
  onSelectBill: (billId: number) => void;
}

function stageBadgeVariant(stage: BillStage): 'gold' | 'emerald' | 'rose' | 'turquoise' | 'none' {
  switch (stage) {
    case 'Introduced': return 'none';
    case 'Majlis Voting': return 'gold';
    case 'Senate Review': return 'turquoise';
    case 'Crown Action': return 'gold';
    case 'Enacted': return 'emerald';
    case 'Rejected':
    case 'Vetoed': return 'rose';
    case 'Returned':
    case 'Senate Objected': return 'rose';
    case 'Majlis Override':
    case 'Referred': return 'turquoise';
    default: return 'none';
  }
}

function formatDeadline(bill: Bill, currentDay: number): string {
  if (['Enacted', 'Rejected', 'Vetoed'].includes(bill.stage)) return '\u2014';
  const days = bill.deadline - currentDay;
  if (days <= 0) return 'Overdue';
  return `${days}d`;
}

export default function BillsTable({ bills, currentDay, onSelectBill }: BillsTableProps) {
  // Show active bills (not terminal)
  const activeBills = bills.filter((b) => !['Enacted', 'Rejected', 'Vetoed'].includes(b.stage));

  return (
    <div className="bills-card">
      <table className="bills-table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>ID</th>
            <th>Bill</th>
            <th style={{ width: 160 }}>Stage</th>
            <th style={{ width: 100, textAlign: 'right' }}>Deadline</th>
          </tr>
        </thead>
        <tbody>
          {activeBills.map((bill) => (
            <tr key={bill.id} onClick={() => onSelectBill(bill.id)}>
              <td><span className="bill-id">#{bill.id}</span></td>
              <td className="bill-name-cell">{bill.name}</td>
              <td><Badge label={bill.stage} variant={stageBadgeVariant(bill.stage)} /></td>
              <td className="bill-countdown">{formatDeadline(bill, currentDay)}</td>
            </tr>
          ))}
          {activeBills.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: 'var(--pale-gold)', textAlign: 'center', padding: 20 }}>
                No active bills
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
