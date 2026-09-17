import type { GovState } from './types';
import { createInitialState } from './initialState';

export interface PersistedSimulationV1 {
  version: 1;
  savedAt: string;
  state: GovState;
}

export interface PersistedSimulationV2 {
  version: 2;
  savedAt: string;
  state: GovState;
}

export const SIMULATION_STORAGE_KEY = 'constitution-lab-simulation';
let pendingResetReason: 'bilingual-upgrade' | null = null;

function isGovState(value: unknown): value is GovState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GovState>;
  return typeof state.day === 'number' && typeof state.year === 'number' && Array.isArray(state.people) && Array.isArray(state.bills) && Array.isArray(state.events);
}

export function loadSimulation(): GovState {
  try {
    const raw = localStorage.getItem(SIMULATION_STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<PersistedSimulationV1 | PersistedSimulationV2>;
    if (parsed.version === 1) {
      localStorage.removeItem(SIMULATION_STORAGE_KEY);
      pendingResetReason = 'bilingual-upgrade';
      return createInitialState();
    }
    if (parsed.version !== 2 || !isGovState(parsed.state)) throw new Error('Incompatible saved simulation');
    return parsed.state;
  } catch {
    localStorage.removeItem(SIMULATION_STORAGE_KEY);
    return createInitialState();
  }
}

export function saveSimulation(state: GovState) {
  const persisted: PersistedSimulationV2 = { version: 2, savedAt: new Date().toISOString(), state };
  localStorage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify(persisted));
}

export function consumeSimulationResetReason(): 'bilingual-upgrade' | null {
  const reason = pendingResetReason;
  pendingResetReason = null;
  return reason;
}

export function clearSimulation() {
  localStorage.removeItem(SIMULATION_STORAGE_KEY);
}
