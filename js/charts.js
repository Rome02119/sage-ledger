/* Sage Ledger — charts.js
   Lightweight canvas charts (no chart library): doughnut + grouped bars.
   Guarded so the app still works where canvas 2D is unavailable. */
(function () {
  "use strict";

  const PALETTE = ["#6B7C5E", "#9CAF88", "#C9A87C", "#B8835A", "#4C5A43",
    "#D6C7A9", "#8A9B7A", "#A67B5B", "#79806F", "#E0D5BE"];
  const TONES = { good: "#2E7D4F", warn: "#C28A3F", bad: "#C24A3F", neutral: "#9CAF88" };

  function ctx2d(canvas) {
    if (!canvas || !canvas.getContext) return null;
    try { return canvas.getContext("2d"); } catch (e) { return null; }
  }

  function scaleForDPR(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, rect.width), h = Math.max(10, rect.height);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  // entries: [{label, value, tone?}] — tone wins over palette when provided
  function doughnut(canvas, entries, centerLabel, centerValue) {
    const ctx = ctx2d(canvas); if (!ctx) return;
    const { w, h } = scaleForDPR(canvas, ctx);
    ctx.clearRect(0, 0, w, h);
    const total = entries.reduce((a, e) => a + e.value, 0);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 6, r = R * 0.66;
    if (!total) {
      ctx.beginPath(); ctx.arc(cx, cy, (R + r) / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#E7E9E2"; ctx.lineWidth = R - r; ctx.stroke();
    } else {
      let a0 = -Math.PI / 2;
      entries.forEach((e, i) => {
        const a1 = a0 + (e.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, (R + r) / 2, a0 + 0.012, a1 - 0.012);
        ctx.strokeStyle = e.tone ? TONES[e.tone] : PALETTE[i % PALETTE.length];
        ctx.lineWidth = R - r;
        ctx.lineCap = "butt";
        ctx.stroke();
        a0 = a1;
      });
    }
    ctx.fillStyle = "#1F231D";
    ctx.textAlign = "center";
    ctx.font = "600 20px Fraunces, Georgia, serif";
    ctx.fillText(centerValue || "", cx, cy + 2);
    ctx.fillStyle = "#79806F";
    ctx.font = "500 11px 'Public Sans', system-ui, sans-serif";
    ctx.fillText(centerLabel || "", cx, cy + 20);
  }

  // series: [{label, income, expense}]
  function bars(canvas, series) {
    const ctx = ctx2d(canvas); if (!ctx) return;
    const { w, h } = scaleForDPR(canvas, ctx);
    ctx.clearRect(0, 0, w, h);
    const padL = 8, padB = 22, padT = 10;
    const max = Math.max(1, ...series.map(s => Math.max(s.income, s.expense)));
    const innerW = w - padL * 2, innerH = h - padB - padT;
    const group = innerW / series.length;
    const barW = Math.min(26, group * 0.28);
    series.forEach((s, i) => {
      const gx = padL + group * i + group / 2;
      const ih = (s.income / max) * innerH, eh = (s.expense / max) * innerH;
      roundBar(ctx, gx - barW - 3, padT + innerH - ih, barW, ih, "#6B7C5E");
      roundBar(ctx, gx + 3, padT + innerH - eh, barW, eh, "#C9A87C");
      ctx.fillStyle = "#79806F";
      ctx.font = "500 11px 'Public Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.label, gx, h - 6);
    });
  }
  function roundBar(ctx, x, y, w, h, color) {
    if (h < 1) h = 1;
    const r = Math.min(5, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  window.Charts = { doughnut, bars, PALETTE, TONES };
})();
