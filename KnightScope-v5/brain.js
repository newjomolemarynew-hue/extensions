// Shared reasoning: win%, move classification (Brilliant … Blunder), accuracy, and plain-language explanations.
(() => {
  const C = self.BMChess;
  const score = (l) => (l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : l.cp ?? 0);
  // win probability for the side the score belongs to, in percent (0-100)
  const W = (s) => { if (s >= 9000) return 100; if (s <= -9000) return 0; const c = Math.max(-1000, Math.min(1000, s)); return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1); };
  // Lichess game accuracy: each move's accuracy is weighted by how volatile the position was around it
  // (a sliding window over the win% series), then blended 50/50 with the harmonic mean, which punishes blunders.
  // plies: every judged ply of the game in order, each { mover: "w"|"b", wa: win% for the mover after the move, acc }.
  function gameAccuracy(plies, color) {
    const list = plies.filter((p) => p && typeof p.acc === "number");
    const mine = list.filter((p) => p.mover === color);
    if (!mine.length) return null;
    const series = list.map((p) => (p.mover === "w" ? p.wa : 100 - p.wa));          // white's win%
    const win = Math.max(2, Math.min(8, Math.floor(list.length / 10)));
    const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length); };
    let wSum = 0, wAcc = 0, inv = 0;
    list.forEach((p, i) => {
      if (p.mover !== color) return;
      const from = Math.max(0, Math.min(i - Math.floor(win / 2), series.length - win)), w = Math.max(0.5, Math.min(12, sd(series.slice(from, from + win))));
      wSum += w; wAcc += w * p.acc; inv += 1 / Math.max(p.acc, 1);
    });
    const weighted = wAcc / wSum, harmonic = mine.length / inv;
    return Math.max(0, Math.min(100, (weighted + harmonic) / 2));
  }
  const accuracy = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

  const CLASSES = {
    brilliant:  { label: "Brilliant",  sym: "!!", color: "#26c2a3" },
    great:      { label: "Great",      sym: "!",  color: "#5c8bb0" },
    best:       { label: "Best",       sym: "★",  color: "#81b64c" },
    excellent:  { label: "Excellent",  sym: "✓",  color: "#81b64c" },
    good:       { label: "Good",       sym: "✓",  color: "#95b776" },
    inaccuracy: { label: "Inaccuracy", sym: "?!", color: "#f7c631" },
    mistake:    { label: "Mistake",    sym: "?",  color: "#ffa459" },
    miss:       { label: "Miss",       sym: "✕",  color: "#ff7769" },
    blunder:    { label: "Blunder",    sym: "??", color: "#fa412d" },
    forced:     { label: "Forced",     sym: "→",  color: "#98a1b0" }
  };
  // look-alike badge (own artwork, same colour/symbol convention as chess review tools)
  function badge(cls, size = 18) {
    const m = CLASSES[cls]; if (!m) return "";
    const t = cls === "best" ? `<path d="M12 5.6l1.9 4 4.4.5-3.3 3 .9 4.4-3.9-2.2-3.9 2.2.9-4.4-3.3-3 4.4-.5z" fill="#fff"/>`
      : cls === "excellent" || cls === "good" ? `<path d="M7.6 12.4l3 3 5.8-6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
      : cls === "miss" ? `<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`
      : cls === "forced" ? `<path d="M7 12h9m-3.5-3.5L16 12l-3.5 3.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<text x="12" y="16.2" text-anchor="middle" font-size="${m.sym.length > 1 ? 11 : 13}" font-weight="800" fill="#fff" font-family="-apple-system,Segoe UI,Arial,sans-serif">${m.sym}</text>`;
    return `<svg class="bdg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${m.label}"><circle cx="12" cy="12" r="11" fill="${m.color}"/>${t}</svg>`;
  }

  // ---- classification ----
  function classify(o) {
    if (o.legalCount === 1) return { cls: "forced", loss: 0 };
    const loss = Math.max(0, o.wBest - o.wPlayed);
    let cls;
    if (o.isBest || loss <= 0.3) {
      cls = "best";
      if (o.sac && o.wPlayed >= 45 && !o.mates && (o.wBest <= 88 || (o.sacSize || 0) >= 5)) cls = "brilliant";
      else if (o.gapSecond != null && o.gapSecond >= 14 && o.wBest >= 25 && o.wBest <= 92 && !o.recapture) cls = "great";
    } else if (loss <= 2) cls = "excellent";
    else if (loss <= 5) cls = "good";
    else if (loss <= 10) cls = "inaccuracy";
    else if (loss <= 20) cls = "mistake";
    else cls = "blunder";
    if ((cls === "inaccuracy" || cls === "mistake") && (o.prevOppLoss || 0) >= 10 && o.wBest >= 62 && loss >= 8) cls = "miss";
    return { cls, loss };
  }

  // ---- PV helpers ----
  function pvOutcome(fen, pv, n = 8) {
    let p = C.fromFen(fen); const me = p.turn, m0 = C.material(p), base = me === "w" ? m0.w - m0.b : m0.b - m0.w;
    const sans = [], deltas = [], quiet = []; let mate = false;
    for (let i = 0; i < Math.min(n, pv.length); i++) {
      const legal = C.legalMoves(p), m = C.moveFromUci(p, pv[i], legal); if (!m) break;
      sans.push(C.toSan(p, m, legal)); p = C.makeMove(p, m);
      const mt = C.material(p); deltas.push((me === "w" ? mt.w - mt.b : mt.b - mt.w) - base); quiet.push(!(m.cap || m.flag === "ep"));
    }
    if (sans.length) mate = C.isMate(p);
    let k = deltas.length - 1; while (k > 0 && !quiet[k]) k--;
    return { sans, delta: deltas.length ? deltas[k] : 0, deltas, mate, plies: sans.length, endFen: C.toFenP(p) };
  }
  const gainText = (d) => ({ 1: "a pawn", 2: "two pawns", 3: "a piece", 4: "a piece and a pawn", 5: "a rook", 6: "a rook and a pawn", 8: "two pieces and a pawn", 9: "the queen" }[d] || `${d} points of material`);
  const nullFen = (fen) => { const p = C.fromFen(fen); if (C.inCheck(p)) return null; return C.toFenP({ ...p, turn: p.turn === "w" ? "b" : "w", ep: -1 }); };
  const sanOf = (fen, uci) => { const p = C.fromFen(fen), m = C.moveFromUci(p, uci); return m ? C.toSan(p, m) : uci; };
  const lineSan = (fen, pv, n = 5) => pvOutcome(fen, pv, n).sans;
  const fmtLine = (fen, pv, n = 4) => { // "12. Qh5 Nf6 13. Qxf7#" style
    const p0 = C.fromFen(fen); let num = p0.full, white = p0.turn === "w", out = [];
    pvOutcome(fen, pv, n).sans.forEach((s, i) => { if (white) out.push(`${num}.${s}`); else out.push(i === 0 ? `${num}…${s}` : s); if (!white) num++; white = !white; });
    return out.join(" ");
  };
  const evalWord = (w) => (w >= 90 ? "Winning" : w >= 70 ? "Clearly better" : w >= 58 ? "Slightly better" : w >= 42 ? "Balanced" : w >= 30 ? "Slightly worse" : w >= 10 ? "Clearly worse" : "Losing");

  // ---- why is this move good / what does it do ----
  function describeMove(fen, uci, line) {
    const p = C.fromFen(fen), legal = C.legalMoves(p), m = C.moveFromUci(p, uci, legal); if (!m) return [];
    const why = [], q = C.makeMove(p, m), out = line ? pvOutcome(fen, line.pv, 8) : null;
    if (C.inCheck(q) && C.legalMoves(q).length === 0) return ["is checkmate"];
    if (line && line.mate != null && line.mate > 0) why.push(`leads to mate in ${line.mate}`);
    else if (out && out.delta >= 1 && out.plies >= 1) why.push(`wins ${gainText(out.delta)}`);
    if (m.cap || m.flag === "ep") why.push(`captures the ${C.pieceName(m.cap)}`);
    if (m.promo) why.push("promotes");
    if (m.flag === "K" || m.flag === "Q") why.push("castles to safety");
    if (C.inCheck(q)) why.push("gives check");
    return why;
  }

  self.BMBrain = { score, W, accuracy, gameAccuracy, CLASSES, badge, classify, pvOutcome, gainText, nullFen, sanOf, lineSan, fmtLine, evalWord, describeMove };
})();
