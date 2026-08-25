import type { PlayerIdentity, Province } from '../simulation/types';

interface Props {
  player: PlayerIdentity;
  province: Province;
  year: number;
}

export default function PassportCard({ player, province, year }: Props) {
  return (
    <div className="passport-card">
      <div className="passport-card-header">
        <span className="passport-card-title">Imperial Iran &mdash; Passport</span>
        <span className="passport-card-seal" aria-hidden="true">{'\u{1F981}'}</span>
      </div>
      <div className="passport-card-name">
        {player.firstName} {player.lastName}
      </div>
      <div className="passport-card-province">
        {province.name} Province
      </div>
      <div className="passport-card-details">
        <div className="passport-card-field">
          <span className="passport-card-label">Passport No.</span>
          <span className="passport-card-value">{player.passportNumber}</span>
        </div>
        <div className="passport-card-field">
          <span className="passport-card-label">Issued</span>
          <span className="passport-card-value">Year {year}, Day {player.issuedDay}</span>
        </div>
      </div>
    </div>
  );
}
