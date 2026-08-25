import type { Bill } from '../simulation/types';
import BillFlowchart from './BillFlowchart';
import StatusBar from './StatusBar';
import './BillDetail.css';

interface BillDetailProps {
  bill: Bill;
  currentDay: number;
  year: number;
  onBack: () => void;
}

export default function BillDetail({ bill, currentDay, year, onBack }: BillDetailProps) {
  return (
    <>
      {/* Background watermark */}
      <div className="bill-bg-watermark">
        <img src="/assets/lamassu.svg" alt="" />
      </div>

      <div className="bill-shell">
        <button className="back-btn" onClick={onBack}>
          {'\u2190'} Back
        </button>

        {/* Bill header */}
        <div className="bill-header">
          <div className="bill-label">Bill Lifecycle</div>
          <div className="bill-detail-name">{bill.name}</div>
          <div className="bill-meta">
            Bill <span>#{bill.id}</span> &nbsp;&middot;&nbsp;
            Sponsor: <span>{bill.sponsor}</span> &nbsp;&middot;&nbsp;
            Submitted: <span>Day {bill.submittedDay}, Year {year}</span>
          </div>
        </div>

        {/* Flowchart */}
        <BillFlowchart bill={bill} currentDay={currentDay} />

        {/* Status bar */}
        <StatusBar bill={bill} currentDay={currentDay} />

        {/* Legend */}
        <div className="legend">
          <div className="legend-item">
            <div className="legend-swatch completed-sw" /> Completed
          </div>
          <div className="legend-item">
            <div className="legend-swatch current-sw" /> Current
          </div>
          <div className="legend-item">
            <div className="legend-swatch future-sw" /> Future
          </div>
          <div className="legend-item">
            <div className="legend-swatch enacted-sw" /> Enacted
          </div>
          <div className="legend-item">
            <div className="legend-swatch rejected-sw" /> Rejected / Vetoed
          </div>
        </div>
      </div>
    </>
  );
}
