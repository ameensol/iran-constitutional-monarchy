# SimGov Tour Refactor — Visual QA Report

**Test Environment:** http://localhost:5173 | **Date:** 2026-02-18 | **Browser:** Chrome (desktop 1316×917, mobile 375×812)

---

## Test 1: Dashboard Loads Normally — ✅ PASS

| Check | Result |
|---|---|
| All 6 institution cards visible (Crown, Parliament, Executive, Supreme Court, Elections, Budget) | ✅ |
| Header shows Day 247, Year 2584 Shāhanshāhi | ✅ |
| Speed controls: Pause, Step, 1x, 10x, 100x, Skip | ✅ |
| Active Bills table visible (3 bills: Education Reform Act, Infrastructure Budget, Trade Agreement) | ✅ |
| Event Log visible with categorized entries | ✅ |

---

## Test 2: Tour Hub — ✅ PASS (minor naming notes)

| Check | Result |
|---|---|
| Clicking "Tours" opens the Tour Hub | ✅ |
| Two tour cards visible: "Genesis: Building a Nation" and "Can I Trust the Crown?" | ✅ |
| Both show "Resets simulation" warning text | ✅ |
| **Note:** Hub is labeled "Walkthroughs" (not "Tour Hub"); button says "Tours" (not "Guided Tours") — cosmetic difference, functionally identical | ⚠️ Minor |
| Both cards show "6 steps" (the test plan mentions 7 frames for Genesis — see Test 3 note) | ⚠️ Minor |

---

## Test 3: Genesis Tour — Floating Narrator Panel — ✅ PASS

| Check | Result |
|---|---|
| **CRITICAL: Dashboard is VISIBLE behind the narrator** (no full-screen overlay) | ✅ |
| Floating narrator panel appears in the bottom-right corner | ✅ |
| Title: "An Empty Chain" | ✅ |
| Shah dialogue text and avatar present | ✅ |
| Progress bar shows **1 / 7** in footer | ✅ |
| **Note:** Hub cards say "6 steps" but the tour runs 7 frames — the Hub card count is off by 1 | ⚠️ Bug |

---

## Test 4: Genesis Tour — Spotlight Highlights — ✅ PASS

| Frame | Expected Highlight | Actual | Result |
|---|---|---|---|
| Frame 1 "An Empty Chain" | No highlights | All cards at normal opacity | ✅ |
| Frame 2 "Coronation" | Crown | Crown glows gold; all others at 35% opacity | ✅ |
| Frame 3 "The First Parliament" | Parliament | Parliament glows gold; Crown dimmed | ✅ |
| Frame 4 "A Government Takes Shape" | Executive | Executive glows gold | ✅ |
| Frame 5 "The Guardians of the Constitution" | Court | Supreme Court glows gold | ✅ |
| Frame 6 "A Living Nation" | Elections + Bills | Both Elections card AND Bills table have gold borders | ✅ |
| Frame 7 "Your Sandbox" | None | All cards at full opacity | ✅ |

CSS-verified dimming: non-highlighted cards render at exactly **0.35 opacity** ✅

---

## Test 5: Genesis Tour — Back Button — ✅ PASS

| Check | Result |
|---|---|
| Back button (←) navigates one step backward | ✅ |
| Spotlight highlights update correctly on backward navigation | ✅ |
| **Back button is `disabled: true` on Frame 1** | ✅ |

---

## Test 6: Genesis Tour — State Changes — ✅ PASS

| Frame | Expected State | Actual State | Result |
|---|---|---|---|
| Frame 1 | 0 Majlis, 0 Senators, Vacant Monarch | 0/149 Majlis, 0/67 Senators, Status=Suspended | ✅ |
| Frame 2 | Crown shows a monarch name / active | Status=Active, 3 Heirs, Crown action deadline: 8d | ✅ |
| Frame 3 | Parliament shows filled Majlis/Senate | 149/149 Majlis, 67/67 Senate | ✅ |
| Frame 4 | Executive shows a PM name | PM=Seated, 14 Cabinet Ministers | ✅ |
| Frame 5 | Court shows 12 justices | Justices: 12/12 | ✅ |
| Frame 6 | Bills table shows "Education Reform Act" | Education Reform Act in Active Bills | ✅ |

---

## Test 7: Crown Trust Tour — Floating Narrator with Decisions — ✅ PASS

| Check | Result |
|---|---|
| **CRITICAL: Dashboard visible behind narrator** | ✅ |
| Frame 1 title: "A Bill is Born" with Bills table highlighted | ✅ |
| Frame 2: Crown card highlights | ✅ |
| Frame 3: 3 decision buttons appear — "Sign the bill", "Return it", "Do nothing" | ✅ |

---

## Test 8: Crown Trust Tour — Sign Path — ⚠️ PARTIAL PASS

| Check | Result |
|---|---|
| Frame 4A title: "Enacted" | ✅ |
| **Bill in Active Bills table shows "Enacted" status** | ❌ Bill disappears from Active Bills table (enacted bills are removed, not shown with "Enacted" stage) |
| Frame 5A: "The Seal, Not the Gate" visible | ✅ |
| Frame 6: "What Did We Learn?" with flowchart | ✅ |
| **Flowchart shows "Sign" path highlighted** | ✅ |
| "Return to Tour Hub" button appears | ✅ |

**Bug:** After signing, the Education Reform Act is removed from the Active Bills table rather than showing an "Enacted" stage label. The same behavior occurs for the "Do Nothing" path. The "Return" path correctly shows a "Returned" status while the bill stays in the table. This is likely intentional (enacted bills leave the active queue), but conflicts with the test expectation.

---

## Test 9: Crown Trust Tour — Return Path — ✅ PASS

| Check | Result |
|---|---|
| "Start over" resets tour to Frame 1 with bill restored | ✅ |
| Frame 4B title: "Returned" | ✅ |
| **Bill in table shows "Returned" status** (confirmed via JS: "#1 Education Reform Act Returned 14d") | ✅ |
| Frame 5B: "The Majlis Pushes Back"; bill shows **"Majlis Override"** | ✅ |
| Frame 6: Flowchart shows **"Return" path highlighted** | ✅ |

---

## Test 10: Crown Trust Tour — Do Nothing Path — ⚠️ PARTIAL PASS

| Check | Result |
|---|---|
| Frame 4C title: "The Clock Runs Out" | ✅ |
| **Bill in table shows "Enacted" status** | ❌ Bill disappears from Active Bills (same behavior as Sign path) |
| Frame 5C: "Permissionless Enforcement" visible | ✅ |
| Frame 6: Flowchart shows **"Do Nothing" path highlighted** | ✅ |

---

## Test 11: Crown Trust Tour — Back Button with Branching — ✅ PASS

| Check | Result |
|---|---|
| Back button navigates correctly through the Do Nothing branch (6→5→4→3) | ✅ |
| State replays correctly: bill returns to "Crown Action" stage with bill back in table | ✅ |
| At Frame 3, all 3 choice buttons are available again | ✅ |
| Choosing a different path after going back works | ✅ |

---

## Test 12: Tour Close and Resume — ✅ PASS

| Check | Result |
|---|---|
| Clicking × closes the tour from mid-tour | ✅ |
| Returns to Tour Hub (Walkthroughs page) | ✅ |
| Dashboard state persists (Education Reform Act at "Crown Action" stage remains after close) | ✅ |

---

## Test 13: Mobile Responsive (375px) — ✅ PASS

| Check | Result |
|---|---|
| Narrator panel adapts to mobile (full width minus margins) | ✅ |
| Decision buttons wrap: Sign + Return side-by-side, Do Nothing on second row | ✅ |
| Text remains readable | ✅ |
| Cards stack vertically in single column | ✅ |
| Tour Hub cards readable and stacked | ✅ |

---

## Pass Criteria Summary

| Criterion | Status |
|---|---|
| No full-screen overlay on either tour | ✅ PASS |
| Dashboard institution cards glow gold when highlighted | ✅ PASS |
| Non-highlighted cards dim to ~35% opacity (measured: exactly 0.35) | ✅ PASS |
| All tour paths work with real simulation state changes | ✅ PASS |
| Back button replays state correctly in both tours | ✅ PASS |
| No console errors | ✅ PASS |

---

## Issues Found

### 🐛 Bug 1 — MEDIUM: Enacted bills disappear instead of showing "Enacted" status
**Tests:** 8, 10
After signing a bill (Sign path) or letting the deadline expire (Do Nothing path), the Education Reform Act disappears from the Active Bills table rather than showing an "Enacted" stage label. The test plan expects to see an "Enacted" status label. The "Return" path correctly keeps the bill visible with a "Returned" status. **Decision required: should enacted bills remain visible with status, or should the test expectation be updated to match current behavior?**

### ⚠️ Bug 2 — LOW: Tour Hub card shows "6 steps" but Genesis runs 7 frames
**Tests:** 2, 3
Both tour cards in the Hub say "6 steps," but the Genesis tour has 7 frames (progress shows 1/7). The Crown Trust tour correctly has 6 frames. Update the Genesis card metadata to show "7 steps."

### 📝 Note — Naming differences (no bug, documentation only)
- The button is labeled "Tours" (test plan says "Guided Tours")
- The Hub page title is "Walkthroughs" (test plan says "Tour Hub")
These are cosmetic — either update the test plan or the UI labels to match.
