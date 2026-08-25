# Tour Testing Plan — simGov

Open http://localhost:5173 in the browser. Test each tour below. For each tour, report:
- Whether the Tour Hub loads with all 8 tours grouped into 4 categories
- Whether each tour's frames render correctly (Shah dialogue, decision buttons, highlights)
- Whether branching choices work (different paths lead to different frames)
- Whether the Back button works (replays state correctly)
- Whether "Return to Tour Hub" works at the end
- Any errors in the console

---

## Step 0: Tour Hub

1. Click the "Walkthroughs" button on the dashboard (top area)
2. Verify you see **4 category sections**: Foundations, How It Works, Accountability, Resilience
3. Verify you see **8 tour cards** total:
   - Foundations: "Genesis: Building a Nation", "Can I Trust the Crown?"
   - How It Works: "Who Chooses the Prime Minister?", "The Guardians", "Election Day"
   - Accountability: "The People's Veto", "Rewriting the Rules"
   - Resilience: "When the System Breaks"
4. Each card should show an SVG art image, title, description, step count, and "Resets simulation" warning

---

## Step 1: Test Tour 3 — "Who Chooses the Prime Minister?"

1. From Tour Hub, click "Who Chooses the Prime Minister?"
2. **Frame 1 "A Vacancy"**: Should see Shah dialogue about PM resignation. Executive card should be highlighted. Click "Continue".
3. **Frame 2 "The Crown Proposes"**: Shah talks about Crown nominating. Executive + Crown highlighted. Click "Continue".
4. **Frame 3 "The Majlis Decides"**: Two choices appear: "Grant confidence" and "Deny confidence".

**Path A — Grant confidence:**
5. Click "Grant confidence"
6. **Frame 4A "A Government is Formed"**: Shah explains confidence granted. Executive highlighted.
7. Click "Continue" → **Frame 6 "What Did We Learn?"**: Summary frame. No highlights.
8. Click "Start over" to restart, then test Path B.

**Path B — Deny confidence → Grant second:**
9. Click "Deny confidence" at Frame 3
10. **Frame 4B "The Crown Tries Again"**: Two choices: "Grant confidence" / "Deny again"
11. Click "Grant confidence" → **Frame 5B1 "Second Time's the Charm"**
12. Click "Continue" → Frame 6 summary

**Path C — Deny twice:**
13. Start over, deny at Frame 3, deny again at Frame 4B
14. **Frame 5B2 "The Majlis Takes Over"**: Parliament + Executive highlighted
15. Click "Continue" → Frame 6 summary

16. Test Back button at various points — should replay correctly
17. Click "Return to Tour Hub" at Frame 6

---

## Step 2: Test Tour 4 — "The Guardians"

1. Click "The Guardians" from Tour Hub
2. **Frame 1 "An Empty Seat"**: Court card highlighted (should show 11/12 justices after state change)
3. **Frame 2 "The Crown Nominates"**: Crown + Court highlighted
4. **Frame 3 "The Senate Votes"**: Two choices: Confirm / Reject

**Path A — Confirm:**
5. Click "Confirm" → **Frame 4A "Justice Seated"**: Court highlighted, should be back at 12/12
6. Continue → Frame 6 summary

**Path B — Reject → Confirm second:**
7. Start over, reject at Frame 3 → **Frame 4B "Try Again"**: Two choices
8. Click "Confirm second nominee" → **Frame 5B1**: Court at full strength

**Path C — Reject twice:**
9. Start over, reject at Frame 3, reject again at Frame 4B
10. **Frame 5B2 "The Senate's List"**: Parliament + Court highlighted

11. Test Back button, then "Return to Tour Hub"

---

## Step 3: Test Tour 5 — "Election Day"

1. Click "Election Day" from Tour Hub
2. **Frame 1 "Parliament Dissolved"**: Parliament card highlighted. Should show dissolved state.
3. Click Continue → **Frame 2 "Registration Opens"**: Elections section highlighted
4. Click Continue → **Frame 3 "The Secret Ballot"**: Elections highlighted
5. Click Continue → **Frame 4 "The Count"**: Elections + Parliament highlighted. Parliament should be reconstituted.
6. Click Continue → **Frame 5 "What Did We Learn?"**: Summary, no highlights
7. Test Back button through all 5 frames
8. Click "Return to Tour Hub"

---

## Step 4: Test Tour 6 — "The People's Veto"

1. Click "The People's Veto" from Tour Hub
2. **Frame 1**: Executive + Parliament highlighted
3. **Frame 2 "The Motion is Filed"**: Parliament + Executive highlighted. No-confidence motion should appear.
4. **Frame 3 "The Vote"**: Two choices

**Path A — Passes:**
5. Click "No-confidence passes" → **Frame 4A "A New Beginning"**: PM removed, executive in caretaker mode
6. Continue → Frame 5 summary

**Path B — Fails:**
7. Start over, click "No-confidence fails" → **Frame 4B "The Government Survives"**: PM stays
8. Continue → Frame 5 summary

9. Test Back, then "Return to Tour Hub"

---

## Step 5: Test Tour 7 — "Rewriting the Rules"

1. Click "Rewriting the Rules" from Tour Hub
2. **Frame 1 "A Proposal"**: Parliament highlighted. Amendment proposed.
3. **Frame 2 "Parliament Debates"**: Parliament highlighted
4. **Frame 3 "The Parliamentary Vote"**: Two choices

**Path A — Supermajority → Referendum passes:**
5. "Supermajority reached" → **Frame 4A "To the People"**: Elections highlighted. Two choices.
6. "Referendum passes" → **Frame 5A "The Constitution Evolves"**: Enacted
7. Continue → Frame 6 summary

**Path B — Supermajority → Referendum fails:**
8. Start over, supermajority → "Referendum fails" → **Frame 5B "The People Said No"**

**Path C — Falls short:**
9. Start over, "Falls short" → **Frame 4B "The Rules Stand"**

10. Test Back, then "Return to Tour Hub"

---

## Step 6: Test Tour 8 — "When the System Breaks"

1. Click "When the System Breaks" from Tour Hub
2. **Frame 1 "A Nation at Peace"**: All 4 institution cards highlighted
3. **Frame 2 "Choose Your Crisis"**: 4 choices appear (Earthquake, Assassination, Judicial massacre, Full collapse)

**Test each disaster:**

**Earthquake:**
4. Click "Earthquake" → **Frame 3A "The Ground Shakes"**: Elections highlighted. Dashboard should show casualties.
5. Continue through Frames 4-5-6-7 (recovery). Days advance, events appear.

**Assassination:**
6. Start over → click "Assassination" → **Frame 3B "The Crown Falls"**: Crown highlighted. Succession should trigger.

**Judicial massacre:**
7. Start over → click "Judicial massacre" → **Frame 3C "The Court Empties"**: Court highlighted. Multiple appointment pipelines start.

**Full collapse:**
8. Start over → click "Full collapse" → **Frame 3D "Everything at Once"**: Crown + Parliament + Executive highlighted. Crown suspended, PM resigned, Parliament dissolved.

9. For at least one disaster path, continue all the way to Frame 7 "What Did We Learn?"
10. Test Back button from recovery frames
11. Click "Return to Tour Hub"

---

## Step 7: Completion Tracking

1. After completing at least one new tour, go back to Tour Hub
2. Verify a green checkmark (✓) appears on completed tour cards
3. The checkmark should persist if you navigate away and come back

---

## What to Report

For each tour, note:
- ✅ or ❌ for: loads, frames render, choices work, back works, highlights work, completion tracked
- Any console errors (check DevTools Console)
- Any visual issues (layout broken, text cut off, buttons not clickable)
- Any state issues (dashboard doesn't update, wrong data shown)
