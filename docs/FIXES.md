# Sage Ledger — Fix Plan: Phone Login + CSV Import

This document covers exactly two problems and their fixes. Nothing else.

1. Can't log in on the phone (Firebase "missing initial state" error)
2. CSV import: nothing populated, and the column-mapping step asks too much

---

## Issue 1 — Phone login fails with "Unable to process request due to missing initial state"

### What you saw
On your iPhone, tapping **Continue with Google** bounced to
`sage-ledger-f1907.firebaseapp.com` and showed:

> Unable to process request due to missing initial state. This may happen if browser
> sessionStorage is inaccessible or accidentally cleared… signInWithRedirect in a
> storage-partitioned browser environment.

### Why it happens (the real cause)
This is a **known Firebase + iPhone problem**, not something you did wrong.

- Your app lives at `rome02119.github.io`
- Firebase's sign-in helper lives at `sage-ledger-f1907.firebaseapp.com`
- Those are **two different websites**. During login, Firebase needs the helper
  page to read data the app page stored in the browser.
- iPhone browsers (Safari, and Chrome on iOS — which is Safari underneath)
  **partition storage per website** for privacy. The helper page literally cannot
  see what the app page stored → "missing initial state."

Desktop browsers don't partition as aggressively, which is why it works on the Mac.

### The fix — make the app and the sign-in helper the same website
Deploy the app to **Firebase Hosting** (the same Firebase project that handles
login). Then the app and the auth helper share one domain and the storage
partition problem disappears entirely. The repo already contains `firebase.json`,
so it's set up for this.

**Steps (run on the Mac Mini, in `~/sage-ledger`):**

```bash
# 1. Install the Firebase CLI (one time)
npm install -g firebase-tools

# 2. Log in with the same Google account that owns the Firebase project
firebase login

# 3. Point the folder at your project (one time)
firebase use sage-ledger-f1907

# 4. Deploy
firebase deploy --only hosting
```

After deploying, the app is live at:

- **https://sage-ledger-f1907.web.app** ← use THIS on your phone
- https://sage-ledger-f1907.firebaseapp.com (same thing, alternate name)

**Also do this once in the Firebase console:** Authentication → Settings →
Authorized domains → confirm `sage-ledger-f1907.web.app` and
`sage-ledger-f1907.firebaseapp.com` are listed (they are by default), and keep
`rome02119.github.io` listed too.

### What happens to the GitHub Pages URL?
Keep it — it still works on desktop and as guest mode on the phone. But the
**Firebase Hosting URL becomes the canonical one** because login works there on
every device. Re-deploy after each push with `firebase deploy --only hosting`
(or we can wire a GitHub Action to auto-deploy on every push — ask when ready).

### Verify the fix
- [ ] `firebase deploy --only hosting` completes and prints the Hosting URL
- [ ] On the iPhone, open https://sage-ledger-f1907.web.app
- [ ] Tap **Continue with Google** → Google account chooser appears → you land
      back in the app signed in (no error page)
- [ ] Your name appears under Settings → Profile & sign-in
- [ ] Add a transaction on the phone, open the app on the Mac signed in to the
      same account → the transaction appears (Firestore sync working)

---

## Issue 2 — CSV import: nothing populated + mapping asks too much

### What you saw
You uploaded your PayPal activity export (`Download.CSV`, 40 transactions).
The app asked which columns to use, then imported **nothing**.

### Why it happened (confirmed by testing your exact file)
The column auto-detector matches the **first** header containing the word
"amount". PayPal's export has 41 columns, and the first "amount"-ish one is
**"Shipping and Handling Amount"** — which is empty on every row. So:

- Auto-detect picked: date = `Date` ✓, amount = `Shipping and Handling Amount` ✗,
  description = `Name` (half-empty) ✗
- Every row had a blank amount → **all 40 rows skipped, 0 imported**

The right columns were sitting there the whole time: `Net` (the money), `Name` +
`Item Title` + `Subject` (the description), `Status`, and `Balance Impact`.

### The fix — three layers, in `js/logic.js` (and a small UI change in `js/app.js`)

#### Layer 1: Bank-format profiles (PayPal first)
Detect known exports by their header signature and apply the right rules
automatically — zero questions asked:

```
PayPal signature: headers include "Gross", "Net", "Balance Impact", "Transaction ID"
Rules when detected:
  amount      = Net column (includes PayPal fees — Gross would overstate income)
  date        = Date column
  description = first non-empty of: Name → Item Title → Subject → Type
  SKIP rows where Status ≠ "Completed"        (Denied/Pending are not real money)
  SKIP rows where Balance Impact = "Memo"     (informational, not a transaction)
  SKIP duplicate Transaction IDs already imported (re-importing is safe)
  sign        = negative Net → money out (expense), positive → money in (income)
```

Your file through these rules: 40 rows → 13 real transactions imported,
27 correctly skipped (denied card attempts, memos, duplicates).

#### Layer 2: Smarter generic detection (every other bank)
For CSVs that match no profile:
- Rank "amount" candidates by **exact-name priority** (`amount` > `net` >
  `gross` > `debit`/`credit` > anything containing "amount"), then by **how many
  rows actually contain non-zero numbers** — an empty column can never win again.
- Description = the named column, but **fall back through other text columns**
  when the primary is empty for a row.
- If a `status` column exists, only import rows that look completed.

#### Layer 3: The UX you asked for — auto-import first, mapping optional
Replace the "which columns?" interrogation in the import flow (`js/app.js` →
`csvFlow`) with:

1. **Instant preview**: "Found 13 transactions: 3 money-in totaling $1,582.05,
   10 money-out totaling $806.15. 27 rows skipped (denied/duplicates/memos)."
   with the first few shown — **Import** is one tap.
2. An **"Adjust columns" link** (collapsed by default) opens the current mapping
   UI for the rare file the auto-detect gets wrong — manual control stays
   available, it just stops being mandatory.

### Verify the fix
- [ ] Re-upload `Download.CSV` → preview appears with **no questions asked**
- [ ] Import count matches: 13 transactions (e.g. "New Jersey Full Court Press
      +$696.05 on 05/14", "Jamellah Newton −$600.00 on 05/15", "DigitalOcean
      −$5.00 on 04/10")
- [ ] The $571.00 / $593.61 "Denied" rows did NOT import
- [ ] Re-importing the same file a second time imports **0** (duplicates blocked)
- [ ] A non-PayPal CSV (e.g. a simple date/desc/amount file) still imports
- [ ] "Adjust columns" still opens manual mapping and works
