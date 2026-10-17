Title: Fix: House screen crash (yearsInSociety) and guard diagnostics

Summary

This PR fixes a UI crash where clicking the House button could fail to render the House of Formation screen. Two minimal changes are included:

1) engine.js: export yearsInSociety(state, petitionerId)
   - Adds a small helper that computes a petitioner's effective years in the Society as:
     base yearsInSociety (from state.petitioners or historical data) + elapsed years since entryYear.
   - Defensive: never throws for missing or partial data; returns 0 on unexpected failures.
   - Reason: the UI's diagnostics expected E.yearsInSociety to exist; adding it restores the intended API without changing game mechanics.

2) ui/playtest.js: guard playtest diagnostics render
   - Wraps the diagnostics builder in a try/catch so a diagnostics exception cannot abort the main House screen render.
   - On diagnostics failure the Playtest panel falls back to an empty diagnostics view and logs the error to console.

Why these changes

- The Playtest tools call E.yearsInSociety(state, petitionerId). The engine did not export that helper, causing a TypeError when rendering the House screen and preventing the page from loading. The new helper matches the engine's existing years calculation semantics used for ordination eligibility.
- The Playtest diagnostics are read-only. Defensive guarding ensures debugging code never prevents the primary UI from functioning.

Validation steps (recommended before merge)

1. Run unit/soak tests:
   node src/lib/generalate/test.mjs

2. Assemble data + build the site:
   npm run prebuild
   npm run build

3. Manual smoke test:
   - Serve the built site (npx serve dist) and open it in a browser.
   - Click the House button. The House screen should render and the Playtest Tools section should expand (or show fallback diagnostics). No TypeError should appear in the browser console.

Notes on CI

- This repository has no GitHub Actions workflows configured (no .github/workflows). Therefore no automated checks will run on this PR by default. To enable CI you can add a GitHub Actions workflow that runs the tests and build on pull requests (example below).

Proposed example workflow (copy into .github/workflows/node-test.yml):

name: Node CI
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run prebuild
      - run: node src/lib/generalate/test.mjs
      - run: npm run build

I have not merged or deployed anything. Please review the changes and run the validation steps locally or enable CI. If you want, I can add the GitHub Actions workflow on this branch as a separate PR.
