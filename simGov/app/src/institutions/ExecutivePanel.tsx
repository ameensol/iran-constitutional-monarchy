import type { GovState, GovAction } from '../simulation/types';
import { personName } from '../simulation/types';
import { activePM, activeDeputyPM, activeMinisters } from '../simulation/selectors';
import InstitutionShell from './InstitutionShell';
import { useTourAction, findTourTarget } from '../tour/TourActionContext';
import Badge from '../shared/Badge';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickPerson?: (personId: number) => void;
  onClickProcess?: (processId: string) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

function getFormationLabels(suspended: boolean): Record<string, string> {
  const nominator = suspended ? 'Senate' : 'Crown';
  return {
    'Idle': 'No formation in progress',
    'CrownNom1': `${nominator} First Nomination`,
    'Confidence1': 'First Confidence Vote',
    'CrownNom2': `${nominator} Second Nomination`,
    'Confidence2': 'Second Confidence Vote',
    'MajlisList': 'Majlis Candidate List',
    'CrownPick': `${nominator} Picks from List`,
    'Dissolved': 'Formation Exhausted (Parliament Dissolved)',
  };
}

export default function ExecutivePanel({ state, dispatch, onBack, onClickPerson, onClickProcess, readOnly, hideBack }: Props) {
  const { tourMode, activeTargets } = useTourAction();
  const showActions = !readOnly || tourMode;
  const pm = activePM(state);
  const deputyPm = activeDeputyPM(state);
  const ministers = activeMinisters(state);
  const formation = state.executive.formation;
  const suspended = state.crown.suspended;
  const FORMATION_LABELS = getFormationLabels(suspended);

  return (
    <InstitutionShell title="Executive" icon={'\u2696'} healthy={state.executive.pmSeated} onBack={onBack} hideBack={hideBack}>
      {state.executive.caretaker && (
        <div className="inst-alert turquoise">Government is in caretaker mode.{suspended ? ' Crown is suspended — the Senate exercises nomination powers.' : ''}</div>
      )}
      {suspended && !state.executive.caretaker && (
        <div className="inst-alert rose">Crown is suspended. The Senate exercises Crown nomination powers (Art. VI.5).</div>
      )}

      {/* PM */}
      <div className="inst-section" data-tour-id="exec-pm">
        <h3 className="inst-section-title">Prime Minister</h3>
        {pm ? (
          <div className="person-card" onClick={() => onClickPerson?.(pm.id)}>
            <div className="person-card-name">{personName(pm)}</div>
            <Badge label={state.executive.caretaker ? 'Caretaker' : 'Seated'} variant={state.executive.caretaker ? 'turquoise' : 'gold'} />
            {pm.party && <Badge label={pm.party} variant="none" />}
          </div>
        ) : (
          <div className="inst-empty">No Prime Minister (formation in progress)</div>
        )}
      </div>

      {/* Deputy PM */}
      <div className="inst-section">
        <h3 className="inst-section-title">Deputy Prime Minister</h3>
        {deputyPm ? (
          <div className="person-card" onClick={() => onClickPerson?.(deputyPm.id)}>
            <div className="person-card-name">{personName(deputyPm)}</div>
            <Badge label="Deputy PM" variant="turquoise" />
          </div>
        ) : (
          <>
            <div className="inst-empty">No Deputy PM</div>
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
                Designate Deputy PM
              </button>
            )}
          </>
        )}
      </div>

      {/* Formation Pipeline */}
      <div className="inst-section" data-tour-id="exec-formation">
        <h3 className="inst-section-title">Formation Process</h3>
        <div className="formation-pipeline">
          {['CrownNom1', 'Confidence1', 'CrownNom2', 'Confidence2', 'MajlisList', 'CrownPick'].map((stage) => {
            const isCurrent = formation.stage === stage;
            const isPast = getStageIndex(formation.stage) > getStageIndex(stage);
            return (
              <div key={stage} className={`formation-step ${isCurrent ? 'current' : isPast ? 'past' : 'future'}`}>
                <div className="formation-dot" />
                <span className="formation-label">{FORMATION_LABELS[stage]?.replace(suspended ? 'Senate ' : 'Crown ', '').replace('Confidence ', 'Conf. ') || stage}</span>
              </div>
            );
          })}
        </div>
        {formation.deadline && formation.stage !== 'Idle' && (
          <div className="inst-deadline">Deadline: {formation.deadline - state.day}d remaining</div>
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
            {suspended ? 'Senate Nominates PM' : 'Nominate PM'}
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
                Confidence Passes
              </button>}
              {showFail && <button
                className={`inst-action-btn danger ${tFail ? 'tour-action-target' : ''}`}
                onClick={() => { dispatch({ type: 'RESOLVE_CONFIDENCE', outcome: 'fail' }); tFail?.onActionTaken(); }}
              >
                Confidence Fails
              </button>}
            </div>
          );
        })()}
        {showActions && !tourMode && formation.stage === 'MajlisList' && (
          <button
            className="inst-action-btn"
            onClick={() => dispatch({ type: 'FORMATION_PRESENT_LIST' })}
          >
            Majlis Presents List
          </button>
        )}
        {showActions && !tourMode && formation.stage === 'CrownPick' && (
          <button
            className="inst-action-btn"
            onClick={() => dispatch({ type: 'FORMATION_PICK_FROM_LIST' })}
          >
            {suspended ? 'Senate' : 'Crown'} Picks from List
          </button>
        )}
        {formation.stage !== 'Idle' && onClickProcess && (
          <button className="inst-link-btn" onClick={() => onClickProcess('formation')}>
            View Formation Flowchart &#x2192;
          </button>
        )}
      </div>

      {/* No-Confidence (read-only status — actions moved to Parliament) */}
      <div className="inst-section" data-tour-id="exec-confidence">
        <h3 className="inst-section-title">Confidence</h3>
        {state.executive.noConfidence && !state.executive.noConfidence.resolved ? (
          <div className="inst-alert rose">
            No-confidence vote in progress — {state.executive.noConfidence.yesVotes} yes / {state.executive.noConfidence.noVotes} no — {state.executive.noConfidence.deadline - state.day}d remaining
          </div>
        ) : state.executive.noConfidence?.resolved ? (
          <div className="inst-empty">
            Last motion {state.executive.noConfidence.outcome === 'pass' ? 'passed' : 'failed'} ({state.executive.noConfidence.yesVotes}-{state.executive.noConfidence.noVotes})
          </div>
        ) : (
          <div className="inst-empty">
            {state.executive.pmSeated ? 'PM holds Parliament\'s confidence' : 'No active confidence motion'}
          </div>
        )}
      </div>

      {/* Cabinet */}
      <div className="inst-section" data-tour-id="exec-cabinet">
        <h3 className="inst-section-title">Cabinet ({ministers.length} Ministers)</h3>
        <div className="inst-list">
          {ministers.map((m) => (
            <div key={m.id} className="inst-list-item" onClick={() => onClickPerson?.(m.id)}>
              <span className="inst-list-name">{personName(m)}</span>
              <Badge label="Minister" variant="none" />
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
