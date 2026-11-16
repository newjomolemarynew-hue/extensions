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
  const contentScripts = [...(bmManifest.content_scripts || []), ...(wtpManifest.content_scripts || [])];
  const resources = [...(wtpManifest.web_accessible_resources || []), ...(bmManifest.web_accessible_resources || [])];
  const manifest = {
    manifest_version: 3, name: "KnightScope", short_name: "KnightScope", version: "1.0.0",
    description: "Chess.com game review, move analysis and best-move tools in one extension.",
    permissions, host_permissions: hostPermissions, background: { service_worker: "background.js" },
    action: { default_title: "KnightScope", default_popup: "popup.html", default_icon: wtpManifest.action?.default_icon || wtpManifest.icons },
    icons: wtpManifest.icons, content_scripts: contentScripts, web_accessible_resources: resources,
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: https://assets-themes.chess.com https://images.chesscomfiles.com; connect-src 'self' https://api.chess.com https://*.scdn.co https://*.spotifycdn.com https://best-move-style-atlas.lovable.app" },
    homepage_url: "https://github.com/newjomolemarynew-hue/extensions"
  };
  writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  cpSync(join(upstreamRoot, "LICENSE"), join(output, "LICENSE-WHATSTHISPOSITION"));
  if (existsSync(join(bestMoveSource, "LICENSE"))) cpSync(join(bestMoveSource, "LICENSE"), join(output, "LICENSE-BEST-MOVE"));
  console.log("KnightScope merged extension built in KnightScope/dist.");
} finally { rmSync(temp, { recursive: true, force: true }); }
