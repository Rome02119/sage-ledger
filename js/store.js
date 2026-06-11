/* Sage Ledger — store.js
   State container + persistence.
   - Signed out / guest: localStorage (or in-memory fallback)
   - Signed in:          localStorage as cache + Firestore for cross-device sync
   Firestore doc: users/{uid}/state/ledger  (single document per user) */
(function () {
  "use strict";

  const KEY = "sage-ledger-v1";
  let memory = null; // in-memory fallback

  function storageAvailable() {
    try {
      const t = "__sage_test__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }
  const HAS_LS = typeof window !== "undefined" && storageAvailable();

  // ---------- date helpers ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayISO() { return iso(new Date()); }
  function monthKey(isoDate) { return isoDate.slice(0, 7); }
  function currentMonthKey() { return todayISO().slice(0, 7); }
  function daysInMonth(mk) {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }
  function dateInMonth(mk, day) { return mk + "-" + pad(Math.min(day, daysInMonth(mk))); }
  function shiftMonth(mk, delta) {
    const [y, m] = mk.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }
  function monthLabel(mk) {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  function shiftDays(isoDate, delta) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d + delta);
    return iso(dt);
  }

  // ---------- default state ----------
  function defaultState() {
    return {
      version: 1,
      settings: {
        name: "",
        heavyThreshold: 200,   // expenses at/above trigger the heavy-deduction animation + flag
        demoLoaded: false,
        authDismissed: false,
        theme: "light"         // "light" | "dark"
      },
      categories: {
        income: ["Salary / Paycheck", "Side Hustle", "Bonus", "Other Income"],
        expense: ["Rent / Mortgage", "Utilities", "Groceries", "Transportation",
          "Dining Out", "Subscriptions", "Insurance", "Health & Fitness",
          "Entertainment", "Personal Care", "Debt Payments", "Miscellaneous"]
      },
      budgets: {},        // { categoryName: monthlyAmount }
      transactions: [],   // {id,date,desc,category,amount,type,cardId?,recurringId?,paid?,receiptId?}
      recurring: [],      // {id,desc,category,amount,type,day,cardId?,autopay,active,startMonth}
      cards: [],          // {id,name,last4,limit,balance,dueDay,closeDay,paidThisCycle,lastPayment?}
      goals: [],          // {id,name,target,saved}
      receipts: []        // {id,name,kind,size,status,cardId?,added}  (binary not persisted)
    };
  }

  // ---------- persistence ----------
  function load() {
    let raw = null;
    if (HAS_LS) raw = window.localStorage.getItem(KEY);
    else raw = memory;
    if (!raw) return defaultState();
    try {
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed, {
        settings: Object.assign(defaultState().settings, parsed.settings || {})
      });
    } catch (e) { return defaultState(); }
  }

  const Store = {
    state: null,
    storageMode: HAS_LS ? "localStorage" : "memory",
    _baseStorageMode: HAS_LS ? "localStorage" : "memory",
    _uid: null,        // set by auth.js after sign-in
    _syncTimer: null,  // debounce handle for cloud writes

    init() { this.state = load(); return this.state; },

    save() {
      const raw = JSON.stringify(this.state);
      // Always write locally first (instant, offline-safe)
      if (HAS_LS) { try { window.localStorage.setItem(KEY, raw); } catch (e) { /* quota */ } }
      else memory = raw;
      // Debounced cloud write — 1.5 s after last mutation
      if (this._uid && window.FB && window.FB.db) {
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => this.saveCloud(), 1500);
      }
    },

    reset() {
      this.state = defaultState();
      this.save();
    },

    uid(prefix) {
      return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    },

    // ---------- Firestore cloud sync ----------

    /* Write current state to Firestore (called after sign-in and on save debounce). */
    saveCloud() {
      if (!this._uid || !window.FB || !window.FB.db) return;
      // Strip receipts binary data (object URLs don't survive cloud round-trip)
      const payload = JSON.parse(JSON.stringify(this.state));
      payload.receipts = []; // binaries stay local only
      window.FB.db
        .collection("user_state")
        .doc(this._uid)
        .set({ data: payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .then(() => {
          this.storageMode = "cloud + localStorage";
          // Stamp the sync time in Settings if visible
          const el = document.getElementById("sync-time");
          if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        })
        .catch((err) => console.warn("[Store] Firestore write failed:", err));
    },

    /* Load state from Firestore after sign-in. Falls back to local if no cloud doc exists. */
    loadCloud() {
      if (!this._uid || !window.FB || !window.FB.db) return Promise.resolve(null);
      return window.FB.db
        .collection("user_state")
        .doc(this._uid)
        .get()
        .then((doc) => {
          if (!doc.exists || !doc.data().data) return null;
          const cloud = doc.data().data;
          // Merge cloud data into local state (cloud wins — Option B: start fresh)
          this.state = Object.assign(defaultState(), cloud, {
            settings: Object.assign(defaultState().settings, (cloud.settings || {}), {
              authDismissed: true // already signed in
            })
          });
          this.save(); // write to localStorage as cache
          this.storageMode = "cloud + localStorage";
          return this.state;
        })
        .catch((err) => {
          console.warn("[Store] Firestore read failed, using local data:", err);
          return null;
        });
    },

    // ---------- demo data ----------
    loadDemo() {
      const s = defaultState();
      s.settings.demoLoaded = true;
      s.settings.name = "Rome";
      const today = todayISO();
      const tDay = Number(today.slice(8, 10));
      const mk0 = currentMonthKey();
      const mk1 = shiftMonth(mk0, -1);
      const mk2 = shiftMonth(mk0, -2);
      const startMonth = mk2;

      // Budgets — Groceries intentionally over (red), Dining close (amber), others green
      s.budgets = {
        "Rent / Mortgage": 1850, "Utilities": 220, "Groceries": 450,
        "Transportation": 180, "Dining Out": 220, "Subscriptions": 40,
        "Health & Fitness": 60, "Entertainment": 120, "Personal Care": 60,
        "Miscellaneous": 150
      };

      // Recurring templates (bills + paycheck). Internet engineered to be LATE this month.
      const lateDay = tDay > 5 ? tDay - 4 : 1; // already passed (or day 1 early in month)
      const R = (o) => Object.assign({ id: this.uid("rec"), cardId: null, autopay: false, active: true, startMonth }, o);
      const recRent = R({ desc: "Rent — Maple St Apt", category: "Rent / Mortgage", amount: 1850, type: "expense", day: 1, autopay: true });
      const recNet  = R({ desc: "Fiber Internet", category: "Utilities", amount: 79.99, type: "expense", day: lateDay });
      const recElec = R({ desc: "Electric Co.", category: "Utilities", amount: 118.4, type: "expense", day: 9, autopay: true });
      const recFlix = R({ desc: "Streaming TV", category: "Subscriptions", amount: 15.49, type: "expense", day: 12, autopay: true });
      const recTune = R({ desc: "Music streaming", category: "Subscriptions", amount: 11.99, type: "expense", day: 20, autopay: true });
      const recGym  = R({ desc: "Gym membership", category: "Health & Fitness", amount: 45, type: "expense", day: 5, autopay: true });
      const recPay1 = R({ desc: "Paycheck", category: "Salary / Paycheck", amount: 2600, type: "income", day: 1, autopay: true });
      const recPay2 = R({ desc: "Paycheck", category: "Salary / Paycheck", amount: 2600, type: "income", day: 15, autopay: true });
      s.recurring = [recRent, recNet, recElec, recFlix, recTune, recGym, recPay1, recPay2];

      // Cards. Quicksilver due in 3 days w/ high utilization (red); Sapphire healthy (green).
      const due3 = shiftDays(today, 3);
      const cardA = {
        id: this.uid("card"), name: "Sapphire Visa", last4: "4421", limit: 8000, balance: 982.16,
        dueDay: 17, closeDay: 24, paidThisCycle: tDay > 17, lastPayment: tDay > 17 ? dateInMonth(mk0, 16) : dateInMonth(mk1, 16)
      };
      const cardB = {
        id: this.uid("card"), name: "Quicksilver MC", last4: "9087", limit: 3500, balance: 2241.6,
        dueDay: Number(due3.slice(8, 10)), closeDay: ((Number(due3.slice(8, 10)) + 6) % 28) + 1,
        paidThisCycle: false, lastPayment: dateInMonth(mk1, Number(due3.slice(8, 10)))
      };
      s.cards = [cardA, cardB];

      // Goals — Vacation nearly there (green), others in flight
      s.goals = [
        { id: this.uid("goal"), name: "Emergency Fund", target: 10000, saved: 4200 },
        { id: this.uid("goal"), name: "Vacation", target: 3000, saved: 2610 },
        { id: this.uid("goal"), name: "Investments", target: 15000, saved: 1800 },
        { id: this.uid("goal"), name: "House Down Payment", target: 60000, saved: 12000 }
      ];

      // Hand-written spending history across 3 months
      const T = (mk, day, desc, category, amount, extra) => Object.assign({
        id: this.uid("txn"), date: dateInMonth(mk, day), desc, category, amount,
        type: "expense", cardId: null, recurringId: null
      }, extra || {});
      const spend = [];
      [mk2, mk1, mk0].forEach((mk, idx) => {
        const cap = (mk === mk0) ? Math.max(2, tDay) : daysInMonth(mk);
        const put = (day, desc, cat, amt, extra) => { if (day <= cap) spend.push(T(mk, day, desc, cat, amt, extra)); };
        put(2, "Trader Joe's", "Groceries", 96.4 + idx * 3, { cardId: cardA.id });
        put(6, "Shell — fill up", "Transportation", 42.18);
        put(8, "Market Basket", "Groceries", 132.75, { cardId: cardA.id });
        put(10, "Chipotle", "Dining Out", 18.6, { cardId: cardB.id });
        put(13, "CVS Pharmacy", "Personal Care", 24.99);
        put(16, "Market Basket", "Groceries", 118.2, { cardId: cardA.id });
        put(18, "Date night — Oleana", "Dining Out", 86.3, { cardId: cardB.id });
        put(21, "AMC movies", "Entertainment", 34.5, { cardId: cardB.id });
        put(23, "Whole Foods", "Groceries", 104.6, { cardId: cardA.id });
        put(26, "Uber", "Transportation", 23.4, { cardId: cardB.id });
        put(27, "Sushi takeout", "Dining Out", 47.8, { cardId: cardB.id });
      });
      // This month's red flags: a heavy purchase + grocery overage
      if (tDay >= 4) spend.push(T(mk0, tDay - 3, '55" 4K TV — Best Buy', "Entertainment", 464.99, { cardId: cardB.id }));
      else spend.push(T(mk1, 26, '55" 4K TV — Best Buy', "Entertainment", 464.99, { cardId: cardB.id }));
      if (tDay >= 2) spend.push(T(mk0, Math.min(tDay, 28), "Costco run", "Groceries", 187.3, { cardId: cardA.id }));

      s.transactions = spend;
      this.state = s;

      // Materialize recurring bills/income up to today (marks the engineered late bill unpaid)
      if (window.Logic) window.Logic.materializeRecurring(this.state);
      // Past months' manual bills were paid on time — only this month's internet is late
      this.state.transactions.forEach(t => {
        if (t.recurringId && t.paid === false && t.date.slice(0, 7) !== mk0) t.paid = true;
      });
      this.save();
      return this.state;
    },

    clearDemo() {
      this.reset();
    },

    helpers: { iso, todayISO, monthKey, currentMonthKey, daysInMonth, dateInMonth, shiftMonth, monthLabel, shiftDays, pad }
  };

  window.Store = Store;
})();
