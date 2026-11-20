self.BMLivePanel = () => {
  function boot() {
  try { if (sessionStorage.getItem("bmPanelDetached") === "1") return; } catch (_) {}
  try { window.__bm && window.__bm.destroy(); } catch (_) {}
  document.querySelectorAll("[data-bm-host],[data-bm-arrows]").forEach((e) => e.remove());
  const C = self.BMChess, B = self.BMBrain;
  const cleanups = [], timers = [];
  const on = (t, e, f, options) => { t.addEventListener(e, f, options); cleanups.push(() => t.removeEventListener(e, f, options)); };

  const DEFAULTS = { enabled: true, elo: 3200, speed: "auto", lines: 1, color: "blue", myTurnOnly: false, peek: false, collapsed: false, corner: "br",
                     avoidRep: true, coach: true, voice: false, glass: 55, style: "regular", theme: "dark", reduceMotion: false,
                     premove: "auto", oppMode: "auto", oppElo: 1500, autoPlay: false,
                     autoPlayDelayMode: "fixed", autoPlayDelay: 500, autoPlayDelayMin: 300, autoPlayDelayMax: 900,
                     autoOpponent: true, liveEngine: "stockfish",
                     humanizeWithMaia: false, maiaRatingMode: "auto", maiaElo: 1500, maiaMaxLoss: 100 };
  const MAIA_MODELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
  const maiaModelElo = (target) => Number.isFinite(target)
    ? MAIA_MODELS.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, MAIA_MODELS[0])
    : null;
  const CUSTOM_DEFAULTS = self.BMCustomization.DEFAULTS;
  const COLORS = { blue: "10,132,255", green: "48,209,88", orange: "255,159,10", pink: "255,55,95", purple: "191,90,242" };
  const ANALYSIS_KEYS = ["elo", "speed", "lines", "avoidRep", "enabled", "premove", "oppMode", "oppElo", "autoOpponent", "liveEngine"];
  let S = { ...DEFAULTS };
  let retryAt = 0, errRuns = 0, lastFen = "", resp = null, maiaResp = null, maiaStatus = "", maiaRequest = 0, peekHeld = false, status = "init", engineMsg = "";
  let seen = {}, lastHistFen = null, lastFull = 0, prevScore = null, st = null, insKey = "";
  let pre = null, preEpoch = 0, myTrap = null, threat = null, acc = { n: 0, t1: 0, t3: 0 }, insight = { tone: "", title: "Ready", body: "", action: "" };
  let hist = { start: null, plies: [] }; const evalLog = new Map();
  let mode = { cls: "unknown", base: null };
  let lastMe = null, gameInfo = null, lastRenderKey = "", lastRenderAt = 0, lastArrowKey = "";
  let gameOverAnalysisShown = false, analysisPrompt = null;
  const _ids = new WeakMap(); let _idc = 0; const idOf = (o) => (o == null ? 0 : _ids.get(o) || (_ids.set(o, ++_idc), _idc));

  const boardFeature = self.BMBoardState.create(C);
  const { sane, getBoard, readState } = boardFeature;
  const autoPlayFeature = self.BMAutoPlay.create({
    chess: C,
    getBoard,
    getState: () => {
      const board = getBoard();
      if (!board) return null;
      const state = readState(board);
      return sane(state.fen) ? state : null;
    },
    isEnabled: () => S.enabled && S.autoPlay,
    canAutoPlay: () => mode.cls === "bot",
    getDelay: () => {
      const clamp = (value) => Math.max(0, Math.min(10000, Math.round(Number(value) || 0)));
      if (S.autoPlayDelayMode === "random") {
        const min = Math.min(clamp(S.autoPlayDelayMin), clamp(S.autoPlayDelayMax));
        const max = Math.max(clamp(S.autoPlayDelayMin), clamp(S.autoPlayDelayMax));
        return min + Math.floor(Math.random() * (max - min + 1));
      }
      return clamp(S.autoPlayDelay);
    }
  });
  const score = (l) => (l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : l.cp ?? 0);
  // Stockfish scores are White-relative; rank moves from the side-to-move's view.
  const rootScore = (line, fen) => C.parseFen(fen).turn === "w" ? score(line) : -score(line);
  const NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function showGameOverAnalysis() {
    if (gameOverAnalysisShown || analysisPrompt || !hist.plies.length) return;
    gameOverAnalysisShown = true;
    const host = document.createElement("div");
    host.setAttribute("data-bm-analysis-prompt", "1");
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483646;";
    const root = host.attachShadow({mode:"open"});
    root.innerHTML = `
      <style>
        :host{all:initial}.card{font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f5f7ff;width:290px;padding:14px 15px;border-radius:18px;background:rgba(22,25,38,.9);backdrop-filter:blur(18px);box-shadow:0 18px 50px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.16);animation:in .25s ease}
        @keyframes in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .top{display:flex;align-items:flex-start;gap:10px}.icon{font-size:22px}.copy{flex:1}.title{font-weight:750;font-size:14px}.sub{margin-top:3px;color:#aeb5c8;font-size:12px}.x{border:0;background:none;color:#9da5b8;cursor:pointer;font-size:17px}
        .actions{display:flex;gap:8px;margin-top:12px}.open{flex:1;border:0;border-radius:10px;padding:9px 12px;background:#0a84ff;color:white;font-weight:700;cursor:pointer}.later{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef1f8;border-radius:10px;padding:9px 12px;cursor:pointer}
      </style>
      <div class="card" role="dialog" aria-label="Game finished">
        <div class="top"><div class="icon">♞</div><div class="copy"><div class="title">Game finished</div><div class="sub">Open your game in the KnightScope analysis board.</div></div><button class="x" aria-label="Close">×</button></div>
        <div class="actions"><button class="open">Open Analysis Board</button><button class="later">Later</button></div>
      </div>`;
    const remove=()=>{if(host.isConnected)host.remove();analysisPrompt=null;};
    root.querySelector(".open").addEventListener("click",()=>{
      const payload={startFen:hist.start,ucis:hist.plies.map(p=>p.uci)};
      try{chrome.runtime.sendMessage({type:"openAnalysis",payload},()=>void chrome.runtime.lastError);}catch(_){}
      remove();
    });
    root.querySelector(".later").addEventListener("click",remove);
    root.querySelector(".x").addEventListener("click",remove);
    document.documentElement.appendChild(host); analysisPrompt=host;
  }
  const reviewFeature = null; // V8: game-end flow uses the unified Analysis Board prompt instead of the old review card.
  
  const LIVE_NOW = { bot: 1, bullet: 1, blitz: 1, rapid: 1, classical: 1, daily: 1 };
  const whatsNew = self.BMWhatsNew ? self.BMWhatsNew.create({ actions: {
    openUrl: (url) => { try { window.open(url, "_blank", "noopener,noreferrer"); } catch (_) {} },
    openStudio: () => { try { chrome.runtime.sendMessage({ type: "openCustomization" }, () => void chrome.runtime.lastError); } catch (_) {} },
    openReview: () => { try { chrome.runtime.sendMessage({ type: "openAnalysis", payload: null }); } catch (_) {} },
    openPanel: () => { save({ collapsed: false }); setTab("s"); }
  } }) : null;
  if (whatsNew) cleanups.push(() => whatsNew.destroy());
  const gameIsOver = (position) => {
    if (self.BMReview && self.BMReview.domGameOver()) return true;
    try { const p = C.fromFen(position.fen); return C.isMate(p) || C.isStalemate(p); } catch (_) { return false; }
  };
  const modeFeature = self.BMGameMode.create();
  const fmtBase = self.BMGameMode.fmtBase;
  const LIVE_CLASSES = { bullet: 1, blitz: 1, rapid: 1, classical: 1, daily: 1 };
  const detectMode = (position) => {
    mode = modeFeature.detect(position);
    const tc = gameInfo && gameInfo.timeClass;
    if (tc && LIVE_CLASSES[tc] && !["bot", "analysis", "puzzle"].includes(mode.cls) && mode.cls !== tc) mode = { ...mode, cls: tc };
  };
  let playerInfo = { username: "", kind: "unknown", mode: "unknown", rating: null, source: "", status: "waiting" };
  const playerRatingsFeature = self.BMPlayerRatings.create({
    onGame: (g) => { gameInfo = g; lastRenderKey = ""; },
    request: (username) => new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "get-player-ratings", username }, (response) => {
        const error = chrome.runtime.lastError;
        resolve(error ? { error: error.message } : response || { error: "Chess.com returned no rating data" });
      });
    }),
    onChange: (next) => {
      const previous = playerInfo.rating;
      playerInfo = next;
      if (previous !== next.rating && S.autoOpponent && mode.cls === "bot") {
        lastFen = "";
        resp = null;
        maiaResp = null;
        maiaStatus = "";
      }
      render();
      if (next.rating != null && next.rating !== previous && st) {
        if (shouldHumanizeWithMaia() && resp?.final) humanizeMove(lastFen, resp);
        if (st.turn !== st.me && premoveActive()) runPremove(st.fen);
      }
    }
  });
  const detectedOpp = () => playerInfo.rating;
  const oppElo = () => {
    if (mode.cls === "bot" && S.autoOpponent) return detectedOpp();
    if (S.oppMode === "manual") return Number.isFinite(+S.oppElo) ? Math.max(0, Math.min(3200, +S.oppElo)) : null;
    return detectedOpp();
  };
  const autoOpponentConfig = () => self.BMOpponentAutoConfig.resolve({
    enabled: S.autoOpponent,
    mode: mode.cls,
    rating: detectedOpp(),
    speed: S.speed
  });
  const shouldHumanizeWithMaia = () => {
    const automatic = autoOpponentConfig();
    return automatic.active ? automatic.maiaElo != null : S.humanizeWithMaia;
  };
  const maiaElo = () => {
    const automatic = autoOpponentConfig();
    if (automatic.active) return automatic.maiaElo;
    return S.maiaRatingMode === "manual" ? +S.maiaElo : oppElo();
  };
  const effectiveMaiaElo = () => {
    const rating = maiaElo();
    return rating == null || !Number.isFinite(rating) ? null : Math.max(400, Math.min(3000, rating));
  };

  // ================= repetition =================
  const START_KEY = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq";
  function trackHistory(s) {
    if (s.fen === lastHistFen) return;
    const k = C.key(s.fen);
    if (k === START_KEY || s.full < lastFull) { seen = {}; prevScore = null; modeFeature.reset(); acc = { n: 0, t1: 0, t3: 0 }; pre = null; myTrap = null; threat = null; hist = { start: null, plies: [] }; evalLog.clear(); }
    lastHistFen = s.fen; lastFull = s.full;
    seen[k] = (seen[k] || 0) + 1;
  }
  const wouldRepeat = (fen, l) => {
    if (!S.avoidRep || !l || rootScore(l, fen) <= -150) return false;
    const nf = C.applyMove(fen, l.move); return nf ? (seen[C.key(nf)] || 0) + 1 >= 3 : false;
  };
  function chooseMove(fen, lines) {
    const ranked = [...lines].sort((a, b) => rootScore(b, fen) - rootScore(a, fen));
    const top = ranked.length ? rootScore(ranked[0], fen) : -Infinity;
    const reps = ranked.map((l) => { const nf = C.applyMove(fen, l.move); return nf ? (seen[C.key(nf)] || 0) + 1 >= 3 : false; });
    let idx = 0, swapped = false;
    if (S.avoidRep && reps[0] && top > -150) {
      const j = ranked.findIndex((l, i) => !reps[i] && rootScore(l, fen) >= top - 250);
      if (j > 0) { idx = j; swapped = true; }
    }
    return { ordered: [ranked[idx], ...ranked.filter((_, i) => i !== idx)], swapped };
  }

  const arrowFeature = self.BMArrowRenderer.create(() => ({ settings: S, state: st, response: resp, premove: pre, trap: myTrap }), C, COLORS);
  const clearArrows = arrowFeature.clear;
  const buildArrows = arrowFeature.build;
  const drawArrows = arrowFeature.draw;

  // ================= helpers =================
  const pieceLetter = (fen, sq) => { const s = C.parseFen(fen), f = sq.charCodeAt(0) - 97, r = +sq[1] - 1; const c = s.b[r] && s.b[r][f]; return c && c.toLowerCase() !== "p" ? c.toUpperCase() : ""; };
  const pieceAt = (fen, sq) => { const s = C.parseFen(fen), f = sq.charCodeAt(0) - 97, r = +sq[1] - 1; return (s.b[r] && s.b[r][f]) || null; };
  const mvTxt = (fen, u) => B.sanOf(fen, u);
  const pmSan = () => (pre && pre.pmFen ? B.sanOf(pre.pmFen, pre.move) : pre ? pre.move : "");
  // a capture is bait only if it LOOKS free (static exchange wins material) but the engine says it loses
  const looksFree = (fen, uci) => { const p0 = C.fromFen(fen), m0 = C.moveFromUci(p0, uci); return !!(m0 && m0.cap && !m0.flag && C.seeSquare(p0.b, m0.to, p0.turn, m0.from) >= 1); };
  const winPct = (cp) => Math.round(B.W(Math.max(-1500, Math.min(1500, cp))));
  const fmtScore = (sc, turn) => {
    if (Math.abs(sc) >= 9000) { const n = 10000 - Math.abs(sc), m = (sc > 0 ? 1 : -1) * (turn === "w" ? 1 : -1); return (m > 0 ? "+M" : "−M") + n; }
    const c = (turn === "w" ? sc : -sc) / 100; return (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c).toFixed(2);
  };
  const fmtEval = (ln, turn) => (ln ? fmtScore(score(ln), turn) : "—");
  const askP = (req) => new Promise((res) => ask(req, res));
  const speak = (t) => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.replace(/→/g, " to ")); u.rate = 1.15; speechSynthesis.speak(u); } catch (_) {} };

  // ================= game history + live move rating =================
  function trackPlies(fen) {
    const k = C.key(fen);
    if (!hist.start) { hist.start = fen; return; }
    const last = hist.plies.length ? hist.plies[hist.plies.length - 1].fenAfter : hist.start;
    if (C.key(last) === k) return;
    const p = C.fromFen(last), legal = C.legalMoves(p);
    for (const m of legal) { const q = C.makeMove(p, m), qf = C.toFenP(q); if (C.key(qf) === k) { hist.plies.push({ uci: C.uciOf(m), san: C.toSan(p, m, legal), fenBefore: last, fenAfter: fen, mover: p.turn, cap: m.cap, to: m.to }); return; } }
    for (const m of legal) {                                   // a position was skipped (two plies between polls)
      const q = C.makeMove(p, m), l2 = C.legalMoves(q);
      for (const m2 of l2) if (C.key(C.toFenP(C.makeMove(q, m2))) === k) {
        const f1 = C.toFenP(q);
        hist.plies.push({ uci: C.uciOf(m), san: C.toSan(p, m, legal), fenBefore: last, fenAfter: f1, mover: p.turn, cap: m.cap, to: m.to });
        hist.plies.push({ uci: C.uciOf(m2), san: C.toSan(q, m2, l2), fenBefore: f1, fenAfter: fen, mover: q.turn, cap: m2.cap, to: m2.to }); return;
      }
    }
    hist = { start: fen, plies: [] };                          // unknown jump: start a new baseline
  }
  function recordEval(fen, lines) {
    if (!lines || !lines.length) return;
    const sorted = [...lines].sort((a, z) => rootScore(z, fen) - rootScore(a, fen));
    evalLog.set(C.key(fen), { fen, lines: sorted, top: sorted[0] });
    judgePly(fen);
  }
  function judgePly(fen) {
    const ply = hist.plies[hist.plies.length - 1];
    if (!ply || C.key(ply.fenAfter) !== C.key(fen)) return;
    const before = evalLog.get(C.key(ply.fenBefore)), after = evalLog.get(C.key(fen));
    if (!before || !after || (before.top.depth || 0) < 8 || (after.top.depth || 0) < 8) return;
    const wBest = B.W(score(before.top)), playedLine = before.lines.find((l) => l.move === ply.uci);
    const sPlayed = playedLine ? score(playedLine) : -score(after.top), isBest = before.top.move === ply.uci, prev = hist.plies[hist.plies.length - 2];
    const c = B.classify({ legalCount: C.legalMoves(C.fromFen(ply.fenBefore)).length, wBest, wPlayed: B.W(sPlayed), isBest,
      gapSecond: isBest && before.lines[1] ? wBest - B.W(score(before.lines[1])) : null, sac: false,
      recapture: !!(prev && prev.cap && ply.cap && prev.to === ply.to), prevOppLoss: prev && prev.j ? prev.j.loss : 0 });
    ply.j = { cls: c.cls, loss: c.loss, acc: B.accuracy(c.loss), wa: B.W(sPlayed), bestUci: before.top.move, bestSan: before.top.move ? B.sanOf(ply.fenBefore, before.top.move) : null };
    compose();
  }

  // ================= signals: short facts, no sentences =================
  const lossText = (fen, pv, diffCp) => { const o = B.pvOutcome(fen, pv, 6); return o.delta <= -1 ? B.gainText(-o.delta) : (diffCp / 100).toFixed(1) + " pawns"; };
  function compose() {}                                    // signals are derived at render time
  const ico = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const SIGI = {
    mate: ico('<circle cx="8" cy="8" r="5.2"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>'),
    check: ico('<path d="M8 2 14 13H2z"/><path d="M8 6.4v3"/><circle cx="8" cy="11.2" r=".4" fill="currentColor"/>'),
    threat: ico('<path d="M9 1.8 3.6 9h4l-1 5.2L12.4 7H8.4z" fill="currentColor" stroke="none"/>'),
    avoid: ico('<circle cx="8" cy="8" r="5.4"/><path d="m4.3 11.7 7.4-7.4"/>'),
    win: ico('<path d="M8 12.5V3.5M4.2 7.2 8 3.4l3.8 3.8"/>'),
    only: ico('<circle cx="8" cy="8" r="5.4"/><path d="M8 5v6"/>'),
    loose: ico('<circle cx="8" cy="8" r="5.2" stroke-dasharray="2.2 2.6"/>')
  };
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function buildSignals() {
    const out = [];
    if (!st || !S.enabled) return out;
    const fen = st.fen, p = C.fromFen(fen), mineTurn = st.turn === st.me, legal = C.legalMoves(p);
    const add = (tone, icon, text, tip) => out.push({ tone, icon, text, tip: tip || "" });
    if (!legal.length) { add(C.inCheck(p) ? "bad" : "", "mate", C.inCheck(p) ? "Checkmate" : "Stalemate"); return out; }
    if (mineTurn) {
      if (!resp) return out;
      const top = resp.top, last = hist.plies[hist.plies.length - 1];
      if (top.mate != null && top.mate > 0) add("good", "mate", `Mate in ${top.mate}`, B.fmtLine(fen, top.pv, top.mate * 2));
      else if (top.mate != null && top.mate < 0) add("bad", "threat", `Mated in ${-top.mate}`, `Best defence: ${B.fmtLine(fen, top.pv, 4)}`);
      if (C.inCheck(p)) add("warn", "check", "Check", `Legal replies: ${legal.slice(0, 6).map((m) => C.toSan(p, m, legal)).join(", ")}`);
      if (myTrap) add("bad", "avoid", `Avoid ${B.sanOf(fen, myTrap.bad)}`, `${myTrap.line} loses ${myTrap.lossText}`);
      if (threat) add(threat.mate ? "bad" : "warn", "threat", `Threat ${threat.san}`, threat.mate ? `Leads to mate in ${threat.mate}` : threat.delta >= 1 ? `Wins ${B.gainText(threat.delta)}: ${threat.line}` : `Swings the evaluation by ${(threat.swing / 100).toFixed(1)}`);
      if (out.length && out[0].icon === "mate") return out.slice(0, 3);                 // a mate line says everything
      const out2 = B.pvOutcome(fen, top.pv, 8);
      if (last && last.mover !== st.me && last.j && ["mistake", "blunder", "miss"].includes(last.j.cls)) add("good", "win", `Their ${B.CLASSES[last.j.cls].label.toLowerCase()}`, `${last.san} gave up ${Math.round(last.j.loss)}% win chance`);
      else if (out2.delta >= 1) add("good", "win", `Wins ${B.gainText(out2.delta)}`, B.fmtLine(fen, top.pv, 5));
      const ls = [...resp.raw].sort((a, z) => rootScore(z, fen) - rootScore(a, fen));
      if (ls.length > 1 && B.W(score(ls[0])) - B.W(score(ls[1])) >= 12) add("warn", "only", "Only move", `Every other move gives up ${Math.round(B.W(score(ls[0])) - B.W(score(ls[1])))}%+ win chance`);
      const mine = C.loosePieces(p, st.me), his = C.loosePieces(p, st.me === "w" ? "b" : "w");
      if (mine.length) add("warn", "loose", `${cap1(C.pieceName(mine[0].piece))} ${mine[0].sq} loose`, `Can be won (${B.gainText(Math.round(mine[0].win))})`);
      else if (his.length) add("good", "loose", `Their ${C.pieceName(his[0].piece)} ${his[0].sq} loose`, `Worth ${B.gainText(Math.round(his[0].win))}`);
    } else if (pre && pre.fen === fen && pre.trap) add("bad", "avoid", `Avoid ${pre.trap.badSan || pre.trap.bad.slice(2, 4)}`, `After ${B.sanOf(pre.fen, pre.trap.after)}: ${pre.trap.line} loses ${pre.trap.lossText}`);
    return out.slice(0, 3);
  }

  async function trapCheckMine(asked, r) {
    const caps = C.captures(asked); if (!caps.length) return;
    const t = await askP({ fen: asked, movetime: 180, elo: 3200, multipv: Math.min(4, caps.length), searchmoves: caps });
    if (asked !== lastFen || t.error || !t.lines) return;
    const best = rootScore(r.top, asked);
    for (const l of t.lines) {
      if (l.move === r.move) continue;
      const diff = best - rootScore(l, asked);
      if (diff >= 200 && looksFree(asked, l.move)) {
        const v = pieceAt(asked, l.move.slice(2, 4));
        myTrap = { bad: l.move, loss: diff, victim: v ? C.pieceName(v) : "pawn", line: B.fmtLine(asked, l.pv, 3), lossText: lossText(asked, l.pv, diff) };
        return compose();
      }
    }
  }
  async function threatCheck(asked, r) {            // "what if he got a free move?" → null-move search
    const nf = B.nullFen(asked); if (!nf) return;
    const t = await askP({ fen: nf, movetime: Math.max(90, budget().quick), elo: 3200, multipv: 1 });
    if (asked !== lastFen || t.error || !t.lines || !t.lines[0].move) return;
    const l = t.lines[0], swing = score(l) + score(r.top), o = B.pvOutcome(nf, l.pv, 8);
    if ((o.delta >= 1 && swing >= 100) || swing >= 300 || (l.mate != null && l.mate > 0 && l.mate <= 3)) {
      threat = { uci: l.move, san: B.sanOf(nf, l.move), delta: o.delta, mate: l.mate != null && l.mate > 0 ? l.mate : null, swing, line: B.fmtLine(nf, l.pv, 4) };
      compose();
    }
  }

  // ================= opponent model + premove advisor =================
  const premoveActive = () => S.premove === "always" || (S.premove === "auto" && (mode.cls === "bullet" || mode.cls === "blitz"));
  async function oppQuick(asked) {                  // keeps his position rated even when premove advice is off
    const ep = ++preEpoch; const r = await askP({ fen: asked, movetime: Math.max(100, budget().quick), elo: 3200, multipv: 2 });
    if (ep !== preEpoch || asked !== lastFen || r.error) return;
    recordEval(asked, r.lines);
  }
  async function runPremove(asked) {
    const ep = ++preEpoch, alive = () => ep === preEpoch && asked === lastFen;
    const b = budget(), q = Math.max(60, b.quick), elo = oppElo();
    if (elo == null) {
      pre = { fen: asked, state: "unrated", oppElo: null, cands: [] };
      compose();
      return;
    }
    pre = { fen: asked, state: "thinking", oppElo: elo, cands: null };
    const r0 = await askP({ fen: asked, movetime: Math.max(q, 110), elo: 3200, multipv: 4 });
    if (!alive()) return;
    if (r0.error) { if (r0.error === "nomove") pre = { fen: asked, state: "none", oppElo: elo, cands: [] }; else if (r0.error !== "superseded") { status = "err"; engineMsg = r0.error; } return; }
    recordEval(asked, r0.lines);
    const T = Math.max(55, Math.min(260, 260 - (elo - 800) * 0.095));
    const clampS = (l) => Math.max(-1500, Math.min(1500, rootScore(l, asked)));
    const sorted = [...r0.lines].sort((a, z) => rootScore(z, asked) - rootScore(a, asked)), topS = clampS(sorted[0]);
    const w = sorted.map((l) => Math.exp((clampS(l) - topS) / T)), tot = w.reduce((a, c) => a + c, 0);
    const all = sorted.map((l, i) => ({ move: l.move, p: w[i] / tot, score: score(l), pv: l.pv }));
    const keep = []; let mass = 0; for (const c of all) { keep.push(c); mass += c.p; if (mass >= 0.85 || keep.length === 3) break; }
    pre = { fen: asked, state: "thinking", oppElo: elo, cands: keep };
    compose();
    for (const c of keep) {
      const f2 = C.applyMove(asked, c.move); if (!f2) continue;
      const r = await askP({ fen: f2, movetime: q, elo: 3200, multipv: 2 });
      if (!alive()) return;
      if (r.error || !r.lines || !r.lines.length) continue;
      c.fen2 = f2; c.reply = r.lines[0];
    }
    const valid = keep.filter((c) => c.reply);
    if (!valid.length) { pre = { ...pre, state: "none" }; return finishPre(asked); }
    const groups = {};
    for (const c of valid) {
      const from = c.reply.move.slice(0, 2), mineNow = pieceAt(asked, from);
      const usable = mineNow && (st.me === "w" ? mineNow === mineNow.toUpperCase() : mineNow === mineNow.toLowerCase()) && pieceAt(c.fen2, from) === mineNow;
      if (usable) groups[c.reply.move] = (groups[c.reply.move] || 0) + c.p;
    }
    const ranked = Object.entries(groups).sort((a, z) => z[1] - a[1]);
    const rel = elo >= 2200 ? 0.95 : elo >= 1600 ? 0.88 : 0.8;
    const conf = ranked.length ? Math.round(100 * ranked[0][1] * rel) : 0, safe = ranked.length && conf >= 60;
    pre = { ...pre, move: safe ? ranked[0][0] : null, pmFen: safe ? (valid.find((c) => c.reply.move === ranked[0][0]) || {}).fen2 : null, conf, state: safe ? "safe" : "none" };
    const c1 = valid[0], caps = C.captures(c1.fen2);
    if (caps.length) {
      const t = await askP({ fen: c1.fen2, movetime: 150, elo: 3200, multipv: Math.min(4, caps.length), searchmoves: caps });
      if (!alive()) return;
      if (!t.error && t.lines) {
        const best = score(c1.reply);
        for (const l of t.lines) {
          if (l.move === c1.reply.move) continue;
          const diff = best - score(l);
          if (diff >= 200 && looksFree(c1.fen2, l.move)) { const v = pieceAt(c1.fen2, l.move.slice(2, 4)); pre = { ...pre, trap: { after: c1.move, bad: l.move, badSan: B.sanOf(c1.fen2, l.move), loss: diff, victim: v ? C.pieceName(v) : "pawn", p: c1.p, line: B.fmtLine(c1.fen2, l.pv, 3), lossText: lossText(c1.fen2, l.pv, diff) }, state: safe ? "trapsafe" : "trap" }; break; }
        }
      }
    }
    finishPre(asked);
  }
  function finishPre(asked) { if (asked === lastFen && pre) compose(); }
  function scorePrediction(prevFen, newFen) {
    if (!pre || pre.fen !== prevFen || !pre.cands || !pre.cands.length) return;
    const k = C.key(newFen); if (k === C.key(prevFen)) return;
    acc.n++;
    const i = pre.cands.findIndex((c) => { const nf = C.applyMove(prevFen, c.move); return nf && C.key(nf) === k; });
    if (i === 0) { acc.t1++; acc.t3++; } else if (i > 0) acc.t3++;
  }

  // ================= engine requests (quick answer first, then refine) =================
  const ask = self.BMEngineClient.ask;
  function budget() {
    const automatic = autoOpponentConfig();
    if (automatic.active) return { quick: 100, deep: automatic.moveTime };
    const m = { bullet: [60, 200], blitz: [80, 450], rapid: [110, 1000], classical: [130, 1600], daily: [150, 2500], bot: [90, 500], analysis: [120, 1200], puzzle: [100, 700], unknown: [90, 500] }[mode.cls] || [90, 500];
    const k = { turbo: 0.5, auto: 1, deep: 3 }[S.speed] || 1;
    return { quick: m[0], deep: Math.round(m[1] * k) };
  }
  function analyze(asked) {           // show a quick move first, then refine it without leaving the panel blank
    const automatic = autoOpponentConfig();
    const b = budget(), t0 = performance.now();
    const mp = S.liveEngine === "maia" ? Math.max(1, S.lines) : automatic.active ? automatic.multipv : shouldHumanizeWithMaia() ? 4 : Math.max(2, S.lines);
    const fail = (r, isFinal) => {
      if (r.error === "superseded") return true;
      if (r.error === "nomove") { status = "over"; return true; }
      if (r.error) {
        // Keep a usable quick answer if only the deeper refinement failed.
        if (isFinal && resp && resp.fen === asked && !resp.final) {
          resp.final = true; resp.refineError = true; status = "ok"; compose(); return true;
        }
        status = "err"; engineMsg = r.error; retryAt = Date.now() + 1500 * (1 + errRuns); return true;
      }
      errRuns = 0; return false;
    };
    const run = (n, isRetry, movetime, isFinal) => ask({
      fen: asked, movetime, elo: automatic.active ? automatic.engineElo : S.elo, multipv: n
    }, (r) => {
      if (asked !== lastFen) return;
      if (fail(r, isFinal)) return;
      r.ms = Math.round(performance.now() - t0);
      if (!isRetry && S.avoidRep && r.lines.length < mp && r.lines[0] && wouldRepeat(asked, r.lines[0])) {
        return run(mp, true, movetime, isFinal);
      }
      onResult(asked, r, isFinal);
      if (!isFinal && asked === lastFen) run(mp, false, b.deep, true);
    });
    run(mp, false, b.quick, false);
  }
  function predictWithMaia(asked, stockfishResp) {
    const request = ++maiaRequest;
    const rating = effectiveMaiaElo() ?? 1500;
    const stockfishMove = stockfishResp.stockfishMove || stockfishResp.move;
    stockfishResp.stockfishMove = stockfishMove;
    stockfishResp.move = stockfishMove;
    stockfishResp.humanized = false;
    stockfishResp.maiaMode = true;
    maiaResp = null;
    maiaStatus = "loading";
    compose();
    askP({ type: "maia-analyze", fen: asked, targetElo: rating }).then((result) => {
      if (request !== maiaRequest || resp !== stockfishResp || asked !== lastFen || S.liveEngine !== "maia") return;
      if (!result || result.error || !result.move) {
        maiaStatus = result?.error || "Maia could not find a move.";
        stockfishResp.move = stockfishMove;
        stockfishResp.humanized = false;
        stockfishResp.maiaMode = false;
      } else {
        maiaResp = result;
        maiaStatus = "ready";
        stockfishResp.move = result.move;
        stockfishResp.humanized = true;
        stockfishResp.humanProbability = result.moves?.[0]?.probability ?? null;
        stockfishResp.humanCandidateCount = result.moves?.length ?? 0;
        if (S.autoPlay) autoPlayFeature.play(stockfishResp.move, asked);
      }
      compose();
    });
  }
  function humanizeMove(asked, stockfishResp) {
    const request = ++maiaRequest;
    const requestedRating = maiaElo();
    const stockfishMove = stockfishResp.stockfishMove || stockfishResp.move;
    stockfishResp.stockfishMove = stockfishMove;
    if (!shouldHumanizeWithMaia() || !stockfishResp.final || asked !== lastFen) return;
    if (requestedRating == null || !Number.isFinite(requestedRating)) {
      stockfishResp.move = stockfishMove;
      stockfishResp.humanized = false;
      maiaResp = null;
      maiaStatus = "Opponent rating not found. Choose \"Pick a level\" to set one.";
      compose();
      return;
    }
    const rating = effectiveMaiaElo();
    if (rating == null) {
      stockfishResp.move = stockfishMove;
      stockfishResp.humanized = false;
      maiaResp = null;
      maiaStatus = `Human-like moves cover ratings 1100–1900 (this one is ${requestedRating}). Showing the engine's best move.`;
      compose();
      return;
    }

    const candidateLines = stockfishResp.lines.filter((line) =>
      !stockfishResp.swapped || !wouldRepeat(asked, line)
    );
    const candidates = (candidateLines.length ? candidateLines : stockfishResp.lines)
      .map((line) => ({ move: line.move, quality: score(line) }));
    if (!candidates.length) return;

    stockfishResp.move = stockfishMove;
    stockfishResp.humanized = false;
    maiaResp = null;
    maiaStatus = "loading";
    compose();
    const automatic = autoOpponentConfig();
    const maxLoss = automatic.active ? automatic.maiaMaxLoss : Math.max(0, Math.min(300, Number(S.maiaMaxLoss) || 0));
    askP({
      type: "maia-analyze",
      fen: asked,
      targetElo: rating,
      candidates,
      maxLoss,
      sample: !!(automatic.active || S.autoPlay)
    }).then((result) => {
      if (request !== maiaRequest || resp !== stockfishResp || asked !== lastFen ||
          !shouldHumanizeWithMaia() || rating !== effectiveMaiaElo()) return;
      if (result && result.error) {
        maiaResp = null;
        maiaStatus = result.error;
        stockfishResp.move = stockfishMove;
        stockfishResp.humanized = false;
      } else {
        const chosen = candidates.find((candidate) => candidate.move === result?.move);
        if (!chosen) {
          maiaStatus = "No human-like move fit. Showing the engine's best move.";
          stockfishResp.move = stockfishMove;
          stockfishResp.humanized = false;
        } else {
          maiaResp = result;
          maiaStatus = "ready";
          stockfishResp.move = chosen.move;
          stockfishResp.humanized = true;
          stockfishResp.humanProbability = result.probability;
          stockfishResp.humanCandidateCount = result.candidateCount;
          const chosenLine = stockfishResp.lines.find((line) => line.move === chosen.move);
          if (chosenLine) stockfishResp.lines = [chosenLine, ...stockfishResp.lines.filter((line) => line !== chosenLine)];
        }
      }
      if (stockfishResp.final) autoPlayFeature.play(stockfishResp.move, asked);
      compose();
    });
  }
  function onResult(asked, r, final) {
    const top = [...r.lines].sort((a, b) => rootScore(b, asked) - rootScore(a, asked))[0];
    const ch = chooseMove(asked, r.lines);
    if (final) prevScore = score(top);
    resp = { fen: asked, move: ch.ordered[0].move, stockfishMove: ch.ordered[0].move, lines: ch.ordered, raw: r.lines, top, swapped: ch.swapped, final, ms: r.ms };
    status = "ok";
    if (final && S.liveEngine === "maia") predictWithMaia(asked, resp);
    else if (final && shouldHumanizeWithMaia()) humanizeMove(asked, resp);
    else if (final) autoPlayFeature.play(resp.move, asked);
    if (final) recordEval(asked, r.lines);
    compose();
    if (final && top.mate == null) (async () => {            // one engine request at a time
      await trapCheckMine(asked, resp);
      if (asked === lastFen) await threatCheck(asked, resp);
    })();
  }

  // ================= UI =================
  const ICON = {
    bullet: '<svg viewBox="0 0 16 16"><path d="M8 1.2c1.9 0 3.1 2 3.1 4.4V10H4.9V5.6c0-2.4 1.2-4.4 3.1-4.4z"/><rect x="4.4" y="11" width="7.2" height="3.4" rx="1.1"/></svg>',
    blitz: '<svg viewBox="0 0 16 16"><path d="M9.2.8 3 9h4.1l-1 6.2L13 6.7H8.8z"/></svg>',
    rapid: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 9V6M6 1.6h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    daily: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M3.3 12.7l1.2-1.2M11.5 4.5l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    bot: '<svg viewBox="0 0 16 16"><rect x="2.4" y="5.2" width="11.2" height="8.2" rx="2.2"/><circle cx="6" cy="9.2" r="1.2" fill="#000" fill-opacity=".5"/><circle cx="10" cy="9.2" r="1.2" fill="#000" fill-opacity=".5"/><path d="M8 5.2V2.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="2.1" r="1.1"/></svg>',
    analysis: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 10.5 14 14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    puzzle: '<svg viewBox="0 0 16 16"><path d="m8 1.3 2 4 4.4.6-3.2 3.1.8 4.4L8 11.2 4 13.4l.8-4.4L1.6 5.9 6 5.3z"/></svg>',
    unknown: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.8"/><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/></svg>'
  };
  ICON.classical = ICON.rapid;
  const MODE = {
    bullet: ["Bullet", "#ffb340"], blitz: ["Blitz", "#ffd60a"], rapid: ["Rapid", "#32d74b"], classical: ["Classical", "#64d2ff"],
    daily: ["Daily", "#ff9f0a"], bot: ["vs Computer", "#5ac8fa"], analysis: ["Analysis", "#bf5af2"], puzzle: ["Puzzle", "#ff6482"], unknown: ["Live game", ""]
  };
  const I = {
    min: '<svg viewBox="0 0 16 16"><path d="M3.5 6.5 8 11l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spk: '<svg viewBox="0 0 16 16"><path d="M2.5 6v4h2.6L9 13V3L5.1 6z" fill="currentColor"/><path class="w" d="M11 5.5a3.6 3.6 0 0 1 0 5M12.8 3.6a6.3 6.3 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    arr: '<svg viewBox="0 0 24 24"><path d="M5 12h14m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    logo: '<svg viewBox="0 0 24 24"><path d="M6 18 17 7m0 0H9.5M17 7v7.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="m3.5 3.5 9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  I.eye = '<svg viewBox="0 0 16 16"><path d="M1.4 8S3.8 3.4 8 3.4 14.6 8 14.6 8 12.2 12.6 8 12.6 1.4 8 1.4 8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.1" fill="currentColor"/></svg>';
  I.eyeoff = '<svg viewBox="0 0 16 16"><path d="M1.4 8S3.8 3.4 8 3.4 14.6 8 14.6 8 12.2 12.6 8 12.6 1.4 8 1.4 8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity=".55"/><path d="M2.6 13.4 13.4 2.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  I.pwr = '<svg viewBox="0 0 16 16"><path d="M8 1.9v5.3M4.5 4.3a5.1 5.1 0 1 0 7 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const host = document.createElement("div"); host.setAttribute("data-bm-host", "1");
  // Hidden until the stylesheet has loaded: otherwise the unstyled panel (giant icons/arrows) flashes over the page.
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;visibility:hidden;display:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>svg{max-width:24px;max-height:24px}</style><link rel="stylesheet" href="${chrome.runtime.getURL("features/panel.css")}">${self.BMPanelTemplate.render(I)}`;
  document.documentElement.appendChild(host);
  { const link = root.querySelector("link"); let shown = false;
    const reveal = () => { if (shown) return; shown = true; root.querySelector("style").remove(); host.style.visibility = ""; };
    link.addEventListener("load", reveal); link.addEventListener("error", reveal); setTimeout(reveal, 2500); }
  const $ = (id) => root.getElementById(id);
  const card = $("card");
  card.addEventListener("pointermove", (e) => { const r = card.getBoundingClientRect(); card.style.setProperty("--lx", e.clientX - r.left + "px"); card.style.setProperty("--ly", e.clientY - r.top + "px"); card.style.setProperty("--ang", (Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) * 180 / Math.PI + 90).toFixed(0) + "deg"); });
  card.addEventListener("pointerleave", () => { card.style.removeProperty("--lx"); card.style.removeProperty("--ly"); card.style.removeProperty("--ang"); });

  const setTab = (t) => {
    root.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.t === t));
    $("tabs").style.setProperty("--i", { a: 0, r: 1, s: 2 }[t]);
    ["a", "r", "s"].forEach((k) => $("tab-" + k).classList.toggle("on", t === k));
  };
  root.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
  // Look & feel: saved settings only (no default skin flashes first). Effects follow the same settings.
  const fxLive = self.BMFxLive.create(getBoard);
  cleanups.push(() => fxLive.destroy());
  const applyLook2 = (settings) => {
    self.BMCustomization.applyLive(settings).catch((error) => console.warn("Best Move: look not applied —", error.message));
    fxLive.apply(settings);
  };
  self.BMCustomization.load().then(applyLook2).catch((error) => console.error(`Could not load board customization: ${error.message}`));
  cleanups.push(self.BMCustomization.watch(applyLook2));
  Object.entries(COLORS).forEach(([k, v]) => { const d = document.createElement("div"); d.className = "dot"; d.dataset.k = k; d.style.background = `rgb(${v})`; d.onclick = () => save({ color: k }); $("sw").appendChild(d); });
  root.querySelectorAll("input[type=checkbox][data-key]").forEach((i) => (i.onchange = () => {
    // Touching the human-like switch takes manual control: "Match the bot's level" would otherwise keep overriding it and lock the settings.
    if (i.dataset.key === "humanizeWithMaia" && !i.checked) { recentOff = true; setTimeout(() => { recentOff = false; syncUI(); }, 12000); }
    if (i.dataset.key === "humanizeWithMaia" && S.autoOpponent) save({ humanizeWithMaia: i.checked, autoOpponent: false });
    else save({ [i.dataset.key]: i.checked });
  }));
  root.querySelectorAll(".seg[data-key]").forEach((g) => (g.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; save({ [g.dataset.key]: isNaN(b.dataset.v) ? b.dataset.v : +b.dataset.v }); }));
  const setRatingInput = (element, key, extra = {}) => {
    element.addEventListener("change", () => {
      if (element.value.trim() === "") { syncUI(); return; }
      const parsed = Number(element.value);
      if (!Number.isFinite(parsed)) { syncUI(); return; }
      const rating = Math.max(100, Math.min(3200, Math.round(parsed)));
      element.value = String(rating);
      save({ ...extra, [key]: rating });
    });
  };
  setRatingInput($("elo"), "elo");
  $("glass").oninput = (e) => save({ glass: +e.target.value });
  $("oppE").oninput = (e) => save({ oppElo: +e.target.value, oppMode: "manual" });
  setRatingInput($("maiaElo"), "maiaElo", { maiaRatingMode: "manual" });
  $("liveEngineSelect").onchange = (e) => save({ liveEngine: e.target.value === "maia" ? "maia" : "stockfish" });
  const setDelayInput = (element, key, related) => {
    element.addEventListener("change", () => {
      if (element.value.trim() === "") { syncUI(); return; }
      const parsed = Number(element.value);
      if (!Number.isFinite(parsed)) { syncUI(); return; }
      const value = Math.max(0, Math.min(10000, Math.round(parsed)));
      const patch = { [key]: value };
      if (related === "min") patch.autoPlayDelayMax = Math.max(value, Number(S.autoPlayDelayMax) || 0);
      if (related === "max") patch.autoPlayDelayMin = Math.min(value, Number(S.autoPlayDelayMin) || 0);
      element.value = String(value); save(patch);
    });
  };
  setDelayInput($("autoPlayDelay"), "autoPlayDelay");
  setDelayInput($("autoPlayDelayMin"), "autoPlayDelayMin", "min");
  setDelayInput($("autoPlayDelayMax"), "autoPlayDelayMax", "max");
  setRatingInput($("liveMaiaElo"), "maiaElo", { maiaRatingMode: "manual" });
  setRatingInput($("liveEngineElo"), "elo");
  
  $("min").onclick = () => save({ collapsed: !S.collapsed });
  $("closePanel").onclick = () => {
    // Hide the existing panel without destroying it; Alt+B can show it again.
    host.style.display = "none";
  };
  $("bPeek").onclick = () => save({ peek: !S.peek });
  $("bPower").onclick = () => save({ enabled: !S.enabled });
  const openAnalysis = (withGame) => { try { chrome.runtime.sendMessage({ type: "openAnalysis", payload: withGame && hist.plies.length ? { startFen: hist.start, ucis: hist.plies.map((p) => p.uci) } : null }); } catch (_) {} };
  $("openRev").onclick = () => openAnalysis(true); $("openAny").onclick = () => openAnalysis(false);
  const openStudio = () => {
    chrome.runtime.sendMessage({ type: "openCustomization" }, (response) => {
      if (chrome.runtime.lastError || response?.error) console.error(`Could not open customization: ${chrome.runtime.lastError?.message || response?.error}`);
    });
  };
  $("openCustomize").onclick = openStudio; $("openCustomize2").onclick = openStudio;
  root.addEventListener("pointermove", (e) => { const t = e.target.closest && e.target.closest(".gi"); if (!t) return; const r = t.getBoundingClientRect(); t.style.setProperty("--mx", e.clientX - r.left + "px"); t.style.setProperty("--my", e.clientY - r.top + "px"); });

  // drag, release to snap to the nearest corner
  const MARGIN = 20;
  const anchor = () => {
    host.style.left = host.style.right = host.style.top = host.style.bottom = "auto";
    const c = S.corner || "br";
    host.style[c[0] === "t" ? "top" : "bottom"] = MARGIN + "px"; host.style[c[1] === "l" ? "left" : "right"] = MARGIN + "px";
  };
  (() => {
    let sx, sy, ox, oy, drag = false;
    $("head").addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      const r = host.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; drag = true; host.dataset.drag = "1";
      host.style.transition = "none"; host.style.right = host.style.bottom = "auto"; host.style.left = ox + "px"; host.style.top = oy + "px"; e.preventDefault();
    });
    on(window, "mousemove", (e) => { if (!drag) return; host.style.left = Math.max(0, Math.min(innerWidth - 80, ox + e.clientX - sx)) + "px"; host.style.top = Math.max(0, Math.min(innerHeight - 60, oy + e.clientY - sy)) + "px"; });
    on(window, "mouseup", () => {
      if (!drag) return; drag = false;
      const r = host.getBoundingClientRect(), w = r.width, h = r.height;
      const c = (r.top + h / 2 < innerHeight / 2 ? "t" : "b") + (r.left + w / 2 < innerWidth / 2 ? "l" : "r");
      const tx = c[1] === "l" ? MARGIN : innerWidth - w - MARGIN, ty = c[0] === "t" ? MARGIN : innerHeight - h - MARGIN;
      if (!card.classList.contains("rm")) host.style.transition = "left .55s cubic-bezier(.2,.9,.25,1.12),top .55s cubic-bezier(.2,.9,.25,1.12)";
      host.style.left = tx + "px"; host.style.top = ty + "px";
      setTimeout(() => { host.style.transition = "none"; S.corner = c; delete host.dataset.drag; anchor(); }, card.classList.contains("rm") ? 0 : 580);
      save({ corner: c }, true);
    });
  })();

  let saveTimer = 0;
  function save(patch, quiet) {
    const keys = Object.keys(patch);
    S = { ...S, ...patch };
    clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { chrome.storage.local.set({ bmSettings: S }); } catch (_) {} }, 160);
    if (keys.includes("liveEngine")) { maiaRequest++; maiaResp = null; maiaStatus = ""; resp = null; status = "init"; }
    if (S.liveEngine === "maia" && keys.some((key) => ["maiaElo", "maiaRatingMode", "autoOpponent"].includes(key))) { maiaRequest++; maiaResp = null; maiaStatus = ""; lastFen = ""; }
    if (keys.includes("autoPlay") && S.autoPlay && resp && resp.final && st && st.turn === st.me &&
        (!(S.liveEngine === "maia" || shouldHumanizeWithMaia()) || maiaStatus !== "loading")) {
      autoPlayFeature.play(resp.move, resp.fen);
    }
    if (keys.includes("autoPlay") && !S.autoPlay || keys.includes("enabled") && !S.enabled) autoPlayFeature.cancel();
    if (quiet) return;
    if (keys.includes("humanizeWithMaia")) {
      if (S.liveEngine !== "maia" && shouldHumanizeWithMaia() && resp && resp.final) {
        autoPlayFeature.cancel();
        humanizeMove(lastFen, resp);
      } else {
        maiaRequest++;
        maiaResp = null;
        maiaStatus = "";
        if (resp && resp.stockfishMove) {
          resp.move = resp.stockfishMove;
          resp.humanized = false;
          autoPlayFeature.play(resp.move, resp.fen);
        }
      }
    }
    if (keys.includes("autoOpponent")) autoPlayFeature.cancel();
    if (keys.some((key) => ["maiaElo", "maiaRatingMode", "maiaMaxLoss", "autoOpponent"].includes(key))) {
      maiaRequest++;
      maiaResp = null;
      maiaStatus = "";
      if (S.liveEngine !== "maia" && shouldHumanizeWithMaia() && resp && resp.final && !keys.includes("autoOpponent")) {
        autoPlayFeature.cancel();
        humanizeMove(lastFen, resp);
      } else if (resp && resp.stockfishMove) {
        resp.move = resp.stockfishMove;
        resp.humanized = false;
        autoPlayFeature.play(resp.move, resp.fen);
      }
    }
    if (keys.some((k) => ANALYSIS_KEYS.includes(k))) { lastFen = ""; insKey = ""; }
    if (keys.includes("color") || keys.includes("lines") || keys.includes("liveEngine")) clearArrows();
    syncUI();
  }
  const mq = (q) => { try { return matchMedia(q); } catch (_) { return { matches: false, addEventListener() {}, removeEventListener() {} }; } };
  function applyLook() {
    const dark = S.theme === "dark" || (S.theme === "auto" && mq("(prefers-color-scheme: dark)").matches);
    card.classList.toggle("light", !dark); card.classList.toggle("rm", !!S.reduceMotion);
    const g = Math.max(0, Math.min(100, S.glass)) / 100, acc1 = (COLORS[S.color] || COLORS.blue).split(",").map(Number);
    let base = dark ? [18, 20, 28] : [248, 249, 252];
    let bga = 0.2 + g * 0.66, blur = 12 + g * 22, sat = 175, bri = dark ? 1.05 : 1.02;
    if (S.style === "clear") { bga = Math.max(0.2, bga * 0.62); blur = Math.max(8, blur * 0.6); sat = 140; }
    bga = Math.max(bga, dark ? 0.3 : 0.64);
    if (S.style === "tinted") { base = base.map((v, i) => Math.round(v * 0.5 + acc1[i] * 0.5)); bga = Math.min(0.94, bga + 0.14); }
    const s = card.style;
    s.setProperty("--acc", acc1.join(",")); s.setProperty("--base", base.join(","));
    s.setProperty("--bga", bga.toFixed(3)); s.setProperty("--blur", blur.toFixed(1) + "px"); s.setProperty("--sat", sat + "%"); s.setProperty("--bri", bri);
  }
  let recentOff = false;
  const ONLINE = { bullet: 1, blitz: 1, rapid: 1, classical: 1, daily: 1 };
  function syncUI() {
    applyLook();
    // Warn when the engine's top move is used without the human-like option, in online games or right after switching it off.
    $("banWarn").hidden = !(S.enabled && !shouldHumanizeWithMaia() && (recentOff || ONLINE[mode.cls]));
    card.classList.toggle("collapsed", !!S.collapsed);
    root.querySelectorAll("input[type=checkbox][data-key]").forEach((i) => (i.checked = i.dataset.key === "humanizeWithMaia" ? shouldHumanizeWithMaia() : !!S[i.dataset.key]));
    $("autoPlayFeatureCard").classList.toggle("active", !!S.autoPlay);
    $("autoPlayDelayModeLabel").textContent = S.autoPlayDelayMode === "random" ? "Random range" : "Fixed";
    $("autoPlayDelay").value = Math.max(0, Math.min(10000, Number(S.autoPlayDelay) || 0));
    $("autoPlayDelayMin").value = Math.max(0, Math.min(10000, Number(S.autoPlayDelayMin) || 0));
    $("autoPlayDelayMax").value = Math.max(0, Math.min(10000, Number(S.autoPlayDelayMax) || 0));
    $("autoPlayFixedRow").hidden = S.autoPlayDelayMode === "random";
    $("autoPlayRandomRow").hidden = S.autoPlayDelayMode !== "random";
    $("autoOpponentFeatureCard").classList.toggle("active", !!S.autoOpponent);
    const automatic = autoOpponentConfig();
    $("humanizeFeatureCard").classList.toggle("active", !!S.humanizeWithMaia || S.liveEngine === "maia" || (automatic.active && automatic.maiaElo != null));
    root.querySelectorAll(".seg[data-key]").forEach((g) => {
      const bs = [...g.querySelectorAll("button")]; let idx = bs.findIndex((b) => b.dataset.v === String(S[g.dataset.key])); if (idx < 0) idx = 0;
      bs.forEach((b, i) => b.classList.toggle("on", i === idx)); g.style.setProperty("--n", bs.length); g.style.setProperty("--i", idx);
    });
    $("elo").value = S.elo;
    $("liveEngineSelect").value = S.liveEngine === "maia" ? "maia" : "stockfish";
    $("liveEngineName").textContent = S.liveEngine === "maia" ? "Maia" : "Stockfish 19";
    $("liveEngineDesc").textContent = S.liveEngine === "maia" ? "Maia move prediction · Stockfish evaluation" : "Local Stockfish analysis";
    $("liveMaiaLevelRow").hidden = S.liveEngine !== "maia";
    $("liveMaiaElo").value = Math.max(100, Math.min(3200, S.maiaElo));
    $("liveMaiaElo").disabled = automatic.active;
    $("liveMaiaEloLabel").textContent = automatic.active && automatic.maiaElo != null ? `Bot ${automatic.maiaElo}` : S.maiaRatingMode === "auto" && maiaElo() != null ? `Opponent ${maiaElo()}` : String(Math.max(100, Math.min(3200, S.maiaElo)));
    $("liveEngineElo").value = S.elo;
    $("liveEngineEloLabel").textContent = String(Math.max(100, Math.min(3200, S.elo)));
    $("elo").disabled = automatic.active;
    $("eloL").textContent = automatic.active ? "Set automatically" : "Elo " + S.elo;
    const activeMaiaElo = maiaElo();
    const activeMaiaTarget = effectiveMaiaElo();
    $("maiaElo").value = Math.max(100, Math.min(3200, S.maiaElo)); $("maiaElo").disabled = S.maiaRatingMode !== "manual" || automatic.active;
    const maiaRatingMode = root.querySelector('.seg[data-key="maiaRatingMode"]');
    maiaRatingMode.classList.toggle("disabled", automatic.active);
    maiaRatingMode.hidden = automatic.active;
    $("maiaElo").hidden = S.maiaRatingMode !== "manual" || automatic.active;
    $("maiaEloL").textContent = automatic.active
      ? activeMaiaElo == null ? "Not available" : `Rating ${activeMaiaElo} (the bot)`
      : S.maiaRatingMode === "manual" ? `Rating ${S.maiaElo}` : activeMaiaElo == null ? "Opponent rating not found" : activeMaiaTarget == null ? "Out of range (1100–1900)" : `Rating ${activeMaiaElo} (your opponent)`;
    const modelElo = maiaModelElo(activeMaiaTarget);
    $("maiaModelLabel").textContent = modelElo == null ? "" : `Blends the nearest Maia models (~${modelElo})`;
    $("maiaMaxLoss").value = automatic.active ? 0 : S.maiaMaxLoss;
    $("maiaMaxLoss").disabled = automatic.active;
    $("maiaMaxLoss").hidden = automatic.active;
    $("maiaMaxLoss").classList.toggle("disabled", automatic.active);
    $("maiaLossL").textContent = automatic.active ? "Safe (automatic)" :
      S.maiaMaxLoss === 0 ? "Safe" : S.maiaMaxLoss < 150 ? "Balanced" : "Bold";
    $("glass").value = S.glass; $("glassL").textContent = S.glass + "%"; $("glass").style.setProperty("--p", S.glass + "%");
    const manualRatingUnavailable = automatic.active;
    $("oppModeRow").hidden = manualRatingUnavailable;
    $("oppE").value = Math.max(100, Math.min(3000, S.oppElo));
    $("oppE").style.setProperty("--p", ((Math.max(100, Math.min(3000, S.oppElo)) - 100) / 2900) * 100 + "%");
    $("oppE").disabled = S.oppMode !== "manual" || manualRatingUnavailable;
    $("oppRatingControl").hidden = S.oppMode !== "manual" || manualRatingUnavailable;
    $("oppL").textContent = S.oppMode === "manual" ? `${S.oppElo} · set by you` : oppElo() == null ? "Not found" : `${oppElo()} · found`;
    root.querySelectorAll(".dot").forEach((d) => d.classList.toggle("on", d.dataset.k === S.color));
    $("bPeek").innerHTML = S.peek ? I.eyeoff : I.eye; $("bPeek").classList.toggle("off", !!S.peek); $("bPower").classList.toggle("off", !S.enabled);
    if (!host.dataset.drag) anchor();
  }

  // ================= render (touches the DOM only when something changed) =================
  const row = (k, b, mid, small) => `<div class="cr" style="--k:${k}"><i></i><b>${b}</b>${mid}${small ? `<small>${small}</small>` : ""}</div>`;
  const REVORDER = ["brilliant", "great", "best", "excellent", "good", "inaccuracy", "mistake", "miss", "blunder"];
  function reviewView() {
    const judged=hist.plies.filter(p=>p.j),me=(st&&st.me)||lastMe,mine=judged.filter(p=>p.mover===me),opp=judged.filter(p=>p.mover!==me),flat=judged.map(p=>({mover:p.mover,acc:p.j.acc,wa:p.j.wa}));
    const accOf=color=>{if(!judged.length||!me)return "—";const v=B.gameAccuracy(flat,color);return v==null?"—":v.toFixed(1)};
    const chips=xs=>REVORDER.map(k=>{const n=xs.filter(p=>p.j.cls===k).length;return n?`<span class="chip">${B.badge(k,16)}<b>${n}</b></span>`:""}).join("");
    const total=hist.plies.length,pending=Math.max(0,total-judged.length),pct=total?Math.round(judged.length/total*100):0;
    const sum=`<div class="reviewProgress"><div><b>Move review</b><span>${judged.length} of ${total} moves evaluated</span></div><div class="progressTrack"><i style="width:${pct}%"></i></div></div><div class="cmp"><div><b>${accOf(me)}</b><span>Your accuracy</span></div><div><b>${accOf(me==="w"?"b":"w")}</b><span>Opponent accuracy</span></div></div><div class="reviewSplit"><div><span class="reviewSide">YOUR MOVES</span><div class="chips single">${chips(mine)||'<span class="none">No rated moves yet</span>'}</div></div><div><span class="reviewSide">OPPONENT</span><div class="chips single">${chips(opp)||'<span class="none">No rated moves yet</span>'}</div></div></div><div class="reviewPending">${pending?`${pending} move${pending===1?"":"s"} waiting for engine evaluation`:total?"All detected moves have been evaluated":"Move evaluations appear here as the game progresses"}</div>`;
    const mv=hist.plies.slice(-20).map((p,i)=>`<span class="mchip ${p.mover===me?"mine":"opp"}" title="${p.j?B.CLASSES[p.j.cls].label+" · "+p.j.loss.toFixed(1)+"% win chance lost":"Waiting for evaluation"}"><small>${Math.max(0,total-20)+i+1}.</small>${p.j?B.badge(p.j.cls,15):'<i class="movePending"></i>'}${p.san}</span>`).join("")||'<span class="none">No moves yet. Start a game to see live move ratings.</span>';
    const engineState=!S.enabled?"Paused":!st?"Waiting":status==="err"?"Error":!resp||!resp.final?"Thinking":"Ready",top=resp&&resp.lines?resp.lines[0]:null;
    return {sum,mv,engineState,depth:top&&top.depth?String(top.depth):"—",time:resp&&resp.ms?(resp.ms<1000?resp.ms+" ms":(resp.ms/1000).toFixed(1)+" s"):"—",lines:resp&&resp.lines?String(resp.lines.length):"—"};
  }
  let lastSig = "";
  // Cheap fingerprint of everything the UI is built from. Most 400 ms heartbeats change nothing, so we skip all view work.
  function stateKey(board) {
    let judged = 0; for (let i = 0; i < hist.plies.length; i++) if (hist.plies[i].j) judged++;
    return [board ? 1 : 0, st && st.fen, st && st.turn, st && st.me, st && st.flipped, status, idOf(S), idOf(resp), resp && resp.final, resp && resp.move, idOf(maiaResp), maiaStatus,
      idOf(pre), pre && pre.state, pre && pre.cands && pre.cands.length, pre && pre.conf, idOf(myTrap), idOf(threat), acc.n, acc.t3, mode.cls, mode.base,
      playerRatingsFeature.revision, hist.plies.length, judged, peekHeld, engineMsg].join("|");
  }
  function render() {
    const board = getBoard();
    const rkey = stateKey(board), nowT = Date.now();
    if (rkey === lastRenderKey && nowT - lastRenderAt < 2500) return;     // nothing changed (a full refresh still happens every 2.5 s as a safety net)
    lastRenderKey = rkey; lastRenderAt = nowT;
    const meta = MODE[mode.cls] || MODE.unknown;
    const v = { sig: [], modeCls: mode.cls, modeText: meta[0] + (mode.base ? " · " + fmtBase(mode.base) : ""), modeColor: meta[1], pill: ["", "Ready"], label: "Best move for you", status: "", pc: "", m1: "—", m2: "—", promo: "", kind: "play", san: "",
      ev: "—", evCls: "", wMe: null, depth: "—", ms: "—", lines: "", rows: "", pre: null, opp: "", lm: "", err: status === "err" ? engineMsg : "", det: detectedOpp() };
    const mineTurn = st && st.turn === st.me;
    v.label = mineTurn ? "Best move for you" : "Best move for opponent";
    if (!S.enabled) { v.pill = ["off", "Paused"]; v.status = "Paused"; }
    else if (!board) { v.pill = ["off", "No game"]; v.status = "Open a game to start"; }
    else if (status === "over") { v.pill = ["off", "Game over"]; v.status = "No legal moves"; }
        else if (!resp) { v.pill = status === "err" ? ["err", "Error"] : ["busy", "Analysing"]; v.status = status === "err" ? "Engine hiccup, retrying…" : "Analysing…"; }
    else {
      if ((S.liveEngine === "maia" || shouldHumanizeWithMaia()) && resp.final && maiaStatus === "loading") {
        v.pill = ["busy", "Thinking"];
        v.label = S.liveEngine === "maia" ? "Maia prediction" : "Human-like move";
        v.status = S.liveEngine === "maia" ? "Maia is analysing this position…" : "Finding a human-like move…";
      } else {
        v.pill = resp.final ? ["", "Ready"] : ["busy", "Refining"];
        v.status = (S.peek ? "Arrows hidden · hold Alt+A" : resp.maiaMode ? "Maia prediction · Stockfish evaluation" : resp.humanized ? "Human-like pick" : "Stockfish best move") + (resp.refineError ? " · deeper search unavailable" : "") +
          (resp.swapped ? " · avoiding repetition" : st && !st.real ? " · read from board" : "");
        if (resp.humanized) v.label = resp.maiaMode ? "Maia predicted move" : "Human-like move";
        v.pc = pieceLetter(resp.fen, resp.move.slice(0, 2)); v.m1 = resp.move.slice(0, 2); v.m2 = resp.move.slice(2, 4); v.promo = resp.move[4] ? "=" + resp.move[4].toUpperCase() : ""; v.san = B.sanOf(resp.fen, resp.move);
        const selectedLine = resp.lines.find((line) => line.move === resp.move) || resp.lines[0];
        const displayedLine = resp.humanized ? selectedLine : resp.top;
        v.ev = fmtEval(displayedLine, st.turn); v.depth = displayedLine.depth; v.ms = resp.ms ? (resp.ms < 1000 ? resp.ms + " ms" : (resp.ms / 1000).toFixed(1) + " s") : "—";
        const mine = score(displayedLine); v.wMe = winPct(mine); v.evCls = mine > 80 ? "good" : mine < -80 ? "bad" : "";
        const pv = selectedLine.pv, f2 = !resp.maiaMode && pv && pv[1] ? C.applyMove(resp.fen, resp.move) : null;
         if (f2) v.rows += row("var(--ex)", mvTxt(f2, pv[1]), `<span class="lab">Expected reply</span>`, "");
         v.lines = resp.maiaMode && maiaResp?.moves
           ? maiaResp.moves.slice(0, S.lines).map((m, i) => `<div class="ln c2"><em>${i + 1}</em><b>${esc(m.san || B.sanOf(resp.fen, m.uci))}</b><small>Maia move prediction</small><span>${(m.probability * 100).toFixed(1)}%</span></div>`).join("")
           : resp.lines.slice(0, S.lines).map((l, i) => `<div class="ln c2"><em>${i + 1}</em><b>${mvTxt(resp.fen, l.move)}</b><small>${B.lineSan(resp.fen, l.pv, 4).slice(1).join(" ")}</small><span>${fmtEval(l, st.turn)}</span></div>`).join("");
      }
    }
    if (st && S.enabled && board) {
      const automatic = autoOpponentConfig();
      const currentElo = automatic.active ? automatic.opponentElo : oppElo();
      const ratingLabel = currentElo == null ? "Rating not found" : currentElo;
      const ratingSource = automatic.active ? playerInfo.source : S.oppMode === "manual" ? "manual" : playerInfo.source;
      const opponentKind = playerInfo.kind === "bot" ? "Bot" : playerInfo.kind === "human" ? "Human" : "Opponent";
      v.opp = `<span>${opponentKind} <b>${ratingLabel}</b>${ratingSource ? ` · ${ratingSource}` : ""}</span>` + (acc.n ? `<span>Predicted <b>${acc.t3}/${acc.n}</b></span>` : "");
    }
    v.sig = buildSignals();
    const lp = hist.plies[hist.plies.length - 1];
    if (lp && lp.j && S.enabled && board) { const meta2 = B.CLASSES[lp.j.cls]; v.lm = `${B.badge(lp.j.cls, 18)}<span><b>${lp.mover === st?.me ? "You" : "Opponent"} played ${lp.san}</b> · ${meta2.label}${lp.j.loss >= 2 && lp.j.bestSan && lp.j.bestSan !== lp.san ? `, best was ${lp.j.bestSan}` : ""}</span>`; }
    const rv = reviewView();
    const sig = JSON.stringify(v) + S.collapsed + S.peek + S.enabled + rv.sum + rv.mv + rv.engineState + rv.depth + rv.time + rv.lines + playerRatingsFeature.revision +
      S.autoOpponent + mode.cls + S.humanizeWithMaia + S.maiaRatingMode + S.maiaElo + S.maiaMaxLoss + maiaStatus + JSON.stringify(maiaResp) +
      (resp ? resp.move + resp.humanized : "");
    if (sig === lastSig) return; lastSig = sig;
    $("mode").style.color = meta[1] || ""; $("modeIcon").innerHTML = ICON[v.modeCls] || ICON.unknown; $("modeText").textContent = v.modeText;
    $("pill").className = "st " + v.pill[0]; $("pillT").textContent = v.pill[1]; $("pill").title = v.pill[1];
    $("heroLabel").textContent = v.label; $("status").textContent = v.status; $("san").textContent = v.san;
    $("pc").textContent = v.pc; $("m1").textContent = v.m1; $("m2").textContent = v.m2; $("promo").textContent = v.promo;
    if (v.kind === "expect") $("m2").style.setProperty("--k", "var(--ex)"); else $("m2").style.removeProperty("--k");
    $("eval").textContent = v.ev; $("eval").className = "evt " + v.evCls; $("eval2").textContent = v.ev;
    $("depth").textContent = v.depth; $("ms").textContent = v.ms;
    $("wfill").style.width = (v.wMe == null ? 50 : v.wMe) + "%"; $("wMe").textContent = v.wMe == null ? "—" : v.wMe + "%"; $("wOpp").textContent = v.wMe == null ? "—" : 100 - v.wMe + "%";
    $("lm").innerHTML = v.lm;
    const automatic = autoOpponentConfig();
    const maiaEnabled = S.liveEngine === "maia" || shouldHumanizeWithMaia();
    $("autoPlayFeatureCard").classList.toggle("active", !!S.autoPlay);
    $("autoOpponentFeatureCard").classList.toggle("active", !!S.autoOpponent);
    $("humanizeFeatureCard").classList.toggle("active", !!S.humanizeWithMaia || S.liveEngine === "maia" || (automatic.active && automatic.maiaElo != null));
    $("autoOpponentStatus").textContent = mode.cls !== "bot"
      ? "Turns on automatically in computer games."
      : automatic.opponentElo == null
        ? "Bot rating not found, so the full-strength engine is used."
        : automatic.maiaElo == null
          ? `Bot rated ${automatic.opponentElo}. Engine strength is matched; human-like moves follow the bot's rating.`
          : `Bot rated ${automatic.opponentElo}. Strength and human-like moves are matched.`;
    $("autoOpponentStatus").hidden = !S.autoOpponent;
    const ratingInUse = maiaElo();
    const ratingTarget = effectiveMaiaElo();
    $("autoMaiaStatus").textContent = automatic.active && automatic.maiaElo != null
      ? "Matched to the bot"
      : S.maiaRatingMode === "auto" && ratingInUse == null
        ? "Opponent rating not found"
        : "";
    $("maiaRating").textContent = ratingInUse == null ? (S.liveEngine === "maia" ? "Using default Maia level 1500" : "No rating to match") : ratingTarget == null ? "No matching level" : `Playing like a ${ratingInUse}-rated player`;
    if (!maiaEnabled) {
      $("maiaMove").textContent = automatic.active
        ? automatic.maiaElo == null ? "Showing the engine's best move. This bot's rating is outside the human-like range." : "Ready. Moves will match this bot's level."
        : "Off. You're seeing the engine's best move.";
      $("maiaNote").textContent = "";
    } else if (!st || !board) {
      $("maiaMove").textContent = "Waiting for the game…";
      $("maiaNote").textContent = "";
    } else if (maiaStatus === "loading") {
      $("maiaMove").textContent = S.liveEngine === "maia" ? "Maia is predicting a move…" : "Picking a human-like move…";
      $("maiaNote").textContent = `Matching a player rated about ${ratingInUse}.`;
    } else if (maiaResp && maiaStatus === "ready") {
      const humanSan = maiaResp.san || B.sanOf(resp.fen, maiaResp.move);
      const stockfishSan = B.sanOf(resp.fen, resp.stockfishMove);
      $("maiaMove").textContent = S.liveEngine === "maia" ? `Maia suggests ${humanSan}` : `Play ${humanSan}`;
      $("maiaNote").textContent = (humanSan === stockfishSan ? `Also the engine's top choice. Picked from ${maiaResp.candidateCount} good moves.` : `A real player would likely choose this over the engine's top move (${stockfishSan}). Picked from ${maiaResp.candidateCount} good moves.`);
       if (S.liveEngine === "maia") $("maiaNote").textContent = `Top move probability: ${maiaResp.moves?.[0]?.probability != null ? (maiaResp.moves[0].probability * 100).toFixed(1) + "%" : "—"}. Stockfish provides the position evaluation.`;
    } else {
      $("maiaMove").textContent = maiaStatus || "Waiting for the engine…";
      $("maiaNote").textContent = "";
    }
    const pr = $("pre"); pr.classList.toggle("on", !!v.pre);
    if (v.pre) { $("preTag").textContent = v.pre.tag; $("preTag").className = "tag " + v.pre.tagCls; $("pmain").innerHTML = v.pre.main; $("pmain").style.display = "flex"; }
    $("rows").innerHTML = v.rows; $("lines").innerHTML = v.lines; $("opp").innerHTML = v.opp; $("err").textContent = v.err;
    $("sig").innerHTML = v.sig.map((g) => `<span class="sig ${g.tone}" title="${String(g.tip).replace(/"/g, "&quot;")}">${SIGI[g.icon] || ""}${g.text}</span>`).join("");
    const playerType = playerInfo.kind === "bot" ? "Bot" : playerInfo.kind === "human" ? "Human" : "Opponent";
    $("oppDet").textContent = playerInfo.status === "loading"
      ? `Checking ${playerInfo.username}…`
      : playerInfo.status === "username-unavailable" ? "Player name not visible; you can set a rating below."
        : playerInfo.rating == null
          ? playerInfo.status === "error"
            ? `Couldn't check the rating${playerInfo.error ? `: ${playerInfo.error}` : ""}.`
            : `${playerType} ${playerInfo.username}: no rating listed for this game type.`
          : `${playerType} ${playerInfo.username}: ${playerInfo.rating} rating found.`;
    $("revSum").innerHTML=rv.sum;$("revMoves").innerHTML=rv.mv;$("revEngineState").textContent=rv.engineState;$("revDepth").textContent=rv.depth;$("revTime").textContent=rv.time;$("revLines").textContent=rv.lines;$("revEngineState").className="engineState "+(rv.engineState==="Error"?"error":rv.engineState==="Thinking"?"thinking":"");
    $("miniMove").innerHTML = v.m1 === "—" ? "—" : `${v.m1}<span>→</span>${v.m2}${v.promo}`; $("miniEval").textContent = v.ev;
  }

  // ================= main loop =================
  function tick() {
    const board = getBoard();
    if (!board && reviewFeature) reviewFeature.update({ mode: { cls: "unknown" }, st: null, over: false });
    if (!board || !S.enabled) { autoPlayFeature.cancel(); clearArrows(); st = null; render(); return; }
    st = readState(board); if (st.me) lastMe = st.me;
    if (!sane(st.fen)) { resp = null; clearArrows(); render(); return; }          // never feed the engine an impossible position
    trackHistory(st); trackPlies(st.fen); detectMode(st);
    const overNow = gameIsOver(st);
    if (reviewFeature) reviewFeature.update({ mode, st, over: overNow });
    if (overNow) showGameOverAnalysis(); else if (st.full <= 1 && st.turn === "w") gameOverAnalysisShown = false;
    if (whatsNew) whatsNew.setPlaying(!!LIVE_NOW[mode.cls] && st && (st.full > 1 || st.turn === "b") && !gameIsOver(st));
    if (status === "err" && retryAt && Date.now() > retryAt && errRuns < 6 && st.fen === lastFen) { errRuns++; retryAt = 0; status = "busy"; analyze(st.fen); }
    playerRatingsFeature.update(board, st, mode);
    if (mode.cls !== "bot") autoPlayFeature.cancel();
    if (st.fen !== lastFen) {
      autoPlayFeature.cancel();
      scorePrediction(lastFen, st.fen);
      lastFen = st.fen; resp = null; myTrap = null; threat = null; clearArrows(); status = "ok"; preEpoch++;
      maiaRequest++; maiaResp = null; maiaStatus = "";
      // Recommend the engine-best move for the side to move, regardless of whose turn it is.
      // The only user-facing pause is the explicit Best Move power/disable control.
      pre = null; status = "busy"; analyze(st.fen);
      compose();
    }
    const akey = stateKey(board);
    if (akey !== lastArrowKey || !arrowFeature.element || !board.contains(arrowFeature.element)) {
      lastArrowKey = akey;
      const list = (!(S.liveEngine === "maia" || shouldHumanizeWithMaia()) || maiaStatus !== "loading") && (!S.peek || peekHeld) ? buildArrows() : [];
      if (!list.length) clearArrows();
      else { const sig = JSON.stringify(list) + st.flipped; if (!arrowFeature.element || !board.contains(arrowFeature.element) || arrowFeature.signature !== sig) drawArrows(board, st.flipped, list, sig); }
    }
    render();
  }

  // V8 shortcut handler: capture at window level so Chess.com's own keyboard handlers
  // cannot swallow Alt+B before KnightScope sees it.
  const toggleBestMove = (e) => {
    if (e.repeat || !e.altKey || String(e.key).toLowerCase() !== "b") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    host.style.visibility = "";
    host.style.display = host.style.display === "none" ? "" : "none";
  };
  on(window, "keydown", toggleBestMove, true);
  on(document, "keydown", (e) => {
    if (!e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") save({ enabled: !S.enabled });
    if (k === "m") save({ collapsed: !S.collapsed });
    if (k === "a") peekHeld = true;
  });
  on(document, "keyup", (e) => { if (e.key.toLowerCase() === "a" || e.key === "Alt") peekHeld = false; });

  window.__bm = { destroy() {
    timers.forEach(clearInterval); cleanups.forEach((f) => f());
    maiaRequest++;
    autoPlayFeature.cancel();
    try { clearArrows(); } catch (_) {} host.remove();
    try { speechSynthesis.cancel(); } catch (_) {} try { analysisPrompt && analysisPrompt.remove(); } catch (_) {} analysisPrompt=null; window.__bm = null;
  } };

  let errs = 0;
  function safeTick() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) { window.__bm && window.__bm.destroy(); return; }
      if (!host.isConnected) document.documentElement.appendChild(host);
      tick(); errs = 0;
      if (/^UI error/.test(engineMsg)) { engineMsg = ""; if (status === "err") status = "ok"; }
    } catch (e) {
      console.error("[BestMove] error", e); errs++; status = "err"; engineMsg = "UI error: " + ((e && e.message) || e);
      try { render(); } catch (_) {}
      if (errs >= 8 && (window.__bmCrash = (window.__bmCrash || 0) + 1) <= 5) setTimeout(() => window.__bmRestart && window.__bmRestart(), 0);
    }
  }
  const go = () => {
    syncUI(); render();
    // Event-driven: wake on board changes (debounced), plus a 1000 ms heartbeat for clocks, ratings and turn changes. Idle when the tab is hidden.
    let tickTimer = 0;
    const wake = (delay) => { if (tickTimer || document.hidden) return; tickTimer = setTimeout(() => { tickTimer = 0; if (!document.hidden) safeTick(); }, delay); };
    timers.push(setInterval(() => wake(0), 1000));
    let obsBoard = null;
    const boardObs = new MutationObserver(() => wake(30));
    timers.push(setInterval(() => {
      const b = getBoard();
      if (b !== obsBoard) { boardObs.disconnect(); obsBoard = b; if (b) boardObs.observe(b, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] }); wake(0); }
    }, 1000));
    const fenObs = new MutationObserver(() => wake(0));
    fenObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bm-fen", "data-bm-as"] });
    cleanups.push(() => { boardObs.disconnect(); fenObs.disconnect(); clearTimeout(tickTimer); });
    on(document, "visibilitychange", () => { if (!document.hidden) wake(0); });
    wake(0); on(window, "resize", syncUI);
    const dm = mq("(prefers-color-scheme: dark)"); on(dm, "change", applyLook);
  };
  try { chrome.storage.local.get("bmSettings", (r) => { S = { ...DEFAULTS, ...((r && r.bmSettings) || {}), avoidRep: true, reduceMotion: false, coach: true, voice: false }; S.maiaMaxLoss = [0, 100, 200].reduce((b, v) => Math.abs(v - S.maiaMaxLoss) < Math.abs(b - S.maiaMaxLoss) ? v : b, 100); go(); }); } catch (_) { go(); }
  }

  window.__bmRestart = () => boot();
  window.__bmRestartFresh = () => {
    try { sessionStorage.removeItem("bmPanelDetached"); } catch (_) {}
    try {
      chrome.storage.local.get("bmSettings", (r) => {
        const v = { ...((r && r.bmSettings) || {}), corner: "br", collapsed: false, enabled: true };
        chrome.storage.local.set({ bmSettings: v }, () => boot());
      });
    } catch (_) { boot(); }
  };
  if (!window.__bmMsg) {
    window.__bmMsg = true;
    try { chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "bm-restart") window.__bmRestartFresh(); }); } catch (_) {}
  }
  boot();
};
