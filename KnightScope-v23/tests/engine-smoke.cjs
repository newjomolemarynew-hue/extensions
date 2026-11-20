const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.env.KNIGHTSCOPE_ROOT || "KnightScope-v23");
const mime = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".css": "text/css" };
if (!fs.existsSync(path.join(root, "manifest.json"))) throw new Error("KnightScope test root not found: " + root);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.version !== "23.0.0") throw new Error("Smoke tests must run against V23; loaded " + manifest.version);
const livePanel = fs.readFileSync(path.join(root, "features/live-panel.js"), "utf8");
for (const [label, check] of [
  ["Alt+B capture registration", livePanel.includes('on(window, "keydown", toggleBestMove, true);')],
  ["Alt+B key-repeat guard", livePanel.includes("if (e.repeat || !e.altKey")],
  ["quick-first search", livePanel.includes("run(mp, false, b.quick, false)")],
  ["deep refinement", livePanel.includes("run(mp, false, b.deep, true)")],
  ["both-side recommendations", livePanel.includes("analyze(st.fen);") && !livePanel.includes("myTurnOnly: true")]
]) if (!check) throw new Error("V23 source regression: " + label);
const autoPlaySource = fs.readFileSync(path.join(root, "features/auto-play.js"), "utf8");
const livePanelSource = fs.readFileSync(path.join(root, "features/live-panel.js"), "utf8");
const panelTemplateSource = fs.readFileSync(path.join(root, "features/panel-template.js"), "utf8");
if (!autoPlaySource.includes("getDelay = () => 0") || !autoPlaySource.includes("schedule(beginMove, delay, fen, expectedGeneration)")) throw new Error("V23 configurable autoplay delay is missing");
if (!livePanelSource.includes('canAutoPlay: () => mode.cls === "bot"')) throw new Error("V23 autoplay must remain restricted to bot games");
for (const id of ["autoPlayDelay", "autoPlayDelayMin", "autoPlayDelayMax"]) if (!panelTemplateSource.includes('id="' + id + '"')) throw new Error("V23 missing delay input: " + id);
if (!panelTemplateSource.includes('data-key="autoPlayDelayMode"')) throw new Error("V23 fixed/random delay selector missing");
console.log("V23 bot-only autoplay delay checks: PASS");
const offscreenSource = fs.readFileSync(path.join(root, "offscreen.js"), "utf8");
if (!offscreenSource.includes("function validFen(fen)") || !offscreenSource.includes("MAX_MAIA_MS = 25000") || !offscreenSource.includes("moves.length <= 20")) throw new Error("V23 request safety checks missing");
if (!fs.readFileSync(path.join(root, "features/maia-worker.js"), "utf8").includes("MAX_CANDIDATES = 20")) throw new Error("V23 Maia candidate limit missing");
console.log("V23 request safety checks: PASS");
const analysisSource = fs.readFileSync(path.join(root, "analysis.js"), "utf8");
const watchCount = analysisSource.split("BMCustomization.watch(").length - 1;
if (watchCount !== 1) throw new Error("V18 regression: Analysis Board should register exactly one customization watcher; found " + watchCount);
console.log("V23 source checks: PASS");
const dashboard = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
for (const [label, check] of [
  ["Home/End tab navigation", dashboard.includes('event.key === "Home"') && dashboard.includes('event.key === "End"')],
  ["popup error recovery", dashboard.includes("Refresh the Chess.com tab, then try again.")],
  ["review loading state", dashboard.includes('setAttribute("aria-busy", "true")')]
]) if (!check) throw new Error("V23 dashboard regression: " + label);
if (fs.readFileSync(path.join(root, "dashboard.html"), "utf8").includes("auto-review")) throw new Error("Dashboard contains an inactive Automatic review toggle");

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

const positions = [
  ["starting position", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ["black to move", "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"],
  ["developed position", "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3"],
  ["promotion available", "7k/P7/8/8/8/8/8/7K w - - 0 1"],
  ["castling available", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"],
  ["en passant available", "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"],
  ["checkmate terminal position", "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", "none"],
  ["stalemate terminal position", "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "none"]
 ];
if (positions.length !== 8) throw new Error("V23 must cover eight standard and edge-case positions");

async function main() {
  await new Promise(resolve => server.listen(4178, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4178/tests/engine-smoke.html");
    const results = await page.evaluate(async positions => new Promise((resolve, reject) => {
      let worker, index = 0, stage = "uci";
      const found = [];
      const timeout = setTimeout(() => finish(new Error("Stockfish timed out")), 120000);
      function finish(error, value) {
        clearTimeout(timeout);
        if (worker) worker.terminate();
        error ? reject(error) : resolve(value);
      }
      function searchNext() {
        if (index >= positions.length) return finish(null, found);
        stage = "search";
        worker.postMessage("position fen " + positions[index][1]);
        worker.postMessage("go depth 5");
      }
      function onLine(line) {
        if (stage === "uci" && line === "uciok") {
          stage = "ready"; worker.postMessage("isready");
        } else if (stage === "ready" && line === "readyok") {
          index = 0; searchNext();
        } else if (stage === "search" && line.startsWith("bestmove ")) {
          const move = line.split(/\s+/)[1];
          const expected = positions[index][2] || "move";
          if (expected === "none" ? move !== "(none)" : !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
            return finish(new Error("Unexpected Stockfish result for " + positions[index][0] + ": " + line));
          found.push({ name: positions[index][0], move });
          index++; searchNext();
        }
      }
      worker = new Worker("/engine/stockfish.js");
      worker.onerror = event => finish(new Error(event.message || "Stockfish worker failed"));
      worker.onmessage = event => { if (typeof event.data === "string") onLine(event.data); };
      worker.postMessage("uci");
    }), positions);
    for (const item of results) console.log("Stockfish " + item.name + ": " + item.move + " PASS");

    const maiaPage = await browser.newPage();
    await maiaPage.goto("http://127.0.0.1:4178/tests/maia-smoke.html");
    const maia = await maiaPage.evaluate(() => window.maiaPromise);
    if (!maia.move || !/^([a-h][1-8]){2}[qrbn]?$/.test(maia.move) ||
        !Array.isArray(maia.moves) || !maia.moves.length ||
        !Number.isFinite(maia.moves[0].probability)) throw new Error("Maia returned an invalid prediction");
    console.log("Maia smoke: " + maia.move + " (" + (maia.moves[0].probability * 100).toFixed(1) + "%) PASS");
    await maiaPage.evaluate(() => window.maiaWorker.terminate());
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
