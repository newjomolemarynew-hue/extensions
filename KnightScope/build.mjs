import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const sourceZip = join(repo, "whatsthisposition-main.zip");
const bestMoveSource = join(repo, "BestMove-Hide-Show-Alt-B");
const output = join(here, "dist");
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: "inherit", ...options });

function extractZip(zip, destination) {
  if (process.platform === "win32") run("powershell.exe", ["-NoProfile", "-Command", "Expand-Archive", "-LiteralPath", zip, "-DestinationPath", destination, "-Force"]);
  else run("unzip", ["-q", zip, "-d", destination]);
}
function copyBestMoveFiles(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (["README.txt", "manifest.json", "background.js", "engine"].includes(entry.name)) continue;
    if (entry.name === "content.js") { cpSync(join(source, entry.name), join(destination, "bm-content.js")); continue; }
    const from = join(source, entry.name), to = join(destination, entry.name);
    if (entry.isDirectory()) cpSync(from, to, { recursive: true });
    else cpSync(from, to);
  }
}
function replaceOnce(file, before, after, label) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(before)) throw new Error("Could not apply compatibility patch: " + label);
  writeFileSync(file, text.replace(before, after));
}

if (!existsSync(sourceZip) || !existsSync(bestMoveSource)) throw new Error("A source project is missing from the repository root.");
const temp = mkdtempSync(join(tmpdir(), "knightscope-build-"));
try {
  const extracted = join(temp, "wtp");
  mkdirSync(extracted, { recursive: true });
  extractZip(sourceZip, extracted);
  const roots = readdirSync(extracted, { withFileTypes: true });
  const upstreamRoot = roots.some((x) => x.isFile() && x.name === "package.json")
    ? extracted : join(extracted, roots.find((x) => x.isDirectory())?.name ?? "");
  if (!existsSync(join(upstreamRoot, "package.json")) || !existsSync(join(upstreamRoot, "extension", "build.mjs"))) throw new Error("Invalid whatsthisposition source archive.");

  // Keep the upstream build pipeline, but tune it for a dual-core / 8 GB laptop.
  replaceOnce(join(upstreamRoot, "src/lib/engine/pool.ts"),
    "return Math.max(1, Math.min(cap, cores - 1));",
    "return Math.max(1, Math.min(2, cap, cores - 1));", "two-worker cap");
  replaceOnce(join(upstreamRoot, "src/lib/review/depths.ts"),
    "export const DEFAULT_REVIEW_DEPTH = 1;",
    "export const DEFAULT_REVIEW_DEPTH = 0;", "Quick Review default");

  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: upstreamRoot });
  run("npm", ["run", "ext:build"], { cwd: upstreamRoot });
  const wtpDist = join(upstreamRoot, "extension/dist");
  const wtpManifest = JSON.parse(readFileSync(join(wtpDist, "manifest.json"), "utf8"));

  const bestMoveStage = join(temp, "bestmove");
  copyBestMoveFiles(bestMoveSource, bestMoveStage);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(wtpDist, output, { recursive: true });
  cpSync(join(bestMoveSource, "engine"), join(output, "bm-engine"), { recursive: true });
  cpSync(bestMoveStage, output, { recursive: true });

  // Both systems share Chrome's single offscreen-document slot. Run both engine
  // listeners in one page, and keep Best Move's Stockfish in its own directory.
  const engineHtml = join(output, "engine.html");
  let enginePage = readFileSync(engineHtml, "utf8");
  enginePage = enginePage.replace("</body>", '  <script src="offscreen.js"></script>\n</body>');
  writeFileSync(engineHtml, enginePage);
  const bmOffscreen = join(output, "offscreen.js");
  replaceOnce(bmOffscreen, 'new Worker("engine/stockfish.js")', 'new Worker("bm-engine/stockfish.js")', "Best Move engine path");
  const bmBackground = readFileSync(join(bestMoveSource, "background.js"), "utf8")
    .replaceAll('"offscreen.html"', '"engine.html"');

  const wtpBackground = readFileSync(join(wtpDist, "background.js"), "utf8");
  writeFileSync(join(output, "background.js"), wtpBackground + "\n;\n" + bmBackground + "\n");

  const bmManifest = JSON.parse(readFileSync(join(bestMoveSource, "manifest.json"), "utf8"));
  const permissions = [...new Set([...(wtpManifest.permissions || []), ...(bmManifest.permissions || [])])];
  const hostPermissions = [...new Set([...(wtpManifest.host_permissions || []), ...(bmManifest.host_permissions || [])])];
  const bmContentScripts = (bmManifest.content_scripts || []).map((entry) => ({ ...entry, js: (entry.js || []).map((file) => file === "content.js" ? "bm-content.js" : file) }));
  const contentScripts = [...bmContentScripts, ...(wtpManifest.content_scripts || [])];
  const resources = [...(wtpManifest.web_accessible_resources || []), ...(bmManifest.web_accessible_resources || [])];
  const manifest = {
    manifest_version: 3, name: "KnightScope", short_name: "KnightScope", version: "1.0.0",
    description: "Chess.com game review, move analysis and best-move tools in one extension.",
    permissions, host_permissions: hostPermissions, background: { service_worker: "background.js" },
    action: { default_title: "KnightScope", default_popup: "dashboard.html", default_icon: wtpManifest.action?.default_icon || wtpManifest.icons },
    icons: wtpManifest.icons, content_scripts: contentScripts, web_accessible_resources: resources,
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: https://assets-themes.chess.com https://images.chesscomfiles.com; connect-src 'self' https://api.chess.com https://*.scdn.co https://*.spotifycdn.com https://best-move-style-atlas.lovable.app" },
    homepage_url: "https://github.com/newjomolemarynew-hue/extensions"
  };
  writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // KnightScope unified dashboard: one toolbar popup for both original tools.
  writeFileSync(join(output, "dashboard.html"), "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>KnightScope</title>\n  <link rel=\"stylesheet\" href=\"dashboard.css\">\n</head>\n<body>\n  <main class=\"app\">\n    <header class=\"top\">\n      <div class=\"brand\">\n        <span class=\"mark\" aria-hidden=\"true\">♞</span>\n        <span>KnightScope</span>\n      </div>\n      <span class=\"version\">1.0</span>\n    </header>\n\n    <nav class=\"tabs\" aria-label=\"KnightScope tools\">\n      <button class=\"tab active\" data-view=\"review\" aria-selected=\"true\">Game review</button>\n      <button class=\"tab\" data-view=\"analysis\" aria-selected=\"false\">Best move</button>\n    </nav>\n\n    <section class=\"view active\" id=\"review-view\">\n      <div class=\"intro\">\n        <span class=\"eyebrow\">AFTER THE GAME</span>\n        <h1>Review your game</h1>\n        <p>See move classifications, accuracy, mistakes and explanations.</p>\n      </div>\n      <div class=\"game-card\">\n        <div class=\"game-icon\">↗</div>\n        <div class=\"game-copy\">\n          <strong id=\"game-title\">Checking this Chess.com tab…</strong>\n          <span id=\"game-subtitle\">Open a completed game to get started.</span>\n        </div>\n        <span class=\"live-dot\" id=\"game-dot\"></span>\n      </div>\n      <button class=\"primary\" id=\"review-btn\" disabled>Review this game <span>→</span></button>\n      <label class=\"toggle-row\">\n        <span class=\"toggle-copy\"><strong>Automatic review</strong><small>Open the review when a game ends</small></span>\n        <input type=\"checkbox\" id=\"auto-review\">\n        <span class=\"switch\"></span>\n      </label>\n      <p class=\"hint\" id=\"review-status\" role=\"status\">Looking for a Chess.com game…</p>\n    </section>\n\n    <section class=\"view\" id=\"analysis-view\" hidden>\n      <div class=\"intro\">\n        <span class=\"eyebrow\">DURING OR AFTER A GAME</span>\n        <h1>Best move analysis</h1>\n        <p>Use the Stockfish and Maia tools from Best Move to explore positions and candidate moves.</p>\n      </div>\n      <div class=\"feature-list\">\n        <div class=\"feature\"><span class=\"feature-icon\">⌖</span><div><strong>Live position tools</strong><small>Best-move suggestions and alternative lines on Chess.com.</small></div></div>\n        <div class=\"feature\"><span class=\"feature-icon\">♟</span><div><strong>Position analysis</strong><small>Open the full analysis board, load a game or paste a PGN.</small></div></div>\n        <div class=\"feature\"><span class=\"feature-icon\">⚙</span><div><strong>Customisation</strong><small>Keep your existing board, piece and panel settings.</small></div></div>\n      </div>\n      <button class=\"primary\" id=\"analysis-btn\">Open analysis board <span>→</span></button>\n      <button class=\"secondary-btn\" id=\"panel-btn\">Show Best Move panel on this tab</button>\n      <p class=\"hint\" id=\"analysis-status\" role=\"status\">The live panel appears on Chess.com pages.</p>\n    </section>\n\n    <footer>\n      <span class=\"footer-mark\">♞</span>\n      <span>One toolkit. Two ways to analyse.</span>\n      <a href=\"https://github.com/newjomolemarynew-hue/extensions\" target=\"_blank\" rel=\"noopener\">GitHub ↗</a>\n    </footer>\n  </main>\n  <script src=\"dashboard.js\"></script>\n</body>\n</html>" + "\n");
  writeFileSync(join(output, "dashboard.css"), ":root {\n  color-scheme: dark;\n  --bg: #0b1020;\n  --surface: #111a2d;\n  --surface-2: #17233a;\n  --line: #253653;\n  --text: #edf3ff;\n  --muted: #91a2bd;\n  --blue: #4b8dff;\n  --blue-2: #78adff;\n}\n* { box-sizing: border-box; }\nhtml, body { margin: 0; width: 390px; min-height: 500px; background: var(--bg); color: var(--text); font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif; }\nbutton, input { font: inherit; }\n.app { padding: 18px; display: flex; flex-direction: column; gap: 18px; }\n.top { display:flex; align-items:center; justify-content:space-between; }\n.brand { display:flex; align-items:center; gap:10px; font-size:18px; font-weight:800; letter-spacing:-.04em; }\n.mark { display:grid; place-items:center; width:34px; height:34px; border-radius:11px; color:#fff; background:linear-gradient(145deg,#5da0ff,#2863d5); font-size:24px; line-height:1; box-shadow:0 5px 18px #2863d544; }\n.version { color:var(--muted); font-size:11px; border:1px solid var(--line); border-radius:99px; padding:4px 8px; }\n.tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; border:1px solid var(--line); background:#0e1728; border-radius:12px; }\n.tab { border:0; border-radius:9px; background:transparent; color:var(--muted); padding:9px; font-weight:650; cursor:pointer; }\n.tab.active { color:var(--text); background:var(--surface-2); box-shadow:inset 0 0 0 1px #344c70; }\n.view { display:flex; flex-direction:column; gap:14px; }\n.view[hidden] { display:none; }\n.intro { padding:2px 1px 0; }\n.eyebrow { color:var(--blue-2); font-size:10px; font-weight:800; letter-spacing:.13em; }\nh1 { margin:6px 0 4px; font-size:23px; letter-spacing:-.045em; line-height:1.2; }\n.intro p { margin:0; color:var(--muted); font-size:12px; line-height:1.55; }\n.game-card { display:flex; align-items:center; gap:11px; min-height:70px; padding:13px; border:1px solid var(--line); background:linear-gradient(135deg,#14223a,#10192b); border-radius:13px; }\n.game-icon { width:36px; height:36px; display:grid; place-items:center; flex:none; border-radius:10px; background:#244577; color:#9bc3ff; font-size:21px; }\n.game-copy { display:grid; min-width:0; gap:2px; flex:1; }\n.game-copy strong { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.game-copy span { color:var(--muted); font-size:11px; }\n.live-dot { width:7px; height:7px; border-radius:50%; background:#e1a84a; box-shadow:0 0 0 4px #e1a84a18; }\n.live-dot.ready { background:#42d69b; box-shadow:0 0 0 4px #42d69b18; }\n.primary { display:flex; align-items:center; justify-content:center; gap:12px; width:100%; padding:12px 15px; border:0; border-radius:11px; background:linear-gradient(100deg,#4d91ff,#3476e8); color:white; font-weight:750; cursor:pointer; box-shadow:0 7px 20px #3476e833; }\n.primary span { font-size:17px; line-height:1; }\n.primary:hover:not(:disabled) { filter:brightness(1.08); }\n.primary:disabled { opacity:.45; cursor:not-allowed; box-shadow:none; }\n.toggle-row { display:flex; align-items:center; gap:12px; padding:12px 13px; border:1px solid var(--line); border-radius:12px; background:var(--surface); cursor:pointer; }\n.toggle-copy { display:grid; flex:1; gap:2px; }\n.toggle-copy strong { font-size:12px; }\n.toggle-copy small { color:var(--muted); font-size:11px; }\n.toggle-row input { position:absolute; opacity:0; pointer-events:none; }\n.switch { width:35px; height:20px; border-radius:99px; background:#35445d; position:relative; transition:background .15s; }\n.switch::after { content:\"\"; position:absolute; width:14px; height:14px; top:3px; left:3px; border-radius:50%; background:#fff; transition:transform .15s; }\n.toggle-row input:checked + .switch { background:var(--blue); }\n.toggle-row input:checked + .switch::after { transform:translateX(15px); }\n.hint { min-height:16px; margin:0; color:var(--muted); font-size:11px; text-align:center; }\n.feature-list { display:grid; gap:8px; }\n.feature { display:flex; align-items:flex-start; gap:11px; padding:12px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }\n.feature-icon { width:30px; height:30px; flex:none; display:grid; place-items:center; border-radius:9px; background:#1b3154; color:#8dbaff; font-size:17px; }\n.feature div { display:grid; gap:3px; }\n.feature strong { font-size:12px; }\n.feature small { color:var(--muted); font-size:11px; line-height:1.45; }\n.secondary-btn { padding:10px; border:1px solid var(--line); border-radius:10px; color:var(--text); background:var(--surface); font-size:12px; font-weight:650; cursor:pointer; }\n.secondary-btn:hover { border-color:#4a6d9e; background:var(--surface-2); }\nfooter { display:flex; align-items:center; gap:7px; border-top:1px solid #1d2a40; padding-top:13px; color:var(--muted); font-size:10px; }\n.footer-mark { color:var(--blue-2); font-size:16px; }\nfooter a { margin-left:auto; color:var(--blue-2); text-decoration:none; }\nbutton:focus-visible, a:focus-visible, input:focus-visible + .switch { outline:2px solid var(--blue-2); outline-offset:3px; }\n@media (prefers-reduced-motion: reduce) { * { transition:none !important; } }" + "\n");
  writeFileSync(join(output, "dashboard.js"), "\"use strict\";\n(() => {\n  const $ = (id) => document.getElementById(id);\n  const tabs = [...document.querySelectorAll(\".tab\")];\n  const views = { review: $(\"review-view\"), analysis: $(\"analysis-view\") };\n  const status = (id, message) => { $(id).textContent = message; };\n\n  tabs.forEach((tab) => tab.addEventListener(\"click\", () => {\n    const name = tab.dataset.view;\n    tabs.forEach((item) => {\n      const active = item === tab;\n      item.classList.toggle(\"active\", active);\n      item.setAttribute(\"aria-selected\", String(active));\n    });\n    Object.entries(views).forEach(([key, view]) => {\n      view.hidden = key !== name;\n      view.classList.toggle(\"active\", key === name);\n    });\n  }));\n\n  async function activeTab() {\n    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n    return tab;\n  }\n  async function sendToChessTab(type) {\n    const tab = await activeTab();\n    if (!tab?.id || !/^https:\\/\\/www\\.chess\\.com\\//.test(tab.url || \"\")) {\n      return { ok: false, message: \"Open a Chess.com game first, then try again.\" };\n    }\n    try {\n      return await chrome.tabs.sendMessage(tab.id, { type });\n    } catch {\n      try {\n        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [\"content.js\"] });\n        return await chrome.tabs.sendMessage(tab.id, { type });\n      } catch {\n        return { ok: false, message: \"Refresh the Chess.com tab and try again.\" };\n      }\n    }\n  }\n\n  const auto = $(\"auto-review\");\n  chrome.storage.local.get({ auto: true }).then((data) => { auto.checked = data.auto !== false; });\n  auto.addEventListener(\"change\", () => chrome.storage.local.set({ auto: auto.checked }));\n\n  async function checkGame() {\n    const tab = await activeTab();\n    if (!tab?.id || !/^https:\\/\\/www\\.chess\\.com\\//.test(tab.url || \"\")) {\n      $(\"game-title\").textContent = \"No Chess.com game detected\";\n      $(\"game-subtitle\").textContent = \"Open a completed game to review it.\";\n      $(\"game-dot\").classList.remove(\"ready\");\n      $(\"review-btn\").disabled = true;\n      status(\"review-status\", \"Navigate to Chess.com to begin.\");\n      return;\n    }\n    const result = await sendToChessTab(\"wtp:find\");\n    if (result?.ok) {\n      $(\"game-title\").textContent = result.game.white + \" vs \" + result.game.black;\n      $(\"game-subtitle\").textContent = result.game.message || result.game.result || \"Game found and ready to review.\";\n      $(\"game-dot\").classList.add(\"ready\");\n      $(\"review-btn\").disabled = false;\n      status(\"review-status\", \"Ready when you are.\");\n    } else {\n      $(\"game-title\").textContent = \"Chess.com tab detected\";\n      $(\"game-subtitle\").textContent = \"Open a finished game to start a review.\";\n      $(\"game-dot\").classList.remove(\"ready\");\n      $(\"review-btn\").disabled = true;\n      status(\"review-status\", result?.message || \"No finished game found on this page.\");\n    }\n  }\n\n  $(\"review-btn\").addEventListener(\"click\", async () => {\n    const button = $(\"review-btn\");\n    button.disabled = true;\n    button.firstChild.textContent = \"Opening review \";\n    const result = await sendToChessTab(\"wtp:open\");\n    if (result?.ok) window.close();\n    else {\n      status(\"review-status\", result?.message || \"Could not open the review.\");\n      button.disabled = false;\n      button.firstChild.textContent = \"Review this game \";\n    }\n  });\n\n  $(\"analysis-btn\").addEventListener(\"click\", () => {\n    chrome.runtime.sendMessage({ type: \"openAnalysis\" }, (response) => {\n      if (chrome.runtime.lastError || response?.error) {\n        status(\"analysis-status\", response?.error || \"Could not open the analysis board.\");\n      } else window.close();\n    });\n  });\n\n  $(\"panel-btn\").addEventListener(\"click\", async () => {\n    const tab = await activeTab();\n    if (!tab?.id || !/^https:\\/\\/www\\.chess\\.com\\//.test(tab.url || \"\")) {\n      status(\"analysis-status\", \"Open Chess.com first to show the live panel.\");\n      return;\n    }\n    chrome.runtime.sendMessage({ type: \"showPanel\", tabId: tab.id }, (response) => {\n      if (chrome.runtime.lastError || response?.error) {\n        status(\"analysis-status\", response?.error || \"Could not show the Best Move panel.\");\n      } else {\n        status(\"analysis-status\", \"Best Move panel opened on your Chess.com tab.\");\n        window.close();\n      }\n    });\n  });\n\n  checkGame().catch(() => status(\"review-status\", \"Could not check this tab.\"));\n})();" + "\n");

  // Rebrand the review card and align its colours with the KnightScope dashboard.
  const panelJsPath = join(output, "panel.js");
  let panelJs = readFileSync(panelJsPath, "utf8");
  const oldPanelBrand = 'what\\u2019sthis<b>position</b>';
  if (!panelJs.includes(oldPanelBrand)) throw new Error("Could not find review panel brand text.");
  panelJs = panelJs.replace(oldPanelBrand, "KnightScope");
  writeFileSync(panelJsPath, panelJs);
  const panelCssPath = join(output, "panel.css");
  let panelCss = readFileSync(panelCssPath, "utf8");
  panelCss = panelCss.replaceAll("#ff7629", "#4b8dff").replaceAll("rgb(255 118 41 / 0.12)", "rgb(75 141 255 / 0.14)");
  panelCss += "\n/* KnightScope identity */\n.head > svg { display: none; }\n.head::before { content: '♞'; color: #78adff; font-size: 25px; line-height: 1; }\n";
  writeFileSync(panelCssPath, panelCss);

  cpSync(join(upstreamRoot, "LICENSE"), join(output, "LICENSE-WHATSTHISPOSITION"));
  if (existsSync(join(bestMoveSource, "LICENSE"))) cpSync(join(bestMoveSource, "LICENSE"), join(output, "LICENSE-BEST-MOVE"));
  console.log("KnightScope merged extension built in KnightScope/dist.");
} finally { rmSync(temp, { recursive: true, force: true }); }
