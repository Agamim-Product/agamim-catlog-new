# Agamim data catalog (static site)

The site is plain static files (`index.html` plus a compiled app bundle in `assets/`). There is no build step.
Live at https://agamim-product.github.io/agamim-catalog-lean-no-crm/

## Run locally

```
npm ci
npm run serve        # http://127.0.0.1:4173
```

## Phase 1 scope

- Welcome screen, login with two-step verification, first-visit profile form
- Home: data lake (מאגר הגיאוגרפיה המנהלית, db-oref-base) with its datasets, sorting by name / status / last update, search suggestions, collapsible lake, dismissible alerts
- Catalog (cards, filters, sort), dataset page (overview, tables and data types, lineage, contract), search results
- Admin: add dataset (side panel), edit, open / close access, delete and restore; consumers browse only
- Out of scope for this phase: version control of datasets (no version is shown or stored)

## Demo accounts and roles

Sign in on the login screen (demo password `demo1234`, any 6-digit code for the second step):

| Account | Role | Can do |
| --- | --- | --- |
| `user@oref.example` ("מנהל פורטל") | portal admin | browse, add datasets, switch a dataset between open and blocked |
| `consumer@oref.example` ("צרכן נתונים") | consumer | browse only |

These controls are hidden in the browser, which is a demo convenience and not security. A real deployment needs a backend.
Admin choices (open / blocked, locally added datasets) are kept in the browser's `localStorage`.
The originally blocked dataset (2) has its complete synthetic files in `data/consumer/unlocked/`; they are used only when an admin opens it.

## Look and feel

The Home Front Command style lives in `theme-oref.css`, `theme-oref-2.css` and `theme-oref.js` (loaded after the app),
plus `add-dataset.css` and `onboarding.css`. The compiled app in `assets/` is only patched for the consumer account,
the removal of the table view and a few labels.

## Tests (Playwright)

```
npm ci
npx playwright install chromium
npm test
```

To reuse an installed browser instead of downloading one: `PW_CHANNEL=msedge npm test` (or `chrome`).

The suite covers the login and first-visit profile, the home greeting, the "add dataset" side panel end to end,
and consistency checks on the JSON data.

## CI/CD (`.github/workflows/ci.yml`)

| Event | Tests | Deploy |
| --- | --- | --- |
| push to any branch / pull request | yes | no |
| push to `main` | yes | yes, after tests pass |
| "Run workflow" (any branch) | yes | yes, after tests pass |

Deploying publishes the site files (without tests or tooling) to the `gh-pages` branch, which GitHub Pages serves.

## Adding a dataset

Product managers register a dataset with **"+ הוספת מאגר"** in the app. To publish it for everyone, export the package
and run (PowerShell, Windows PowerShell 5.1):

```
powershell -ExecutionPolicy Bypass -File tools\apply-package.ps1 -Package <path to dataset-N.package.json>
```

Then review with `git diff`, commit and push to `main`.
