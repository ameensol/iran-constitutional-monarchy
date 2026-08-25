# Plan: SimGovernment — Interactive Governance Simulation

> **Prerequisite:** Provincial Councils plan (`wild-seeking-kettle.md`) must be complete first. All 10 contracts deployed and tested.

## Vision

SimCity for constitutional governance. The user deploys a fully populated Iranian government on a local blockchain, then interacts with it: clicking on politicians to kill them, triggering mass disasters, proposing legislation, and watching the constitutional machinery respond. Every process is visualizable, every deadline is trackable, and the Shah provides running commentary as guide and narrator.

**127 on-chain governance actions.** All playable.

---

## The Shah as Guide

A Shah avatar sits in the corner of the UI (think Clippy, but with gravitas). He:

- **Reacts to events in real-time.** When you kill a Majlis member: "One vacancy. The constitution handles this quietly: a by-election within 90 days. But kill enough of them..." When you nuke Tehran: "This is worse than what Mossadegh did to my Senate!"
- **Explains mechanics on hover/click.** First time you click on Parliament, he explains bicameralism. First time you see a bill, he walks you through the state machine.
- **Warns of consequences before you act.** "If you kill this justice, the Court drops below quorum. They will not be able to certify facts or review laws."
- **Celebrates resilience.** "The constitution held. Even after losing the monarch, the succession list ensured continuity."
- **Draws historical parallels.** Connects simulation events to real Iranian history (1906 Constitution, White Revolution, Mossadegh crisis, 1979).
- **Provides tutorial for new users.** Optional guided walkthrough of each institution.

Implementation: Commentary is a mapping of (event type, current state) → Shah quote. Pre-written quotes stored in a JSON/TS file. The Shah "speaks" via a toast/popover near his avatar. Context-aware: he knows what just happened and what the current system state is.

---

## Time Controls

| Mode | Mapping | Use Case |
|------|---------|----------|
| **Paused** | No time advancement | Inspect state, read commentary, plan actions |
| **Step** | Advance 1 day per click | Watch a specific deadline approach |
| **1x** | 1 sec = 1 day | Watch an election unfold |
| **10x** | 1 sec = 10 days | Watch a formation cycle |
| **100x** | 1 sec = 100 days | Watch a full Senate stagger rotation |
| **Skip to next event** | Jump to the nearest deadline | Skip dead time; smartest button |

Under the hood: `evm_increaseTime` + `evm_mine` on anvil. The "Skip to next event" button calculates the minimum of all active deadlines (election registration end, voting end, Crown action deadline, by-election timeout, Senate review period, fact certification deadline, confidence vote period, etc.) and warps to it.

During fast-forward, the UI batches time warps and polls contract state periodically. Events that fire during advancement are queued and replayed in the timeline.

---

## Interaction Layers

### Layer 1: Click on People

Every person is a clickable entity with a context menu:

**Individual actions:**
- **Kill** → triggers `removeMember` (parliament), succession (monarch), `claimPMVacancy` (PM), `vacateJusticeSeat` (justice). Requires Court fact certification first (auto-handled in sim).
- **Incapacitate** → Court certifies incapacity fact → `acknowledgeIncapacity` → member excluded from quorum but retains seat formally.
- **Resign** → same as kill mechanically, but the Shah commentary differs.
- **View Details** → panel showing: address, role, province, term start/end, voting history on every bill, party affiliation.

**Bulk actions (shift-click or drag-select):**
- Kill multiple → mass casualty event
- Incapacitate multiple → mass incapacitation
- Select by province → "all MPs from Tehran"
- Select by chamber → "all senators"
- Select by role → "all justices"

### Layer 2: Click on Institutions

Click any institution to expand its detail view:

**Parliament:**
- Majlis seating chart (members shown as dots, color = party, size = votes received)
- Senate seating chart (grouped by province, Crown senators highlighted)
- Active bills with status indicators
- Quorum bar (current active members / required quorum)
- Dissolution status
- Vacancy count + by-election deadlines

**Supreme Court:**
- 12 justice seats (visual: occupied/vacant/appointment-in-progress)
- Active constitutional reviews (with vote counts)
- Active fact certifications
- Active disputes
- Liveness status
- Appointment pipeline for each vacant seat (which stage: CrownNom1, CrownNom2, SenateList?)

**Crown:**
- Monarch identity + succession list (ordered, with eligibility status)
- Regent status
- Suspension status
- Pending ministerial acts (bills awaiting Crown action, with deadlines)
- Crown senator appointments (count vs. 10% cap)

**Executive:**
- PM identity + Deputy PM
- Formation stage (Idle, CrownNom1, CrownNom2, MajlisList, Dissolved)
- Caretaker status
- Active confidence/no-confidence votes
- Honeymoon period remaining
- Formation deadlines

**Budget:**
- Current fiscal year budget (status, total amount, allocated amount)
- Historical budgets
- Audit reports
- Allocation breakdown by category

### Layer 3: Click on Processes (Zoom Into Any Flow)

Click on any active process to see an animated state machine diagram:

**Bill lifecycle:** Introduced → MajlisVoting → SenateReview → CrownAction → Enacted (with all branches: SenateObjected → MajlisOverride, Returned, Referred → Constitutional/Vetoed). Current state highlighted, next deadline shown.

**Election lifecycle:** Registration → Voting → Tallied → Seated. Shows candidate list with vote counts, registration deadline, voting deadline.

**Senate selection:** Provincial council members voting for senator candidates. Shows province, council composition, candidate list, vote tallies.

**Formation cycle:** CrownNom1 → confidence vote → (fail) → CrownNom2 → confidence vote → (fail) → MajlisList → Crown picks → (timeout) → auto-appoint or dissolution. Current stage highlighted.

**Judicial appointment:** CrownNom1 → Senate confirm/reject → CrownNom2 → Senate confirm/reject → SenateList → Crown picks → (timeout) → auto-seat. Current stage highlighted.

**Constitutional amendment:** Proposal → Parliament adoption → Referendum → Enactment. Shows vote counts, thresholds, current phase.

**Emergency amendment:** Court certification → Enactment → 1-year timer → Expiry (rollback) or Confirmation (permanent). Live countdown.

### Layer 4: Trigger Events

**Disaster Panel (pre-built scenarios):**

| Disaster | Description | Contract Actions |
|----------|-------------|-----------------|
| **Nuke hits Tehran** | Kills monarch, PM, 80% of Majlis, Tehran provincial council, 3 justices | Succession + caretaker + mass vacancy + council dissolution + court quorum crisis |
| **Earthquake in Province X** | Kills provincial council + senator from that province | Council vacancy + Senate vacancy + by-election |
| **Plane crash** | Kills PM + Deputy PM | PM vacancy → caretaker → formation (no deputy to fall back on) |
| **Assassination of Monarch** | Kills only the monarch | Succession list activates (or Crown suspends if empty) |
| **Mass resignation (political crisis)** | 30% of Majlis resigns simultaneously | Mass vacancies → concurrent by-elections |
| **Revolution** | Crown suspended | PM returns laws, Senate handles formation, PM nominates justices |
| **Judicial massacre** | Kill 8 of 12 justices | Court below quorum → no constitutional review → no fact certification → succession/vacancy claims blocked |
| **Economic crisis** | Budget rejected twice | Government on prior-year continuing budget, PM under political pressure |
| **Provincial uprising in X** | Kill province's council + all citizens resign from voting | Province has no council → can't elect senators → Senate seat stays empty |
| **The full 1979** | Crown suspended + PM replaced + Majlis dissolved + Constitution amended | Total system stress test: every failsafe activates |

**Custom event builder:**
- Select targets (people, bulk by institution/province/role)
- Select action (kill, incapacitate, resign)
- Select timing (immediate, or schedule for a future date)
- Preview: Shah tells you what will happen before you confirm

**Political actions (player-as-actor):**
- File no-confidence motion (act as a Majlis member)
- Propose a bill (act as a Majlis member)
- Propose constitutional amendment
- Dissolve the Majlis (act as Crown)
- Refuse to act on a bill (let Crown deadline expire)
- Call elections for any chamber
- Start emergency amendment process

### Layer 5: Timeline & Event Log

Scrollable timeline at the bottom of the screen:

- Every contract event is logged with timestamp, description, affected entities
- Color-coded by institution (Parliament = blue, Crown = gold, Court = red, etc.)
- Click any event → jumps to the relevant process/person detail view
- Filter by: institution, event type, person, province
- Calendar overlay showing all upcoming deadlines as pins
- "Rewind" capability: fork the blockchain state and replay from an earlier point

---

## Technical Architecture

### Frontend Stack
- React + TypeScript + Vite
- ethers.js v6 for contract interaction
- @tanstack/react-query for state polling/caching
- Framer Motion for state machine animations
- A simple map component for the province view (SVG-based, not a full GIS)

### Backend: Anvil Node
- Local anvil with `--block-time 0` (instant mining)
- `--gas-limit 30000000` (generous for batch operations)
- Contract ABIs imported from `contracts/out/`
- Deployed addresses stored in `simulation/deployments.json`

### State Polling
- Poll contract state every N seconds (based on time speed)
- Event subscription via `eth_getLogs` for real-time updates
- React Query manages cache invalidation when time advances

### Shah Commentary Engine
- `simulation/frontend/src/data/shah-commentary.ts`
- Structured as: `Map<EventType, (state: GovernanceState) => string>`
- Context-aware: same event type produces different commentary based on current system state
- Quotes reference real Shah memoir passages where applicable
- ~200-300 pre-written commentary lines covering all major event types + edge cases

### Deployment Script
- `simulation/script/DeploySimulation.s.sol`
- Seeds: 31 provinces, ~100 citizens each, initial elections, full government seated
- Outputs: `deployments.json` with all contract addresses
- `simulation/run.sh` orchestrates anvil + deployment + frontend

---

## Governance State Summary View

A single "health dashboard" showing system status at a glance:

```
┌─────────────────────────────────────────────────────┐
│ CROWN          PARLIAMENT         EXECUTIVE         │
│ ♔ Active       Majlis: 142/162    PM: Seated        │
│ Succession: 3  Senate: 68/70      Formation: Idle   │
│ Suspended: No  Dissolved: No      Caretaker: No     │
│                                                     │
│ SUPREME COURT  ELECTIONS          BUDGET             │
│ Justices: 11/12  Active: 0       FY 1404: Active    │
│ Reviews: 1     By-elections: 2    Allocated: 72%     │
│ Quorum: ✓      Next deadline:     Audit: ✓          │
│                 42 days                              │
│                                                     │
│ PROVINCES (31)                                      │
│ [Map with color-coded cohorts A/B/C]                │
│ Council vacancies: 3  Senate vacancies: 1           │
└─────────────────────────────────────────────────────┘
```

Red/yellow/green indicators for each institution's health. When something is in crisis (quorum lost, Crown suspended, PM vacant), it pulses red and the Shah comments.

---

## Implementation Phases

### Phase 1: Core Infrastructure
- Anvil deployment script with full seeding
- Contract ABI integration + typed wrappers
- Basic React shell with routing
- Time control (pause, step, speeds, skip-to-next)
- State polling engine

### Phase 2: Institutional Views
- Parliament panel (Majlis + Senate with member details)
- Crown panel (succession, suspension, ministerial acts)
- Executive panel (PM, formation, confidence)
- Court panel (justices, reviews, facts)
- Province map + council details
- Budget panel
- Health dashboard

### Phase 3: People Interactions
- Clickable people with detail panels
- Context menu: kill, incapacitate, resign
- Bulk selection (by institution, province, role)
- Voting record display

### Phase 4: Process Visualizations
- Bill state machine (animated Mermaid or custom SVG)
- Election lifecycle visualization
- Formation cycle visualization
- Judicial appointment pipeline
- Amendment/referendum flow

### Phase 5: Disasters & Scenarios
- Pre-built disaster panel with 10+ scenarios
- Custom event builder
- Political action buttons (act-as-role)
- Preview + Shah warning before execution
- Consequence chain visualization (what will cascade from this action)

### Phase 6: Shah Commentary Engine
- ~200-300 context-aware commentary lines
- Tutorial mode for new users
- Historical parallel database (event → Iranian history reference)
- Avatar with emotional states (calm, concerned, alarmed, proud)

### Phase 7: Timeline & Polish
- Event log with filtering
- Calendar deadline overlay
- Blockchain state forking ("save game" / "load game")
- Visual polish, animations, responsive layout

---

## Verification

1. Fresh deployment seeds a complete government (all 10 contracts, 31 provinces, ~3100 citizens)
2. Time controls advance blockchain state correctly at all speeds
3. "Nuke Tehran" scenario triggers all expected cascades (succession + caretaker + mass vacancies)
4. Shah commentary fires for every major event type
5. Every institution panel correctly reflects on-chain state
6. Bill lifecycle is visually traceable from introduction to enactment
7. "Skip to next event" correctly identifies the nearest deadline across all contracts
8. Bulk kill of 80% of Majlis correctly drops quorum and freezes legislation
