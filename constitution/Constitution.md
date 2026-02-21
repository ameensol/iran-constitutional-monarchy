# CONSTITUTION OF IRAN
## Focused Draft — On-Chain Governance

---

## Executive Summary

This Constitution defines a **minimum viable government**: the subset of constitutional governance that can be encoded, enforced, and audited on a public blockchain. It covers the Crown, Parliament, the Executive, the Supreme Court, Elections, Public Finance, and Constitutional Amendments — the processes where transparency, automation, and auditability provide the greatest benefit.

**What is included:** Every provision that governs *process* — how officials are appointed, how laws are passed, how budgets are approved, how amendments are adopted. These are deterministic procedures that smart contracts can enforce.

**What is excluded:** Provisions that require subjective judgment or enforcement beyond code — fundamental rights, secular state principles, armed forces, regional government. These remain important constitutional commitments but are not implementable as smart contract logic. They are documented in the full constitutional draft (`archive/Constitution_Unified_Draft_v1.md`) but omitted here to maintain focus.

**Key design principle:** *Process, not judgment.* The blockchain is constitutional machinery. Human judgment (legal reasoning, political negotiation, policy debate) happens off-chain but feeds into deterministic, auditable on-chain processes. A judicial review petition is filed on-chain and justices vote on-chain, but the legal analysis happens off-chain. A bill is submitted and voted on-chain, but the debate happens off-chain.

### Implementation Categories

Each article is annotated with one of three categories:

- **On-chain (automated)** — The smart contract enforces this rule automatically. Deadlines trigger state transitions, quorum requirements block invalid votes, role restrictions prevent unauthorized actions.
- **On-chain (human-triggered)** — A human calls a contract function, but the contract validates preconditions, records the action immutably, and advances the state machine.
- **Off-chain (referenced)** — The article states a constitutional principle that guides interpretation but is not directly encoded. Included for completeness where it provides essential context for on-chain provisions.

### Article-to-Contract Mapping

| Part | Contract(s) |
|------|-------------|
| I — Foundational Provisions | Constitution.sol |
| II — The Crown | Crown.sol |
| III — Parliament | Parliament.sol, ProvincialCouncil.sol |
| IV — Executive Authority | Executive.sol |
| V — The Supreme Court | SupremeCourt.sol |
| VI — Succession & Regency | Crown.sol |
| VII — Amendment | Referendum.sol, Constitution.sol |
| VIII — Elections & Referendums | Election.sol, Referendum.sol, CitizenRegistry.sol |
| IX — Public Finance | Budget.sol |

---

# PART I — FOUNDATIONAL PROVISIONS

## Article I.1 — The State
1. Iran is constituted as a constitutional monarchy, in which sovereignty resides with the people and is exercised through democratic institutions established by this Constitution.
2. The form of the State shall not be altered except in accordance with this Constitution.

> **Implementation:** Off-chain (referenced). The contract system embodies this principle — all governance functions derive from the Constitution.sol registry, and amendment is the only path to change.

## Article I.2 — Supremacy of the Constitution
1. This Constitution is the supreme law of the State.
2. Any law, regulation, decision, or act inconsistent with this Constitution is void to the extent of the inconsistency.
3. All organs of the State derive their authority from this Constitution and shall act within its limits.

> **Implementation:** On-chain (automated). Constitution.sol is the central registry. All other contracts reference it for role authorization and parameter values. Unauthorized actions revert.

## Article I.3 — Democratic Authority
1. Democratic authority originates with the people.
2. Democratic authority shall be exercised through:
   1. free and regular elections;
   2. representative institutions established by this Constitution;
   3. constitutional procedures designed to ensure effective and continuous government.

> **Implementation:** On-chain (automated). Election.sol conducts elections, Parliament.sol seats elected members, and all contracts enforce procedural rules.

## Article I.4 — Separation and Allocation of Powers
1. The powers of the State are exercised by:
   1. the Crown;
   2. Parliament;
   3. the Executive;
   4. the Supreme Court.
2. Each institution shall exercise only those powers conferred upon it by this Constitution.

> **Implementation:** On-chain (automated). Each contract enforces its own role boundaries via access control modifiers. Crown.sol cannot legislate; Parliament.sol cannot appoint judges; Executive.sol cannot dissolve the Majlis.

## Article I.5 — Continuity of the State
1. The State shall endure notwithstanding:
   1. dissolution of Parliament;
   2. resignation, removal, or incapacity of officeholders;
   3. emergencies or extraordinary circumstances.
2. This Constitution shall be interpreted to ensure the continuous operation of lawful authority.

> **Implementation:** On-chain (automated). Caretaker provisions activate automatically. Budget continuity engages when no new budget is enacted. The Senate persists during Majlis dissolution.

## Article I.6 — Constitutional Interpretation
1. This Constitution shall be interpreted so as to:
   1. preserve democratic legitimacy;
   2. maintain the separation of powers;
   3. ensure effective government;
   4. prevent the indefinite suspension or blockage of constitutional functions.
2. Where this Constitution prescribes procedural consequences or automatic outcomes, no organ shall substitute discretionary judgment for those consequences.

> **Implementation:** On-chain (automated). Clause 2 is directly enforced — deadlines trigger automatic outcomes (e.g., Crown's failure to act does not block enactment; Senate's failure to act is deemed confirmation).

## Article I.7 — Constitutional Parameters
1. Constitutional parameters (term lengths, quorum requirements, deadlines, thresholds) are stored in the Constitution.sol registry.
2. Parameters may be amended only through the constitutional amendment process defined in Part VII.
3. All contracts read parameters from the central registry rather than hardcoding values.

> **Implementation:** On-chain (automated). Constitution.sol stores all configurable parameters. amendParameter() is callable only by the Referendum contract after successful amendment.

---

# PART II — THE CROWN

## Article II.1 — Nature of the Crown
1. The Crown is a constitutional office of continuity and guardianship.
2. The Crown shall not govern, legislate, command the armed forces, or control public finances.
3. The Crown shall exercise only those powers expressly conferred by this Constitution.
4. The Crown shall not substitute its judgment for that of democratic institutions, except as expressly provided herein.

> **Reza Pahlavi comments:** "The best way for a monarch to serve the country is to be the guarantor of the constitutional process and to protect the constitution itself."

> **Implementation:** On-chain (automated). Crown.sol restricts callable functions to those explicitly defined. The modifier `onlyMonarch` gates Crown actions; the contract exposes no governance functions beyond those listed below.

## Article II.2 — Ministerial Acts of the Crown
1. Where this Constitution requires a formal act of the Crown to acknowledge a legal outcome already determined by constitutional process, such act shall be ministerial.
2. Ministerial acts shall not permit discretion as to timing, content, or result.
3. Failure to perform a ministerial act within the prescribed deadline shall not delay or prevent the legal effect of the outcome acknowledged. The act shall be deemed performed automatically.
4. Ministerial acts include the formal enactment of laws, the declaration of dissolution of the Majlis, and the recognition of constitutional facts certified by the Supreme Court.

> **Implementation:** On-chain (automated). Each ministerial act has a deadline (`PARAM_CROWN_LAW_DEADLINE`). If the Crown does not act within the deadline, anyone may call `Parliament.claimCrownTimeout(billId)` to auto-enact the bill. Crown inaction equals assent.

## Article II.3 — Appointment Powers
1. The Crown shall exercise appointment powers only where expressly authorized by this Constitution.
2. Appointment powers shall not be used to govern, legislate, or direct policy.
3. All appointments shall be subject to the qualifications and procedures prescribed by this Constitution.

> **Implementation:** On-chain (human-triggered). Crown calls `nominatePrimeMinister()`, `nominateJustice()`, or `appointSenators()` — each validates preconditions and advances the appointment state machine.

## Article II.4 — Nomination of the Prime Minister
1. The Crown shall nominate a candidate for Prime Minister in accordance with Part IV.
2. The Crown may make up to two nominations following a vacancy or loss of parliamentary confidence.
3. Each nomination shall be submitted to the Majlis for a vote of confidence.
4. Where the Crown's nominations fail to obtain confidence, subsequent procedures shall proceed as provided in Part IV.

> **Implementation:** On-chain (human-triggered). Crown.sol.nominatePrimeMinister() validates that the formation cycle permits a Crown nomination (max 2), registers the candidate, and transitions the Executive.sol state machine to await a confidence vote.

## Article II.5 — Legislative Return and Constitutional Referral
1. The Crown may, once with respect to any proposed law adopted by Parliament, return that law to the Majlis for reconsideration.
2. The return of a law shall suspend its enactment pending reconsideration.
3. Upon reconsideration and re-adoption by the Majlis, the Crown may either enact the law or refer it to the Supreme Court for constitutional review.
4. Referral to the Supreme Court shall prioritize constitutional review and shall not constitute a veto.
5. If the Crown neither enacts, returns, nor refers a law within fourteen days of transmission, the law shall be deemed enacted.

> **Implementation:** On-chain (human-triggered + automated). Crown calls `returnLaw()` or `referToSupremeCourt()` within the 14-day window. After 14 days, `Parliament.claimCrownTimeout(billId)` becomes callable by anyone to trigger automatic enactment.

## Article II.6 — Appointment of Senators
1. The Crown shall appoint Senators as provided in Part III.
2. Crown-appointed Senators shall not constitute more than ten percent of the Senate.
3. Crown-appointed Senators shall meet the same qualifications as other Senators.

> **Implementation:** On-chain (human-triggered). Crown.sol.appointSenators() validates the 10% cap and forwards appointments to Parliament.sol.

## Article II.7 — Declaration of Dissolution
1. Where this Constitution requires the dissolution of the Majlis, the Crown shall formally declare such dissolution.
2. The declaration shall be a ministerial act, confirmatory in nature and without independent legal effect.
3. Failure to declare dissolution within seven days shall not delay its legal effect.

> **Implementation:** On-chain (human-triggered). Crown.sol.declareDissolution() calls Parliament.dissolveMajlis(). The dissolution deadline is tracked but auto-dissolution on Crown inaction is not currently enforced (dissolution requires an explicit trigger from Crown or Executive).

## Article II.8 — Interpretive Limitation
1. The powers of the Crown shall be interpreted so as to minimize discretion, prevent accumulation of authority, and preserve democratic accountability.
2. No power of the Crown may be expanded by custom, practice, or implication.
3. In cases of doubt, interpretation shall favor democratic institutions.

> **Reza Pahlavi comments:** "The monarch must be above all political factions and be neutral, unbiased and impartial vis-à-vis all ideological, ethnic, religious, or other social and political groups."

> **Implementation:** On-chain (automated). The Crown.sol contract has a fixed set of functions. No upgrade mechanism allows expansion of Crown powers outside the amendment process.

---

# PART III — PARLIAMENT

## Article III.1 — Structure of Parliament
1. Parliament shall be bicameral, consisting of the Majlis and the Senate.
2. The Majlis shall be the primary democratic chamber.
3. The Senate shall be a chamber of review and continuity.

> **Implementation:** On-chain (automated). Parliament.sol manages both chambers with separate member lists, voting rules, and powers.

## Article III.2 — The Majlis
1. The Majlis shall be composed of members elected by universal, equal, and direct suffrage in accordance with Part VIII.
2. Elections shall be conducted by proportional representation within each province. Each province shall receive Majlis seats proportional to its population, with a minimum of one seat per province.
3. Members shall serve renewable terms of four years.
4. The total number of Majlis seats (`PARAM_TOTAL_MAJLIS_SEATS`) and the allocation of seats among provinces may be adjusted by Parliament through legislation, subject to Crown review and Supreme Court constitutional review, to reflect changes in population. The on-chain total must match the constitutional parameter.

> **Implementation:** On-chain (automated). Election.sol conducts province-scoped Majlis elections via `startMajlisElection(provinceId)` and calls Parliament.sol.seatMajlisMemberWithProvince() to install elected members with province tracking. Seat allocation per province is stored in ProvincialCouncil.sol (`majlisSeatCount` in the Province struct). Reapportionment is handled by ProvincialCouncil.updateMajlisSeatAllocation(), callable by Parliament, which validates that the new allocation totals match `PARAM_TOTAL_MAJLIS_SEATS`. Term length is a constitutional parameter.

## Article III.3 — Powers of the Majlis
1. The Majlis shall grant and withdraw confidence in the Prime Minister and Cabinet.
2. The Majlis shall originate legislation and the annual budget.
3. No executive authority shall be exercised except with the confidence of the Majlis.

> **Implementation:** On-chain (automated). Confidence votes are tracked in Executive.sol. Bill origination is restricted to Majlis members in Parliament.sol. Budget origination is restricted per Budget.sol.

## Article III.4 — The Senate
1. Senators shall be selected by election from Provincial Councils and by appointment by the Crown.
2. Senators appointed by the Crown shall constitute no more than ten percent of the Senate.
3. Senators shall serve non-renewable terms of six years, renewed by thirds every two years.
4. The Senate shall remain constituted during dissolution of the Majlis.

> **Implementation:** On-chain (automated). Parliament.sol tracks Senate membership, enforces the 10% Crown appointment cap, manages term expiry, and maintains Senate function during Majlis dissolution. **Two-tier selection (Art. III.4.1):** Citizens elect provincial council members via Election.startProvincialElection(). Council members then elect senators for their province via ProvincialCouncil.startSenateSelection(). Parliament.seatSenatorWithProvince() tracks which province each senator represents. **Staggering (Art. III.4.3):** Each senator has an individual `senateTermEnd` timestamp. On first formation, the Crown calls `initializeSenateStagger()` which assigns 2/4/6-year initial terms by `prevrandao` lottery, creating three natural cohorts. New senators seated after initialization receive fresh 6-year terms. `expireMember()` creates vacancies that feed into the by-election backstop (Art. VIII.8).

## Article III.5 — Powers of the Senate
1. The Senate shall review legislation and budgets adopted by the Majlis.
2. The Senate shall confirm or reject judicial appointments as provided in Part V.
3. The Senate shall participate in constitutional amendment procedures.
4. The Senate shall not originate legislation or budgets.

> **Implementation:** On-chain (automated). Parliament.sol enforces that `submitBill()` reverts when called by a Senator. Senate functions are limited to review, confirmation, and amendment participation.

## Article III.6 — Legislative Process
1. A member of the Majlis may introduce a bill by submitting its hash and description to Parliament.
2. The Majlis shall vote on the bill. Adoption requires a majority of members present, provided a quorum exists.
3. An adopted bill shall be transmitted to the Senate for review.
4. The Senate may, within thirty days:
   1. approve the bill, which transmits it to the Crown;
   2. propose amendments, which returns it to the Majlis;
   3. object to the bill, which returns it to the Majlis.
5. Where the Senate objects, the Majlis may re-adopt the bill by an absolute majority of all members, overriding the Senate objection.
6. Where the Senate fails to act within thirty days, the bill is deemed approved and transmitted to the Crown.
7. Upon transmission to the Crown, the bill enters the Crown action phase (Article II.5).

> **Implementation:** On-chain (automated + human-triggered). Parliament.sol implements an eleven-state bill machine: `Introduced → MajlisVoting → [SenateReview | Rejected] → [SenateObjected → MajlisOverride] → CrownAction → [Enacted | Returned | Referred → Vetoed]`. Senate approval transitions directly from SenateReview to CrownAction. Senate timeout (30 days) auto-approves. Crown timeout (14 days) auto-enacts. Quorum and minimum voting period enforced.

## Article III.7 — Budgetary Continuity
1. Where the budget is not enacted by the beginning of the fiscal year, the prior year's budget shall continue on a provisional basis.
2. Budgetary authority shall not lapse due to dissolution of the Majlis.

> **Implementation:** On-chain (human-triggered). Budget.sol.continuePriorBudget() can be called by any authorized contract when no new budget is enacted. See Art. IX.3.

## Article III.8 — Parliamentary Privilege
1. Members of Parliament shall enjoy immunity for votes and statements made in the exercise of their functions.
2. Parliamentary privilege shall not extend to acts outside constitutional authority.

> **Implementation:** Off-chain (referenced). Voting is recorded on-chain, but parliamentary privilege is a legal concept enforced by courts, not code.

## Article III.9 — Vacancy Declaration
1. When a member is dead, permanently disappeared, or has irretrievably lost their cryptographic key, the relevant chamber may declare the seat vacant by simple majority vote.
2. The target member shall be excluded from voting and from the denominator.
3. The Supreme Court may certify a member's incapacity as a fact. Upon Parliament's acknowledgment, the member is immediately excluded from quorum calculations and cannot act, while still formally holding the seat.
4. A vacancy declaration vote shall last fourteen days (`PARAM_VACANCY_VOTE_PERIOD`).
5. Upon passage, the seat is formally vacated and a by-election is triggered per Art. VIII.8.

> **Implementation:** On-chain (automated). Parliament.sol implements a three-step separation of powers: (1) Court certifies incapacity via `voteOnFact()` with fact hash `keccak256("MEMBER_INCAPACITATED", address)`, (2) anyone calls `acknowledgeIncapacity()` to immediately exclude the member from `effectiveMajlisMemberCount()`/`effectiveSenateMemberCount()` and `isActiveMajlisMember()`/`isActiveSenateMember()`, (3) chamber members call `proposeVacancy()`, `voteOnVacancy()`, `finalizeVacancy()` for formal removal. Both Parliament.sol (bill quorum and override thresholds) and Executive.sol (confidence and no-confidence thresholds) use effective member counts, preventing incapacitated members from inflating denominators.

## Article III.10 — Provincial Councils
1. Each of Iran's thirty-one provinces shall have a Provincial Council, elected by universal citizen suffrage within the province.
2. Provincial Councils shall consist of fifteen members serving four-year terms (`PARAM_COUNCIL_TERM`).
3. The sole constitutional function of Provincial Councils is the election of Senators. Provincial Councils have no local legislative, budgetary, or regulatory authority under this Constitution.
4. Senate selection by Provincial Councils shall follow a defined pipeline: candidate registration by any citizen of the province, followed by a vote restricted to active council members.
5. Provinces shall be grouped into three stagger cohorts (A, B, C) of approximately ten provinces each, controlling Senate renewal by thirds.
6. The Crown shall initialize provinces by specifying each province's council size, Senate seat allocation, and stagger cohort assignment.

> **Implementation:** On-chain (automated). ProvincialCouncil.sol manages province initialization, council membership with self-enforcing 4-year terms, and the senate selection pipeline. Election.sol supports ProvincialCouncil elections via `startProvincialElection()` with province-scoped candidate registration and voting using CitizenRegistry province assignments. The selection pipeline uses `PARAM_SENATE_SELECTION_REG_PERIOD` (14 days) and `PARAM_SENATE_SELECTION_VOTE_PERIOD` (7 days). `seatSelectedSenators()` calls Parliament.seatSenatorWithProvince() to track the senator's province of origin. This design continues the 1906 Constitution's vision of provincial anjumans (Arts. 90-93) with a narrow mandate: Senate election mechanism only.

---

# PART IV — EXECUTIVE AUTHORITY

## Article IV.1 — The Executive
1. Executive authority shall be exercised by a Prime Minister and a Cabinet.
2. The Prime Minister shall direct the executive and be responsible for the conduct of government.
3. The executive shall be collectively responsible to the Majlis.

> **Reza Pahlavi comments:** "The head of government is clearly the elected prime minister, not the monarch... The Prime Minister is in charge of policies and decision making."

> **Implementation:** On-chain (automated). Executive.sol tracks the PM role and the confidence relationship with the Majlis.

## Article IV.2 — Scope of Executive Authority
1. Executive authority comprises the direction of public administration, implementation of laws, conduct of foreign relations, and management of public services.
2. Executive authority shall be subject to the confidence of the Majlis and to constitutional review by the Supreme Court.

> **Implementation:** Off-chain (referenced). The scope of executive authority is enforced by political accountability, not code. The on-chain component is the confidence relationship.

## Article IV.3 — Appointment of the Prime Minister
1. The Prime Minister shall be appointed following nomination by the Crown and a vote of confidence by the Majlis.
2. No person shall exercise full executive authority as Prime Minister without obtaining the confidence of the Majlis.

> **Implementation:** On-chain (automated). The PM role in Constitution.sol is set only after Executive.sol records a successful confidence vote. No PM functions are callable without this.

## Article IV.4 — Vote of Confidence
1. A candidate for Prime Minister shall present a proposed government program to the Majlis.
2. Confidence shall be granted by an absolute majority of the members of the Majlis.
3. Upon the granting of confidence, the Prime Minister shall exercise full executive authority.

> **Implementation:** On-chain (human-triggered + automated). The PM candidate calls `presentGovernment()`. Majlis members call `voteConfidence()`. Executive.sol tallies and, upon reaching absolute majority, activates the PM role.

## Article IV.5 — Withdrawal of Confidence
1. The Majlis may withdraw confidence from the Prime Minister by vote.
2. Within the first ninety days following a confidence vote, a motion of no confidence requires two-thirds of the members of the Majlis.
3. After ninety days, a simple majority of the members of the Majlis suffices.

> **Implementation:** On-chain (automated). Executive.sol tracks the confidence timestamp and applies the correct threshold (2/3 within 90 days, 1/2 after). The 90-day period is a constitutional parameter.

## Article IV.6 — Caretaker Government
1. Where the office of Prime Minister is vacant, the Cabinet shall continue as a caretaker government.
2. A caretaker government shall not initiate major policy changes, submit new legislation, or appoint judges.
3. Caretaker status is activated automatically upon vacancy and deactivated upon a new PM obtaining confidence.

> **Implementation:** On-chain (automated). Executive.sol enters caretaker mode when the PM role is vacated. Other contracts check `isCaretaker()` and restrict caretaker actions accordingly.

## Article IV.7 — Executive Formation Cycle
1. Upon commencement of an executive formation cycle, the Crown shall nominate a candidate for Prime Minister.
2. The Crown may make no more than two nominations during a single formation cycle.
3. Where both Crown nominations fail to obtain confidence:
   1. The Majlis shall propose a ranked list of three candidates within fourteen days.
   2. The Crown shall appoint from this list within seven days.
   3. Where the Crown fails to appoint within seven days, the first-ranked candidate shall be deemed appointed.
4. Where the Majlis fails to propose a list within fourteen days, the Majlis shall be dissolved and new elections called.

> **Implementation:** On-chain (automated). Executive.sol implements the formation state machine: `CrownNomination1 → CrownNomination2 → MajlisList → Dissolution`. Each stage has deadlines. Automatic transitions enforce the cascade. During Crown suspension, the cycle still begins at CrownNom1, but the Senate takes the Crown's nomination role via Parliament governance action (Art. VI.5.2). Executive.sol verifies the `executingSenateAction` flag on Parliament to ensure only Senate governance actions can call `nominatePM()` and `appointFromList()` during suspension. Crown nomination timeout (`claimCrownNominationTimeout()`, PARAM_NOMINATION_DEADLINE = 14d) skips directly to MajlisList (inaction forfeits both chances, whether Crown or Senate).

## Article IV.8 — Incapacity
1. Where the Prime Minister is unable to discharge duties due to incapacity, the Supreme Court shall certify the vacancy.
2. Upon certification, caretaker provisions shall apply and a new formation cycle shall commence.

> **Implementation:** On-chain (human-triggered). Justices vote via SupremeCourt.voteOnFact(), then anyone calls finalizeFactCertification() after 14 days. Once PM incapacity is certified, Executive.startFormation() enters caretaker mode and begins a new formation cycle.

## Article IV.9 — Executive Succession
1. The Prime Minister shall designate a Deputy Prime Minister within fourteen days of receiving confidence. The designation may not be revoked without simultaneously naming a replacement.
2. Where the Prime Minister fails to designate a Deputy within the deadline, the Prime Minister may not submit new legislation or make judicial nominations until a Deputy is designated.
3. Where the Supreme Court certifies the Prime Minister's death or incapacity, the Deputy Prime Minister shall assume the office as Acting Prime Minister with caretaker powers. A formation cycle shall begin for a permanent replacement.
4. Where both the Prime Minister and Deputy Prime Minister are dead or incapacitated, the Crown shall designate an Acting Prime Minister from among the sitting government.
5. During Crown suspension, the Senate shall initiate the formation cycle per Art. VI.5.2.
6. The Acting Prime Minister exercises caretaker powers only: no new legislation, no budget proposals, no judicial appointments.

> **Implementation:** On-chain (automated). Executive.sol stores `deputyPM` (designated by PM via `designateDeputyPM()`). Deputy designation is mandatory: `deputyDesignationDeadline` is set when the PM receives confidence, and `isDeputyOverdue()` returns true if the deadline passes without designation. Art. IV.9.2 is enforced: Budget.proposeBudget() reverts with `DeputyDesignationOverdue` when overdue, and Executive.sol blocks all three justice nomination functions during Crown suspension (`nominateJusticeDuringSuspension`, `nominateJusticeSecondDuringSuspension`, `appointJusticeFromListDuringSuspension`). `designateDeputyPM()` requires a non-zero address; designating address(0) is not permitted. Permissionless `claimPMVacancy()` checks Court certification of fact `"PM_VACANCY" + currentPM` (instance-specific hash prevents reuse across PMs), installs Deputy as Acting PM with caretaker mode, and starts formation. Crown fallback via `designateActingPM()` (Crown.sol wrapper). Senate fallback already handled by Parliament.initiateFormationDuringSuspension().

---

# PART V — THE SUPREME COURT

## Article V.1 — Establishment
1. A Supreme Court is established as the highest judicial authority of the State.
2. The Supreme Court shall:
   1. interpret this Constitution;
   2. review the constitutionality of laws;
   3. resolve disputes between State organs;
   4. certify constitutional facts (vacancies, incapacity, succession).

> **Implementation:** On-chain (automated). SupremeCourt.sol provides functions for each jurisdiction: constitutional review, dispute resolution, and fact certification. Decisions are recorded immutably.

## Article V.2 — Composition
1. The Supreme Court shall consist of twelve Justices serving non-renewable nine-year terms.
2. Terms shall be staggered so that one-third of the Court is renewed every three years.
3. Justices shall be jurists of recognized competence with at least fifteen years of legal experience.

> **Implementation:** On-chain (automated). SupremeCourt.sol tracks justice seats, term start/end dates, and enforces non-renewability. Composition parameters (12 justices, 9-year terms) are constitutional parameters. Note: PARAM_JUSTICE_COUNT is defined and protected in Constitution.sol but SupremeCourt.sol uses a fixed-size array of 12 seats; changing this parameter via referendum would not affect court behavior without redeploying SupremeCourt.sol.

## Article V.3 — Appointments
1. The Crown shall nominate candidates for Justice; the Senate shall confirm or reject within thirty days.
2. Failure by the Senate to act within thirty days shall be deemed confirmation.
3. If the Senate rejects, the Crown may nominate one additional, distinct candidate.
4. If the Senate rejects both nominations, the Senate shall propose a ranked list of three candidates within thirty days.
5. The Crown shall appoint from this list within fourteen days, or the first-ranked candidate shall be deemed appointed.
6. If the Senate fails to propose a ranked list, the Crown may appoint one of its previously nominated candidates.

> **Implementation:** On-chain (automated). SupremeCourt.sol implements the appointment state machine: `CrownNomination1 → SenateVote → [Confirmed | Rejected → CrownNomination2 → SenateVote → [Confirmed | Rejected → SenateList → CrownAppointment]]`. Deadlines trigger automatic outcomes at each stage. During Crown suspension, the Prime Minister exercises Crown nomination powers via Executive.sol wrapper functions (`nominateJusticeDuringSuspension`, `nominateJusticeSecondDuringSuspension`, `appointJusticeFromListDuringSuspension`). The caretaker mode check in SupremeCourt.nominateJustice is bypassed during Crown suspension to enable emergency court recovery.

## Article V.4 — Jurisdiction
1. The Supreme Court shall have exclusive jurisdiction over the constitutionality of laws, regulations, and executive acts.
2. The Supreme Court shall resolve disputes between constitutional organs (Crown, Parliament, Executive).
3. Decisions of the Supreme Court shall be final and binding on all organs of the State.

> **Implementation:** On-chain (human-triggered + automated). Petitions are filed on-chain. Justices vote on-chain. Rulings are recorded immutably. Other contracts check Court decisions before proceeding (e.g., a law declared unconstitutional cannot be enacted).

## Article V.5 — Standing
1. The Crown, Prime Minister, one-tenth of the Majlis, and one-tenth of the Senate may petition the Supreme Court on constitutional matters.
2. Petitions shall state the constitutional question and the relief sought.

> **Implementation:** On-chain (human-triggered). SupremeCourt.sol.fileConstitutionalReview() validates that the petitioner has standing (checks role or member count threshold).

## Article V.6 — Judicial Independence
1. Justices are independent and subject only to this Constitution and the law.
2. Justices may be removed only for incapacity or serious misconduct, by vote of a majority of the remaining justices.
3. No organ of State shall instruct justices in judicial matters.
4. Judicial compensation shall not be reduced during tenure.

> **Implementation:** On-chain (automated). SupremeCourt.sol enforces that only justices can vote on Court matters. Removal requires a majority vote of remaining justices via fact certification. No external contract can modify a justice's vote or remove a justice unilaterally.

## Article V.7 — Continuity
1. The Supreme Court shall remain constituted during dissolution of the Majlis.
2. Vacancies shall be filled without interruption to the functioning of the Court.
3. The Court may act with a quorum of seven justices.

> **Implementation:** On-chain (automated). SupremeCourt.sol operates independently of Parliament.sol's dissolution state. Effective quorum is min(PARAM_COURT_QUORUM, activeJusticeCount), enforced on reviews and disputes. Reverts if no active justices exist.

## Article V.8 — Court Emergency Recovery
1. Where the Crown, the Prime Minister, or ten per cent of the active members of either chamber of Parliament consider the Court unresponsive, they may initiate a liveness challenge. The Court shall have seven days to demonstrate activity.
2. Where the Court records no activity for fourteen consecutive days, any person may initiate emergency vacancy proceedings without prior challenge.
3. If a liveness challenge expires without any justice action, or if the fourteen-day inactivity threshold is met, any person may vacate individual justice seats.
4. Vacated seats shall be filled through the normal appointment process (Art. V.3).
5. Any action by an active justice (voting on a review, dispute, or fact certification) resets the liveness challenge and the inactivity timer.

> **Implementation:** On-chain (automated). SupremeCourt.sol tracks `lastCourtActivity` (updated on every justice vote via `_recordActivity()`). Two-tier recovery:
> - **Fast path (7 days):** `challengeCourtLiveness()` callable by monarch, PM, or authorized contracts. `petitionCourtLiveness()` callable by active Parliament members; auto-activates when 10% of either chamber's effective members have petitioned (ceiling division). Sets `livenessDeadline`.
> - **Slow path (14 days):** Permissionless `emergencyVacateSeat(seat)` callable when either the liveness challenge has expired (`livenessDeadline != 0 && block.timestamp >= livenessDeadline`) or inactivity timeout has passed (`block.timestamp >= lastCourtActivity + PARAM_COURT_INACTIVITY_PERIOD`).
> - Any justice vote resets `livenessDeadline` to 0 and clears petition counts (via `livenessChallengeRound` increment). `lastCourtActivity` is initialized when the first justice is seated, ensuring the inactivity timer does not trigger on a freshly deployed court with no justices.
> - Parameters: `PARAM_COURT_LIVENESS_PERIOD` (7 days), `PARAM_COURT_INACTIVITY_PERIOD` (14 days).

---

# PART VI — SUCCESSION, REGENCY, AND SUSPENSION OF THE CROWN

## Article VI.1 — Hereditary Succession
1. The Crown shall pass by hereditary succession.
2. The successor shall be determined by order of succession as maintained by the Crown contract.
3. The succession list shall be updatable by the reigning Monarch with confirmation by the Supreme Court.

> **Implementation:** On-chain (human-triggered). Crown.sol maintains an ordered succession list. The Monarch can propose changes; the Supreme Court must certify. Two-step succession: (1) Court certifies MONARCH_VACANCY + confirms the specific heir via HEIR_CONFIRMED fact; (2) anyone calls `claimSuccession(confirmedHeir)`. The code verifies succession order: every candidate ahead of the confirmed heir must be either on-chain ineligible (not a citizen) or Court-certified SUCCESSION_INELIGIBLE. This eliminates race conditions — no claim can proceed until the Court positively confirms the heir. Instance-specific hashes (including current monarch) prevent reuse across reigns.

## Article VI.2 — Eligibility
1. No person shall succeed to the Crown unless that person is a citizen of Iran and has attained age eighteen.
2. Disqualification occurs where the Supreme Court certifies incapacity or formal renunciation.

> **Implementation:** On-chain (partial). Crown.sol re-verifies citizenship when succession triggers via CitizenRegistry. Age verification is enforced by the ZK circuit for ballot casting (voters must be >= 18). Succession age eligibility is not enforced on-chain (would require Court fact certification in production).

## Article VI.3 — Regency
1. A Regency shall commence where the Monarch is a minor or incapacitated.
2. The Regent shall be the first eligible person in the order of succession who has attained age eighteen.
3. The Regent shall exercise the powers of the Crown temporarily.

> **Implementation:** On-chain (automated). Crown.sol supports a regent role that exercises Crown functions when the monarch cannot. Two-step regency: (1) Court certifies MONARCH_INCAPACITY + confirms the specific regent via REGENT_CONFIRMED fact; (2) anyone calls `claimRegency(confirmedRegent)`. The code verifies succession order: the regent must be the first eligible person in the succession list (with SUCCESSION_INELIGIBLE for anyone ahead who is unfit). The regent is NOT removed from the succession list (temporary role). Reverts if regent already set. `claimRegencyEnd()` — anyone can call after Court certifies "MONARCH_RECOVERY" fact.

## Article VI.4 — Abdication and Renunciation
1. The Monarch may abdicate by calling the abdication function, which the Supreme Court must certify.
2. Any person in the order of succession may renounce their position.
3. Abdication or renunciation takes effect upon certification by the Supreme Court.

> **Implementation:** On-chain (human-triggered). Crown.sol.abdicate(confirmedHeir) — requires both ABDICATION_CERTIFIED and HEIR_CONFIRMED Court certifications before abdication can proceed. Atomic: abdicates and crowns the confirmed heir in one step. The Court must confirm the heir before the monarch can abdicate, preventing abdication into a vacuum. Renouncement is not currently implemented (succession list can be updated instead). `claimSuccessionExhausted()` handles the case where the entire line is exhausted — anyone can call after MONARCH_VACANCY to suspend the Crown when every candidate is either on-chain ineligible or Court-certified SUCCESSION_INELIGIBLE.

## Article VI.5 — Temporary Suspension
1. Where no eligible Monarch or Regent exists, the Crown shall be temporarily suspended.
2. During suspension, the Prime Minister shall exercise the Crown's legislative return power, and the Senate shall initiate executive formation.
3. All Crown powers revert upon certification that a Monarch or Regent exists.

> **Implementation:** On-chain (automated). Crown.sol enters suspended state. Other contracts detect suspension and reroute Crown functions: the PM exercises legislative return powers and justice nomination powers (Art. V.3); the Senate takes the Crown's nomination role in executive formation (nominating PM candidates for Majlis confidence vote, and appointing from the Majlis list) via Parliament governance action. Executive.sol enforces Senate-only access by checking Parliament's `executingSenateAction` flag. Formation initiation during suspension is restricted to Senate members via Parliament.initiateFormationDuringSuspension(). Permissionless `claimCrownResumption()` — anyone can call when Crown is suspended but a monarch exists in the role (no Court certification needed because succession already validated the new monarch).

## Article VI.6 — Exhaustion of the Line
1. Where the Supreme Court certifies that the hereditary line is exhausted, a national referendum on the form of government shall be conducted within one year.
2. Until the referendum produces an outcome, constitutional functions shall continue under suspension rules.

> **Implementation:** On-chain (human-triggered + automated). SupremeCourt certifies exhaustion via fact certification. Crown.sol tracks `successionExhaustedAt` timestamp when succession exhausts the list. After PARAM_SUCCESSION_REFERENDUM_DEADLINE (365 days), anyone can call `claimSuccessionReferendumDeadline()` which emits `SuccessionReferendumDue` as an on-chain record that the constitutional mandate has been triggered. A structural amendment (contract or role amendment) through the existing Referendum.sol process would be used to change the form of government. Constitutional functions continue under Article VI.5 rules until resolved.

---

# PART VII — AMENDMENT OF THE CONSTITUTION

## Article VII.1 — Amendment Authority
1. This Constitution may be amended only in accordance with this Part.
2. All amendments shall respect the continuity of the State.

> **Implementation:** On-chain (automated). Referendum.sol supports three amendment types: parameter changes (Constitution.sol.amendParameter), role changes (Constitution.sol.setRole), and structural changes (Constitution.sol.amendContract). All require a successful referendum. Structural amendments can replace any governance contract — including the Crown — enabling constitutional evolution through democratic process.

## Article VII.2 — Initiative
1. Amendments may be initiated by the Majlis, the Senate, or the Prime Minister.
2. Initiative requires a simple majority in the initiating chamber, or a formal proposal by the Prime Minister.

> **Implementation:** On-chain (human-triggered). Referendum.sol.proposeAmendment() validates that the caller has the required standing and that parliamentary approval has been obtained.

## Article VII.3 — Parliamentary Adoption
1. An amendment requires approval by two-thirds of the Majlis and two-thirds of the Senate.

> **Implementation:** On-chain (human-triggered). Parliamentary adoption of amendments (2/3 threshold) occurs off-chain. Upon adoption, an authorized contract calls Referendum.proposeAmendment() to register the amendment on-chain.

## Article VII.4 — Referendum
1. Upon parliamentary adoption, a constitutional amendment shall be submitted to national referendum.
2. An amendment is approved by a simple majority of valid votes cast.

> **Implementation:** On-chain (automated). Referendum.sol conducts the vote using CitizenRegistry for voter eligibility. Upon approval, Referendum.sol enacts the change via the appropriate Constitution.sol function: amendParameter() for parameter changes, setRole() for role changes, or amendContract() for structural changes (replacing governance contracts).

## Article VII.5 — Emergency Amendments
1. Where the Supreme Court certifies a grave threat to the constitutional order, Parliament may adopt a temporary amendment by three-quarters of each chamber. A temporary amendment shall be limited to changes of constitutional parameters.
2. A temporary amendment expires after one year unless confirmed by referendum.
3. No temporary amendment may alter protected provisions governing elections, judicial independence, or constitutional supremacy.
4. Protected provisions include: justice terms, court quorum, justice count, amendment thresholds, election parameters (registration period, voting period, dissolution deadline, chamber terms), confidence vote period, emergency amendment duration, and provincial council term.

> **Implementation:** On-chain (automated). Referendum.sol tracks emergency amendments with a stored `expiresAt` timestamp (computed at enactment from `PARAM_EMERGENCY_AMEND_DURATION`). The stored deadline is immutable, so later changes to the duration parameter do not retroactively affect active emergencies. Emergency amendments can be confirmed by referendum via `confirmEmergencyAmendment()`, which sets status to Confirmed and prevents expiry rollback. If a normal referendum on the same parameter is enacted while an emergency is active, the emergency is marked Superseded (preventing stale `oldValue` rollback). Protected provisions are hardcoded and cannot be modified even by emergency amendment.

---

# PART VIII — ELECTIONS AND REFERENDUMS

## Article VIII.1 — Electoral Principles
1. Elections shall be free, fair, and at regular intervals, by universal, equal, and secret suffrage.
2. Members of the Majlis shall be elected by proportional representation within their province for four-year terms.
3. Each citizen registered in the CitizenRegistry shall have one vote of equal value.
4. Ballot secrecy shall be preserved through zero-knowledge proofs generated from biometric passport data.

> **Implementation:** On-chain (automated). Election.sol enforces one-vote-per-citizen using ZK nullifiers (each citizen's passport data produces a unique per-election nullifier; duplicates are rejected). Proportional representation is computed on-chain. Voter anonymity is achieved through zero-knowledge proofs that verify citizenship without revealing identity.

## Article VIII.2 — Election Cycles
1. Majlis elections shall be held every four years, or upon dissolution, with one election per province conducted simultaneously across all provinces.
2. Senate elections shall be staggered, with one-third renewed every two years.
3. Provincial Council elections shall be held every four years per province.
4. An election cycle comprises: candidate registration, voting period, tallying, and member seating.
5. The Electoral Commission function is performed by the Election contract itself.

> **Implementation:** On-chain (automated). Election.sol manages the election lifecycle as a state machine: `Registration → Voting → Tallied → Seated`. Each phase has defined durations as constitutional parameters (`PARAM_ELECTION_REG_PERIOD`, `PARAM_ELECTION_VOTE_PERIOD`). Election.sol supports three election types: Majlis, Senate (direct), and ProvincialCouncil. Majlis elections use `startMajlisElection(provinceId)` with province-scoped registration and voting via CitizenRegistry.citizenProvince(). Provincial Council elections use `startProvincialElection(provinceId)` similarly. **Senate staggering (Art. VIII.2.2):** Implemented via individual `senateTermEnd` timestamps in Parliament.sol rather than formal class assignments. A one-time `initializeSenateStagger()` creates three cohorts; thereafter, individual term expiry maintains rotation. Expired senators create vacancies enforced by the by-election timeout (Art. VIII.8).

## Article VIII.3 — Candidate Registration
1. Any citizen may register as a candidate for the Majlis in their province of registration during the registration period.
2. Candidates may associate with a registered political party or stand as independents.
3. The registration period shall be no less than fourteen days.

> **Implementation:** On-chain (human-triggered). Election.sol.registerCandidate() validates citizenship via CitizenRegistry, enforces province matching for Majlis and ProvincialCouncil elections (candidates must be registered in the election's province), and records the candidacy during the registration phase.

## Article VIII.4 — Voting
1. During the voting period, each registered citizen may cast one ballot in their province's Majlis election.
2. The ballot shall include the citizen's verified identity proof and their encrypted vote.
3. No citizen may vote more than once in the same election.
4. The voting period shall be no less than seven days.

> **Implementation:** On-chain (human-triggered + automated). Election.sol.castBallot() verifies a Groth16 ZK proof (citizenship, age >= 18, CSCA key hash, per-election nullifier, province binding). Province matching for Majlis and ProvincialCouncil elections is verified from the proof's public signals. The contract checks for double-voting via nullifier and enforces the voting period.

## Article VIII.5 — Tallying and Seating
1. Upon the close of voting, votes shall be tallied and seats allocated by proportional representation within each province according to the province's allocated seat count.
2. Elected members shall be seated in Parliament by the Election contract, with their province of election recorded.
3. Tallying shall be transparent and verifiable by any citizen.

> **Implementation:** On-chain (automated). Election.sol.tallyVotes() computes proportional seat allocation. Election.sol.seatMembers() calls Parliament.sol.seatMajlisMemberWithProvince() for Majlis elections (recording the province) or Parliament.sol.seatMember() for other election types.

## Article VIII.6 — Referendums
1. Constitutional referendums shall be conducted in accordance with Part VII.
2. A referendum on the form of government shall be conducted in accordance with Article VI.6.
3. Referendum voting follows the same identity verification and ballot-casting procedures as elections.
4. A referendum is decided by a simple majority of valid votes cast.

> **Implementation:** On-chain (automated). Referendum.sol manages referendum lifecycle. Uses the same CitizenRegistry identity system as Election.sol. Results are binding and trigger constitutional changes automatically.

## Article VIII.7 — Dissolution Elections
1. Where the Majlis is dissolved, new elections shall be called within sixty days, with one election per province conducted simultaneously.
2. Each provincial election shall follow the standard cycle (registration, voting, tallying, seating).
3. The Majlis is restored only when all provincial elections have been seated.
4. Until the new Majlis is seated, the Senate continues to function and the caretaker government remains in place.

> **Implementation:** On-chain (human-triggered + auto-enforced). Executive.sol triggers dissolution via Parliament.dissolveMajlis(), which records the dissolution timestamp. Parliament.claimDissolutionElectionTimeout() enforces the 60-day deadline: after PARAM_DISSOLUTION_ELECTION_DEADLINE elapses, anyone can call this function to auto-start Majlis elections via Election.startMajlisElection(provinceId) for each province. A `pendingMajlisElections` counter tracks how many provincial elections remain; Parliament.majlisElectionSeated() decrements the counter as each province's election is seated, and restores the Majlis when the counter reaches zero.

## Article VIII.8 — By-Elections
1. Where a Majlis seat is vacated before the expiry of its term, a by-election shall be held within ninety days in the province that held the seat.
2. Where a Senate seat is vacated before the expiry of its term, a by-election shall be held within ninety days.
3. A by-election follows the standard election cycle (registration, voting, tallying, seating).
4. The member elected in a by-election serves for the remainder of the original term.
5. Where the remaining term is less than six months, no by-election is required.

> **Implementation:** On-chain (human-triggered + auto-enforced). Parliament._removeMemberInternal() tracks vacancies per province for Majlis members (using `provinceMajlisVacancies[province]` and `lastVacancyAtForProvince[province]`) and per chamber for Senate. Vacancies are only tracked if the member's remaining term is at least six months (Art. VIII.8.5 — no by-election for near-expiry vacancies). Parliament.claimByElectionTimeout() enforces the 90-day deadline (`PARAM_BY_ELECTION_DEADLINE`): for Majlis vacancies, it starts province-scoped elections via Election.startMajlisElection(provinceId) only for provinces with vacancies; for Senate vacancies, it uses Election.startElection(). Parliament.seatMajlisMemberWithProvince() decrements per-province vacancy counts as seats are filled. Term enforcement is self-enforcing: Parliament.isActiveMajlisMember() and Parliament.isActiveSenateMember() check both membership and term expiry, so expired members cannot act even if expireMember() has not been called. Known simplification: by-election winners receive a fresh term (Art. VIII.8.4 remainder-of-term is not enforced due to pipeline complexity).

---

# PART IX — PUBLIC FINANCE

## Article IX.1 — Budget and Taxation
1. The Prime Minister shall propose the annual budget to the Majlis.
2. No public funds shall be spent except as authorized by an enacted budget.
3. No tax shall be levied except by law adopted through the legislative process.

> **Implementation:** On-chain (human-triggered + automated). Budget.sol.proposeBudget() is callable by any authorized contract (typically the PM via Executive). Budget proposals are blocked during caretaker mode. Budget.sol.allocateFunds() validates that spending is within an approved budget. Unauthorized spending reverts.

## Article IX.2 — Budget Adoption
1. The budget shall follow the legislative process, with the Majlis having the exclusive right to originate budget legislation.
2. The Senate may review and object to the budget, but the Majlis may override Senate objection by absolute majority.
3. The budget must be enacted before the start of the fiscal year.

> **Implementation:** On-chain (automated). Budget.sol tracks the budget lifecycle and integrates with Parliament.sol for the adoption process. Budget bills have a special flag in Parliament.sol.

## Article IX.3 — Budgetary Continuity
1. Where the budget is not enacted by the beginning of the fiscal year, the prior year's budget shall continue on a provisional basis at the same allocation levels.
2. Provisional budgetary authority shall not exceed the prior year's total.
3. Budgetary authority shall not lapse due to dissolution of the Majlis.
4. A provisional continuation budget shall be superseded upon activation of a properly adopted budget for the same fiscal year.

> **Implementation:** On-chain (human-triggered). Budget.sol.continuePriorBudget() can be called by any authorized contract when the fiscal year begins without an enacted budget. The prior year's allocations become the ceiling. Continuation budgets are marked with `isContinuation = true` and have status `Superseded` when replaced by a properly adopted budget for the same year.

## Article IX.5 — Supplementary Budgets
1. Parliament may approve a supplementary budget to increase the spending ceiling of the active budget for the current fiscal year.
2. Supplementary budgets follow the same legislative process as the annual budget.
3. The spending ceiling of the active budget shall be increased by the supplementary amount upon activation.

> **Implementation:** On-chain (human-triggered). Budget.sol.approveSupplementary() increases the active budget's `totalAmount`. Requires `onlyParliament`. The PM proposes the supplementary through the normal legislative process (off-chain deliberation, Parliament votes); Parliament calls `approveSupplementary()` to enact it.

## Article IX.4 — National Audit
1. A National Audit Office, independent of the executive, shall audit public accounts and report to Parliament.
2. The head of the Audit Office shall be appointed by the Majlis for a nine-year non-renewable term.
3. The Audit Office shall submit annual audit reports covering all public expenditure.

> **Implementation:** On-chain. Budget.sol manages the full Audit Head lifecycle:
> - `appointAuditHead(nominee)`: Parliament appoints; records term start/end; marks non-renewable.
> - `removeExpiredAuditHead()`: Permissionless after 9-year term expires.
> - `vacateAuditHead()`: Requires Court-certified `AUDIT_HEAD_VACANCY` fact (death, incapacity, misconduct).
> - Constitution.sol enforces role-specific access: only Budget.sol (or Referendum) can set ROLE_AUDIT_HEAD.
> - `submitAuditReport()`: Audit Head submits annual report hashes, recorded immutably.

---

# SUMMARY

| Part | Title | Articles | Primary Contract |
|------|-------|----------|-----------------|
| I | Foundational Provisions | 7 | Constitution.sol |
| II | The Crown | 8 | Crown.sol |
| III | Parliament | 10 | Parliament.sol, ProvincialCouncil.sol |
| IV | Executive Authority | 9 | Executive.sol |
| V | The Supreme Court | 8 | SupremeCourt.sol |
| VI | Succession, Regency, Suspension | 6 | Crown.sol |
| VII | Amendment | 5 | Referendum.sol |
| VIII | Elections and Referendums | 8 | Election.sol, Referendum.sol |
| IX | Public Finance | 5 | Budget.sol |
| **TOTAL** | | **66** | **10 contracts** |

### Implementation Breakdown

| Category | Count |
|----------|-------|
| On-chain (automated) | 38 |
| On-chain (human-triggered) | 15 |
| Off-chain (referenced) | 3 |
| Mixed (automated + human-triggered) | 8 |
| On-chain (partial) | 1 |

---

*This focused draft covers the on-chain-implementable subset of the full Constitution (see `archive/Constitution_Unified_Draft_v1.md` for the complete 82-article, 13-Part draft including Secular State, Fundamental Rights, Regional Government, and Armed Forces provisions).*
