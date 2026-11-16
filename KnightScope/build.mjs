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

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function extractZip(zip, destination) {
  if (process.platform === "win32") {
    run("powershell.exe", ["-NoProfile", "-Command", "Expand-Archive", "-LiteralPath", zip, "-DestinationPath", destination, "-Force"]);
  } else {
    run("unzip", ["-q", zip, "-d", destination]);
  }
}

function copyBestMoveFiles(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "README.txt" || entry.name === "manifest.json" || entry.name === "background.js" || entry.name === "engine") continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) cpSync(from, to, { recursive: true });
    else cpSync(from, to);
  }
}

if (!existsSync(sourceZip)) throw new Error("Missing whatsthisposition-main.zip in the repository root.");
if (!existsSync(bestMoveSource)) throw new Error("Missing BestMove-Hide-Show-Alt-B in the repository root.");

const temp = mkdtempSync(join(tmpdir(), "knightscope-build-"));
try {
  const extracted = join(temp, "whatsthisposition");
  mkdirSync(extracted, { recursive: true });
  extractZip(sourceZip, extracted);

  const candidates = readdirSync(extracted, { withFileTypes: true });
  const upstreamRoot = candidates.some((entry) => entry.isFile() && entry.name === "package.json")
    ? extracted
    : join(extracted, candidates.find((entry) => entry.isDirectory())?.name ?? "");

  if (!existsSync(join(upstreamRoot, "package.json")) || !existsSync(join(upstreamRoot, "extension", "build.mjs"))) {
    throw new Error("The whatsthisposition archive does not contain package.json and extension/build.mjs.");
  }

  // Build system 1: whatsthisposition's own TypeScript/esbuild pipeline.
  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: upstreamRoot });
  run("npm", ["run", "ext:build"], { cwd: upstreamRoot });
  const wtpDist = join(upstreamRoot, "extension", "dist");
  const wtpManifest = JSON.parse(readFileSync(join(wtpDist, "manifest.json"), "utf8"));

  // Build system 2: Best Move is a static MV3 extension; stage its original files.
  const bestMoveStage = join(temp, "bestmove");
  copyBestMoveFiles(bestMoveSource, bestMoveStage);

  // The final package is a single extension. WTP keeps its engine/ directory;
  // Best Move's Stockfish files are moved to bm-engine/ to avoid filename clashes.
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(wtpDist, output, { recursive: true });
  cpSync(join(bestMoveSource, "engine"), join(output, "bm-engine"), { recursive: true });
  cpSync(bestMoveStage, output, { recursive: true });

  // Point Best Move's offscreen worker at its namespaced engine.
  const offscreenJs = join(output, "offscreen.js");
  let offscreenSource = readFileSync(offscreenJs, "utf8");
  offscreenSource = offscreenSource.replaceAll('"engine/stockfish.js"', '"bm-engine/stockfish.js"');
  writeFileSync(offscreenJs, offscreenSource);

  // A single service worker runs both background implementations. WTP's bundled
  // background is an esbuild IIFE; Best Move's original worker is appended as a
  // separate script body, preserving its message handlers and offscreen logic.
  const wtpBackground = readFileSync(join(wtpDist, "background.js"), "utf8");
  const bestMoveBackground = readFileSync(join(bestMoveSource, "background.js"), "utf8");
  writeFileSync(join(output, "background.js"), wtpBackground + "\n;\n" + bestMoveBackground + "\n");

  const bestMoveManifest = JSON.parse(readFileSync(join(bestMoveSource, "manifest.json"), "utf8"));
  const permissions = [...new Set([...(wtpManifest.permissions || []), ...(bestMoveManifest.permissions || [])])];
  const hostPermissions = [...new Set([...(wtpManifest.host_permissions || []), ...(bestMoveManifest.host_permissions || [])])];
  const contentScripts = [...(bestMoveManifest.content_scripts || []), ...(wtpManifest.content_scripts || [])];
  const webResources = [...(wtpManifest.web_accessible_resources || [])];
  for (const resource of bestMoveManifest.web_accessible_resources || []) {
    webResources.push(resource);
  }

  // Keep WTP's popup as the toolbar entry point. Best Move's on-page controls
  // remain injected; its background handlers continue running in the same worker.
  const csp = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: https://assets-themes.chess.com https://images.chesscomfiles.com; connect-src 'self' https://api.chess.com https://*.scdn.co https://*.spotifycdn.com https://best-move-style-atlas.lovable.app";
  const manifest = {
    manifest_version: 3,
    name: "KnightScope",
    short_name: "KnightScope",
    version: "1.0.0",
    description: "Chess.com analysis, game review and best-move tools in one extension.",
    permissions,
    host_permissions: hostPermissions,
    background: { service_worker: "background.js" },
    action: {
      default_title: "KnightScope",
      default_popup: "popup.html",
      default_icon: wtpManifest.action?.default_icon || wtpManifest.icons
    },
    icons: wtpManifest.icons,
    content_scripts: contentScripts,
    web_accessible_resources: webResources,
    content_security_policy: { extension_pages: csp },
    homepage_url: "https://github.com/newjomolemarynew-hue/extensions"
  };
  writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Carry both licenses/attributions into the combined package.
  cpSync(join(upstreamRoot, "LICENSE"), join(output, "LICENSE-WHATSTHISPOSITION"));
  const bmLicense = join(bestMoveSource, "LICENSE");
  if (existsSync(bmLicense)) cpSync(bmLicense, join(output, "LICENSE-BEST-MOVE"));

  console.log("\nKnightScope merged extension built in KnightScope/dist.");
  console.log("Load this single dist folder in chrome://extensions.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
