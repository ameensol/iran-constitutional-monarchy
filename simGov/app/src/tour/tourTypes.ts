import type { InstitutionId } from '../shared/useNavigation';

export type TourViewTarget =
  | { type: 'dashboard' }
  | { type: 'institution'; id: InstitutionId };
