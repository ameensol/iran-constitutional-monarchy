import type { TutorialEntry } from './types';

export const TUTORIALS: TutorialEntry[] = [
  {
    id: 'tut_crown',
    trigger: 'first_crown_click',
    text: 'The Crown in a constitutional monarchy is not a ruler with unchecked power. The monarch serves as a guardian of the constitution, a symbol of national unity, and a failsafe when institutions deadlock. Every Crown action here is bounded by deadlines and can be enforced by any citizen.',
  },
  {
    id: 'tut_parliament',
    trigger: 'first_parliament_click',
    text: 'Parliament is bicameral: the Majlis (lower house) represents the people directly, while the Senate ensures regional voices and elder wisdom temper populist impulses. A bill must pass both chambers before reaching the Crown.',
  },
  {
    id: 'tut_executive',
    trigger: 'first_executive_click',
    text: 'The Prime Minister governs with the confidence of Parliament, not by royal appointment. If the Majlis withdraws confidence, the PM must resign. The Crown nominates but cannot impose: this is the constitutional bargain.',
  },
  {
    id: 'tut_court',
    trigger: 'first_court_click',
    text: 'The Supreme Court is the guardian of the constitution. It reviews laws for constitutionality, and its rulings cannot be overridden by Parliament or Crown. Twelve justices serve for life, and appointments require both Crown nomination and Senate approval.',
  },
  {
    id: 'tut_elections',
    trigger: 'first_elections_click',
    text: 'Elections are the heartbeat of democratic governance. Every vote is counted on-chain, transparent and verifiable. General elections occur every four years; by-elections fill individual vacancies within 90 days.',
  },
  {
    id: 'tut_budget',
    trigger: 'first_budget_click',
    text: 'The budget is proposed by the Prime Minister, debated and approved by Parliament, and every rial is tracked on-chain. The Majlis has the power of the purse: no money can be spent without their authorization.',
  },
  {
    id: 'tut_bill_lifecycle',
    trigger: 'first_bill_click',
    text: 'A bill follows a constitutional path: introduction in the Majlis, committee debate, floor vote, Senate review, and Crown action. At each stage, deadlines prevent bottlenecks. If the Crown does nothing for 14 days, the bill is enacted automatically.',
  },
  {
    id: 'tut_disasters',
    trigger: 'first_disaster_click',
    text: 'Disasters test whether a constitution can survive its worst day. Can the system recover when the monarch is killed? When Parliament loses quorum? When the court is decimated? This is why we encode governance in code: so the rules hold when people fail.',
  },
  {
    id: 'tut_person',
    trigger: 'first_person_click',
    text: 'Every dot in the seating chart is a person with a name, a province, and a role. You can remove anyone from office, and the constitutional machinery will respond: by-elections, successions, appointment pipelines. The system must survive the loss of any individual.',
  },
  {
    id: 'tut_formation',
    trigger: 'first_formation_view',
    text: 'When the PM position is vacant, a structured formation process begins. The Crown gets two chances to nominate, then the Majlis presents candidates, then the Crown picks from the list. If all attempts fail, Parliament is dissolved for new elections. No deadlock can last forever.',
  },
  {
    id: 'tut_quorum',
    trigger: 'first_quorum_lost',
    text: 'Quorum means enough members are present to make legitimate decisions. When the Majlis falls below half its members, legislation freezes. When the court falls below eight justices, rulings stop. The system protects against decisions made by too few.',
  },
  {
    id: 'tut_speed',
    trigger: 'first_speed_change',
    text: 'Time in SimGov can run at five speeds. Pause to study the state. Step through day by day to watch individual events unfold. Or run at 100x to see years of governance compressed into minutes.',
  },
];
