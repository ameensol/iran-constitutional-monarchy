# Plan: SimGov Full Game — From Dashboard to SimCity for Governance

## Context

We have a fully working simulation: dashboard with 6 clickable institution cards, bills table, event log, bill lifecycle flowchart, 2 interactive tours (Genesis + Crown Trust), time controls, Shah commentary engine, disaster panel, institution detail views, person detail views, process flowcharts, and people management. The simulation engine handles ~700 people as first-class entities with constitutional cascades, 8 daily tickers, 10 disaster scenarios, and a mood-based Shah commentary system. All pure TypeScript, no blockchain.

The spec (`simGov/spec-v1.md`) describes the full vision: "SimCity for constitutional governance." This plan tracks what's been built and what remains.

---

## Phase 1: Simulation Foundation — COMPLETE

**Goal:** Expand types, add people, update engine with new actions and tickers.

### 1A. Expand types.ts — DONE

All types implemented in `simulation/types.ts`:
- `PersonId`, `PersonRole` (11 roles), `PersonStatus` (5 statuses), full `Person` interface
- `Province` interface with cohort/majlisSeatCount/councilSize
- `ElectionProcess` (phases: registration → voting → tallied → seated)
- `FormationProcess` (8 stages: Idle → CrownNom1 → ... → Dissolved)
- `JusticeAppointment` (7 phases: CrownNom1 → ... → Seated)
- `Amendment` + `NoConfidenceMotion`
- `GovState` with all sub-objects (crown, parliament, executive, court, elections, budget)
- Full `GovAction` union (ADVANCE_DAY, KILL_PERSON, KILL_BULK, CROWN_NOMINATE_PM, FILE_NO_CONFIDENCE, etc.)
- 10 `DisasterType` variants

### 1B. People generation — DONE

`simulation/nameGen.ts`:
- 60 Persian names (30 male, 30 female), 40+ last names, 8 parties with colors
- Staged builders: `generateRoyalFamily()`, `generateMajlis()`, `generateSenate()`, `generateExecutive()`, `generateJustices()`, `generateCouncils()`
- `generateInitialPeople()` creates ~700 people deterministically from seed

`simulation/provinces.ts`:
- 31 real Iranian provinces with cohort assignments (A/B/C for Senate stagger)
- Majlis seat allocation per province, TOTAL_MAJLIS_SEATS = 162

### 1C. Selector functions — DONE

`simulation/selectors.ts`:
- `activePeople()`, `personsByRole()`, `personsByProvince()`, `personById()`
- `activeMajlisMembers()`, `majlisSeats()`, `majlisHasQuorum()`
- `activeSenators()`, `senateSeats()`, `activeJustices()`, `courtHasQuorum()`, `courtInCrisis()`
- `activePM()`, `activeDeputyPM()`, `activeMonarch()`, `activeHeirs()`
- `recalculateDerived()` — called after any people mutation

### 1D. Ticker-based engine architecture — DONE

`simulation/engine.ts` refactored to sequential tickers:
```
advanceDay(state) →
  tickBills(s)         — bill deadline/vote logic
  tickElections(s)     — election phase advancement
  tickFormation(s)     — executive formation deadlines
  tickAppointments(s)  — judicial pipeline
  tickAmendments(s)    — parliament votes and referendums
  tickTerms(s)         — member term expiry
  tickBudget(s)        — fiscal year rollover
  tickCourt(s)         — court liveness
  tickAutoGenerate(s)  — periodic bill generation
  recalculateDerived(s)
```

Each ticker is a pure function in `simulation/tickers/` (9 files).

### 1E. Cascade logic — DONE

`simulation/people.ts`:
- `changePersonStatus()` applies constitutional cascades per role
- Monarch death → succession from list or Crown suspension
- Majlis/Senator loss → by-election scheduled
- Justice loss → appointment pipeline started
- PM loss → deputy takes over, formation begins
- `bulkChangeStatus()` for mass events

### 1F. Disasters — DONE

`simulation/disasters.ts`:
- 10 pre-built scenarios: nuke_tehran, earthquake, plane_crash, assassination, mass_resignation, revolution, judicial_massacre, economic_crisis, provincial_uprising, full_1979
- Each generates `GovAction[]` that cascade through `changePersonStatus()`
- Seeded sampling for deterministic victim selection

### 1G. Initial/Genesis state — DONE

`simulation/initialState.ts` — Day 247, ~700 people, 3 active bills, functional government
`simulation/genesis.ts` — Day 0 empty chain, 6-stage incremental build (coronation → parliament → executive → court → councils → living nation)

### 1H. Time controls — DONE

`shared/TimeControls.tsx` — Step (1 day), Play (auto-advance), Fast-forward, Skip (jump to next deadline)

**Files:** All listed files created and functional.

---

## Phase 2: Navigation + Institution Detail Views — COMPLETE

**Goal:** Click any institution card to see its full detail view.

### 2A. View routing — DONE

`shared/useNavigation.ts`:
```typescript
interface ViewState {
  view: 'dashboard' | 'institution' | 'bill' | 'process' | 'person' | 'tour' | 'tour-hub';
  institutionId?: InstitutionId;
  billId?: number;
  processId?: string;
  personId?: number;
  tourId?: string;
}
```
Navigation helpers: `goToDashboard()`, `goToInstitution(id)`, `goToBill(id)`, `goToPerson(id)`, `goToProcess(processId)`, `goToTour(tourId)`, `goToTourHub()`.

### 2B. Clickable InstitutionCard — DONE

Cards navigate to institution detail view on click.

### 2C. Institution detail shell — DONE

`institutions/InstitutionShell.tsx` — shared layout with back button, header, ornament divider.
`institutions/InstitutionDetail.tsx` — switches on `institutionId`, renders appropriate panel.

### 2D. Six institution panels — DONE

All 6 built:
- `CrownPanel.tsx` — Monarch, succession list, suspension status, pending actions
- `ParliamentPanel.tsx` — Majlis/Senate members, quorum, bills, vacancies
- `ExecutivePanel.tsx` — PM, formation pipeline, confidence, cabinet
- `CourtPanel.tsx` — Justice seats, active reviews, appointments, liveness
- `ElectionsPanel.tsx` — Active elections, by-election queue, schedule
- `BudgetPanel.tsx` — Fiscal year, allocation, audit status

**Files:** All listed files created. No SeatingChart.tsx, QuorumBar.tsx, SuccessionList.tsx, FormationPipeline.tsx, JusticeGrid.tsx, AppointmentPipeline.tsx as separate components — functionality inlined into panels.

---

## Phase 3: People Interactions — PARTIALLY COMPLETE

**Goal:** Every person is clickable with kill/incapacitate/resign actions.

### 3A. PersonDot component — NOT BUILT

Reusable atomic component for seating charts and people lists. Small colored circle (color = party), status overlays. Would enable hemicycle seating charts in ParliamentPanel.

### 3B. PersonContextMenu — NOT BUILT

Right-click or action menu on PersonDot: Kill, Incapacitate, Resign, View Details.

### 3C. PersonDetail view — DONE

`people/PersonDetail.tsx` — Full person view with name, role, province, status, action buttons.

### 3D. BulkSelector toolbar — NOT BUILT

Quick-select by role/province. Bulk Kill / Bulk Incapacitate buttons.

**Remaining files to create:**
- `people/PersonDot.tsx`
- `people/PersonContextMenu.tsx`
- `people/BulkSelector.tsx`
- `people/People.css`

---

## Phase 4: Process Visualizations — COMPLETE

**Goal:** Animated state machine diagrams for elections, formation, appointments, amendments.

### 4A-4B. Process flowcharts — ALL DONE

`processes/ProcessDetail.tsx` — router
Four flowcharts built:
- `processes/ElectionFlowchart.tsx`
- `processes/FormationFlowchart.tsx`
- `processes/AppointmentFlowchart.tsx`
- `processes/AmendmentFlowchart.tsx`

No shared `ProcessFlowchart.tsx` base component — each implements its own layout.

---

## Phase 5: Disaster Panel + Political Actions — PARTIALLY COMPLETE

**Goal:** Pre-built disaster scenarios and player-as-actor political actions.

### 5A. DisasterPanel — DONE

`disasters/DisasterPanel.tsx` — Side panel with 10 disaster cards, execute buttons.

### 5B. CustomEventBuilder — NOT BUILT

Select targets by role/province/name, preview consequences, execute custom events.

### 5C. Political action buttons — NOT BUILT

Contextual buttons on institution panels: file no-confidence, propose bill, dissolve Majlis, call elections, propose amendment.

### 5D. Disaster button on dashboard header — DONE

Header has "Disasters" button that opens the side panel.

**Remaining files to create:**
- `disasters/CustomEventBuilder.tsx`
- `disasters/ShahWarning.tsx` (confirmation modal)

---

## Phase 6: Shah Commentary Engine — COMPLETE

**Goal:** Replace flat quote system with context-aware engine.

### 6A-6E. Full Shah module — ALL DONE

`simulation/shah/` directory:
- `types.ts` — CommentaryEntry, ShahMood
- `mood.ts` — assessMood(state) → mood enum (hopeful, grave, proud, cautious, curious)
- `matcher.ts` — classifyEvent() + selectCommentary()
- `delivery.ts` — SessionState, dedup, rate-limiting
- `tutorials.ts` — first-time explanations
- `history.ts` — state tracking for narrative continuity
- `quotes/` — 8 files (crown, parliament, executive, court, elections, budget, disaster, milestone)
- `index.ts` — public API

`shared/ShahToast.tsx` — Toast notification (NOT persistent avatar). Mood-responsive commentary.

**What differs from original plan:**
- Shah is a toast notification, not a persistent bottom-right avatar with speech bubble
- No `ShahAvatar.tsx` component — using `ShahToast.tsx` instead
- No `TutorialTooltip.tsx` component — tutorials delivered via toast/tour system
- Tutorial persistence uses tour completion hooks, not separate localStorage

---

## Phase 7: Event Log + Polish — PARTIALLY COMPLETE

**Goal:** Filtering, navigation, and visual polish.

### Done:
- EventLog component with scrollable event list
- Events clickable to navigate to relevant institution view
- Consistent CSS theme across all views
- `npm run build` clean (needs verification)

### Not done:
- Event log filter bar (by institution marker)
- Extract shared CSS classes to `theme.css` (`.back-btn`, `.card`, `.section-title`)
- Responsive layout checks

---

## Current File Structure

```
src/
  App.tsx                    ✓
  main.tsx                   ✓

  simulation/
    types.ts                 ✓
    engine.ts                ✓
    initialState.ts          ✓
    useSimulation.ts         ✓
    selectors.ts             ✓
    people.ts                ✓
    nameGen.ts               ✓
    provinces.ts             ✓
    disasters.ts             ✓
    genesis.ts               ✓
    tickers/                 ✓ (9 files: bills, elections, formation,
      ...                       appointments, amendments, terms,
                                budget, court, autogen)
    shah/                    ✓ (13 files: types, mood, matcher,
      ...                       delivery, tutorials, history,
                                quotes/8 files, index)

  dashboard/                 ✓ (Dashboard, Header, InstitutionCard,
    ...                         InstitutionGrid, BillsTable, EventLog)

  bill-lifecycle/            ✓ (BillDetail, BillFlowchart, StatusBar)

  institutions/              ✓ (InstitutionDetail, InstitutionShell,
    ...                         CrownPanel, ParliamentPanel,
                                ExecutivePanel, CourtPanel,
                                ElectionsPanel, BudgetPanel)

  people/
    PersonDetail.tsx         ✓
    PersonDot.tsx            ✗ NOT BUILT
    PersonContextMenu.tsx    ✗ NOT BUILT
    BulkSelector.tsx         ✗ NOT BUILT

  processes/                 ✓ (ProcessDetail, ElectionFlowchart,
    ...                         FormationFlowchart, AppointmentFlowchart,
                                AmendmentFlowchart)

  disasters/
    DisasterPanel.tsx        ✓
    CustomEventBuilder.tsx   ✗ NOT BUILT
    ShahWarning.tsx          ✗ NOT BUILT

  tour/                      ✓ (TourHub, TourShell, GenesisTour,
    ...                         CrownTrustTour, GenesisStateCard,
                                genesisFrames, frames, tourRegistry,
                                useTourCompletion, ShahDialogue,
                                ProgressBar, DecisionButtons,
                                BillFlowchart)

  shared/
    useNavigation.ts         ✓
    TimeControls.tsx         ✓
    ShahToast.tsx            ✓
    Badge.tsx                ✓
    PersianArt.tsx           ✓
```

## Key Design Decisions

1. **No new dependencies.** Zero libs beyond React. useState + useReducer + useRef for everything.
2. **People are flat objects** with optional role-specific fields (not discriminated unions). Simpler for bulk operations and filtering.
3. **Counts derived via selectors**, not stored. Prevents sync bugs between person list and count fields.
4. **Tickers per subsystem** for `advanceDay`. Each ~50-100 lines, testable in isolation.
5. **Disasters are action sequence generators.** A disaster examines state and returns `GovAction[]`. Composable and testable.
6. **Shah commentary is layered:** quote storage, matching/selection, delivery/UI. Condition predicates enable context-awareness without complex matching logic.
7. **Seeded PRNG throughout.** Every stochastic decision deterministic from `day + entityId`.
8. **Side panel for disasters** (not modal) so dashboard health dots are visible during selection.

## Remaining Work

### Priority 1: Tour Refactor (see `tour-refactor-dashboard-visible.md`)
Tours currently use full-screen overlay (TourShell). Need to switch to floating narrator panel so dashboard is visible during tours.

### Priority 2: People Interactions (Phase 3 gaps)
- PersonDot component for seating charts
- PersonContextMenu (right-click actions)
- BulkSelector toolbar for mass operations

### Priority 3: Political Actions (Phase 5 gaps)
- Contextual action buttons on institution panels
- CustomEventBuilder for arbitrary events
- ShahWarning confirmation modal

### Priority 4: Polish (Phase 7 gaps)
- Event log filtering by institution
- CSS theme extraction
- Responsive layout
- Build verification
