# KnightScope V19

KnightScope V19 keeps the unified game-review flow and interactive Analysis Board practice mode. Best-move recommendations run for both sides on every turn unless explicitly disabled. Stockfish 19 powers position analysis, while Maia is an optional live-game move-prediction model.

## V19 improvements\n- Dashboard redesigned with a clearer, compact hierarchy, improved spacing, contrast, responsive sizing, and smoother interactions.\n- Dashboard tabs now support keyboard navigation with Left/Right arrows and correct tab focus behavior.\n- Removed outdated V17 installation references.\n\n## Fixes and reliability
- Removed a duplicate customization watcher in the Analysis Board. Board customization updates now trigger one listener instead of rendering twice.
- Corrected the engine smoke test to validate the actual V19 manifest version (the V17 test mistakenly checked V16).

## Faster live recommendations
- Live Stockfish now returns a quick first recommendation, then refines it with the selected thinking time.
- The quick result remains visible if the deeper refinement cannot complete.
- Alt+B is registered in capture mode and ignores key-repeat events, making the panel shortcut more reliable.

## Engine strength controls
- Stockfish and Maia now use editable number inputs instead of sliders.
- Both inputs accept whole numbers from 100 to 3200.
- Maia has trained models from 1100 to 1900, so the entered value is matched to the nearest available Maia model.
- Stockfish uses its configured strength setting.

## Privacy and site access
KnightScope runs its page scripts only on `https://www.chess.com/*`. Host permissions are limited to Chess.com (`www.chess.com` and the official `api.chess.com` endpoint used for public player ratings). It does not request `activeTab` access or inject into other sites.

## Install
1. Download `KnightScope-v19.zip` and extract it.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the extracted `KnightScope-v19` folder.

The ZIP contains extension files at its root. Earlier versions remain preserved.

## Controls
- **Alt+B** — show or hide Best Move.
- **Fast / Auto / Deep** — change live Stockfish thinking time.
- **Live Analysis → Engine** — choose Stockfish 19 or Maia and enter a strength value.
- **1 / 2 / 3 variations** — select the number of live principal variations.
- **Fast / Standard / Thorough** — set Analysis Board review depth.

## Unified Analysis Board play mode
- The board shows Stockfish's best move as an arrow and in the analysis panel.
- Choose **Play Best Move** to add the engine move to a separate practice line.
- Click a piece and then a legal destination to try your own move. Promotion choices are provided.
- Undo, reset the practice line, or return to the original game review at any time. The original PGN and move history are never changed.
