# Sage Ledger — Backend Next Steps

Everything in this app runs client-side today. The features below are **deliberately stubbed** in the UI and need a backend. Each section lists what to build, where the frontend hook already exists, and suggested services.

---

## 1. Authentication (Google / Apple sign-in)

**Current state:** Buttons on the auth screen and in Settings show a toast and do nothing else.

**Frontend hooks:**
- `js/app.js` → `handleAction` → `"auth-google"` and `"auth-apple"` actions. Replace the toast calls with your OAuth redirect/popup.
- `App.hideAuth()` is the post-login entry point — call it after a successful session is established.
- `Store.state.settings.name` is where the signed-in user's display name should land.

**What to build:**
1. OAuth 2.0 / OpenID Connect flow:
   - **Google:** Google Identity Services (`https://accounts.google.com/gsi/client`), or server-side Authorization Code flow. Requires a Google Cloud project + OAuth consent screen + client ID.
   - **Apple:** Sign in with Apple JS, requires an Apple Developer account, a Services ID, and a registered redirect URI (Apple requires HTTPS, no localhost).
2. A session endpoint (`POST /api/auth/callback`, `GET /api/me`, `POST /api/logout`).
3. Issue an HTTP-only session cookie or short-lived JWT; never store tokens in localStorage.

**Easiest managed routes:** Supabase Auth, Firebase Auth, Clerk, or Auth0 — all support Google + Apple with minimal code.

---

## 2. Receipt OCR (photos) and PDF statement parsing

**Current state:** Camera/photo/PDF uploads land in the **Receipt & statement inbox** (Cards view) tagged `Needs OCR · backend`. Files are previewed via session-only object URLs; binary data is **not** persisted.

**Frontend hooks:**
- `js/upload.js` → `Upload.intake()` — receipts are created with `status: "needs-ocr"`. After your backend parses one, set `status: "parsed"`, create the transactions, and remove or link the receipt.
- Receipt records carry `cardId` when uploaded from a card's **Upload statement** button — use it to attribute parsed transactions to that card.

**What to build:**
1. `POST /api/receipts` — multipart upload to object storage (S3 / GCS / Supabase Storage).
2. An OCR/parse worker:
   - **Receipts (images):** Claude vision via the Anthropic API, AWS Textract `AnalyzeExpense`, or Google Cloud Vision. Extract merchant, date, total, line items.
   - **PDF credit-card statements:** text-extract first (most are digital PDFs — `pdfplumber`/`pdf.js`); fall back to OCR for scans. Parse the transactions table, statement close date, due date, minimum payment, and new balance.
3. `POST /api/receipts/:id/result` → returns structured transactions the client merges via the same shape used in `Logic.importRows()`.
4. Statement parses should also update `card.balance`, `card.dueDay`, `card.closeDay` — the UI already renders those.

---

## 3. Bank & card sync (replace CSV as the primary path)

**Current state:** CSV import is fully functional client-side (column auto-detection + mapping preview). Live sync is not.

**What to build:** Plaid (US standard), Teller, or Finicity. Store `access_token`s server-side only. A nightly sync job writes transactions in the same schema as `state.transactions` and updates card balances. CSV import remains the no-bank-login fallback.

---

## 4. Server persistence & sync

**Current state:** Everything persists to `localStorage` under the key `sage-ledger-v1` (`js/store.js`). Single device only.

**What to build:**
1. Replace `Store.save()` / `Store.init()` with API calls plus an offline-first queue, or keep localStorage as a cache and sync diffs.
2. Suggested schema (mirrors `Store.defaultState()` one-to-one):

```sql
users        (id, email, name, auth_provider, created_at)
categories   (id, user_id, name, kind)            -- kind: income | expense
budgets      (user_id, category_id, monthly_amount)
transactions (id, user_id, date, description, category_id,
              amount_cents, type, card_id, recurring_id,
              paid, imported, receipt_id, created_at)
recurring    (id, user_id, description, category_id, amount_cents,
              type, day_of_month, card_id, autopay, active, start_month)
cards        (id, user_id, name, last4, limit_cents, balance_cents,
              due_day, close_day, paid_this_cycle, last_payment_date)
goals        (id, user_id, name, target_cents, saved_cents)
receipts     (id, user_id, card_id, storage_url, kind, status, created_at)
```

3. Suggested endpoints: `GET/PUT /api/state` (coarse, fastest to ship) or RESTful per-resource routes. Recurring materialization (`Logic.materializeRecurring`) should move server-side (cron) so months fill in even when the app is closed.

---

## 5. Notifications (makes the red flags actionable)

Bill-due and card-due reminders via Web Push (service worker) or email. The data already exists: `Logic.lateBills()`, `Logic.cardCycle().dueIn`, and `Logic.computeHealth().alerts` are your triggers.

---

## 6. Security checklist before going live

- Serve over HTTPS only (required for camera capture and Apple sign-in anyway).
- CSP headers; keep the GSAP/three.js CDN pins or self-host them.
- All amounts as integer cents server-side (the client uses floats rounded to 2dp — fine for display, not for ledgers).
- Rate-limit upload and auth endpoints; validate file types server-side, never trust the extension.
- Receipts/statements are sensitive financial documents: encrypt at rest, signed URLs with short expiry.

---

## Stub inventory (quick reference)

| UI element | Location | Status |
|---|---|---|
| Continue with Google / Apple | Auth screen + Settings | Stub → toast |
| Receipt photo / PDF parsing | Cards → inbox | Stub → `needs-ocr` tag |
| Upload statement (per card) | Cards | Accepts file → inbox (CSV works fully) |
| Everything else (budgets, recurring, goals, cards, CSV import, charts, animations, red/green flags) | — | **Fully functional client-side** |
