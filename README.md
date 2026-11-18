# KnightScope V8

KnightScope V8 is the unified Chess.com analysis build.

## What's included
- A single Analysis Board for manual PGN analysis and finished-game review.
- The game-finished **Analysis** button and the Best Move tab's **Open analysis board** button both open `analysis.html` through the same `openAnalysis` runtime message.
- Finished-game move history is passed into the board using the game's starting FEN and UCI moves.
- Fast, Standard, and Thorough depth presets are available inside the Analysis Board (not in the game-finished popup).
- Stockfish 19 is the bundled, operational analysis engine.
- Maia, Torch, Leela Chess Zero, PlentyChess, Berserk, Reckless, Koivisto, Ethereal, Caissa, Viridithas, and Stormphrax are shown as unavailable until their actual compatible engine packages are added. They are not falsely advertised as working.
- Best Move panel is controlled with Alt+B; it should not open automatically on Chess.com load.
- Customization Studio and the existing Best Move features are retained.
- No AI chatbot or OpenAI API key is required.

## Install
1. Download the latest `KnightScope-v8.zip` from the repository or the V8 GitHub Actions artifact.
2. Extract the ZIP.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Choose **Load unpacked** and select the extracted `KnightScope-v8` folder.

The ZIP is packaged with the extension files at its root, without an extra enclosing folder.

## Controls
- **Alt+B** — toggle the Best Move panel.
- **Fast / Standard / Thorough** — choose analysis depth in the Analysis Board.
- **Arrow keys** — navigate through a reviewed game.
- **F** — flip the Analysis Board.

## Versioning
V8 is kept separate from V7 and earlier versions. This root README describes the V8 repository build.
