import type { Bill, BillStage } from '../simulation/types';
import Badge from '../shared/Badge';
import { useTranslation } from 'react-i18next';
import { activeLocale, billStageLabel, formatNumber, namedEntityDisplayName } from '../i18n/simulatorFormat';

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

function formatDeadline(bill: Bill, currentDay: number, locale: 'en' | 'fa', overdue: string): string {
  if (['Enacted', 'Rejected', 'Vetoed'].includes(bill.stage)) return '\u2014';
  const days = bill.deadline - currentDay;
  if (days <= 0) return overdue;
  return locale === 'fa' ? `${formatNumber(days, locale)} روز` : `${formatNumber(days, locale)}d`;
}

export default function BillsTable({ bills, currentDay, onSelectBill }: BillsTableProps) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  // Show active bills (not terminal)
  const activeBills = bills.filter((b) => !['Enacted', 'Rejected', 'Vetoed'].includes(b.stage));

  return (
    <div className="bills-card">
      <table className="bills-table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>{t('bills.id')}</th>
            <th>{t('bills.bill')}</th>
            <th style={{ width: 160 }}>{t('bills.stage')}</th>
            <th style={{ width: 100, textAlign: 'end' }}>{t('bills.deadline')}</th>
          </tr>
        </thead>
        <tbody>
          {activeBills.map((bill) => (
            <tr key={bill.id} onClick={() => onSelectBill(bill.id)}>
              <td><span className="bill-id">#{formatNumber(bill.id, locale)}</span></td>
              <td className="bill-name-cell">{namedEntityDisplayName(bill.name, locale, t)}</td>
              <td><Badge label={billStageLabel(bill.stage, t)} variant={stageBadgeVariant(bill.stage)} /></td>
              <td className="bill-countdown">{formatDeadline(bill, currentDay, locale, t('bills.overdue'))}</td>
            </tr>
          ))}
          {activeBills.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: 'var(--pale-gold)', textAlign: 'center', padding: 20 }}>
                {t('bills.noActive')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
