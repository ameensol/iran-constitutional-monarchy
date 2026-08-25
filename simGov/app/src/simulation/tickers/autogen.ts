import type { GovState, Bill, GovEvent } from '../types';
import { seededRandom } from '../engine';

const billNames = [
  'Healthcare Modernization Act',
  'Digital Infrastructure Bill',
  'Environmental Protection Act',
  'Agricultural Reform Bill',
  'National Education Standards',
  'Tax Reform Act',
  'Transportation Improvement Bill',
  'Water Resource Management Act',
  'Cultural Heritage Protection Bill',
  'Energy Independence Act',
  'Housing Development Bill',
  'Labor Rights Reform Act',
  'Telecommunications Modernization',
  'Anti-Corruption Standards Act',
  'Veterans Benefits Bill',
  'Technology Innovation Fund',
  'Provincial Development Act',
  'Women\'s Rights Protection Bill',
  'Foreign Trade Agreement',
  'National Parks Conservation Act',
];

const sponsors = ['citizen5', 'citizen6', 'citizen7', 'citizen8', 'citizen9'];

function isTerminal(stage: string): boolean {
  return ['Enacted', 'Rejected', 'Vetoed'].includes(stage);
}

/** Periodically auto-generate new bills. */
export function tickAutoGenerate(state: GovState, day: number): { bills: Bill[]; events: GovEvent[] } {
  const events: GovEvent[] = [];
  let bills = state.bills;

  const activeBills = bills.filter((b) => !isTerminal(b.stage));
  if (activeBills.length < 4 && day % 15 === 0 && !state.parliament.dissolved) {
    const usedNames = new Set(bills.map((b) => b.name));
    const available = billNames.filter((n) => !usedNames.has(n));
    if (available.length > 0) {
      const nameIdx = Math.floor(seededRandom(day * 999) * available.length);
      const sponsorIdx = Math.floor(seededRandom(day * 998) * sponsors.length);
      const newId = Math.max(0, ...bills.map((b) => b.id)) + 1;
      const newBill: Bill = {
        id: newId,
        name: available[nameIdx],
        sponsor: sponsors[sponsorIdx],
        submittedDay: day,
        stage: 'Majlis Voting',
        majlisYes: 0,
        majlisNo: 0,
        senateYes: 0,
        senateNo: 0,
        deadline: day + 14,
        crownReturned: false,
      };
      bills = [...bills, newBill];
      events.push({
        day,
        marker: 'parl',
        description: `${newBill.name} submitted to the Majlis`,
        call: `Parliament.submitBill(billId: ${newId}, name: "${newBill.name}", sponsor: ${newBill.sponsor})`,
      });
    }
  }

  return { bills, events };
}
