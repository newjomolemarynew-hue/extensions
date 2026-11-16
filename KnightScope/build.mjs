import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
    throw new Error("The whatsthisposition archive does not contain the expected package.json and extension/build.mjs.");
  }

  // Build both source projects from one command. Their outputs remain separate
  // until the extension entry points and manifest are deliberately unified.
  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: upstreamRoot });
  run("npm", ["run", "ext:build"], { cwd: upstreamRoot });

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(join(upstreamRoot, "extension", "dist"), join(output, "WhatThisPosition"), { recursive: true });
  cpSync(bestMoveSource, join(output, "BestMove"), {
    recursive: true,
    filter: (source) => !source.endsWith("README.txt")
  });

  console.log("\nKnightScope build orchestration completed.");
  console.log("Output: KnightScope/dist/BestMove and KnightScope/dist/WhatThisPosition");
  console.log("Note: these are currently two build outputs, not yet one merged Chrome extension.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
