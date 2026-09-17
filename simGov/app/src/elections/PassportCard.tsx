import type { PlayerIdentity, Province } from '../simulation/types';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, provinceDisplayName, TechnicalText } from '../i18n/simulatorFormat';

interface Props {
  player: PlayerIdentity;
  province: Province;
  year: number;
}

export default function PassportCard({ player, province, year }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  return (
    <div className="passport-card">
      <div className="passport-card-header">
        <span className="passport-card-title">{t('passport.title')}</span>
        <span className="passport-card-seal" aria-hidden="true">{'\u{1F981}'}</span>
      </div>
      <div className="passport-card-name">
        {player.firstName} {player.lastName}
      </div>
      <div className="passport-card-province">
        {t('passport.province', { province: provinceDisplayName(province, locale) })}
      </div>
      <div className="passport-card-details">
        <div className="passport-card-field">
          <span className="passport-card-label">{t('passport.number')}</span>
          <span className="passport-card-value"><TechnicalText>{player.passportNumber}</TechnicalText></span>
        </div>
        <div className="passport-card-field">
          <span className="passport-card-label">{t('passport.issued')}</span>
          <span className="passport-card-value">{t('passport.issuedValue', { year: formatNumber(year, locale), day: formatNumber(player.issuedDay, locale) })}</span>
        </div>
      </div>
    </div>
  );
}
