/* Sage Ledger — firebase-config.js
   ─────────────────────────────────────────────────────────────
   FILL IN YOUR VALUES below before pushing.

   Where to get them:
     1. Go to https://console.firebase.google.com
     2. Select (or create) your project
     3. Project Settings ⚙️ → General → "Your apps" → Web app
     4. Copy the firebaseConfig object values into the constants below

   DO NOT commit real keys to a public repo without Firebase Security
   Rules in place (see firestore.rules).  The anon key is safe to
   expose; Google blocks unauthorized domains via "Authorized domains"
   in Auth settings.
   ─────────────────────────────────────────────────────────────  */

(function () {
  "use strict";

  const firebaseConfig = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID"
  };

  // Initialize Firebase and expose the app, auth, and db globally
  // so that auth.js and store.js can import them without a bundler.
  const app  = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  window.FB      = { app, auth, db };
  window.FBReady = true;
})();
