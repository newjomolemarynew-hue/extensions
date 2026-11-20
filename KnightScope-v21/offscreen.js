let worker = null, engineError = null;
let maiaWorker = null;
let maiaRequestId = 0;
const maiaResponses = new Map();
const maiaTimers = new Map();
const MAX_MAIA_MS = 25000;

function validFen(fen) {
  if (typeof fen !== "string" || fen.length > 128) return false;
  const p = fen.trim().split(/\s+/);
  if (p.length !== 6 || !/^[wb]$/.test(p[1]) || !/^(K?Q?k?q?|-)$/ .test(p[2]) ||
      !/^(-|[a-h][36])$/.test(p[3]) || !/^\d+$/.test(p[4]) || !/^\d+$/.test(p[5])) return false;
  const ranks = p[0].split("/");
  if (ranks.length !== 8) return false;
  return ranks.every(rank => {
    let n = 0;
    for (const c of rank) {
      if (/[1-8]/.test(c)) n += Number(c);
      else if (/[prnbqkPRNBQK]/.test(c)) n++;
      else return false;
    }
    return n === 8;
  });
}
function validUciMove(move) {
  return typeof move === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move);
}
function validSearchMoves(moves) {
  return moves == null || (Array.isArray(moves) && moves.length <= 20 && moves.every(validUciMove));
}

let busy = false, current = null, queued = null, timer = null;
let engineReady = false, bootTimer = null;
let lines = {};
let curMultiPV = 0, curElo = -1;

let crashes = 0, lastBoot = 0, watchdog = null;
function restart() {
  try { worker && worker.terminate(); } catch (_) {}
  const c = current, q = queued; busy = false; current = null; queued = null; engineReady = false;
  curMultiPV = 0; curElo = -1; clearTimeout(timer); clearTimeout(bootTimer);
  if (c) c.respond({ error: "superseded" }); if (q) q.respond({ error: "superseded" });
  setTimeout(boot, 50);
}
// last resort: a search that ignores "stop" means the WebAssembly engine is wedged, so replace it
function arm(ms) { clearTimeout(watchdog); watchdog = setTimeout(() => { if (busy) restart(); }, ms); }
function boot() {
  lastBoot = Date.now(); engineError = null; engineReady = false;
  clearTimeout(bootTimer);
  try { worker = new Worker(chrome.runtime.getURL("engine/stockfish.js")); }
  catch (e) { engineError = "Could not start Stockfish: " + String(e); return; }
  worker.onerror = (e) => {
    const message = (e && e.message) || "Stockfish worker crashed";
    if (++crashes > 6) {
      engineError = message;
      if (current) finish(null, engineError);
      if (queued) { queued.respond({ error: engineError }); queued = null; }
    } else restart();
  };
  worker.onmessage = onLine;
  bootTimer = setTimeout(() => {
    if (engineReady) return;
    engineError = "Stockfish did not finish starting (UCI handshake timeout)";
    if (queued) { queued.respond({ error: engineError }); queued = null; }
  }, 15000);
  worker.postMessage("uci");
}
const send = (c) => worker.postMessage(c);

function start(req) {
  if (!validFen(req.fen)) { req.respond({ error: "Invalid FEN position" }); return; }
  if (!validSearchMoves(req.searchmoves)) { req.respond({ error: "Invalid or excessive search-move list" }); return; }
  current = req; busy = true; lines = {};
  const elo = req.elo && req.elo < 3200 ? req.elo : 0;
  if (elo !== curElo) {
    if (elo) { send("setoption name UCI_LimitStrength value true"); send("setoption name UCI_Elo value " + elo); }
    else send("setoption name UCI_LimitStrength value false");
    curElo = elo;
  }
  const n = Math.max(1, Math.min(4, req.multipv || 1));
  if (n !== curMultiPV) { send("setoption name MultiPV value " + n); curMultiPV = n; }
  const mt = Math.max(30, Math.min(req.movetime || 500, 10000));
  send("position fen " + req.fen);
  send("go movetime " + mt + (req.searchmoves && req.searchmoves.length ? " searchmoves " + req.searchmoves.join(" ") : ""));
  clearTimeout(timer);
  timer = setTimeout(() => { if (busy) send("stop"); }, mt + 1500);
  arm(mt + 6000);
}

function finish(result, error) {
  clearTimeout(timer); clearTimeout(watchdog);
  if (!error) crashes = 0;
  const c = current, q = queued; busy = false; current = null; queued = null;
  if (c) c.respond(error ? { error } : result);          // may trigger a brand-new request right away
  if (q) { if (!busy) start(q); else q.respond({ error: "superseded" }); }   // never send commands while the engine is searching
}

function onLine(e) {
  const line = typeof e.data === "string" ? e.data : "";
  if (line === "uciok") {
    worker.postMessage("setoption name Hash value 64");
    worker.postMessage("isready");
    return;
  }
  if (line === "readyok") {
    engineReady = true; engineError = null; clearTimeout(bootTimer);
    if (!busy && queued) { const next = queued; queued = null; start(next); }
    return;
  }
  if (!current) return;
  if (line.startsWith("info") && line.includes(" pv ")) {
    if (/ (lower|upper)bound/.test(line)) return;          // only trust exact scores
    const idx = +((line.match(/ multipv (\d+)/) || [])[1] || 1);
    const d = line.match(/ depth (\d+)/), cp = line.match(/score cp (-?\d+)/), m = line.match(/score mate (-?\d+)/);
    const pv = line.split(" pv ")[1].trim().split(" ");
    lines[idx] = { move: pv[0], pv: pv.slice(0, 6), depth: d ? +d[1] : 0, cp: cp ? +cp[1] : null, mate: m ? +m[1] : null };
  } else if (line.startsWith("bestmove")) {
    const mv = line.split(" ")[1];
    if (queued) return finish(null, "superseded");
    const arr = Object.keys(lines).sort((a, b) => a - b).map((k) => lines[k]);
    if (!arr.length || !mv || mv === "(none)") return finish(null, "nomove");
    const i = arr.findIndex((l) => l.move === mv);
    if (i > 0) arr.unshift(arr.splice(i, 1)[0]);
    finish({ fen: current.fen, move: mv, lines: arr });
  }
}

function getMaiaWorker() {
  if (maiaWorker) return maiaWorker;
  maiaWorker = new Worker(chrome.runtime.getURL("features/maia-worker.js"), { type: "module" });
  maiaWorker.onmessage = ({ data }) => {
    if (data.type !== "MAIA_RESULT" && data.type !== "MAIA_ERROR") return;
    const respond = maiaResponses.get(data.requestId);
    if (!respond) return;
    maiaResponses.delete(data.requestId); clearTimeout(maiaTimers.get(data.requestId)); maiaTimers.delete(data.requestId);
    respond(data.type === "MAIA_ERROR" ? { error: data.error } : data);
  };
  maiaWorker.onerror = (event) => {
    const error = `Maia worker failed: ${event.message || "unknown error"}`;
    for (const respond of maiaResponses.values()) respond({ error });
    maiaResponses.clear();
    maiaWorker = null;
  };
  return maiaWorker;
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "maia-analyze") {
    const requestId = ++maiaRequestId;
    if (!validFen(msg.fen)) { sendResponse({ error: "Invalid FEN position" }); return; }
    const targetElo = Number.isFinite(msg.targetElo) ? Math.max(100, Math.min(3200, Math.round(msg.targetElo))) : 1500;
    try {
      maiaResponses.set(requestId, sendResponse);
      maiaTimers.set(requestId, setTimeout(() => {
        const respond = maiaResponses.get(requestId);
        if (!respond) return;
        maiaResponses.delete(requestId); maiaTimers.delete(requestId);
        respond({ error: "Maia timed out; retry with the current position" });
        try { maiaWorker && maiaWorker.terminate(); } catch (_) {}
        maiaWorker = null;
        for (const [id, fn] of maiaResponses) { clearTimeout(maiaTimers.get(id)); fn({ error: "Maia worker restarted after a timeout" }); }
        maiaResponses.clear(); maiaTimers.clear();
      }, MAX_MAIA_MS));
      getMaiaWorker().postMessage({
        type: "ANALYZE",
        requestId,
        fen: msg.fen,
        targetElo,
        candidates: msg.candidates,
        maxLoss: msg.maxLoss,
        sample: !!msg.sample
      });
    } catch (error) {
      maiaResponses.delete(requestId); clearTimeout(maiaTimers.get(requestId)); maiaTimers.delete(requestId);
      sendResponse({ error: String(error) });
    }
    return true;
  }
  if (msg.type !== "analyze") return;
  if (engineError) {                       // try to bring a dead engine back (at most every 5 s)
    if (Date.now() - lastBoot > 5000) { crashes = 0; boot(); }
    if (engineError) { sendResponse({ error: engineError }); return; }
  }
  if (!validFen(msg.fen)) { sendResponse({ error: "Invalid FEN position" }); return; }
  if (!validSearchMoves(msg.searchmoves)) { sendResponse({ error: "Invalid or excessive search-move list" }); return; }
  const req = { fen: msg.fen, movetime: msg.movetime, elo: msg.elo, multipv: msg.multipv, searchmoves: msg.searchmoves, respond: sendResponse };
  if (!engineReady) {
    if (queued) queued.respond({ error: "superseded" });
    queued = req;
    if (engineError) { req.respond({ error: engineError }); queued = null; }
    return true;
  }
  if (busy) {
    if (queued) queued.respond({ error: "superseded" });
    queued = req;
    send("stop");
  } else start(req);
  return true;
});

boot();
