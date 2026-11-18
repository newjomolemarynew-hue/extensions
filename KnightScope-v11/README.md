# KnightScope V11

KnightScope V11 removes the duplicate legacy game-review overlay and sends finished games into one unified Analysis Board.

## What changed
- The old automatic “what’s-this-position” review card/iframe is disabled.
- The old Review action no longer opens a separate legacy review surface.
- The dashboard's Game Review action fetches the finished game's PGN and opens it in the unified Analysis Board.
- The end-of-game **Open Analysis Board** action continues to open that same board.
- The obsolete review iframe page, legacy review worker bridge, and old root popup files are removed from this build.
- The Analysis Board engine selector now shows only the engine that is actually installed.

## Engines
- **Stockfish 19** is the only standalone engine bundled and enabled in V11.
- Maia model files remain for human-like move selection in Best Move; Maia is not a standalone Analysis Board engine.
- Torch, Leela Chess Zero, and the other requested engines remain future integrations. They need real browser engine packages, model/network files where applicable, and tested worker bridges. They are not advertised as working.

## Install
1. Download `KnightScope-v11.zip` and extract it.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the extracted `KnightScope-v11` folder.

The ZIP contains the extension files at its root. V10 and earlier versions remain preserved.

## Controls
- **Alt+B** — show or hide Best Move.
- **Fast / Auto / Deep** — change live Stockfish thinking time.
- **1 / 2 / 3 variations** — select the number of live principal variations.
- **Fast / Standard / Thorough** — set Analysis Board review depth.
