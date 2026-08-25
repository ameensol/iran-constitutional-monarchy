# SimGov UX Testing Notes V1
## Date: February 16, 2026
## Tester: Claude (Automated UX Audit)
## App: SimGov — Interactive Governance Simulation
## URL: http://localhost:5177/

---

## 1. OVERALL STRUCTURE

The SimGov app is a single-page governance simulation with a dark, royal-themed UI. The dashboard serves as the central hub with 6 institution cards, an active bills table, an event log, and simulation controls in the header.

### Navigation Architecture:
- Dashboard (main hub)
  - The Crown (detail page)
  - Parliament (detail page)
  - Executive (detail page)
  - Supreme Court (detail page)
  - Elections (detail page)
  - Budget (detail page)
  - Bill Lifecycle (detail page per bill)
- Disasters panel (overlay/modal)
- Start Tour (modal walkthrough)
- Simulation controls (header bar)
- Event Log filters (bottom section)

---

## 2. PATHWAY TESTING RESULTS

### 2.1 Dashboard
- **Status:** Functional
- **Layout:** 3x2 grid of institution cards, Active Bills table, Event Log
- **Observations:**
  - Clean layout at 725px+ width
  - Institution cards are clickable (entire card is a button)
  - Green dot indicators on each card show health/active status
  - Active Bills table displays bill name, stage (color-coded badge), and deadline
  - Bills in the dashboard table ARE clickable → opens Bill Lifecycle view
  - Day counter, year, and calendar system (Shāhanshāhi) displayed in header
  - "SIM GOV" branding is prominent and stylistically consistent

### 2.2 The Crown
- **Status:** Functional
- **Content:** Monarch name + status, Succession List (3 heirs), Pending Actions, Crown-Appointed Senators
- **Interactive Elements:** Sign, Return, Refer to Court buttons for pending bills; Dissolve Parliament button
- **Observations:**
  - Clear hierarchy of information
  - Pending actions show bill name + deadline + 3 action buttons
  - Dissolve Parliament is a destructive action styled in red/warning — good UX signal
  - Crown-Appointed Senators listed with "Crown Senator" badges
  - ← Dashboard button works correctly

### 2.3 Parliament
- **Status:** Functional
- **Content:** Majlis seats (149/149) with party breakdown, Senate seats (66/67), Active Bills, Submit New Bill button
- **Observations:**
  - Colorful dot visualization for seat composition — visually engaging
  - Party legend with color dots + seat counts
  - Quorum bar displayed (76 threshold)
  - Senate has a separate dot visualization
  - Active bills show stage badges (Crown Action, Senate Review, Majlis Voting)
  - "Submit New Bill" button styled in gold/accent — clear call-to-action
  - **Issue:** Seat dots have no tooltips on hover — hovering over individual dots shows no info about which member occupies that seat. Consider adding tooltips.
  - **Issue:** Bills listed in the Parliament view are NOT clickable (unlike on the dashboard). Inconsistent behavior.

### 2.4 Executive
- **Status:** Functional
- **Content:** Prime Minister (name, status, party), Deputy PM, Formation Process (6 stages), Confidence section, Cabinet (14 ministers)
- **Observations:**
  - Formation Process shown as a horizontal stepper with stages: First Nomination → First Conf. Vote → Second Nomination → Second Conf. Vote → Majlis Candidate List → Picks from List
  - Stage indicators are small circles — could be clearer
  - "File No-Confidence Motion" button is the only interactive element
  - Cabinet list is straightforward with "Minister" badges
  - Page is long — requires scrolling to see all 14 ministers

### 2.5 Supreme Court
- **Status:** Functional
- **Content:** 12 Justice seats in 4x3 grid, Active Reviews section, Quorum bar
- **Observations:**
  - Clean grid layout for justice seats with seat number + name
  - Active Reviews shows count and a quorum progress bar (8 required)
  - No interactive elements beyond Dashboard button
  - **Suggestion:** Justice seats could be clickable for more details (appointment date, term, etc.)

### 2.6 Elections
- **Status:** Functional
- **Content:** Schedule (next election countdown), Active Elections status, Call General Election button
- **Observations:**
  - Very minimal page when no election is active
  - "Call General Election" button is a key action
  - Next election countdown (1360+ days) displayed clearly
  - "No elections in progress" empty state is clear
  - **Suggestion:** Could benefit from historical election results or past election data

### 2.7 Budget
- **Status:** Functional
- **Content:** Fiscal Year, Status (Proposed), Audit (Clean), Deadline, Allocation bar
- **Observations:**
  - Minimal page — just status info and an allocation progress bar at 0%
  - No interactive elements beyond Dashboard button
  - Deadline shown as "75d remaining"
  - **Suggestion:** Could benefit from budget breakdown, spending categories, or allocation controls

### 2.8 Bill Lifecycle View
- **Status:** Functional
- **Content:** Full legislative flowchart for individual bills
- **Observations:**
  - Accessed by clicking a bill row in the Active Bills table on dashboard
  - Shows complete flowchart: Introduced → Majlis Voting → Senate Review → Crown Action → Enacted
  - Alternative paths: Rejected (Majlis failed), Senate Objected (Returns to Majlis), Returned (Crown returns bill), Majlis Override (2/3 supermajority), Referred (Reconsidered), Vetoed (Override failed)
  - Color-coded legend: Completed, Current, Future, Enacted, Rejected/Vetoed
  - Check marks on completed stages
  - Bottom info bar shows current stage, vote tallies, and deadline
  - **Issue:** Flowchart requires horizontal scrolling at standard viewport (725px). Right side nodes are cut off: "Senate Revie...", "Senate Objec...", "Majlis Overri..." — no visual indicator that horizontal scrolling is available
  - **Issue:** "← Back to Dashboard" button text differs from other pages that use "← Dashboard" — inconsistent labeling

---

## 3. MODAL/OVERLAY TESTING

### 3.1 Disaster Scenarios Panel
- **Status:** Functional
- **Content:** 9 disaster scenarios with Execute buttons
- **Scenarios Found:**
  1. Nuclear Strike on Tehran (crown, parliament, executive, court)
  2. Earthquake in Province (parliament, elections)
  3. Plane Crash (executive)
  4. Assassination of the Monarch (crown)
  5. Mass Resignation (parliament)
  6. Revolution (crown)
  7. Judicial Massacre (court)
  8. Economic Crisis (budget)
  9. Provincial Uprising (elections)
  10. The Full 1979 (crown, parliament, executive)
- **Observations:**
  - Each scenario has institution tags showing affected areas
  - Execute buttons are styled in red/warning — good destructive action signal
  - Close (✕) button in top-right works correctly
  - Panel appears as a right-side overlay, partially obscuring the dashboard
  - Scrollable within the panel to see all scenarios
  - **Suggestion:** Could benefit from a confirmation dialog before executing a disaster (no "Are you sure?" step observed)

### 3.2 Start Tour
- **Status:** Functional
- **Content:** "Tour 1 — Can I Trust the Crown?" — 6-step guided walkthrough
- **Observations:**
  - Step 1: "A Bill is Born" — introduces bill submission
  - Step 2: "Parliament Speaks" — shows Majlis/Senate voting
  - Progress indicator (diamond dots) and "X / 6" counter
  - Close tour button (✕) works correctly
  - Continue button advances through steps
  - Nice character illustration with speech bubble text — engaging narrative style
  - Bill status card updates within the tour to show progress
  - **Suggestion:** No "Previous" button to go back in tour steps — can only go forward or close

---

## 4. SIMULATION CONTROLS TESTING

### 4.1 Header Controls
- **Pause (⏸):** Present, highlighted in gold when active
- **Step (⏯ - 1 day):** Advances simulation by exactly 1 day. Day counter updates, deadlines decrease. Working correctly.
- **1x (▶ - 1 day/sec):** Play at normal speed
- **10x (⏩):** Fast forward
- **100x (⏩⏩):** Very fast forward
- **Skip to next event (⏭):** Jumps to the next significant event. Tested: jumped from Day 381 to Day 389 (Provincial Development Act passing). Working correctly.

### 4.2 Observations:
- Controls are well-positioned in the header for constant access
- Speed buttons are clearly differentiated
- Active button gets highlighted styling
- Day counter updates in real-time
- **Issue:** When simulation advances, a flavor quote appears at the bottom of the page. This is a nice touch but disappears quickly and may be missed. Consider making it more persistent or adding a notification area.

---

## 5. EVENT LOG TESTING

### 5.1 Filters
All 7 filters tested and functional:
- **All:** Shows all events (default)
- **Crown:** Shows only Crown-related events (deadline expirations, etc.)
- **Parliament:** Shows bill submissions, voting tallies
- **Executive:** Shows executive branch events
- **Court:** Shows Supreme Court appointments, reviews
- **Elections:** Shows election lifecycle events (start, voting, tally, seating)
- **Budget:** Shows fiscal year events

### 5.2 Observations:
- Filters work correctly — each shows only relevant events
- Active filter gets a highlighted border/outline
- Events show day number, description, and technical function call details
- Color-coded dots next to events match the institution color
- Events are in reverse chronological order (newest first)
- **Suggestion:** No search functionality within the event log
- **Suggestion:** No pagination or "load more" — all events appear to be loaded at once

---

## 6. RESPONSIVE DESIGN TESTING

### 6.1 Viewport Tests:
- **1280px width:** Excellent — all content fits, header on one line, cards readable
- **725px width (default):** Good — content fits with minor truncation on bill lifecycle flowchart
- **550px width:** Broken — institution cards severely truncated, text cut off, header overflows
- **400px width:** Broken — app is essentially unusable, all content overlapping and truncated

### 6.2 Critical Issues:
- **No responsive breakpoints** for mobile/tablet views
- Institution card grid does not reflow to single column on narrow screens
- Header does not collapse or wrap for smaller screens
- No hamburger menu or mobile navigation
- Bill lifecycle flowchart has no responsive adaptation

---

## 7. ACCESSIBILITY OBSERVATIONS

- **Color contrast:** Gold text on dark background appears readable but may not meet WCAG AA standards for smaller text
- **Status indicators:** Green dots rely solely on color — no accompanying text or icon for colorblind users
- **Keyboard navigation:** Not explicitly tested but button elements should be focusable
- **Screen reader support:** Institution cards are buttons without visible labels — the card content serves as the label but may not be announced clearly
- **Focus indicators:** Not observed — may need visible focus outlines for keyboard navigation
- **ARIA labels:** Simulation control buttons (some unlabeled) may lack proper ARIA labels

---

## 8. VISUAL DESIGN OBSERVATIONS

- **Theme:** Dark royal/imperial aesthetic — consistent throughout
- **Typography:** Serif headings (elegant), monospace for technical data — good differentiation
- **Color palette:** Dark navy background, gold accents, green for positive/active, red for destructive/warnings
- **Icons:** Consistent use of institutional icons (crown, parliament building, scales, etc.)
- **Spacing:** Generally good use of whitespace on desktop
- **Card design:** Bordered cards with gold/dark theme — visually distinct and scannable
- **Stage badges:** Color-coded (green for Crown Action, teal for Senate Review, etc.) — helpful visual cues

---

## 9. SUMMARY OF ISSUES (Prioritized)

### Critical:
1. **No responsive design** — app is unusable below ~700px viewport width
2. **Bill lifecycle flowchart overflows** without scroll indicator at standard widths

### High:
3. **Inconsistent bill clickability** — bills are clickable on dashboard but NOT in Parliament detail view
4. **Inconsistent back button labeling** — "← Dashboard" vs "← Back to Dashboard"
5. **No confirmation dialogs** for destructive actions (Execute disaster, Dissolve Parliament)

### Medium:
6. **No tooltips on Parliament seat dots** — missed information opportunity
7. **Tour has no "Previous" button** — can only go forward
8. **Color-only status indicators** — accessibility concern for colorblind users
9. **Event log has no search/filter by text** functionality
10. **Budget and Elections pages are sparse** — limited interactivity

### Low:
11. **Flavor quotes** during simulation appear briefly and may be missed
12. **No visible keyboard focus indicators** observed
13. **Some simulation control buttons lack text labels** — rely on icon-only
14. **No loading states or transitions** between views (instant page swaps)

---

## 10. POSITIVE HIGHLIGHTS

1. **Rich simulation depth** — complex legislative process modeled accurately
2. **Bill lifecycle flowchart** is an excellent visualization of the legislative process
3. **Event log** is comprehensive with good filtering
4. **Disaster scenarios** add engaging "what if" gameplay
5. **Tour feature** provides excellent onboarding with narrative storytelling
6. **Consistent visual theme** — the royal/imperial aesthetic is cohesive
7. **Simulation controls** are intuitive and well-positioned
8. **Color-coded stage badges** make bill progress easy to scan
9. **Real-time data updates** across all cards when simulation advances

---

*End of UX Testing Notes V1*
*Tested pathways: Dashboard, The Crown, Parliament, Executive, Supreme Court, Elections, Budget, Bill Lifecycle, Disasters Panel, Tour, Simulation Controls, Event Log Filters, Responsive Behavior*
