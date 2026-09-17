import { describe, expect, it } from 'vitest';
import { createInitialState } from '../simulation/initialState';
import { loadSimulation, saveSimulation, SIMULATION_STORAGE_KEY } from '../simulation/persistence';

describe('simulation persistence', () => {
  it('round-trips a versioned state', () => {
    const state = createInitialState();
    state.day += 8;
    saveSimulation(state);
    expect(loadSimulation().day).toBe(state.day);
    expect(JSON.parse(localStorage.getItem(SIMULATION_STORAGE_KEY) ?? '{}').version).toBe(2);
  });

  it('recovers safely from corrupt or incompatible data', () => {
    localStorage.setItem(SIMULATION_STORAGE_KEY, '{bad json');
    expect(loadSimulation().day).toBe(createInitialState().day);
    expect(localStorage.getItem(SIMULATION_STORAGE_KEY)).toBeNull();
    localStorage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify({ version: 99, state: {} }));
    expect(loadSimulation().bills.length).toBeGreaterThan(0);
  });

  it('resets V1 state for the bilingual data upgrade', () => {
    const state = createInitialState();
    state.day = 999;
    localStorage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state }));
    expect(loadSimulation().day).toBe(createInitialState().day);
  });
});
