import type { GovEvent, Headline, HeadlineCategory, EventMarker } from '../simulation/types';

/* ── Pattern → Headline mapping ──────────────────── */

interface PatternRule {
  pattern: RegExp;
  headline: (match: RegExpMatchArray) => { text: string; subtext?: string };
  category: HeadlineCategory;
  breaking: boolean;
}

const MARKER_TO_CATEGORY: Record<EventMarker, HeadlineCategory> = {
  crown: 'CROWN',
  parl: 'LEGISLATION',
  exec: 'EXECUTIVE',
  court: 'JUDICIARY',
  election: 'ELECTIONS',
  budget: 'BUDGET',
};

const rules: PatternRule[] = [
  // ── Disasters (check first — always breaking) ──
  {
    pattern: /^DISASTER: (.+)$/,
    headline: (m) => ({ text: m[1] }),
    category: 'CRISIS',
    breaking: true,
  },

  // ── Crown ──
  {
    pattern: /^The Crown signed (.+) into law$/,
    headline: (m) => ({ text: `${m[1]} Enacted Into Law`, subtext: 'Royal assent granted' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^The Crown returned (.+) to the Majlis/,
    headline: (m) => ({ text: `Crown Returns ${m[1]} to Majlis`, subtext: 'Objections raised' }),
    category: 'CROWN',
    breaking: false,
  },
  {
    pattern: /^Crown deadline expired for (.+); enacted automatically$/,
    headline: (m) => ({ text: `${m[1]} Enacted by Default`, subtext: 'Crown failed to act within 30 days' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Anyone enforced the Crown deadline for (.+); enacted automatically$/,
    headline: (m) => ({ text: `${m[1]} Enacted by Default`, subtext: 'Crown failed to act within 30 days' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Crown referred (.+) to Supreme Court/,
    headline: (m) => ({ text: `Crown Refers ${m[1]} to Court`, subtext: 'Constitutional review requested' }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Crown powers suspended$/,
    headline: () => ({ text: 'Crown Powers Suspended', subtext: 'Senate assumes emergency role' }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Crown powers resumed$/,
    headline: () => ({ text: 'Crown Powers Restored', subtext: 'Constitutional order returns' }),
    category: 'CROWN',
    breaking: true,
  },
  {
    pattern: /^Crown resumed: (.+) crowned as new monarch$/,
    headline: (m) => ({ text: `Long Live the Monarch: ${m[1]} Crowned`, subtext: 'Crown powers restored' }),
    category: 'CROWN',
    breaking: true,
  },
  {
    pattern: /^(.+) abdicated; (.+) crowned as successor$/,
    headline: (m) => ({ text: `${m[1]} Abdicates the Throne`, subtext: `${m[2]} crowned as successor` }),
    category: 'CROWN',
    breaking: true,
  },
  {
    pattern: /^(.+) abdicated; no heir available/,
    headline: (m) => ({ text: `${m[1]} Abdicates — No Heir`, subtext: 'Crown suspended' }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Crown nominated (.+) for Prime Minister$/,
    headline: (m) => ({ text: `Crown Nominates ${m[1]} for PM` }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^Crown appointed (.+) as Senator/,
    headline: (m) => ({ text: `${m[1]} Appointed to Senate`, subtext: 'Royal appointment' }),
    category: 'CROWN',
    breaking: false,
  },
  {
    pattern: /^No heirs available; Crown suspended$/,
    headline: () => ({ text: 'No Heir to the Throne', subtext: 'Crown suspended' }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Succession list updated/,
    headline: () => ({ text: 'Royal Succession Updated' }),
    category: 'CROWN',
    breaking: false,
  },

  // ── Monarch death / succession ──
  {
    pattern: /^Monarch (.+) has died$/,
    headline: (m) => ({ text: 'The Monarch Is Dead', subtext: `${m[1]} has passed` }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Monarch (.+) has resigned$/,
    headline: (m) => ({ text: `Monarch ${m[1]} Resigns` }),
    category: 'CROWN',
    breaking: true,
  },
  {
    pattern: /^Monarch (.+) has been incapacitated$/,
    headline: (m) => ({ text: `Monarch ${m[1]} Incapacitated`, subtext: 'Succession protocol activated' }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^(.+) crowned as new monarch$/,
    headline: (m) => ({ text: `Long Live the Monarch: ${m[1]} Crowned` }),
    category: 'CROWN',
    breaking: true,
  },
  {
    pattern: /^(.+) crowned as sovereign$/,
    headline: (m) => ({ text: `${m[1]} Crowned as Sovereign` }),
    category: 'CROWN',
    breaking: true,
  },

  // ── Parliament — Bills ──
  {
    pattern: /^(.+) passed the Majlis \((\d+)-(\d+)\)$/,
    headline: (m) => ({ text: `Majlis Passes ${m[1]}`, subtext: `${m[2]} in favor, ${m[3]} against` }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^(.+) rejected by the Majlis \((\d+)-(\d+)\)$/,
    headline: (m) => ({ text: `${m[1]} Fails in the Majlis`, subtext: `${m[2]}-${m[3]} — insufficient votes` }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Senate approved (.+) \((\d+)-(\d+)\)$/,
    headline: (m) => ({ text: `Senate Approves ${m[1]}`, subtext: `${m[2]}-${m[3]} — advances to Crown` }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Senate approved (.+); sent to the Crown$/,
    headline: (m) => ({ text: `Senate Approves ${m[1]}`, subtext: 'Advances to Crown' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Senate objected to (.+)/,
    headline: (m) => ({ text: `Senate Objects to ${m[1]}`, subtext: 'Returned to Majlis' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^(.+) submitted to the Majlis$/,
    headline: (m) => ({ text: `New Bill: ${m[1]}`, subtext: 'Submitted to the Majlis' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^(.+) placed on Majlis agenda for voting$/,
    headline: (m) => ({ text: `${m[1]} Up for Vote`, subtext: 'Majlis debate begins' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Majlis overrode Senate objection on (.+)/,
    headline: (m) => ({ text: `Majlis Overrides Senate on ${m[1]}`, subtext: 'Absolute majority achieved' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Majlis failed to override Senate objection on (.+)/,
    headline: (m) => ({ text: `Override Fails: ${m[1]} Rejected`, subtext: 'Senate objection stands' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Majlis begins revote on (.+)/,
    headline: (m) => ({ text: `${m[1]} Returns for Revote`, subtext: 'Crown objections under consideration' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Majlis re-adopted (.+)/,
    headline: (m) => ({ text: `Majlis Reaffirms ${m[1]}`, subtext: 'Sent back to Crown' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Majlis dropped (.+) after Crown return/,
    headline: (m) => ({ text: `Majlis Drops ${m[1]}`, subtext: 'Crown return accepted' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Parliament dissolved/,
    headline: () => ({ text: 'Parliament Dissolved', subtext: 'New elections within 60 days' }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Formation exhausted; Parliament dissolved/,
    headline: () => ({ text: 'Parliament Dissolved', subtext: 'Formation process exhausted' }),
    category: 'CRISIS',
    breaking: true,
  },

  // ── Executive ──
  {
    pattern: /^(.+) confirmed as Prime Minister/,
    headline: (m) => ({ text: `${m[1]} Becomes Prime Minister` }),
    category: 'EXECUTIVE',
    breaking: true,
  },
  {
    pattern: /^No-confidence passed.*: (.+) removed from office$/,
    headline: (m) => ({ text: `${m[1]} Ousted as Prime Minister`, subtext: 'No-confidence vote succeeds' }),
    category: 'EXECUTIVE',
    breaking: true,
  },
  {
    pattern: /^No-confidence motion failed/,
    headline: () => ({ text: 'PM Survives No-Confidence Vote', subtext: 'Retains Parliament\'s confidence' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^No-confidence motion filed/,
    headline: () => ({ text: 'No-Confidence Motion Filed', subtext: 'Parliament to vote' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^Parliament denied confidence \((.+) attempt\); (.+)$/,
    headline: (m) => ({ text: `Confidence Vote Fails (${m[1]})`, subtext: m[2] }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^Prime Minister (.+) has died$/,
    headline: (m) => ({ text: `Prime Minister ${m[1]} Dead` }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Prime Minister (.+) has resigned$/,
    headline: (m) => ({ text: `Prime Minister ${m[1]} Resigns` }),
    category: 'EXECUTIVE',
    breaking: true,
  },
  {
    pattern: /^Prime Minister (.+) has been incapacitated$/,
    headline: (m) => ({ text: `Prime Minister ${m[1]} Incapacitated` }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Deputy PM (.+) serving as caretaker$/,
    headline: (m) => ({ text: `${m[1]} Assumes Caretaker Role`, subtext: 'Deputy PM steps in' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^PM designated (.+) as Deputy Prime Minister$/,
    headline: (m) => ({ text: `${m[1]} Named Deputy PM` }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^Majlis presented candidate list/,
    headline: () => ({ text: 'Majlis Presents PM Candidate List', subtext: 'Crown to select' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^(Senate|Crown) picked (.+) from the Majlis list as Prime Minister$/,
    headline: (m) => ({ text: `${m[2]} Selected as PM from Majlis List`, subtext: `${m[1]} made the selection` }),
    category: 'EXECUTIVE',
    breaking: true,
  },
  {
    pattern: /^Senate initiated PM formation/,
    headline: () => ({ text: 'Senate Takes Over PM Formation', subtext: 'Crown suspended — Art. VI.5' }),
    category: 'EXECUTIVE',
    breaking: true,
  },
  // Formation timeouts
  {
    pattern: /nomination deadline expired/,
    headline: () => ({ text: 'PM Nomination Deadline Expires', subtext: 'Formation process advances' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /confidence vote expired/,
    headline: () => ({ text: 'Confidence Vote Deadline Expires', subtext: 'Formation process advances' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /Majlis list deadline expired/,
    headline: () => ({ text: 'Formation Deadline Expires', subtext: 'Final stage reached' }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  // Minister / Deputy changes
  {
    pattern: /^Deputy PM (.+) has (died|resigned|been incapacitated)$/,
    headline: (m) => ({ text: `Deputy PM ${m[1]} ${m[2] === 'died' ? 'Dead' : m[2] === 'resigned' ? 'Resigns' : 'Incapacitated'}` }),
    category: 'EXECUTIVE',
    breaking: false,
  },
  {
    pattern: /^Minister (.+) has (died|resigned|been incapacitated)/,
    headline: (m) => ({ text: `Minister ${m[1]} ${m[2] === 'died' ? 'Dead' : m[2] === 'resigned' ? 'Resigns' : 'Incapacitated'}` }),
    category: 'EXECUTIVE',
    breaking: false,
  },

  // ── Judiciary ──
  {
    pattern: /^Supreme Court upheld (.+); enacted into law$/,
    headline: (m) => ({ text: `Court Upholds ${m[1]}`, subtext: 'Constitutional — enacted into law' }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Supreme Court struck down (.+) as unconstitutional$/,
    headline: (m) => ({ text: `Court Strikes Down ${m[1]}`, subtext: 'Unconstitutional' }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Supreme Court lost quorum/,
    headline: () => ({ text: 'Supreme Court in Crisis: Quorum Lost' }),
    category: 'CRISIS',
    breaking: true,
  },
  {
    pattern: /^Supreme Court quorum restored/,
    headline: () => ({ text: 'Supreme Court Quorum Restored' }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Supreme Court ruled "(.+)" is (constitutional|unconstitutional)$/,
    headline: (m) => ({ text: `Court Rules: ${m[2] === 'constitutional' ? 'Constitutional' : 'Unconstitutional'}`, subtext: m[1] }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Supreme Court resolved dispute in favor of (.+)$/,
    headline: (m) => ({ text: `Court Rules for ${m[1]}`, subtext: 'Institutional dispute resolved' }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Justice Seat (\d+): (.+)$/,
    headline: (m) => ({ text: `Justice Seat ${m[1]}: ${m[2]}` }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Justice (.+) \(Seat \d+\) has (died|resigned|been incapacitated)/,
    headline: (m) => ({ text: `Justice ${m[1]} ${m[2] === 'died' ? 'Dead' : m[2] === 'resigned' ? 'Resigns' : 'Incapacitated'}`, subtext: 'Appointment pipeline started' }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /justice\(s?\) confirmed and seated/,
    headline: (m) => ({ text: m[0].charAt(0).toUpperCase() + m[0].slice(1) }),
    category: 'JUDICIARY',
    breaking: false,
  },
  // Dispute / review filing
  {
    pattern: /^(.+) filed constitutional review/,
    headline: (m) => ({ text: `Constitutional Review Filed`, subtext: `Petitioned by ${m[1]}` }),
    category: 'JUDICIARY',
    breaking: false,
  },
  {
    pattern: /^Dispute filed: (.+) vs\. (.+)/,
    headline: (m) => ({ text: `Institutional Dispute: ${m[1]} vs. ${m[2]}` }),
    category: 'JUDICIARY',
    breaking: false,
  },

  // ── Elections ──
  {
    pattern: /^(.+) election started$/,
    headline: (m) => ({ text: `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} Election Called` }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^(.+) voting has begun$/,
    headline: (m) => ({ text: `${m[1]} Voting Underway` }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^(.+) votes tallied$/,
    headline: (m) => ({ text: `${m[1]} Results In` }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^(.+) winners seated$/,
    headline: (m) => ({ text: `${m[1]} Representatives Seated` }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^Scheduled election has begun$/,
    headline: () => ({ text: 'Scheduled Election Begins' }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^General election opened/,
    headline: () => ({ text: 'General Election Called', subtext: 'Voting across all provinces' }),
    category: 'ELECTIONS',
    breaking: true,
  },
  {
    pattern: /by-election\(s?\) completed/,
    headline: () => ({ text: 'By-Elections Completed', subtext: 'New representatives seated' }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^Elections held:/,
    headline: () => ({ text: 'National Elections Held', subtext: 'Councils, Majlis, and Senate elected' }),
    category: 'ELECTIONS',
    breaking: true,
  },
  {
    pattern: /^Provincial council election opened in (.+)$/,
    headline: (m) => ({ text: `Provincial Election in ${m[1]}` }),
    category: 'ELECTIONS',
    breaking: false,
  },

  // ── Amendments / Referendums ──
  {
    pattern: /^Referendum approved: "(.+)" enacted$/,
    headline: (m) => ({ text: `The People Have Spoken: ${m[1]} Enacted`, subtext: 'Referendum approved' }),
    category: 'CONSTITUTIONAL',
    breaking: true,
  },
  {
    pattern: /^Referendum passed: amendment "(.+)" enacted/,
    headline: (m) => ({ text: `The People Have Spoken: ${m[1]} Enacted`, subtext: 'Referendum approved' }),
    category: 'CONSTITUTIONAL',
    breaking: true,
  },
  {
    pattern: /^Referendum (rejected|failed): .*"(.+)"$/,
    headline: (m) => ({ text: `Referendum Defeated: ${m[2]}`, subtext: 'The people have rejected the amendment' }),
    category: 'CONSTITUTIONAL',
    breaking: true,
  },
  {
    pattern: /^Amendment proposed: "(.+)"(.*)$/,
    headline: (m) => ({ text: `Amendment Proposed: ${m[1]}`, subtext: m[2]?.includes('EMERGENCY') ? 'Emergency procedure' : undefined }),
    category: 'CONSTITUTIONAL',
    breaking: false,
  },
  {
    pattern: /^Emergency amendment "(.+)" enacted by Parliament$/,
    headline: (m) => ({ text: `Emergency Amendment Enacted: ${m[1]}`, subtext: 'Parliament bypasses referendum' }),
    category: 'CONSTITUTIONAL',
    breaking: true,
  },
  {
    pattern: /^Amendment "(.+)" approved by Parliament; referendum called$/,
    headline: (m) => ({ text: `Referendum Called: ${m[1]}`, subtext: 'Parliament approves — the people will decide' }),
    category: 'CONSTITUTIONAL',
    breaking: false,
  },
  {
    pattern: /^Amendment "(.+)" rejected by Parliament$/,
    headline: (m) => ({ text: `Amendment Rejected: ${m[1]}`, subtext: 'Parliament votes against' }),
    category: 'CONSTITUTIONAL',
    breaking: false,
  },
  {
    pattern: /^Amendment "(.+)" placed before Parliament/,
    headline: (m) => ({ text: `Amendment Before Parliament: ${m[1]}` }),
    category: 'CONSTITUTIONAL',
    breaking: false,
  },

  // ── Budget ──
  {
    pattern: /^PM proposed FY (\d+) budget \((\d+) units\)$/,
    headline: (m) => ({ text: `FY ${m[1]} Budget Proposed`, subtext: `${m[2]} units — awaiting Parliament` }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Parliament approved FY (\d+) budget$/,
    headline: (m) => ({ text: `FY ${m[1]} Budget Approved` }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Parliament rejected FY (\d+) budget/,
    headline: (m) => ({ text: `FY ${m[1]} Budget Rejected` }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^FY (\d+) budget activated$/,
    headline: (m) => ({ text: `FY ${m[1]} Budget Now Active` }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Fiscal year (\d+) begins/,
    headline: (m) => ({ text: `New Fiscal Year: ${m[1]}`, subtext: 'PM must propose a budget' }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^No budget proposed.*prior year budget continues/,
    headline: () => ({ text: 'Budget Deadline Missed', subtext: 'Prior year budget continues' }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Parliament continued prior year budget/,
    headline: () => ({ text: 'Prior Year Budget Continues' }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Parliament approved supplementary budget/,
    headline: () => ({ text: 'Supplementary Budget Approved' }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Audit Head submitted.*: (clean|issues found)$/,
    headline: (m) => ({ text: `Audit Report: ${m[1] === 'clean' ? 'Clean Bill of Health' : 'Issues Found'}` }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Parliament appointed (.+) as Audit Head/,
    headline: (m) => ({ text: `${m[1]} Named Audit Head` }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Audit Head term expired/,
    headline: () => ({ text: 'Audit Head Term Expires' }),
    category: 'BUDGET',
    breaking: false,
  },
  {
    pattern: /^Executive allocated (\d+)% of budget/,
    headline: (m) => ({ text: `${m[1]}% of Budget Allocated` }),
    category: 'BUDGET',
    breaking: false,
  },

  // ── Petitions ──
  {
    pattern: /^Collective petition created: "(.+)"/,
    headline: (m) => ({ text: `Petition Launched: ${m[1]}` }),
    category: 'CONSTITUTIONAL',
    breaking: false,
  },
  {
    pattern: /petition "(.+)" reached .+ signatures/,
    headline: (m) => ({ text: `Petition Succeeds: ${m[1]}`, subtext: 'Threshold reached' }),
    category: 'CONSTITUTIONAL',
    breaking: false,
  },

  // ── People (Majlis, Senate, Council, Heir) ──
  {
    pattern: /^Majlis member (.+) has (died|resigned|been incapacitated)/,
    headline: (m) => ({ text: `Majlis Member ${m[1]} ${m[2] === 'died' ? 'Dead' : m[2] === 'resigned' ? 'Resigns' : 'Incapacitated'}`, subtext: 'Seat vacated' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Senator (.+) has (died|resigned|been incapacitated)/,
    headline: (m) => ({ text: `Senator ${m[1]} ${m[2] === 'died' ? 'Dead' : m[2] === 'resigned' ? 'Resigns' : 'Incapacitated'}`, subtext: 'Seat vacated' }),
    category: 'LEGISLATION',
    breaking: false,
  },
  {
    pattern: /^Heir (.+) has (died|resigned|been incapacitated)/,
    headline: (m) => ({ text: `Heir ${m[1]} Removed from Succession` }),
    category: 'CROWN',
    breaking: false,
  },
  {
    pattern: /^Provincial council member (.+) has (died|resigned)/,
    headline: (m) => ({ text: `Provincial Council Member ${m[1]} ${m[2] === 'died' ? 'Dead' : 'Resigns'}` }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /term expired/,
    headline: (m) => ({ text: m.input! }),
    category: 'LEGISLATION',
    breaking: false,
  },

  // ── Player ──
  {
    pattern: /^Passport issued to (.+) in (.+)$/,
    headline: (m) => ({ text: `Passport Issued to ${m[1]}`, subtext: `Province of ${m[2]}` }),
    category: 'ELECTIONS',
    breaking: false,
  },
  {
    pattern: /^(.+) cast their ballot$/,
    headline: (m) => ({ text: `${m[1]} Has Voted`, subtext: 'Ballot cast successfully' }),
    category: 'ELECTIONS',
    breaking: false,
  },

  // ── Genesis / Constitution ──
  {
    pattern: /^Constitution deployed/,
    headline: () => ({ text: 'Constitution Deployed On-Chain', subtext: 'A new era begins' }),
    category: 'CONSTITUTIONAL',
    breaking: true,
  },
  {
    pattern: /^First Parliament convened/,
    headline: () => ({ text: 'First Parliament Convenes' }),
    category: 'LEGISLATION',
    breaking: true,
  },
  {
    pattern: /^Supreme Court seated/,
    headline: () => ({ text: 'Supreme Court Seated', subtext: 'Judicial branch established' }),
    category: 'JUDICIARY',
    breaking: true,
  },
  {
    pattern: /Provincial council rebuilt in (.+)/,
    headline: (m) => ({ text: `${m[1]} Council Rebuilt` }),
    category: 'ELECTIONS',
    breaking: false,
  },
];

/**
 * Generate a newspaper-style headline from a governance event.
 * Every event gets a headline — no event goes unheadlined.
 */
export function generateHeadline(event: GovEvent): Headline {
  for (const rule of rules) {
    const match = event.description.match(rule.pattern);
    if (match) {
      const { text, subtext } = rule.headline(match);
      return { text, subtext, category: rule.category, breaking: rule.breaking };
    }
  }

  // Fallback: use the raw description as headline
  return {
    text: event.description,
    category: MARKER_TO_CATEGORY[event.marker] ?? 'LEGISLATION',
    breaking: false,
  };
}
