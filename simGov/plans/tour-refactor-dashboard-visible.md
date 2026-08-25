# Tour System Refactor: Dashboard-Visible Tutorials

## Status: NOT STARTED

All items in this plan are still TODO. The current tour system uses TourShell.tsx (full-screen fixed overlay) that completely hides the dashboard.

## Context

The current tour system uses `TourShell.tsx`, a full-screen fixed overlay (`position: fixed; inset: 0`) with 75% dark background that completely hides the dashboard. Tours show Shah dialogue and custom state cards inside the overlay, but the user never sees the real simulation dashboard responding to state changes. The Genesis tour dispatches real actions (`GENESIS_ADVANCE`) but the user can't watch the InstitutionGrid update. The Crown Trust tour doesn't touch simulation state at all — it uses hardcoded bill data via `StateCard.tsx`.

The goal: tours become game-style tutorials where the real simulation is visible and updating, with a non-blocking narration panel and spotlight highlights on relevant dashboard elements.

## Current Tour Files

```
tour/
  TourHub.tsx              — Tour selection menu (keep)
  TourHub.css              — Tour hub styles (keep)
  TourShell.tsx            — Full-screen overlay (DELETE → replace with TourNarrator)
  Tour.css                 — Tour styles (MODIFY — remove overlay styles)
  GenesisTour.tsx           — Genesis tour logic (MODIFY — swap TourShell → TourNarrator)
  CrownTrustTour.tsx        — Crown Trust tour logic (MODIFY — add real state, swap shell)
  GenesisStateCard.tsx       — Genesis state display (DELETE — real dashboard replaces it)
  StateCard.tsx             — Crown Trust state display (DELETE — real dashboard replaces it)
  genesisFrames.ts          — Genesis tour frame data (MODIFY — add highlights)
  frames.ts                — Crown Trust frame data (MODIFY — add highlights, remove bill)
  tourRegistry.ts           — Tour metadata (MODIFY — mark Crown Trust as resetsState)
  useTourCompletion.ts      — Completion tracking hook (keep)
  ShahDialogue.tsx          — Narrator frame component (keep)
  ProgressBar.tsx           — Step indicator (keep)
  DecisionButtons.tsx       — Advance buttons (keep)
  BillFlowchart.tsx         — Bill lifecycle diagram (keep — rendered in narrator panel)
```

## Approach

### 1. Replace TourShell with TourNarrator (floating panel)

**Delete:** `tour/TourShell.tsx`
**Create:** `tour/TourNarrator.tsx` + `tour/TourNarrator.css`

A compact floating card anchored to bottom-right of the viewport:
- `position: fixed; bottom: 20px; right: 20px; width: 380px; max-height: 55vh`
- `z-index: 20` (above dashboard cards, below ShahToast at z-100)
- Same visual language: obsidian bg, gold border, corner ornaments, Playfair headings
- Same props interface as TourShell: `tourTitle`, `frameTitle`, `totalSteps`, `currentStep`, `onClose`, `onBack`, `canGoBack`, `children`
- Smaller Shah avatar (48px vs 60px), tighter text to fit compact panel
- ProgressBar and back button in footer (reuse existing components)
- No dark scrim/backdrop — dashboard fully visible and interactive

### 2. Spotlight highlight system (CSS-based)

**Create:** `tour/TourSpotlight.css` + `tour/useTourSpotlight.ts`

Each dashboard element gets a `data-tour-id` attribute. The hook manages which elements glow.

CSS classes:
- `.tour-highlight` — gold box-shadow ring + subtle pulse animation
- `.tour-dimmed` — `opacity: 0.4` on non-highlighted cards (creates focus)

Hook interface:
```ts
useTourSpotlight(highlightIds: string[])
// On change: applies .tour-highlight to matching [data-tour-id] elements,
// applies .tour-dimmed to non-matching institution cards, clears on empty array
```

**Modify** to add `data-tour-id`:
- `dashboard/InstitutionCard.tsx` — InstitutionCard already has `onClick` prop; add `tourId` prop → `data-tour-id={tourId}`
- `dashboard/InstitutionGrid.tsx` — pass `tourId="crown"`, `"parliament"`, `"executive"`, `"court"`, `"elections"`, `"budget"` to each card
- `dashboard/Dashboard.tsx` — add `data-tour-id="bills"` wrapper around BillsTable, `data-tour-id="events"` around EventLog

### 3. Refactor Genesis Tour

**Modify:** `tour/GenesisTour.tsx`, `tour/genesisFrames.ts`
**Delete:** `tour/GenesisStateCard.tsx`

The dispatch logic stays identical (`RESET_TO_GENESIS` on mount, `GENESIS_ADVANCE` on continue). Changes:
- Replace `TourShell` → `TourNarrator`
- Remove `GenesisStateCard` (the real dashboard IS the state card now)
- Add `useTourSpotlight` hook
- Each frame specifies which elements to highlight

Frame highlights:
| Stage | Highlights | User sees on dashboard |
|-------|-----------|----------------------|
| 0 — Empty Chain | `[]` (no dimming) | All institutions at zero/vacant/crisis |
| 1 — Coronation | `['crown']` | Crown card lights up: Active, 3 heirs |
| 2 — Parliament | `['parliament']` | Parliament card: 162 Majlis, 67 Senate |
| 3 — Executive | `['executive']` | Executive card: PM Seated, 14 ministers |
| 4 — Supreme Court | `['court']` | Court card: 12 justices |
| 5 — Living Nation | `['elections', 'bills']` | First bill appears in BillsTable |
| 6 — Your Sandbox | `[]` (clear all) | Full dashboard, no dimming |

Add `highlights: string[]` field to `GenesisFrame` interface in `genesisFrames.ts`.

### 4. Refactor Crown Trust Tour

**Modify:** `tour/CrownTrustTour.tsx`, `tour/frames.ts`
**Modify:** `App.tsx` — pass `state`, `dispatch`, `speed`, `setSpeed` to CrownTrustTour
**Modify:** `simulation/types.ts` — add `ADVANCE_BILL_TO_STAGE` action
**Modify:** `simulation/engine.ts` — handle `ADVANCE_BILL_TO_STAGE`
**Delete:** `tour/StateCard.tsx` (real BillsTable replaces it)

Currently CrownTrustTour only receives `onClose` and uses hardcoded bill states in `frames.ts`. The refactored version:
- Receives `state`, `dispatch`, `speed`, `setSpeed` (same as Genesis)
- On mount: pauses simulation
- Frame 1: dispatches `SUBMIT_BILL` to create a real bill (captures its ID)
- Frame 2: dispatches `ADVANCE_BILL_TO_STAGE` to jump bill to `Crown Action` stage (avoids waiting through 14 days of voting)
- Frame 3: decision frame (Sign / Return / Do Nothing) — user chooses
- Frames 4A/4B/4C: dispatches `SIGN_BILL`, `RETURN_BILL`, or fast-forwards time (14 `ADVANCE_DAY` dispatches)
- All state changes visible on real dashboard (BillsTable, Crown pending actions, EventLog)
- BillFlowchart still rendered inside narrator panel on final frame

`ADVANCE_BILL_TO_STAGE` action: updates a bill's stage, vote counts, and deadline in one dispatch. Needed because the tour can't wait through multi-day voting periods.

Refactored `frames.ts`: remove `bill: BillState` field, add `highlights: string[]`. Frame text stays, decision structure stays, but bill data comes from real state.

### 5. Clean up Tour.css

**Modify:** `tour/Tour.css` — remove `.overlay` (full-screen backdrop), `.tour-panel` (centered modal), and any styles that reference the old layout. Keep `.tour-content.fading`, `.shah-dialogue`, `.decisions`, `.decision-btn`, `.flowchart-*`.

### 6. Update TourHub metadata

**Modify:** `tour/tourRegistry.ts` — set `resetsState: true` for Crown Trust (it now modifies state).

## Files Summary

| Action | File |
|--------|------|
| CREATE | `tour/TourNarrator.tsx` |
| CREATE | `tour/TourNarrator.css` |
| CREATE | `tour/TourSpotlight.css` |
| CREATE | `tour/useTourSpotlight.ts` |
| DELETE | `tour/TourShell.tsx` |
| DELETE | `tour/GenesisStateCard.tsx` |
| DELETE | `tour/StateCard.tsx` |
| MODIFY | `tour/GenesisTour.tsx` |
| MODIFY | `tour/genesisFrames.ts` |
| MODIFY | `tour/CrownTrustTour.tsx` |
| MODIFY | `tour/frames.ts` |
| MODIFY | `tour/Tour.css` |
| MODIFY | `tour/tourRegistry.ts` |
| MODIFY | `dashboard/InstitutionCard.tsx` — add `tourId` prop |
| MODIFY | `dashboard/InstitutionGrid.tsx` — pass `tourId` to cards |
| MODIFY | `dashboard/Dashboard.tsx` — add `data-tour-id` wrappers |
| MODIFY | `App.tsx` — pass sim props to CrownTrustTour |
| MODIFY | `simulation/types.ts` — add `ADVANCE_BILL_TO_STAGE` |
| MODIFY | `simulation/engine.ts` — handle new action |

## Implementation Order

1. **Spotlight infrastructure** (non-breaking): CSS, hook, data-tour-id attributes
2. **TourNarrator** (new component, no wiring yet)
3. **Genesis Tour migration**: swap TourShell → TourNarrator, add highlights, remove GenesisStateCard
4. **Crown Trust migration**: add engine action, refactor frames.ts, wire real dispatching, swap TourShell → TourNarrator, remove StateCard
5. **Cleanup**: delete TourShell.tsx, clean Tour.css

## Verification

- Run `npm run dev` in `simGov/app`
- Open Tours from dashboard header
- **Genesis tour**: each "Continue" should show the dashboard cards lighting up with gold glow, counts populating in real-time. No full-screen overlay blocking the view.
- **Crown Trust tour**: a real bill should appear in BillsTable. Crown pending actions should increment. Signing/returning should update the real bill state.
- Narrator panel should be a compact floating card at bottom-right, not blocking the dashboard.
- Close button, back button, and progress bar should all work.
- Completing a tour should mark it done in TourHub (localStorage checkmark).
