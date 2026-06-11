# CLAUDE.md
## DOX rail (read first — binding)
This project runs on DOX. Root [AGENTS.md](AGENTS.md) is binding. Before editing:
read the rail, walk root→target reading every AGENTS.md, edit, then run the DOX pass.
Non-negotiables live in [AGENTS.md](AGENTS.md); no doc below may weaken them.

---

## Quick reference

**Run locally:**
```bash
python3 -m http.server 8080 --directory /Users/rome/sage-ledger
# phone: http://192.168.1.222:8080
```

**Run smoke tests:**
```bash
cd ~/sage-ledger && npm i && npm test
```

**Key gotcha — CSS `[hidden]` override:**
Any element with an ID that sets `display` must have a matching `#id[hidden] { display: none; }`
rule or `el.hidden = true` will have no visual effect (ID specificity beats `[hidden]`).
