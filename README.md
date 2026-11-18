# KnightScope V9

KnightScope V9 is the next version of the unified Chess.com analysis extension. V8 remains preserved.

## What's included
- All V8 features: unified Analysis Board, finished-game review handoff, Best Move panel (Alt+B), customization, and Stockfish 19 analysis.
- The Analysis Board engine worker now accepts a per-engine worker path, providing a clean integration point for additional UCI-compatible browser engines.
- Stockfish 19 is the only standalone analysis engine currently bundled and enabled.
- Maia's existing neural-network models remain bundled for the Best Move feature's human-like move selection. Maia is **not** presented as a standalone evaluation engine in the Analysis Board.
- Torch, Leela Chess Zero, PlentyChess, Berserk, Reckless, Koivisto, Ethereal, Caissa, Viridithas, and Stormphrax remain disabled until their compatible browser workers, runtime assets, and required network files are included and verified.
- No chatbot or OpenAI API key is required.

## Engine integration status
V9 establishes the worker-path interface but does not falsely enable engines whose browser packages are absent. Additional engines will be added in later updates, with the goal of making all 12 selector options operational. Each integration must include its actual engine files, required network assets (where applicable), license/source notices, and a tested worker bridge.

## Install
1. Download `KnightScope-v9.zip` from this repository or the V9 GitHub Actions artifact.
2. Extract the ZIP.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Choose **Load unpacked** and select the extracted `KnightScope-v9` folder.

The ZIP is packaged with the extension files at its root, without an extra enclosing folder.

## Controls
- **Alt+B** — toggle the Best Move panel.
- **Fast / Standard / Thorough** — choose analysis depth in the Analysis Board.
- **Arrow keys** — navigate through a reviewed game.
- **F** — flip the Analysis Board.

## Versioning
V9 is stored separately from V8 and all earlier versions. The V8 folder and ZIP are not modified.
