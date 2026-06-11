# AGENTS.md
> This is the DOX rail for Sage Ledger. Content below governs all repo-wide work.
> Read this file before editing anything. Walk root→target reading every AGENTS.md.

---

## DOX Framework (binding)

### Read-before-editing
Before touching any file: read this root AGENTS.md, then any child AGENTS.md
under the folder you are editing. Never skip the chain.

### The DOX pass
After every non-trivial change:
1. Run the smoke test: `npm test`
2. Verify the specific feature you changed works in a real browser (not just the test).
3. No proof = not done.

### Hierarchy & child shape
Children strengthen or extend — they never weaken a rule from this root.
Each child carries: Purpose, Ownership, Local Contracts, Verification.

### Closeout
Before marking a task complete:
- Smoke test passes.
- Affected view renders without console errors.
- Auth flow: login screen dismisses, each nav tab shows its view.

### New-game / new-feature bootstrap
When adding a new view or major feature: create a child AGENTS.md in that folder,
index it here, carry the non-negotiables verbatim.

---

## Project-wide non-negotiables

- **Verify before "done":** open the app in a real browser, navigate to the
  affected view, confirm no console errors and no visual regressions. A passing
  smoke test is necessary but not sufficient.
- **Tail-chase ladder:** if the same visual/runtime bug survives 2 fix attempts,
  stop patching symptoms — make a structural change (e.g. fix the CSS cascade,
  not the JS that fights it).
- **Branch discipline:** never commit directly to `main`; never `git add -A`.
  Stage specific files only.
- **CSS specificity rule:** when hiding an element with `el.hidden = true`, ensure
  a matching `#id[hidden] { display: none; }` rule exists in CSS. ID selectors
  beat the default `[hidden]` rule. (Root cause of the auth-screen + nav bug.)
- **No Chart.js dependency:** the charts module is custom canvas/SVG. Don't add
  Chart.js — keep the zero-dependency frontend contract.
- **localStorage only:** all state lives in `window.Store` → localStorage.
  No network calls until the backend hooks in NEXT_STEPS.md are wired.

---

## Architecture snapshot

```
index.html          single-page shell; all views inline
css/styles.css      all styles; mobile-first, 768px desktop breakpoint
js/
  store.js          state + localStorage persistence (window.Store)
  logic.js          business rules: recurring bills, utilization, alerts
  ui.js             toast, modal, sheet (window.UI)
  animations.js     GSAP transitions, money rain, screen shake (window.Anim)
  charts.js         custom canvas charts — no Chart.js (window.Charts)
  upload.js         camera / file / CSV handling (window.Upload)
  app.js            router, wireGlobal, handleAction (window.App)
docs/NEXT_STEPS.md  backend hook map: OAuth, OCR, Plaid, schema, endpoints
test/smoke.test.js  58-assertion jsdom suite (npm test)
```

---

## Child DOX Index

| Child | Scope |
|---|---|
| *(none yet)* | Add children when new folders/features are introduced |

Intentionally unindexed: `node_modules/`, generated test output.
