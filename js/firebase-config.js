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
    apiKey:            "AIzaSyASm0pdulaOhX6zT-BIEL-UvYtG2Ot1i3M",
    authDomain:        "sage-ledger-f1907.firebaseapp.com",
    projectId:         "sage-ledger-f1907",
    storageBucket:     "sage-ledger-f1907.firebasestorage.app",
    messagingSenderId: "737048031624",
    appId:             "1:737048031624:web:34784d79efb4bc79b30a3d"
  };

  // Initialize Firebase and expose the app, auth, and db globally
  // so that auth.js and store.js can import them without a bundler.
  const app  = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  window.FB      = { app, auth, db };
  window.FBReady = true;
})();
