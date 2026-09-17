import { useState } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import { personById } from '../simulation/selectors';
import { provinceById } from '../simulation/provinces';
import Badge from '../shared/Badge';
import './People.css';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, partyDisplayName, personDisplayName, provinceDisplayName } from '../i18n/simulatorFormat';

interface Props {
  personId: number;
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
}

export default function PersonDetail({ personId, state, dispatch, onBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const person = personById(state, personId);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!person) {
    return (
      <div className="person-detail-shell">
        <button className="back-btn" onClick={onBack}><span aria-hidden="true">{'\u2190'}</span> {t('actions.back')}</button>
        <div className="inst-empty">{t('person.notFound')}</div>
      </div>
    );
  }

  const province = provinceById(person.provinceId);
  const isActive = person.status === 'active';
  const name = personDisplayName(person, locale);
  return (
    <div className="person-detail-shell">
      <button className="back-btn" onClick={onBack}><span aria-hidden="true">{'\u2190'}</span> {t('actions.back')}</button>

      <div className="person-detail-header">
        <h2 className="person-detail-name">{name}</h2>
        <Badge label={t(`roles.${person.role}`)} variant="gold" />
        <Badge label={t(`personStatuses.${person.status}`)} variant={isActive ? 'emerald' : 'rose'} />
      </div>

      <div className="person-detail-meta">
        <div className="person-meta-row">
          <span className="person-meta-label">{t('person.province')}</span>
          <span className="person-meta-value">{provinceDisplayName(province, locale)}</span>
        </div>
        {person.party && (
          <div className="person-meta-row">
            <span className="person-meta-label">{t('person.party')}</span>
            <span className="person-meta-value">{partyDisplayName(person.party, locale, t)}</span>
          </div>
        )}
        <div className="person-meta-row">
          <span className="person-meta-label">{t('person.seated')}</span>
          <span className="person-meta-value">{t('labels.day', { day: formatNumber(person.seatedDay, locale) })}</span>
        </div>
        {person.termEnd !== null && (
          <div className="person-meta-row">
            <span className="person-meta-label">{t('person.termEnds')}</span>
            <span className="person-meta-value">{t('labels.day', { day: formatNumber(person.termEnd, locale) })}</span>
          </div>
        )}
        {person.seatNumber !== undefined && (
          <div className="person-meta-row">
            <span className="person-meta-label">{t('person.seat')}</span>
            <span className="person-meta-value">#{formatNumber(person.seatNumber, locale)}</span>
          </div>
        )}
      </div>

      {isActive && (
        <div className="person-actions">
          {confirming === 'kill' ? (
            <div className="disaster-confirm">
              <span className="disaster-confirm-text">{t('person.confirmKill', { name })}</span>
              <button className="inst-action-btn danger small" onClick={() => { dispatch({ type: 'KILL_PERSON', personId: person.id }); setConfirming(null); }}>{t('person.confirm')}</button>
              <button className="inst-action-btn small secondary" onClick={() => setConfirming(null)}>{t('person.cancel')}</button>
            </div>
          ) : confirming === 'incapacitate' ? (
            <div className="disaster-confirm">
              <span className="disaster-confirm-text">{t('person.confirmIncapacitate', { name })}</span>
              <button className="inst-action-btn danger small" onClick={() => { dispatch({ type: 'INCAPACITATE_PERSON', personId: person.id }); setConfirming(null); }}>{t('person.confirm')}</button>
              <button className="inst-action-btn small secondary" onClick={() => setConfirming(null)}>{t('person.cancel')}</button>
            </div>
          ) : confirming === 'resign' ? (
            <div className="disaster-confirm">
              <span className="disaster-confirm-text">{t('person.confirmResign', { name })}</span>
              <button className="inst-action-btn danger small" onClick={() => { dispatch({ type: 'RESIGN_PERSON', personId: person.id }); setConfirming(null); }}>{t('person.confirm')}</button>
              <button className="inst-action-btn small secondary" onClick={() => setConfirming(null)}>{t('person.cancel')}</button>
            </div>
          ) : (
            <>
              <button className="inst-action-btn danger" onClick={() => setConfirming('kill')}>{t('person.kill')}</button>
              <button className="inst-action-btn secondary" onClick={() => setConfirming('incapacitate')}>{t('person.incapacitate')}</button>
              <button className="inst-action-btn secondary" onClick={() => setConfirming('resign')}>{t('person.resign')}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
