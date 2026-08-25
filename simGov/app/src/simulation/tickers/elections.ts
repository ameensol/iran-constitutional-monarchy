import type { GovState, GovEvent, ElectionProcess } from '../types';
import { seededRandom } from '../engine';
import { PARTY_NAMES } from '../nameGen';

/** Advance election process phases. */
export function tickElections(state: GovState, day: number): { state: GovState; events: GovEvent[] } {
  const events: GovEvent[] = [];
  let processes = state.elections.processes;
  let people = state.people;
  let nextScheduled = state.elections.nextScheduled;

  // Tick down general election countdown
  if (nextScheduled > 0) {
    nextScheduled--;
    if (nextScheduled === 0) {
      events.push({
        day,
        marker: 'election',
        description: 'Scheduled election has begun',
        call: `Election.startMajlis(day: ${day}) → registration open`,
      });
      const newId = Math.max(0, ...processes.map((e) => e.id), 0) + 1;
      processes = [
        ...processes,
        {
          id: newId,
          electionType: 'majlis_general',
          phase: 'registration',
          startDay: day,
          phaseDeadline: day + 14,
          seatsContested: state.parliament.majlisTotal,
        },
      ];
      nextScheduled = 1460; // ~4 years
    }
  }

  // Advance each active election process
  processes = processes.map((proc) => {
    if (proc.phase === 'seated') return proc;
    if (day < proc.phaseDeadline) return proc;

    switch (proc.phase) {
      case 'registration': {
        events.push({
          day,
          marker: 'election',
          description: `${formatElectionType(proc)} voting has begun`,
          call: `Election.startVoting(electionId: ${proc.id})`,
        });
        return { ...proc, phase: 'voting' as const, phaseDeadline: day + 7 };
      }
      case 'voting': {
        events.push({
          day,
          marker: 'election',
          description: `${formatElectionType(proc)} votes tallied`,
          call: `Election.tally(electionId: ${proc.id}) → ${proc.seatsContested} seats contested`,
        });
        return { ...proc, phase: 'tallied' as const, phaseDeadline: day + 3 };
      }
      case 'tallied': {
        events.push({
          day,
          marker: 'election',
          description: `${formatElectionType(proc)} winners seated`,
          call: `Election.seat(electionId: ${proc.id}) → ${proc.seatsContested} seats filled`,
        });

        // Check if the player voted in this election
        const playerVote = state.playerVotes.find((v) => v.electionId === proc.id);
        const playerProvince = state.player?.provinceId;
        const coversPlayerProvince = proc.electionType === 'majlis_general'
          || (proc.electionType === 'provincial' && proc.provinceId === playerProvince);

        // Seat new people for by-elections
        if (proc.electionType === 'majlis_byelection' || proc.electionType === 'senate_byelection') {
          const role = proc.electionType === 'majlis_byelection' ? 'majlis_member' : 'senator';
          // Find a vacant person of this role in this province and reactivate
          const vacant = people.find(
            (p) => p.role === role && p.status !== 'active' && p.provinceId === proc.provinceId
          );
          if (vacant) {
            const party = PARTY_NAMES[Math.floor(seededRandom(day * 500 + proc.id) * PARTY_NAMES.length)];
            people = people.map((p) =>
              p.id === vacant.id
                ? { ...p, status: 'active' as const, party, seatedDay: day, termEnd: day + (role === 'majlis_member' ? 1460 : 2190) }
                : p
            );
          }
        } else if (proc.electionType === 'majlis_general') {
          // Reactivate all removed majlis members
          // Player's vote influences their province's party outcome
          people = people.map((p) => {
            if (p.role === 'majlis_member' && p.status === 'removed') {
              let party: string;
              if (playerVote && coversPlayerProvince && p.provinceId === playerProvince) {
                party = playerVote.party;
              } else {
                party = PARTY_NAMES[Math.floor(seededRandom(day * 600 + p.id) * PARTY_NAMES.length)];
              }
              return { ...p, status: 'active' as const, party, seatedDay: day, termEnd: day + 1460 };
            }
            return p;
          });
        }

        // Generate results with player influence
        let winningParty: string;
        if (playerVote && coversPlayerProvince) {
          winningParty = playerVote.party;
        } else {
          winningParty = PARTY_NAMES[Math.floor(seededRandom(day * 700 + proc.id) * PARTY_NAMES.length)];
        }
        const turnout = 0.55 + seededRandom(proc.id * 7) * 0.25;

        return {
          ...proc,
          phase: 'seated' as const,
          phaseDeadline: day,
          results: { turnout, winningParty },
        };
      }
      default:
        return proc;
    }
  });

  // Clean up seated elections older than 30 days
  processes = processes.filter((p) => p.phase !== 'seated' || day - p.phaseDeadline < 30);

  return {
    state: {
      ...state,
      people,
      elections: {
        ...state.elections,
        processes,
        nextScheduled,
      },
    },
    events,
  };
}

function formatElectionType(proc: ElectionProcess): string {
  switch (proc.electionType) {
    case 'majlis_general': return 'Majlis general election';
    case 'senate': return 'Senate election';
    case 'provincial': return 'Provincial council election';
    case 'majlis_byelection': return 'Majlis by-election';
    case 'senate_byelection': return 'Senate by-election';
  }
}
