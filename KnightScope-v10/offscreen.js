let worker = null, engineError = null;
let maiaWorker = null;
let maiaRequestId = 0;
const maiaResponses = new Map();
let busy = false, current = null, queued = null, timer = null;
let lines = {};
let curMultiPV = 0, curElo = -1;

let crashes = 0, lastBoot = 0, watchdog = null;
function restart() {                                   // self-heal: a crashed WebAssembly engine is replaced, the pending request is simply dropped
  try { worker && worker.terminate(); } catch (_) {}
  const c = current, q = queued; busy = false; current = null; queued = null; curMultiPV = 0; curElo = -1; clearTimeout(timer);
  if (c) c.respond({ error: "superseded" }); if (q) q.respond({ error: "superseded" });
  setTimeout(boot, 50);
}
// last resort: a search that ignores "stop" means the WebAssembly engine is wedged, so replace it
function arm(ms) { clearTimeout(watchdog); watchdog = setTimeout(() => { if (busy) restart(); }, ms); }
function boot() {
  lastBoot = Date.now(); engineError = null;
  try { worker = new Worker("bm-engine/stockfish.js"); } catch (e) { engineError = String(e); return; }
  worker.onerror = (e) => { if (++crashes > 6) { engineError = (e && e.message) || "Engine crashed"; if (current) finish(null, engineError); } else restart(); };
  worker.onmessage = onLine;
  worker.postMessage("uci");
  worker.postMessage("setoption name Hash value 64");
  worker.postMessage("isready");
}
const send = (c) => worker.postMessage(c);

function start(req) {
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
    maiaResponses.delete(data.requestId);
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
    try {
      maiaResponses.set(requestId, sendResponse);
      getMaiaWorker().postMessage({
        type: "ANALYZE",
        requestId,
        fen: msg.fen,
        targetElo: msg.targetElo,
        candidates: msg.candidates,
        maxLoss: msg.maxLoss,
        sample: !!msg.sample
      });
    } catch (error) {
      maiaResponses.delete(requestId);
      sendResponse({ error: String(error) });
    }
    return true;
  }
  if (msg.type !== "analyze") return;
  if (engineError) {                       // try to bring a dead engine back (at most every 5 s)
    if (Date.now() - lastBoot > 5000) { crashes = 0; boot(); }
    if (engineError) { sendResponse({ error: engineError }); return; }
  }
  const req = { fen: msg.fen, movetime: msg.movetime, elo: msg.elo, multipv: msg.multipv, searchmoves: msg.searchmoves, respond: sendResponse };
  if (busy) {
    if (queued) queued.respond({ error: "superseded" });
    queued = req;
    send("stop");
  } else start(req);
  return true;
});

boot();
