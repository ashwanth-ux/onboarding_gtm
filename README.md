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

- Vite and TypeScript, no UI framework. A static single-page app with no backend of its own. The answers stay in the browser until someone taps **Notify me** on the last screen; then one row is sent to a Google Sheet (see below).
- `src/engine/` holds the pure calculations: `crisp.ts` (pillar scores, weights, the readiness score), `report.ts` (the prioritised moves, step-up plans and premium estimates) and `benchmark.ts` (income percentile, runway and credit copy, with sources).
- `src/state.ts` holds the answers. Users type absolute rupee amounts; `deriveInp()` turns them into the ratios the engine needs (EMI share of income, runway in months of spending, card utilisation, cover multiples).
- `src/screens.ts` has one entry per screen, `src/router.ts` moves between them, and `src/ui/` has the shared DOM, chart and detail-report helpers.
- `src/styles/` is split by area (shell, screens, buttons, reveal, report, detail). Quicksand is bundled through `@fontsource`.

## Decisions worth knowing

- Runway is savings divided by monthly **spending**, not income, and the screen says so.
- Income percentile is measured against all individual earners in India (PLFS and World Inequality Lab anchors, listed in `src/engine/benchmark.ts`). A salaried-only curve was tried and dropped because its only source could not be traced.
- The "top X%" figure appears once, as the hero number. The headline and body never repeat it.
- Premiums and "if you wait" costs are estimates, and the step-up cost is simulated month by month against the recommended ramp.

## Leads go to a Google Sheet

On the last screen a person enters an email and a mobile number. Tapping **Notify me** sends one row (contact details, every answer, the derived figures, the report's top priorities, device and campaign tags) to a Google Apps Script web app, which writes it to the `Leads` tab of your sheet. Taps and retries from the same run update the same row, so a flaky connection can't create duplicates.

- `src/data/lead-columns.json` is the one list of columns. The app (`src/lead.ts`), the sheet builder and the script all follow it, and `tests/lead.test.ts` fails if `scripts/google-sheet/Code.gs` drifts from it.
- `scripts/google-sheet/build_sheet.py` builds the formatted workbook (a `Leads` tab with a colour-coded header band, rupee formats, status colours, a follow-up dropdown and banding, plus a `Summary` tab where every figure is a formula). Add `--sample` for a demo copy with four made-up rows.

### Set it up once

0. Make the sheet: `python3 scripts/google-sheet/build_sheet.py KYFR-onboarding-leads.xlsx` (needs `pip install openpyxl`), upload it to Google Drive, open it, and choose **File → Save as Google Sheets**. Add `--sample` for a demo copy with four made-up rows.
1. Open the sheet, then **Extensions → Apps Script**. Replace the contents of `Code.gs` with `scripts/google-sheet/Code.gs` from this repo.
2. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Authorise when asked, then copy the web app URL.
3. In Vercel, add the environment variable `VITE_LEADS_WEBHOOK_URL` with that URL (Production), and redeploy. For local testing, put it in `.env.local`.
4. Test: `https://…/exec` opened in a browser should answer `{"ok":true,"service":"kyfr-leads"}`.

Until the variable is set the form still works but saves nothing, and the build prints a warning.

### Good to know

- The web app URL ends up in the public site code, so anyone who finds it can post a row. The script rejects anything that isn't a valid mobile and email, caps field lengths and neutralises formula-looking text, but it can't tell a bot from a person. If spam appears, add a captcha or move the endpoint behind a small server function.
- The sheet holds personal data (phone, email, finances). Keep it shared only with people who need it, and get the consent wording on the last screen and a privacy policy reviewed before launch.
- The formatting, dropdown and banding cover the first 5,000 rows; extend the ranges if you go past that.
- `node scripts/qa/lead.mjs` checks the form end to end in headless Chrome against a stand-in for the sheet (validation, the exact row, the spam trap, retries, and failures).
