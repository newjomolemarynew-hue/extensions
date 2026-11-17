# KnightScope v4

Version 4.0.0 — a separate upgrade line copied from KnightScope v3.

## Preserved from v3
- Completed Chess.com game review
- Independent Stockfish analysis board
- Board and piece customization
- Existing dashboard, study shortcut, and supporting assets
- Maia model assets and existing study/review resources

## V4 changes
- Versioned as 4.0.0 in the extension manifest and popup
- Added an Engine Library page that reports actual integration status
- Added an Engine Library entry point from the extension popup
- Kept the current bundled Stockfish engine as the working engine
- Documented which requested engines are not yet integrated, rather than exposing fake selectable entries

## Engine integration status
Stockfish is bundled and used by the current analysis flow. Maia model assets exist, but a full selectable Maia analysis adapter is not yet connected. PlentyChess, Berserk, Reckless, Koivisto, Ethereal, Caissa, Lc0, Viridithas and Stormphrax are not bundled as working integrations in this version.

## Planned V4 feature work
- Genuine engine adapters and a selector (one active engine by default)
- Advanced analysis and post-game review improvements
- Opening explorer, puzzles and training tools
- FEN/PGN import and export improvements
- Board scanner / position import
- Board, piece, arrow and panel customization
- Resizable workspace layouts
- Lazy loading, caching, worker shutdown and low-resource defaults

Only use engine analysis in offline study, puzzles, or completed-game review—not to gain assistance during live games against people.
