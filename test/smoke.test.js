/* Sage Ledger — smoke.test.js
   DOM-level smoke test via jsdom. Runs the app WITHOUT GSAP/three.js
   (CDN absent) to prove graceful degradation, then exercises core flows.
   Run: node test/smoke.test.js */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("  \u2713 " + label); }
  else { failed++; console.error("  \u2717 FAIL: " + label); }
}
function section(name) { console.log("\n" + name); }

const dom = new JSDOM(html, {
  url: "http://localhost/",
  pretendToBeVisual: true,
  runScripts: "outside-only"
});
const { window } = dom;

// --- polyfills jsdom lacks ---
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function () {};

// --- load local scripts in order (skips CDN on purpose) ---
["store.js", "logic.js", "charts.js", "animations.js", "upload.js", "ui.js", "app.js"].forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  window.eval(src);
});

const { Store, Logic, App, UI } = window;
// jsdom fires DOMContentLoaded asynchronously; boot explicitly for a synchronous test
if (!Store.state) App.boot();
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => Array.from(window.document.querySelectorAll(s));

section("Boot & demo data");
ok(!!Store && !!Logic && !!App && !!UI, "all modules attached to window");
ok(typeof window.gsap === "undefined" && typeof window.THREE === "undefined", "running WITHOUT gsap/three (degradation path)");
ok(Store.state.settings.demoLoaded === true, "demo data auto-loaded on first run");
ok(Store.state.transactions.length > 20, "demo transactions present (" + Store.state.transactions.length + ")");
ok(Store.state.cards.length === 2, "two demo cards");
ok(Store.state.recurring.length === 8, "eight recurring templates");
ok($("#auth-screen").hidden === false, "auth overlay shown on first run");

section("Auth stubs");
$('[data-act="auth-google"]').click();
ok($$("#toast-stack .toast").length >= 1, "Google button shows stub toast, doesn't navigate");
$('[data-act="auth-skip"]').click();
ok($("#auth-screen").hidden === true || Store.state.settings.authDismissed === true, "continue-without-account dismisses auth");

section("Recurring engine");
const today = Store.helpers.todayISO();
const mk = Store.helpers.currentMonthKey();
const recurringTxns = Store.state.transactions.filter(t => t.recurringId);
ok(recurringTxns.length >= 8, "recurring instances materialized (" + recurringTxns.length + ")");
const dupCheck = new Set(recurringTxns.map(t => t.id));
ok(dupCheck.size === recurringTxns.length, "no duplicate recurring instances");
const before = Store.state.transactions.length;
Logic.materializeRecurring(Store.state);
ok(Store.state.transactions.length === before, "re-materializing is idempotent");
const late = Logic.lateBills(Store.state);
ok(late.length >= 1, "at least one late bill engineered (" + (late[0] ? late[0].desc : "none") + ")");
const nextMk = Store.helpers.shiftMonth(mk, 1);
const projected = Logic.projectedFor(Store.state, nextMk);
ok(projected.length >= 8, "future month auto-populates with scheduled entries (" + projected.length + ")");
ok(projected.every(t => t.projected === true), "projected entries flagged, not persisted");

section("Health & red/green flags");
const health = Logic.computeHealth(Store.state);
ok(health.score >= 5 && health.score <= 100, "health score in range: " + health.score);
const bad = health.alerts.filter(a => a.level === "bad");
const good = health.alerts.filter(a => a.level === "good");
ok(bad.some(a => /late/i.test(a.title)), "RED: late bill alert present");
ok(bad.some(a => /over budget/i.test(a.title)), "RED: over-budget alert present (Groceries engineered over)");
ok(bad.some(a => /utilization/i.test(a.title)), "RED: high card utilization alert present");
ok(bad.some(a => /Large purchase/i.test(a.title)), "RED: heavy purchase flagged");
ok(good.length >= 1, "GREEN: positive alerts present (" + good.length + ")");
const ribbon = Logic.ribbonSegments(Store.state);
ok(ribbon.length > 3 && Math.abs(ribbon.reduce((a, s) => a + s.share, 0) - 1) < 0.001, "ribbon segments sum to 100%");
ok(ribbon.some(s => s.tone === "bad"), "ribbon shows a red leak segment");

section("Card cycle math");
const cardB = Store.state.cards[1];
const cy = Logic.cardCycle(cardB);
ok(cy.dueIn >= 0 && cy.dueIn <= 31, "days-until-due computed: " + cy.dueIn);
ok(cy.dueIn <= 5 && cy.status === "bad", "card due in \u22645 days is RED highlighted");
ok(cy.util > 0.5 && cy.utilStatus === "bad", "utilization " + Math.round(cy.util * 100) + "% flagged RED");
ok(/1\u20133 business days/.test(cy.posting), "posting-time guidance present");
const cardA = Store.state.cards[0];
const cyA = Logic.cardCycle(cardA);
ok(cyA.utilStatus === "good", "healthy card utilization is GREEN (" + Math.round(cyA.util * 100) + "%)");

section("Views render");
["home", "activity", "budget", "cards", "goals", "settings"].forEach(v => {
  App.go(v);
  const el = $("#view-" + v);
  ok(!el.hidden && el.innerHTML.length > 200, "view '" + v + "' renders");
});
App.go("home");
ok($("#view-home").querySelector(".ribbon"), "dashboard ribbon rendered");
ok($$("#view-home .alert-row").length >= 4, "dashboard alerts rendered");
ok($$(".nav-badge").some(b => !b.hidden && +b.textContent > 0), "red alert badge on nav");

section("Transactions: add income / heavy expense (no gsap, must not throw)");
const txnCountBefore = Store.state.transactions.length;
App.addTransaction({ date: today, desc: "Freelance invoice", category: "Side Hustle", amount: 500, type: "income" });
ok(Store.state.transactions.length === txnCountBefore + 1, "income added (money-rain path didn't crash)");
App.addTransaction({ date: today, desc: "New laptop", category: "Entertainment", amount: 999, type: "expense", cardId: cardA.id });
ok(Store.state.transactions.length === txnCountBefore + 2, "heavy expense added (deduction path didn't crash)");
ok(Math.abs(cardA.balance - (982.16 + 999)) < 0.01, "card balance updated by card expense: " + cardA.balance);
const h2 = Logic.computeHealth(Store.state);
ok(h2.alerts.filter(a => a.level === "bad").some(a => /New laptop/.test(a.title)), "new heavy purchase immediately flagged RED");

section("Pay a late bill");
const lateBill = Logic.lateBills(Store.state)[0];
App.payBill(lateBill.id);
ok(Logic.lateBills(Store.state).every(b => b.id !== lateBill.id), "late bill cleared after marking paid");

section("Card payment");
const balBefore = cardB.balance;
App.payCard(cardB.id, 500);
ok(Math.abs(cardB.balance - (balBefore - 500)) < 0.01 && cardB.paidThisCycle === true, "payment reduces balance & marks cycle paid");
ok(Store.state.transactions.some(t => t.desc === cardB.name + " payment" && t.category === "Debt Payments"), "payment logged as Debt Payments transaction");

section("CSV pipeline");
const csv = 'Date,Description,Amount\n' +
  '06/02/2026,"STAR MARKET, BOSTON",-54.20\n' +
  '06/03/2026,PAYROLL ACME,+1200.00\n' +
  '2026-06-04,Uber Trip,-18.75\n' +
  'garbage,not-a-row,xx\n';
const rows = Logic.parseCSV(csv);
ok(rows.length === 5, "CSV parsed incl. quoted comma field (" + rows.length + " rows)");
const analyzed = Logic.analyzeCSV(rows);
ok(analyzed.hasHeader && analyzed.mapping.date === 0 && analyzed.mapping.amount === 2 && analyzed.mapping.desc === 1, "columns auto-detected (date/desc/amount)");
const res = Logic.importRows(Store.state, analyzed, analyzed.mapping, { negativeIsExpense: true, cardId: null });
ok(res.imported === 3 && res.skipped === 1, "3 rows imported, 1 garbage row skipped");
const imp = Store.state.transactions.filter(t => t.imported);
ok(imp.some(t => t.type === "income" && t.amount === 1200) && imp.some(t => t.type === "expense" && t.amount === 54.2), "signs mapped to income/expense correctly");
ok(imp.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date)), "imported dates normalized to ISO");

section("Uploads (receipt inbox)");
const fakeImg = { name: "receipt.jpg", type: "image/jpeg", size: 1000 };
const fakePdf = { name: "statement.pdf", type: "application/pdf", size: 5000 };
const intake = window.Upload.intake([fakeImg, fakePdf], { cardId: cardB.id });
ok(intake.receipts.length === 2 && Store.state.receipts.length === 2, "image + PDF queued in receipt inbox");
ok(Store.state.receipts.every(r => r.status === "needs-ocr"), "receipts marked needs-ocr (backend stub)");
App.go("cards");
ok(/Needs OCR/.test($("#view-cards").innerHTML), "inbox renders OCR-needed tag");

section("Month navigation & projected entries in UI");
App.go("activity");
App.shiftMonth("activity", 1);
ok(/Scheduled/.test($("#view-activity").innerHTML), "next month shows auto-populated scheduled bills");
App.shiftMonth("activity", -1);

section("Budget editing");
App.go("budget");
const inp = $('#view-budget .budget-input[data-cat="Transportation"]');
inp.value = "300";
inp.dispatchEvent(new window.Event("change", { bubbles: true }));
ok(Store.state.budgets["Transportation"] === 300, "typing a budget saves it");

section("Goals");
const goal = Store.state.goals[0];
const savedBefore = goal.saved;
App.fundGoal(goal.id);
$("#fund-amt").value = "250";
$("#fund-save").click();
ok(goal.saved === savedBefore + 250, "funding a goal updates progress (rain path didn't crash)");

section("Persistence & demo clear");
Store.save();
const raw = window.localStorage.getItem("sage-ledger-v1");
ok(raw && JSON.parse(raw).transactions.length === Store.state.transactions.length, "state persists to localStorage");
App.handleAction("clear-demo");
ok(Store.state.transactions.length === 0 && Store.state.settings.demoLoaded === false, "one-tap demo clear empties ledger");
App.go("home");
ok(/Add spending/.test($("#view-home").innerHTML) || $$("#view-home .ribbon-empty").length === 1, "empty state renders after clear");

console.log("\n========================================");
console.log(failed === 0 ? "ALL " + passed + " CHECKS PASSED" : passed + " passed, " + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);
