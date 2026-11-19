// Chess rules engine: legal move generation, SAN, PGN, SEE, material. Exposed as self.BMChess
(() => {
  const FILES = "abcdefgh";
  const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
  const sqIdx = (s) => s.charCodeAt(0) - 97 + ((+s[1] - 1) << 3);
  const isW = (c) => c >= "A" && c <= "Z";
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const NO = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KO = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const BD = [[1, 1], [1, -1], [-1, 1], [-1, -1]], RD = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ---------- FEN ----------
  function fromFen(fen) {
    const [pos, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
    const b = new Array(64).fill(null);
    pos.split("/").forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else b[(7 - i) * 8 + f++] = ch; } });
    return { b, turn: turn === "b" ? "b" : "w", cast: cast && cast !== "-" ? cast : "", ep: ep && ep !== "-" ? sqIdx(ep) : -1, half: +half || 0, full: +full || 1 };
  }
  function toFenP(p) {
    const rows = [];
    for (let r = 7; r >= 0; r--) { let s = "", e = 0; for (let f = 0; f < 8; f++) { const c = p.b[r * 8 + f]; if (!c) e++; else { if (e) { s += e; e = 0; } s += c; } } rows.push(s + (e || "")); }
    return `${rows.join("/")} ${p.turn} ${p.cast || "-"} ${p.ep >= 0 ? sqName(p.ep) : "-"} ${p.half} ${p.full}`;
  }
  const key = (fen) => fen.split(" ").slice(0, 3).join(" ");

  // ---------- attacks ----------
  const colorOf = (c) => (isW(c) ? "w" : "b");
  function attackList(b, sq, by) {       // indices of `by`'s pieces attacking sq (board-based, sliders blocked)
    const out = [], f = sq & 7, r = sq >> 3, W = by === "w";
    const pr = r + (W ? -1 : 1), P = W ? "P" : "p";
    for (const df of [-1, 1]) { const ff = f + df; if (ff >= 0 && ff < 8 && pr >= 0 && pr < 8 && b[pr * 8 + ff] === P) out.push(pr * 8 + ff); }
    const N = W ? "N" : "n", K = W ? "K" : "k";
    for (const [df, dr] of NO) { const ff = f + df, rr = r + dr; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === N) out.push(rr * 8 + ff); }
    for (const [df, dr] of KO) { const ff = f + df, rr = r + dr; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === K) out.push(rr * 8 + ff); }
    const B = W ? "B" : "b", R = W ? "R" : "r", Q = W ? "Q" : "q";
    for (const [dirs, a, z] of [[BD, B, Q], [RD, R, Q]]) for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr;
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { const c = b[rr * 8 + ff]; if (c) { if (c === a || c === z) out.push(rr * 8 + ff); break; } ff += df; rr += dr; }
    }
    return out;
  }
  const attacked = (p, sq, by) => attackList(p.b, sq, by).length > 0;
  const kingSq = (p, color) => p.b.indexOf(color === "w" ? "K" : "k");
  const inCheck = (p, color = p.turn) => { const k = kingSq(p, color); return k >= 0 && attacked(p, k, color === "w" ? "b" : "w"); };

  // ---------- move generation ----------
  function pseudo(p) {
    const out = [], b = p.b, W = p.turn === "w", opp = W ? "b" : "w";
    const mine = (c) => c && isW(c) === W, theirs = (c) => c && isW(c) !== W;
    const add = (from, to, piece, extra) => out.push({ from, to, piece, cap: b[to] || null, promo: null, flag: null, ...extra });
    for (let from = 0; from < 64; from++) {
      const pc = b[from]; if (!mine(pc)) continue;
      const t = pc.toLowerCase(), f = from & 7, r = from >> 3;
      if (t === "p") {
        const dir = W ? 1 : -1, start = W ? 1 : 6, last = W ? 7 : 0, nr = r + dir;
        if (nr < 0 || nr > 7) continue;
        const pushTo = (to, extra) => { if (nr === last) for (const pr of "qrbn") out.push({ from, to, piece: pc, cap: b[to] || null, promo: pr, flag: null, ...extra }); else add(from, to, pc, extra); };
        if (!b[nr * 8 + f]) { pushTo(nr * 8 + f); if (r === start && !b[(r + 2 * dir) * 8 + f]) add(from, (r + 2 * dir) * 8 + f, pc, { flag: "dbl" }); }
        for (const df of [-1, 1]) {
          const ff = f + df; if (ff < 0 || ff > 7) continue;
          const to = nr * 8 + ff;
          if (theirs(b[to])) pushTo(to);
          else if (to === p.ep && !b[to]) out.push({ from, to, piece: pc, cap: W ? "p" : "P", promo: null, flag: "ep" });
        }
      } else if (t === "n" || t === "k") {
        for (const [df, dr] of t === "n" ? NO : KO) { const ff = f + df, rr = r + dr; if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue; const to = rr * 8 + ff; if (!mine(b[to])) add(from, to, pc); }
        if (t === "k") {
          const rk = W ? 0 : 7, home = rk * 8 + 4;
          if (from === home && !attacked(p, home, opp)) {
            if (p.cast.includes(W ? "K" : "k") && b[home + 3] === (W ? "R" : "r") && !b[home + 1] && !b[home + 2] && !attacked(p, home + 1, opp) && !attacked(p, home + 2, opp)) add(from, home + 2, pc, { flag: "K", cap: null });
            if (p.cast.includes(W ? "Q" : "q") && b[home - 4] === (W ? "R" : "r") && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(p, home - 1, opp) && !attacked(p, home - 2, opp)) add(from, home - 2, pc, { flag: "Q", cap: null });
          }
        }
      } else {
        const dirs = t === "b" ? BD : t === "r" ? RD : [...BD, ...RD];
        for (const [df, dr] of dirs) { let ff = f + df, rr = r + dr; while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { const to = rr * 8 + ff, c = b[to]; if (!c) add(from, to, pc); else { if (theirs(c)) add(from, to, pc); break; } ff += df; rr += dr; } }
      }
    }
    return out;
  }
  function makeMove(p, m) {
    const b = p.b.slice(), W = p.turn === "w";
    b[m.from] = null;
    if (m.flag === "ep") b[m.to + (W ? -8 : 8)] = null;
    b[m.to] = m.promo ? (W ? m.promo.toUpperCase() : m.promo) : m.piece;
    if (m.flag === "K") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.flag === "Q") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    let cast = p.cast;
    const strip = (s) => { cast = cast.replace(s, ""); };
    if (m.piece === "K") { strip("K"); strip("Q"); } if (m.piece === "k") { strip("k"); strip("q"); }
    for (const sq of [m.from, m.to]) { if (sq === 0) strip("Q"); if (sq === 7) strip("K"); if (sq === 56) strip("q"); if (sq === 63) strip("k"); }
    return { b, turn: W ? "b" : "w", cast, ep: m.flag === "dbl" ? (m.from + m.to) / 2 : -1, half: m.piece.toLowerCase() === "p" || m.cap ? 0 : p.half + 1, full: p.full + (W ? 0 : 1) };
  }
  function legalMoves(p) {
    const me = p.turn, out = [];
    for (const m of pseudo(p)) { const q = makeMove(p, m); const k = kingSq(q, me); if (k >= 0 && !attacked(q, k, me === "w" ? "b" : "w")) out.push(m); }
    return out;
  }
  const uciOf = (m) => sqName(m.from) + sqName(m.to) + (m.promo || "");
  const moveFromUci = (p, uci, legal = legalMoves(p)) => legal.find((m) => uciOf(m) === uci) || null;
  const isMate = (p) => inCheck(p) && legalMoves(p).length === 0;
  const isStalemate = (p) => !inCheck(p) && legalMoves(p).length === 0;

  // ---------- SAN ----------
  function toSan(p, m, legal = legalMoves(p)) {
    let s;
    if (m.flag === "K") s = "O-O"; else if (m.flag === "Q") s = "O-O-O";
    else {
      const pc = m.piece.toUpperCase();
      if (pc === "P") { s = m.cap || m.flag === "ep" ? FILES[m.from & 7] + "x" + sqName(m.to) : sqName(m.to); if (m.promo) s += "=" + m.promo.toUpperCase(); }
      else {
        s = pc;
        const others = legal.filter((o) => o !== m && o.piece === m.piece && o.to === m.to && o.from !== m.from);
        if (others.length) { const sf = others.some((o) => (o.from & 7) === (m.from & 7)), sr = others.some((o) => (o.from >> 3) === (m.from >> 3)); s += !sf ? FILES[m.from & 7] : !sr ? (m.from >> 3) + 1 : sqName(m.from); }
        if (m.cap) s += "x"; s += sqName(m.to);
      }
    }
    const q = makeMove(p, m);
    if (inCheck(q)) s += legalMoves(q).length ? "+" : "#";
    return s;
  }
  function moveFromSan(p, san, legal = legalMoves(p)) {
    const norm = (x) => x.replace(/[+#!?]+/g, "").replace(/0/g, "O").replace(/e\.p\./, "").replace(/[–—]/g, "-");
    const t = norm(san);
    for (const m of legal) if (norm(toSan(p, m, legal)) === t) return m;
    const loose = (x) => x.replace(/x|=/g, "").replace(/-/g, "");
    for (const m of legal) if (loose(norm(toSan(p, m, legal))) === loose(t)) return m;
    return null;
  }

  // ---------- PGN ----------
  function parsePgn(text) {
    const headers = {}; text.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { headers[k] = v; return ""; });
    let s = text.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ").replace(/^\s*\[.*\]\s*$/gm, " ");
    for (let i = 0; i < 12 && /\(/.test(s); i++) s = s.replace(/\([^()]*\)/g, " ");
    s = s.replace(/\$\d+/g, " ");
    const toks = s.split(/\s+/).filter(Boolean).map((t) => t.replace(/^\d+\.+/, "")).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\d+\.+$/.test(t));
    const res = (s.match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/) || [])[1] || headers.Result || "*";
    return { headers, san: toks, result: res };
  }
  function replay(startFen, sans) {
    let p = fromFen(startFen), plies = [];
    for (const san of sans) {
      const legal = legalMoves(p), m = moveFromSan(p, san, legal);
      if (!m) return { plies, error: `Could not read move "${san}" at ply ${plies.length + 1}` };
      const fenBefore = toFenP(p), s = toSan(p, m, legal), q = makeMove(p, m);
      plies.push({ san: s, uci: uciOf(m), fenBefore, fenAfter: toFenP(q), move: m, mover: p.turn, piece: m.piece, cap: m.cap });
      p = q;
    }
    return { plies, error: null, endFen: toFenP(p) };
  }
  function replayUci(startFen, ucis) {
    let p = fromFen(startFen), plies = [];
    for (const u of ucis) {
      const legal = legalMoves(p), m = moveFromUci(p, u, legal);
      if (!m) return { plies, error: `Illegal move ${u}` };
      const fenBefore = toFenP(p), s = toSan(p, m, legal), q = makeMove(p, m);
      plies.push({ san: s, uci: u, fenBefore, fenAfter: toFenP(q), move: m, mover: p.turn, piece: m.piece, cap: m.cap });
      p = q;
    }
    return { plies, error: null, endFen: toFenP(p) };
  }

  // ---------- material, exchanges, loose pieces ----------
  function material(p) { let w = 0, b = 0; for (const c of p.b) { if (!c) continue; const v = VAL[c.toLowerCase()]; if (isW(c)) w += v; else b += v; } return { w, b }; }
  function leastAttacker(b, sq, by) {
    let best = -1, bv = 1e9;
    for (const i of attackList(b, sq, by)) { const v = b[i].toLowerCase() === "k" ? 100 : VAL[b[i].toLowerCase()]; if (v < bv) { bv = v; best = i; } }
    return best;
  }
  // material `by` can win by starting an exchange on `sq` (0 if none / not profitable)
  function seeSquare(b0, sq, by, fromSq) {
    const b = b0.slice(); const tgt = b[sq]; if (!tgt || colorOf(tgt) === by) return 0;
    const val = (c) => (c.toLowerCase() === "k" ? 100 : VAL[c.toLowerCase()]);
    const gain = [val(tgt)]; let side = by, from = fromSq != null ? fromSq : leastAttacker(b, sq, side); if (from < 0) return 0;
    let onSq = b[from], d = 0;
    while (from >= 0) {
      b[sq] = onSq; b[from] = null; d++;
      gain[d] = val(onSq) - gain[d - 1];
      side = side === "w" ? "b" : "w"; from = leastAttacker(b, sq, side);
      if (from >= 0) onSq = b[from];
      if (d > 30) break;
    }
    while (--d > 0) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    return fromSq != null ? gain[0] : Math.max(0, gain[0]);   // with a fixed first capturer the result can be negative
  }
  // pieces of `color` that the opponent can win material on right now
  function loosePieces(p, color) {
    const opp = color === "w" ? "b" : "w", out = [];
    for (let i = 0; i < 64; i++) {
      const c = p.b[i]; if (!c || colorOf(c) !== color || c.toLowerCase() === "k") continue;
      const g = seeSquare(p.b, i, opp); if (g >= 1) out.push({ sq: sqName(i), piece: c, win: g });
    }
    return out.sort((a, z) => z.win - a.win);
  }
  const PN = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const pieceName = (c) => PN[c.toLowerCase()];

  // ---------- legacy helpers used by the panel ----------
  function parseFen(fen) {          // 8x8 shape: b[rank][file]
    const s = fromFen(fen), b = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let i = 0; i < 64; i++) b[i >> 3][i & 7] = s.b[i];
    return { b, turn: s.turn, cast: s.cast || "-", ep: s.ep >= 0 ? sqName(s.ep) : "-", half: s.half, full: s.full };
  }
  function applyMove(fen, uci) {
    const p = fromFen(fen), m = moveFromUci(p, uci); if (!m) return null;
    return toFenP(makeMove(p, m));
  }
  function captures(fen) {
    const p = fromFen(fen), val = (c) => (c ? VAL[c.toLowerCase()] : 0);
    return legalMoves(p).filter((m) => m.cap || m.flag === "ep").sort((a, z) => val(z.cap) - val(a.cap) || val(a.piece) - val(z.piece)).slice(0, 4).map(uciOf);
  }

  self.BMChess = { START, fromFen, toFenP, key, sqName, sqIdx, isW, VAL, PN, pieceName, attackList, attacked, inCheck, legalMoves, makeMove, uciOf, moveFromUci, moveFromSan, toSan,
    isMate, isStalemate, parsePgn, replay, replayUci, material, seeSquare, loosePieces, parseFen, applyMove, captures };
})();
