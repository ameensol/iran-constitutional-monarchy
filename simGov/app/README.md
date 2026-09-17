# Constitution Lab

Constitution Lab is the public, bilingual interface for the SimGov constitutional simulator. It combines an English/Persian civic learning site with the existing deterministic browser simulation.

## Run the public site

From the repository root:

```bash
npm install --prefix simGov/app
npm run dev
```

Open `http://127.0.0.1:5173/`. The public website and browser simulator do not require Foundry, a wallet, an account, or a blockchain connection.

## Quality gates

```bash
npm run lint
npm run build
npm run test:app
npm run test:e2e
npm run test:contracts
npm run test:sdk
```

The app test suite covers content pairing, routing and RTL, component behavior, local persistence recovery, feedback preview behavior, and critical axe accessibility checks. Contract and SDK suites remain separate repository gates.

## Content and design system

- Canonical constitutional text is parsed from `constitution/Constitution.md` and `constitution/Constitution-fa.md` by `scripts/build-content.mjs`.
- The build fails if the 66 English and Persian article IDs do not pair.
- Reusable interface foundations live in `src/design-system`.
- The development catalog is available at `/en/dev/design-system` (or `/fa/dev/design-system`) while Vite is in development mode.
- Persian UI copy is a complete draft and must receive native-speaker review before public release.

## Feedback preview

Without `VITE_FEEDBACK_ENDPOINT`, the community form validates and saves an unsent draft only. Nothing is transmitted. A future endpoint can use the existing transport-independent adapter without redesigning the form.
