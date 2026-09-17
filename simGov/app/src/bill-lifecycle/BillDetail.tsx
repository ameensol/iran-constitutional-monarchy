import type { Bill } from '../simulation/types';
import BillFlowchart from './BillFlowchart';
import StatusBar from './StatusBar';
import './BillDetail.css';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, namedEntityDisplayName } from '../i18n/simulatorFormat';

interface BillDetailProps {
  bill: Bill;
  currentDay: number;
  year: number;
  onBack: () => void;
}

export default function BillDetail({ bill, currentDay, year, onBack }: BillDetailProps) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  return (
    <>
      {/* Background watermark */}
      <div className="bill-bg-watermark">
        <img src="/assets/lamassu.svg" alt="" />
      </div>

      <div className="bill-shell">
        <button className="back-btn" onClick={onBack}>
          <span aria-hidden="true">{'\u2190'}</span> {t('actions.back')}
        </button>

        {/* Bill header */}
        <div className="bill-header">
          <div className="bill-label">{t('bills.details')}</div>
          <div className="bill-detail-name">{namedEntityDisplayName(bill.name, locale, t)}</div>
          <div className="bill-meta">
            {t('bills.bill')} <span>#{formatNumber(bill.id, locale)}</span> &nbsp;&middot;&nbsp;
            {t('bills.sponsor')}: <span>{bill.sponsor}</span> &nbsp;&middot;&nbsp;
            {t('bills.submitted')}: <span>{t('header.dayYear', { day: formatNumber(bill.submittedDay, locale), year: formatNumber(year, locale) })}</span>
          </div>
        </div>

        {/* Flowchart */}
        <BillFlowchart bill={bill} currentDay={currentDay} />

        {/* Status bar */}
        <StatusBar bill={bill} currentDay={currentDay} />

        {/* Legend */}
        <div className="legend">
          <div className="legend-item">
            <div className="legend-swatch completed-sw" /> {locale === 'fa' ? 'تکمیل‌شده' : 'Completed'}
          </div>
          <div className="legend-item">
            <div className="legend-swatch current-sw" /> {locale === 'fa' ? 'مرحلهٔ جاری' : 'Current'}
          </div>
          <div className="legend-item">
            <div className="legend-swatch future-sw" /> {locale === 'fa' ? 'مرحلهٔ بعدی' : 'Future'}
          </div>
          <div className="legend-item">
            <div className="legend-swatch enacted-sw" /> {t('billStages.Enacted')}
          </div>
          <div className="legend-item">
            <div className="legend-swatch rejected-sw" /> {t('billStages.Rejected')} / {t('billStages.Vetoed')}
          </div>
        </div>
      </div>
    </>
  );
}
