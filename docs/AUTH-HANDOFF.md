# Sage Ledger — Auth Handoff

Wire Google and Apple sign-in without building a backend server.
Recommended stack: **Supabase Auth** (free tier, handles both providers, JS-only).

---

## Credentials you need to collect

Fill every `[ ]` below before writing any code.

### Supabase project
| Key | Where to get it | Your value |
|---|---|---|
| Project URL | supabase.com → project → Settings → API | `[ SUPABASE_URL ]` |
| Anon/public key | same page, "anon public" key | `[ SUPABASE_ANON_KEY ]` |

### Google OAuth
| Key | Where to get it | Your value |
|---|---|---|
| Client ID | console.cloud.google.com → APIs & Services → Credentials | `[ GOOGLE_CLIENT_ID ]` |
| Authorized redirect URI | paste your Supabase callback URL (step 3 below) | `[ SUPABASE_GOOGLE_CALLBACK ]` |

### Apple Sign-In
| Key | Where to get it | Your value |
|---|---|---|
| Services ID | developer.apple.com → Certificates → Identifiers → Services IDs | `[ APPLE_SERVICES_ID ]` |
| Team ID | developer.apple.com → Membership | `[ APPLE_TEAM_ID ]` |
| Key ID | developer.apple.com → Certificates → Keys | `[ APPLE_KEY_ID ]` |
| Private key (.p8 file) | downloaded once when you create the key — store safely, never commit | `[ path/to/AuthKey_XXXX.p8 ]` |
| Redirect domain | must be HTTPS — use `rome02119.github.io` or your custom domain | `[ AUTH_REDIRECT_DOMAIN ]` |

> Apple requires HTTPS and a registered domain. `rome02119.github.io` qualifies.
> You cannot test Apple sign-in on localhost.

---

## Step-by-step setup

### 1 — Create a Supabase project
1. Go to https://supabase.com and sign in with your GitHub account (`Rome02119`)
2. Click **New project** → name it `sage-ledger` → pick a region close to you
3. Copy the **Project URL** and **anon key** into the table above

### 2 — Enable Google provider in Supabase
1. Supabase dashboard → **Authentication → Providers → Google** → toggle on
2. Paste your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Copy the **Callback URL** Supabase shows you (looks like `https://xxxx.supabase.co/auth/v1/callback`)
4. Paste that callback URL into Google Cloud Console → your OAuth credential → Authorized redirect URIs

### 3 — Enable Apple provider in Supabase
1. Supabase dashboard → **Authentication → Providers → Apple** → toggle on
2. Fill in: Services ID, Team ID, Key ID, and paste the contents of your `.p8` file
3. Add `rome02119.github.io` (or your custom domain) as an authorized domain in both Apple and Supabase

### 4 — Add the Supabase JS SDK to `index.html`
Add this line in `index.html` just before the closing `</body>` tag, above the existing `<script>` tags:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  // Replace the two values below with your real keys
  window.__supabase = supabase.createClient(
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  );
</script>
```

### 5 — Replace the two stub actions in `js/app.js`

Find this block (around line 439):

```js
"auth-google": () => window.UI.toast("Google sign-in isn't wired yet — see docs/NEXT_STEPS.md", "warn"),
"auth-apple":  () => window.UI.toast("Apple sign-in isn't wired yet — see docs/NEXT_STEPS.md", "warn"),
```

Replace with:

```js
"auth-google": async () => {
  const { error } = await window.__supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) window.UI.toast('Google sign-in failed: ' + error.message, 'bad');
},
"auth-apple": async () => {
  const { error } = await window.__supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) window.UI.toast('Apple sign-in failed: ' + error.message, 'bad');
},
```

### 6 — Handle the redirect back into the app

After OAuth, Supabase redirects back to your app with a session token in the URL.
Add this to the `init()` method in `js/app.js`, right before the `if (!authDismissed)` line:

```js
// handle OAuth redirect
const { data: { session } } = await window.__supabase.auth.getSession();
if (session) {
  window.Store.state.settings.name = session.user.user_metadata?.full_name || 'You';
  window.Store.state.settings.authDismissed = true;
  window.Store.save();
}
window.__supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    window.Store.state.settings.name = session.user.user_metadata?.full_name || 'You';
    window.Store.state.settings.authDismissed = true;
    window.Store.save();
    window.App.hideAuth();
  }
});
```

> Make `init()` async: change `init()` → `async init()` at the top of the method.

---

## Verification checklist

- [ ] Supabase project created, URL + anon key collected
- [ ] Google provider enabled in Supabase, callback URL registered in Google Console
- [ ] Apple provider enabled in Supabase, `.p8` key pasted, domain registered
- [ ] SDK script added to `index.html` with real keys
- [ ] `auth-google` and `auth-apple` actions updated in `app.js`
- [ ] `init()` made async, session check added
- [ ] Deployed to GitHub Pages (`git push`) — not localhost (Apple requires HTTPS)
- [ ] Clicked "Continue with Google" → redirects to Google → returns to app logged in
- [ ] Clicked "Continue with Apple" → redirects to Apple → returns to app logged in
- [ ] `HI, ROME` on dashboard shows your real name from the OAuth profile

---

## Security rules — never break these

- **Never commit real keys to git.** The anon/public Supabase key is safe to expose (it's designed for frontend use). The Google Client Secret and Apple `.p8` private key are NOT — keep them only in the Supabase dashboard.
- The `.p8` file should never be in the repo. Add `*.p8` to `.gitignore` now.
- Supabase's anon key has Row Level Security (RLS) as a backstop. Enable RLS on any tables you create.

---

## After auth is working — next priorities (from `NEXT_STEPS.md`)

1. **Server persistence** — replace `localStorage` with `supabase.from('state').upsert(...)` so data syncs across devices
2. **Receipt OCR** — upload photos to Supabase Storage, run through Claude vision API (`claude-opus-4-8`) to extract merchant/amount/date
3. **Bank sync** — Plaid integration for automatic transaction import (CSV remains the fallback)
4. **Push notifications** — bill-due reminders via Web Push using the red-flag data already computed in `logic.js`
