/* Sage Ledger — upload.js
   File intake: camera photos, receipt images, PDF statements, CSV imports.
   Images/PDFs land in the receipt inbox awaiting backend OCR (stubbed).
   CSVs parse fully client-side with a mapping preview. */
(function () {
  "use strict";

  const session = { previews: {} }; // objectURLs live only for this session

  function intake(files, opts) {
    const state = window.Store.state;
    const results = { receipts: [], csv: null };
    Array.from(files || []).forEach(file => {
      const kind = file.type.startsWith("image/") ? "image"
        : file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf"
        : /\.csv$/i.test(file.name) || file.type.includes("csv") || file.type === "text/plain" ? "csv"
        : "other";
      if (kind === "csv") { results.csv = file; return; }
      if (kind === "other") { results.unsupported = true; return; }
      const rec = {
        id: window.Store.uid("rcpt"),
        name: file.name || (kind === "image" ? "photo.jpg" : "statement.pdf"),
        kind, size: file.size || 0,
        status: "needs-ocr",
        cardId: (opts && opts.cardId) || null,
        added: window.Store.helpers.todayISO()
      };
      try { session.previews[rec.id] = URL.createObjectURL(file); } catch (e) { /* jsdom/no blob */ }
      state.receipts.unshift(rec);
      results.receipts.push(rec);
    });
    window.Store.save();
    return results;
  }

  function previewURL(id) { return session.previews[id] || null; }

  function removeReceipt(id) {
    const state = window.Store.state;
    state.receipts = state.receipts.filter(r => r.id !== id);
    if (session.previews[id]) { try { URL.revokeObjectURL(session.previews[id]); } catch (e) {} delete session.previews[id]; }
    window.Store.save();
  }

  function readCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rows = window.Logic.parseCSV(String(reader.result || ""));
          const analyzed = window.Logic.analyzeCSV(rows);
          if (!analyzed || !analyzed.data.length) reject(new Error("No rows found in that file."));
          else resolve(analyzed);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsText(file);
    });
  }

  window.Upload = { intake, previewURL, removeReceipt, readCSV };
})();
