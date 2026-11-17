(() => {
  const NS = "http://www.w3.org/2000/svg";
  const ARROW_COLORS = { expect: "255,159,10", premove: "48,209,88", trap: "255,69,58" };

  function create(getSnapshot, chess, colors) {
    let element = null;
    let signature = "";

    function clear() {
      element?.remove();
      element = null;
      signature = "";
    }

    function build() {
      const { settings, state, response, premove, trap } = getSnapshot();
      const out = [];
      if (!settings.enabled || !state) return out;

      const mine = state.turn === state.me, accent = colors[settings.color] || colors.blue;
      if (mine && response) {
        response.lines.slice(0, settings.lines).forEach((line, index) => out.push({
          move: line.move, color: accent, opacity: index ? 0.38 : 1,
          width: index ? 0.1 : 0.16, ring: index ? "end" : "both"
        }));
        const pv = response.lines[0].pv;
        if (pv && pv[1]) out.push({ move: pv[1], color: ARROW_COLORS.expect, opacity: 0.9, width: 0.1, dashed: true, ring: "end" });
        if (trap) out.push({ move: trap.bad, color: ARROW_COLORS.trap, opacity: 0.95, width: 0.1, dashed: true, ring: "end", cross: true });
      } else if (!mine && premove && premove.fen === state.fen && premove.cands && premove.state !== "thinking") {
        premove.cands.slice(0, 2).forEach((candidate) => {
          if (candidate.p >= 0.12) out.push({
            move: candidate.move, color: ARROW_COLORS.expect,
            opacity: 0.32 + 0.68 * Math.min(1, candidate.p * 1.4),
            width: 0.12, ring: "end"
          });
        });
        if (premove.state === "safe" || premove.state === "trapsafe") out.push({ move: premove.move, color: ARROW_COLORS.premove, opacity: 1, width: 0.14, ring: "both" });
        if (premove.trap) out.push({ move: premove.trap.bad, color: ARROW_COLORS.trap, opacity: 0.95, width: 0.1, dashed: true, ring: "end", cross: true });
      }
      return out;
    }

    function draw(board, flipped, list, nextSignature) {
      clear();
      if (!list.length) return;
      const squareCenter = (square) => {
        const file = square.charCodeAt(0) - 97, rank = +square[1] - 1;
        return [(flipped ? 7 - file : file) + 0.5, (flipped ? rank : 7 - rank) + 0.5];
      };
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 8 8");
      svg.setAttribute("data-bm-arrows", "1");
      svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:visible";
      let body = "";

      for (const arrow of list) {
        const move = arrow.move;
        if (!move || move.length < 4) continue;
        const [x1, y1] = squareCenter(move.slice(0, 2)), [x2, y2] = squareCenter(move.slice(2, 4));
        const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length, px = -uy, py = ux;
        const head = arrow.width > 0.12 ? 0.34 : 0.26, headWidth = head * 0.6;
        const sx = x1 + ux * 0.2, sy = y1 + uy * 0.2, bx = x2 - ux * head * 0.85, by = y2 - uy * head * 0.85;
        const tip = `${x2 - ux * 0.04},${y2 - uy * 0.04}`, h1 = `${bx + px * headWidth},${by + py * headWidth}`, h2 = `${bx - px * headWidth},${by - py * headWidth}`;
        const color = arrow.color, stroke = `rgba(${color},${arrow.opacity})`;
        body += "<g>";
        if (arrow.ring === "both") body += `<circle cx="${x1}" cy="${y1}" r="0.42" fill="rgba(${color},${0.14 * arrow.opacity})" stroke="${stroke}" stroke-width="0.035"/>`;
        body += `<circle cx="${x2}" cy="${y2}" r="0.44" fill="rgba(${color},${0.16 * arrow.opacity})" stroke="${stroke}" stroke-width="0.035"/>`;
        body += `<line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="${stroke}" stroke-width="${arrow.width}" stroke-linecap="${arrow.dashed ? "butt" : "round"}" ${arrow.dashed ? 'stroke-dasharray="0.24 0.18"' : ""}/>`;
        body += `<polygon points="${tip} ${h1} ${h2}" fill="${stroke}"/>`;
        if (arrow.cross) {
          body += `<path d="M${x2 - 0.15},${y2 - 0.15}L${x2 + 0.15},${y2 + 0.15}M${x2 + 0.15},${y2 - 0.15}L${x2 - 0.15},${y2 + 0.15}" stroke="rgba(255,255,255,.95)" stroke-width="0.13" stroke-linecap="round"/><path d="M${x2 - 0.15},${y2 - 0.15}L${x2 + 0.15},${y2 + 0.15}M${x2 + 0.15},${y2 - 0.15}L${x2 - 0.15},${y2 + 0.15}" stroke="rgb(${color})" stroke-width="0.07" stroke-linecap="round"/>`;
        }
        body += "</g>";
      }

      svg.innerHTML = body;
      if (getComputedStyle(board).position === "static") board.style.position = "relative";
      board.appendChild(svg);
      element = svg;
      signature = nextSignature;
    }

    return {
      build,
      clear,
      draw,
      get element() { return element; },
      get signature() { return signature; }
    };
  }

  self.BMArrowRenderer = { create };
})();
