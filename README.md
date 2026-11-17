# KnightScope v2

KnightScope is being rebuilt as a standalone Chrome extension. It does not require `BestMove-Hide-Show-Alt-B` or `whatsthisposition-main.zip` as source archives or build inputs.

## What's in v2
- Manifest V3 Chrome extension.
- Original KnightScope toolbar icon in 16, 32, 48 and 128 pixel sizes.
- Compact popup with Chess.com tab detection.
- Lightweight on-page panel that counts and lists pieces detected in a rendered Chess.com board.
- No engine starts in the background; no remote code is loaded.

## Install for testing
1. Download and extract `KnightScope-v2.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted `knightscope-v2` folder.
5. Open or refresh a Chess.com game, click the KnightScope toolbar icon, then choose **Open analysis panel**.

## Current limitations
This is the standalone v2 foundation, not yet a full chess-engine release. The panel currently detects rendered board pieces; it does not calculate legal moves, engine evaluations, game reviews, or Maia-style predictions. Those features must be implemented and tested as native KnightScope modules before they are advertised as available.

## Project structure
- `manifest.json` — extension configuration and custom toolbar icon declaration.
- `popup.html`, `popup.css`, `popup.js` — popup interface.
- `content.js` — Chess.com board snapshot panel.
- `background.js` — minimal service worker.
- `icons/` — original KnightScope icons.

## Versioning
The next build should be named `KnightScope-v3.zip`, followed by `KnightScope-v4.zip`, and so on. A version should only be marked as the latest release after it has been built and tested.
