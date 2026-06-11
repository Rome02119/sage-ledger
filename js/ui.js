/* Sage Ledger — ui.js
   All rendering. Views: dashboard, activity, budget, cards, goals, settings.
   Plus modals (transaction, recurring, card, goal, CSV preview), sheets, toasts. */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const M = () => window.Logic.money;

  const UI = {
    activityMonth: null,
    budgetMonth: null,

    // ---------------- toasts ----------------
    toast(msg, tone) {
      const stack = $("#toast-stack"); if (!stack) return;
      const el = document.createElement("div");
      el.className = "toast" + (tone ? " toast--" + tone : "");
      el.textContent = msg;
      stack.appendChild(el);
      requestAnimationFrame(() => el.classList.add("toast--in"));
      setTimeout(() => { el.classList.remove("toast--in"); setTimeout(() => el.remove(), 300); }, 3400);
    },

    // ---------------- icons ----------------
    icon(name) {
      const I = {
        home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/>',
        activity: '<path d="M4 17l4-6 3.5 3L16 8l4 5"/><path d="M4 21h16"/>',
        budget: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12V3.5"/><path d="M12 12l6 6"/>',
        card: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/><path d="M7 15.5h4"/>',
        goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
        settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
        file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
        csv: '<path d="M7 3h7l4 4v14H7z"/><path d="M9.5 12h5M9.5 15.5h5"/>',
        pen: '<path d="M5 19l1-4L16.5 4.5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L9 18z"/>',
        bill: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>',
        heavy: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
        net: '<path d="M4 14l5-5 4 4 7-7"/><path d="M14 6h6v6"/>',
        more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
        x: '<path d="M6 6l12 12M18 6L6 18"/>',
        chevL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
        chevR: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
        repeat: '<path d="M4 9a5 5 0 0 1 5-5h8"/><path d="M14.5 1.5 17 4l-2.5 2.5"/><path d="M20 15a5 5 0 0 1-5 5H7"/><path d="M9.5 22.5 7 20l2.5-2.5"/>',
        trash: '<path d="M5 7h14M9 7V4.5h6V7M8 7l.7 13h6.6L16 7"/>'
      };
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || I.more) + "</svg>";
    },

    catEmoji(cat) {
      const map = {
        "Rent / Mortgage": "\uD83C\uDFE0", "Utilities": "\uD83D\uDCA1", "Groceries": "\uD83D\uDED2",
        "Transportation": "\u26FD", "Dining Out": "\uD83C\uDF7D\uFE0F", "Subscriptions": "\uD83D\uDCFA",
        "Insurance": "\uD83D\uDEE1\uFE0F", "Health & Fitness": "\uD83D\uDCAA", "Entertainment": "\uD83C\uDFAC",
        "Personal Care": "\uD83E\uDDF4", "Debt Payments": "\uD83D\uDCB3", "Miscellaneous": "\uD83D\uDCE6",
        "Salary / Paycheck": "\uD83D\uDCB5", "Side Hustle": "\uD83D\uDEE0\uFE0F", "Bonus": "\uD83C\uDF81", "Other Income": "\uD83D\uDCB0"
      };
      return map[cat] || "\uD83C\uDFF7\uFE0F";
    },

    // ---------------- dashboard ----------------
    renderDashboard() {
      const state = window.Store.state;
      const L = window.Logic;
      const view = $("#view-home");
      const health = L.computeHealth(state);
      const h = window.Store.helpers;
      const series = L.monthlySeries(state, 6);
      const greet = state.settings.name ? "Hi, " + esc(state.settings.name) : "Welcome";
      const upcoming = L.projectedFor(state, h.currentMonthKey())
        .concat(L.projectedFor(state, h.shiftMonth(h.currentMonthKey(), 1)))
        .filter(t => t.type === "expense")
        .sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 5);

      const segs = L.ribbonSegments(state);
      const ribbon = segs.length
        ? segs.map(s => '<button class="ribbon-seg ribbon-seg--' + s.tone + '" style="flex:' + Math.max(4, Math.round(s.share * 100)) +
          '" data-act="view-budget" title="' + esc(s.cat) + " \u00b7 " + M()(s.amount) + '"><span>' + esc(s.cat) + "</span></button>").join("")
        : '<div class="ribbon-empty">Add spending to see where your money goes</div>';

      view.innerHTML =
        '<header class="page-head">' +
          '<div><p class="eyebrow">' + greet + "</p><h1>This month at a glance</h1></div>" +
          '<span class="health-chip health-chip--' + health.tone + '" data-act="scroll-alerts">' +
            '<i></i>' + health.label + " \u00b7 " + health.score + "</span>" +
        "</header>" +
        '<div class="ribbon" role="img" aria-label="Spending mix by category, colored by budget status">' + ribbon + "</div>" +
        '<div class="kpi-grid">' +
          kpi("Income", health.income, "income") +
          kpi("Spending", health.expense, "expense") +
          kpi("Net", health.net, health.net >= 0 ? "good" : "bad") +
          kpi("On cards", state.cards.reduce((a, c) => a + c.balance, 0), "cards") +
        "</div>" +
        '<div class="grid-2">' +
          '<section class="card chart-card"><h2>Spending by category</h2><div class="chart-wrap"><canvas id="chart-doughnut"></canvas></div><div class="legend" id="doughnut-legend"></div></section>' +
          '<section class="card chart-card"><h2>Income vs. spending \u00b7 6 months</h2><div class="chart-wrap"><canvas id="chart-bars"></canvas></div>' +
            '<div class="legend"><span class="legend-key"><i style="background:#6B7C5E"></i>Income</span><span class="legend-key"><i style="background:#C9A87C"></i>Spending</span></div></section>' +
        "</div>" +
        '<div class="grid-2">' +
          '<section class="card" id="alerts-card"><h2>What needs your eyes</h2><div class="alert-list">' +
            (health.alerts.length ? health.alerts.map(a =>
              '<button class="alert-row alert-row--' + a.level + '"' + (a.action ? ' data-act="' + a.action + '"' + (a.refId ? ' data-ref="' + a.refId + '"' : "") : "") + ">" +
                '<span class="alert-ic">' + this.icon(a.icon) + "</span>" +
                '<span class="alert-body"><strong>' + esc(a.title) + "</strong><small>" + esc(a.sub || "") + "</small></span>" +
              "</button>").join("") : '<p class="empty">Nothing yet — add a transaction to get insights.</p>') +
          "</div></section>" +
          '<section class="card"><h2>Coming up</h2><div class="upcoming-list">' +
            (upcoming.length ? upcoming.map(t => {
              const dueIn = L.daysUntil(new Date(t.date + "T00:00"));
              return '<div class="upcoming-row"><span class="up-emoji">' + this.catEmoji(t.category) + "</span>" +
                '<span class="up-body"><strong>' + esc(t.desc) + "</strong><small>" + t.date + " \u00b7 in " + dueIn + " day" + (dueIn === 1 ? "" : "s") + "</small></span>" +
                '<span class="up-amt">' + M()(t.amount) + "</span></div>";
            }).join("") : '<p class="empty">No scheduled bills. Add recurring bills in Settings.</p>') +
          "</div></section>" +
        "</div>";

      function kpi(label, value, tone) {
        return '<div class="kpi kpi--' + tone + '"><small>' + label + '</small><strong class="kpi-num" data-val="' + value + '">' + M()(value) + "</strong></div>";
      }

      // charts + count-ups
      const spentEntries = Object.entries(health.spent)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value }));
      const dn = $("#chart-doughnut");
      if (dn) window.Charts.doughnut(dn, spentEntries, "spent this month", window.Logic.money0(health.expense));
      const legend = $("#doughnut-legend");
      if (legend) legend.innerHTML = spentEntries.slice(0, 6).map((e, i) =>
        '<span class="legend-key"><i style="background:' + window.Charts.PALETTE[i % window.Charts.PALETTE.length] + '"></i>' + esc(e.label) + "</span>").join("");
      const bc = $("#chart-bars");
      if (bc) window.Charts.bars(bc, series);
      $$(".kpi-num", view).forEach(el => window.Anim.countUp(el, parseFloat(el.dataset.val), M()));
    },

    // ---------------- activity (transactions) ----------------
    renderActivity() {
      const state = window.Store.state;
      const L = window.Logic, h = window.Store.helpers;
      if (!this.activityMonth) this.activityMonth = h.currentMonthKey();
      const mk = this.activityMonth;
      const view = $("#view-activity");
      const q = (this._search || "").toLowerCase();
      let txns = L.txnsForMonth(state, mk, true);
      if (q) txns = txns.filter(t => (t.desc + " " + t.category).toLowerCase().includes(q));
      const income = L.sumBy(txns, "income"), expense = L.sumBy(txns, "expense");
      const groups = {};
      txns.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });

      view.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">Activity</p><h1>Transactions</h1></div>' +
          '<div class="head-actions"><button class="btn btn--ghost" data-act="import-csv">' + this.icon("csv") + "Import CSV</button>" +
          '<button class="btn btn--primary" data-act="add-txn">' + this.icon("plus") + "Add</button></div></header>" +
        monthBar(mk, "activity") +
        '<div class="month-summary"><span class="sum sum--good">+' + M()(income) + "</span><span class=\"sum sum--bad\">\u2212" + M()(expense) + "</span>" +
          '<input id="txn-search" class="search" type="search" placeholder="Search merchants, categories\u2026" value="' + esc(this._search || "") + '"></div>' +
        '<section class="card txn-card">' +
        (Object.keys(groups).length ? Object.keys(groups).sort().reverse().map(date =>
          '<div class="txn-day"><h3>' + dayLabel(date) + "</h3>" +
          groups[date].map(t => this.txnRow(t)).join("") + "</div>").join("")
          : '<p class="empty">No transactions in ' + h.monthLabel(mk) + '. Tap <strong>Add</strong> or the <strong>+</strong> button to log one.</p>') +
        "</section>";

      const search = $("#txn-search");
      if (search) search.addEventListener("input", (e) => {
        this._search = e.target.value;
        clearTimeout(this._st);
        this._st = setTimeout(() => { this.renderActivity(); $("#txn-search").focus(); const v = $("#txn-search"); v.setSelectionRange(v.value.length, v.value.length); }, 220);
      });

      function dayLabel(date) {
        const today = h.todayISO();
        if (date === today) return "Today";
        if (date === h.shiftDays(today, -1)) return "Yesterday";
        const [y, m, d] = date.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      }
    },

    txnRow(t) {
      const state = window.Store.state;
      const card = t.cardId ? state.cards.find(c => c.id === t.cardId) : null;
      const isIncome = t.type === "income";
      const late = t.recurringId && t.paid === false && t.date < window.Store.helpers.todayISO();
      const heavy = !isIncome && !t.recurringId && t.amount >= state.settings.heavyThreshold;
      const tags = [];
      if (t.projected) tags.push('<span class="tag">Scheduled</span>');
      if (t.recurringId && !t.projected) tags.push('<span class="tag tag--sage">' + this.icon("repeat") + "Recurring</span>");
      if (late) tags.push('<span class="tag tag--bad">Late</span>');
      if (heavy) tags.push('<span class="tag tag--bad">Large</span>');
      if (card) tags.push('<span class="tag">' + esc(card.name) + " \u00b7\u00b7" + esc(card.last4) + "</span>");
      if (t.imported) tags.push('<span class="tag">Imported</span>');
      return '<div class="txn-row' + (t.projected ? " txn-row--proj" : "") + (late ? " txn-row--late" : "") + '" data-id="' + t.id + '">' +
        '<span class="txn-emoji">' + this.catEmoji(t.category) + "</span>" +
        '<span class="txn-body"><strong>' + esc(t.desc) + '</strong><small>' + esc(t.category) + (tags.length ? " " + tags.join("") : "") + "</small></span>" +
        '<span class="txn-amt ' + (isIncome ? "txn-amt--in" : heavy || late ? "txn-amt--flag" : "") + '">' + (isIncome ? "+" : "\u2212") + M()(t.amount) + "</span>" +
        (t.projected ? "" :
          '<span class="txn-actions">' +
          (late ? '<button class="mini-btn mini-btn--good" data-act="pay-bill" data-ref="' + t.id + '" title="Mark paid">' + this.icon("check") + "</button>" : "") +
          '<button class="mini-btn" data-act="edit-txn" data-ref="' + t.id + '" title="Edit">' + this.icon("pen") + "</button>" +
          '<button class="mini-btn" data-act="del-txn" data-ref="' + t.id + '" title="Delete">' + this.icon("trash") + "</button></span>") +
        "</div>";
    },

    // ---------------- budget ----------------
    renderBudget() {
      const state = window.Store.state;
      const L = window.Logic, h = window.Store.helpers;
      if (!this.budgetMonth) this.budgetMonth = h.currentMonthKey();
      const mk = this.budgetMonth;
      const spent = L.spentByCategory(state, mk);
      const view = $("#view-budget");
      const rows = state.categories.expense.map(cat => {
        const b = state.budgets[cat] || 0;
        const sp = spent[cat] || 0;
        const pct = b > 0 ? Math.min(100, sp / b * 100) : 0;
        const tone = !b ? "neutral" : sp > b ? "bad" : sp > b * 0.85 ? "warn" : "good";
        return '<div class="budget-row">' +
          '<span class="txn-emoji">' + this.catEmoji(cat) + "</span>" +
          '<div class="budget-body"><div class="budget-line"><strong>' + esc(cat) + "</strong>" +
            '<span class="budget-nums' + (tone === "bad" ? " is-bad" : "") + '">' + M()(sp) +
            (b ? ' <em>of ' + window.Logic.money0(b) + "</em>" : ' <em>\u00b7 no budget</em>') + "</span></div>" +
            '<div class="bar"><i class="bar-fill bar-fill--' + tone + '" style="width:' + pct + '%"></i>' +
            (b && sp > b ? '<i class="bar-over"></i>' : "") + "</div></div>" +
          '<input class="budget-input" inputmode="decimal" data-cat="' + esc(cat) + '" value="' + (b || "") + '" placeholder="0" aria-label="Monthly budget for ' + esc(cat) + '">' +
          "</div>";
      }).join("");
      const totalB = state.categories.expense.reduce((a, c) => a + (state.budgets[c] || 0), 0);
      const totalS = Object.values(spent).reduce((a, b) => a + b, 0);
      view.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">Plan</p><h1>Monthly budget</h1></div>' +
        '<span class="health-chip health-chip--' + (totalS > totalB && totalB ? "bad" : "good") + '"><i></i>' + M()(totalS) + " of " + window.Logic.money0(totalB) + "</span></header>" +
        monthBar(mk, "budget") +
        '<section class="card">' + rows + "</section>" +
        '<p class="hint">Type a number to set a category budget — it saves as you go. Red means over, amber means close.</p>';

      $$(".budget-input", view).forEach(inp => {
        inp.addEventListener("change", () => {
          const v = parseFloat(inp.value);
          if (!isNaN(v) && v > 0) state.budgets[inp.dataset.cat] = window.Logic.round2(v);
          else delete state.budgets[inp.dataset.cat];
          window.Store.save();
          this.renderBudget();
          window.App.refreshBadges();
        });
      });
    },

    // ---------------- cards ----------------
    renderCards() {
      const state = window.Store.state;
      const L = window.Logic;
      const view = $("#view-cards");
      const cardsHTML = state.cards.map((c, i) => {
        const cy = L.cardCycle(c);
        const utilPct = Math.min(100, Math.round(cy.util * 100));
        const dueStr = cy.due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const closeStr = cy.close.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return '<section class="card cc-card">' +
          '<div class="cc-visual cc-visual--' + (i % 2 ? "earth" : "sage") + '">' +
            "<small>" + esc(c.name) + '</small><span class="cc-num">\u2022\u2022\u2022\u2022 ' + esc(c.last4) + "</span>" +
            '<div class="cc-balance"><small>Balance</small><strong>' + M()(c.balance) + "</strong></div></div>" +
          '<div class="cc-info">' +
            '<div class="cc-row"><span>Utilization</span><strong class="is-' + cy.utilStatus + '">' + utilPct + "% of " + window.Logic.money0(c.limit) + "</strong></div>" +
            '<div class="bar"><i class="bar-fill bar-fill--' + cy.utilStatus + '" style="width:' + utilPct + '%"></i><i class="bar-mark" style="left:30%" title="30% — keep utilization under this line"></i></div>' +
            '<div class="cc-dates">' +
              '<span class="date-pill date-pill--' + cy.status + '">' + this.icon("bill") + "Due " + dueStr + " \u00b7 " + cy.note + "</span>" +
              '<span class="date-pill">' + this.icon("activity") + "Statement closes " + closeStr + "</span>" +
            "</div>" +
            '<p class="cc-posting">' + esc(cy.posting) + "</p>" +
            '<div class="cc-actions">' +
              '<button class="btn btn--primary" data-act="pay-card" data-ref="' + c.id + '">Make a payment</button>' +
              '<button class="btn btn--ghost" data-act="upload-statement" data-ref="' + c.id + '">' + this.icon("file") + "Upload statement</button>" +
              '<button class="mini-btn" data-act="edit-card" data-ref="' + c.id + '" title="Edit card">' + this.icon("pen") + "</button>" +
              '<button class="mini-btn" data-act="del-card" data-ref="' + c.id + '" title="Remove card">' + this.icon("trash") + "</button>" +
            "</div></div></section>";
      }).join("");

      const inbox = state.receipts.length ?
        '<section class="card"><h2>Receipt & statement inbox</h2><div class="receipt-grid">' +
        state.receipts.map(r => {
          const url = window.Upload.previewURL(r.id);
          const linked = r.cardId ? state.cards.find(c => c.id === r.cardId) : null;
          return '<div class="receipt">' +
            (url && r.kind === "image" ? '<img src="' + url + '" alt="">' : '<span class="receipt-ic">' + this.icon(r.kind === "pdf" ? "file" : "camera") + "</span>") +
            '<strong>' + esc(r.name) + "</strong>" +
            "<small>" + (linked ? esc(linked.name) + " \u00b7 " : "") + '<span class="tag tag--warn">Needs OCR \u00b7 backend</span></small>' +
            '<button class="mini-btn receipt-x" data-act="del-receipt" data-ref="' + r.id + '">' + this.icon("x") + "</button></div>";
        }).join("") + '</div><p class="hint">Parsing photos & PDF statements into transactions needs the OCR backend — see <code>docs/NEXT_STEPS.md</code>.</p></section>' : "";

      view.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">Credit</p><h1>Cards</h1></div>' +
        '<button class="btn btn--primary" data-act="add-card">' + this.icon("plus") + "Add card</button></header>" +
        (state.cards.length ? '<div class="cc-grid">' + cardsHTML + "</div>"
          : '<section class="card"><p class="empty">No cards yet. Add one to track utilization, due dates, and statements.</p></section>') +
        inbox;
    },

    // ---------------- goals ----------------
    renderGoals() {
      const state = window.Store.state;
      const view = $("#view-goals");
      const rows = state.goals.map(g => {
        const pct = g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0;
        const tone = pct >= 85 ? "good" : "sage";
        return '<div class="goal-row" data-id="' + g.id + '">' +
          '<div class="goal-head"><strong>' + esc(g.name) + "</strong><span>" + M()(g.saved) + " <em>of " + window.Logic.money0(g.target) + "</em></span></div>" +
          '<div class="bar bar--tall"><i class="bar-fill bar-fill--' + tone + '" style="width:' + pct + '%"></i></div>' +
          '<div class="goal-foot"><small>' + Math.round(pct) + "% \u00b7 " + window.Logic.money0(Math.max(0, g.target - g.saved)) + " to go</small>" +
            '<span><button class="mini-btn mini-btn--good" data-act="fund-goal" data-ref="' + g.id + '" title="Add money">' + this.icon("plus") + "</button>" +
            '<button class="mini-btn" data-act="edit-goal" data-ref="' + g.id + '" title="Edit">' + this.icon("pen") + "</button>" +
            '<button class="mini-btn" data-act="del-goal" data-ref="' + g.id + '" title="Delete">' + this.icon("trash") + "</button></span></div></div>";
      }).join("");
      view.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">Save</p><h1>Money goals</h1></div>' +
        '<button class="btn btn--primary" data-act="add-goal">' + this.icon("plus") + "New goal</button></header>" +
        '<section class="card">' + (rows || '<p class="empty">No goals yet. Name one — Emergency fund? Trip? — and give it a target.</p>') + "</section>";
    },

    // ---------------- settings ----------------
    renderSettings() {
      const state = window.Store.state;
      const view = $("#view-settings");
      const recRows = state.recurring.map(r =>
        '<div class="txn-row"><span class="txn-emoji">' + this.catEmoji(r.category) + "</span>" +
        '<span class="txn-body"><strong>' + esc(r.desc) + "</strong><small>" + esc(r.category) + " \u00b7 day " + r.day + " \u00b7 " + (r.autopay ? "autopay" : "manual") + (r.active ? "" : " \u00b7 paused") + "</small></span>" +
        '<span class="txn-amt ' + (r.type === "income" ? "txn-amt--in" : "") + '">' + (r.type === "income" ? "+" : "\u2212") + M()(r.amount) + "</span>" +
        '<span class="txn-actions"><button class="mini-btn" data-act="edit-rec" data-ref="' + r.id + '">' + this.icon("pen") + "</button>" +
        '<button class="mini-btn" data-act="del-rec" data-ref="' + r.id + '">' + this.icon("trash") + "</button></span></div>").join("");

      const catChips = (list, kind) => list.map(c =>
        '<span class="chip">' + esc(c) + '<button data-act="del-cat" data-kind="' + kind + '" data-ref="' + esc(c) + '" aria-label="Remove ' + esc(c) + '">' + this.icon("x") + "</button></span>").join("");

      view.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">You</p><h1>Settings</h1></div></header>' +
        '<section class="card"><h2>Profile & sign-in</h2>' +
          '<label class="field"><span>Your name</span><input id="set-name" value="' + esc(state.settings.name) + '" placeholder="Your name"></label>' +
          '<div class="auth-buttons auth-buttons--inline">' +
            '<button class="btn btn--auth" data-act="auth-google">' + googleLogo() + "Continue with Google</button>" +
            '<button class="btn btn--auth" data-act="auth-apple">' + appleLogo() + "Continue with Apple</button></div>" +
          '<p class="hint">Sign-in is a stub — wire credentials per <code>docs/NEXT_STEPS.md</code>.</p></section>' +
        '<section class="card"><h2>Recurring bills & income</h2><div class="rec-list">' +
          (recRows || '<p class="empty">Bills that repeat (rent, internet, subscriptions) auto-fill every future month once added here.</p>') +
          '</div><button class="btn btn--ghost" data-act="add-rec">' + this.icon("plus") + "Add recurring</button></section>" +
        '<section class="card"><h2>Categories</h2>' +
          '<h3>Spending</h3><div class="chips">' + catChips(state.categories.expense, "expense") + "</div>" +
          '<h3>Income</h3><div class="chips">' + catChips(state.categories.income, "income") + "</div>" +
          '<div class="cat-add"><input id="cat-new" placeholder="New category name"><select id="cat-kind"><option value="expense">Spending</option><option value="income">Income</option></select>' +
          '<button class="btn btn--ghost" data-act="add-cat">Add</button></div></section>' +
        '<section class="card"><h2>Behavior</h2>' +
          '<label class="field"><span>"Large purchase" threshold — triggers the red flag & heavy animation</span>' +
          '<input id="set-heavy" inputmode="decimal" value="' + state.settings.heavyThreshold + '"></label>' +
          '<p class="hint">Storage: <strong>' + window.Store.storageMode + "</strong> \u00b7 data stays on this device.</p></section>" +
        '<section class="card card--danger"><h2>Demo data</h2>' +
          '<p class="hint">' + (state.settings.demoLoaded ? "Demo data is loaded so every state is visible." : "Load demo data to preview red/green states, charts, and animations.") + "</p>" +
          '<div class="head-actions">' +
          (state.settings.demoLoaded
            ? '<button class="btn btn--danger" data-act="clear-demo">Clear demo & start fresh</button>'
            : '<button class="btn btn--primary" data-act="load-demo">Load demo data</button>') +
          '<button class="btn btn--ghost" data-act="reset-all">Erase everything</button></div></section>';

      $("#set-name").addEventListener("change", e => { state.settings.name = e.target.value.trim(); window.Store.save(); });
      $("#set-heavy").addEventListener("change", e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v > 0) { state.settings.heavyThreshold = v; window.Store.save(); this.toast("Large-purchase threshold set to " + M()(v)); }
      });
    },

    // ---------------- modal helpers ----------------
    openModal(title, bodyHTML, onMount) {
      const modal = $("#modal");
      $("#modal-title").textContent = title;
      $("#modal-body").innerHTML = bodyHTML;
      modal.hidden = false;
      document.body.classList.add("no-scroll");
      requestAnimationFrame(() => modal.classList.add("is-open"));
      if (onMount) onMount($("#modal-body"));
      const first = $("#modal-body input, #modal-body select, #modal-body button");
      if (first) first.focus();
    },
    closeModal() {
      const modal = $("#modal");
      modal.classList.remove("is-open");
      document.body.classList.remove("no-scroll");
      setTimeout(() => { modal.hidden = true; $("#modal-body").innerHTML = ""; }, 200);
    },
    openSheet() {
      const sheet = $("#sheet");
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("is-open"));
    },
    closeSheet() {
      const sheet = $("#sheet");
      sheet.classList.remove("is-open");
      setTimeout(() => { sheet.hidden = true; }, 200);
    }
  };

  function monthBar(mk, scope) {
    const h = window.Store.helpers;
    return '<div class="month-bar"><button class="mini-btn" data-act="month-prev" data-scope="' + scope + '" aria-label="Previous month">' + UI.icon("chevL") + "</button>" +
      '<strong>' + h.monthLabel(mk) + "</strong>" +
      '<button class="mini-btn" data-act="month-next" data-scope="' + scope + '" aria-label="Next month">' + UI.icon("chevR") + "</button></div>";
  }

  function googleLogo() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3a7.18 7.18 0 0 1-10.8-3.78H1.27v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.26 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.27a12 12 0 0 0 0 10.8l3.99-3.1z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.97 11.97 0 0 0 1.27 6.6l3.99 3.1A7.18 7.18 0 0 1 12 4.75z"/></svg>';
  }
  function appleLogo() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.7 12.9c0-2.4 2-3.6 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.9-3.6.9-.7 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.4 1.2-.1 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.7 1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.6-3.9zM14.4 5.2c.7-.8 1.1-1.9 1-3.2-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.5 2.9-1.3z"/></svg>';
  }

  UI.monthBar = monthBar;
  UI.googleLogo = googleLogo;
  UI.appleLogo = appleLogo;
  UI.$ = $; UI.$$ = $$; UI.esc = esc;
  window.UI = UI;
})();
