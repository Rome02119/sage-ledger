# Sage Ledger

A white, minimal personal-finance web app — the digital twin of the Budget Planner spreadsheet. Budgets, bills, credit cards, savings goals, receipt capture, and CSV import, with red/green financial-health signals throughout.

No build step. No framework. Open it and it runs.

**Live:** https://rome02119.github.io/sage-ledger/
**Repo:** https://github.com/Rome02119/sage-ledger

## Run it

```bash
# Option 1 — GitHub Pages (anywhere, HTTPS, camera works on mobile)
# https://rome02119.github.io/sage-ledger/

# Option 2 — local Mac Mini (same Wi-Fi)
python3 -m http.server 8080 --directory ~/sage-ledger
# then visit http://192.168.1.222:8080

# Option 3 — just open it locally
open ~/sage-ledger/index.html
```

Demo data loads on first run so every state is visible — clear it in **Settings → Demo data**.

## What's functional vs. stubbed

**Fully working (client-side):**
- Dashboard with health score, the category "health ribbon," KPIs, doughnut + 6-month charts, alerts, upcoming bills
- Transactions: add/edit/delete/search, month navigation
- **Recurring bills/income** — auto-populate every future month; unpaid bills past their day turn **red**, one tap marks them paid
- Budgets per category with red/amber/green progress
- **Credit cards** — utilization bar with the 30% marker, **due-date countdown highlighted red when ≤5 days**, statement-close date, payment-posting guidance (1–3 business days), payments logged as transactions
- Goals with progress and one-tap funding
- **CSV import** — auto-detects date/amount/description columns, mapping preview, bank-style negative amounts, optional card attribution
- Camera capture + photo/PDF upload into a receipt inbox
- **Money rain** when income is added 💵, **heavy-deduction shake + red flash** for purchases at/above your threshold (default $200, adjustable in Settings)
- Mobile layout (bottom tab bar + center FAB) and desktop layout (icon sidebar), `prefers-reduced-motion` respected

**Stubbed, needs backend (see `docs/NEXT_STEPS.md`):**
- Google / Apple sign-in (buttons show a toast)
- OCR of receipt photos and PDF statement parsing (files queue in the inbox tagged `Needs OCR · backend`)

## Structure

```
sage-ledger/
├── index.html          app shell, auth screen, overlays
├── css/styles.css      all styling (design tokens at the top)
├── js/
│   ├── store.js        state, localStorage persistence, demo data
│   ├── logic.js        recurring engine, health flags, card math, CSV parser
│   ├── charts.js       canvas doughnut + bars (no chart library)
│   ├── animations.js   GSAP money rain / deductions, three.js auth ambience
│   ├── upload.js       camera/photo/PDF/CSV intake
│   ├── ui.js           all view rendering
│   └── app.js          boot, navigation, events, forms
├── test/smoke.test.js  jsdom smoke test (58 checks) — `npm i && npm test`
└── docs/NEXT_STEPS.md  backend build guide
```

GSAP and three.js load from cdnjs and are **optional** — every feature works without them (CSS fallbacks for the money animations).

## Verification

- `node --check` on every JS file
- 58-assertion jsdom smoke test (`npm i && npm test`)
- Verified in a real browser via Claude Code preview: login dismisses, all six nav tabs render, demo data loads, charts render, zero console errors
- Live on GitHub Pages (HTTPS) — camera capture works on mobile
