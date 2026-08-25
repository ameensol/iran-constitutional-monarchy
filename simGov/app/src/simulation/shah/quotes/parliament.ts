import type { CommentaryEntry } from '../types';

export const PARLIAMENT_QUOTES: CommentaryEntry[] = [
  // bill_submit
  {
    id: 'bill_submit_1',
    text: 'A new bill enters the Majlis. This is the heartbeat of democracy: someone saw a problem and proposed a solution through proper channels.',
    category: 'bill_submit',
    mood: 'hopeful',
  },
  {
    id: 'bill_submit_2',
    text: 'The first Majlis convened in 1906, barely a year after the Constitutional Revolution. Iranians have been submitting bills and debating them for over a century.',
    category: 'bill_submit',
    mood: 'teaching',
  },
  {
    id: 'bill_submit_3',
    text: 'Every great reform in Iran began as a piece of paper someone was brave enough to put before Parliament. The White Revolution started this way.',
    category: 'bill_submit',
    mood: 'teaching',
  },
  {
    id: 'bill_submit_4',
    text: 'Let the debate begin. I would rather hear a hundred bad proposals debated openly than one good idea imposed by decree.',
    category: 'bill_submit',
    mood: 'hopeful',
  },
  {
    id: 'bill_submit_5',
    text: 'The sponsor has put their name to this legislation. In a transparent system, accountability begins at the moment of introduction.',
    category: 'bill_submit',
    mood: 'teaching',
  },
  {
    id: 'bill_submit_6',
    text: 'Mossadegh submitted his oil nationalization bill in 1951. Parliament can change the course of history with a single piece of legislation.',
    category: 'bill_submit',
    mood: 'teaching',
  },
  {
    id: 'bill_submit_7',
    text: 'Another bill for the people to consider through their representatives. The machinery of governance turns one proposal at a time.',
    category: 'bill_submit',
    mood: 'hopeful',
  },

  // majlis_pass
  {
    id: 'majlis_pass_1',
    text: 'The Majlis has spoken. A majority of the people\'s elected representatives found merit in this legislation.',
    category: 'majlis_pass',
    mood: 'proud',
  },
  {
    id: 'majlis_pass_2',
    text: 'When the Majlis passes a bill, it carries the weight of popular will. The Senate now reviews it with the longer view of provincial and institutional interests.',
    category: 'majlis_pass',
    mood: 'teaching',
  },
  {
    id: 'majlis_pass_3',
    text: 'A bill through the Majlis is a bill halfway to law. The process is working as our framers intended.',
    category: 'majlis_pass',
    mood: 'proud',
  },
  {
    id: 'majlis_pass_4',
    text: 'The lower house passes legislation because it represents the immediate voice of the citizenry. Speed tempered by the Senate\'s deliberation: that is bicameralism.',
    category: 'majlis_pass',
    mood: 'teaching',
  },
  {
    id: 'majlis_pass_5',
    text: 'My people\'s representatives have weighed this bill and found it worthy. Now let the Senate add their wisdom.',
    category: 'majlis_pass',
    mood: 'proud',
  },
  {
    id: 'majlis_pass_6',
    text: 'Each yes vote recorded on the blockchain is a permanent record. No one can later claim they did not support this, or that they did. Transparency protects everyone.',
    category: 'majlis_pass',
    mood: 'teaching',
  },
  {
    id: 'majlis_pass_7',
    text: 'The bill advances to the Senate. In the old days, vote tallies could be disputed. On-chain, the count is final and visible to every citizen.',
    category: 'majlis_pass',
    mood: 'hopeful',
  },

  // majlis_reject
  {
    id: 'majlis_reject_1',
    text: 'The Majlis rejected this bill. That is not failure; it is the system working. Bad legislation should die in committee, not become law.',
    category: 'majlis_reject',
    mood: 'teaching',
  },
  {
    id: 'majlis_reject_2',
    text: 'A rejected bill is a lesson. The sponsor can revise it, gather more support, and try again. Democracy is iterative.',
    category: 'majlis_reject',
    mood: 'teaching',
  },
  {
    id: 'majlis_reject_3',
    text: 'I have seen parliaments that rubber-stamp everything placed before them. A Majlis that rejects bad bills is a healthy Majlis.',
    category: 'majlis_reject',
    mood: 'teaching',
  },
  {
    id: 'majlis_reject_4',
    text: 'The people\'s representatives said no. In a constitutional system, that word carries absolute authority at this stage.',
    category: 'majlis_reject',
    mood: 'concerned',
  },
  {
    id: 'majlis_reject_5',
    text: 'Rejection stings, but it is infinitely preferable to a parliament that cannot say no. The Majlis guards the gate.',
    category: 'majlis_reject',
    mood: 'teaching',
  },
  {
    id: 'majlis_reject_6',
    text: 'Let the record show: the Majlis weighed this proposal and found it wanting. The sponsor may return with something stronger.',
    category: 'majlis_reject',
    mood: 'hopeful',
  },

  // senate_approve
  {
    id: 'senate_approve_1',
    text: 'The Senate concurs. Both chambers have spoken, and the bill moves to the Crown for final action.',
    category: 'senate_approve',
    mood: 'proud',
  },
  {
    id: 'senate_approve_2',
    text: 'Senate approval means provincial voices have endorsed what the national representatives proposed. The whole country is behind this legislation.',
    category: 'senate_approve',
    mood: 'proud',
  },
  {
    id: 'senate_approve_3',
    text: 'The Senate exists to provide a check, a cooler head. When it approves swiftly, it signals broad consensus across regions and institutions.',
    category: 'senate_approve',
    mood: 'teaching',
  },
  {
    id: 'senate_approve_4',
    text: 'Two chambers, one voice. The bicameral system has produced agreement, and the legislation is stronger for having survived both gauntlets.',
    category: 'senate_approve',
    mood: 'proud',
  },
  {
    id: 'senate_approve_5',
    text: 'From the provincial councils to the Senate floor, these senators carry the concerns of every corner of Iran. Their approval matters.',
    category: 'senate_approve',
    mood: 'proud',
  },
  {
    id: 'senate_approve_6',
    text: 'The bill now awaits royal assent. The legislative journey from introduction to this moment has been transparent at every step.',
    category: 'senate_approve',
    mood: 'hopeful',
  },

  // senate_object
  {
    id: 'senate_object_1',
    text: 'The Senate has objected. This is precisely why we have a second chamber: to catch what the first may have missed.',
    category: 'senate_object',
    mood: 'concerned',
  },
  {
    id: 'senate_object_2',
    text: 'A Senate objection sends the bill back to the Majlis for reconsideration. The process forces dialogue between the chambers.',
    category: 'senate_object',
    mood: 'teaching',
  },
  {
    id: 'senate_object_3',
    text: 'When senators from Khuzestan or Azerbaijan object, they speak for communities whose voices might otherwise be drowned out by Tehran. This is the Senate\'s purpose.',
    category: 'senate_object',
    mood: 'teaching',
  },
  {
    id: 'senate_object_4',
    text: 'The Majlis may override this objection with a supermajority. The constitution gives the lower house the final word, but requires a higher bar.',
    category: 'senate_object',
    mood: 'teaching',
  },
  {
    id: 'senate_object_5',
    text: 'I respect the Senate\'s caution. Provincial representatives see consequences that national politicians sometimes overlook.',
    category: 'senate_object',
    mood: 'concerned',
  },

  // parl_dissolve
  {
    id: 'parl_dissolve_1',
    text: 'Parliament dissolved. This is the most drastic constitutional tool available to the Crown, and I do not invoke it lightly.',
    category: 'parl_dissolve',
    mood: 'alarmed',
  },
  {
    id: 'parl_dissolve_2',
    text: 'Dissolution means new elections within the constitutional timeframe. The people will choose new representatives, and I will respect their choice.',
    category: 'parl_dissolve',
    mood: 'concerned',
  },
  {
    id: 'parl_dissolve_3',
    text: 'My father dissolved the Majlis more than once. I learned from him that dissolution is a reset, sometimes necessary, always costly.',
    category: 'parl_dissolve',
    mood: 'teaching',
  },
  {
    id: 'parl_dissolve_4',
    text: 'Every pending bill dies with dissolution. The legislative slate is wiped clean. New members will bring new priorities.',
    category: 'parl_dissolve',
    mood: 'concerned',
  },
  {
    id: 'parl_dissolve_5',
    text: 'The constitution limits how often dissolution can occur. Without that limit, a monarch could repeatedly dissolve parliament until getting a compliant one.',
    category: 'parl_dissolve',
    mood: 'teaching',
  },

  // majlis_override
  {
    id: 'majlis_override_1',
    text: 'The Majlis has overridden the Senate\'s objection with a supermajority. The people\'s house has the final legislative word, as it should in a democracy.',
    category: 'majlis_override',
    mood: 'teaching',
  },
  {
    id: 'majlis_override_2',
    text: 'A two-thirds vote to override is a high bar. When the Majlis clears it, the strength of conviction behind this legislation is undeniable.',
    category: 'majlis_override',
    mood: 'proud',
  },
  {
    id: 'majlis_override_3',
    text: 'Override is a blunt instrument. It tells the Senate: we heard your concerns and we remain convinced. The bill proceeds.',
    category: 'majlis_override',
    mood: 'teaching',
  },
  {
    id: 'majlis_override_4',
    text: 'The framers gave the Majlis override power because in the end, the chamber closest to the people must prevail.',
    category: 'majlis_override',
    mood: 'teaching',
  },

  // quorum_lost
  {
    id: 'quorum_lost_1',
    text: 'Quorum lost. Parliament cannot function when too many seats sit empty. This is a crisis of representation.',
    category: 'quorum_lost',
    mood: 'alarmed',
  },
  {
    id: 'quorum_lost_2',
    text: 'Without quorum, no bills can advance, no votes can be held. The legislative branch is paralyzed.',
    category: 'quorum_lost',
    mood: 'alarmed',
  },
  {
    id: 'quorum_lost_3',
    text: 'By-elections must be called immediately. The people of those empty constituencies deserve representation.',
    category: 'quorum_lost',
    mood: 'concerned',
  },
  {
    id: 'quorum_lost_4',
    text: 'A parliament below quorum is a warning sign. Something has gone very wrong, whether through tragedy, crisis, or political failure.',
    category: 'quorum_lost',
    mood: 'alarmed',
  },
  {
    id: 'quorum_lost_5',
    text: 'I have seen governments ground to a halt because legislators could not assemble. The damage compounds with every day the chamber sits dark.',
    category: 'quorum_lost',
    mood: 'concerned',
  },

  // Additional bill_submit
  {
    id: 'bill_submit_8',
    text: 'A bill is a seed. Most seeds do not grow into trees, and most bills do not become law. The important thing is that every seed gets its chance in the soil of debate.',
    category: 'bill_submit',
    mood: 'teaching',
  },

  // Additional majlis_pass
  {
    id: 'majlis_pass_8',
    text: 'I have watched the Majlis pass laws that transformed Iran: land reform, literacy corps, women\'s suffrage. The lower house has always been the engine of change.',
    category: 'majlis_pass',
    mood: 'proud',
  },

  // Additional senate_approve
  {
    id: 'senate_approve_7',
    text: 'The Senate\'s approval reflects the mature deliberation of representatives chosen through provincial councils. Their perspective is longer and broader than the Majlis alone.',
    category: 'senate_approve',
    mood: 'teaching',
  },

  // Additional senate_object
  {
    id: 'senate_object_6',
    text: 'A Senate objection is an act of institutional courage. The senators are telling the larger chamber: you have overlooked something important.',
    category: 'senate_object',
    mood: 'teaching',
  },

  // Additional parl_dissolve
  {
    id: 'parl_dissolve_6',
    text: 'When I dissolved Parliament, it was because the nation needed a fresh mandate from the people. Dissolution is a reset, not a punishment.',
    category: 'parl_dissolve',
    mood: 'teaching',
  },

  // Additional majlis_override
  {
    id: 'majlis_override_5',
    text: 'The Majlis has spoken with a voice loud enough to override the Senate. When the people\'s house musters a supermajority, the conviction behind that vote is clear.',
    category: 'majlis_override',
    mood: 'proud',
  },

  // Additional quorum_lost
  {
    id: 'quorum_lost_6',
    text: 'Empty seats in Parliament are empty voices. Each vacant constituency is a community that has lost its say in how the nation is governed.',
    category: 'quorum_lost',
    mood: 'mourning',
  },

  // Additional majlis_reject
  {
    id: 'majlis_reject_7',
    text: 'The Majlis showed its teeth today. A parliament that only says yes is a parliament that has forgotten its purpose.',
    category: 'majlis_reject',
    mood: 'teaching',
  },

  // Additional bill_submit
  {
    id: 'bill_submit_9',
    text: 'The bill is registered on-chain the moment it is submitted. Its entire journey through the legislative process will be visible and auditable.',
    category: 'bill_submit',
    mood: 'proud',
  },

  // Additional senate_object
  {
    id: 'senate_object_7',
    text: 'The upper chamber serves as a cooling saucer for legislation that may have been passed in haste. The Senate\'s objection slows the process, and sometimes slowness is wisdom.',
    category: 'senate_object',
    mood: 'teaching',
  },
];
