// Attaches the particle overlay to the Chess.com board. Cheap by design:
// a single mutation observer (debounced) and a canvas loop that sleeps when nothing is alive.
(() => {
  function create(getBoard) {
    let board = null, canvas = null, fx = null, ro = null, mo = null, cfg = null, timer = 0, watchdog = 0;
    let lastSig = "", lastCount = -1;
    // ---- animated board background: its own canvas, under the pieces (z-index 2) ----
    let bBoard = null, bCanvas = null, bFx = null, bCfg = null;
    function bDetach() { if (bFx) bFx.destroy(); bFx = null; if (bCanvas) bCanvas.remove(); bCanvas = bBoard = null; }
    function bGuard() {
      const b = getBoard(), want = bCfg && bCfg.anim !== "none" && !bCfg.reduced && self.BMBoardFx;
      if (!want || !b) { if (bBoard) bDetach(); return; }
      if (b !== bBoard || !bCanvas || !bCanvas.isConnected) {
        bDetach(); bBoard = b; bCanvas = document.createElement("canvas"); bCanvas.setAttribute("data-bm-bfx", "1");
        bCanvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;border-radius:inherit";
        b.insertBefore(bCanvas, b.firstChild); bFx = self.BMBoardFx.create(bCanvas);
      }
      bFx.set(bCfg.anim, bCfg.power, false);
    }

    const squareOf = (el) => { const m = [...el.classList].find((n) => /^square-\d\d$/.test(n)); return m ? { f: +m[7] - 1, r: +m[8] - 1 } : null; };
    function center(sq) {
      const w = canvas.clientWidth / 8, h = canvas.clientHeight / 8, flipped = board.classList.contains("flipped");
      return { x: ((flipped ? 7 - sq.f : sq.f) + 0.5) * w, y: ((flipped ? sq.r : 7 - sq.r) + 0.5) * h };
    }
    function detach() {
      clearTimeout(timer); if (mo) mo.disconnect(); if (ro) ro.disconnect();
      mo = ro = null; if (fx) fx.destroy(); fx = null; if (canvas) canvas.remove(); canvas = null; board = null; lastSig = ""; lastCount = -1;
    }
    function attach(b) {
      board = b; canvas = document.createElement("canvas"); canvas.setAttribute("data-bm-fx", "1");
      canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:40";
      b.appendChild(canvas);
      fx = self.BMFx.create(canvas, { tint: cfg && cfg.tint });
      const size = () => fx && fx.resize(canvas.clientWidth, canvas.clientHeight);
      ro = new ResizeObserver(size); ro.observe(b); size();
      mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(onBoardChange, 40); });
      mo.observe(b, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      lastCount = b.querySelectorAll(".piece").length;
      paint();
    }
    function onBoardChange() {
      if (!fx || !board || !cfg || !cfg.burst) return;
      const hl = [...board.querySelectorAll(".highlight")].map(squareOf).filter(Boolean);
      const sig = hl.map((s) => s.f + "" + s.r).sort().join(",");
      const count = board.querySelectorAll(".piece").length;
      if (sig && sig !== lastSig && hl.length) {
        const dest = hl.find((s) => board.querySelector(`.piece.square-${s.f + 1}${s.r + 1}`)) || hl[hl.length - 1];
        const capture = lastCount > 0 && count < lastCount, c = center(dest);
        if (cfg.particles !== "none") fx.burst(cfg.particles, c.x, c.y, capture ? 26 : 12);
      }
      lastSig = sig; lastCount = count;
    }
    function paint() {
      if (!fx || !cfg) return;
      if (cfg.particles === "none" || cfg.reduced) fx.setAmbient("none", 0); else fx.setAmbient(cfg.particles, cfg.density);
    }
    // Chess.com replaces the board element between games; follow it.
    function guard() {
      const b = getBoard();
      if (!cfg || cfg.particles === "none" || cfg.reduced) { if (board) detach(); return; }
      if (b && b !== board) { detach(); attach(b); }
      else if (!b && board) detach();
      else if (board && canvas && !canvas.isConnected) { detach(); attach(board.isConnected ? board : b || board); }
    }
    watchdog = setInterval(() => { guard(); bGuard(); }, 1500);
    return {
      apply(settings) {
        const fxs = settings.fx, white = settings.piece && settings.piece.white && settings.piece.white.fill;
        cfg = { particles: fxs.particles, density: fxs.density, burst: fxs.burst, reduced: settings.reducedMotion || (self.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches), tint: settings.pieceSource === "local" ? white : null };
        guard(); if (fx) { fx.setTint(cfg.tint); paint(); }
        bCfg = { anim: settings.boardAnim || "none", power: settings.boardAnimPower, reduced: cfg.reduced }; bGuard();
      },
      destroy() { clearInterval(watchdog); detach(); bDetach(); }
    };
  }
  self.BMFxLive = { create };
})();
