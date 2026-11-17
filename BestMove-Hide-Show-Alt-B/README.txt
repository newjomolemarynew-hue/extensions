3.4.2
- Panel no longer flashes unstyled (giant icons/arrows) while it loads.
- Studio reworked: Chess.com piece templates (28 sets) with flames/ice/wings etc. layered on top, Draw removed, preview shows the piece
  being edited (or the board), much lighter rendering, tab icons.
- Game Review: engine profile picker (Stockfish 17 with 2/3/4 lines), Chess.com move sounds (toggle in the header), icons.
- Warning when the human-like option is off in online games: using the engine's top move can get an account banned.
- What's-new screen once per update, never during a game, with links and a hover-fill star rating.

Best Move 3.4.2  (Chrome / Edge, Manifest V3)

Install: chrome://extensions -> Developer mode -> Load unpacked -> pick this folder.

What's new in 3.4.2
- Studio: the downloaded animated skins are gone, and so is the idle/hover piece motion (the drifting, wiggling,
  drag-to-the-side effect). Nothing is fetched from the internet any more; old cached skins are cleared on update.
- Studio -> Parts: add new elements to your pieces (ice shards, frost cap, flames, halo, wings, horns, crown, crystals,
  thorn vines, glowing cracks, shoulder spikes, sparkles). Pick which pieces and which side get each part, plus colour and size.
- Studio -> Draw: draw freehand straight onto any piece type (pawn..king), optionally clipped to the piece's shape.
  Ink and parts show on the live board and in the analysis view.
- Studio -> Board: 8 animated board backgrounds (Aurora, Water light, Lava glow, Starfield, Rain, Neon grid, Fireflies,
  Holo sheen) drawn live under the pieces, plus textures (Wood, Marble, Stone, Linen, Brushed metal). All generated locally.
- Spotify mini player: cover art now sits on top with the audio visualizer directly beneath it, then title and controls.
  Cover art now loads (Spotify moved covers to spotifycdn.com): the Spotify tab converts it to a small image itself, with a
  service-worker fallback. Drag the player by the cover or the visualizer; the corner button switches compact / full.
- Human-like moves fixed and upgraded:
  * In computer (bot) games the allowed loss was 0, so the human pick could only ever equal the engine move. It now scales with the
    bot's rating.
  * Any rating works (was 1100-1900 only). Two neighbouring Maia networks are blended, so 1640 uses 60% Maia-1600 + 40% Maia-1700;
    below 1100 / above 1900 the edge network is flattened / tightened.
  * Moves are chosen by Maia's probability weighted by how sound they are; forced mates are always played; auto-play samples
    (seeded per position, so a position always gets the same move) while the suggestion arrow shows the single likeliest move.

Also in 3.4.2 (added on top)
- Review prompt: after you FINISH a game (at least 8 moves played, result shown), a small non-blocking card in the bottom-left corner asks
  for a Chrome Web Store review. It never appears during a game, waits a few seconds after the result, and disappears if you start
  another game. Appears after your first finished game; "Maybe later" snoozes a week, then a month; max 3 asks, at least a day apart; reviewing or
  "Don't ask again" ends it. Nothing is sent anywhere.
- Suggestions: toolbar popup -> Suggest (also reachable from the review card). Sends your message, name (optional), category and the
  extension version to https://best-move-style-atlas.lovable.app/api/public/v1/suggestions. No games, moves or page data.
  If the server is unreachable (e.g. not published yet) the suggestion is kept and sent automatically later.
- Suggestion drafts survive the popup closing; Studio (Settings tab) has its own Suggest button; popup shows games finished and queued suggestions.
- Popup: Assist on/off switch, Rate button, Export / Import settings (panel settings + Studio look), version line.
- New permission scope: the suggestions host above (host_permissions + connect-src only; no new browser permissions).

Fixes
- Human-like moves: the switch now shows the real state and takes manual control (turns off "Match the bot's level"), so the settings are no longer locked.
- Board colours: presets now paint all 64 squares (overrode Chess.com's no-repeat / fixed-size board image).

Tests: node test/<name>.mjs
