/* Sage Ledger — animations.js
   GSAP-powered moments with graceful degradation: the app must work
   if the CDN is unreachable or prefers-reduced-motion is set. */
(function () {
  "use strict";

  const hasGSAP = () => typeof window.gsap !== "undefined";
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fxLayer() { return document.getElementById("fx-layer"); }

  // ---------- money rain (income added) ----------
  function moneyRain(amount) {
    const layer = fxLayer(); if (!layer) return;
    if (reduced()) return floatLabel("+" + window.Logic.money(amount), "good");
    const n = Math.min(30, 10 + Math.floor((amount || 0) / 60));
    const vw = window.innerWidth, vh = window.innerHeight;
    for (let i = 0; i < n; i++) {
      const bill = document.createElement("div");
      bill.className = "fx-bill";
      bill.textContent = "$";
      const x = Math.random() * vw;
      bill.style.left = x + "px";
      bill.style.top = "-60px";
      layer.appendChild(bill);
      if (hasGSAP()) {
        const drift = (Math.random() - 0.5) * 160;
        window.gsap.to(bill, {
          y: vh + 120, x: "+=" + drift,
          rotation: (Math.random() - 0.5) * 540,
          duration: 1.6 + Math.random() * 1.4,
          delay: Math.random() * 0.5,
          ease: "power1.in",
          onComplete: () => bill.remove()
        });
        window.gsap.to(bill, { opacity: 0, duration: 0.4, delay: 1.8 + Math.random() });
      } else {
        bill.classList.add("fx-bill-css");
        bill.style.animationDelay = (Math.random() * 0.5) + "s";
        setTimeout(() => bill.remove(), 3200);
      }
    }
    floatLabel("+" + window.Logic.money(amount), "good");
  }

  // ---------- heavy deduction (big expense) ----------
  function heavyDeduction(amount) {
    const layer = fxLayer(); if (!layer) return;
    if (reduced()) return floatLabel("\u2212" + window.Logic.money(amount), "bad");
    const vignette = document.getElementById("fx-vignette");
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vignette && hasGSAP()) {
      window.gsap.fromTo(vignette, { opacity: 0 }, { opacity: 1, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" });
      window.gsap.fromTo(document.getElementById("app") || document.body,
        { x: 0 }, { x: 8, duration: 0.05, repeat: 7, yoyo: true, clearProps: "x" });
    } else if (vignette) {
      vignette.classList.add("fx-vignette-css");
      setTimeout(() => vignette.classList.remove("fx-vignette-css"), 700);
    }
    const n = Math.min(22, 8 + Math.floor((amount || 0) / 120));
    for (let i = 0; i < n; i++) {
      const coin = document.createElement("div");
      coin.className = "fx-bill fx-bill--down";
      coin.textContent = "$";
      coin.style.left = (vw * 0.2 + Math.random() * vw * 0.6) + "px";
      coin.style.top = (vh * 0.25 + Math.random() * vh * 0.2) + "px";
      layer.appendChild(coin);
      if (hasGSAP()) {
        window.gsap.to(coin, {
          y: vh, x: "+=" + (Math.random() - 0.5) * 80,
          rotation: (Math.random() - 0.5) * 360,
          opacity: 0,
          duration: 0.8 + Math.random() * 0.6,
          delay: Math.random() * 0.25,
          ease: "power2.in",
          onComplete: () => coin.remove()
        });
      } else {
        coin.classList.add("fx-bill-css");
        setTimeout(() => coin.remove(), 1600);
      }
    }
    floatLabel("\u2212" + window.Logic.money(amount), "bad");
  }

  // floating +$/-$ label near center
  function floatLabel(text, tone) {
    const layer = fxLayer(); if (!layer) return;
    const el = document.createElement("div");
    el.className = "fx-float fx-float--" + tone;
    el.textContent = text;
    layer.appendChild(el);
    if (hasGSAP() && !reduced()) {
      window.gsap.fromTo(el, { y: 20, opacity: 0, scale: 0.9 },
        { y: -40, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" });
      window.gsap.to(el, { y: -90, opacity: 0, duration: 0.7, delay: 0.9, onComplete: () => el.remove() });
    } else {
      el.classList.add("fx-float-css");
      setTimeout(() => el.remove(), 1800);
    }
  }

  // ---------- small change pulse (regular expense) ----------
  function smallDeduction(amount) { floatLabel("\u2212" + window.Logic.money(amount), "bad"); }

  // ---------- number count-up on dashboard KPIs ----------
  function countUp(el, value, formatter) {
    if (!el) return;
    if (!hasGSAP() || reduced()) { el.textContent = formatter(value); return; }
    const obj = { v: 0 };
    window.gsap.to(obj, {
      v: value, duration: 0.9, ease: "power2.out",
      onUpdate: () => { el.textContent = formatter(obj.v); },
      onComplete: () => { el.textContent = formatter(value); }
    });
  }

  // ---------- view transitions + hover lift ----------
  function enterView(viewEl) {
    if (!viewEl) return;
    if (!hasGSAP() || reduced()) return;
    const cards = viewEl.querySelectorAll(".card, .txn-row, .alert-row");
    window.gsap.fromTo(viewEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", clearProps: "all" });
    if (cards.length) {
      window.gsap.fromTo(cards, { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.035, ease: "power2.out", clearProps: "all" });
    }
  }

  // ---------- three.js ambient orbs on the auth screen ----------
  function authAmbient(canvas) {
    if (!canvas || typeof window.THREE === "undefined" || reduced()) return null;
    try {
      const THREE = window.THREE;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.z = 14;
      const geo = new THREE.SphereGeometry(0.5, 16, 16);
      const orbs = [];
      const colors = [0x9CAF88, 0xC9A87C, 0x6B7C5E, 0xD6C7A9];
      for (let i = 0; i < 26; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: colors[i % colors.length], transparent: true, opacity: 0.16 + Math.random() * 0.12
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8);
        m.scale.setScalar(0.4 + Math.random() * 1.7);
        m.userData = { vy: 0.002 + Math.random() * 0.004, ph: Math.random() * Math.PI * 2 };
        scene.add(m); orbs.push(m);
      }
      let raf = null, t = 0;
      function size() {
        const r = canvas.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / Math.max(1, r.height);
        camera.updateProjectionMatrix();
      }
      size();
      window.addEventListener("resize", size);
      function loop() {
        t += 1;
        orbs.forEach(o => {
          o.position.y += o.userData.vy;
          o.position.x += Math.sin(t / 90 + o.userData.ph) * 0.004;
          if (o.position.y > 9) o.position.y = -9;
        });
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      }
      loop();
      return { stop() { if (raf) cancelAnimationFrame(raf); window.removeEventListener("resize", size); } };
    } catch (e) { return null; }
  }

  window.Anim = { moneyRain, heavyDeduction, smallDeduction, floatLabel, countUp, enterView, authAmbient, reduced };
})();
