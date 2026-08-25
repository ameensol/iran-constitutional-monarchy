import { createContext, useContext } from 'react';

export interface TourActionTarget {
  actionType: string;        // e.g. 'SIGN_BILL', 'SUBMIT_BILL'
  actionKey?: string | number; // e.g. billId (optional discriminator)
  nextFrame: string;         // frame to advance to when clicked
  onActionTaken: () => void; // callback: advances tour
}

export interface TourActionContextValue {
  tourMode: boolean;
  activeTargets: TourActionTarget[];
}

const TourActionContext = createContext<TourActionContextValue>({
  tourMode: false,
  activeTargets: [],
});

export const TourActionProvider = TourActionContext.Provider;

export function useTourAction(): TourActionContextValue {
  return useContext(TourActionContext);
}

/** Find a matching tour target by actionType and optional actionKey. */
export function findTourTarget(
  targets: TourActionTarget[],
  actionType: string,
  actionKey?: string | number,
): TourActionTarget | undefined {
  return targets.find(
    (t) => t.actionType === actionType && (actionKey === undefined || t.actionKey === undefined || t.actionKey === actionKey),
  );
}
