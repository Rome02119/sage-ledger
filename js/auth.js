/* Sage Ledger — auth.js
   ─────────────────────────────────────────────────────────────
   Real Firebase Auth: Google (popup) + Email/Password.
   Replaces the toast stubs in app.js.

   Depends on:  firebase-config.js  (must load first)
   Exposes:     window.Auth
   ─────────────────────────────────────────────────────────────  */

(function () {
  "use strict";

  /* ── helpers ─────────────────────────────────────────────── */
  const $ = (s) => document.querySelector(s);

  /* email-form toggle state */
  let _emailMode = "signin"; // "signin" | "signup" | "reset"

  /* ── listen for auth state changes ──────────────────────── */
  function startAuthListener() {
    window.FB.auth.onAuthStateChanged((user) => {
      if (user) {
        // Hydrate display name into Store if not already set
        if (!window.Store.state.settings.name && user.displayName) {
          window.Store.state.settings.name = user.displayName;
          window.Store.save();
        }
        // Store UID so Store.saveCloud knows whose document to write
        window.Store._uid = user.uid;
        // If auth overlay is still visible, hide it
        const authScreen = $("#auth-screen");
        if (authScreen && !authScreen.hidden) {
          window.App.hideAuth();
        }
        // Re-render settings to show signed-in state
        if (window.App && window.App.view === "settings") {
          window.App.rerender();
        }
      } else {
        window.Store._uid = null;
      }
    });
  }

  /* ── Google sign-in ──────────────────────────────────────── */
  function signInGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    window.FB.auth.signInWithPopup(provider)
      .then((result) => {
        window.UI.toast("Welcome, " + (result.user.displayName || result.user.email) + "!", "good");
      })
      .catch((err) => {
        if (err.code === "auth/popup-closed-by-user") return; // user dismissed — silent
        window.UI.toast(_authErrMsg(err), "bad");
        console.error("[Auth] Google sign-in error:", err);
      });
  }

  /* ── Email sign-in ───────────────────────────────────────── */
  function signInEmail(email, password) {
    return window.FB.auth.signInWithEmailAndPassword(email, password)
      .then((cred) => {
        window.UI.toast("Welcome back, " + (cred.user.displayName || cred.user.email) + "!", "good");
      })
      .catch((err) => {
        window.UI.toast(_authErrMsg(err), "bad");
        throw err;
      });
  }

  /* ── Email sign-up ───────────────────────────────────────── */
  function signUpEmail(email, password, name) {
    return window.FB.auth.createUserWithEmailAndPassword(email, password)
      .then((cred) => {
        // Optionally set display name
        const updates = name ? cred.user.updateProfile({ displayName: name }) : Promise.resolve();
        return updates.then(() => cred);
      })
      .then((cred) => {
        window.UI.toast("Account created — welcome, " + (name || cred.user.email) + "!", "good");
      })
      .catch((err) => {
        window.UI.toast(_authErrMsg(err), "bad");
        throw err;
      });
  }

  /* ── Password reset ──────────────────────────────────────── */
  function sendPasswordReset(email) {
    return window.FB.auth.sendPasswordResetEmail(email)
      .then(() => {
        window.UI.toast("Reset email sent — check your inbox", "good");
      })
      .catch((err) => {
        window.UI.toast(_authErrMsg(err), "bad");
        throw err;
      });
  }

  /* ── Sign out ────────────────────────────────────────────── */
  function signOut() {
    window.FB.auth.signOut()
      .then(() => {
        // Show auth screen again
        window.Store.state.settings.authDismissed = false;
        window.Store.save();
        window.App.showAuth();
        window.UI.toast("Signed out", "good");
      })
      .catch((err) => {
        window.UI.toast("Sign-out failed — " + err.message, "bad");
      });
  }

  /* ── Current user accessor ───────────────────────────────── */
  function currentUser() {
    return window.FB.auth.currentUser;
  }

  /* ── Auth card: email form injection ─────────────────────── */
  function mountEmailForm(container) {
    // Build the expandable email form inside auth-card
    const wrap = document.createElement("div");
    wrap.id = "email-form-wrap";
    wrap.style.cssText = "margin-top:12px;";
    wrap.innerHTML = _formHTML("signin");
    container.appendChild(wrap);
    _bindEmailForm(wrap);
  }

  function _formHTML(mode) {
    if (mode === "reset") {
      return `
        <p class="auth-mode-label">Reset password</p>
        <div class="email-fields">
          <input id="ef-email" type="email" placeholder="Email address" autocomplete="email">
          <button class="btn btn--auth btn--email" id="ef-submit">Send reset email</button>
        </div>
        <div class="email-links">
          <button class="auth-text-btn" data-email-mode="signin">← Back to sign in</button>
        </div>`;
    }
    const isSignUp = mode === "signup";
    return `
      <p class="auth-mode-label">${isSignUp ? "Create account" : "Sign in with email"}</p>
      <div class="email-fields">
        ${isSignUp ? `<input id="ef-name" type="text" placeholder="Your name (optional)" autocomplete="name">` : ""}
        <input id="ef-email" type="email" placeholder="Email address" autocomplete="email">
        <input id="ef-password" type="password" placeholder="Password (6+ characters)" autocomplete="${isSignUp ? "new-password" : "current-password"}">
        <button class="btn btn--auth btn--email" id="ef-submit">${isSignUp ? "Create account" : "Sign in"}</button>
      </div>
      <div class="email-links">
        ${isSignUp
          ? `<button class="auth-text-btn" data-email-mode="signin">Already have an account? Sign in</button>`
          : `<button class="auth-text-btn" data-email-mode="signup">New here? Create account</button>
             <button class="auth-text-btn" data-email-mode="reset">Forgot password?</button>`}
      </div>`;
  }

  function _bindEmailForm(wrap) {
    // Mode toggle links
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-email-mode]");
      if (!btn) return;
      _emailMode = btn.dataset.emailMode;
      wrap.innerHTML = _formHTML(_emailMode);
      _bindEmailForm(wrap);
      const first = wrap.querySelector("input");
      if (first) first.focus();
    });

    // Submit
    const submit = wrap.querySelector("#ef-submit");
    if (!submit) return;
    submit.addEventListener("click", () => _handleEmailSubmit(wrap));

    // Enter key support
    wrap.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") _handleEmailSubmit(wrap);
      });
    });
  }

  function _handleEmailSubmit(wrap) {
    const email    = (wrap.querySelector("#ef-email")    || {}).value || "";
    const password = (wrap.querySelector("#ef-password") || {}).value || "";
    const name     = (wrap.querySelector("#ef-name")     || {}).value || "";

    const submit = wrap.querySelector("#ef-submit");
    if (submit) { submit.disabled = true; submit.textContent = "…"; }

    const re = () => { if (submit) { submit.disabled = false; submit.textContent = _modeLabel(); } };

    if (_emailMode === "reset") {
      if (!email) { window.UI.toast("Enter your email first", "bad"); re(); return; }
      sendPasswordReset(email).finally(re);
      return;
    }
    if (!email || !password) { window.UI.toast("Email and password are required", "bad"); re(); return; }
    if (password.length < 6)  { window.UI.toast("Password must be at least 6 characters", "bad"); re(); return; }

    const action = _emailMode === "signup"
      ? signUpEmail(email, password, name)
      : signInEmail(email, password);
    action.catch(re);
  }

  function _modeLabel() {
    return { signin: "Sign in", signup: "Create account", reset: "Send reset email" }[_emailMode] || "Submit";
  }

  /* ── Error messages ──────────────────────────────────────── */
  function _authErrMsg(err) {
    const map = {
      "auth/user-not-found":       "No account found for that email",
      "auth/wrong-password":       "Wrong password — try again or reset it",
      "auth/email-already-in-use": "An account already exists with that email — try signing in",
      "auth/weak-password":        "Password should be at least 6 characters",
      "auth/invalid-email":        "That doesn't look like a valid email",
      "auth/too-many-requests":    "Too many attempts — wait a moment and try again",
      "auth/network-request-failed": "Network error — check your connection",
      "auth/popup-blocked":        "Popup blocked — allow popups for this site and try again"
    };
    return map[err.code] || (err.message || "Authentication failed");
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.Auth = {
    startAuthListener,
    signInGoogle,
    signInEmail,
    signUpEmail,
    sendPasswordReset,
    signOut,
    currentUser,
    mountEmailForm
  };
})();
