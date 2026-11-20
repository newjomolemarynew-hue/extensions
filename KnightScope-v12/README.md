# KnightScope V12

KnightScope V12 keeps the unified game-review flow and uses **Stockfish 19 as the Analysis Board engine, with Maia available as an optional live-game move-prediction model**.

## Smaller package
- Removed the PlentyChess and Stormphrax engine integrations and their large neural-network data files.
- The Analysis Board uses Stockfish 19 only.
- The Live Analysis tab lets you switch between Stockfish 19 move suggestions and Maia move predictions, with separate strength/level controls. Stockfish remains the position-evaluation and move-review engine when Maia is selected.
- The unified Analysis Board includes a visible evaluation bar beside the board, showing White's advantage and the current score.
- Existing Chess.com tools, Best Move, game review, board customization, and the separate human-like move feature remain.
- Stockfish is started only when analysis is requested.

## Privacy and site access
KnightScope runs its page scripts only on `https://www.chess.com/*`. Its host permissions are limited to Chess.com (`www.chess.com` and the official `api.chess.com` endpoint used for public player ratings). It does not request access to other tabs through `activeTab`, does not inject into Spotify, and does not contact Spotify or the former external feedback service.

## Install
1. Download `KnightScope-v12.zip` and extract it.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the extracted folder.

The ZIP contains extension files at its root. V11 and earlier versions remain preserved.

## Controls
- **Alt+B** — show or hide Best Move.
- **Fast / Auto / Deep** — change live Stockfish thinking time.
- **Live Analysis → Engine** — choose Stockfish 19 or Maia; adjust Stockfish strength and Maia level there.
- **1 / 2 / 3 variations** — select the number of live principal variations.
- **Fast / Standard / Thorough** — set Analysis Board review depth.
