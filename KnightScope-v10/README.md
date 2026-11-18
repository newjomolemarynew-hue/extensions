# KnightScope V10

KnightScope V10 improves the Live Game Analysis tab while preserving V9 and all earlier versions.

## Live Game Analysis
- Live engine status panel with Stockfish 19 state, search depth, elapsed time, and available variations.
- Fast, Auto, and Deep thinking controls directly in the Analysis tab.
- One, two, or three principal variations selectable directly in the Analysis tab.
- Improved move-review progress, separate accuracy summaries, move classification counts, and a longer recent-move list.
- Unsupported engine choices are no longer presented as selectable live engines.

## Engine status
- Stockfish 19 is the only standalone live-game analysis engine currently bundled and enabled.
- Maia remains available for human-like move selection in Best Move; it is not a standalone evaluation engine.
- Torch, Leela Chess Zero, and other planned engines remain unavailable until their browser workers, runtime/network assets, and license notices are integrated and tested.
- V10 improves the use and presentation of the existing Stockfish engine; it does not claim additional engines have been bundled.

## Install
1. Download KnightScope-v10.zip and extract it.
2. Open chrome://extensions, enable Developer mode, choose Load unpacked, and select the extracted KnightScope-v10 folder.

The ZIP contains extension files at its root. V9 and earlier versions remain preserved.

## Controls
- Alt+B toggles the Best Move panel.
- Fast / Auto / Deep control live Stockfish thinking time.
- 1 / 2 / 3 variations select principal variations.
- Fast / Standard / Thorough select Analysis Board depth.
