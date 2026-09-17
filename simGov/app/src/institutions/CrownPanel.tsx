import { useState } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import { activeMonarch, activeHeirs, personById } from '../simulation/selectors';
import { SENATE_CROWN } from '../simulation/provinces';
import InstitutionShell from './InstitutionShell';
import { useTourAction, findTourTarget } from '../tour/TourActionContext';
import Badge from '../shared/Badge';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, namedEntityDisplayName, personDisplayName } from '../i18n/simulatorFormat';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickPerson?: (personId: number) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

export default function CrownPanel({ state, dispatch, onBack, onClickPerson, readOnly, hideBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const number = (value: number) => formatNumber(value, locale);
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmAbdicate, setConfirmAbdicate] = useState(false);
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const monarch = activeMonarch(state);
  const heirs = activeHeirs(state);
  const crownBills = state.bills.filter((b) => b.stage === 'Crown Action');
  const crownSenators = state.people.filter((p) => p.role === 'crown_senator' && p.status === 'active');

  return (
    <InstitutionShell title={t('institutions.crown')} icon={'\u2654'} healthy={!state.crown.suspended} onBack={onBack} hideBack={hideBack}>
      {state.crown.suspended && (
        <div className="inst-alert rose">
          {t(state.executive.pmSeated ? 'crownPanel.suspendedPm' : 'crownPanel.suspendedNoPm')}
        </div>
      )}

      {/* Monarch */}
      <div className="inst-section" data-tour-id="crown-monarch">
        <h3 className="inst-section-title">{t('crownPanel.monarch')}</h3>
        {monarch ? (
          <div className="person-card" onClick={() => onClickPerson?.(monarch.id)}>
            <div className="person-card-name">{personDisplayName(monarch, locale)}</div>
            <Badge label={t('labels.active')} variant="gold" />
          </div>
        ) : (
          <div className="inst-empty">{t('crownPanel.noMonarch')}</div>
        )}
      </div>

      {/* Succession */}
      <div className="inst-section" data-tour-id="crown-succession">
        <h3 className="inst-section-title">{t('crownPanel.succession', { count: number(heirs.length) })}</h3>
        {state.crown.successionList.length === 0 ? (
          <div className="inst-empty">{t('crownPanel.noHeirs')}</div>
        ) : (
          <div className="inst-list">
            {state.crown.successionList.map((heirId, i) => {
              const heir = personById(state, heirId);
              if (!heir) return null;
              return (
                <div key={heirId} className="inst-list-item" onClick={() => onClickPerson?.(heirId)}>
                  <span className="inst-list-rank">#{number(i + 1)}</span>
                  <span className="inst-list-name">{personDisplayName(heir, locale)}</span>
                  <Badge label={heir.status === 'active' ? t('crownPanel.eligible') : t(`personStatuses.${heir.status}`)} variant={heir.status === 'active' ? 'emerald' : 'rose'} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Ministerial Acts */}
      <div className="inst-section" data-tour-id="crown-pending">
        <h3 className="inst-section-title">{t('crownPanel.pending', { count: number(crownBills.length) })}</h3>
        {crownBills.length === 0 ? (
          <div className="inst-empty">{t('crownPanel.noBills')}</div>
        ) : (
          <div className="inst-list">
            {crownBills.map((bill) => (
              <div key={bill.id} className="inst-list-item">
                <span className="inst-list-name">{namedEntityDisplayName(bill.name, locale, t)}</span>
                <span className="inst-list-meta">{t('crownPanel.remaining', { days: number(bill.deadline - state.day) })}</span>
                {showActions && (() => {
                  const tSign = findTourTarget(activeTargets, 'SIGN_BILL', bill.id);
                  const tReturn = findTourTarget(activeTargets, 'RETURN_BILL', bill.id);
                  const tRefer = findTourTarget(activeTargets, 'REFER_TO_COURT', bill.id);
                  // In tour mode, only show buttons that are targets
                  const showSign = !readOnly || (tourMode && tSign);
                  const showReturn = (!readOnly && !bill.crownReturned) || (tourMode && tReturn);
                  const showRefer = (!readOnly && bill.crownReturned) || (tourMode && tRefer);
                  if (!showSign && !showReturn && !showRefer) return null;
                  return (
                    <div className="inst-action-group">
                      {showSign && <button
                        className={`inst-action-btn small ${tSign ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'SIGN_BILL', billId: bill.id }); tSign?.onActionTaken(); }}
                        disabled={!tourMode && state.crown.suspended && !state.executive.pmSeated}
                      >
                        {t(state.crown.suspended ? 'crownPanel.pmSigns' : 'crownPanel.sign')}
                      </button>}
                      {showReturn && <button
                        className={`inst-action-btn small secondary ${tReturn ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'RETURN_BILL', billId: bill.id }); tReturn?.onActionTaken(); }}
                        disabled={!tourMode && ((state.crown.suspended && !state.executive.pmSeated) || bill.crownReturned)}
                      >
                        {t(state.crown.suspended ? 'crownPanel.pmReturns' : 'crownPanel.return')}
                      </button>}
                      {showRefer && <button
                        className={`inst-action-btn small secondary ${tRefer ? 'tour-action-target' : ''}`}
                        onClick={() => { dispatch({ type: 'REFER_TO_COURT', billId: bill.id }); tRefer?.onActionTaken(); }}
                        disabled={!tourMode && state.crown.suspended}
                      >
                        {t('crownPanel.refer')}
                      </button>}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Justice Nominations (Crown/PM/Senate nominates) */}
      {showActions && (() => {
        const pendingNoms = state.court.appointments.filter(
          (a) => a.phase === 'CrownNom1' || a.phase === 'CrownNom2'
        );
        if (pendingNoms.length === 0) return null;
        const nominator = state.crown.suspended ? (state.executive.pmSeated ? 'PM' : 'Senate') : 'Crown';
        return (
          <div className="inst-section">
            <h3 className="inst-section-title">{t('crownPanel.nominations', { count: number(pendingNoms.length) })}</h3>
            <div className="inst-list">
              {pendingNoms.map((appt) => {
                const phaseLabel = t(appt.phase === 'CrownNom1' ? 'crownPanel.firstNomination' : 'crownPanel.secondNomination');
                return (
                  <div key={appt.seatNumber} className="inst-list-item">
                    <span className="inst-list-name">{t('labels.seat', { number: number(appt.seatNumber) })}</span>
                    <Badge label={phaseLabel} variant="turquoise" />
                    {appt.deadline && <span className="inst-list-meta">{t('crownPanel.remaining', { days: number(appt.deadline - state.day) })}</span>}
                    <button
                      className="inst-action-btn small"
                      onClick={() => {
                        const citizens = state.people.filter((p) => p.status === 'active' && p.role !== 'justice' && p.role !== 'monarch' && p.role !== 'heir');
                        const pick = citizens[Math.floor(Math.random() * citizens.length)];
                        if (pick) dispatch({ type: 'CROWN_NOMINATE_JUSTICE', seatNumber: appt.seatNumber, personId: pick.id });
                      }}
                    >
                      {t(nominator === 'PM' ? 'crownPanel.pmNominates' : nominator === 'Senate' ? 'crownPanel.senateNominates' : 'crownPanel.crownNominates')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Crown Senators */}
      <div className="inst-section" data-tour-id="crown-senators">
        <h3 className="inst-section-title">{t('crownPanel.senators', { current: number(crownSenators.length), total: number(SENATE_CROWN) })}</h3>
        <div className="inst-list">
          {crownSenators.map((s) => (
            <div key={s.id} className="inst-list-item" onClick={() => onClickPerson?.(s.id)}>
              <span className="inst-list-name">{personDisplayName(s, locale)}</span>
              <Badge label={t('crownPanel.crownSenator')} variant="gold" />
            </div>
          ))}
        </div>
        {showActions && !tourMode && (
          <button
            className="inst-action-btn"
            style={{ marginTop: 8 }}
            onClick={() => dispatch({ type: 'APPOINT_CROWN_SENATOR' })}
            disabled={crownSenators.length >= SENATE_CROWN || state.crown.suspended}
          >
            {crownSenators.length >= SENATE_CROWN ? t('crownPanel.allFilled', { count: number(SENATE_CROWN) }) : t('crownPanel.appointSenator')}
          </button>
        )}
      </div>

      {/* Crown Powers */}
      {showActions && !tourMode && (
        <div className="inst-section">
          <h3 className="inst-section-title">{t('crownPanel.powers')}</h3>
          <div className="inst-btn-row">
            {/* Dissolve Parliament */}
            {confirmDissolve ? (
              <div className="disaster-confirm">
                <span className="disaster-confirm-text">{t('crownPanel.dissolveConfirm')}</span>
                <button
                  className="inst-action-btn danger small"
                  onClick={() => { dispatch({ type: 'DISSOLVE_PARLIAMENT' }); setConfirmDissolve(false); }}
                >
                  {t('actions.confirm')}
                </button>
                <button
                  className="inst-action-btn small secondary"
                  onClick={() => setConfirmDissolve(false)}
                >
                  {t('actions.cancel')}
                </button>
              </div>
            ) : (
              <button
                className="inst-action-btn danger"
                onClick={() => setConfirmDissolve(true)}
                disabled={state.crown.suspended || state.parliament.dissolved}
              >
                {t('crownPanel.dissolve')}
              </button>
            )}

            {/* Suspend Crown */}
            {confirmSuspend ? (
              <div className="disaster-confirm">
                <span className="disaster-confirm-text">{t('crownPanel.suspendConfirm')}</span>
                <button
                  className="inst-action-btn danger small"
                  onClick={() => { dispatch({ type: 'SUSPEND_CROWN' }); setConfirmSuspend(false); }}
                >
                  {t('actions.confirm')}
                </button>
                <button
                  className="inst-action-btn small secondary"
                  onClick={() => setConfirmSuspend(false)}
                >
                  {t('actions.cancel')}
                </button>
              </div>
            ) : (
              <button
                className="inst-action-btn danger"
                onClick={() => setConfirmSuspend(true)}
                disabled={state.crown.suspended}
              >
                {t(state.crown.suspended ? 'crownPanel.suspendedAlready' : 'crownPanel.suspend')}
              </button>
            )}

            {/* Resume Crown */}
            {state.crown.suspended && (
              <button
                className="inst-action-btn"
                onClick={() => dispatch({ type: 'RESUME_CROWN' })}
                disabled={!state.crown.suspended || (heirs.length === 0 && !monarch)}
              >
                {t('crownPanel.resume')}
              </button>
            )}

            {/* Abdicate */}
            {confirmAbdicate ? (
              <div className="disaster-confirm">
                <span className="disaster-confirm-text">
                  {heirs.length > 0 ? t('crownPanel.abdicateHeir', { heir: personDisplayName(heirs[0], locale) }) : t('crownPanel.abdicateNoHeir')}
                </span>
                <button
                  className="inst-action-btn danger small"
                  onClick={() => { dispatch({ type: 'ABDICATE' }); setConfirmAbdicate(false); }}
                >
                  {t('actions.confirm')}
                </button>
                <button
                  className="inst-action-btn small secondary"
                  onClick={() => setConfirmAbdicate(false)}
                >
                  {t('actions.cancel')}
                </button>
              </div>
            ) : (
              <button
                className="inst-action-btn danger"
                onClick={() => setConfirmAbdicate(true)}
                disabled={state.crown.suspended || !monarch}
              >
                {t('crownPanel.abdicate')}
              </button>
            )}

            {/* Update Succession */}
            {heirs.length > 1 && !state.crown.suspended && (
              <button
                className="inst-action-btn secondary"
                onClick={() => {
                  // Reverse the order as a simple reorder action
                  const reversed = [...state.crown.successionList].reverse();
                  dispatch({ type: 'UPDATE_SUCCESSION', heirIds: reversed });
                }}
              >
                {t('crownPanel.reverse')}
              </button>
            )}
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
