// Runs in the page's own JavaScript world so it can read Chess.com's board object.
// It copies three small facts (FEN, which side you play, time control) onto <html> data attributes,
// and only touches the DOM when one of them actually changes.
(() => {
  if (window.__bmPage) return; window.__bmPage = true;
  const d = document.documentElement;
  const grab = (o) => {
    const out = {};
    const walk = (obj, pre, depth) => {
      if (!obj || typeof obj !== "object" || depth > 2) return;
      for (const k of Object.keys(obj)) {
        let v; try { v = obj[k]; } catch (_) { continue; }
        if (/time|clock|control|class|variant/i.test(k) && (typeof v === "string" || typeof v === "number")) out[pre + k] = v;
        else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, pre + k + ".", depth + 1);
      }
    };
    walk(o, "", 0); return out;
  };
  const put = (name, value) => {
    if (value == null || value === "") { if (name in d.dataset) delete d.dataset[name]; }
    else if (d.dataset[name] !== value) d.dataset[name] = value;
  };
  let tcDone = false, board = null;
  const tick = () => {
    if (document.hidden) return;
    try {
      if (!board || !board.isConnected) board = document.querySelector("wc-chess-board, chess-board");
      const g = board && board.game;
      if (g && typeof g.getFEN === "function") {
        put("bmFen", g.getFEN());
        const as = typeof g.getPlayingAs === "function" ? g.getPlayingAs() : null;
        put("bmAs", as == null ? "" : String(as));
        if (!tcDone) {
          try {
            const o = typeof g.getOptions === "function" ? g.getOptions() : g.options;
            const out = grab(o); if (Object.keys(out).length) { put("bmTC", JSON.stringify(out).slice(0, 600)); tcDone = true; }
          } catch (_) {}
        }
      } else { put("bmFen", ""); put("bmAs", ""); put("bmTC", ""); tcDone = false; board = null; }
    } catch (_) {}
  };
  setInterval(tick, 150);
  tick();
})();
