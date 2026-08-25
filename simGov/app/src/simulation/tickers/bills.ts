import type { GovState, Bill, GovEvent } from '../types';
import { seededRandom } from '../engine';

function isTerminal(stage: string): boolean {
  return ['Enacted', 'Rejected', 'Vetoed'].includes(stage);
}

/** Resolve a bill that has hit its deadline. */
function resolveBillDeadline(bill: Bill, events: GovEvent[], day: number, majlisTotal: number): Bill {
  switch (bill.stage) {
    case 'Introduced': {
      events.push({
        day,
        marker: 'parl',
        description: `${bill.name} placed on Majlis agenda for voting`,
        call: `Parliament.advanceToVoting(billId: ${bill.id})`,
      });
      return { ...bill, stage: 'Majlis Voting', deadline: day + 14 };
    }

    case 'Majlis Voting': {
      const passed = bill.majlisYes > bill.majlisNo && bill.majlisYes >= 72;
      if (passed) {
        events.push({
          day,
          marker: 'parl',
          description: `${bill.name} passed the Majlis (${bill.majlisYes}-${bill.majlisNo})`,
          call: `Parliament.tallyMajlis(billId: ${bill.id}) → passed (${bill.majlisYes} yes, ${bill.majlisNo} no)`,
        });
        return { ...bill, stage: 'Senate Review', deadline: day + 18 };
      } else {
        events.push({
          day,
          marker: 'parl',
          description: `${bill.name} rejected by the Majlis (${bill.majlisYes}-${bill.majlisNo})`,
          call: `Parliament.tallyMajlis(billId: ${bill.id}) → rejected`,
        });
        return { ...bill, stage: 'Rejected' };
      }
    }

    case 'Senate Review': {
      const passed = bill.senateYes > bill.senateNo;
      if (passed) {
        events.push({
          day,
          marker: 'parl',
          description: `Senate approved ${bill.name} (${bill.senateYes}-${bill.senateNo})`,
          call: `Parliament.tallySenate(billId: ${bill.id}) → approved`,
        });
        return { ...bill, stage: 'Crown Action', deadline: day + 14 };
      } else {
        events.push({
          day,
          marker: 'parl',
          description: `Senate objected to ${bill.name}`,
          call: `Parliament.tallySenate(billId: ${bill.id}) → objected`,
        });
        return { ...bill, stage: 'Senate Objected', deadline: day + 14 };
      }
    }

    case 'Crown Action': {
      events.push({
        day,
        marker: 'crown',
        description: `Crown deadline expired for ${bill.name}; enacted automatically`,
        call: `Crown.claimCrownTimeout(billId: ${bill.id}) → Parliament.markEnacted(${bill.id})`,
      });
      return { ...bill, stage: 'Enacted' };
    }

    case 'Senate Objected': {
      const threshold = Math.ceil(majlisTotal * 2 / 3);
      if (bill.majlisYes >= threshold) {
        events.push({
          day,
          marker: 'parl',
          description: `Majlis overrode Senate objection on ${bill.name} (${bill.majlisYes} votes)`,
          call: `Parliament.majlisOverride(billId: ${bill.id}) → override succeeded`,
        });
        return { ...bill, stage: 'Crown Action', deadline: day + 14 };
      } else {
        events.push({
          day,
          marker: 'parl',
          description: `Majlis failed to override Senate objection on ${bill.name}`,
          call: `Parliament.majlisOverride(billId: ${bill.id}) → override failed`,
        });
        return { ...bill, stage: 'Rejected' };
      }
    }

    case 'Returned': {
      events.push({
        day,
        marker: 'parl',
        description: `Majlis begins revote on ${bill.name} after Crown return`,
        call: `Parliament.beginRevote(billId: ${bill.id}) → Majlis Revote`,
      });
      return { ...bill, stage: 'Majlis Revote', majlisYes: 0, majlisNo: 0, deadline: day + 14 };
    }

    case 'Majlis Revote': {
      const passed = bill.majlisYes > bill.majlisNo && bill.majlisYes >= 72;
      if (passed) {
        events.push({
          day,
          marker: 'parl',
          description: `Majlis re-adopted ${bill.name} (${bill.majlisYes}-${bill.majlisNo}); sent back to Crown`,
          call: `Parliament.majlisRevote(billId: ${bill.id}) → passed (${bill.majlisYes} yes, ${bill.majlisNo} no)`,
        });
        return { ...bill, stage: 'Crown Action', deadline: day + 14 };
      } else {
        events.push({
          day,
          marker: 'parl',
          description: `Majlis dropped ${bill.name} after Crown return (${bill.majlisYes}-${bill.majlisNo})`,
          call: `Parliament.majlisRevote(billId: ${bill.id}) → rejected`,
        });
        return { ...bill, stage: 'Rejected' };
      }
    }

    case 'Referred': {
      const upheld = seededRandom(day * 777 + bill.id) > 0.4;
      if (upheld) {
        events.push({
          day,
          marker: 'court',
          description: `Supreme Court upheld ${bill.name}; enacted into law`,
          call: `SupremeCourt.ruling(billId: ${bill.id}) → constitutional, enacted`,
        });
        return { ...bill, stage: 'Enacted' };
      } else {
        events.push({
          day,
          marker: 'court',
          description: `Supreme Court struck down ${bill.name} as unconstitutional`,
          call: `SupremeCourt.ruling(billId: ${bill.id}) → unconstitutional, vetoed`,
        });
        return { ...bill, stage: 'Vetoed' };
      }
    }

    default:
      return bill;
  }
}

/** Tick bills: check deadlines, accumulate votes. */
export function tickBills(state: GovState, day: number): { bills: GovState['bills']; events: GovEvent[]; reviewsResolved: number } {
  const events: GovEvent[] = [];
  const majlisSeats = state.parliament.majlisSeats;
  const senateSeats = state.parliament.senateSeats;
  const majlisTotal = state.parliament.majlisTotal;
  let reviewsResolved = 0;

  let bills = state.bills.map((bill) => {
    if (bill.deadline <= day && !isTerminal(bill.stage)) {
      const wasReferred = bill.stage === 'Referred';
      const resolved = resolveBillDeadline(bill, events, day, majlisTotal);
      if (wasReferred && isTerminal(resolved.stage)) {
        reviewsResolved++;
      }
      return resolved;
    }
    return bill;
  });

  // Vote accumulation
  bills = bills.map((bill) => {
    if ((bill.stage === 'Majlis Voting' || bill.stage === 'Majlis Revote') && day < bill.deadline) {
      const yesAdd = Math.floor(seededRandom(day * 100 + bill.id) * 8) + 3;
      const noAdd = Math.floor(seededRandom(day * 100 + bill.id + 50) * 4) + 1;
      const newYes = Math.min(bill.majlisYes + yesAdd, majlisSeats);
      const newNo = Math.min(bill.majlisNo + noAdd, majlisSeats - newYes);
      return { ...bill, majlisYes: newYes, majlisNo: newNo };
    }
    if (bill.stage === 'Senate Review' && day < bill.deadline) {
      const yesAdd = Math.floor(seededRandom(day * 200 + bill.id) * 5) + 2;
      const noAdd = Math.floor(seededRandom(day * 200 + bill.id + 50) * 2);
      const newYes = Math.min(bill.senateYes + yesAdd, senateSeats);
      const newNo = Math.min(bill.senateNo + noAdd, senateSeats - newYes);
      return { ...bill, senateYes: newYes, senateNo: newNo };
    }
    return bill;
  });

  return { bills, events, reviewsResolved };
}
