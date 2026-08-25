import type { GovState, GovAction } from '../simulation/types';
import type { InstitutionId } from '../shared/useNavigation';
import ParliamentPanel from './ParliamentPanel';
import CrownPanel from './CrownPanel';
import ExecutivePanel from './ExecutivePanel';
import CourtPanel from './CourtPanel';
import ElectionsPanel from './ElectionsPanel';
import BudgetPanel from './BudgetPanel';
import './InstitutionDetail.css';

interface InstitutionDetailProps {
  institutionId: InstitutionId;
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
  onClickPerson?: (personId: number) => void;
  onClickProcess?: (processId: string) => void;
  onClickBill?: (billId: number) => void;
  readOnly?: boolean;
  hideBack?: boolean;
}

export default function InstitutionDetail({ institutionId, state, dispatch, onBack, onClickPerson, onClickProcess, onClickBill, readOnly, hideBack }: InstitutionDetailProps) {
  switch (institutionId) {
    case 'crown':
      return <CrownPanel state={state} dispatch={dispatch} onBack={onBack} onClickPerson={onClickPerson} readOnly={readOnly} hideBack={hideBack} />;
    case 'parliament':
      return <ParliamentPanel state={state} dispatch={dispatch} onBack={onBack} onClickPerson={onClickPerson} onClickBill={onClickBill} readOnly={readOnly} hideBack={hideBack} />;
    case 'executive':
      return <ExecutivePanel state={state} dispatch={dispatch} onBack={onBack} onClickPerson={onClickPerson} onClickProcess={onClickProcess} readOnly={readOnly} hideBack={hideBack} />;
    case 'court':
      return <CourtPanel state={state} dispatch={dispatch} onBack={onBack} onClickPerson={onClickPerson} onClickProcess={onClickProcess} readOnly={readOnly} hideBack={hideBack} />;
    case 'elections':
      return <ElectionsPanel state={state} dispatch={dispatch} onBack={onBack} onClickProcess={onClickProcess} readOnly={readOnly} hideBack={hideBack} />;
    case 'budget':
      return <BudgetPanel state={state} dispatch={dispatch} onBack={onBack} readOnly={readOnly} hideBack={hideBack} />;
  }
}
