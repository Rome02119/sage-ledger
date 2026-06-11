# Sage Ledger

A white, minimal personal-finance web app — the digital twin of the Budget Planner spreadsheet. Budgets, bills, credit cards, savings goals, receipt capture, and CSV import, with red/green financial-health signals throughout.

No build step. No framework. Open it and it runs.

## Run it

```bash
# Option 1 — just open it
open index.html            # macOS

# Option 2 — local server (recommended; required for camera on some browsers)
python3 -m http.server 8080
# then visit http://localhost:8080
```

On your phone: serve it on your network (`python3 -m http.server 8080` then visit `http://<your-mac-ip>:8080`), or deploy the folder to any static host (GitHub Pages, Netlify, Vercel — drag and drop).

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

## Verification notes (honest ones)

This project was built in a sandbox without a real browser, so it was **not** literally checked in Chrome DevTools. What was verified instead:

- `node --check` on every JS file (syntax)
- A 58-assertion jsdom smoke test (`npm test`) covering boot, demo data, the recurring engine (idempotency, future-month projection), late-bill detection, red/green health flags, card due-date/utilization math, CSV parse → analyze → import, all six views rendering, income/heavy-expense flows without GSAP present, payments, budgets, goals, persistence, and demo clearing
- CSS parsed clean with css-tree; responsive rules hand-reviewed at the 380px / 768px / 1100px breakpoints

Worth a quick real-device pass: the three.js auth ambience, GSAP animation feel, and camera capture (needs HTTPS or localhost on most mobile browsers).
