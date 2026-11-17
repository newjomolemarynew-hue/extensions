(() => {
  const C = self.BMChess, B = self.BMBrain, $ = (id) => document.getElementById(id);
  const store = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;
  const sget = (k) => new Promise((r) => (store ? store.get(k, (v) => r(v || {})) : r({})));
  const sset = (o) => new Promise((r) => (store ? store.set(o, () => r()) : r()));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PIECE_GLYPHS = { P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔", p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
  const chessComPieceUrl = (code) => `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${code.toLowerCase()}.png`;
  let custom = self.BMCustomization.DEFAULTS, lastBoardKey = "", lastReviewCss = "";
  let chessPieceTheme = self.BMCustomization.defaultPieceTheme();
  const customStyle = document.createElement("style");
  customStyle.id = "bm-review-piece-animation";
  document.head.appendChild(customStyle);

  const S = { game: null, startFen: C.START, plies: [], fens: [C.START], A: [], R: [], cur: 0, flip: false, token: 0, summary: null, headers: {}, profiles: {}, selGame: null };
  const score = B.score, W = B.W;

  // ================= engine =================
  class Engine {
    constructor() {
      this.w = new Worker("engine/stockfish.js"); this.cur = null; this.mp = 0;
      this.w.onmessage = (e) => { if (typeof e.data === "string" && this.cur) this.cur(e.data); };
      this.w.postMessage("uci"); this.w.postMessage("setoption name Hash value 64"); this.w.postMessage("isready");
    }
    analyze(fen, movetime, multipv = 2) {
      return new Promise((res) => {
        const lines = {};
        this.cur = (l) => {
          if (l.startsWith("info") && l.includes(" pv ")) {
            if (/ (lower|upper)bound/.test(l)) return;           // provisional score from an interrupted iteration: not a real evaluation
            const i = +((l.match(/ multipv (\d+)/) || [])[1] || 1), d = l.match(/ depth (\d+)/), cp = l.match(/score cp (-?\d+)/), m = l.match(/score mate (-?\d+)/), pv = l.split(" pv ")[1].trim().split(" ");
            lines[i] = { move: pv[0], pv, depth: d ? +d[1] : 0, cp: cp ? +cp[1] : null, mate: m ? +m[1] : null };
          } else if (l.startsWith("bestmove")) { this.cur = null; res(Object.keys(lines).sort((a, b) => a - b).map((k) => lines[k])); }
        };
        if (multipv !== this.mp) { this.w.postMessage("setoption name MultiPV value " + multipv); this.mp = multipv; }
        this.w.postMessage("position fen " + fen); this.w.postMessage("go movetime " + movetime);
      });
    }
    stop() { this.w.postMessage("stop"); }
  }
  let eng = null; const cache = new Map();
  const lineCount = () => { const el = document.getElementById("engine"); return el ? Math.max(2, Math.min(4, +el.value || 2)) : 2; };

  // ================= Chess.com move sounds =================
  const SOUND_BASE = "https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/";
  const sounds = {}; let soundOn = true;
  try { soundOn = localStorage.getItem("bmSound") !== "0"; } catch (_) {}
  function beep() {       // fallback if Chess.com's sound files can't be loaded
    try { const a = new (self.AudioContext || self.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 520; g.gain.value = 0.05; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.05); } catch (_) {}
  }
  function playSound(ply) {
    if (!soundOn || !ply) return;
    const san = ply.san || "", name = /#/.test(san) ? "game-end" : /\+/.test(san) ? "move-check" : /=/.test(san) ? "promote" : /^O-O/.test(san) ? "castle" : /x/.test(san) || ply.cap ? "capture" : "move-self";
    let a = sounds[name]; if (!a) { a = sounds[name] = new Audio(SOUND_BASE + name + ".mp3"); a.preload = "auto"; }
    try { a.currentTime = 0; const r = a.play(); if (r && r.catch) r.catch(beep); } catch (_) { beep(); }
  }

  // ================= loading a game =================
  function setGame(meta, startFen, plies, headers) {
    S.token++; if (eng) eng.stop();
    Object.assign(S, { game: meta, startFen, plies, headers, profiles: {}, fens: [startFen, ...plies.map((p) => p.fenAfter)], A: [], R: [], cur: 0, summary: null });
    S.flip = false; if (meta && meta.userColor === "black") S.flip = true;
    renderAll(); loadPlayerProfiles(meta, headers, S.token); runAnalysis();
  }
  function loadPgn(text, meta) {
    const g = C.parsePgn(text); if (!g.san.length) return setStatus("No moves found in that PGN.");
    const start = g.headers.FEN || C.START, r = C.replay(start, g.san);
    if (r.error && !r.plies.length) return setStatus(r.error);
    if (r.error) setStatus(r.error + " — analysing the moves before it.");
    setGame(meta || null, start, r.plies, g.headers);
  }
  const setStatus = (t) => { $("status").textContent = t || ""; };

  // ================= analysis =================
  async function runAnalysis() {
    const tok = S.token, mt = +$("speed").value, n = S.fens.length;
    eng = eng || new Engine();
    for (let i = 0; i < n; i++) {
      if (tok !== S.token) return;
      const fen = S.fens[i], pos = C.fromFen(fen), legal = C.legalMoves(pos), ck = fen + "|" + mt + "|" + lineCount();
      let lines;
      if (!legal.length) lines = [{ move: null, pv: [], cp: C.inCheck(pos) ? null : 0, mate: C.inCheck(pos) ? 0 : null, depth: 0 }];
      else if (cache.has(ck)) lines = cache.get(ck);
      else { lines = await eng.analyze(fen, mt, lineCount()); if (tok !== S.token) return; cache.set(ck, lines); }
      S.A[i] = { lines, legalCount: legal.length, terminal: !legal.length, mate: !legal.length && C.inCheck(pos) };
      $("prog").style.width = ((i + 1) / n) * 100 + "%"; setStatus(`Analysing ${i + 1} / ${n}`);
      computeReview(); renderLive(i);
    }
    await refine(tok);
    if (tok !== S.token) return;
    setStatus("Analysis complete"); setTimeout(() => { if (tok === S.token) $("prog").style.width = "0"; }, 600);
  }

  // A quick pass can misjudge sharp positions. Re-check the moves that look like mistakes, blunders,
  // brilliancies or great moves with a much longer search, and keep the more reliable result.
  async function refine(tok) {
    const mt = Math.min(1600, +$("speed").value * 4);
    const targets = []; S.R.forEach((r, i) => { if (r && (r.loss >= 8 || r.cls === "brilliant" || r.cls === "great")) targets.push(i); });
    const list = targets.slice(0, 16); let n = 0;
    for (const i of list) {
      if (tok !== S.token) return;
      setStatus(`Double-checking ${++n} / ${list.length}`); $("prog").style.width = (n / list.length) * 100 + "%";
      for (const j of [i, i + 1]) {
        const A = S.A[j]; if (!A || A.terminal || A.deep) continue;
        const ck = S.fens[j] + "|" + mt; let lines = cache.get(ck);
        if (!lines) { lines = await eng.analyze(S.fens[j], mt, 2); if (tok !== S.token) return; cache.set(ck, lines); }
        S.A[j] = { ...A, lines, deep: true };
      }
      computeReview(); renderLive(i);
    }
  }

  function computeReview() {
    const R = [], pl = S.plies;
    for (let i = 0; i < pl.length; i++) {
      const A0 = S.A[i], A1 = S.A[i + 1]; if (!A0 || !A1) break;
      const p = pl[i], best = A0.lines[0], second = A0.lines[1], sBest = score(best);
      const played = A0.lines.find((l) => l.move === p.uci);
      const sPlayed = A1.terminal ? (A1.mate ? 10000 : 0) : played ? score(played) : -score(A1.lines[0]);
      const wBest = W(sBest), wPlayed = W(sPlayed), isBest = best.move === p.uci;
      const prev = pl[i - 1], recapture = !!(prev && prev.cap && p.cap && prev.move.to === p.move.to);
      // sacrifice: material the mover is down after his move and the opponent's best reply
      let sac = false, sacSize = 0;
      if (!A1.terminal && A1.lines[0].move) {
        const m0 = C.material(C.fromFen(S.fens[i])), pos1 = C.fromFen(S.fens[i + 1]), reply = C.moveFromUci(pos1, A1.lines[0].move);
        if (reply) {
          const m2 = C.material(C.makeMove(pos1, reply)), d = (m) => (p.mover === "w" ? m.w - m.b : m.b - m.w);
          const net = d(m2) - d(m0); sac = net <= -2; sacSize = -net;
        }
      }
      const c = B.classify({ legalCount: A0.legalCount, wBest, wPlayed, isBest, gapSecond: isBest && second ? wBest - W(score(second)) : null, sac, sacSize, mates: A1.mate, recapture, prevOppLoss: R[i - 1] ? R[i - 1].loss : 0 });
      R[i] = { ...c, wBest, wPlayed, sBest, sPlayed, bestUci: best.move, acc: B.accuracy(c.loss), mover: p.mover };
    }
    S.R = R;
    const flat = R.filter(Boolean).map((r) => ({ mover: r.mover, acc: r.acc, wa: r.wPlayed }));
    const side = (col) => {
      const xs = R.filter((r) => r && r.mover === col), counts = {};
      xs.forEach((r) => (counts[r.cls] = (counts[r.cls] || 0) + 1));
      return { counts, acc: B.gameAccuracy(flat, col), n: xs.length };
    };
    S.summary = { w: side("w"), b: side("b") };
  }

  // ================= rendering =================
  const TC = {
    bullet: '<path d="M8 1.2c1.9 0 3.1 2 3.1 4.4V10H4.9V5.6c0-2.4 1.2-4.4 3.1-4.4z"/><rect x="4.4" y="11" width="7.2" height="3.4" rx="1.1"/>', blitz: '<path d="M9.2.8 3 9h4.1l-1 6.2L13 6.7H8.8z"/>',
    rapid: '<circle cx="8" cy="9" r="5.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 9V6M6 1.6h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    daily: '<circle cx="8" cy="8" r="3"/><path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M3.3 12.7l1.2-1.2M11.5 4.5l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  };
  const TCC = { bullet: "#ffb340", blitz: "#ffd60a", rapid: "#32d74b", daily: "#ff9f0a" };
  const tcIcon = (k) => `<svg class="tc" viewBox="0 0 16 16" style="color:${TCC[k] || "#98a1b0"}">${TC[k] || TC.rapid}</svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtW = (s, turn) => { const v = turn === "w" ? s : -s; if (Math.abs(v) >= 9000) return (v > 0 ? "M" : "−M") + (10000 - Math.abs(v)); return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v / 100).toFixed(2); };

  function renderBoard() {
    const fen = S.fens[S.cur], p = C.fromFen(fen), flip = S.flip, last = S.cur > 0 ? S.plies[S.cur - 1] : null, rv = S.cur > 0 ? S.R[S.cur - 1] : null;
    const Cz = self.BMCustomization;
    custom = Cz.normalize(custom);
    const localPieces = custom.pieceSource === "local" || custom.pieceSource === "theme";
    const boardLight = custom.squareColors.light, boardDark = custom.squareColors.dark;
    const key = [fen, flip, S.cur, rv && rv.cls, JSON.stringify(custom), Object.keys(chessPieceTheme).length].join("|");
    if (key === lastBoardKey) return; lastBoardKey = key;
    const xy = (i) => [(flip ? 7 - (i & 7) : i & 7) * 100, (flip ? i >> 3 : 7 - (i >> 3)) * 100];
    let s = `<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">`;
    for (let i = 0; i < 64; i++) {
      const [x, y] = xy(i), light = ((i & 7) + (i >> 3)) % 2 === 1;
      s += `<rect x="${x}" y="${y}" width="100" height="100" fill="${light ? boardLight : boardDark}"/>`;
    }
    if (last) for (const sq of [last.move.from, last.move.to]) { const [x, y] = xy(sq); s += `<rect x="${x}" y="${y}" width="100" height="100" fill="rgba(255,214,10,.42)"/>`; }
    for (let i = 0; i < 64; i++) { // coordinates
      const [x, y] = xy(i), light = ((i & 7) + (i >> 3)) % 2 === 1, col = light ? boardDark : boardLight;
      const bottom = flip ? i >> 3 === 7 : i >> 3 === 0, left = flip ? (i & 7) === 7 : (i & 7) === 0;
      if (bottom) s += `<text x="${x + 88}" y="${y + 94}" font-size="17" font-weight="700" text-anchor="end" fill="${col}">${"abcdefgh"[i & 7]}</text>`;
      if (left) s += `<text x="${x + 6}" y="${y + 20}" font-size="17" font-weight="700" fill="${col}">${(i >> 3) + 1}</text>`;
    }
    // best-move arrow for non-best moves
    if (rv && ["inaccuracy", "mistake", "miss", "blunder"].includes(rv.cls) && rv.bestUci) {
      const a = C.sqIdx(rv.bestUci.slice(0, 2)), b2 = C.sqIdx(rv.bestUci.slice(2, 4)), [x1, y1] = xy(a), [x2, y2] = xy(b2);
      const cx1 = x1 + 50, cy1 = y1 + 50, cx2 = x2 + 50, cy2 = y2 + 50, dx = cx2 - cx1, dy = cy2 - cy1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
      const bx = cx2 - ux * 30, by = cy2 - uy * 30;
      s += `<g opacity=".92"><line x1="${cx1 + ux * 14}" y1="${cy1 + uy * 14}" x2="${bx}" y2="${by}" stroke="#81b64c" stroke-width="16" stroke-linecap="round"/><polygon points="${cx2 - ux * 4},${cy2 - uy * 4} ${bx + px * 26},${by + py * 26} ${bx - px * 26},${by - py * 26}" fill="#81b64c"/></g>`;
    }
    for (let i = 0; i < 64; i++) {
      const c = p.b[i]; if (!c) continue; const [x, y] = xy(i), white = C.isW(c);
      const code = `${white ? "w" : "b"}${c.toLowerCase()}`;
      if (localPieces) {
        for (const url of (Cz.pieceLayers(custom, code) || []).slice().reverse()) s += `<image href="${url}" x="${x + 4}" y="${y + 4}" width="92" height="92"/>`;
      } else {
        const theme = chessPieceTheme[code];
        if (theme?.image) {
          s += `<foreignObject x="${x + 7}" y="${y + 7}" width="86" height="86"><div xmlns="http://www.w3.org/1999/xhtml" class="bm-review-piece bm-chesscom-piece ${code}" role="img" aria-label="${white ? "White" : "Black"} ${C.pieceName(c)}" style="background-image:url(&quot;${esc(theme.image)}&quot;);background-size:${esc(theme.size)};background-position:${esc(theme.position)}"></div></foreignObject>`;
        } else {
          s += `<foreignObject x="${x + 7}" y="${y + 7}" width="86" height="86"><div xmlns="http://www.w3.org/1999/xhtml" class="bm-review-piece bm-chesscom-piece ${code}" role="img" aria-label="${white ? "White" : "Black"} ${C.pieceName(c)}"><img src="${chessComPieceUrl(code)}" alt=""><span aria-hidden="true">${PIECE_GLYPHS[c]}</span></div></foreignObject>`;
        }
      }
    }
    if (last && rv) { const [x, y] = xy(last.move.to); s += B.badge(rv.cls, 38).replace("<svg ", `<svg x="${x + 60}" y="${y - 6}" `); }
    $("board").innerHTML = s + "</svg>";
    $("board").querySelectorAll(".bm-chesscom-piece img").forEach((image) => {
      image.addEventListener("error", () => image.closest(".bm-chesscom-piece")?.classList.add("image-failed"), { once: true });
    });
  }

  function playerFor(color) {
    const word = color === "w" ? "white" : "black", profile = S.profiles[word] || {}, supplied = S.game?.players?.[word] || {};
    const username = supplied.username || profile.username || "";
    const name = profile.name || supplied.name || S.headers[color === "w" ? "White" : "Black"] || (username ? username : color === "w" ? "White" : "Black");
    const rating = supplied.rating || profile.rating || S.headers[color === "w" ? "WhiteElo" : "BlackElo"] || "";
    return { color, word, username, name, rating, title: profile.title || supplied.title || "", avatar: profile.avatar || supplied.avatar || "", isUser: S.game?.userColor === word };
  }
  function safeAvatar(url) {
    try {
      const parsed = new URL(url);
      const hosts = ["chess.com", "chesscomfiles.com"];
      const trustedHost = hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
      return parsed.protocol === "https:" && trustedHost ? parsed.href : "";
    } catch { return ""; }
  }
  function nameBar(color) {
    const player = playerFor(color), initials = player.name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "?";
    const avatar = safeAvatar(player.avatar);
    const h = S.headers, result = h.Result || "*";
    const score = result === "1-0" ? (color === "w" ? "1" : "0") : result === "0-1" ? (color === "b" ? "1" : "0") : result === "1/2-1/2" ? "½" : "—";
    const accuracy = S.summary?.[color]?.acc;
    return `<div class="nm"><span class="player-avatar">${esc(initials)}${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : ""}</span><span class="player-info"><span class="player-name">${esc(player.name)}${player.title ? ` <span class="title">${esc(player.title)}</span>` : ""}${player.isUser ? ' <span class="player-tag">YOU</span>' : ""}</span><span class="player-handle">${player.username ? `@${esc(player.username)}` : "Chess.com player"}${player.rating ? ` · ${esc(player.rating)} Elo` : ""}</span></span></div><span class="player-result">${accuracy == null ? "" : `${accuracy.toFixed(1)}% accuracy`}<b>${score}</b></span>`;
  }
  function renderBars() {
    const top = S.flip ? "w" : "b", bottom = S.flip ? "b" : "w";
    $("topBar").innerHTML = nameBar(top);
    $("botBar").innerHTML = nameBar(bottom);
    $("topBar").setAttribute("aria-label", playerFor(top).isUser ? "Your player profile" : "Opponent profile");
    $("botBar").setAttribute("aria-label", playerFor(bottom).isUser ? "Your player profile" : "Opponent profile");
    document.querySelectorAll(".player-avatar img").forEach((image) => image.addEventListener("error", () => image.remove(), { once: true }));
  }
  async function loadPlayerProfiles(meta, headers, token) {
    const players = {};
    for (const color of ["white", "black"]) {
      const header = headers[color === "white" ? "White" : "Black"] || "";
      const supplied = meta?.players?.[color] || {};
      const username = supplied.username || (/^[a-z0-9_-]{2,40}$/i.test(header) && !/^(white|black|player ?[12]|unknown)$/i.test(header) ? header : "");
      if (username) players[color] = { ...supplied, username };
    }
    const profiles = await Promise.all(Object.entries(players).map(async ([color, player]) => {
      try {
        const info = await api(`/pub/player/${encodeURIComponent(player.username)}`);
        return [color, { ...player, name: info.name || "", title: info.title || "", avatar: info.avatar || "" }];
      } catch (error) {
        console.warn(`Could not load Chess.com profile for ${player.username}: ${error.message}`);
        return [color, player];
      }
    }));
    if (token !== S.token) return;
    S.profiles = Object.fromEntries(profiles);
    renderBars();
  }

  function renderEvalBar() {
    const A = S.A[S.cur]; if (!A) { $("evfill").style.height = "50%"; $("evtxt").textContent = "…"; return; }
    const turn = C.fromFen(S.fens[S.cur]).turn, sc = score(A.lines[0]), wp = W(turn === "w" ? sc : -sc);
    $("evfill").style.height = (S.flip ? 100 - wp : wp) + "%"; $("evfill").style.bottom = S.flip ? "auto" : "0"; $("evfill").style.top = S.flip ? "0" : "auto";
    const t = A.terminal ? (A.mate ? "#" : "½") : fmtW(sc, turn).replace("+", ""); $("evtxt").textContent = t;
    $("evtxt").style.top = S.flip ? "auto" : "0"; $("evtxt").style.bottom = S.flip ? "0" : "auto";
  }

  function renderChart() {
    const n = S.fens.length, W0 = 600, H = 96; let pts = [];
    for (let i = 0; i < n; i++) { const A = S.A[i]; if (!A) break; const turn = C.fromFen(S.fens[i]).turn, sc = score(A.lines[0]); pts.push([(i / Math.max(1, n - 1)) * W0, H - (W(turn === "w" ? sc : -sc) / 100) * H]); }
    let s = `<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".28"/></linearGradient></defs><rect width="${W0}" height="${H}" fill="transparent"/>`;
    if (pts.length > 1) {
      const line = pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
      s += `<path d="M0,${H} L${line} L${pts[pts.length - 1][0]},${H}Z" fill="url(#ga)"/>`;
    }
    s += `<line x1="0" x2="${W0}" y1="${H / 2}" y2="${H / 2}" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity=".28" vector-effect="non-scaling-stroke"/>`;
    S.R.forEach((r, i) => { if (!r || !["mistake", "blunder", "brilliant", "miss"].includes(r.cls) || !pts[i + 1]) return; s += `<circle cx="${pts[i + 1][0]}" cy="${pts[i + 1][1]}" r="3.8" fill="${B.CLASSES[r.cls].color}" stroke="#0b0d14" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; });
    s += `<line x1="${(S.cur / Math.max(1, n - 1)) * W0}" x2="${(S.cur / Math.max(1, n - 1)) * W0}" y1="0" y2="${H}" stroke="#5ac8fa" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    $("chart").innerHTML = s;
  }

  const ORDER = ["brilliant", "great", "best", "excellent", "good", "inaccuracy", "mistake", "miss", "blunder"];
  function renderSummary() {
    const sm = S.summary; if (!S.plies.length) { $("sum").innerHTML = ""; return; }
    const f = (x) => (x == null ? "—" : x.toFixed(1));
    let h = `<div class="row"><div class="acc-box"><b>${f(sm && sm.w.acc)}</b><span>White accuracy</span></div><div class="acc-mid">vs</div><div class="acc-box"><b>${f(sm && sm.b.acc)}</b><span>Black accuracy</span></div></div><div class="cnt">`;
    for (const k of ORDER) {
      const a = (sm && sm.w.counts[k]) || 0, b = (sm && sm.b.counts[k]) || 0;
      h += `<div class="l ${a ? "" : "z"}" style="color:${a ? B.CLASSES[k].color : ""}">${a}</div><div class="c" title="${B.CLASSES[k].label}">${B.badge(k, 20)}</div><div class="r ${b ? "" : "z"}" style="color:${b ? B.CLASSES[k].color : ""}">${b}</div>`;
    }
    $("sum").innerHTML = h + "</div>";
  }

  function renderMoves() {
    let h = "";
    for (let i = 0; i < S.plies.length; i += 2) {
      const cell = (j) => { const p = S.plies[j]; if (!p) return "<span></span>"; const r = S.R[j]; return `<button class="mv ${S.cur === j + 1 ? "on" : ""}" data-i="${j + 1}">${r ? B.badge(r.cls, 16) : '<span style="width:16px"></span>'}${esc(p.san)}</button>`; };
      h += `<div class="mrow"><span class="n">${Math.floor(i / 2) + 1}.</span>${cell(i)}${cell(i + 1)}</div>`;
    }
    const box = $("moves"), keep = box.scrollTop; box.innerHTML = h; box.scrollTop = keep; revealMove();
  }
  // Scrolls ONLY the move list. (scrollIntoView also scrolls the whole page, which pushed the board under the header.)
  function revealMove() {
    const box = $("moves"), el = box.querySelector(".on"); if (!el) return;
    const er = el.getBoundingClientRect(), br = box.getBoundingClientRect();
    if (er.top < br.top + 6) box.scrollTop -= br.top + 6 - er.top; else if (er.bottom > br.bottom - 6) box.scrollTop += er.bottom - (br.bottom - 6);
  }
  function markMove() {
    const box = $("moves"), old = box.querySelector(".on"); if (old) old.classList.remove("on");
    const el = box.querySelector(`[data-i="${S.cur}"]`); if (el) el.classList.add("on"); revealMove();
  }

  function reasonText(i) {
    const r = S.R[i], p = S.plies[i], A0 = S.A[i], A1 = S.A[i + 1]; if (!r) return "";
    const who = p.mover === "w" ? "White" : "Black", opp = p.mover === "w" ? "Black" : "White", bestLine = A0.lines[0], out = [];
    const bestSan = bestLine.move ? B.sanOf(S.fens[i], bestLine.move) : null;
    const why = bestLine.move ? B.describeMove(S.fens[i], bestLine.move, bestLine) : [];
    if (r.cls === "brilliant") out.push(`A real sacrifice that works: ${who} gives up material and the position still holds up.`);
    else if (r.cls === "great") out.push(`The only move that keeps the position under control. The alternatives lose ${Math.round(r.wBest - W(score(A0.lines[1])))}% of your win chance.`);
    else if (r.cls === "best") out.push(why.length ? `It ${why.join(" and ")}.` : "The engine's top choice.");
    else if (r.cls === "forced") out.push("The only legal move.");
    else if (["excellent", "good"].includes(r.cls)) out.push(bestSan && bestSan !== p.san ? `Close to the best move, ${bestSan}.` : "A solid move.");
    else {
      out.push(`${who}'s win chance fell from ${Math.round(r.wBest)}% to ${Math.round(r.wPlayed)}%.`);
      if (!A1.terminal && A1.lines[0].move) { const o = B.pvOutcome(S.fens[i + 1], A1.lines[0].pv, 8); if (o.mate) out.push(`${opp} can force mate: ${B.fmtLine(S.fens[i + 1], A1.lines[0].pv, 6)}.`); else if (o.delta >= 1) out.push(`${opp} can now play ${o.sans[0]} and win ${B.gainText(o.delta)}.`); }
      if (bestSan) out.push(`Better was ${bestSan}${why.length ? ", which " + why.join(" and ") : ""}.`);
    }
    return out.join(" ");
  }

  function renderDetail() {
    if (!S.plies.length) return;
    if (S.cur === 0) {
      const h = S.headers, eco = (h.ECOUrl || "").split("/openings/")[1], open = eco ? eco.split("-").filter((w, i, a) => !/^\d/.test(w) && !a.slice(0, i).some((x) => /^\d/.test(x))).join(" ") : (h.Opening || "");
      $("detail").innerHTML = `<div class="h">${esc(h.White || "White")} vs ${esc(h.Black || "Black")}</div><div class="sub">${esc(h.Result || "")}${h.Termination ? " · " + esc(h.Termination) : ""}</div>${open ? `<p>Opening: <b>${esc(open)}</b></p>` : ""}<p class="muted">Use ← → to step through the game. Click the chart or a move to jump.</p>`;
      return;
    }
    const i = S.cur - 1, p = S.plies[i], r = S.R[i];
    if (!r) { $("detail").innerHTML = `<div class="h">${esc(p.san)}</div><div class="sub">Analysing…</div>`; return; }
    const meta = B.CLASSES[r.cls], A1 = S.A[i + 1], turnAfter = C.fromFen(S.fens[i + 1]).turn;
    const evAfter = A1.terminal ? (A1.mate ? "#" : "=") : fmtW(score(A1.lines[0]), turnAfter);
    const title = r.cls === "best" ? `${p.san} is the best move` : r.cls === "forced" ? `${p.san} is forced` : `${p.san} is ${/^[aeiou]/i.test(meta.label) ? "an" : "a"} ${meta.label.toLowerCase()}`;
    const A0 = S.A[i], bl = A0.lines[0], line = bl.move && r.cls !== "best" && r.cls !== "forced" && r.cls !== "brilliant" && r.cls !== "great" ? B.fmtLine(S.fens[i], bl.pv, 6) : "";
    $("detail").innerHTML = `<div class="h">${B.badge(r.cls, 26)}<span style="color:${meta.color}">${esc(title)}</span></div><div class="sub">Evaluation ${esc(evAfter)} · accuracy ${r.acc.toFixed(0)}%</div><p>${esc(reasonText(i))}</p>${line ? `<div class="ln">Engine line: <b>${esc(line)}</b></div>` : ""}`;
  }

  function renderLiveNow() { renderBars(); renderSummary(); renderChart(); renderMoves(); renderBoard(); renderEvalBar(); renderDetail(); }
  let liveFrame = 0;
  function renderLive() { if (!liveFrame) liveFrame = requestAnimationFrame(() => { liveFrame = 0; renderLiveNow(); }); }
  function renderAll() { renderLive(); }
  const go = (i) => { const before = S.cur; S.cur = Math.max(0, Math.min(S.plies.length, i)); if (S.cur !== before && S.cur > 0) playSound(S.plies[(S.cur > before ? S.cur : before) - 1]); renderBoard(); renderEvalBar(); renderChart(); renderDetail(); markMove(); };

  // ================= games list (chess.com public API) =================
  const G = { user: "", archives: [], next: 0, games: [], filter: "all" };
  const RES = { checkmated: "checkmate", resigned: "resignation", timeout: "time", abandoned: "abandonment", stalemate: "stalemate", agreed: "agreement", repetition: "repetition", insufficient: "insufficient material", timevsinsufficient: "time vs insufficient", "50move": "50-move rule" };
  async function api(path) { const r = await fetch("https://api.chess.com" + path, { headers: { Accept: "application/json" } }); if (r.status === 404) throw new Error("User not found"); if (!r.ok) throw new Error("chess.com returned " + r.status); return r.json(); }
  async function loadUser(u) {
    G.user = u.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,40}$/.test(G.user)) return ($("gstatus").textContent = "Enter a valid chess.com username.");
    sset({ bmUser: G.user }); G.games = []; G.archives = []; G.next = 0; $("glist").innerHTML = ""; $("more").hidden = true; $("gstatus").textContent = "Loading…";
    try { const a = await api(`/pub/player/${G.user}/games/archives`); G.archives = (a.archives || []).slice().reverse(); } catch (e) { return ($("gstatus").textContent = e.message); }
    if (!G.archives.length) return ($("gstatus").textContent = "No public games found.");
    await loadMore();
  }
  async function loadMore() {
    $("more").hidden = true; let added = 0;
    while (G.next < G.archives.length && added < 12) {
      try { const m = await api(G.archives[G.next++].replace("https://api.chess.com", "")); const gs = (m.games || []).slice().reverse(); G.games.push(...gs); added += gs.length; } catch (e) { $("gstatus").textContent = e.message; break; }
    }
    renderGames(); $("more").hidden = G.next >= G.archives.length;
  }
  function gameInfo(g) {
    const u = G.user, mine = g.white.username.toLowerCase() === u ? "white" : "black", me = g[mine], opp = g[mine === "white" ? "black" : "white"];
    const out = me.result === "win" ? "Won" : opp.result === "win" ? "Lost" : "Draw", reason = RES[out === "Won" ? opp.result : out === "Lost" ? me.result : (me.result !== "win" ? me.result : opp.result)] || "";
    return { mine, me, opp, out, reason, color: out === "Won" ? "#81b64c" : out === "Lost" ? "#fa412d" : "#98a1b0" };
  }
  function renderGames() {
    const list = G.games.filter((g) => G.filter === "all" || g.time_class === G.filter);
    $("gstatus").textContent = list.length ? `${G.user} · ${list.length} games` : "No games for this filter yet.";
    let h = "", lastM = "";
    list.forEach((g) => {
      const idx = G.games.indexOf(g), d = new Date(g.end_time * 1000), m = d.toLocaleString("en", { month: "long", year: "numeric" }), gi = gameInfo(g), ok = g.rules === "chess";
      if (m !== lastM) { h += `<div class="month">${m}</div>`; lastM = m; }
      const acc = g.accuracies ? ` · ${g.accuracies[gi.mine].toFixed ? g.accuracies[gi.mine].toFixed(0) : g.accuracies[gi.mine]}%` : "";
      h += `<button class="gi ${ok ? "" : "dis"} ${S.selGame === g.url ? "sel" : ""}" data-g="${idx}"><i class="bar" style="background:${gi.color}"></i><div><div class="t1">${tcIcon(g.time_class)}vs ${esc(gi.opp.username)} <span class="muted">(${gi.opp.rating})</span></div><div class="t2">${gi.out}${gi.reason ? " · " + gi.reason : ""} · ${d.toLocaleDateString("en", { month: "short", day: "numeric" })}${acc}${ok ? "" : " · " + esc(g.rules)}</div></div><div class="rs" style="color:${gi.color}">${gi.out === "Won" ? "1" : gi.out === "Lost" ? "0" : "½"}</div></button>`;
    });
    $("glist").innerHTML = h;
  }
  $("glist").addEventListener("click", (e) => {
    const b = e.target.closest("[data-g]"); if (!b) return; const g = G.games[+b.dataset.g]; if (!g || !g.pgn) return;
  S.selGame = g.url; renderGames(); const gi = gameInfo(g);
  loadPgn(g.pgn, {
    userColor: gi.mine,
    players: {
      white: { username: g.white.username, rating: g.white.rating },
      black: { username: g.black.username, rating: g.black.rating }
    }
  });
  });

  // ================= wiring =================
  $("uform").addEventListener("submit", (e) => { e.preventDefault(); loadUser($("user").value); });
  $("more").onclick = loadMore;
  $("filter").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; G.filter = b.dataset.f; const bs = [...$("filter").querySelectorAll("button")]; bs.forEach((x) => x.classList.toggle("on", x === b)); $("filter").style.setProperty("--i", bs.indexOf(b)); renderGames(); });
  $("btnPaste").onclick = () => $("dlg").showModal();
  $("btnCustomize").onclick = () => {
    chrome.runtime.sendMessage({ type: "openCustomization" }, (response) => {
      if (chrome.runtime.lastError || response?.error) console.error(`Could not open customization: ${chrome.runtime.lastError?.message || response?.error}`);
    });
  };
  const setReviewCustomization = async (settings) => {
    custom = self.BMCustomization.normalize(settings);
    renderBoard();

  };
  self.BMCustomization.watch((settings) => setReviewCustomization(settings));
  self.BMCustomization.load().then((settings) => setReviewCustomization(settings))
    .catch((error) => console.error(`Could not load customization: ${error.message}`));
  self.BMCustomization.watch((settings) => setReviewCustomization(settings));
  reducedMotion.addEventListener("change", renderBoard);
  if (store) {
    store.get(self.BMCustomization.PIECE_THEME_KEY, (values) => {
      if (chrome.runtime.lastError) {
        console.error(`Could not load the Chess.com piece theme: ${chrome.runtime.lastError.message}`);
        return;
      }
      chessPieceTheme = self.BMCustomization.normalizePieceTheme(values[self.BMCustomization.PIECE_THEME_KEY]);
      renderBoard();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !Object.prototype.hasOwnProperty.call(changes, self.BMCustomization.PIECE_THEME_KEY)) return;
      chessPieceTheme = self.BMCustomization.normalizePieceTheme(changes[self.BMCustomization.PIECE_THEME_KEY].newValue);
      renderBoard();
    });
  }
  $("dlg").addEventListener("close", () => { if ($("dlg").returnValue === "ok" && $("pgn").value.trim()) loadPgn($("pgn").value.trim(), null); });
  { const b = $("btnSound"), sync = () => { b.setAttribute("aria-pressed", String(soundOn)); b.style.opacity = soundOn ? "1" : ".5"; b.querySelector(".wv").style.display = soundOn ? "" : "none"; };
    sync(); b.onclick = () => { soundOn = !soundOn; try { localStorage.setItem("bmSound", soundOn ? "1" : "0"); } catch (_) {} sync(); if (soundOn) beep(); };
    $("engine").addEventListener("change", () => $("speed").dispatchEvent(new Event("change")));
  }
  $("cFirst").onclick = () => go(0); $("cPrev").onclick = () => go(S.cur - 1); $("cNext").onclick = () => go(S.cur + 1); $("cLast").onclick = () => go(S.plies.length);
  $("cFlip").onclick = () => { S.flip = !S.flip; renderBars(); renderBoard(); renderEvalBar(); };
  $("moves").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) go(+b.dataset.i); });
  $("chart").addEventListener("click", (e) => { const r = $("chart").getBoundingClientRect(); go(Math.round(((e.clientX - r.left) / r.width) * (S.fens.length - 1))); });
  $("speed").addEventListener("change", () => { if (S.plies.length) { S.token++; if (eng) eng.stop(); S.A = []; S.R = []; S.summary = null; runAnalysis(); } });
  addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft") go(S.cur - 1); else if (e.key === "ArrowRight") go(S.cur + 1); else if (e.key === "Home") go(0); else if (e.key === "End") go(S.plies.length); else if (e.key.toLowerCase() === "f") $("cFlip").click();
  });

  // ================= startup: analysis payload from the panel =================
  (async () => {
    const v = await sget(["bmReviewInbox", "bmUser"]);
    if (v.bmUser) $("user").value = v.bmUser;
    const inbox = v.bmReviewInbox;
    if (inbox) {
      if (store) store.remove("bmReviewInbox");
      if (inbox.pgn) loadPgn(inbox.pgn, null);
      else if (inbox.ucis) { const r = C.replayUci(inbox.startFen || C.START, inbox.ucis); if (r.plies.length) setGame(null, inbox.startFen || C.START, r.plies, { White: "White", Black: "Black", Result: "*" }); }
      if (inbox.username && !v.bmUser) $("user").value = inbox.username;
    }
    if ($("user").value && !inbox) loadUser($("user").value);
    renderBars(); window.__bmAnalysis = { S, loadPgn, go };
  })();
})();
