/* Sage Ledger — app.js
   Boot, navigation, event wiring, forms. */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const VIEWS = ["home", "activity", "budget", "cards", "goals", "settings"];
  const App = {
    view: "home",
    _ambient: null,

    boot() {
      window.Store.init();
      const s = window.Store.state;
      // First run: preload demo so charts/states are visible immediately
      if (!s.settings.demoLoaded && s.transactions.length === 0 && !s.settings.everSeeded) {
        window.Store.loadDemo();
        window.Store.state.settings.everSeeded = true;
        window.Store.save();
      } else {
        window.Logic.materializeRecurring(s);
        window.Store.save();
      }
      this.wireGlobal();
      this.refreshBadges();
      // Start Firebase auth listener (no-op if Firebase isn't configured yet)
      if (window.Auth) window.Auth.startAuthListener();
      if (!window.Store.state.settings.authDismissed) this.showAuth();
      else this.go("home");
    },

    // ---------------- auth overlay ----------------
    showAuth() {
      const a = $("#auth-screen");
      a.hidden = false;
      $("#app").setAttribute("aria-hidden", "true");
      this._ambient = window.Anim.authAmbient($("#auth-canvas"));
      // Mount the email form panel inside the auth card
      const emailContainer = $("#auth-email-form");
      if (emailContainer && window.Auth) window.Auth.mountEmailForm(emailContainer);
      if (window.gsap && !window.Anim.reduced()) {
        window.gsap.fromTo("#auth-card", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", delay: 0.15 });
      }
    },
    hideAuth() {
      const a = $("#auth-screen");
      window.Store.state.settings.authDismissed = true;
      window.Store.save();
      const done = () => {
        a.hidden = true;
        $("#app").removeAttribute("aria-hidden");
        if (this._ambient) { this._ambient.stop(); this._ambient = null; }
        this.go("home");
      };
      if (window.gsap && !window.Anim.reduced()) {
        window.gsap.to(a, { opacity: 0, duration: 0.4, ease: "power2.in", onComplete: () => { a.style.opacity = ""; done(); } });
      } else done();
    },

    // ---------------- navigation ----------------
    go(view) {
      if (!VIEWS.includes(view)) view = "home";
      this.view = view;
      $$(".view").forEach(v => { v.hidden = v.id !== "view-" + view; });
      $$("[data-nav]").forEach(b => b.classList.toggle("is-active", b.dataset.nav === view));
      this.render(view);
      window.Anim.enterView($("#view-" + view));
      const main = $("main"); if (main) main.scrollTop = 0;
      window.scrollTo(0, 0);
    },

    render(view) {
      ({
        home: () => window.UI.renderDashboard(),
        activity: () => window.UI.renderActivity(),
        budget: () => window.UI.renderBudget(),
        cards: () => window.UI.renderCards(),
        goals: () => window.UI.renderGoals(),
        settings: () => window.UI.renderSettings()
      })[view]();
      this.refreshBadges();
    },

    rerender() { this.render(this.view); },

    refreshBadges() {
      const health = window.Logic.computeHealth(window.Store.state);
      const bad = health.alerts.filter(a => a.level === "bad").length;
      $$(".nav-badge").forEach(b => {
        b.textContent = bad;
        b.hidden = bad === 0;
      });
      const chip = $("#demo-chip");
      if (chip) chip.hidden = !window.Store.state.settings.demoLoaded;
    },

    // ---------------- mutations ----------------
    addTransaction(data) {
      const s = window.Store.state;
      const txn = Object.assign({ id: window.Store.uid("txn"), cardId: null, recurringId: null }, data);
      s.transactions.unshift(txn);
      s.transactions.sort((a, b) => a.date < b.date ? 1 : -1);
      if (txn.cardId && txn.type === "expense") {
        const card = s.cards.find(c => c.id === txn.cardId);
        if (card) card.balance = window.Logic.round2(card.balance + txn.amount);
      }
      window.Store.save();
      this.rerender();
      // The money moment
      if (txn.type === "income") window.Anim.moneyRain(txn.amount);
      else if (txn.amount >= s.settings.heavyThreshold) {
        window.Anim.heavyDeduction(txn.amount);
        window.UI.toast("Large purchase flagged: " + txn.desc, "bad");
      } else window.Anim.smallDeduction(txn.amount);
    },

    payBill(txnId) {
      const s = window.Store.state;
      const t = s.transactions.find(x => x.id === txnId);
      if (!t) return;
      t.paid = true;
      window.Store.save();
      window.UI.toast(t.desc + " marked paid", "good");
      this.rerender();
    },

    deleteTxn(txnId) {
      const s = window.Store.state;
      const t = s.transactions.find(x => x.id === txnId);
      if (!t) return;
      if (t.cardId && t.type === "expense") {
        const card = s.cards.find(c => c.id === t.cardId);
        if (card) card.balance = window.Logic.round2(Math.max(0, card.balance - t.amount));
      }
      s.transactions = s.transactions.filter(x => x.id !== txnId);
      window.Store.save();
      this.rerender();
      window.UI.toast("Transaction deleted");
    },

    payCard(cardId, amount) {
      const s = window.Store.state;
      const card = s.cards.find(c => c.id === cardId);
      if (!card) return;
      const amt = Math.min(amount, card.balance);
      card.balance = window.Logic.round2(card.balance - amt);
      card.paidThisCycle = true;
      card.lastPayment = window.Store.helpers.todayISO();
      s.transactions.unshift({
        id: window.Store.uid("txn"), date: card.lastPayment,
        desc: card.name + " payment", category: "Debt Payments",
        amount: amt, type: "expense", cardId: null, recurringId: null, paid: true
      });
      window.Store.save();
      this.rerender();
      window.UI.toast("Payment recorded — typically posts in 1\u20133 business days", "good");
      if (amt >= s.settings.heavyThreshold) window.Anim.heavyDeduction(amt);
      else window.Anim.smallDeduction(amt);
    },

    // ---------------- forms ----------------
    txnForm(existing) {
      const s = window.Store.state;
      const t = existing || { date: window.Store.helpers.todayISO(), type: "expense", desc: "", amount: "", category: "", cardId: "" };
      const catOpts = (type) => (type === "income" ? s.categories.income : s.categories.expense)
        .map(c => '<option' + (c === t.category ? " selected" : "") + ">" + window.UI.esc(c) + "</option>").join("");
      window.UI.openModal(existing ? "Edit transaction" : "Add transaction",
        '<div class="seg" role="tablist">' +
          '<button class="seg-btn' + (t.type === "expense" ? " is-active" : "") + '" data-type="expense">Spending</button>' +
          '<button class="seg-btn' + (t.type === "income" ? " is-active" : "") + '" data-type="income">Income</button></div>' +
        '<label class="field"><span>Amount</span><input id="f-amt" inputmode="decimal" placeholder="0.00" value="' + (t.amount || "") + '"></label>' +
        '<label class="field"><span>Description</span><input id="f-desc" placeholder="Where / what" value="' + window.UI.esc(t.desc) + '"></label>' +
        '<label class="field"><span>Category</span><select id="f-cat">' + catOpts(t.type) + "</select></label>" +
        '<label class="field"><span>Date</span><input id="f-date" type="date" value="' + t.date + '"></label>' +
        '<label class="field" id="f-card-wrap"' + (t.type === "income" ? " hidden" : "") + '><span>Paid with card (optional)</span><select id="f-card"><option value="">\u2014 cash / debit \u2014</option>' +
          s.cards.map(c => '<option value="' + c.id + '"' + (c.id === t.cardId ? " selected" : "") + ">" + window.UI.esc(c.name) + " \u00b7\u00b7" + c.last4 + "</option>").join("") + "</select></label>" +
        '<button class="btn btn--primary btn--block" id="f-save">' + (existing ? "Save changes" : "Add transaction") + "</button>",
        (body) => {
          let type = t.type;
          $$(".seg-btn", body).forEach(b => b.addEventListener("click", () => {
            type = b.dataset.type;
            $$(".seg-btn", body).forEach(x => x.classList.toggle("is-active", x === b));
            $("#f-cat").innerHTML = catOpts(type);
            $("#f-card-wrap").hidden = type === "income";
          }));
          $("#f-save").addEventListener("click", () => {
            const amount = window.Logic.round2(parseFloat($("#f-amt").value));
            const desc = $("#f-desc").value.trim();
            const date = $("#f-date").value;
            if (isNaN(amount) || amount <= 0) return window.UI.toast("Enter an amount above zero", "bad");
            if (!desc) return window.UI.toast("Add a short description", "bad");
            if (!date) return window.UI.toast("Pick a date", "bad");
            const data = { date, desc, amount, type, category: $("#f-cat").value, cardId: type === "expense" ? ($("#f-card").value || null) : null };
            window.UI.closeModal();
            if (existing) {
              Object.assign(existing, data);
              window.Store.save(); this.rerender();
              window.UI.toast("Transaction updated", "good");
            } else this.addTransaction(data);
          });
        });
    },

    recurringForm(existing) {
      const s = window.Store.state;
      const r = existing || { desc: "", amount: "", type: "expense", category: s.categories.expense[0], day: 1, autopay: false, active: true };
      const catOpts = (type) => (type === "income" ? s.categories.income : s.categories.expense)
        .map(c => '<option' + (c === r.category ? " selected" : "") + ">" + window.UI.esc(c) + "</option>").join("");
      window.UI.openModal(existing ? "Edit recurring" : "Add recurring",
        '<div class="seg"><button class="seg-btn' + (r.type === "expense" ? " is-active" : "") + '" data-type="expense">Bill</button>' +
        '<button class="seg-btn' + (r.type === "income" ? " is-active" : "") + '" data-type="income">Income</button></div>' +
        '<label class="field"><span>Name</span><input id="r-desc" value="' + window.UI.esc(r.desc) + '" placeholder="Rent, Internet, Paycheck\u2026"></label>' +
        '<label class="field"><span>Amount each month</span><input id="r-amt" inputmode="decimal" value="' + (r.amount || "") + '"></label>' +
        '<label class="field"><span>Category</span><select id="r-cat">' + catOpts(r.type) + "</select></label>" +
        '<label class="field"><span>Day of month</span><input id="r-day" inputmode="numeric" value="' + r.day + '" placeholder="1\u201331"></label>' +
        '<label class="check"><input id="r-auto" type="checkbox"' + (r.autopay ? " checked" : "") + "> Autopay (marks itself paid)</label>" +
        (existing ? '<label class="check"><input id="r-active" type="checkbox"' + (r.active ? " checked" : "") + "> Active</label>" : "") +
        '<button class="btn btn--primary btn--block" id="r-save">' + (existing ? "Save changes" : "Add recurring") + "</button>" +
        '<p class="hint">Future months auto-populate with this entry; unpaid bills past their day turn red.</p>',
        (body) => {
          let type = r.type;
          $$(".seg-btn", body).forEach(b => b.addEventListener("click", () => {
            type = b.dataset.type;
            $$(".seg-btn", body).forEach(x => x.classList.toggle("is-active", x === b));
            $("#r-cat").innerHTML = catOpts(type);
          }));
          $("#r-save").addEventListener("click", () => {
            const amount = window.Logic.round2(parseFloat($("#r-amt").value));
            const day = Math.min(31, Math.max(1, parseInt($("#r-day").value, 10) || 1));
            const desc = $("#r-desc").value.trim();
            if (!desc || isNaN(amount) || amount <= 0) return window.UI.toast("Name and amount are required", "bad");
            window.UI.closeModal();
            if (existing) {
              Object.assign(existing, { desc, amount, type, day, category: $("#r-cat").value, autopay: $("#r-auto").checked, active: $("#r-active") ? $("#r-active").checked : true });
            } else {
              s.recurring.push({
                id: window.Store.uid("rec"), desc, amount, type, day,
                category: $("#r-cat").value, autopay: $("#r-auto").checked,
                active: true, cardId: null, startMonth: window.Store.helpers.currentMonthKey()
              });
            }
            window.Logic.materializeRecurring(s);
            window.Store.save();
            this.rerender();
            window.UI.toast(existing ? "Recurring updated" : desc + " will auto-fill every month", "good");
          });
        });
    },

    cardForm(existing) {
      const c = existing || { name: "", last4: "", limit: "", balance: "", dueDay: 1, closeDay: 25 };
      window.UI.openModal(existing ? "Edit card" : "Add credit card",
        '<label class="field"><span>Card name</span><input id="c-name" value="' + window.UI.esc(c.name) + '" placeholder="Sapphire Visa"></label>' +
        '<div class="field-row">' +
          '<label class="field"><span>Last 4 digits</span><input id="c-last4" inputmode="numeric" maxlength="4" value="' + window.UI.esc(c.last4) + '"></label>' +
          '<label class="field"><span>Credit limit</span><input id="c-limit" inputmode="decimal" value="' + (c.limit || "") + '"></label></div>' +
        '<div class="field-row">' +
          '<label class="field"><span>Current balance</span><input id="c-bal" inputmode="decimal" value="' + (c.balance === "" ? "" : c.balance) + '"></label>' +
          '<label class="field"><span>Payment due day</span><input id="c-due" inputmode="numeric" value="' + c.dueDay + '" placeholder="1\u201328"></label></div>' +
        '<label class="field"><span>Statement close day</span><input id="c-close" inputmode="numeric" value="' + c.closeDay + '"></label>' +
        '<p class="hint">Find both days on any statement. Most cards close ~25 days before the due date; payments post in 1\u20133 business days.</p>' +
        '<button class="btn btn--primary btn--block" id="c-save">' + (existing ? "Save card" : "Add card") + "</button>",
        () => {
          $("#c-save").addEventListener("click", () => {
            const name = $("#c-name").value.trim();
            const limit = parseFloat($("#c-limit").value);
            if (!name || isNaN(limit) || limit <= 0) return window.UI.toast("Card name and limit are required", "bad");
            const data = {
              name, last4: ($("#c-last4").value || "0000").replace(/\D/g, "").slice(0, 4).padStart(4, "0"),
              limit: window.Logic.round2(limit),
              balance: window.Logic.round2(parseFloat($("#c-bal").value) || 0),
              dueDay: Math.min(28, Math.max(1, parseInt($("#c-due").value, 10) || 1)),
              closeDay: Math.min(28, Math.max(1, parseInt($("#c-close").value, 10) || 25))
            };
            window.UI.closeModal();
            if (existing) Object.assign(existing, data);
            else window.Store.state.cards.push(Object.assign({ id: window.Store.uid("card"), paidThisCycle: false }, data));
            window.Store.save();
            this.rerender();
            window.UI.toast(existing ? "Card updated" : name + " added", "good");
          });
        });
    },

    goalForm(existing) {
      const g = existing || { name: "", target: "", saved: 0 };
      window.UI.openModal(existing ? "Edit goal" : "New goal",
        '<label class="field"><span>Goal name</span><input id="g-name" value="' + window.UI.esc(g.name) + '" placeholder="Emergency fund"></label>' +
        '<div class="field-row"><label class="field"><span>Target</span><input id="g-target" inputmode="decimal" value="' + (g.target || "") + '"></label>' +
        '<label class="field"><span>Saved so far</span><input id="g-saved" inputmode="decimal" value="' + g.saved + '"></label></div>' +
        '<button class="btn btn--primary btn--block" id="g-save">' + (existing ? "Save goal" : "Create goal") + "</button>",
        () => {
          $("#g-save").addEventListener("click", () => {
            const name = $("#g-name").value.trim();
            const target = parseFloat($("#g-target").value);
            if (!name || isNaN(target) || target <= 0) return window.UI.toast("Name and target are required", "bad");
            const saved = window.Logic.round2(parseFloat($("#g-saved").value) || 0);
            window.UI.closeModal();
            if (existing) Object.assign(existing, { name, target: window.Logic.round2(target), saved });
            else window.Store.state.goals.push({ id: window.Store.uid("goal"), name, target: window.Logic.round2(target), saved });
            window.Store.save();
            this.rerender();
            window.UI.toast(existing ? "Goal updated" : name + " created", "good");
          });
        });
    },

    fundGoal(goalId) {
      const g = window.Store.state.goals.find(x => x.id === goalId);
      if (!g) return;
      window.UI.openModal("Add to " + g.name,
        '<label class="field"><span>Amount to add</span><input id="fund-amt" inputmode="decimal" placeholder="100"></label>' +
        '<button class="btn btn--primary btn--block" id="fund-save">Add to goal</button>',
        () => {
          $("#fund-save").addEventListener("click", () => {
            const v = window.Logic.round2(parseFloat($("#fund-amt").value));
            if (isNaN(v) || v <= 0) return window.UI.toast("Enter an amount above zero", "bad");
            g.saved = window.Logic.round2(g.saved + v);
            window.Store.save();
            window.UI.closeModal();
            this.rerender();
            window.Anim.moneyRain(v);
            if (g.saved >= g.target) window.UI.toast(g.name + " fully funded \uD83C\uDF89", "good");
          });
        });
    },

    payCardForm(cardId) {
      const c = window.Store.state.cards.find(x => x.id === cardId);
      if (!c) return;
      const cy = window.Logic.cardCycle(c);
      window.UI.openModal("Pay " + c.name,
        '<p class="hint">Balance ' + window.Logic.money(c.balance) + " \u00b7 due " + cy.due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        ". Payments typically post in 1\u20133 business days.</p>" +
        '<label class="field"><span>Payment amount</span><input id="pay-amt" inputmode="decimal" value="' + c.balance + '"></label>' +
        '<button class="btn btn--primary btn--block" id="pay-save">Record payment</button>',
        () => {
          $("#pay-save").addEventListener("click", () => {
            const v = window.Logic.round2(parseFloat($("#pay-amt").value));
            if (isNaN(v) || v <= 0) return window.UI.toast("Enter an amount above zero", "bad");
            window.UI.closeModal();
            this.payCard(cardId, v);
          });
        });
    },

    // ---------------- CSV flow ----------------
    csvFlow(file, opts) {
      window.Upload.readCSV(file).then(analyzed => {
        const map = analyzed.mapping;
        const cols = analyzed.header.map((hd, i) => '<option value="' + i + '">' + window.UI.esc(hd) + "</option>").join("");
        const preview = analyzed.data.slice(0, 5).map(r =>
          "<tr>" + analyzed.header.map((_, i) => "<td>" + window.UI.esc((r[i] || "").slice(0, 22)) + "</td>").join("") + "</tr>").join("");
        window.UI.openModal("Import " + window.UI.esc(file.name),
          '<div class="csv-table-wrap"><table class="csv-table"><thead><tr>' +
            analyzed.header.map(hd => "<th>" + window.UI.esc(hd) + "</th>").join("") + "</tr></thead><tbody>" + preview + "</tbody></table></div>" +
          '<div class="field-row">' +
            '<label class="field"><span>Date column</span><select id="csv-date">' + cols + "</select></label>" +
            '<label class="field"><span>Amount column</span><select id="csv-amt">' + cols + "</select></label></div>" +
          '<div class="field-row">' +
            '<label class="field"><span>Description column</span><select id="csv-desc">' + cols + "</select></label>" +
            '<label class="field"><span>Category column</span><select id="csv-cat"><option value="-1">\u2014 none \u2014</option>' + cols + "</select></label></div>" +
          '<label class="check"><input id="csv-neg" type="checkbox" checked> Negative amounts are spending (bank style)</label>' +
          (opts && opts.cardId ? "" :
            '<label class="field"><span>Attach to card (optional)</span><select id="csv-card"><option value="">\u2014 none \u2014</option>' +
            window.Store.state.cards.map(c => '<option value="' + c.id + '">' + window.UI.esc(c.name) + "</option>").join("") + "</select></label>") +
          '<button class="btn btn--primary btn--block" id="csv-go">Import ' + analyzed.data.length + " rows</button>",
          () => {
            $("#csv-date").value = map.date; $("#csv-amt").value = map.amount;
            $("#csv-desc").value = map.desc; $("#csv-cat").value = map.category;
            $("#csv-go").addEventListener("click", () => {
              const mapping = {
                date: +$("#csv-date").value, amount: +$("#csv-amt").value,
                desc: +$("#csv-desc").value, category: +$("#csv-cat").value
              };
              const cardId = (opts && opts.cardId) || ($("#csv-card") ? $("#csv-card").value : "") || null;
              const res = window.Logic.importRows(window.Store.state, analyzed, mapping, {
                negativeIsExpense: $("#csv-neg").checked, cardId
              });
              window.Store.save();
              window.UI.closeModal();
              this.go("activity");
              window.UI.toast("Imported " + res.imported + " transactions" + (res.skipped ? " (" + res.skipped + " skipped)" : ""), "good");
            });
          });
      }).catch(err => window.UI.toast(err.message || "Couldn't parse that CSV", "bad"));
    },

    // ---------------- global wiring ----------------
    wireGlobal() {
      // delegated clicks
      document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-act],[data-nav]");
        if (!el) return;
        if (el.dataset.nav) { this.go(el.dataset.nav); return; }
        this.handleAction(el.dataset.act, el);
      });

      // file inputs
      $("#file-camera").addEventListener("change", (e) => this.handleFiles(e.target));
      $("#file-any").addEventListener("change", (e) => this.handleFiles(e.target));
      $("#file-csv").addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (f) this.csvFlow(f, this._csvOpts);
        this._csvOpts = null;
        e.target.value = "";
      });

      // overlay dismissal + escape
      $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) window.UI.closeModal(); });
      $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") window.UI.closeSheet(); });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { window.UI.closeModal(); window.UI.closeSheet(); }
      });

      // redraw charts on resize/orientation
      let rt;
      window.addEventListener("resize", () => {
        clearTimeout(rt);
        rt = setTimeout(() => { if (this.view === "home") this.render("home"); }, 180);
      });
    },

    handleFiles(input) {
      const res = window.Upload.intake(input.files, this._uploadOpts);
      this._uploadOpts = null;
      input.value = "";
      if (res.csv) { this.csvFlow(res.csv); return; }
      if (res.receipts.length) {
        this.go("cards");
        window.UI.toast(res.receipts.length + " file" + (res.receipts.length > 1 ? "s" : "") + " added to the inbox — OCR parsing needs the backend", "warn");
      }
      if (res.unsupported) window.UI.toast("That file type isn't supported (photos, PDF, CSV)", "bad");
    },

    handleAction(act, el) {
      const s = window.Store.state;
      const ref = el && el.dataset ? el.dataset.ref : null;
      const find = (arr) => arr.find(x => x.id === ref);
      const actions = {
        // auth
        "auth-google": () => {
          if (window.Auth) window.Auth.signInGoogle();
          else window.UI.toast("Firebase isn't configured yet — fill in js/firebase-config.js", "warn");
        },
        "auth-email-toggle": () => {
          // The email form is already mounted; toggle its visibility
          const ef = $("#auth-email-form");
          if (!ef) return;
          const isVisible = ef.style.display !== "none" && ef.innerHTML.trim() !== "";
          if (isVisible) {
            ef.style.display = "none";
            const btn = $("#btn-email-toggle");
            if (btn) btn.classList.remove("is-active");
          } else {
            ef.style.display = "";
            const btn = $("#btn-email-toggle");
            if (btn) btn.classList.add("is-active");
            const first = ef.querySelector("input");
            if (first) first.focus();
          }
        },
        "auth-apple": () => window.UI.toast("Apple Sign-In coming soon — use Google or email for now", "warn"),
        "auth-skip": () => this.hideAuth(),
        "auth-sign-out": () => { if (window.Auth) window.Auth.signOut(); },
        "settings-email-form": () => {
          const wrap = $("#settings-email-form-wrap");
          if (!wrap) return;
          const showing = wrap.innerHTML.trim() !== "";
          if (showing) { wrap.innerHTML = ""; return; }
          if (window.Auth) window.Auth.mountEmailForm(wrap);
        },
        // fab / sheet
        "open-sheet": () => window.UI.openSheet(),
        "close-sheet": () => window.UI.closeSheet(),
        "sheet-manual": () => { window.UI.closeSheet(); this.txnForm(); },
        "sheet-camera": () => { window.UI.closeSheet(); $("#file-camera").click(); },
        "sheet-upload": () => { window.UI.closeSheet(); $("#file-any").click(); },
        "sheet-csv": () => { window.UI.closeSheet(); $("#file-csv").click(); },
        // txns
        "add-txn": () => this.txnForm(),
        "edit-txn": () => this.txnForm(find(s.transactions)),
        "del-txn": () => this.deleteTxn(ref),
        "pay-bill": () => this.payBill(ref),
        "import-csv": () => $("#file-csv").click(),
        // months
        "month-prev": () => this.shiftMonth(el.dataset.scope, -1),
        "month-next": () => this.shiftMonth(el.dataset.scope, 1),
        // cards
        "add-card": () => this.cardForm(),
        "edit-card": () => this.cardForm(find(s.cards)),
        "del-card": () => { s.cards = s.cards.filter(c => c.id !== ref); window.Store.save(); this.rerender(); window.UI.toast("Card removed"); },
        "pay-card": () => this.payCardForm(ref),
        "upload-statement": () => { this._uploadOpts = { cardId: ref }; this._csvOpts = { cardId: ref }; $("#file-any").click(); },
        "del-receipt": () => { window.Upload.removeReceipt(ref); this.rerender(); },
        // goals
        "add-goal": () => this.goalForm(),
        "edit-goal": () => this.goalForm(find(s.goals)),
        "del-goal": () => { s.goals = s.goals.filter(g => g.id !== ref); window.Store.save(); this.rerender(); window.UI.toast("Goal deleted"); },
        "fund-goal": () => this.fundGoal(ref),
        // recurring
        "add-rec": () => this.recurringForm(),
        "edit-rec": () => this.recurringForm(find(s.recurring)),
        "del-rec": () => { s.recurring = s.recurring.filter(r => r.id !== ref); window.Store.save(); this.rerender(); window.UI.toast("Recurring removed — past entries kept"); },
        // categories
        "add-cat": () => {
          const inp = $("#cat-new"); const kind = $("#cat-kind").value;
          const name = (inp.value || "").trim();
          if (!name) return;
          const list = s.categories[kind];
          if (!list.includes(name)) list.push(name);
          window.Store.save(); this.rerender();
        },
        "del-cat": () => {
          const kind = el.dataset.kind;
          s.categories[kind] = s.categories[kind].filter(c => c !== ref);
          window.Store.save(); this.rerender();
        },
        // nav-ish
        "view-budget": () => this.go("budget"),
        "view-cards": () => this.go("cards"),
        "view-activity": () => this.go("activity"),
        "scroll-alerts": () => { const a = $("#alerts-card"); if (a) a.scrollIntoView({ behavior: "smooth", block: "start" }); },
        // demo / reset
        "load-demo": () => { window.Store.loadDemo(); this.rerender(); window.UI.toast("Demo data loaded", "good"); },
        "clear-demo": () => { window.Store.clearDemo(); this.rerender(); window.UI.toast("Fresh start — demo cleared", "good"); },
        "reset-all": () => { window.Store.reset(); this.rerender(); window.UI.toast("Everything erased"); }
      };
      if (actions[act]) actions[act]();
    },

    shiftMonth(scope, delta) {
      const h = window.Store.helpers;
      if (scope === "activity") {
        window.UI.activityMonth = h.shiftMonth(window.UI.activityMonth || h.currentMonthKey(), delta);
        this.render("activity");
      } else {
        window.UI.budgetMonth = h.shiftMonth(window.UI.budgetMonth || h.currentMonthKey(), delta);
        this.render("budget");
      }
    }
  };

  window.App = App;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.boot());
  else App.boot();
})();
