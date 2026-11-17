# KnightScope

**KnightScope** is a combined Chrome extension that brings post-game review and position-analysis tools together in one interface.

> **Project stage: merged prototype / active development.** The combined extension has a CI-built package. Some planned features are not implemented yet; see the status section below.

## What is included now

- **Game review** — review completed Chess.com games with move classifications, accuracy information and explanations, using the integrated What’s This Position review project.
- **Best-move analysis** — position-analysis tools based on the integrated Best Move project.
- **Stockfish** — engine analysis for candidate moves and variations.
- **Maia** — human-like move prediction using the bundled Maia rating models.
- **Unified dashboard** — switch between Game Review and Best Move from the KnightScope popup.
- **Chess.com integration** — the review and live-panel workflows are designed around Chess.com pages.
- **Existing customisation tools** — the Best Move project's board, piece and panel customisation features are retained where supported by the merged build.

The build also includes an idle-resource improvement: Stockfish is started only when analysis is requested, and the Stockfish and Maia workers can be unloaded after inactivity. Analysis still uses CPU and memory while running.

## Current status

| Area | Status |
|---|---|
| Combined KnightScope extension | Implemented |
| Unified popup dashboard | Implemented |
| Chess.com game review integration | Implemented in the merged build |
| Stockfish and Maia integration | Included |
| Lazy engine startup and idle unloading | Implemented |
| Existing Best Move customisation features | Retained from the source project |
| New AI personalisation chatbot | Planned — not implemented yet |
| New AI-driven interface customisation | Planned — not implemented yet |
| Adding or changing extension code through the chatbot | **Not allowed by design** |
| Additional selectable chess engines | Planned / under evaluation |
| Full cross-site support | Not guaranteed; Chess.com is the primary integration target |

### AI personalisation boundary

The planned AI support chatbot is intended to personalise the user's interface only: for example, themes, layout, visible panels and display preferences. It must not edit source files, add engines, change analysis logic, modify extension functionality, build releases or publish code. Code and feature changes remain a developer-controlled process outside the chatbot.

The chatbot is **not live in the current build**. It will require a separately hosted backend before it can send real AI requests. Any API credentials must remain on that backend and must never be placed in extension code.

## Install the latest packaged build

1. Download the latest `KnightScope.zip` from the [KnightScope build folder](https://github.com/newjomolemarynew-hue/extensions/tree/main/KnightScope).
2. Extract the ZIP into a folder.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.

If Chrome reports a missing manifest, select the inner folder that contains `manifest.json`, not its parent folder.

## Build from source

### Requirements

- Node.js and npm
- A compatible shell with `unzip` (or PowerShell on Windows)
- The source inputs stored in the repository:
  - `whatsthisposition-main.zip`
  - `BestMove-Hide-Show-Alt-B/`

### Build

```bash
cd KnightScope
npm install
npm run build
```

The generated unpacked extension is written to `KnightScope/dist`.

The GitHub Actions workflow builds and packages the extension. CI success confirms that the automated build/package steps completed; it does not replace testing in Chrome on different devices and websites.

## Repository layout

- `KnightScope/build.mjs` — integration and packaging build script
- `KnightScope/package.json` — build commands
- `KnightScope/assets/` — KnightScope brand assets
- `KnightScope/KnightScope.zip` — latest packaged extension
- `BestMove-Hide-Show-Alt-B/` — Best Move source project
- `whatsthisposition-main.zip` — What’s This Position source archive
- `.github/workflows/knightscope-build.yml` — automated build workflow

## Performance notes

KnightScope uses browser-based chess engines and model files. During active analysis, CPU and memory use can rise, especially on lower-powered laptops. The lazy-start and idle-unload changes reduce unnecessary background resource use; they do not make engine analysis resource-free.

## Credits and licences

KnightScope combines upstream projects rather than claiming their original work as its own. The packaged extension carries the upstream licence files where supplied. Keep those notices with redistributed builds, and review each upstream project's licence before modifying or redistributing its code or assets.

## Development policy

Feature requests and code changes are handled through the project maintainer's development workflow. The planned in-extension AI assistant is restricted to user-facing personalisation and must not act as a code editor or release manager.
