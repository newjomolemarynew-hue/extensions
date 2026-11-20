# KnightScope V12

KnightScope V12 keeps the unified V11 game-review flow and adds two independently packaged, single-thread browser engines to the Analysis Board.

## Analysis Board engines
- **Stockfish 19** — existing bundled engine.
- **PlentyChess 8.0** — GPL-3.0; its NNUE network is from the GPL-3.0 PlentyNetworks project.
- **Stormphrax 8.0** — GPL-3.0-or-later; its release network is distributed with the corresponding-source package.

The two new engines use single-thread WebAssembly builds, avoiding SharedArrayBuffer/cross-origin-isolation requirements. KnightScope sets a 32 MiB hash size to keep memory use modest.

## Redistribution and source
Upstream revisions, artifact hashes, network provenance and corresponding-source archive offers are recorded in `ENGINE-LICENSES.md` and `engine/provenance/`.

- PlentyChess corresponding source: https://assets.0x88.app/plentychess/plentychess-emscripten-single-thread-corresponding-source.tar.gz
- Stormphrax corresponding source: https://assets.0x88.app/stormphrax/stormphrax-emscripten-single-thread-corresponding-source.tar.gz

## Not included
Torch and Maia are excluded as requested. Leela Chess Zero, Berserk, Reckless, Koivisto, Ethereal, Caissa and Viridithas are not enabled in this build; they need additional runtime integration or redistribution review and are not advertised as working engines.

## Privacy and site access
KnightScope runs its page scripts only on `https://www.chess.com/*`. Its host permissions are limited to Chess.com (`www.chess.com` and the official `api.chess.com` endpoint used for public player ratings). It does not request access to other tabs through `activeTab`, does not inject into Spotify, and does not contact Spotify or the former external feedback service. The live Stockfish worker now starts only when an analysis request is made; the Chess.com game watcher and live-panel heartbeat have also been slowed to reduce idle CPU work. Chess.com-hosted piece and sound assets may load from Chess.com's asset domains.

## Install
1. Download `KnightScope-v12.zip` and extract it.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the extracted folder.

The ZIP contains extension files at its root. V11 and earlier folders and packages remain preserved.

## Controls
- **Alt+B** — show or hide Best Move.
- **Fast / Auto / Deep** — change live Stockfish thinking time.
- **1 / 2 / 3 variations** — select the number of live principal variations.
- **Fast / Standard / Thorough** — set Analysis Board review depth.