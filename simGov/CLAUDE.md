# SimGov — Interactive Governance Simulation

## What This Is
A browser-based interactive simulation of constitutional governance, built in React + TypeScript. No blockchain, no ethers.js. Pure TypeScript state machine modeling the same governance logic as the Solidity contracts.

## Stack
- **Framework:** Vite + React 19 + TypeScript
- **Dependencies:** React and React DOM only. Zero additional libraries.
- **State:** `useState` + `useReducer` + `useRef`. No Redux, no Zustand, no context providers.
- **Routing:** `useState<ViewId>` in App.tsx. No react-router.
- **Animation:** CSS transitions only. No Framer Motion.
- **Styling:** Plain CSS files. No CSS modules, no Tailwind, no styled-components.

## Conventions
- One CSS file per view: `theme.css` (shared), `Dashboard.css`, `BillDetail.css`, `Tour.css`
- Simulation engine is pure functions returning new state objects (immutable)
- All UI text is plain English. No Solidity function names in user-facing text.
- Event log is dual-layer: English description on top, decoded function call (monospace) below.
- Persian imperial aesthetic: dark backgrounds, gold accents, Playfair Display headings, Inter body text, JetBrains Mono for code.

## Color Palette (CSS variables in theme.css)
- `--night` #0B0F1A — darkest background
- `--obsidian` #141929 — card backgrounds
- `--lapis` #1A2140 — borders, subtle elements
- `--gold` #C9A84C — primary accent
- `--pale-gold` #E8D5A3 — secondary accent, labels
- `--cream` #F0E6D0 — body text
- `--pearl` #FAFAF5 — headings, emphasis
- `--rose` #8B3A4A — crisis, danger
- `--emerald` #2D6B4F — healthy, success
- `--turquoise` #1A7A7A — info, waiting

## Assets
SVG art assets are in `app/public/assets/`. They use CSS filter classes (`.persian-art`, `.persian-art-dim`) to convert black SVGs to gold-tinted display.

## Running
```bash
cd simGov/app
npm run dev    # Dev server
npm run build  # Production build
```
