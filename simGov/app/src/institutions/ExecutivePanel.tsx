import type { GovState, GovAction } from '../simulation/types';
import { activePM, activeDeputyPM, activeMinisters } from '../simulation/selectors';
import InstitutionShell from './InstitutionShell';
import { useTourAction, findTourTarget } from '../tour/TourActionContext';
import Badge from '../shared/Badge';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, formationStageLabel, partyDisplayName, personDisplayName } from '../i18n/simulatorFormat';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickPerson?: (personId: number) => void;
  onClickProcess?: (processId: string) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

export default function ExecutivePanel({ state, dispatch, onBack, onClickPerson, onClickProcess, readOnly, hideBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const number = (value: number) => formatNumber(value, locale);
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const pm = activePM(state);
  const deputyPm = activeDeputyPM(state);
  const ministers = activeMinisters(state);
  const formation = state.executive.formation;
  const suspended = state.crown.suspended;

  return (
    <InstitutionShell title={t('institutions.executive')} icon={'\u2696'} healthy={state.executive.pmSeated} onBack={onBack} hideBack={hideBack}>
      {state.executive.caretaker && (
        <div className="inst-alert turquoise">{t('executivePanel.caretaker')} {suspended ? t('executivePanel.caretakerSuspended') : ''}</div>
      )}
      {suspended && !state.executive.caretaker && (
        <div className="inst-alert rose">{t('executivePanel.suspended')}</div>
      )}

      {/* PM */}
      <div className="inst-section" data-tour-id="exec-pm">
        <h3 className="inst-section-title">{t('labels.primeMinister')}</h3>
        {pm ? (
          <div className="person-card" onClick={() => onClickPerson?.(pm.id)}>
            <div className="person-card-name">{personDisplayName(pm, locale)}</div>
            <Badge label={t(state.executive.caretaker ? 'labels.caretaker' : 'labels.seated')} variant={state.executive.caretaker ? 'turquoise' : 'gold'} />
            {pm.party && <Badge label={partyDisplayName(pm.party, locale, t)} variant="none" />}
          </div>
        ) : (
          <div className="inst-empty">{t('executivePanel.noPm')}</div>
        )}
      </div>

      {/* Deputy PM */}
      <div className="inst-section">
        <h3 className="inst-section-title">{t('executivePanel.deputy')}</h3>
        {deputyPm ? (
          <div className="person-card" onClick={() => onClickPerson?.(deputyPm.id)}>
            <div className="person-card-name">{personDisplayName(deputyPm, locale)}</div>
            <Badge label={t('roles.deputy_pm')} variant="turquoise" />
          </div>
        ) : (
          <>
            <div className="inst-empty">{t('executivePanel.noDeputy')}</div>
            {showActions && !tourMode && pm && !deputyPm && (
              <button
                className="inst-action-btn"
                style={{ marginTop: 8 }}
                onClick={() => {
                  // Pick a random minister or majlis member as deputy
                  const candidates = state.people.filter(
                    (p) => p.status === 'active' && (p.role === 'minister' || p.role === 'majlis_member') && p.id !== pm.id
                  );
                  const pick = candidates[Math.floor(Math.random() * candidates.length)];
                  if (pick) dispatch({ type: 'DESIGNATE_DEPUTY_PM', personId: pick.id });
                }}
              >
                {t('executivePanel.designateDeputy')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Formation Pipeline */}
      <div className="inst-section" data-tour-id="exec-formation">
        <h3 className="inst-section-title">{t('executivePanel.formation')}</h3>
        <div className="formation-pipeline">
          {['CrownNom1', 'Confidence1', 'CrownNom2', 'Confidence2', 'MajlisList', 'CrownPick'].map((stage) => {
            const isCurrent = formation.stage === stage;
            const isPast = getStageIndex(formation.stage) > getStageIndex(stage);
            return (
              <div key={stage} className={`formation-step ${isCurrent ? 'current' : isPast ? 'past' : 'future'}`}>
                <div className="formation-dot" />
                <span className="formation-label">{formationStageLabel(stage as import('../simulation/types').FormationStage, t)}</span>
              </div>
            );
          })}
        </div>
        {formation.deadline && formation.stage !== 'Idle' && (
          <div className="inst-deadline">{t('executivePanel.deadline', { days: number(formation.deadline - state.day) })}</div>
        )}
        {showActions && !tourMode && (formation.stage === 'CrownNom1' || formation.stage === 'CrownNom2') && (
          <button
            className="inst-action-btn"
            onClick={() => {
              const members = state.people.filter((p) => p.role === 'majlis_member' && p.status === 'active');
              const nominee = members[Math.floor(Math.random() * members.length)];
              if (nominee) dispatch({ type: 'CROWN_NOMINATE_PM', personId: nominee.id });
            }}
          >
            {t(suspended ? 'executivePanel.senateNominate' : 'executivePanel.nominate')}
          </button>
        )}
        {showActions && (formation.stage === 'Confidence1' || formation.stage === 'Confidence2') && (() => {
          const tPass = findTourTarget(activeTargets, 'RESOLVE_CONFIDENCE_PASS');
          const tFail = findTourTarget(activeTargets, 'RESOLVE_CONFIDENCE_FAIL');
          const showPass = !readOnly || (tourMode && tPass);
          const showFail = !readOnly || (tourMode && tFail);
          if (!showPass && !showFail) return null;
          return (
            <div className="inst-btn-row">
              {showPass && <button
                className={`inst-action-btn ${tPass ? 'tour-action-target' : ''}`}
                onClick={() => { dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'pass' }); tPass?.onActionTaken(); }}
              >
                {t('executivePanel.confidencePasses')}
              </button>}
              {showFail && <button
                className={`inst-action-btn danger ${tFail ? 'tour-action-target' : ''}`}
                onClick={() => { dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'fail' }); tFail?.onActionTaken(); }}
              >
                {t('executivePanel.confidenceFails')}
              </button>}
            </div>
          );
        })()}
        {showActions && !tourMode && formation.stage === 'MajlisList' && (
          <button
            className="inst-action-btn"
            onClick={() => dispatch({ type: 'FORMATION_PRESENT_LIST' })}
          >
            {t('executivePanel.presentList')}
          </button>
        )}
        {showActions && !tourMode && formation.stage === 'CrownPick' && (
          <button
            className="inst-action-btn"
            onClick={() => dispatch({ type: 'FORMATION_PICK_FROM_LIST' })}
          >
            {t('executivePanel.pickList', { institution: t(suspended ? 'institutions.senate' : 'institutions.crown', { defaultValue: suspended ? (locale === 'fa' ? 'سنا' : 'Senate') : t('institutions.crown') }) })}
          </button>
        )}
        {formation.stage !== 'Idle' && onClickProcess && (
          <button className="inst-link-btn" onClick={() => onClickProcess('formation')}>
            {t('executivePanel.viewFlow')} <span className="next-arrow" aria-hidden="true">&#x2192;</span>
          </button>
        )}
      </div>

      {/* No-Confidence (read-only status — actions moved to Parliament) */}
      <div className="inst-section" data-tour-id="exec-confidence">
        <h3 className="inst-section-title">{t('executivePanel.confidence')}</h3>
        {state.executive.noConfidence && !state.executive.noConfidence.resolved ? (
          <div className="inst-alert rose">
            {t('executivePanel.confidenceOpen', { yes: number(state.executive.noConfidence.yesVotes), no: number(state.executive.noConfidence.noVotes), days: number(state.executive.noConfidence.deadline - state.day) })}
          </div>
        ) : state.executive.noConfidence?.resolved ? (
          <div className="inst-empty">
            {t(state.executive.noConfidence.outcome === 'pass' ? 'executivePanel.lastPassed' : 'executivePanel.lastFailed', { yes: number(state.executive.noConfidence.yesVotes), no: number(state.executive.noConfidence.noVotes) })}
          </div>
        ) : (
          <div className="inst-empty">
            {t(state.executive.pmSeated ? 'executivePanel.holdsConfidence' : 'executivePanel.noMotion')}
          </div>
        )}
      </div>

      {/* Cabinet */}
      <div className="inst-section" data-tour-id="exec-cabinet">
        <h3 className="inst-section-title">{t('executivePanel.cabinet', { count: number(ministers.length) })}</h3>
        <div className="inst-list">
          {ministers.map((m) => (
            <div key={m.id} className="inst-list-item" onClick={() => onClickPerson?.(m.id)}>
              <span className="inst-list-name">{personDisplayName(m, locale)}</span>
              <Badge label={t('executivePanel.minister')} variant="none" />
            </div>
          ))}
        </div>
      </div>
    </InstitutionShell>
  );
}

function getStageIndex(stage: string): number {
  const stages = ['Idle', 'CrownNom1', 'Confidence1', 'CrownNom2', 'Confidence2', 'MajlisList', 'CrownPick', 'Dissolved'];
  return stages.indexOf(stage);
}
