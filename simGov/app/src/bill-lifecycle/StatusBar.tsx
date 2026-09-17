import type { Bill } from '../simulation/types';
import { useTranslation } from 'react-i18next';
import { activeLocale, billStageLabel, formatNumber } from '../i18n/simulatorFormat';

interface StatusBarProps {
  bill: Bill;
  currentDay: number;
}

export default function StatusBar({ bill, currentDay }: StatusBarProps) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const n = (value: number) => formatNumber(value, locale);
  const daysLeft = bill.deadline - currentDay;
  const isTerminal = ['Enacted', 'Rejected', 'Vetoed'].includes(bill.stage);

  return (
    <div className="status-bar">
      <div className="status-group">
        <div className="status-item">
          <span className="status-label">{t('bills.currentStage')}:</span>
          <span className="status-badge">{billStageLabel(bill.stage, t)}</span>
        </div>
        {bill.majlisYes > 0 && (
          <div className="status-item">
            <span className="status-label">{t('bills.majlis')}:</span>
            <span className="status-value">{t('bills.voteResult', { yes: n(bill.majlisYes), no: n(bill.majlisNo) })}</span>
          </div>
        )}
        {bill.senateYes > 0 && (
          <div className="status-item">
            <span className="status-label">{t('bills.senate')}:</span>
            <span className="status-value">{t('bills.voteResult', { yes: n(bill.senateYes), no: n(bill.senateNo) })}</span>
          </div>
        )}
      </div>
      {!isTerminal && daysLeft > 0 && (
        <div className="status-countdown">
          {'\u23F1'} {bill.stage === 'Crown Action' ? t('bills.crownDeadlineLong', { days: n(daysLeft) }) : t('bills.deadlineLong', { days: n(daysLeft) })}
        </div>
      )}
    </div>
  );
}
