# KnightScope V22

V22 is a reliability and test-coverage update built on V21.

## Improvements
- Expanded real-browser Stockfish smoke coverage to include promotion, castling, en passant, checkmate and stalemate, in addition to the starting, black-to-move and developed positions.
- Terminal positions are explicitly checked for the expected no-legal-move response.
- Preserves V21's FEN/UCI request validation, bounded Maia requests, Maia timeout recovery, and quick-first Stockfish recommendations.
- Keeps the existing low-overhead search strategy: no extra polling loop, background engine searches, or increased default search depth.

## Install
1. Download and extract `KnightScope-v22.zip`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the extracted `KnightScope-v22` folder.

## Scope
Use analysis tools outside active rated games. The automated browser tests do not replace testing on your own Chess.com account and laptop.
