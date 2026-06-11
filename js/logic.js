/* Sage Ledger — logic.js
   Pure-ish domain logic: recurring bill engine, financial health flags,
   credit-card cycle math, CSV parsing. No DOM here. */
(function () {
  "use strict";

  const H = () => window.Store.helpers;

  // ---------------- money ----------------
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const fmt0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  function money(n) { return fmt.format(n || 0); }
  function money0(n) { return fmt0.format(n || 0); }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------------- recurring engine ----------------
  // Persists one instance per template per month, from startMonth up to the current month.
  // Future months are projected virtually via projectedFor().
  function materializeRecurring(state) {
    const h = H();
    const nowMk = h.currentMonthKey();
    const today = h.todayISO();
    let created = 0;
    state.recurring.forEach(tpl => {
      if (!tpl.active) return;
      let mk = tpl.startMonth || nowMk;
      while (mk <= nowMk) {
        const date = h.dateInMonth(mk, tpl.day);
        if (date <= today) {
          const id = "r-" + tpl.id + "-" + mk;
          if (!state.transactions.some(t => t.id === id)) {
            state.transactions.push({
              id, date, desc: tpl.desc, category: tpl.category,
              amount: tpl.amount, type: tpl.type, cardId: tpl.cardId || null,
              recurringId: tpl.id,
              paid: tpl.type === "expense" ? !!tpl.autopay : true
            });
            created++;
          }
        }
        mk = h.shiftMonth(mk, 1);
      }
    });
    if (created) state.transactions.sort((a, b) => a.date < b.date ? 1 : -1);
    return created;
  }

  // Virtual upcoming/scheduled entries for a month (not persisted).
  function projectedFor(state, mk) {
    const h = H();
    const today = h.todayISO();
    const out = [];
    state.recurring.forEach(tpl => {
      if (!tpl.active) return;
      if (tpl.startMonth && mk < tpl.startMonth) return;
      const date = h.dateInMonth(mk, tpl.day);
      if (date > today) {
        out.push({
          id: "proj-" + tpl.id + "-" + mk, date, desc: tpl.desc, category: tpl.category,
          amount: tpl.amount, type: tpl.type, cardId: tpl.cardId || null,
          recurringId: tpl.id, projected: true
        });
      }
    });
    return out;
  }

  function txnsForMonth(state, mk, includeProjected) {
    const real = state.transactions.filter(t => t.date.slice(0, 7) === mk);
    if (!includeProjected) return real.slice().sort((a, b) => a.date < b.date ? 1 : -1);
    return real.concat(projectedFor(state, mk)).sort((a, b) => a.date < b.date ? 1 : -1);
  }

  function sumBy(txns, type) {
    return round2(txns.filter(t => t.type === type && !t.projected).reduce((a, t) => a + t.amount, 0));
  }

  function spentByCategory(state, mk) {
    const out = {};
    txnsForMonth(state, mk).forEach(t => {
      if (t.type !== "expense") return;
      out[t.category] = round2((out[t.category] || 0) + t.amount);
    });
    return out;
  }

  function monthlySeries(state, monthsBack) {
    const h = H();
    const series = [];
    let mk = h.currentMonthKey();
    for (let i = 0; i < monthsBack; i++) {
      const txns = txnsForMonth(state, mk);
      series.unshift({
        mk, label: h.monthLabel(mk).split(" ")[0].slice(0, 3),
        income: sumBy(txns, "income"), expense: sumBy(txns, "expense")
      });
      mk = h.shiftMonth(mk, -1);
    }
    return series;
  }

  // ---------------- credit card cycle math ----------------
  function clampDay(y, m, day) { // m is 1-12
    return Math.min(day, new Date(y, m, 0).getDate());
  }
  function nextOccurrence(day) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    let d = clampDay(y, m, day);
    const todayD = now.getDate();
    if (d < todayD) { m += 1; if (m > 12) { m = 1; y += 1; } d = clampDay(y, m, day); }
    return new Date(y, m - 1, d);
  }
  function daysUntil(date) {
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(date); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }
  function cardCycle(card) {
    const due = nextOccurrence(card.dueDay);
    const close = nextOccurrence(card.closeDay);
    const dueIn = daysUntil(due);
    const closeIn = daysUntil(close);
    const util = card.limit > 0 ? card.balance / card.limit : 0;
    let status = "good", note = "Paid for this cycle";
    if (card.balance <= 0) { status = "good"; note = "Zero balance"; }
    else if (card.paidThisCycle) { status = "good"; note = "Payment made this cycle"; }
    else if (dueIn <= 5) { status = "bad"; note = "Payment due in " + dueIn + " day" + (dueIn === 1 ? "" : "s"); }
    else if (dueIn <= 10) { status = "warn"; note = "Payment due in " + dueIn + " days"; }
    else { status = "neutral"; note = "Due in " + dueIn + " days"; }
    let utilStatus = util < 0.3 ? "good" : util < 0.5 ? "warn" : "bad";
    return {
      due, close, dueIn, closeIn, util, status, note, utilStatus,
      posting: "Payments typically post in 1\u20133 business days. Paying before the " +
        ordinal(card.closeDay) + " (statement close) lowers the balance reported to credit bureaus; " +
        "the due date follows the close by a 21\u201325 day grace period on most cards."
    };
  }
  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // ---------------- health: alerts + score + ribbon ----------------
  function lateBills(state) {
    const today = H().todayISO();
    return state.transactions.filter(t =>
      t.type === "expense" && t.recurringId && t.paid === false && t.date < today);
  }

  function computeHealth(state) {
    const h = H();
    const mk = h.currentMonthKey();
    const txns = txnsForMonth(state, mk);
    const income = sumBy(txns, "income");
    const expense = sumBy(txns, "expense");
    const net = round2(income - expense);
    const spent = spentByCategory(state, mk);
    const alerts = [];
    let score = 100;

    // Late bills (red)
    lateBills(state).forEach(b => {
      const daysLate = Math.max(1, daysUntil(new Date(b.date)) * -1);
      alerts.push({ level: "bad", icon: "bill", title: b.desc + " is " + daysLate + " day" + (daysLate === 1 ? "" : "s") + " late", sub: money(b.amount) + " \u00b7 due " + b.date, action: "pay-bill", refId: b.id });
      score -= 12;
    });

    // Budgets (red over / amber close / green pace)
    let overCount = 0, okCount = 0;
    Object.keys(state.budgets).forEach(cat => {
      const b = state.budgets[cat]; if (!b) return;
      const sp = spent[cat] || 0;
      if (sp > b) {
        overCount++;
        alerts.push({ level: "bad", icon: "budget", title: cat + " is over budget", sub: money(sp) + " spent of " + money0(b), action: "view-budget" });
        score -= 10;
      } else if (sp > b * 0.85) {
        alerts.push({ level: "warn", icon: "budget", title: cat + " is at " + Math.round(sp / b * 100) + "% of budget", sub: money0(b - sp) + " left this month", action: "view-budget" });
        score -= 3;
      } else okCount++;
    });
    if (overCount === 0 && okCount > 0) {
      alerts.push({ level: "good", icon: "budget", title: "All categories on pace", sub: okCount + " budgets tracking under plan" });
    }

    // Heavy purchases this month (red)
    const heavy = txns.filter(t => t.type === "expense" && !t.recurringId && t.amount >= state.settings.heavyThreshold);
    heavy.forEach(t => {
      alerts.push({ level: "bad", icon: "heavy", title: "Large purchase: " + t.desc, sub: money(t.amount) + " on " + t.date, action: "view-activity" });
      score -= 5;
    });

    // Cards
    state.cards.forEach(c => {
      const cy = cardCycle(c);
      if (cy.utilStatus === "bad") { alerts.push({ level: "bad", icon: "card", title: c.name + " utilization is " + Math.round(cy.util * 100) + "%", sub: "Above 30% can lower your credit score", action: "view-cards" }); score -= 8; }
      else if (cy.utilStatus === "warn") { alerts.push({ level: "warn", icon: "card", title: c.name + " utilization is " + Math.round(cy.util * 100) + "%", sub: "Aim for under 30%", action: "view-cards" }); score -= 4; }
      if (cy.status === "bad" && !c.paidThisCycle && c.balance > 0) { alerts.push({ level: "bad", icon: "card", title: c.name + " " + cy.note.toLowerCase(), sub: money(c.balance) + " balance \u00b7 due " + cy.due.toLocaleDateString("en-US", { month: "short", day: "numeric" }), action: "view-cards" }); score -= 6; }
      else if (cy.status === "warn") { alerts.push({ level: "warn", icon: "card", title: c.name + " " + cy.note.toLowerCase(), sub: "Pay before the " + ordinal(c.closeDay) + " to report a lower balance", action: "view-cards" }); }
      if (cy.utilStatus === "good" && (c.paidThisCycle || c.balance === 0)) { alerts.push({ level: "good", icon: "card", title: c.name + " is in great shape", sub: Math.round(cy.util * 100) + "% utilization \u00b7 " + cy.note.toLowerCase() }); }
    });

    // Net
    if (net < 0) { alerts.push({ level: "bad", icon: "net", title: "Spending exceeds income this month", sub: money(net) + " net so far", action: "view-budget" }); score -= 10; }
    else if (income > 0) { alerts.push({ level: "good", icon: "net", title: "Positive cash flow", sub: "+" + money(net) + " net this month" }); }

    // Goals milestones
    state.goals.forEach(g => {
      const p = g.target > 0 ? g.saved / g.target : 0;
      if (p >= 0.85 && p < 1) alerts.push({ level: "good", icon: "goal", title: g.name + " is " + Math.round(p * 100) + "% funded", sub: money0(g.target - g.saved) + " to go" });
      if (p >= 1) alerts.push({ level: "good", icon: "goal", title: g.name + " fully funded \uD83C\uDF89", sub: money0(g.saved) + " saved" });
    });

    score = Math.max(5, Math.min(100, score));
    const tone = score >= 75 ? "good" : score >= 50 ? "warn" : "bad";
    const label = score >= 75 ? "Healthy" : score >= 50 ? "Needs attention" : "At risk";
    const order = { bad: 0, warn: 1, good: 2 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);
    return { score, tone, label, alerts, income, expense, net, spent, mk };
  }

  // Ribbon: one segment per spending category this month, sized by share, colored by budget status.
  function ribbonSegments(state) {
    const mk = H().currentMonthKey();
    const spent = spentByCategory(state, mk);
    const total = Object.values(spent).reduce((a, b) => a + b, 0);
    if (!total) return [];
    return Object.keys(spent).map(cat => {
      const b = state.budgets[cat];
      const tone = !b ? "neutral" : spent[cat] > b ? "bad" : spent[cat] > b * 0.85 ? "warn" : "good";
      return { cat, share: spent[cat] / total, amount: spent[cat], tone };
    }).sort((a, b) => b.share - a.share);
  }

  // ---------------- CSV ----------------
  function detectDelimiter(text) {
    const head = text.split(/\r?\n/).slice(0, 3).join("\n");
    const counts = [",", ";", "\t"].map(d => ({ d, n: (head.match(new RegExp("\\" + d, "g")) || []).length }));
    counts.sort((a, b) => b.n - a.n);
    return counts[0].n > 0 ? counts[0].d : ",";
  }
  function parseCSV(text) {
    const delim = detectDelimiter(text);
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(c => c.trim() !== "")) rows.push(row);
        row = [];
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); if (row.some(c => c.trim() !== "")) rows.push(row); }
    return rows;
  }
  function parseAmount(v) {
    if (v == null) return NaN;
    let t = String(v).trim();
    if (!t) return NaN;
    let neg = /^\(.*\)$/.test(t) || /-/.test(t);
    t = t.replace(/[()$,\s]/g, "").replace(/-/g, "");
    const n = parseFloat(t);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }
  function parseDate(v) {
    if (!v) return null;
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + "-" + H().pad(+m[2]) + "-" + H().pad(+m[3]);
    m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      return y + "-" + H().pad(+m[1]) + "-" + H().pad(+m[2]);
    }
    const d = new Date(t);
    return isNaN(d) ? null : H().iso(d);
  }
  // Guess which columns hold date / amount / description / category
  function analyzeCSV(rows) {
    if (!rows.length) return null;
    const hasHeader = rows[0].every(c => isNaN(parseAmount(c)) || /[a-z]/i.test(c)) &&
      rows.length > 1;
    const header = hasHeader ? rows[0].map(c => c.trim()) : rows[0].map((_, i) => "Column " + (i + 1));
    const data = hasHeader ? rows.slice(1) : rows;
    const nCols = header.length;
    const sample = data.slice(0, 25);
    const scores = [];
    for (let c = 0; c < nCols; c++) {
      let dateHits = 0, amtHits = 0, textLen = 0;
      sample.forEach(r => {
        if (parseDate(r[c])) dateHits++;
        if (!isNaN(parseAmount(r[c])) && !parseDate(r[c])) amtHits++;
        textLen += (r[c] || "").length;
      });
      scores.push({ c, dateHits, amtHits, textLen, name: header[c].toLowerCase() });
    }
    const byName = (re) => scores.find(s => re.test(s.name));
    let dateCol = (byName(/date|posted/) || scores.slice().sort((a, b) => b.dateHits - a.dateHits)[0]).c;
    let amtCol = byName(/amount|amt|debit|charge/);
    amtCol = amtCol ? amtCol.c
      : scores.filter(s => s.c !== dateCol).sort((a, b) => b.amtHits - a.amtHits)[0].c;
    let descCand = byName(/desc|merchant|payee|name|memo/);
    let descCol = descCand ? descCand.c
      : scores.filter(s => s.c !== dateCol && s.c !== amtCol).sort((a, b) => b.textLen - a.textLen)[0];
    descCol = typeof descCol === "object" ? descCol.c : descCol;
    const catCand = byName(/categor/);
    return {
      header, data, hasHeader,
      mapping: { date: dateCol, amount: amtCol, desc: descCol, category: catCand ? catCand.c : -1 }
    };
  }
  // Build transactions from analyzed CSV + a column mapping
  function importRows(state, analyzed, mapping, opts) {
    const made = [];
    const skip = [];
    analyzed.data.forEach(r => {
      const date = parseDate(r[mapping.date]);
      const rawAmt = parseAmount(r[mapping.amount]);
      if (!date || isNaN(rawAmt) || rawAmt === 0) { skip.push(r); return; }
      let type, amount;
      if (opts.negativeIsExpense) { type = rawAmt < 0 ? "expense" : "income"; amount = Math.abs(rawAmt); }
      else { type = "expense"; amount = Math.abs(rawAmt); }
      const desc = (r[mapping.desc] || "Imported transaction").trim().slice(0, 80);
      let category = mapping.category >= 0 ? (r[mapping.category] || "").trim() : "";
      if (!category) category = type === "income" ? "Other Income" : "Miscellaneous";
      const all = state.categories.income.concat(state.categories.expense);
      if (!all.includes(category)) {
        (type === "income" ? state.categories.income : state.categories.expense).push(category);
      }
      made.push({
        id: window.Store.uid("txn"), date, desc, category, amount: round2(amount), type,
        cardId: opts.cardId || null, recurringId: null, imported: true
      });
    });
    state.transactions = state.transactions.concat(made)
      .sort((a, b) => a.date < b.date ? 1 : -1);
    if (opts.cardId) {
      const card = state.cards.find(c => c.id === opts.cardId);
      if (card) {
        const delta = made.reduce((a, t) => a + (t.type === "expense" ? t.amount : -t.amount), 0);
        card.balance = round2(Math.max(0, card.balance + delta));
      }
    }
    return { imported: made.length, skipped: skip.length, txns: made };
  }

  window.Logic = {
    money, money0, round2, ordinal,
    materializeRecurring, projectedFor, txnsForMonth, sumBy,
    spentByCategory, monthlySeries,
    cardCycle, daysUntil, nextOccurrence,
    lateBills, computeHealth, ribbonSegments,
    parseCSV, analyzeCSV, importRows, parseAmount, parseDate
  };
})();
