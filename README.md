# KYFR Onboarding

A two-minute, four-section preview of KYFR for new users. They answer one or two questions each about income, savings, credit and insurance. After every section they get a personalised reveal, then a prioritised report with the working behind it, then a prompt to download the app.

Live: https://kyfr-onboarding-deploy.vercel.app

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # engine and unit tests (vitest)
npm run build    # type-check and build to dist/
```

Real-browser check (headless Chrome, no extra dependencies): `node scripts/qa/flow.mjs` after a build. It types into the real UI for four personas (starter, family, senior, and one with hostile input), taps through to the end, and fails on any console error. Pass `--url <page> --out file.json` to snapshot any build and diff two of them.

## How it is built

- Vite and TypeScript, no UI framework. A static single-page app with no backend. Nothing the user types leaves the browser.
- `src/engine/` holds the pure calculations: `crisp.ts` (pillar scores, weights, the readiness score), `report.ts` (the prioritised moves, step-up plans and premium estimates) and `benchmark.ts` (income percentile, runway and credit copy, with sources).
- `src/state.ts` holds the answers. Users type absolute rupee amounts; `deriveInp()` turns them into the ratios the engine needs (EMI share of income, runway in months of spending, card utilisation, cover multiples).
- `src/screens.ts` has one entry per screen, `src/router.ts` moves between them, and `src/ui/` has the shared DOM, chart and detail-report helpers.
- `src/styles/` is split by area (shell, screens, buttons, reveal, report, detail). Quicksand is bundled through `@fontsource`.

## Decisions worth knowing

- Runway is savings divided by monthly **spending**, not income, and the screen says so.
- Income percentile is measured against all individual earners in India (PLFS and World Inequality Lab anchors, listed in `src/engine/benchmark.ts`). A salaried-only curve was tried and dropped because its only source could not be traced.
- The "top X%" figure appears once, as the hero number. The headline and body never repeat it.
- Premiums and "if you wait" costs are estimates, and the step-up cost is simulated month by month against the recommended ramp.
