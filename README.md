# KnightScope V8

KnightScope V8 is the unified Chess.com analysis build.

## What's new in V8
- One analysis board is used for game review, end-game analysis, and Best Move analysis.
- Best Move is hidden when Chess.com first loads and opens/closes with Alt+B.
- Latest Chess.com games are available in the unified analysis window, defaulting to RhonSubhash.
- Fast, Standard, and Thorough review depths are retained.
- The engine selector lists Stockfish 19, Maia, Torch, Leela Chess Zero, PlentyChess, Berserk, Reckless, Koivisto, Ethereal, Caissa, Viridithas, and Stormphrax.
- Stockfish 19 remains the bundled, fully operational post-game engine in this repository build; other listed engines are not presented as bundled until their browser-compatible engine packages are added.
- The V7 knight toolbar icon is retained.
- Customization Studio remains available.
- The AI chatbot/OpenAI API feature is removed from V8.

## Install
1. Download and extract KnightScope-v8.zip.
2. Open chrome://extensions.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select the extracted KnightScope-v8 folder directly.

There is no unnecessary outer folder.

## Controls
- Alt+B — toggle Best Move.
- Alt+S — toggle Best Move engine activity.
- Alt+M — collapse/expand the Best Move panel.
- Alt+A — hold for the panel's peek behavior.
- F — flip the analysis board.
- Arrow keys — move through a reviewed game.

## Versioning
V8 is kept separate from V7 and earlier builds. The root README describes the current V8 repository state.