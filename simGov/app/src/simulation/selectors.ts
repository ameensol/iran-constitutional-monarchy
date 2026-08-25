import type { GovState, Person, PersonRole, PersonId, ProvinceId } from './types';

/** All people who are currently active (not dead, incapacitated, resigned, or removed). */
export function activePeople(state: GovState): Person[] {
  return state.people.filter((p) => p.status === 'active');
}

/** Active people filtered by role. */
export function personsByRole(state: GovState, role: PersonRole): Person[] {
  return state.people.filter((p) => p.status === 'active' && p.role === role);
}

/** Active people in a specific province. */
export function personsByProvince(state: GovState, provinceId: ProvinceId): Person[] {
  return state.people.filter((p) => p.status === 'active' && p.provinceId === provinceId);
}

/** Get a person by ID. */
export function personById(state: GovState, id: PersonId): Person | undefined {
  return state.people.find((p) => p.id === id);
}

// ── Majlis ─────────────────────────────────────────

export function activeMajlisMembers(state: GovState): Person[] {
  return personsByRole(state, 'majlis_member');
}

export function majlisSeats(state: GovState): number {
  return activeMajlisMembers(state).length;
}

export function majlisTotal(_state: GovState): number {
  return _state.parliament.majlisTotal;
}

export function majlisHasQuorum(state: GovState): boolean {
  if (state.parliament.dissolved) return false;
  return majlisSeats(state) > majlisTotal(state) / 2;
}

// ── Senate ─────────────────────────────────────────

export function activeSenators(state: GovState): Person[] {
  return state.people.filter(
    (p) => p.status === 'active' && (p.role === 'senator' || p.role === 'crown_senator')
  );
}

export function senateSeats(state: GovState): number {
  return activeSenators(state).length;
}

export function senateTotal(state: GovState): number {
  return state.parliament.senateTotal;
}

// ── Court ──────────────────────────────────────────

export function activeJustices(state: GovState): Person[] {
  return personsByRole(state, 'justice');
}

export function justiceCount(state: GovState): number {
  return activeJustices(state).length;
}

export function courtHasQuorum(state: GovState): boolean {
  return justiceCount(state) >= 7;  // PARAM_COURT_QUORUM = 7 (matches Solidity contracts)
}

export function courtInCrisis(state: GovState): boolean {
  return !courtHasQuorum(state);
}

// ── Executive ──────────────────────────────────────

export function activePM(state: GovState): Person | undefined {
  return personsByRole(state, 'prime_minister')[0];
}

export function activeDeputyPM(state: GovState): Person | undefined {
  return personsByRole(state, 'deputy_pm')[0];
}

export function activeMinisters(state: GovState): Person[] {
  return personsByRole(state, 'minister');
}

export function ministerCount(state: GovState): number {
  return activeMinisters(state).length;
}

// ── Crown ──────────────────────────────────────────

export function activeMonarch(state: GovState): Person | undefined {
  return personsByRole(state, 'monarch')[0];
}

export function activeHeirs(state: GovState): Person[] {
  return personsByRole(state, 'heir');
}

export function heirCount(state: GovState): number {
  return activeHeirs(state).length;
}

// ── Provincial ─────────────────────────────────────

export function provincialCouncilMembers(state: GovState, provinceId: ProvinceId): Person[] {
  return state.people.filter(
    (p) => p.status === 'active' && p.role === 'provincial_council' && p.provinceId === provinceId
  );
}

// ── Derived state recalculation ────────────────────

/**
 * Recalculate all derived counts on the GovState from the people array.
 * Call this after any mutation to the people array.
 */
export function recalculateDerived(state: GovState): GovState {
  const monarch = activeMonarch(state);
  const pm = activePM(state);
  const deputyPm = activeDeputyPM(state);
  const mSeats = majlisSeats(state);
  const sSeats = senateSeats(state);
  const jCount = justiceCount(state);
  const mCount = ministerCount(state);
  const hCount = heirCount(state);

  return {
    ...state,
    crown: {
      ...state.crown,
      monarch: monarch ? `${monarch.firstName} ${monarch.lastName}` : '(Vacant)',
      monarchId: monarch?.id ?? null,
      heirs: hCount,
      successionList: state.crown.successionList.filter((id) => {
        const p = state.people.find((pp) => pp.id === id);
        return p && p.status === 'active' && p.role === 'heir';
      }),
    },
    parliament: {
      ...state.parliament,
      majlisSeats: mSeats,
      senateSeats: sSeats,
      quorum: majlisHasQuorum(state),
    },
    executive: {
      ...state.executive,
      pmId: pm?.id ?? null,
      deputyPmId: deputyPm?.id ?? null,
      pmSeated: !!pm,
      ministers: mCount,
      stage: state.executive.formation.stage === 'Idle'
        ? 'Idle' as const
        : state.executive.formation.stage,
    },
    court: {
      ...state.court,
      justices: jCount,
      crisis: !courtHasQuorum(state),
      pendingAppointment: state.court.appointments.length > 0
        ? state.court.appointments[0].seatNumber
        : null,
    },
    elections: {
      ...state.elections,
      active: state.elections.processes.filter((e) => e.phase !== 'seated').length,
      byElectionsPending: state.elections.processes.filter(
        (e) => (e.electionType === 'majlis_byelection' || e.electionType === 'senate_byelection')
          && e.phase !== 'seated'
      ).length,
    },
  };
}
