const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.env.KNIGHTSCOPE_ROOT || "KnightScope-v16");
const mime = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".css": "text/css" };
if (!fs.existsSync(path.join(root, "manifest.json"))) throw new Error("KnightScope test root not found: " + root);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.version !== "16.0.0") throw new Error("Smoke tests must run against V16; loaded " + manifest.version);
const livePanel = fs.readFileSync(path.join(root, "features/live-panel.js"), "utf8");
for (const [label, check] of [
  ["Alt+B capture registration", livePanel.includes('on(window, "keydown", toggleBestMove, true);')],
  ["Alt+B key-repeat guard", livePanel.includes("if (e.repeat || !e.altKey")],
  ["quick-first search", livePanel.includes("run(mp, false, b.quick, false)")],
  ["deep refinement", livePanel.includes("run(mp, false, b.deep, true)")],
  ["both-side recommendations", livePanel.includes("analyze(st.fen);") && !livePanel.includes("myTurnOnly: true")]
]) if (!check) throw new Error("V16 source regression: " + label);
console.log("V16 source checks: PASS");

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
  ["developed position", "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3"]
];

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
          if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move || "")) return finish(new Error("Invalid Stockfish move for " + positions[index][0] + ": " + line));
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
